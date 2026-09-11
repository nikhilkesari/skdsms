/**
 * Sked SMS — Input & Schedule Validation Utilities
 * Target: src/utils/validation.ts
 */

import type {
  RecurrenceRule,
  ValidationResult,
  ScheduleValidationErrors,
  ScheduleValidationInput,
} from '../types/schedule';

export type { ValidationResult, ScheduleValidationErrors, ScheduleValidationInput };

/**
 * Normalizes a raw phone number input into dialable digits or E.164 string.
 * Preserves a leading '+' if present and removes all non-numeric characters.
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 0) return '';
  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

/**
 * Validates a phone number according to ITU-T E.164 and national dialing rules.
 * - Must be non-empty.
 * - Digits count must be between 7 and 15 inclusive.
 * - Must conform to E.164 pattern: /^\+?[1-9]\d{6,14}$/.
 */
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

/**
 * Validates that a scheduled date/time is in the future, respecting a minimum buffer lead time.
 * Defaults to a 30-second lead buffer to prevent scheduling alarms that have already passed.
 */
export function validateScheduledTime(
  date: Date | string,
  now: Date = new Date(),
  bufferMs: number = 30000 // 30-second lead buffer
): { isValid: boolean; error?: string } {
  if (date === null || date === undefined || (typeof date !== 'string' && !(date instanceof Date))) {
    return { isValid: false, error: 'Scheduled date and time is required and cannot be empty.' };
  }

  const cleanDate = typeof date === 'string' ? date.trim() : date;
  const parsed = typeof cleanDate === 'string' ? new Date(cleanDate) : cleanDate;
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

/**
 * Validates that message text is present and contains non-whitespace content.
 */
export function validateMessageText(text: string): { isValid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { isValid: false, error: 'Message text is required and cannot be empty.' };
  }
  return { isValid: true };
}

/**
 * Validates the combined form input when creating or updating a schedule.
 * Enforces:
 * 1. Non-empty recipient name.
 * 2. Valid phone number.
 * 3. Non-empty message text.
 * 4. Future scheduled timestamp (>= now + 30s buffer).
 * 5. Recurrence end date validity and chronologically >= scheduled date.
 */
export function validateScheduleInput(
  input: {
    recipientName?: string;
    phoneNumber?: string;
    recipient?: { name?: string; phoneNumber?: string };
    messageText: string;
    scheduledDate?: Date | string;
    scheduledAt?: Date | string;
    recurrence?: RecurrenceRule;
  },
  now: Date = new Date()
): ValidationResult {
  const errors: ScheduleValidationErrors = {};

  const name =
    input.recipientName !== undefined
      ? input.recipientName
      : input.recipient?.name || '';
  const phone =
    input.phoneNumber !== undefined
      ? input.phoneNumber
      : input.recipient?.phoneNumber || '';
  const dateVal =
    input.scheduledDate !== undefined
      ? input.scheduledDate
      : input.scheduledAt;

  if (!name || name.trim().length === 0) {
    errors.recipient = 'Recipient name is required.';
  }

  const phoneRes = validatePhoneNumber(phone);
  if (!phoneRes.isValid) {
    errors.phoneNumber = phoneRes.error;
  }

  const msgRes = validateMessageText(input.messageText);
  if (!msgRes.isValid) {
    errors.message = msgRes.error;
  }

  const timeRes = validateScheduledTime(dateVal as any, now);
  if (!timeRes.isValid) {
    errors.scheduledAt = timeRes.error;
  }

  if (
    input.recurrence &&
    input.recurrence.type === 'daily' &&
    input.recurrence.hasEndDate &&
    input.recurrence.endDate
  ) {
    const cleanEndDate = input.recurrence.endDate.trim();
    const endIso = cleanEndDate.includes('T')
      ? cleanEndDate
      : `${cleanEndDate}T23:59:59.999Z`;
    const end = new Date(endIso);
    const cleanScheduled =
      typeof dateVal === 'string'
        ? dateVal.trim()
        : dateVal;
    const scheduled =
      typeof cleanScheduled === 'string'
        ? new Date(cleanScheduled)
        : cleanScheduled instanceof Date
        ? cleanScheduled
        : null;
    const scheduledMs = scheduled ? scheduled.getTime() : NaN;

    if (isNaN(end.getTime())) {
      errors.recurrence = 'Invalid recurrence end date format.';
    } else if (!isNaN(scheduledMs) && end.getTime() < scheduledMs) {
      errors.recurrence = 'Recurrence end date cannot be earlier than scheduled start date.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
