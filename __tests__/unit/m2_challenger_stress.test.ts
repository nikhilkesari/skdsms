/**
 * Empirical Challenge Suite: Milestone 2 Recurrence & Concurrency
 * Path: __tests__/unit/m2_challenger_stress.test.ts
 *
 * Authored by: teamwork_preview_challenger_m2_2
 * Scope:
 * 1. Recurrence across leap day (Feb 28 -> Feb 29 in leap year 2028, Feb 28 -> Mar 1 in non-leap year 2027, century rules)
 * 2. Recurrence across year boundaries (Dec 31 -> Jan 1 across various times and leap/non-leap years)
 * 3. Recurrence across Daylight Saving Time / timezone offsets (+05:30, -04:00, US DST transitions, offset end-dates)
 * 4. Recurrence end date millisecond cutoffs (exact 23:59:59.999 boundary, 1ms before, 1ms after, ISO timestamps)
 * 5. Repository concurrency stress test (50 concurrent creates, 50 concurrent with async I/O jitter, 50 mixed CUD, 50 concurrent same-item updates, error recovery)
 */

import {
  calculateNextRun,
  transitionScheduleLifecycle,
  calculateRemainingOccurrences,
} from '../../src/services/scheduler/recurrence';
import {
  AsyncStorageScheduleRepository,
  StorageAdapter,
} from '../../src/repositories/AsyncStorageScheduleRepository';
import { SCHEDULE_STORAGE_KEY } from '../../src/repositories/ScheduleRepository';
import type { RecurrenceRule, ScheduledMessage } from '../../src/types/schedule';

// Helper: In-memory storage adapter with optional configurable async latency
const createMockStorageWithDelay = (delayMsMin = 0, delayMsMax = 0): StorageAdapter & { store: Map<string, string> } => {
  const store = new Map<string, string>();

  const sleep = async () => {
    if (delayMsMax > 0) {
      const delay = Math.floor(Math.random() * (delayMsMax - delayMsMin + 1)) + delayMsMin;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  };

  return {
    store,
    async getItem(key: string): Promise<string | null> {
      await sleep();
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      await sleep();
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      await sleep();
      store.delete(key);
    },
    async clear(): Promise<void> {
      await sleep();
      store.clear();
    },
  };
};

describe('M2 Recurrence & Concurrency Empirical Challenge Suite', () => {

  // =========================================================================
  // Challenge 1: Recurrence Across Leap Day & Calendar Boundaries
  // =========================================================================
  describe('Challenge 1: Leap Day & Calendar Rollover Stress', () => {
    const dailyRule: RecurrenceRule = { type: 'daily', hasEndDate: false };

    it('advances from Feb 28 to Feb 29 in leap year 2028 preserving exact timestamp', () => {
      const current = '2028-02-28T09:15:30.456Z';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2028-02-29T09:15:30.456Z');
    });

    it('advances from Feb 29 to March 1 in leap year 2028 preserving exact timestamp', () => {
      const current = '2028-02-29T23:59:59.999Z';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2028-03-01T23:59:59.999Z');
    });

    it('advances from Feb 28 directly to March 1 in non-leap year 2027', () => {
      const current = '2027-02-28T14:00:00.000Z';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2027-03-01T14:00:00.000Z');
    });

    it('handles century leap year 2000 (divisible by 400)', () => {
      const feb28 = '2000-02-28T12:00:00.000Z';
      const toFeb29 = calculateNextRun(feb28, dailyRule);
      expect(toFeb29.isCompleted).toBe(false);
      expect(toFeb29.nextRunAt).toBe('2000-02-29T12:00:00.000Z');

      const toMar01 = calculateNextRun(toFeb29.nextRunAt!, dailyRule);
      expect(toMar01.isCompleted).toBe(false);
      expect(toMar01.nextRunAt).toBe('2000-03-01T12:00:00.000Z');
    });

    it('handles century non-leap year 2100 (divisible by 100 but not 400)', () => {
      const feb28 = '2100-02-28T12:00:00.000Z';
      const toMar01 = calculateNextRun(feb28, dailyRule);
      expect(toMar01.isCompleted).toBe(false);
      expect(toMar01.nextRunAt).toBe('2100-03-01T12:00:00.000Z');
    });

    it('traverses continuously through a 10-day span across Feb 29, 2028 without drift', () => {
      let current = '2028-02-25T18:30:45.123Z';
      const expectedDates = [
        '2028-02-26T18:30:45.123Z',
        '2028-02-27T18:30:45.123Z',
        '2028-02-28T18:30:45.123Z',
        '2028-02-29T18:30:45.123Z', // Leap day
        '2028-03-01T18:30:45.123Z',
        '2028-03-02T18:30:45.123Z',
        '2028-03-03T18:30:45.123Z',
        '2028-03-04T18:30:45.123Z',
        '2028-03-05T18:30:45.123Z',
        '2028-03-06T18:30:45.123Z',
      ];

      for (let i = 0; i < expectedDates.length; i++) {
        const next = calculateNextRun(current, dailyRule);
        expect(next.isCompleted).toBe(false);
        expect(next.nextRunAt).toBe(expectedDates[i]);
        current = next.nextRunAt!;
      }
    });
  });

  // =========================================================================
  // Challenge 2: Year Boundaries (Dec 31 -> Jan 1)
  // =========================================================================
  describe('Challenge 2: Year Boundary Rollover Stress', () => {
    const dailyRule: RecurrenceRule = { type: 'daily', hasEndDate: false };

    it('advances across year boundary at 23:59:59.999Z', () => {
      const current = '2026-12-31T23:59:59.999Z';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2027-01-01T23:59:59.999Z');
    });

    it('advances across year boundary into a leap year (2027 -> 2028)', () => {
      const current = '2027-12-31T12:00:00.000Z';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2028-01-01T12:00:00.000Z');
    });

    it('advances across year boundary out of a leap year (2028 -> 2029)', () => {
      const current = '2028-12-31T00:00:00.000Z';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2029-01-01T00:00:00.000Z');
    });

    it('advances across Y2K millennium boundary (1999 -> 2000)', () => {
      const current = '1999-12-31T23:59:59.999Z';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2000-01-01T23:59:59.999Z');
    });
  });

  // =========================================================================
  // Challenge 3: Daylight Saving Time & Timezone Offsets
  // =========================================================================
  describe('Challenge 3: Timezone Offsets & Daylight Saving Time', () => {
    const dailyRule: RecurrenceRule = { type: 'daily', hasEndDate: false };

    it('accepts ISO timestamp with positive timezone offset (+05:30) and advances exactly 24h in UTC', () => {
      // 08:30:00 IST (+05:30) on 2026-06-15 is 03:00:00Z UTC
      const current = '2026-06-15T08:30:00+05:30';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2026-06-16T03:00:00.000Z');
    });

    it('accepts ISO timestamp with negative timezone offset (-04:00) and advances exactly 24h in UTC', () => {
      // 22:15:00 EDT (-04:00) on 2026-07-20 is 02:15:00Z UTC on 2026-07-21
      const current = '2026-07-20T22:15:00-04:00';
      const result = calculateNextRun(current, dailyRule);

      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2026-07-22T02:15:00.000Z');
    });

    it('advances consistently across US Daylight Saving Time spring forward transition (March 8, 2026)', () => {
      // US Eastern springs forward at 02:00 on 2026-03-08.
      // 01:30:00 EST (UTC-5) is 06:30:00Z.
      const current = '2026-03-07T06:30:00.000Z';
      const result1 = calculateNextRun(current, dailyRule);
      expect(result1.nextRunAt).toBe('2026-03-08T06:30:00.000Z');

      const result2 = calculateNextRun(result1.nextRunAt!, dailyRule);
      expect(result2.nextRunAt).toBe('2026-03-09T06:30:00.000Z');
    });

    it('evaluates end date containing a timezone offset correctly against UTC scheduled times', () => {
      // End date specified with +05:30 offset: 2026-09-20T23:59:59.999+05:30
      // In UTC, this corresponds to 2026-09-20T18:29:59.999Z.
      const ruleWithTzEnd: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-20T23:59:59.999+05:30',
      };

      // Case 1: Run at 18:29:59.999Z on 2026-09-20 matches boundary exactly -> valid
      const cur1 = '2026-09-19T18:29:59.999Z';
      const res1 = calculateNextRun(cur1, ruleWithTzEnd);
      expect(res1.isCompleted).toBe(false);
      expect(res1.nextRunAt).toBe('2026-09-20T18:29:59.999Z');

      // Case 2: Run at 18:30:00.000Z on 2026-09-20 is 1ms past boundary in UTC -> completed
      const cur2 = '2026-09-19T18:30:00.000Z';
      const res2 = calculateNextRun(cur2, ruleWithTzEnd);
      expect(res2.isCompleted).toBe(true);
      expect(res2.nextRunAt).toBeNull();
    });
  });

  // =========================================================================
  // Challenge 4: End Date Millisecond Cutoffs (23:59:59.999 Boundary)
  // =========================================================================
  describe('Challenge 4: End Date Millisecond Cutoff Stress', () => {
    const ruleDateOnly: RecurrenceRule = {
      type: 'daily',
      hasEndDate: true,
      endDate: '2026-10-15', // Defaults to 2026-10-15T23:59:59.999Z
    };

    it('allows next run at exactly 23:59:59.999Z on the end date', () => {
      const current = '2026-10-14T23:59:59.999Z';
      const res = calculateNextRun(current, ruleDateOnly);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-10-15T23:59:59.999Z');
    });

    it('allows next run 1 millisecond before the cutoff (23:59:59.998Z)', () => {
      const current = '2026-10-14T23:59:59.998Z';
      const res = calculateNextRun(current, ruleDateOnly);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-10-15T23:59:59.998Z');
    });

    it('marks completed when next run is at 00:00:00.000Z on day after end date (1ms past cutoff)', () => {
      // 2026-10-15T00:00:00.000Z + 24h = 2026-10-16T00:00:00.000Z
      // Cutoff is 2026-10-15T23:59:59.999Z. Next run is 1ms past cutoff.
      const current = '2026-10-15T00:00:00.000Z';
      const res = calculateNextRun(current, ruleDateOnly);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('marks completed when scheduled at 23:59:59.999Z on the end date', () => {
      const current = '2026-10-15T23:59:59.999Z';
      const res = calculateNextRun(current, ruleDateOnly);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('handles explicit ISO end timestamp with fractional seconds (e.g. 14:00:00.500Z)', () => {
      const ruleCustomIso: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-10-15T14:00:00.500Z',
      };

      // 1ms before cutoff
      const resBefore = calculateNextRun('2026-10-14T14:00:00.499Z', ruleCustomIso);
      expect(resBefore.isCompleted).toBe(false);
      expect(resBefore.nextRunAt).toBe('2026-10-15T14:00:00.499Z');

      // Exact millisecond match
      const resExact = calculateNextRun('2026-10-14T14:00:00.500Z', ruleCustomIso);
      expect(resExact.isCompleted).toBe(false);
      expect(resExact.nextRunAt).toBe('2026-10-15T14:00:00.500Z');

      // 1ms after cutoff
      const resAfter = calculateNextRun('2026-10-14T14:00:00.501Z', ruleCustomIso);
      expect(resAfter.isCompleted).toBe(true);
      expect(resAfter.nextRunAt).toBeNull();
    });

    it('calculates remaining occurrences accurately at exact millisecond boundaries', () => {
      // Current is 2026-10-13T23:59:59.999Z, endDate is 2026-10-15
      // Remaining: 2026-10-14T23:59:59.999Z (1) and 2026-10-15T23:59:59.999Z (2) -> exactly 2
      const count = calculateRemainingOccurrences('2026-10-13T23:59:59.999Z', ruleDateOnly);
      expect(count).toBe(2);

      // On 2026-10-14T23:59:59.999Z -> remaining is 1 (the final day)
      const countFinalDay = calculateRemainingOccurrences('2026-10-14T23:59:59.999Z', ruleDateOnly);
      expect(countFinalDay).toBe(1);

      // On 2026-10-15T23:59:59.999Z -> 0 remaining
      const countAtCutoff = calculateRemainingOccurrences('2026-10-15T23:59:59.999Z', ruleDateOnly);
      expect(countAtCutoff).toBe(0);
    });

    it('transitions schedule lifecycle correctly across boundary cutoffs', () => {
      // Dispatch success on penultimate day: rolls over to pending, shouldRearmAlarm true
      const penTransition = transitionScheduleLifecycle({
        currentStatus: 'pending',
        scheduledAt: '2026-10-14T23:59:59.999Z',
        recurrence: ruleDateOnly,
        dispatchSuccess: true,
      });
      expect(penTransition.nextStatus).toBe('pending');
      expect(penTransition.nextScheduledAt).toBe('2026-10-15T23:59:59.999Z');
      expect(penTransition.isCompleted).toBe(false);
      expect(penTransition.shouldRearmAlarm).toBe(true);

      // Dispatch success on final day: transitions to completed, shouldRearmAlarm false
      const finalTransition = transitionScheduleLifecycle({
        currentStatus: 'pending',
        scheduledAt: '2026-10-15T23:59:59.999Z',
        recurrence: ruleDateOnly,
        dispatchSuccess: true,
      });
      expect(finalTransition.nextStatus).toBe('completed');
      expect(finalTransition.nextScheduledAt).toBeNull();
      expect(finalTransition.isCompleted).toBe(true);
      expect(finalTransition.shouldRearmAlarm).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 5: Repository Concurrency Stress Test (50 Operations)
  // =========================================================================
  describe('Challenge 5: AsyncStorage Repository Concurrency (50 Concurrent Operations)', () => {
    let mockStorage: ReturnType<typeof createMockStorageWithDelay>;
    let repo: AsyncStorageScheduleRepository;

    beforeEach(async () => {
      mockStorage = createMockStorageWithDelay();
      repo = new AsyncStorageScheduleRepository(mockStorage);
      await repo.clearAll();
    });

    it('executes 50 concurrent create operations with zero lost records and zero corruption', async () => {
      const CONCURRENCY = 50;

      const creationPromises = Array.from({ length: CONCURRENCY }, (_, i) =>
        repo.create({
          recipient: {
            name: `User ${String(i).padStart(2, '0')}`,
            phoneNumber: `+1555000${String(i).padStart(4, '0')}`,
          },
          messageText: `Concurrent test message payload ${i}`,
          scheduledAt: `2026-11-01T${String(10 + (i % 10)).padStart(2, '0')}:00:00.000Z`,
          recurrence: { type: 'daily' },
        })
      );

      const results = await Promise.all(creationPromises);

      // 1. Verify all 50 operations returned valid ScheduledMessage objects
      expect(results.length).toBe(CONCURRENCY);
      results.forEach((item, index) => {
        expect(item.id).toBeDefined();
        expect(item.recipient.name).toBe(`User ${String(index).padStart(2, '0')}`);
        expect(item.status).toBe('pending');
        expect(item.alarmRequestCode).toBeGreaterThanOrEqual(0);
      });

      // 2. Verify all 50 IDs are strictly unique
      const ids = new Set(results.map(r => r.id));
      expect(ids.size).toBe(CONCURRENCY);

      // 3. Verify repository getAll() returns all 50 items
      const all = await repo.getAll();
      expect(all.length).toBe(CONCURRENCY);

      // 4. Verify underlying storage string is strictly valid JSON with 50 items
      const raw = mockStorage.store.get(SCHEDULE_STORAGE_KEY);
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(CONCURRENCY);
    });

    it('executes 50 concurrent creates under simulated async disk I/O latency (1-10ms jitter)', async () => {
      // This test verifies that the in-process mutex lock genuinely serializes async operations.
      // Without the mutex, interleaved reads and writes with async delay would cause massive lost updates.
      const jitterStorage = createMockStorageWithDelay(1, 10);
      const jitterRepo = new AsyncStorageScheduleRepository(jitterStorage);
      const CONCURRENCY = 50;

      const creationPromises = Array.from({ length: CONCURRENCY }, (_, i) =>
        jitterRepo.create({
          recipient: {
            name: `Jitter User ${i}`,
            phoneNumber: `+1555999${String(i).padStart(4, '0')}`,
          },
          messageText: `Jitter payload ${i}`,
          scheduledAt: '2026-11-10T15:00:00.000Z',
        })
      );

      const results = await Promise.all(creationPromises);
      expect(results.length).toBe(CONCURRENCY);

      const all = await jitterRepo.getAll();
      expect(all.length).toBe(CONCURRENCY);

      const uniqueIds = new Set(all.map(s => s.id));
      expect(uniqueIds.size).toBe(CONCURRENCY);
    });

    it('executes 50 concurrent mixed CUD operations (20 creates, 20 updates, 10 deletes) cleanly', async () => {
      // 1. Seed repo with 20 initial schedules
      const seedItems: ScheduledMessage[] = [];
      for (let i = 0; i < 20; i++) {
        const item = await repo.create({
          recipient: { name: `Initial ${i}`, phoneNumber: `+1555111${String(i).padStart(4, '0')}` },
          messageText: `Initial text ${i}`,
          scheduledAt: `2026-12-01T${String(10 + (i % 12)).padStart(2, '0')}:00:00.000Z`,
        });
        seedItems.push(item);
      }

      expect((await repo.getAll()).length).toBe(20);

      // 2. Prepare 50 concurrent operations:
      // - 20 creates of new schedules
      // - 20 updates to existing schedules (items 0..19)
      // - 10 deletes of existing schedules (items 0..9)
      const operations: Promise<any>[] = [];

      // 20 concurrent creates
      for (let i = 0; i < 20; i++) {
        operations.push(
          repo.create({
            recipient: { name: `New ${i}`, phoneNumber: `+1555222${String(i).padStart(4, '0')}` },
            messageText: `New parallel text ${i}`,
            scheduledAt: `2026-12-02T${String(10 + (i % 12)).padStart(2, '0')}:00:00.000Z`,
          })
        );
      }

      // 20 concurrent updates
      for (let i = 0; i < 20; i++) {
        operations.push(
          repo.update(seedItems[i].id, {
            messageText: `Modified text ${i}`,
            status: 'sent',
          })
        );
      }

      // 10 concurrent deletes (delete items 0..9)
      for (let i = 0; i < 10; i++) {
        operations.push(
          repo.delete(seedItems[i].id)
        );
      }

      expect(operations.length).toBe(50);

      // 3. Execute all 50 operations simultaneously
      const results = await Promise.all(operations);
      expect(results.length).toBe(50);

      // 4. Verify post-concurrency state:
      // Initial: 20
      // Created: +20
      // Deleted: -10
      // Expected total remaining: 30
      const remaining = await repo.getAll();
      expect(remaining.length).toBe(30);

      // Check deleted items (0..9) are gone
      for (let i = 0; i < 10; i++) {
        const found = await repo.getById(seedItems[i].id);
        expect(found).toBeNull();
      }

      // Check surviving updated items (10..19) reflect updates
      for (let i = 10; i < 20; i++) {
        const found = await repo.getById(seedItems[i].id);
        expect(found).not.toBeNull();
        expect(found!.messageText).toBe(`Modified text ${i}`);
        expect(found!.status).toBe('sent');
      }

      // Check all IDs in remaining are unique
      const remainingIds = new Set(remaining.map(s => s.id));
      expect(remainingIds.size).toBe(30);
    });

    it('executes 50 concurrent updates targeting the same schedule without lost state or race conditions', async () => {
      const schedule = await repo.create({
        recipient: { name: 'Target User', phoneNumber: '+15558880000' },
        messageText: 'Initial target text',
        scheduledAt: '2026-11-20T10:00:00.000Z',
      });

      const updatePromises = Array.from({ length: 50 }, (_, i) =>
        repo.update(schedule.id, {
          messageText: `Updated generation ${i}`,
        })
      );

      const results = await Promise.all(updatePromises);
      expect(results.length).toBe(50);

      // All returned results should have the target ID and updated timestamp
      results.forEach(res => {
        expect(res.id).toBe(schedule.id);
        expect(res.messageText.startsWith('Updated generation ')).toBe(true);
      });

      // Storage should still contain exactly 1 schedule with valid structure
      const all = await repo.getAll();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe(schedule.id);
      expect(all[0].messageText.startsWith('Updated generation ')).toBe(true);
    });

    it('recovers cleanly from transient storage rejection without deadlocking subsequent queued operations', async () => {
      let writeCount = 0;
      const faultStorage: StorageAdapter = {
        async getItem(key: string) {
          return mockStorage.store.get(key) || '[]';
        },
        async setItem(key: string, value: string) {
          writeCount++;
          if (writeCount === 2) {
            throw new Error('Transient I/O failure');
          }
          mockStorage.store.set(key, value);
        },
        async removeItem(key: string) {
          mockStorage.store.delete(key);
        },
      };

      const faultRepo = new AsyncStorageScheduleRepository(faultStorage);

      // Op 1: Normal create (writeCount = 1, succeeds)
      const op1 = faultRepo.create({
        recipient: { name: 'User 1', phoneNumber: '5551111' },
        messageText: 'Op 1',
        scheduledAt: '2026-12-01T10:00:00Z',
      });

      // Op 2: Fails during write (writeCount = 2, throws)
      const op2 = faultRepo.create({
        recipient: { name: 'User 2', phoneNumber: '5552222' },
        messageText: 'Op 2',
        scheduledAt: '2026-12-01T11:00:00Z',
      });

      // Op 3: Queued behind failing Op 2 (writeCount = 3, succeeds)
      const op3 = faultRepo.create({
        recipient: { name: 'User 3', phoneNumber: '5553333' },
        messageText: 'Op 3',
        scheduledAt: '2026-12-01T12:00:00Z',
      });

      const [res1, res2, res3] = await Promise.allSettled([op1, op2, op3]);

      expect(res1.status).toBe('fulfilled');
      expect(res2.status).toBe('rejected');
      expect(res3.status).toBe('fulfilled');

      // Verify lock queue is intact and subsequent operation succeeds
      const postRecovery = await faultRepo.getAll();
      expect(postRecovery.length).toBe(2);
      expect(postRecovery.map(s => s.messageText)).toEqual(['Op 1', 'Op 3']);
    });
  });
});
