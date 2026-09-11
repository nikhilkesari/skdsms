/**
 * Sked SMS — Schedule Orchestrator & Lifecycle Manager
 * Target: src/services/scheduler/ScheduleManager.ts
 *
 * Orchestrates the complete schedule lifecycle:
 * - Schedule creation with multi-attribute validation and atomic persistence.
 * - Exact system alarm scheduling via AlarmScheduler (Native or Mock).
 * - Schedule updates and rescheduling (disarming previous alarm before arming updated alarm).
 * - Schedule cancellation and deletion (disarming pending alarms and updating persistence).
 * - Recurrence advances: when a recurring schedule completes, advances scheduledAt
 *   to next 24-hour cycle via calculateNextOccurrence and re-arms alarm.
 * - Alarm synchronization and boot restoration for pending schedules.
 * - Due schedule execution and SMS dispatch orchestration.
 */

import type {
  ScheduledMessage,
  CreateScheduleInput,
  UpdateScheduleInput,
  RecurrenceRule,
  Recipient,
  ScheduleStatus,
} from '../../types/schedule';
import type { ScheduleRepository } from '../../repositories/ScheduleRepository';
import { AsyncStorageScheduleRepository } from '../../repositories/AsyncStorageScheduleRepository';
import type {
  AlarmScheduler,
  ScheduleAlarmParams,
  AlarmScheduleResult,
  SmsDispatcher,
  SendSmsParams,
  SmsDispatchResult,
} from '../sms/types';
import { getSmsDispatcher } from '../sms';
import {
  validateScheduleInput,
  validateScheduledTime,
  validatePhoneNumber,
  validateMessageText,
  normalizePhoneNumber,
} from '../../utils/validation';
import { calculateNextRun, type NextRunResult } from './recurrence';

/**
 * Advances a scheduled timestamp to the next 24-hour cycle based on recurrence rule.
 * Direct alias and wrapper around the recurrence calculation engine.
 */
export function calculateNextOccurrence(
  currentScheduledAt: string | Date,
  rule: RecurrenceRule
): NextRunResult {
  const dateStr =
    typeof currentScheduledAt === 'string'
      ? currentScheduledAt
      : currentScheduledAt.toISOString();
  return calculateNextRun(dateStr, rule);
}

export interface CreateScheduleParams {
  recipientName?: string;
  phoneNumber?: string;
  recipient?: Recipient;
  messageText: string;
  scheduledAt: string | Date;
  recurrence?: RecurrenceRule;
}

export interface UpdateScheduleParams {
  recipientName?: string;
  phoneNumber?: string;
  recipient?: Recipient;
  messageText?: string;
  scheduledAt?: string | Date;
  recurrence?: RecurrenceRule;
  status?: ScheduleStatus;
}

export interface ScheduleManagerOptions {
  repository?: ScheduleRepository;
  alarmScheduler?: AlarmScheduler;
  smsDispatcher?: SmsDispatcher;
  getCurrentTime?: () => Date;
  leadBufferMs?: number;
}

export interface ScheduleExecutionResult {
  schedule: ScheduledMessage;
  dispatchResult: SmsDispatchResult;
}

export interface BootRestoreResult {
  rearmedCount: number;
  expiredCount: number;
}

export class ScheduleManager {
  private readonly repository: ScheduleRepository;
  private readonly alarmScheduler: AlarmScheduler;
  private readonly smsDispatcher: SmsDispatcher;
  private readonly getCurrentTime: () => Date;
  private readonly leadBufferMs: number;

  constructor(options?: ScheduleManagerOptions) {
    this.repository = options?.repository ?? new AsyncStorageScheduleRepository();
    const dispatcher = options?.smsDispatcher ?? getSmsDispatcher();
    this.smsDispatcher = dispatcher;
    this.alarmScheduler =
      options?.alarmScheduler ?? (dispatcher as unknown as AlarmScheduler);
    this.getCurrentTime = options?.getCurrentTime ?? (() => new Date());
    this.leadBufferMs = options?.leadBufferMs ?? 30000;
  }

  getRepository(): ScheduleRepository {
    return this.repository;
  }

  getAlarmScheduler(): AlarmScheduler {
    return this.alarmScheduler;
  }

  getSmsDispatcher(): SmsDispatcher {
    return this.smsDispatcher;
  }

  /**
   * Retrieves all scheduled messages sorted chronologically by scheduledAt ascending.
   */
  async getAllSchedules(): Promise<ScheduledMessage[]> {
    return this.repository.getAll();
  }

  /**
   * Retrieves all active pending schedules sorted chronologically by scheduledAt ascending.
   */
  async getActivePendingSchedules(): Promise<ScheduledMessage[]> {
    return this.repository.getActivePending();
  }

  /**
   * Retrieves a single schedule by ID.
   */
  async getScheduleById(id: string): Promise<ScheduledMessage | null> {
    return this.repository.getById(id);
  }

  /**
   * Creates a new schedule, persists it, and arms an exact system alarm.
   * Throws VALIDATION_ERROR if input validation fails.
   */
  async createSchedule(params: CreateScheduleParams): Promise<ScheduledMessage> {
    const recipientName = (params.recipient?.name ?? params.recipientName ?? '').trim();
    const rawPhone = params.recipient?.phoneNumber ?? params.phoneNumber ?? '';
    const phoneNumber = normalizePhoneNumber(rawPhone);
    const scheduledDate =
      params.scheduledAt instanceof Date
        ? params.scheduledAt
        : new Date(params.scheduledAt);

    const validation = validateScheduleInput(
      {
        recipientName,
        phoneNumber: rawPhone,
        messageText: params.messageText,
        scheduledDate,
        recurrence: params.recurrence,
      },
      this.getCurrentTime()
    );

    if (!validation.isValid) {
      const firstError =
        Object.values(validation.errors).find(Boolean) ?? 'Invalid schedule input';
      const error = new Error(`VALIDATION_ERROR: ${firstError}`);
      (error as any).validationErrors = validation.errors;
      throw error;
    }

    const created = await this.repository.create({
      recipient: {
        name: recipientName,
        phoneNumber,
      },
      messageText: params.messageText,
      scheduledAt: scheduledDate.toISOString(),
      recurrence: params.recurrence ?? { type: 'none' },
    });

    // Arm exact system alarm
    try {
      await this.alarmScheduler.scheduleAlarm({
        id: created.id,
        timestampMs: scheduledDate.getTime(),
        alarmRequestCode: created.alarmRequestCode,
        recipientName: created.recipient.name,
        phoneNumber: created.recipient.phoneNumber,
        messageText: created.messageText,
      });
    } catch (alarmError) {
      // Roll back persistence if alarm registration fails
      await this.repository.delete(created.id);
      throw alarmError;
    }

    return created;
  }

  /**
   * Updates an existing schedule, validating any modified fields.
   * Disarms the previous alarm before arming an updated alarm.
   */
  async updateSchedule(
    id: string,
    params: UpdateScheduleParams
  ): Promise<ScheduledMessage> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Schedule with id ${id} not found.`);
    }

    const recipientName =
      params.recipient?.name !== undefined
        ? params.recipient.name.trim()
        : params.recipientName !== undefined
        ? params.recipientName.trim()
        : existing.recipient.name;

    const rawPhone =
      params.recipient?.phoneNumber !== undefined
        ? params.recipient.phoneNumber
        : params.phoneNumber !== undefined
        ? params.phoneNumber
        : existing.recipient.phoneNumber;

    const phoneNumber = normalizePhoneNumber(rawPhone);
    const messageText =
      params.messageText !== undefined ? params.messageText : existing.messageText;
    const recurrence =
      params.recurrence !== undefined ? params.recurrence : existing.recurrence;

    const scheduledDate =
      params.scheduledAt !== undefined
        ? params.scheduledAt instanceof Date
          ? params.scheduledAt
          : new Date(params.scheduledAt)
        : new Date(existing.scheduledAt);

    const now = this.getCurrentTime();

    if (params.scheduledAt !== undefined) {
      const timeRes = validateScheduledTime(scheduledDate, now, this.leadBufferMs);
      if (!timeRes.isValid) {
        throw new Error(`VALIDATION_ERROR: ${timeRes.error}`);
      }
    }

    if (params.phoneNumber !== undefined || params.recipient?.phoneNumber !== undefined) {
      const phoneRes = validatePhoneNumber(rawPhone);
      if (!phoneRes.isValid) {
        throw new Error(`VALIDATION_ERROR: ${phoneRes.error}`);
      }
    }

    if (params.messageText !== undefined) {
      const msgRes = validateMessageText(messageText);
      if (!msgRes.isValid) {
        throw new Error(`VALIDATION_ERROR: ${msgRes.error}`);
      }
    }

    if (params.recipientName !== undefined || params.recipient?.name !== undefined) {
      if (!recipientName) {
        throw new Error('VALIDATION_ERROR: Recipient name is required.');
      }
    }

    if (recurrence && recurrence.type === 'daily' && recurrence.hasEndDate && recurrence.endDate) {
      const cleanEndDate = recurrence.endDate.trim();
      const endIso = cleanEndDate.includes('T') ? cleanEndDate : `${cleanEndDate}T23:59:59.999Z`;
      const end = new Date(endIso);
      if (isNaN(end.getTime())) {
        throw new Error('VALIDATION_ERROR: Invalid recurrence end date format.');
      } else if (end.getTime() < scheduledDate.getTime()) {
        throw new Error(
          'VALIDATION_ERROR: Recurrence end date cannot be earlier than scheduled start date.'
        );
      }
    }

    // Disarm previous alarm before applying update
    await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);

    const updated = await this.repository.update(id, {
      recipient: { name: recipientName, phoneNumber },
      messageText,
      scheduledAt: scheduledDate.toISOString(),
      recurrence,
      status: params.status ?? existing.status,
    });

    // If schedule remains or becomes pending, arm alarm with updated parameters
    if (updated.status === 'pending') {
      await this.alarmScheduler.scheduleAlarm({
        id: updated.id,
        timestampMs: scheduledDate.getTime(),
        alarmRequestCode: updated.alarmRequestCode,
        recipientName: updated.recipient.name,
        phoneNumber: updated.recipient.phoneNumber,
        messageText: updated.messageText,
      });
    }

    return updated;
  }

  /**
   * Reschedules an existing schedule to a new future date/time.
   * Disarms the previous alarm and arms the updated alarm.
   */
  async reschedule(
    id: string,
    newScheduledAt: string | Date
  ): Promise<ScheduledMessage> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Schedule with id ${id} not found.`);
    }

    const dateObj =
      newScheduledAt instanceof Date ? newScheduledAt : new Date(newScheduledAt);

    const validation = validateScheduledTime(dateObj, this.getCurrentTime(), this.leadBufferMs);
    if (!validation.isValid) {
      throw new Error(`VALIDATION_ERROR: ${validation.error}`);
    }

    // Disarm previous alarm before arming updated alarm
    await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);

    const updated = await this.repository.update(id, {
      scheduledAt: dateObj.toISOString(),
      status: 'pending',
      errorMessage: null,
    });

    await this.alarmScheduler.scheduleAlarm({
      id: updated.id,
      timestampMs: dateObj.getTime(),
      alarmRequestCode: updated.alarmRequestCode,
      recipientName: updated.recipient.name,
      phoneNumber: updated.recipient.phoneNumber,
      messageText: updated.messageText,
    });

    return updated;
  }

  /**
   * Deletes a schedule and cancels its registered alarm.
   * Returns true if deleted, false if not found.
   */
  async deleteSchedule(id: string): Promise<boolean> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      return false;
    }

    await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);
    return await this.repository.delete(id);
  }

  /**
   * Cancels a schedule: disarms alarm and sets status to 'cancelled'.
   */
  async cancelSchedule(id: string): Promise<ScheduledMessage> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Schedule with id ${id} not found.`);
    }

    await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);
    return await this.repository.update(id, {
      status: 'cancelled',
    });
  }

  /**
   * Handles recurrence advances: when a recurring schedule completes, advances scheduledAt
   * to the next 24-hour cycle via calculateNextOccurrence and re-arms the alarm.
   * If non-recurring or recurrence has reached its end date, marks status as 'sent' or 'completed'.
   */
  async advanceRecurringSchedule(id: string): Promise<ScheduledMessage> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Schedule with id ${id} not found.`);
    }

    if (existing.recurrence.type !== 'daily') {
      await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);
      return await this.repository.update(id, {
        status: 'sent',
        lastSentAt: this.getCurrentTime().toISOString(),
      });
    }

    const rollover = calculateNextOccurrence(existing.scheduledAt, existing.recurrence);

    if (rollover.isCompleted || !rollover.nextRunAt) {
      await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);
      return await this.repository.update(id, {
        status: 'completed',
        lastSentAt: this.getCurrentTime().toISOString(),
      });
    }

    // Disarm previous alarm before arming updated alarm
    await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);

    const updated = await this.repository.update(id, {
      scheduledAt: rollover.nextRunAt,
      status: 'pending',
      lastSentAt: this.getCurrentTime().toISOString(),
    });

    const triggerMs = new Date(rollover.nextRunAt).getTime();
    await this.alarmScheduler.scheduleAlarm({
      id: updated.id,
      timestampMs: triggerMs,
      alarmRequestCode: updated.alarmRequestCode,
      recipientName: updated.recipient.name,
      phoneNumber: updated.recipient.phoneNumber,
      messageText: updated.messageText,
    });

    return updated;
  }

  /**
   * Executes SMS dispatch for a specific schedule by ID.
   * On success: advances daily recurrence or marks sent.
   * On failure: records error details and sets status to 'failed'.
   */
  async executeSchedule(id: string): Promise<ScheduleExecutionResult> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Schedule with id ${id} not found.`);
    }

    const dispatchResult = await this.smsDispatcher.sendSms({
      id: existing.id,
      recipient: existing.recipient,
      messageText: existing.messageText,
    });

    if (dispatchResult.success) {
      const advanced = await this.advanceRecurringSchedule(id);
      return {
        schedule: advanced,
        dispatchResult,
      };
    } else {
      await this.alarmScheduler.cancelAlarm(existing.alarmRequestCode);
      const failed = await this.repository.update(id, {
        status: 'failed',
        errorMessage: dispatchResult.errorMessage ?? 'SMS dispatch failed',
        carrierErrorCode: dispatchResult.carrierErrorCode ?? null,
      });
      return {
        schedule: failed,
        dispatchResult,
      };
    }
  }

  /**
   * Scans for all active pending schedules due on or before cutoff time,
   * dispatches SMS messages, and advances/updates schedules accordingly.
   */
  async triggerDueSchedules(asOfTime?: Date): Promise<ScheduledMessage[]> {
    const pending = await this.repository.getActivePending();
    const cutoffMs = (asOfTime ?? this.getCurrentTime()).getTime();
    const due = pending.filter(s => new Date(s.scheduledAt).getTime() <= cutoffMs);
    const processed: ScheduledMessage[] = [];

    for (const schedule of due) {
      try {
        const result = await this.executeSchedule(schedule.id);
        processed.push(result.schedule);
      } catch (err: any) {
        const failed = await this.repository.update(schedule.id, {
          status: 'failed',
          errorMessage: err.message ?? String(err),
        });
        processed.push(failed);
      }
    }

    return processed;
  }

  /**
   * Restores pending alarms after device reboot or app launch.
   * Re-arms alarms for future pending schedules; marks past-due schedules as 'failed'.
   */
  async syncPendingAlarms(): Promise<BootRestoreResult> {
    const pending = await this.repository.getActivePending();
    const currentMs = this.getCurrentTime().getTime();
    let rearmedCount = 0;
    let expiredCount = 0;

    for (const schedule of pending) {
      const scheduledMs = new Date(schedule.scheduledAt).getTime();
      if (scheduledMs >= currentMs) {
        await this.alarmScheduler.scheduleAlarm({
          id: schedule.id,
          timestampMs: scheduledMs,
          alarmRequestCode: schedule.alarmRequestCode,
          recipientName: schedule.recipient.name,
          phoneNumber: schedule.recipient.phoneNumber,
          messageText: schedule.messageText,
        });
        rearmedCount++;
      } else {
        await this.repository.update(schedule.id, {
          status: 'failed',
          errorMessage: 'Schedule expired while device was offline or powered off',
        });
        expiredCount++;
      }
    }

    return { rearmedCount, expiredCount };
  }

  /**
   * Disarms all active alarms and clears the repository.
   */
  async clearAllSchedules(): Promise<void> {
    const all = await this.repository.getAll();
    for (const item of all) {
      if (item.status === 'pending') {
        try {
          await this.alarmScheduler.cancelAlarm(item.alarmRequestCode);
        } catch {
          // Disarm errors ignored during bulk purge
        }
      }
    }
    await this.repository.clearAll();
  }
}
