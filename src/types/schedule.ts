/**
 * Sked SMS — Schedule Domain Models
 * Target: src/types/schedule.ts
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
  createdAt: string; // ISO 8601 UTC timestamp
  updatedAt: string; // ISO 8601 UTC timestamp
  lastSentAt?: string | null;
  errorMessage?: string | null;
  carrierErrorCode?: number | null;
  partsCount?: number;
}

export interface CreateScheduleInput {
  recipient: Recipient;
  messageText: string;
  scheduledAt: string; // ISO 8601 UTC timestamp
  recurrence?: RecurrenceRule;
}

export interface UpdateScheduleInput {
  recipient?: Recipient;
  recipientName?: string;
  phoneNumber?: string;
  messageText?: string;
  scheduledAt?: string;
  recurrence?: RecurrenceRule;
  status?: ScheduleStatus;
  lastSentAt?: string | null;
  errorMessage?: string | null;
  carrierErrorCode?: number | null;
  partsCount?: number;
}

export interface ScheduleValidationErrors {
  recipient?: string;
  phoneNumber?: string;
  message?: string;
  scheduledAt?: string;
  recurrence?: string;
  general?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ScheduleValidationErrors;
}

export interface ScheduleValidationInput {
  recipientName: string;
  phoneNumber: string;
  messageText: string;
  scheduledDate: Date | string;
  recurrence?: RecurrenceRule;
}

export interface SmsSegmentResult {
  charCount: number;
  segmentCount: number;
  isUnicode: boolean;
  bytesTotal: number;
}
