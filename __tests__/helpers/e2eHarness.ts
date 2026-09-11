/**
 * Sked SMS — E2E Test Harness & Contract Definitions
 *
 * Implements the opaque-box test facade and interface contracts specified in:
 * - PROJECT.md (Architecture, Contracts, Data Models)
 * - ORIGINAL_REQUEST.md (Requirements R1, R2, R3)
 * - Survey Reports (Spec Miner 2 & Explorer 3)
 */

export type ScheduleStatus = 'pending' | 'sent' | 'failed' | 'cancelled' | 'completed';
export type RecurrenceType = 'none' | 'daily';

export interface RecurrenceRule {
  type: RecurrenceType;
  hasEndDate?: boolean;
  endDate?: string | null; // ISO 8601 YYYY-MM-DD
}

export interface Recipient {
  name: string;
  phoneNumber: string; // Sanitized dialable string / E.164
}

export interface ScheduledMessage {
  id: string; // UUID v4
  recipient: Recipient;
  messageText: string;
  scheduledAt: string; // ISO 8601 UTC timestamp
  recurrence: RecurrenceRule;
  status: ScheduleStatus;
  alarmRequestCode: number;
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string | null;
  errorMessage?: string | null;
  carrierErrorCode?: number | null;
  partsCount?: number;
}

export interface CreateScheduleInput {
  recipient: Recipient;
  messageText: string;
  scheduledAt: string;
  recurrence?: RecurrenceRule;
}

export interface UpdateScheduleInput {
  recipient?: Recipient;
  phoneNumber?: string;
  messageText?: string;
  scheduledAt?: string;
  recurrence?: RecurrenceRule;
  status?: ScheduleStatus;
}

export interface ValidationResult {
  isValid: boolean;
  errors: {
    recipient?: string;
    phoneNumber?: string;
    message?: string;
    scheduledAt?: string;
    recurrence?: string;
  };
}

export interface SmsSegmentResult {
  charCount: number;
  segmentCount: number;
  isUnicode: boolean;
  bytesTotal: number;
}

export interface SendSmsParams {
  id: string;
  recipient: Recipient;
  messageText: string;
  subscriptionId?: number;
}

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  timestamp: string;
  partsCount: number;
  carrierErrorCode?: number | null;
  errorMessage?: string | null;
}

export interface SentMessageRecord {
  params: SendSmsParams;
  result: SmsDispatchResult;
  sentAt: Date;
}

export interface SmsDispatcher {
  sendSms(params: SendSmsParams): Promise<SmsDispatchResult>;
  isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// 1. Phone Normalization & Validation
// ---------------------------------------------------------------------------

export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 0) return '';
  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

export function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) {
    return { isValid: false, error: 'Phone number is required.' };
  }
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 7) {
    return { isValid: false, error: 'Phone number is too short (minimum 7 digits).' };
  }
  if (digits.length > 15) {
    return { isValid: false, error: 'Phone number exceeds maximum length (15 digits).' };
  }
  // Valid formats: E.164 (+1234567890) or national digits (1234567890)
  const e164Regex = /^\+?[1-9]\d{6,14}$/;
  if (!e164Regex.test(normalized)) {
    return { isValid: false, error: 'Phone number format is invalid.' };
  }
  return { isValid: true };
}

// ---------------------------------------------------------------------------
// 2. Scheduled Time Validation
// ---------------------------------------------------------------------------

export function validateScheduledTime(
  date: Date | string,
  now: Date = new Date(),
  bufferMs: number = 30000 // 30-second lead buffer
): { isValid: boolean; error?: string } {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  const timeMs = parsed.getTime();

  if (isNaN(timeMs)) {
    return { isValid: false, error: 'Invalid date or time format.' };
  }

  const minAllowed = now.getTime() + bufferMs;
  if (timeMs < minAllowed) {
    return {
      isValid: false,
      error: 'Scheduled time must be in the future (minimum 30 seconds from now).',
    };
  }

  return { isValid: true };
}

// ---------------------------------------------------------------------------
// 3. Message Text Validation & Segmentation
// ---------------------------------------------------------------------------

export function validateMessageText(text: string): { isValid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { isValid: false, error: 'Message text is required and cannot be empty.' };
  }
  return { isValid: true };
}

export function calculateSmsSegments(text: string): SmsSegmentResult {
  if (!text) {
    return { charCount: 0, segmentCount: 0, isUnicode: false, bytesTotal: 0 };
  }

  // Check for characters outside standard GSM-7 basic charset
  // Standard ASCII printable + standard whitespace
  const isGsm7 = /^[\x20-\x7E\r\n\t]*$/.test(text);
  const isUnicode = !isGsm7;

  // Use Array.from to correctly count Unicode code points (emojis)
  const codePoints = Array.from(text);
  const charCount = codePoints.length;

  if (charCount === 0) {
    return { charCount: 0, segmentCount: 0, isUnicode, bytesTotal: 0 };
  }

  let segmentCount: number;
  let bytesTotal: number;

  if (!isUnicode) {
    bytesTotal = text.length; // 1 byte per GSM-7 char approximately
    if (charCount <= 160) {
      segmentCount = 1;
    } else {
      segmentCount = Math.ceil(charCount / 153);
    }
  } else {
    bytesTotal = text.length * 2; // UCS-2 2 bytes per char
    if (charCount <= 70) {
      segmentCount = 1;
    } else {
      segmentCount = Math.ceil(charCount / 67);
    }
  }

  return { charCount, segmentCount, isUnicode, bytesTotal };
}

// ---------------------------------------------------------------------------
// 4. Combined Input Validation
// ---------------------------------------------------------------------------

export function validateScheduleInput(
  input: {
    recipientName: string;
    phoneNumber: string;
    messageText: string;
    scheduledDate: Date | string;
    recurrence?: RecurrenceRule;
  },
  now: Date = new Date()
): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  if (!input.recipientName || input.recipientName.trim().length === 0) {
    errors.recipient = 'Recipient name is required.';
  }

  const phoneRes = validatePhoneNumber(input.phoneNumber);
  if (!phoneRes.isValid) {
    errors.phoneNumber = phoneRes.error;
  }

  const msgRes = validateMessageText(input.messageText);
  if (!msgRes.isValid) {
    errors.message = msgRes.error;
  }

  const timeRes = validateScheduledTime(input.scheduledDate, now);
  if (!timeRes.isValid) {
    errors.scheduledAt = timeRes.error;
  }

  if (input.recurrence && input.recurrence.type === 'daily' && input.recurrence.hasEndDate && input.recurrence.endDate) {
    const end = new Date(`${input.recurrence.endDate}T23:59:59.999Z`);
    const scheduled = typeof input.scheduledDate === 'string' ? new Date(input.scheduledDate) : input.scheduledDate;
    if (isNaN(end.getTime())) {
      errors.recurrence = 'Invalid recurrence end date format.';
    } else if (end.getTime() < scheduled.getTime()) {
      errors.recurrence = 'Recurrence end date cannot be earlier than scheduled start date.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 5. Daily Recurrence Calculation
// ---------------------------------------------------------------------------

export function calculateNextRun(
  currentScheduledAt: string,
  rule: RecurrenceRule
): { nextRunAt: string | null; isCompleted: boolean } {
  if (rule.type !== 'daily') {
    return { nextRunAt: null, isCompleted: true };
  }

  const currentMs = new Date(currentScheduledAt).getTime();
  if (isNaN(currentMs)) {
    return { nextRunAt: null, isCompleted: true };
  }

  // Exactly +24 hours
  const nextMs = currentMs + 24 * 60 * 60 * 1000;
  const nextDate = new Date(nextMs);

  if (rule.hasEndDate && rule.endDate) {
    // End of end-date day (23:59:59.999 UTC)
    const endMs = new Date(`${rule.endDate}T23:59:59.999Z`).getTime();
    if (nextMs > endMs) {
      return { nextRunAt: null, isCompleted: true };
    }
  }

  return { nextRunAt: nextDate.toISOString(), isCompleted: false };
}

// ---------------------------------------------------------------------------
// 6. MockSmsDispatcher Implementation
// ---------------------------------------------------------------------------

export class MockSmsDispatcher implements SmsDispatcher {
  private sentMessages: SentMessageRecord[] = [];
  private shouldFail: boolean = false;
  private failureErrorCode: number | null = null;
  private failureErrorMessage: string | null = null;
  private delayMs: number = 0;
  private available: boolean = true;

  async sendSms(params: SendSmsParams): Promise<SmsDispatchResult> {
    if (this.delayMs > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, this.delayMs));
    }

    if (!this.available) {
      throw new Error('SmsDispatcher is currently unavailable');
    }

    const segments = calculateSmsSegments(params.messageText);

    if (this.shouldFail) {
      const result: SmsDispatchResult = {
        success: false,
        messageId: params.id,
        timestamp: new Date().toISOString(),
        partsCount: segments.segmentCount,
        carrierErrorCode: this.failureErrorCode ?? 1, // RESULT_ERROR_GENERIC_FAILURE
        errorMessage: this.failureErrorMessage ?? 'Simulated SMS dispatch failure',
      };
      this.sentMessages.push({ params, result, sentAt: new Date() });
      return result;
    }

    const result: SmsDispatchResult = {
      success: true,
      messageId: params.id,
      timestamp: new Date().toISOString(),
      partsCount: segments.segmentCount,
      carrierErrorCode: null,
      errorMessage: null,
    };

    this.sentMessages.push({ params, result, sentAt: new Date() });
    return result;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  setSimulateFailure(fail: boolean, errorCode?: number, errorMessage?: string): void {
    this.shouldFail = fail;
    this.failureErrorCode = errorCode ?? null;
    this.failureErrorMessage = errorMessage ?? null;
  }

  setSimulateDelay(delayMs: number): void {
    this.delayMs = delayMs;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  getSentMessages(): SentMessageRecord[] {
    return [...this.sentMessages];
  }

  getLastSentMessage(): SentMessageRecord | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  clear(): void {
    this.sentMessages = [];
    this.shouldFail = false;
    this.failureErrorCode = null;
    this.failureErrorMessage = null;
    this.delayMs = 0;
    this.available = true;
  }
}

// ---------------------------------------------------------------------------
// 7. In-Memory Schedule Repository
// ---------------------------------------------------------------------------

let idCounter = 1;
function generateUUID(): string {
  return `00000000-0000-4000-8000-${String(idCounter++).padStart(12, '0')}`;
}

export function resetIdCounter(): void {
  idCounter = 1;
}

export class InMemoryScheduleRepository {
  private schedules: Map<string, ScheduledMessage> = new Map();

  async getAll(): Promise<ScheduledMessage[]> {
    return Array.from(this.schedules.values()).sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }

  async getById(id: string): Promise<ScheduledMessage | null> {
    return this.schedules.get(id) ?? null;
  }

  async getActivePending(): Promise<ScheduledMessage[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.status === 'pending')
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  async create(input: CreateScheduleInput): Promise<ScheduledMessage> {
    const id = generateUUID();
    const now = new Date().toISOString();
    const alarmRequestCode = Math.abs(hashCode(id)) % 2147483647;

    const schedule: ScheduledMessage = {
      id,
      recipient: {
        name: input.recipient.name.trim(),
        phoneNumber: normalizePhoneNumber(input.recipient.phoneNumber),
      },
      messageText: input.messageText,
      scheduledAt: input.scheduledAt,
      recurrence: input.recurrence ?? { type: 'none' },
      status: 'pending',
      alarmRequestCode,
      createdAt: now,
      updatedAt: now,
      lastSentAt: null,
      errorMessage: null,
      carrierErrorCode: null,
      partsCount: calculateSmsSegments(input.messageText).segmentCount,
    };

    this.schedules.set(id, schedule);
    return { ...schedule };
  }

  async update(id: string, input: UpdateScheduleInput): Promise<ScheduledMessage> {
    const existing = this.schedules.get(id);
    if (!existing) {
      throw new Error(`Schedule with id ${id} not found.`);
    }

    const updated: ScheduledMessage = {
      ...existing,
      recipient: input.recipient
        ? {
            name: input.recipient.name.trim(),
            phoneNumber: normalizePhoneNumber(input.recipient.phoneNumber),
          }
        : existing.recipient,
      messageText: input.messageText ?? existing.messageText,
      scheduledAt: input.scheduledAt ?? existing.scheduledAt,
      recurrence: input.recurrence ?? existing.recurrence,
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString(),
      partsCount: input.messageText
        ? calculateSmsSegments(input.messageText).segmentCount
        : existing.partsCount,
    };

    this.schedules.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.schedules.delete(id);
  }

  async clearAll(): Promise<void> {
    this.schedules.clear();
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// 8. E2ETestContext (High-Level ScheduleManager & Alarm Simulator)
// ---------------------------------------------------------------------------

export interface AlarmRegistration {
  scheduleId: string;
  requestCode: number;
  triggerAtMillis: number;
  isCancelled: boolean;
}

export class E2ETestContext {
  public repository: InMemoryScheduleRepository;
  public dispatcher: MockSmsDispatcher;
  public alarms: Map<string, AlarmRegistration> = new Map();
  public currentTime: Date;

  constructor(initialTime: Date = new Date('2026-09-15T08:00:00Z')) {
    this.repository = new InMemoryScheduleRepository();
    this.dispatcher = new MockSmsDispatcher();
    this.currentTime = initialTime;
    resetIdCounter();
  }

  advanceTimeTo(newTime: Date | string): void {
    this.currentTime = typeof newTime === 'string' ? new Date(newTime) : newTime;
  }

  advanceTimeBy(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  async createSchedule(input: {
    recipientName: string;
    phoneNumber: string;
    messageText: string;
    scheduledAt: string;
    recurrence?: RecurrenceRule;
  }): Promise<ScheduledMessage> {
    const validation = validateScheduleInput(
      {
        recipientName: input.recipientName,
        phoneNumber: input.phoneNumber,
        messageText: input.messageText,
        scheduledDate: input.scheduledAt,
        recurrence: input.recurrence,
      },
      this.currentTime
    );

    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(`VALIDATION_ERROR: ${firstError}`);
    }

    const created = await this.repository.create({
      recipient: {
        name: input.recipientName,
        phoneNumber: input.phoneNumber,
      },
      messageText: input.messageText,
      scheduledAt: input.scheduledAt,
      recurrence: input.recurrence,
    });

    // Arm AlarmManager
    const triggerMs = new Date(created.scheduledAt).getTime();
    this.alarms.set(created.id, {
      scheduleId: created.id,
      requestCode: created.alarmRequestCode,
      triggerAtMillis: triggerMs,
      isCancelled: false,
    });

    return created;
  }

  async reschedule(id: string, newScheduledAt: string): Promise<ScheduledMessage> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Schedule ${id} not found`);
    }

    const timeValidation = validateScheduledTime(newScheduledAt, this.currentTime);
    if (!timeValidation.isValid) {
      throw new Error(`VALIDATION_ERROR: ${timeValidation.error}`);
    }

    // Cancel old alarm
    const oldAlarm = this.alarms.get(id);
    if (oldAlarm) {
      oldAlarm.isCancelled = true;
    }

    // Update record
    const updated = await this.repository.update(id, {
      scheduledAt: newScheduledAt,
      status: 'pending',
    });

    // Arm new alarm
    this.alarms.set(id, {
      scheduleId: id,
      requestCode: updated.alarmRequestCode,
      triggerAtMillis: new Date(newScheduledAt).getTime(),
      isCancelled: false,
    });

    return updated;
  }

  async editSchedule(id: string, input: UpdateScheduleInput): Promise<ScheduledMessage> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Schedule ${id} not found`);
    }

    if (input.scheduledAt) {
      const timeVal = validateScheduledTime(input.scheduledAt, this.currentTime);
      if (!timeVal.isValid) {
        throw new Error(`VALIDATION_ERROR: ${timeVal.error}`);
      }
    }

    if (input.phoneNumber) {
      const phoneVal = validatePhoneNumber(input.phoneNumber);
      if (!phoneVal.isValid) {
        throw new Error(`VALIDATION_ERROR: ${phoneVal.error}`);
      }
    }

    if (input.messageText !== undefined) {
      const msgVal = validateMessageText(input.messageText);
      if (!msgVal.isValid) {
        throw new Error(`VALIDATION_ERROR: ${msgVal.error}`);
      }
    }

    const updated = await this.repository.update(id, input);

    if (input.scheduledAt) {
      this.alarms.set(id, {
        scheduleId: id,
        requestCode: updated.alarmRequestCode,
        triggerAtMillis: new Date(input.scheduledAt).getTime(),
        isCancelled: false,
      });
    }

    return updated;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    // Disarm AlarmManager
    const alarm = this.alarms.get(id);
    if (alarm) {
      alarm.isCancelled = true;
      this.alarms.delete(id);
    }
    return await this.repository.delete(id);
  }

  async triggerDueSchedules(): Promise<ScheduledMessage[]> {
    const pending = await this.repository.getActivePending();
    const currentMs = this.currentTime.getTime();
    const due = pending.filter(s => new Date(s.scheduledAt).getTime() <= currentMs);
    const processed: ScheduledMessage[] = [];

    for (const schedule of due) {
      const dispatchResult = await this.dispatcher.sendSms({
        id: schedule.id,
        recipient: schedule.recipient,
        messageText: schedule.messageText,
      });

      if (dispatchResult.success) {
        if (schedule.recurrence.type === 'daily') {
          const rollover = calculateNextRun(schedule.scheduledAt, schedule.recurrence);
          if (rollover.isCompleted || !rollover.nextRunAt) {
            const updated = await this.repository.update(schedule.id, {
              status: 'completed',
            });
            this.alarms.delete(schedule.id);
            processed.push(updated);
          } else {
            // Advance schedule to next day
            const updated = await this.repository.update(schedule.id, {
              scheduledAt: rollover.nextRunAt,
              status: 'pending',
            });
            this.alarms.set(schedule.id, {
              scheduleId: schedule.id,
              requestCode: schedule.alarmRequestCode,
              triggerAtMillis: new Date(rollover.nextRunAt).getTime(),
              isCancelled: false,
            });
            processed.push(updated);
          }
        } else {
          const updated = await this.repository.update(schedule.id, {
            status: 'sent',
          });
          this.alarms.delete(schedule.id);
          processed.push(updated);
        }
      } else {
        const updated = await this.repository.update(schedule.id, {
          status: 'failed',
        });
        processed.push(updated);
      }
    }

    return processed;
  }

  async simulateBootCompleted(): Promise<{ rearmedCount: number; expiredCount: number }> {
    // AlarmManager clears all alarms on reboot
    this.alarms.clear();

    const pending = await this.repository.getActivePending();
    const currentMs = this.currentTime.getTime();
    let rearmedCount = 0;
    let expiredCount = 0;

    for (const schedule of pending) {
      const scheduledMs = new Date(schedule.scheduledAt).getTime();
      if (scheduledMs >= currentMs) {
        // Re-arm alarm
        this.alarms.set(schedule.id, {
          scheduleId: schedule.id,
          requestCode: schedule.alarmRequestCode,
          triggerAtMillis: scheduledMs,
          isCancelled: false,
        });
        rearmedCount++;
      } else {
        // Past-due during shutdown: marked failed
        await this.repository.update(schedule.id, {
          status: 'failed',
        });
        expiredCount++;
      }
    }

    return { rearmedCount, expiredCount };
  }
}
