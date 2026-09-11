/**
 * Sked SMS — Recurrence Calculation & Lifecycle State Transition Engine
 * Path: src/services/scheduler/recurrence.ts
 *
 * Implements authoritative recurrence calculation and schedule lifecycle
 * state transition algorithms conforming to PROJECT.md and ORIGINAL_REQUEST.md.
 */

import type { RecurrenceRule, ScheduleStatus } from '../../types/schedule';

export interface NextRunResult {
  nextRunAt: string | null;
  isCompleted: boolean;
}

export interface RecurrenceTransitionInput {
  currentStatus: ScheduleStatus;
  scheduledAt: string;
  recurrence: RecurrenceRule;
  dispatchSuccess: boolean;
}

export interface RecurrenceTransitionResult {
  nextStatus: ScheduleStatus;
  nextScheduledAt: string | null;
  isCompleted: boolean;
  shouldRearmAlarm: boolean;
}

/**
 * Calculates the next run timestamp for a scheduled message based on its recurrence rule.
 *
 * Rules:
 * 1. If rule.type is not 'daily', returns { nextRunAt: null, isCompleted: true }.
 * 2. If currentScheduledAt is invalid or missing, returns { nextRunAt: null, isCompleted: true }.
 * 3. Daily recurrence advances currentScheduledAt by exactly +24 hours (+86,400,000 ms),
 *    preserving hours, minutes, seconds, and milliseconds across months, leap years, and years.
 * 4. If rule.hasEndDate is true and rule.endDate is provided:
 *    - The end boundary is inclusive until the end of the end date (23:59:59.999 UTC).
 *    - If the next run timestamp exceeds this boundary, returns { nextRunAt: null, isCompleted: true }.
 *    - If rule.endDate is malformed or invalid, returns { nextRunAt: null, isCompleted: true }.
 * 5. Otherwise, returns { nextRunAt: nextDate.toISOString(), isCompleted: false }.
 */
export function calculateNextRun(
  currentScheduledAt: string,
  rule: RecurrenceRule
): NextRunResult {
  if (!rule || rule.type !== 'daily') {
    return { nextRunAt: null, isCompleted: true };
  }

  if (!currentScheduledAt || typeof currentScheduledAt !== 'string') {
    return { nextRunAt: null, isCompleted: true };
  }

  const currentMs = new Date(currentScheduledAt).getTime();
  if (isNaN(currentMs)) {
    return { nextRunAt: null, isCompleted: true };
  }

  // Exactly +24 hours (86,400,000 milliseconds)
  const nextMs = currentMs + 24 * 60 * 60 * 1000;
  const nextDate = new Date(nextMs);

  if (rule.hasEndDate && rule.endDate) {
    const cleanEndDate = rule.endDate.trim();
    const endIso = cleanEndDate.includes('T')
      ? cleanEndDate
      : `${cleanEndDate}T23:59:59.999Z`;
    const endMs = new Date(endIso).getTime();

    if (isNaN(endMs) || nextMs > endMs) {
      return { nextRunAt: null, isCompleted: true };
    }
  }

  return { nextRunAt: nextDate.toISOString(), isCompleted: false };
}

/**
 * Computes the lifecycle state transition after an SMS dispatch execution attempt.
 *
 * State transition rules:
 * - If dispatchSuccess is false:
 *     -> status transitions to 'failed', no alarm rearmed.
 * - If dispatchSuccess is true and recurrence.type is 'daily':
 *     - If next run exceeds end date (isCompleted: true):
 *         -> status transitions to 'completed', no alarm rearmed.
 *     - If next run is valid (isCompleted: false):
 *         -> status remains 'pending' (rolled over), nextScheduledAt updated, alarm should be rearmed.
 * - If dispatchSuccess is true and recurrence.type is not 'daily':
 *     -> status transitions to 'sent', no alarm rearmed.
 */
export function transitionScheduleLifecycle(
  input: RecurrenceTransitionInput
): RecurrenceTransitionResult {
  if (!input.dispatchSuccess) {
    return {
      nextStatus: 'failed',
      nextScheduledAt: null,
      isCompleted: true,
      shouldRearmAlarm: false,
    };
  }

  if (input.recurrence && input.recurrence.type === 'daily') {
    const nextRun = calculateNextRun(input.scheduledAt, input.recurrence);
    if (nextRun.isCompleted || !nextRun.nextRunAt) {
      return {
        nextStatus: 'completed',
        nextScheduledAt: null,
        isCompleted: true,
        shouldRearmAlarm: false,
      };
    }

    return {
      nextStatus: 'pending',
      nextScheduledAt: nextRun.nextRunAt,
      isCompleted: false,
      shouldRearmAlarm: true,
    };
  }

  // Non-recurring single-shot
  return {
    nextStatus: 'sent',
    nextScheduledAt: null,
    isCompleted: true,
    shouldRearmAlarm: false,
  };
}

/**
 * Calculates the number of remaining daily occurrences before the end date.
 * Returns null for indefinite recurrence (no end date).
 * Returns 0 if already completed, expired, or non-daily.
 */
export function calculateRemainingOccurrences(
  currentScheduledAt: string,
  rule: RecurrenceRule
): number | null {
  if (!rule || rule.type !== 'daily') {
    return 0;
  }

  if (!rule.hasEndDate || !rule.endDate) {
    return null; // Indefinite
  }

  const currentMs = new Date(currentScheduledAt).getTime();
  const cleanEndDate = rule.endDate.trim();
  const endIso = cleanEndDate.includes('T') ? cleanEndDate : `${cleanEndDate}T23:59:59.999Z`;
  const endMs = new Date(endIso).getTime();

  if (isNaN(currentMs) || isNaN(endMs) || currentMs > endMs) {
    return 0;
  }

  let count = 0;
  let nextMs = currentMs;
  while (true) {
    nextMs += 24 * 60 * 60 * 1000;
    if (nextMs > endMs) {
      break;
    }
    count++;
  }

  return count;
}
