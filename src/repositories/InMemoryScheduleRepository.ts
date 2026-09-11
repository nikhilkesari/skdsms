/**
 * Sked SMS — In-Memory Schedule Repository Implementation
 * Target: src/repositories/InMemoryScheduleRepository.ts
 *
 * Implements ScheduleRepository using an in-memory Map for hermetic testing,
 * fast execution, and deterministic test harness runs.
 */

import type {
  ScheduledMessage,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '../types/schedule';
import type { ScheduleRepository } from './ScheduleRepository';
import { normalizePhoneNumber } from '../utils/validation';
import { calculateSmsSegments } from '../utils/smsCalculator';

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function computeAlarmRequestCode(id: string): number {
  return Math.abs(hashCode(id)) % 2147483647;
}

export function generateDefaultUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class InMemoryScheduleRepository implements ScheduleRepository {
  private schedules: Map<string, ScheduledMessage> = new Map();
  private idGenerator: () => string;

  constructor(idGenerator: () => string = generateDefaultUUID) {
    this.idGenerator = idGenerator;
  }

  /**
   * Allows setting a custom ID generator (e.g. deterministic counters for test harnesses)
   */
  setIdGenerator(idGenerator: () => string): void {
    this.idGenerator = idGenerator;
  }

  async getAll(): Promise<ScheduledMessage[]> {
    return Array.from(this.schedules.values())
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .map(s => this.clone(s));
  }

  async getById(id: string): Promise<ScheduledMessage | null> {
    const item = this.schedules.get(id);
    return item ? this.clone(item) : null;
  }

  async getActivePending(): Promise<ScheduledMessage[]> {
    return Array.from(this.schedules.values())
      .filter(s => s.status === 'pending')
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .map(s => this.clone(s));
  }

  async create(input: CreateScheduleInput): Promise<ScheduledMessage> {
    const id = this.idGenerator();
    const now = new Date().toISOString();
    const alarmRequestCode = computeAlarmRequestCode(id);
    const partsCount = calculateSmsSegments(input.messageText).segmentCount;

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
      partsCount,
    };

    this.schedules.set(id, this.clone(schedule));
    return this.clone(schedule);
  }

  async update(id: string, input: UpdateScheduleInput): Promise<ScheduledMessage> {
    const existing = this.schedules.get(id);
    if (!existing) {
      throw new Error(`Schedule with id ${id} not found.`);
    }

    let recipient = { ...existing.recipient };
    if (input.recipient) {
      recipient = {
        name: input.recipient.name.trim(),
        phoneNumber: normalizePhoneNumber(input.recipient.phoneNumber),
      };
    } else {
      if (input.phoneNumber !== undefined) {
        recipient.phoneNumber = normalizePhoneNumber(input.phoneNumber);
      }
      if (input.recipientName !== undefined) {
        recipient.name = input.recipientName.trim();
      }
    }

    const partsCount = input.messageText !== undefined
      ? calculateSmsSegments(input.messageText).segmentCount
      : existing.partsCount;

    const updated: ScheduledMessage = {
      ...existing,
      recipient,
      messageText: input.messageText !== undefined ? input.messageText : existing.messageText,
      scheduledAt: input.scheduledAt !== undefined ? input.scheduledAt : existing.scheduledAt,
      recurrence: input.recurrence !== undefined ? input.recurrence : existing.recurrence,
      status: input.status !== undefined ? input.status : existing.status,
      updatedAt: new Date().toISOString(),
      lastSentAt: input.lastSentAt !== undefined ? input.lastSentAt : existing.lastSentAt,
      errorMessage: input.errorMessage !== undefined ? input.errorMessage : existing.errorMessage,
      carrierErrorCode: input.carrierErrorCode !== undefined ? input.carrierErrorCode : existing.carrierErrorCode,
      partsCount,
    };

    this.schedules.set(id, this.clone(updated));
    return this.clone(updated);
  }

  async delete(id: string): Promise<boolean> {
    return this.schedules.delete(id);
  }

  async clearAll(): Promise<void> {
    this.schedules.clear();
  }

  /**
   * Helper for tests to inspect total records count
   */
  count(): number {
    return this.schedules.size;
  }

  private clone(item: ScheduledMessage): ScheduledMessage {
    return {
      ...item,
      recipient: { ...item.recipient },
      recurrence: { ...item.recurrence },
    };
  }
}
