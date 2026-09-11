/**
 * Empirical Challenge Suite: Milestone 3 Alarm Scheduling & Native Bridge Concurrency
 * Path: __tests__/unit/m3_challenger_alarm_stress.test.ts
 *
 * Authored by: teamwork_preview_challenger_m3_2
 * Scope:
 * 1. High-concurrency alarm scheduling (500 parallel alarms with distinct request codes)
 * 2. Interleaved concurrent additions and cancellations (stress-testing race conditions)
 * 3. Cancellation idempotency & resilience for non-existent, negative, zero, and previously cancelled alarms
 * 4. RequestCode boundary conditions (extremes, zero, negatives, collision replacement)
 * 5. Native bridge delegation, parameter fidelity, return type normalization, and error propagation under concurrency
 * 6. Memory stability and heap growth verification across multi-batch rapid churn
 */

import { NativeModules, Platform } from 'react-native';
import {
  MockSmsDispatcher,
  NativeSmsDispatcher,
  type ScheduleAlarmParams,
} from '../../src/services/sms';

describe('M3 Alarm & Concurrency Empirical Challenge Suite', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Concurrent Alarm Scheduling & Retrieval
  // =========================================================================
  describe('Concurrent Alarm Scheduling with Distinct Request Codes', () => {
    it('schedules 500 distinct alarms concurrently without race conditions or dropped records', async () => {
      const dispatcher = new MockSmsDispatcher();
      const count = 500;
      const baseTimestamp = 1750000000000;

      const alarmParamsList: ScheduleAlarmParams[] = Array.from(
        { length: count },
        (_, i) => ({
          id: `concurrent-alarm-uuid-${i}`,
          timestampMs: baseTimestamp + i * 60000,
          alarmRequestCode: 10000 + i,
          recipientName: `Recipient ${i}`,
          phoneNumber: `+1555000${String(i).padStart(4, '0')}`,
          messageText: `Scheduled message content #${i}`,
        })
      );

      // Execute all 500 scheduling promises in parallel
      const results = await Promise.all(
        alarmParamsList.map(params => dispatcher.scheduleAlarm(params))
      );

      // Verify all resolved successfully
      expect(results).toHaveLength(count);
      results.forEach((res, i) => {
        expect(res.success).toBe(true);
        expect(res.alarmRequestCode).toBe(10000 + i);
        expect(res.scheduledAtMs).toBe(baseTimestamp + i * 60000);
        expect(res.errorMessage).toBeNull();
      });

      // Verify store integrity
      const stored = dispatcher.getScheduledAlarms();
      expect(stored).toHaveLength(count);

      // Verify each individual record is uniquely retrievable by requestCode
      for (let i = 0; i < count; i++) {
        const retrieved = dispatcher.getScheduledAlarmByRequestCode(10000 + i);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(`concurrent-alarm-uuid-${i}`);
        expect(retrieved?.phoneNumber).toBe(
          `+1555000${String(i).padStart(4, '0')}`
        );
      }
    });

    it('handles duplicate alarmRequestCode by overwriting prior schedule (update semantics)', async () => {
      const dispatcher = new MockSmsDispatcher();
      const code = 4004;

      const initial: ScheduleAlarmParams = {
        id: 'initial-id',
        timestampMs: 1750000000000,
        alarmRequestCode: code,
        recipientName: 'Initial Recipient',
        phoneNumber: '+15551111111',
        messageText: 'Initial text',
      };

      const updated: ScheduleAlarmParams = {
        id: 'updated-id',
        timestampMs: 1750001000000,
        alarmRequestCode: code,
        recipientName: 'Updated Recipient',
        phoneNumber: '+15552222222',
        messageText: 'Updated text',
      };

      await dispatcher.scheduleAlarm(initial);
      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);

      await dispatcher.scheduleAlarm(updated);
      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);

      const current = dispatcher.getScheduledAlarmByRequestCode(code);
      expect(current?.id).toBe('updated-id');
      expect(current?.recipientName).toBe('Updated Recipient');
      expect(current?.timestampMs).toBe(1750001000000);
    });
  });

  // =========================================================================
  // 2. Cancellation Behavior for Non-Existent and Previously Cancelled Alarms
  // =========================================================================
  describe('Alarm Cancellation Idempotency & Edge Cases', () => {
    it('returns false when cancelling non-existent alarm codes without throwing errors', async () => {
      const dispatcher = new MockSmsDispatcher();

      // Test various non-existent codes: arbitrary, negative, zero, max int
      const nonExistentCodes = [99999, -1, 0, 2147483647, -2147483648];

      for (const code of nonExistentCodes) {
        const result = await dispatcher.cancelAlarm(code);
        expect(result).toBe(false);
      }

      // Ensure store remains unaffected
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
    });

    it('is strictly idempotent: first cancellation returns true, subsequent returns false', async () => {
      const dispatcher = new MockSmsDispatcher();
      const code = 5555;

      await dispatcher.scheduleAlarm({
        id: 'idempotent-alarm',
        timestampMs: 1750000000000,
        alarmRequestCode: code,
        recipientName: 'Target',
        phoneNumber: '+15559998888',
        messageText: 'Idempotency test',
      });

      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);

      // First cancel -> true
      const firstCancel = await dispatcher.cancelAlarm(code);
      expect(firstCancel).toBe(true);
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);

      // Second cancel on same code -> false
      const secondCancel = await dispatcher.cancelAlarm(code);
      expect(secondCancel).toBe(false);

      // Third cancel on same code -> false
      const thirdCancel = await dispatcher.cancelAlarm(code);
      expect(thirdCancel).toBe(false);
    });

    it('cancels 200 alarms concurrently while interleaving non-existent codes', async () => {
      const dispatcher = new MockSmsDispatcher();
      const count = 200;

      // Schedule 200 alarms (codes 20000..20199)
      for (let i = 0; i < count; i++) {
        await dispatcher.scheduleAlarm({
          id: `interleave-${i}`,
          timestampMs: 1750000000000 + i * 1000,
          alarmRequestCode: 20000 + i,
          recipientName: `User ${i}`,
          phoneNumber: '+15550001111',
          messageText: `Test ${i}`,
        });
      }
      expect(dispatcher.getScheduledAlarms()).toHaveLength(count);

      // Prepare 400 cancel operations: 200 real codes + 200 fake codes interleaved
      const cancelOps = Array.from({ length: count * 2 }, (_, i) => {
        if (i % 2 === 0) {
          const realCode = 20000 + i / 2;
          return { code: realCode, expected: true };
        } else {
          const fakeCode = 90000 + i;
          return { code: fakeCode, expected: false };
        }
      });

      // Execute all 400 cancels in parallel
      const cancelResults = await Promise.all(
        cancelOps.map(op => dispatcher.cancelAlarm(op.code))
      );

      // Verify exact expected return values
      cancelResults.forEach((res, i) => {
        expect(res).toBe(cancelOps[i].expected);
      });

      // Confirm storage is completely cleared
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
    });

    it('handles concurrent interleaving of schedule and cancel on distinct codes', async () => {
      const dispatcher = new MockSmsDispatcher();
      const count = 100;

      // Simultaneously schedule 100 even codes and cancel 100 odd codes (some pre-existing, some non-existent)
      // Pre-seed some odd codes
      for (let i = 1; i < 50; i += 2) {
        await dispatcher.scheduleAlarm({
          id: `pre-seeded-${i}`,
          timestampMs: 1750000000000,
          alarmRequestCode: i,
          recipientName: `Pre ${i}`,
          phoneNumber: '+15551234567',
          messageText: 'Pre',
        });
      }

      const mixedOperations = [];
      for (let i = 0; i < count; i++) {
        if (i % 2 === 0) {
          mixedOperations.push(
            dispatcher.scheduleAlarm({
              id: `mixed-${i}`,
              timestampMs: 1750000000000 + i * 1000,
              alarmRequestCode: 1000 + i,
              recipientName: `User ${i}`,
              phoneNumber: '+15550000000',
              messageText: `Mixed ${i}`,
            })
          );
        } else {
          mixedOperations.push(dispatcher.cancelAlarm(i));
        }
      }

      const opResults = await Promise.all(mixedOperations);
      expect(opResults).toHaveLength(count);

      // 50 even codes should be active
      expect(dispatcher.getScheduledAlarms()).toHaveLength(50);
    });
  });

  // =========================================================================
  // 3. NativeSmsDispatcher Bridge Concurrency & Error Stress
  // =========================================================================
  describe('NativeSmsDispatcher Native Bridge Concurrency', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('handles 100 concurrent scheduleAlarm bridge calls with async native module delay', async () => {
      const mockScheduleAlarm = jest.fn().mockImplementation(
        async (id, timestampMs, alarmRequestCode) => {
          // Simulate slight native async dispatch jitter (1-5ms)
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5) + 1));
          return { success: true, id, alarmRequestCode, scheduledTimestamp: timestampMs };
        }
      );

      NativeModules.AlarmSchedulerModule = {
        scheduleAlarm: mockScheduleAlarm,
        cancelAlarm: jest.fn().mockResolvedValue(true),
      };

      const nativeDispatcher = new NativeSmsDispatcher();
      const count = 100;

      const schedulePromises = Array.from({ length: count }, (_, i) =>
        nativeDispatcher.scheduleAlarm({
          id: `native-concurrent-${i}`,
          timestampMs: 1760000000000 + i * 1000,
          alarmRequestCode: 30000 + i,
          recipientName: `Native User ${i}`,
          phoneNumber: `+1555222${String(i).padStart(4, '0')}`,
          messageText: `Native alarm payload ${i}`,
        })
      );

      const results = await Promise.all(schedulePromises);

      expect(results).toHaveLength(count);
      results.forEach((res, i) => {
        expect(res.success).toBe(true);
        expect(res.alarmRequestCode).toBe(30000 + i);
        expect(res.scheduledAtMs).toBe(1760000000000 + i * 1000);
      });

      expect(mockScheduleAlarm).toHaveBeenCalledTimes(count);
    });

    it('preserves boolean return translation across cancelAlarm variations', async () => {
      const nativeDispatcher = new NativeSmsDispatcher();

      // Case 1: Native module resolves true
      NativeModules.AlarmSchedulerModule = {
        cancelAlarm: jest.fn().mockResolvedValue(true),
      };
      expect(await nativeDispatcher.cancelAlarm(101)).toBe(true);

      // Case 2: Native module resolves false
      NativeModules.AlarmSchedulerModule = {
        cancelAlarm: jest.fn().mockResolvedValue(false),
      };
      expect(await nativeDispatcher.cancelAlarm(102)).toBe(false);

      // Case 3: Native module resolves void / null (treated as success per result !== false)
      NativeModules.AlarmSchedulerModule = {
        cancelAlarm: jest.fn().mockResolvedValue(null),
      };
      expect(await nativeDispatcher.cancelAlarm(103)).toBe(true);

      // Case 4: Native module rejects -> error propagates
      NativeModules.AlarmSchedulerModule = {
        cancelAlarm: jest.fn().mockRejectedValue(new Error('Native binder death')),
      };
      await expect(nativeDispatcher.cancelAlarm(104)).rejects.toThrow(
        'Native binder death'
      );
    });

    it('delegates concurrent alarm operations to fallbackDispatcher on non-Android', async () => {
      Platform.OS = 'ios';
      const fallback = new MockSmsDispatcher();
      const nativeDispatcherWithFallback = new NativeSmsDispatcher({
        fallbackDispatcher: fallback,
      });

      const count = 50;
      const promises = Array.from({ length: count }, (_, i) =>
        nativeDispatcherWithFallback.scheduleAlarm({
          id: `fallback-sched-${i}`,
          timestampMs: 1750000000000 + i * 1000,
          alarmRequestCode: 40000 + i,
          recipientName: `Fallback ${i}`,
          phoneNumber: '+15557778888',
          messageText: 'Testing fallback',
        })
      );

      await Promise.all(promises);
      expect(fallback.getScheduledAlarms()).toHaveLength(count);

      // Concurrently cancel all via bridge
      const cancelPromises = Array.from({ length: count }, (_, i) =>
        nativeDispatcherWithFallback.cancelAlarm(40000 + i)
      );
      const cancelResults = await Promise.all(cancelPromises);

      expect(cancelResults.every(r => r === true)).toBe(true);
      expect(fallback.getScheduledAlarms()).toHaveLength(0);
    });
  });

  // =========================================================================
  // 4. Memory Stability & Heap Accumulation Stress Test
  // =========================================================================
  describe('Memory Stability under Rapid Churn', () => {
    it('executes 2,500 schedule and cancel cycles without unbounded heap retention', async () => {
      const dispatcher = new MockSmsDispatcher();
      const cycles = 2500;

      // Baseline GC if available
      if (typeof global.gc === 'function') {
        global.gc();
      }
      const initialMem = process.memoryUsage().heapUsed;

      for (let i = 0; i < cycles; i++) {
        await dispatcher.scheduleAlarm({
          id: `churn-${i}`,
          timestampMs: 1750000000000 + i,
          alarmRequestCode: 50000 + i,
          recipientName: `Churn Recipient ${i}`,
          phoneNumber: '+15550009999',
          messageText: 'Memory stress test payload string with substantial size to monitor garbage collection',
        });

        if (i % 2 === 0) {
          // Cancel immediately
          await dispatcher.cancelAlarm(50000 + i);
        }
      }

      // Cancel remaining half
      for (let i = 1; i < cycles; i += 2) {
        await dispatcher.cancelAlarm(50000 + i);
      }

      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);

      // Post-stress GC
      if (typeof global.gc === 'function') {
        global.gc();
      }
      const postMem = process.memoryUsage().heapUsed;

      // Verify that after releasing all alarms, heap growth is contained (< 15 MB delta)
      const heapGrowthBytes = postMem - initialMem;
      const maxAllowedGrowthBytes = 15 * 1024 * 1024; // 15 MB
      expect(heapGrowthBytes).toBeLessThan(maxAllowedGrowthBytes);
    });
  });
});
