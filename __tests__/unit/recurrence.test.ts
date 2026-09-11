/**
 * Unit Test Suite: Recurrence Engine & Lifecycle State Transitions
 * Target: __tests__/unit/recurrence.test.ts
 *
 * Covers:
 * 1. Indefinite daily recurrence (+24h, time preservation, multiple rollover steps).
 * 2. Daily recurrence with active end date bounds.
 * 3. Daily recurrence with end date reached/exceeded (completion).
 * 4. Calendar and leap year boundary rollovers (leap years, 30/31-day months, year boundary).
 * 5. Non-daily and non-recurring schedule handling.
 * 6. Malformed and edge-case inputs.
 * 7. Lifecycle state transitions (pending -> sent / pending rolled over / completed / failed).
 * 8. Remaining occurrences calculation.
 */

import {
  calculateNextRun,
  transitionScheduleLifecycle,
  calculateRemainingOccurrences,
} from '../../src/services/scheduler/recurrence';
import type { RecurrenceRule } from '../../src/types/schedule';

describe('Recurrence Engine — Unit Tests', () => {
  // =========================================================================
  // 1. Indefinite Daily Recurrence
  // =========================================================================
  describe('Indefinite Daily Recurrence', () => {
    it('should calculate next run exactly 24 hours later', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T08:00:00.000Z');
    });

    it('should preserve exact hour, minute, second, and millisecond across rollovers', () => {
      const current = '2026-09-15T21:45:30.123Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T21:45:30.123Z');

      const date = new Date(res.nextRunAt!);
      expect(date.getUTCHours()).toBe(21);
      expect(date.getUTCMinutes()).toBe(45);
      expect(date.getUTCSeconds()).toBe(30);
      expect(date.getUTCMilliseconds()).toBe(123);
    });

    it('should handle indefinite recurrence when hasEndDate is undefined or false', () => {
      const current = '2026-09-15T12:00:00.000Z';
      const ruleWithoutFlag: RecurrenceRule = { type: 'daily' };
      const res = calculateNextRun(current, ruleWithoutFlag);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T12:00:00.000Z');
    });

    it('should successfully calculate consecutive daily rollovers over 7 days', () => {
      let current = '2026-09-15T09:00:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };

      for (let day = 16; day <= 22; day++) {
        const res = calculateNextRun(current, rule);
        expect(res.isCompleted).toBe(false);
        expect(res.nextRunAt).toBe(`2026-09-${String(day).padStart(2, '0')}T09:00:00.000Z`);
        current = res.nextRunAt!;
      }
    });
  });

  // =========================================================================
  // 2. Daily Recurrence with End Date
  // =========================================================================
  describe('Daily Recurrence with End Date', () => {
    it('should continue recurring when next run timestamp is well before end date', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T08:00:00.000Z');
    });

    it('should allow execution on the final day itself when next run falls on the end date', () => {
      const current = '2026-09-19T08:00:00.000Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-20T08:00:00.000Z');
    });

    it('should allow execution up to 23:59:59.999 UTC of the end date', () => {
      const current = '2026-09-19T23:59:59.999Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-20T23:59:59.999Z');
    });

    it('should complete when next run timestamp exceeds the end of the end date day', () => {
      const current = '2026-09-20T08:00:00.000Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('should complete immediately if scheduled date is already on end date', () => {
      const current = '2026-09-20T23:00:00.000Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('should ignore endDate if hasEndDate is false', () => {
      const current = '2026-09-20T08:00:00.000Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: false,
        endDate: '2026-09-20',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-21T08:00:00.000Z');
    });

    it('should handle endDate provided with ISO timestamp format cleanly', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20T23:59:59.999Z',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T08:00:00.000Z');
    });

    it('should trim surrounding whitespace from endDate', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '  2026-09-20  ',
      };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T08:00:00.000Z');
    });
  });

  // =========================================================================
  // 3. Calendar & Leap Year Boundaries
  // =========================================================================
  describe('Calendar & Leap Year Boundaries', () => {
    it('should roll over correctly across 30-day month boundary (Sept 30 to Oct 01)', () => {
      const current = '2026-09-30T08:00:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-10-01T08:00:00.000Z');
    });

    it('should roll over correctly across 31-day month boundary (Aug 31 to Sept 01)', () => {
      const current = '2026-08-31T12:00:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-01T12:00:00.000Z');
    });

    it('should roll over correctly across year boundary (Dec 31 to Jan 01)', () => {
      const current = '2026-12-31T23:30:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2027-01-01T23:30:00.000Z');
    });

    it('should roll over correctly in a leap year (Feb 28, 2028 to Feb 29, 2028)', () => {
      const current = '2028-02-28T10:00:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2028-02-29T10:00:00.000Z');
    });

    it('should roll over correctly from leap day to March 1st (Feb 29, 2028 to March 01, 2028)', () => {
      const current = '2028-02-29T10:00:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2028-03-01T10:00:00.000Z');
    });

    it('should roll over correctly in a non-leap year (Feb 28, 2027 to March 01, 2027)', () => {
      const current = '2027-02-28T10:00:00.000Z';
      const rule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2027-03-01T10:00:00.000Z');
    });
  });

  // =========================================================================
  // 4. Non-Daily and Non-Recurring Schedules
  // =========================================================================
  describe('Non-Daily and Non-Recurring Schedules', () => {
    it('should return isCompleted true and null nextRunAt for type none', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule: RecurrenceRule = { type: 'none' };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('should return isCompleted true for unsupported recurrence types', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule = { type: 'weekly' } as unknown as RecurrenceRule;
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('should return isCompleted true if rule is undefined or null', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const res = calculateNextRun(current, null as unknown as RecurrenceRule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });
  });

  // =========================================================================
  // 5. Malformed and Invalid Inputs
  // =========================================================================
  describe('Malformed and Invalid Inputs', () => {
    it('should safely return isCompleted true when currentScheduledAt is invalid date string', () => {
      const res = calculateNextRun('invalid-date-string', { type: 'daily' });
      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('should safely return isCompleted true when currentScheduledAt is empty string', () => {
      const res = calculateNextRun('', { type: 'daily' });
      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('should safely return isCompleted true when endDate is malformed string', () => {
      const res = calculateNextRun('2026-09-15T08:00:00.000Z', {
        type: 'daily',
        hasEndDate: true,
        endDate: 'not-a-valid-date',
      });
      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('should treat empty endDate as indefinite if hasEndDate is true but endDate is empty', () => {
      const res = calculateNextRun('2026-09-15T08:00:00.000Z', {
        type: 'daily',
        hasEndDate: true,
        endDate: '',
      });
      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T08:00:00.000Z');
    });
  });

  // =========================================================================
  // 6. Recurrence Lifecycle State Transitions
  // =========================================================================
  describe('Recurrence Lifecycle State Transitions', () => {
    it('should transition single-shot schedule to "sent" on dispatch success', () => {
      const res = transitionScheduleLifecycle({
        currentStatus: 'pending',
        scheduledAt: '2026-09-15T08:00:00.000Z',
        recurrence: { type: 'none' },
        dispatchSuccess: true,
      });

      expect(res.nextStatus).toBe('sent');
      expect(res.nextScheduledAt).toBeNull();
      expect(res.isCompleted).toBe(true);
      expect(res.shouldRearmAlarm).toBe(false);
    });

    it('should transition single-shot schedule to "failed" on dispatch failure', () => {
      const res = transitionScheduleLifecycle({
        currentStatus: 'pending',
        scheduledAt: '2026-09-15T08:00:00.000Z',
        recurrence: { type: 'none' },
        dispatchSuccess: false,
      });

      expect(res.nextStatus).toBe('failed');
      expect(res.nextScheduledAt).toBeNull();
      expect(res.isCompleted).toBe(true);
      expect(res.shouldRearmAlarm).toBe(false);
    });

    it('should remain "pending" and roll over nextScheduledAt for active daily schedule on success', () => {
      const res = transitionScheduleLifecycle({
        currentStatus: 'pending',
        scheduledAt: '2026-09-15T08:00:00.000Z',
        recurrence: { type: 'daily', hasEndDate: false },
        dispatchSuccess: true,
      });

      expect(res.nextStatus).toBe('pending');
      expect(res.nextScheduledAt).toBe('2026-09-16T08:00:00.000Z');
      expect(res.isCompleted).toBe(false);
      expect(res.shouldRearmAlarm).toBe(true);
    });

    it('should transition to "completed" when daily schedule reaches its end date on success', () => {
      const res = transitionScheduleLifecycle({
        currentStatus: 'pending',
        scheduledAt: '2026-09-20T08:00:00.000Z',
        recurrence: { type: 'daily', hasEndDate: true, endDate: '2026-09-20' },
        dispatchSuccess: true,
      });

      expect(res.nextStatus).toBe('completed');
      expect(res.nextScheduledAt).toBeNull();
      expect(res.isCompleted).toBe(true);
      expect(res.shouldRearmAlarm).toBe(false);
    });

    it('should transition daily schedule to "failed" on dispatch failure', () => {
      const res = transitionScheduleLifecycle({
        currentStatus: 'pending',
        scheduledAt: '2026-09-15T08:00:00.000Z',
        recurrence: { type: 'daily', hasEndDate: false },
        dispatchSuccess: false,
      });

      expect(res.nextStatus).toBe('failed');
      expect(res.nextScheduledAt).toBeNull();
      expect(res.isCompleted).toBe(true);
      expect(res.shouldRearmAlarm).toBe(false);
    });
  });

  // =========================================================================
  // 7. Remaining Occurrences Calculation
  // =========================================================================
  describe('calculateRemainingOccurrences', () => {
    it('should return null for indefinite daily schedule', () => {
      const count = calculateRemainingOccurrences('2026-09-15T08:00:00Z', {
        type: 'daily',
        hasEndDate: false,
      });
      expect(count).toBeNull();
    });

    it('should return 0 for non-recurring schedule', () => {
      const count = calculateRemainingOccurrences('2026-09-15T08:00:00Z', {
        type: 'none',
      });
      expect(count).toBe(0);
    });

    it('should return exact number of remaining runs for bounded schedule', () => {
      // Sept 15: remaining runs on 16, 17, 18, 19, 20 = 5 remaining occurrences
      const count = calculateRemainingOccurrences('2026-09-15T08:00:00Z', {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      });
      expect(count).toBe(5);
    });

    it('should return 0 when current schedule is already on the end date', () => {
      const count = calculateRemainingOccurrences('2026-09-20T08:00:00Z', {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      });
      expect(count).toBe(0);
    });

    it('should return 0 when end date is in the past', () => {
      const count = calculateRemainingOccurrences('2026-09-25T08:00:00Z', {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20',
      });
      expect(count).toBe(0);
    });
  });
});
