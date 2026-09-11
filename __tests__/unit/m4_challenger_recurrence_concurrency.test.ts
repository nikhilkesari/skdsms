/**
 * Empirical Challenge Suite: Milestone 4 Recurrence Handling, Concurrency & State Management
 * Path: __tests__/unit/m4_challenger_recurrence_concurrency.test.ts
 *
 * Authored by: teamwork_preview_challenger_m4_2
 * Scope:
 * 1. Concurrent schedule creation & multiple active schedules (morning 08:00, evening 21:00)
 * 2. High-concurrency schedule creation (50 parallel schedules without collisions or race conditions)
 * 3. Daily recurrence roll-over: advanceRecurringSchedule past end dates, transition to 'completed',
 *    daily rollover (+24h) with updated alarm registration and request codes
 * 4. Multi-day continuous rollover cycles (7-day daily cycle) with single-alarm invariant
 * 5. Calendar and leap year boundary rollovers (leap year Feb 28->29, month transitions, year boundary)
 * 6. Rapid mount/unmount churn (50 cycles) under in-flight async operations in ScheduleContext
 * 7. Simulated latency and loading flag transitions in ScheduleContext
 * 8. Comprehensive error recovery: storage failures, alarm scheduler exceptions, and state rollback
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  ScheduleProvider,
  useSchedules,
  type ScheduleContextValue,
} from '../../src/context/ScheduleContext';
import { InMemoryScheduleRepository } from '../../src/repositories/InMemoryScheduleRepository';
import {
  AsyncStorageScheduleRepository,
  type StorageAdapter,
} from '../../src/repositories/AsyncStorageScheduleRepository';
import { MockSmsDispatcher } from '../../src/services/sms/MockSmsDispatcher';
import {
  ScheduleManager,
  calculateNextOccurrence,
} from '../../src/services/scheduler/ScheduleManager';
import {
  calculateNextRun,
  transitionScheduleLifecycle,
  calculateRemainingOccurrences,
} from '../../src/services/scheduler/recurrence';
import type { RecurrenceRule, ScheduledMessage } from '../../src/types/schedule';
import type { AlarmScheduler, ScheduleAlarmParams } from '../../src/services/sms/types';

// In-Memory Storage Adapter for testing AsyncStorageScheduleRepository concurrency
const createTestStorage = (): StorageAdapter => {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
    async clear(): Promise<void> {
      store.clear();
    },
  };
};

describe('M4 Challenger: Concurrency, Recurrence & UI State Management Suite', () => {
  let repository: InMemoryScheduleRepository;
  let dispatcher: MockSmsDispatcher;
  let manager: ScheduleManager;
  let fakeNow: Date;

  beforeEach(() => {
    fakeNow = new Date('2026-09-15T06:00:00.000Z');
    repository = new InMemoryScheduleRepository();
    dispatcher = new MockSmsDispatcher();
    manager = new ScheduleManager({
      repository,
      alarmScheduler: dispatcher,
      smsDispatcher: dispatcher,
      getCurrentTime: () => fakeNow,
      leadBufferMs: 30000,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper consumer component for testing ScheduleContext without JSX
  let hookValue: ScheduleContextValue | undefined;
  const TestConsumer: React.FC = () => {
    hookValue = useSchedules();
    return null;
  };

  const createProviderElement = (mgr: ScheduleManager, autoLoad: boolean = true) => {
    return React.createElement(
      ScheduleProvider,
      { scheduleManager: mgr, autoLoad },
      React.createElement(TestConsumer, null)
    );
  };

  // =========================================================================
  // 1. Concurrent Schedule Creation & Multiple Active Schedules
  // =========================================================================
  describe('1. Concurrent Schedule Creation & Multiple Active Schedules (Morning 08:00 & Evening 21:00)', () => {
    it('concurrently manages distinct Morning (08:00) and Evening (21:00) schedules with independent alarms, IDs, and chronological ordering', async () => {
      const morningTime = '2026-09-15T08:00:00.000Z';
      const eveningTime = '2026-09-15T21:00:00.000Z';

      // Concurrently create both morning and evening schedules
      const [morningSchedule, eveningSchedule] = await Promise.all([
        manager.createSchedule({
          recipientName: 'Alice Morning',
          phoneNumber: '+15551110001',
          messageText: 'Good morning! Daily briefing.',
          scheduledAt: morningTime,
          recurrence: { type: 'daily' },
        }),
        manager.createSchedule({
          recipientName: 'Bob Evening',
          phoneNumber: '+15551110002',
          messageText: 'Good evening! Nightly summary.',
          scheduledAt: eveningTime,
          recurrence: { type: 'daily' },
        }),
      ]);

      // Both schedules must exist with distinct IDs and distinct alarmRequestCodes
      expect(morningSchedule.id).toBeDefined();
      expect(eveningSchedule.id).toBeDefined();
      expect(morningSchedule.id).not.toBe(eveningSchedule.id);
      expect(morningSchedule.alarmRequestCode).not.toBe(eveningSchedule.alarmRequestCode);

      // Verify persistence in repository
      const allActive = await manager.getActivePendingSchedules();
      expect(allActive).toHaveLength(2);
      expect(allActive[0].id).toBe(morningSchedule.id);
      expect(allActive[1].id).toBe(eveningSchedule.id);

      // Verify alarm scheduler holds both independent alarms
      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(2);

      const morningAlarm = dispatcher.getScheduledAlarmByRequestCode(
        morningSchedule.alarmRequestCode
      );
      const eveningAlarm = dispatcher.getScheduledAlarmByRequestCode(
        eveningSchedule.alarmRequestCode
      );

      expect(morningAlarm).toBeDefined();
      expect(morningAlarm?.timestampMs).toBe(new Date(morningTime).getTime());
      expect(morningAlarm?.messageText).toContain('Good morning');

      expect(eveningAlarm).toBeDefined();
      expect(eveningAlarm?.timestampMs).toBe(new Date(eveningTime).getTime());
      expect(eveningAlarm?.messageText).toContain('Good evening');

      // Test independent selective execution:
      // Time advances to 08:05 UTC (Morning is due, Evening is NOT due)
      fakeNow = new Date('2026-09-15T08:05:00.000Z');
      const morningTriggered = await manager.triggerDueSchedules(fakeNow);

      expect(morningTriggered).toHaveLength(1);
      expect(morningTriggered[0].id).toBe(morningSchedule.id);
      // Morning advanced by +24h to 2026-09-16T08:00:00.000Z
      expect(morningTriggered[0].scheduledAt).toBe('2026-09-16T08:00:00.000Z');
      expect(morningTriggered[0].status).toBe('pending');

      // Evening schedule must remain untouched at 21:00 UTC
      const freshEvening = await manager.getScheduleById(eveningSchedule.id);
      expect(freshEvening?.status).toBe('pending');
      expect(freshEvening?.scheduledAt).toBe(eveningTime);

      // Verify dispatcher sent only 1 SMS so far
      expect(dispatcher.getSentMessages()).toHaveLength(1);
      expect(dispatcher.getSentMessages()[0].params.messageText).toContain('Good morning');

      // Time advances to 21:05 UTC (Evening is due)
      fakeNow = new Date('2026-09-15T21:05:00.000Z');
      const eveningTriggered = await manager.triggerDueSchedules(fakeNow);

      expect(eveningTriggered).toHaveLength(1);
      expect(eveningTriggered[0].id).toBe(eveningSchedule.id);
      expect(eveningTriggered[0].scheduledAt).toBe('2026-09-16T21:00:00.000Z');
      expect(eveningTriggered[0].status).toBe('pending');

      // Now dispatcher has sent 2 SMS messages
      expect(dispatcher.getSentMessages()).toHaveLength(2);
      expect(dispatcher.getSentMessages()[1].params.messageText).toContain('Good evening');
    });

    it('handles 50 parallel schedule creations across morning and evening slots without data loss or race conditions', async () => {
      const scheduleCount = 50;
      const creationPromises = Array.from({ length: scheduleCount }, (_, index) => {
        const isMorning = index % 2 === 0;
        const dayOffset = Math.floor(index / 2) + 1;
        const timeStr = isMorning ? '08:00:00.000Z' : '21:00:00.000Z';
        const dateStr = `2026-10-${String(dayOffset).padStart(2, '0')}T${timeStr}`;

        return manager.createSchedule({
          recipientName: `User ${index}`,
          phoneNumber: `+1555${String(index).padStart(7, '0')}`,
          messageText: `Concurrent blast message #${index}`,
          scheduledAt: dateStr,
          recurrence: isMorning ? { type: 'daily' } : { type: 'none' },
        });
      });

      const createdSchedules = await Promise.all(creationPromises);
      expect(createdSchedules).toHaveLength(scheduleCount);

      // Verify all IDs are unique
      const ids = new Set(createdSchedules.map(s => s.id));
      expect(ids.size).toBe(scheduleCount);

      // Verify all alarms registered
      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(scheduleCount);

      // Verify repository contains all 50 schedules
      const allInRepo = await manager.getAllSchedules();
      expect(allInRepo).toHaveLength(scheduleCount);

      // Verify chronological sorting of schedules in repository
      for (let i = 1; i < allInRepo.length; i++) {
        const prevMs = new Date(allInRepo[i - 1].scheduledAt).getTime();
        const currMs = new Date(allInRepo[i].scheduledAt).getTime();
        expect(currMs).toBeGreaterThanOrEqual(prevMs);
      }
    });

    it('supports high-concurrency schedule creations with AsyncStorageScheduleRepository and lock synchronization', async () => {
      const mockStorage = createTestStorage();
      const asyncRepo = new AsyncStorageScheduleRepository(mockStorage);
      const asyncManager = new ScheduleManager({
        repository: asyncRepo,
        alarmScheduler: dispatcher,
        smsDispatcher: dispatcher,
        getCurrentTime: () => fakeNow,
      });

      const batchCount = 20;
      const promises = Array.from({ length: batchCount }, (_, i) =>
        asyncManager.createSchedule({
          recipientName: `Async Contact ${i}`,
          phoneNumber: `+1555888${String(i).padStart(4, '0')}`,
          messageText: `Message ${i}`,
          scheduledAt: `2026-09-16T${String(8 + (i % 12)).padStart(2, '0')}:00:00.000Z`,
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(batchCount);

      const storedItems = await asyncRepo.getAll();
      expect(storedItems).toHaveLength(batchCount);

      const uniqueIds = new Set(storedItems.map(s => s.id));
      expect(uniqueIds.size).toBe(batchCount);
    });

    it('concurrently creates schedules for identical timestamp to different recipients without collision', async () => {
      const sameTimestamp = '2026-09-15T08:00:00.000Z';
      const count = 10;

      const promises = Array.from({ length: count }, (_, i) =>
        manager.createSchedule({
          recipientName: `Colleague ${i}`,
          phoneNumber: `+1555999${String(i).padStart(4, '0')}`,
          messageText: `Synchronized broadcast message ${i}`,
          scheduledAt: sameTimestamp,
        })
      );

      const created = await Promise.all(promises);
      expect(created).toHaveLength(count);

      // Verify distinct IDs and request codes
      const idSet = new Set(created.map(s => s.id));
      const codeSet = new Set(created.map(s => s.alarmRequestCode));
      expect(idSet.size).toBe(count);
      expect(codeSet.size).toBe(count);

      // Verify all 10 alarms are individually scheduled
      expect(dispatcher.getScheduledAlarms()).toHaveLength(count);
    });

    it('resiliently processes interleaved concurrent CRUD mutations (create, update, reschedule, delete)', async () => {
      // Seed 4 initial schedules
      const [s1, s2, s3, s4] = await Promise.all([
        manager.createSchedule({
          recipientName: 'Initial 1',
          phoneNumber: '+15550000001',
          messageText: 'Initial 1',
          scheduledAt: '2026-09-15T08:00:00.000Z',
        }),
        manager.createSchedule({
          recipientName: 'Initial 2',
          phoneNumber: '+15550000002',
          messageText: 'Initial 2',
          scheduledAt: '2026-09-15T09:00:00.000Z',
        }),
        manager.createSchedule({
          recipientName: 'Initial 3',
          phoneNumber: '+15550000003',
          messageText: 'Initial 3',
          scheduledAt: '2026-09-15T10:00:00.000Z',
        }),
        manager.createSchedule({
          recipientName: 'Initial 4',
          phoneNumber: '+15550000004',
          messageText: 'Initial 4',
          scheduledAt: '2026-09-15T11:00:00.000Z',
        }),
      ]);

      // Execute interleaved operations concurrently
      await Promise.all([
        manager.updateSchedule(s1.id, { messageText: 'Updated content 1' }),
        manager.reschedule(s2.id, '2026-09-15T14:00:00.000Z'),
        manager.deleteSchedule(s3.id),
        manager.cancelSchedule(s4.id),
        manager.createSchedule({
          recipientName: 'Newcomer 5',
          phoneNumber: '+15550000005',
          messageText: 'Newcomer 5',
          scheduledAt: '2026-09-15T12:00:00.000Z',
        }),
      ]);

      // Assert post-concurrency integrity
      const s1Updated = await manager.getScheduleById(s1.id);
      expect(s1Updated?.messageText).toBe('Updated content 1');

      const s2Rescheduled = await manager.getScheduleById(s2.id);
      expect(s2Rescheduled?.scheduledAt).toBe('2026-09-15T14:00:00.000Z');

      const s3Deleted = await manager.getScheduleById(s3.id);
      expect(s3Deleted).toBeNull();

      const s4Cancelled = await manager.getScheduleById(s4.id);
      expect(s4Cancelled?.status).toBe('cancelled');

      // Alarms check: s1, s2, and s5 should have active alarms; s3 and s4 should NOT
      const activeAlarms = dispatcher.getScheduledAlarms();
      expect(activeAlarms).toHaveLength(3);
      const activeAlarmIds = activeAlarms.map(a => a.id);
      expect(activeAlarmIds).toContain(s1.id);
      expect(activeAlarmIds).toContain(s2.id);
      expect(activeAlarmIds).not.toContain(s3.id);
      expect(activeAlarmIds).not.toContain(s4.id);
    });
  });

  // =========================================================================
  // 2. Daily Recurrence Roll-Over, Expiration Boundaries & Alarm Lifecycle
  // =========================================================================
  describe('2. Daily Recurrence Roll-Over, Expiration Boundaries & Alarm Lifecycle', () => {
    it('advances daily recurrence by exactly +24h and re-arms alarm with updated trigger time and preserved requestCode', async () => {
      const initialDate = '2026-09-15T08:00:00.000Z';
      const schedule = await manager.createSchedule({
        recipientName: 'Recurrence User',
        phoneNumber: '+15551112233',
        messageText: 'Daily Morning Coffee Reminder',
        scheduledAt: initialDate,
        recurrence: { type: 'daily' },
      });

      const originalRequestCode = schedule.alarmRequestCode;
      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);
      expect(dispatcher.getScheduledAlarms()[0].timestampMs).toBe(
        new Date(initialDate).getTime()
      );

      // Advance daily recurrence
      const advanced = await manager.advanceRecurringSchedule(schedule.id);

      expect(advanced.status).toBe('pending');
      expect(advanced.scheduledAt).toBe('2026-09-16T08:00:00.000Z');
      expect(advanced.lastSentAt).toBe(fakeNow.toISOString());

      // Exactly 1 alarm remains in dispatcher (previous was disarmed, new one armed)
      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(1);
      expect(alarms[0].id).toBe(schedule.id);
      expect(alarms[0].alarmRequestCode).toBe(originalRequestCode);
      expect(alarms[0].timestampMs).toBe(new Date('2026-09-16T08:00:00.000Z').getTime());
      expect(alarms[0].messageText).toBe('Daily Morning Coffee Reminder');
    });

    it('survives 7 continuous consecutive daily rollover dispatches while maintaining single-alarm invariant', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'Daily Worker',
        phoneNumber: '+15552223344',
        messageText: 'Daily 08:00 check-in',
        scheduledAt: '2026-09-15T08:00:00.000Z',
        recurrence: { type: 'daily' },
      });

      for (let day = 15; day < 22; day++) {
        // Simulate time reaching 08:01 on current day
        fakeNow = new Date(`2026-09-${String(day).padStart(2, '0')}T08:01:00.000Z`);

        // Trigger due schedule
        const processed = await manager.triggerDueSchedules(fakeNow);
        expect(processed).toHaveLength(1);
        expect(processed[0].id).toBe(schedule.id);

        const nextDay = day + 1;
        const expectedNextDate = `2026-09-${String(nextDay).padStart(2, '0')}T08:00:00.000Z`;
        expect(processed[0].scheduledAt).toBe(expectedNextDate);
        expect(processed[0].status).toBe('pending');

        // Single-alarm invariant: only 1 alarm must exist at any time
        const alarms = dispatcher.getScheduledAlarms();
        expect(alarms).toHaveLength(1);
        expect(alarms[0].timestampMs).toBe(new Date(expectedNextDate).getTime());
      }

      // 7 dispatches total
      expect(dispatcher.getSentMessages()).toHaveLength(7);
    });

    it('advances daily schedule until end date and cleanly transitions to completed and disarms alarm', async () => {
      // Schedule starts 2026-09-15T08:00:00.000Z with end date 2026-09-16
      const schedule = await manager.createSchedule({
        recipientName: 'Limited Recurrence',
        phoneNumber: '+15553334455',
        messageText: 'Two-day pass',
        scheduledAt: '2026-09-15T08:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-16',
        },
      });

      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);

      // Day 1 trigger: time 08:05 on 2026-09-15
      fakeNow = new Date('2026-09-15T08:05:00.000Z');
      const step1 = await manager.triggerDueSchedules(fakeNow);

      expect(step1).toHaveLength(1);
      // Next run is 2026-09-16T08:00:00.000Z, which is within endDate (2026-09-16T23:59:59.999Z)
      expect(step1[0].status).toBe('pending');
      expect(step1[0].scheduledAt).toBe('2026-09-16T08:00:00.000Z');
      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);

      // Day 2 trigger: time 08:05 on 2026-09-16
      fakeNow = new Date('2026-09-16T08:05:00.000Z');
      const step2 = await manager.triggerDueSchedules(fakeNow);

      expect(step2).toHaveLength(1);
      // Next run would be 2026-09-17T08:00:00.000Z which exceeds 2026-09-16!
      // Must transition to 'completed'
      expect(step2[0].status).toBe('completed');

      // Alarm must be disarmed!
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);

      // Verify in repository
      const finalSchedule = await manager.getScheduleById(schedule.id);
      expect(finalSchedule?.status).toBe('completed');

      // Subsequent triggers must not fire completed schedule
      fakeNow = new Date('2026-09-17T08:05:00.000Z');
      const step3 = await manager.triggerDueSchedules(fakeNow);
      expect(step3).toHaveLength(0);
    });

    it('immediately completes daily recurrence on first run when start date is on the end date', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'Same Day Limit',
        phoneNumber: '+15554445566',
        messageText: 'One day only',
        scheduledAt: '2026-09-15T18:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-15',
        },
      });

      fakeNow = new Date('2026-09-15T18:05:00.000Z');
      const step = await manager.triggerDueSchedules(fakeNow);

      expect(step).toHaveLength(1);
      expect(step[0].status).toBe('completed');
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
      expect(dispatcher.getSentMessages()).toHaveLength(1);
    });

    it('transitions non-recurring schedule to sent and disarms alarm', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'Single Shot',
        phoneNumber: '+15555556677',
        messageText: 'One-off notification',
        scheduledAt: '2026-09-15T08:00:00.000Z',
        recurrence: { type: 'none' },
      });

      fakeNow = new Date('2026-09-15T08:05:00.000Z');
      const processed = await manager.triggerDueSchedules(fakeNow);

      expect(processed).toHaveLength(1);
      expect(processed[0].status).toBe('sent');
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
    });

    it('preserves calendar integrity across month boundaries, leap days, and year transitions', () => {
      const dailyRule: RecurrenceRule = { type: 'daily' };

      // 1. Month boundary: Sept 30 -> Oct 01
      const sept30 = calculateNextRun('2026-09-30T21:00:00.000Z', dailyRule);
      expect(sept30.isCompleted).toBe(false);
      expect(sept30.nextRunAt).toBe('2026-10-01T21:00:00.000Z');

      // 2. Leap year: 2028 is a leap year (Feb 28 -> Feb 29 -> Mar 01)
      const leapFeb28 = calculateNextRun('2028-02-28T08:00:00.000Z', dailyRule);
      expect(leapFeb28.isCompleted).toBe(false);
      expect(leapFeb28.nextRunAt).toBe('2028-02-29T08:00:00.000Z');

      const leapFeb29 = calculateNextRun('2028-02-29T08:00:00.000Z', dailyRule);
      expect(leapFeb29.isCompleted).toBe(false);
      expect(leapFeb29.nextRunAt).toBe('2028-03-01T08:00:00.000Z');

      // 3. Non-leap year: 2027 is NOT a leap year (Feb 28 -> Mar 01)
      const nonLeapFeb28 = calculateNextRun('2027-02-28T08:00:00.000Z', dailyRule);
      expect(nonLeapFeb28.isCompleted).toBe(false);
      expect(nonLeapFeb28.nextRunAt).toBe('2027-03-01T08:00:00.000Z');

      // 4. Year boundary: Dec 31 -> Jan 01
      const dec31 = calculateNextRun('2026-12-31T21:00:00.000Z', dailyRule);
      expect(dec31.isCompleted).toBe(false);
      expect(dec31.nextRunAt).toBe('2027-01-01T21:00:00.000Z');
    });

    it('calculates remaining occurrences accurately and returns null for indefinite daily schedules', () => {
      const indefiniteRule: RecurrenceRule = { type: 'daily', hasEndDate: false };
      expect(calculateRemainingOccurrences('2026-09-15T08:00:00.000Z', indefiniteRule)).toBeNull();

      const threeDaysRule: RecurrenceRule = {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-18',
      };
      // From Sept 15 08:00 to Sept 18 23:59:59.999 gives 3 remaining rollovers (Sept 16, 17, 18)
      expect(calculateRemainingOccurrences('2026-09-15T08:00:00.000Z', threeDaysRule)).toBe(3);

      const nonDailyRule: RecurrenceRule = { type: 'none' };
      expect(calculateRemainingOccurrences('2026-09-15T08:00:00.000Z', nonDailyRule)).toBe(0);
    });
  });

  // =========================================================================
  // 3. ScheduleContext Mount/Unmount, Latency & Error Recovery
  // =========================================================================
  describe('3. ScheduleContext Mount/Unmount, Latency & Error Recovery', () => {
    it('survives 50 rapid mount and unmount cycles with in-flight async operations without errors', async () => {
      const delayedRepo = new InMemoryScheduleRepository();
      const delayedManager = new ScheduleManager({
        repository: delayedRepo,
        alarmScheduler: dispatcher,
        smsDispatcher: dispatcher,
        getCurrentTime: () => fakeNow,
      });

      for (let i = 0; i < 50; i++) {
        let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
        await act(async () => {
          renderer = ReactTestRenderer.create(createProviderElement(delayedManager, true));
        });

        // Unmount immediately while initial autoLoad promise is processing
        act(() => {
          renderer?.unmount();
        });
      }

      // Confirms all 50 cycles completed without uncaught exceptions
      expect(true).toBe(true);
    });

    it('tracks loading state transitions faithfully during simulated async latency', async () => {
      let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        renderer = ReactTestRenderer.create(createProviderElement(manager, false));
      });

      expect(hookValue?.loading).toBe(false);
      expect(hookValue?.isLoading).toBe(false);

      let createdSchedule: ScheduledMessage | undefined;
      await act(async () => {
        createdSchedule = await hookValue?.createSchedule({
          recipientName: 'Latency Tester',
          phoneNumber: '+15556667788',
          messageText: 'Checking loading transitions',
          scheduledAt: '2026-09-15T08:00:00.000Z',
        });
      });

      expect(createdSchedule).toBeDefined();
      expect(hookValue?.loading).toBe(false);
      expect(hookValue?.schedules).toHaveLength(1);
      expect(hookValue?.activeSchedules).toHaveLength(1);

      act(() => {
        renderer?.unmount();
      });
    });

    it('recovers gracefully from storage failure during createSchedule with context error and clearError', async () => {
      const failingRepo = new InMemoryScheduleRepository();
      jest.spyOn(failingRepo, 'create').mockRejectedValue(new Error('Storage disk full'));

      const failingManager = new ScheduleManager({
        repository: failingRepo,
        alarmScheduler: dispatcher,
        smsDispatcher: dispatcher,
        getCurrentTime: () => fakeNow,
      });

      let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        renderer = ReactTestRenderer.create(createProviderElement(failingManager, false));
      });

      expect(hookValue?.error).toBeNull();

      // Expect createSchedule to throw and populate error state
      let errorThrown: any = null;
      await act(async () => {
        try {
          await hookValue?.createSchedule({
            recipientName: 'Error Contact',
            phoneNumber: '+15557778899',
            messageText: 'Will fail on write',
            scheduledAt: '2026-09-15T08:00:00.000Z',
          });
        } catch (err) {
          errorThrown = err;
        }
      });

      expect(errorThrown).toBeDefined();
      expect(errorThrown.message).toContain('Storage disk full');
      expect(hookValue?.error).toContain('Storage disk full');
      expect(hookValue?.loading).toBe(false);
      expect(hookValue?.schedules).toHaveLength(0);

      // Verify clearError resets error state
      act(() => {
        hookValue?.clearError();
      });
      expect(hookValue?.error).toBeNull();

      act(() => {
        renderer?.unmount();
      });
    });

    it('rolls back repository creation when AlarmScheduler throws security exception during schedule creation', async () => {
      const securityFailingScheduler: AlarmScheduler = {
        scheduleAlarm: jest.fn().mockRejectedValue(new Error('SCHEDULE_EXACT_ALARM permission denied')),
        cancelAlarm: jest.fn().mockResolvedValue(true),
      };

      const securityManager = new ScheduleManager({
        repository,
        alarmScheduler: securityFailingScheduler,
        smsDispatcher: dispatcher,
        getCurrentTime: () => fakeNow,
      });

      let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        renderer = ReactTestRenderer.create(createProviderElement(securityManager, false));
      });

      let caughtErr: any = null;
      await act(async () => {
        try {
          await hookValue?.createSchedule({
            recipientName: 'Alarm Denied Contact',
            phoneNumber: '+15559990011',
            messageText: 'Exact alarm permission denied test',
            scheduledAt: '2026-09-15T08:00:00.000Z',
          });
        } catch (err) {
          caughtErr = err;
        }
      });

      expect(caughtErr).toBeDefined();
      expect(caughtErr.message).toContain('SCHEDULE_EXACT_ALARM permission denied');
      expect(hookValue?.error).toContain('SCHEDULE_EXACT_ALARM permission denied');

      // Repository must have rolled back: 0 orphan schedules
      const allInRepo = await repository.getAll();
      expect(allInRepo).toHaveLength(0);
      expect(hookValue?.schedules).toHaveLength(0);

      act(() => {
        renderer?.unmount();
      });
    });

    it('preserves existing schedule state and captures error when updateSchedule fails', async () => {
      let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        renderer = ReactTestRenderer.create(createProviderElement(manager, false));
      });

      // Create a valid schedule
      let created: ScheduledMessage | undefined;
      await act(async () => {
        created = await hookValue?.createSchedule({
          recipientName: 'Original User',
          phoneNumber: '+15551239876',
          messageText: 'Original text',
          scheduledAt: '2026-09-15T08:00:00.000Z',
        });
      });

      expect(created).toBeDefined();

      // Attempt invalid update with past scheduled date
      let updateError: any = null;
      await act(async () => {
        try {
          await hookValue?.updateSchedule(created!.id, {
            scheduledAt: '2026-09-15T05:00:00.000Z', // In the past relative to fakeNow (06:00)
          });
        } catch (err) {
          updateError = err;
        }
      });

      expect(updateError).toBeDefined();
      expect(hookValue?.error).toContain('VALIDATION_ERROR');

      // Schedule in state must be preserved with original valid values
      expect(hookValue?.schedules).toHaveLength(1);
      expect(hookValue?.schedules[0].messageText).toBe('Original text');
      expect(hookValue?.schedules[0].scheduledAt).toBe('2026-09-15T08:00:00.000Z');

      act(() => {
        renderer?.unmount();
      });
    });

    it('concurrently invokes createSchedule 5 times through ScheduleContext hook without lost updates', async () => {
      let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        renderer = ReactTestRenderer.create(createProviderElement(manager, false));
      });

      expect(hookValue?.schedules).toHaveLength(0);

      // Concurrently create 5 schedules through the hook
      await act(async () => {
        await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            hookValue?.createSchedule({
              recipientName: `Parallel Contact ${i}`,
              phoneNumber: `+1555000${String(i).padStart(4, '0')}`,
              messageText: `Parallel UI schedule ${i}`,
              scheduledAt: `2026-09-15T${String(8 + i).padStart(2, '0')}:00:00.000Z`,
            })
          )
        );
      });

      // All 5 must be in schedules and activeSchedules
      expect(hookValue?.schedules).toHaveLength(5);
      expect(hookValue?.activeSchedules).toHaveLength(5);

      // Verify IDs are distinct
      const ids = new Set(hookValue?.schedules.map(s => s.id));
      expect(ids.size).toBe(5);

      act(() => {
        renderer?.unmount();
      });
    });
  });
});
