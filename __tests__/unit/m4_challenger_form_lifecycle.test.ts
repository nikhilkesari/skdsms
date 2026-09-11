/**
 * Adversarial Challenger Test Suite: Milestone 4 Form Validation, Schedule Lifecycle & Alarm Invariants
 * Target: __tests__/unit/m4_challenger_form_lifecycle.test.ts
 *
 * Authored by: teamwork_preview_challenger (Challenger 1)
 *
 * Adversarially challenges:
 * 1. Form validation boundaries:
 *    - Past dates, exact now, boundary at now +/- lead buffer (29,999ms vs 30,000ms vs 30,001ms), custom buffers
 *    - Phone number formats (E.164, local digits, formatted with spaces/hyphens/parens/dots, short/long/invalid chars)
 *    - Message text boundaries (empty, whitespace, multi-line, very long)
 *    - Live SMS segment calculation (GSM-7 160/161/306/307 chars vs UCS-2 70/71/134/135 chars, surrogate pair emojis)
 *    - Daily recurrence bounds (end date earlier than start date, end date matching start date, malformed dates)
 * 2. Schedule lifecycle transitions & Alarm disarming/re-arming:
 *    - Create -> Update -> Reschedule -> Cancel -> Delete
 *    - Exact alarm disarm-before-rearm sequence
 *    - Alarm cancellation on delete and cancel
 *    - Atomic rollback when alarm scheduling fails on creation
 *    - Alarm preservation when update/reschedule validation fails
 * 3. Reactive Context & UI Component boundary behavior:
 *    - ScheduleContext activeSchedules filtering on cancel/delete
 *    - ScheduleFormModal validation failure feedback & successful submit payloads
 *    - ScheduleList delete confirmation alert trigger and execution
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  validateScheduledTime,
  validatePhoneNumber,
  normalizePhoneNumber,
  validateMessageText,
  validateScheduleInput,
} from '../../src/utils/validation';
import { calculateSmsSegments } from '../../src/utils/smsCalculator';
import { ScheduleManager } from '../../src/services/scheduler/ScheduleManager';
import { InMemoryScheduleRepository } from '../../src/repositories/InMemoryScheduleRepository';
import { MockSmsDispatcher } from '../../src/services/sms/MockSmsDispatcher';
import {
  ScheduleProvider,
  useSchedules,
  type ScheduleContextValue,
} from '../../src/context/ScheduleContext';
import { ScheduleFormModal } from '../../src/components/ScheduleFormModal';
import { confirmAndDeleteSchedule } from '../../src/components/ScheduleList';
import type {
  ScheduledMessage,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '../../src/types/schedule';
import type {
  AlarmScheduler,
  ScheduleAlarmParams,
  AlarmScheduleResult,
} from '../../src/services/sms/types';

/**
 * Diagnostic tracking alarm scheduler to assert exact disarm and re-arm sequences.
 */
class TrackingAlarmScheduler implements AlarmScheduler {
  public scheduledAlarms: ScheduleAlarmParams[] = [];
  public cancelledAlarms: number[] = [];
  public failNextSchedule: boolean = false;

  async scheduleAlarm(params: ScheduleAlarmParams): Promise<AlarmScheduleResult> {
    if (this.failNextSchedule) {
      this.failNextSchedule = false;
      throw new Error('MOCK_ALARM_FAILURE_INJECTED');
    }
    this.scheduledAlarms.push(params);
    return {
      success: true,
      alarmRequestCode: params.alarmRequestCode,
      scheduledTime: new Date(params.timestampMs).toISOString(),
    };
  }

  async cancelAlarm(alarmRequestCode: number): Promise<boolean> {
    this.cancelledAlarms.push(alarmRequestCode);
    return true;
  }

  clear(): void {
    this.scheduledAlarms = [];
    this.cancelledAlarms = [];
    this.failNextSchedule = false;
  }
}

describe('Milestone 4 Adversarial Challenge: Form Validation, Lifecycle & Alarm Management', () => {
  const FIXED_NOW = new Date('2026-09-15T12:00:00.000Z');

  // =========================================================================
  // 1. Form Validation Boundaries
  // =========================================================================
  describe('1. Form Validation Boundaries', () => {
    describe('1.1 Past Dates & Lead Buffer Boundary Testing', () => {
      it('rejects dates in the past (1ms, 1hr, 1yr, Unix epoch)', () => {
        const past1ms = new Date(FIXED_NOW.getTime() - 1);
        const past1hr = new Date(FIXED_NOW.getTime() - 3600000);
        const past1yr = new Date(FIXED_NOW.getTime() - 365 * 86400000);
        const epoch = new Date(0);

        expect(validateScheduledTime(past1ms, FIXED_NOW).isValid).toBe(false);
        expect(validateScheduledTime(past1hr, FIXED_NOW).isValid).toBe(false);
        expect(validateScheduledTime(past1yr, FIXED_NOW).isValid).toBe(false);
        expect(validateScheduledTime(epoch, FIXED_NOW).isValid).toBe(false);

        expect(validateScheduledTime(past1ms, FIXED_NOW).error).toContain('must be in the future');
      });

      it('rejects invalid, malformed, null, or undefined date inputs', () => {
        expect(validateScheduledTime(null as any, FIXED_NOW).isValid).toBe(false);
        expect(validateScheduledTime(undefined as any, FIXED_NOW).isValid).toBe(false);
        expect(validateScheduledTime('not-a-valid-date-string', FIXED_NOW).isValid).toBe(false);
        expect(validateScheduledTime('', FIXED_NOW).isValid).toBe(false);
        expect(validateScheduledTime(new Date(NaN), FIXED_NOW).isValid).toBe(false);
      });

      it('adversarially probes the 30-second default buffer boundary', () => {
        const bufferMs = 30000;
        const exactNow = new Date(FIXED_NOW.getTime());
        const beforeBuffer = new Date(FIXED_NOW.getTime() + bufferMs - 1); // 29,999 ms
        const exactBuffer = new Date(FIXED_NOW.getTime() + bufferMs); // 30,000 ms
        const afterBuffer = new Date(FIXED_NOW.getTime() + bufferMs + 1); // 30,001 ms

        // Must reject exact now
        expect(validateScheduledTime(exactNow, FIXED_NOW, bufferMs).isValid).toBe(false);
        // Must reject 1ms before buffer threshold
        expect(validateScheduledTime(beforeBuffer, FIXED_NOW, bufferMs).isValid).toBe(false);
        // Must accept exactly on the buffer threshold
        expect(validateScheduledTime(exactBuffer, FIXED_NOW, bufferMs).isValid).toBe(true);
        // Must accept 1ms after buffer threshold
        expect(validateScheduledTime(afterBuffer, FIXED_NOW, bufferMs).isValid).toBe(true);
      });

      it('respects configurable buffer durations (0ms and 60,000ms)', () => {
        // Zero buffer
        expect(validateScheduledTime(FIXED_NOW, FIXED_NOW, 0).isValid).toBe(true);
        expect(
          validateScheduledTime(new Date(FIXED_NOW.getTime() - 1), FIXED_NOW, 0).isValid
        ).toBe(false);

        // 60-second buffer
        const at59s = new Date(FIXED_NOW.getTime() + 59999);
        const at60s = new Date(FIXED_NOW.getTime() + 60000);
        expect(validateScheduledTime(at59s, FIXED_NOW, 60000).isValid).toBe(false);
        expect(validateScheduledTime(at60s, FIXED_NOW, 60000).isValid).toBe(true);
      });
    });

    describe('1.2 Phone Number Normalization & Validation Formats', () => {
      it('normalizes formatted phone numbers into dialable digits or E.164', () => {
        expect(normalizePhoneNumber('+1 (202) 555-0123')).toBe('+12025550123');
        expect(normalizePhoneNumber('(202) 555-0123')).toBe('2025550123');
        expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
        expect(normalizePhoneNumber('   +44-7911-123456   ')).toBe('+447911123456');
        expect(normalizePhoneNumber('555.867.5309')).toBe('5558675309');
      });

      it('accepts valid E.164 and valid 7-15 digit local numbers', () => {
        // Minimum allowed: 7 digits
        expect(validatePhoneNumber('1234567').isValid).toBe(true);
        // Maximum allowed: 15 digits
        expect(validatePhoneNumber('+123456789012345').isValid).toBe(true);
        expect(validatePhoneNumber('123456789012345').isValid).toBe(true);

        // Standard national and international formats
        expect(validatePhoneNumber('+12025550123').isValid).toBe(true);
        expect(validatePhoneNumber('+919876543210').isValid).toBe(true);
        expect(validatePhoneNumber('+447911123456').isValid).toBe(true);
        expect(validatePhoneNumber('+819012345678').isValid).toBe(true);
      });

      it('rejects numbers that are too short, too long, or start with 0 under +', () => {
        // Too short (< 7 digits)
        expect(validatePhoneNumber('123456').isValid).toBe(false);
        expect(validatePhoneNumber('+12345').isValid).toBe(false);
        expect(validatePhoneNumber('+1').isValid).toBe(false);

        // Too long (> 15 digits)
        expect(validatePhoneNumber('1234567890123456').isValid).toBe(false);
        expect(validatePhoneNumber('+1234567890123456').isValid).toBe(false);

        // Country code starting with 0 is invalid in E.164
        expect(validatePhoneNumber('+0123456789').isValid).toBe(false);

        // Blank, whitespace, or non-numeric
        expect(validatePhoneNumber('').isValid).toBe(false);
        expect(validatePhoneNumber('   ').isValid).toBe(false);
        expect(validatePhoneNumber('abcdefg').isValid).toBe(false);
        expect(validatePhoneNumber('+').isValid).toBe(false);
        expect(validatePhoneNumber('++--**').isValid).toBe(false);
        expect(validatePhoneNumber('<script>alert(1)</script>').isValid).toBe(false);
      });
    });

    describe('1.3 Message Text Validation Boundaries', () => {
      it('rejects empty, null, or whitespace-only messages', () => {
        expect(validateMessageText('').isValid).toBe(false);
        expect(validateMessageText('    ').isValid).toBe(false);
        expect(validateMessageText('\t\n\r\n\t').isValid).toBe(false);
        expect(validateMessageText(null as any).isValid).toBe(false);
        expect(validateMessageText(undefined as any).isValid).toBe(false);
      });

      it('accepts non-whitespace single characters, multiline text, and very long messages', () => {
        expect(validateMessageText('a').isValid).toBe(true);
        expect(validateMessageText('  valid content with spaces  ').isValid).toBe(true);
        expect(validateMessageText('Line 1\nLine 2\nLine 3').isValid).toBe(true);
        expect(validateMessageText('A'.repeat(5000)).isValid).toBe(true);
      });
    });

    describe('1.4 Recurrence End Date Boundaries in validateScheduleInput', () => {
      const validFutureDate = new Date(FIXED_NOW.getTime() + 60000); // 2026-09-15T12:01:00.000Z

      it('rejects daily recurrence when end date is chronologically before scheduled date', () => {
        const result = validateScheduleInput(
          {
            recipientName: 'Alice',
            phoneNumber: '+15551234567',
            messageText: 'Daily reminder',
            scheduledDate: validFutureDate,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-10', // 5 days before scheduled date
            },
          },
          FIXED_NOW
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.recurrence).toContain('cannot be earlier than scheduled start date');
      });

      it('accepts daily recurrence when end date is equal to or after scheduled date', () => {
        const resultSameDay = validateScheduleInput(
          {
            recipientName: 'Alice',
            phoneNumber: '+15551234567',
            messageText: 'Daily reminder',
            scheduledDate: validFutureDate,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-15',
            },
          },
          FIXED_NOW
        );
        expect(resultSameDay.isValid).toBe(true);

        const resultFutureDay = validateScheduleInput(
          {
            recipientName: 'Alice',
            phoneNumber: '+15551234567',
            messageText: 'Daily reminder',
            scheduledDate: validFutureDate,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-30',
            },
          },
          FIXED_NOW
        );
        expect(resultFutureDay.isValid).toBe(true);
      });

      it('rejects invalid recurrence end date string formats', () => {
        const result = validateScheduleInput(
          {
            recipientName: 'Alice',
            phoneNumber: '+15551234567',
            messageText: 'Daily reminder',
            scheduledDate: validFutureDate,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: 'not-a-real-date',
            },
          },
          FIXED_NOW
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.recurrence).toContain('Invalid recurrence end date format');
      });
    });

    describe('1.5 Live SMS Segmentation: GSM-7 vs UCS-2 Unicode Encoding', () => {
      it('calculates exact segment boundaries for GSM-7 basic character set', () => {
        // Empty
        expect(calculateSmsSegments('')).toEqual({
          charCount: 0,
          segmentCount: 0,
          isUnicode: false,
          bytesTotal: 0,
        });

        // Exactly 160 characters (single segment boundary)
        const text160 = 'A'.repeat(160);
        const res160 = calculateSmsSegments(text160);
        expect(res160.charCount).toBe(160);
        expect(res160.segmentCount).toBe(1);
        expect(res160.isUnicode).toBe(false);
        expect(res160.bytesTotal).toBe(160);

        // 161 characters (crosses into 2 segments: 153 chars per segment in multipart)
        const text161 = 'A'.repeat(161);
        const res161 = calculateSmsSegments(text161);
        expect(res161.charCount).toBe(161);
        expect(res161.segmentCount).toBe(2);
        expect(res161.isUnicode).toBe(false);

        // Exactly 306 characters (153 * 2 = 2 segments)
        const text306 = 'A'.repeat(306);
        expect(calculateSmsSegments(text306).segmentCount).toBe(2);

        // 307 characters (crosses into 3 segments)
        const text307 = 'A'.repeat(307);
        expect(calculateSmsSegments(text307).segmentCount).toBe(3);
      });

      it('calculates exact segment boundaries for UCS-2 Unicode (emojis & accents)', () => {
        // Single emoji (surrogate pair)
        const rocket = '🚀';
        const resRocket = calculateSmsSegments(rocket);
        expect(resRocket.charCount).toBe(1); // Array.from counts code point as 1 char
        expect(resRocket.segmentCount).toBe(1);
        expect(resRocket.isUnicode).toBe(true);
        expect(resRocket.bytesTotal).toBe(4); // 2 UTF-16 code units * 2 bytes = 4

        // Exactly 70 Unicode characters (single segment boundary)
        const text70 = '🌟'.repeat(70);
        const res70 = calculateSmsSegments(text70);
        expect(res70.charCount).toBe(70);
        expect(res70.segmentCount).toBe(1);
        expect(res70.isUnicode).toBe(true);

        // 71 Unicode characters (crosses into 2 segments: 67 chars per segment in multipart)
        const text71 = '🌟'.repeat(71);
        const res71 = calculateSmsSegments(text71);
        expect(res71.charCount).toBe(71);
        expect(res71.segmentCount).toBe(2);
        expect(res71.isUnicode).toBe(true);

        // Exactly 134 Unicode characters (67 * 2 = 2 segments)
        const text134 = '🌟'.repeat(134);
        expect(calculateSmsSegments(text134).segmentCount).toBe(2);

        // 135 Unicode characters (crosses into 3 segments)
        const text135 = '🌟'.repeat(135);
        expect(calculateSmsSegments(text135).segmentCount).toBe(3);
      });

      it('detects Unicode in mixed text and counts multi-byte complex emojis accurately', () => {
        const mixedText = 'Meeting at 3 PM 📅';
        const mixedRes = calculateSmsSegments(mixedText);
        expect(mixedRes.isUnicode).toBe(true);
        expect(mixedRes.segmentCount).toBe(1);

        // Complex emoji: family emoji or skin tone modifier
        const familyEmoji = '👨‍👩‍👧‍👦';
        const familyRes = calculateSmsSegments(familyEmoji);
        expect(familyRes.isUnicode).toBe(true);
        expect(familyRes.charCount).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // =========================================================================
  // 2. Schedule Lifecycle Transitions & Alarm Disarming/Re-arming
  // =========================================================================
  describe('2. Schedule Lifecycle Transitions & Alarm Disarming/Re-arming', () => {
    let repository: InMemoryScheduleRepository;
    let alarmScheduler: TrackingAlarmScheduler;
    let dispatcher: MockSmsDispatcher;
    let manager: ScheduleManager;

    beforeEach(() => {
      repository = new InMemoryScheduleRepository();
      alarmScheduler = new TrackingAlarmScheduler();
      dispatcher = new MockSmsDispatcher();
      manager = new ScheduleManager({
        repository,
        alarmScheduler,
        smsDispatcher: dispatcher,
        getCurrentTime: () => FIXED_NOW,
        leadBufferMs: 30000,
      });
    });

    it('executes full schedule lifecycle with strict alarm disarm-before-rearm verification', async () => {
      // -------------------------------------------------------------
      // Step 1: CREATE
      // -------------------------------------------------------------
      const initialDate = new Date(FIXED_NOW.getTime() + 60000); // +1 min
      const created = await manager.createSchedule({
        recipientName: 'Bob Smith',
        phoneNumber: '+15551112222',
        messageText: 'Initial schedule text',
        scheduledAt: initialDate,
      });

      expect(created.status).toBe('pending');
      expect(alarmScheduler.scheduledAlarms.length).toBe(1);
      expect(alarmScheduler.cancelledAlarms.length).toBe(0);
      expect(alarmScheduler.scheduledAlarms[0].alarmRequestCode).toBe(created.alarmRequestCode);
      expect(alarmScheduler.scheduledAlarms[0].timestampMs).toBe(initialDate.getTime());

      // -------------------------------------------------------------
      // Step 2: UPDATE (modify message & recipient name)
      // -------------------------------------------------------------
      const updated = await manager.updateSchedule(created.id, {
        recipientName: 'Robert Smith',
        messageText: 'Updated schedule text',
      });

      expect(updated.recipient.name).toBe('Robert Smith');
      expect(updated.messageText).toBe('Updated schedule text');
      // Must disarm the old alarm and re-arm with updated data
      expect(alarmScheduler.cancelledAlarms.length).toBe(1);
      expect(alarmScheduler.cancelledAlarms[0]).toBe(created.alarmRequestCode);
      expect(alarmScheduler.scheduledAlarms.length).toBe(2);
      expect(alarmScheduler.scheduledAlarms[1].recipientName).toBe('Robert Smith');
      expect(alarmScheduler.scheduledAlarms[1].messageText).toBe('Updated schedule text');

      // -------------------------------------------------------------
      // Step 3: RESCHEDULE to new future date
      // -------------------------------------------------------------
      const newFutureDate = new Date(FIXED_NOW.getTime() + 120000); // +2 mins
      const rescheduled = await manager.reschedule(created.id, newFutureDate);

      expect(rescheduled.scheduledAt).toBe(newFutureDate.toISOString());
      expect(rescheduled.status).toBe('pending');
      // Must cancel the previous alarm code
      expect(alarmScheduler.cancelledAlarms.length).toBe(2);
      expect(alarmScheduler.cancelledAlarms[1]).toBe(updated.alarmRequestCode);
      // Must re-arm with new timestamp
      expect(alarmScheduler.scheduledAlarms.length).toBe(3);
      expect(alarmScheduler.scheduledAlarms[2].timestampMs).toBe(newFutureDate.getTime());

      // -------------------------------------------------------------
      // Step 4: CANCEL schedule
      // -------------------------------------------------------------
      const cancelled = await manager.cancelSchedule(created.id);

      expect(cancelled.status).toBe('cancelled');
      // Must disarm alarm
      expect(alarmScheduler.cancelledAlarms.length).toBe(3);
      expect(alarmScheduler.cancelledAlarms[2]).toBe(rescheduled.alarmRequestCode);
      // Cancel must NOT schedule any new alarms!
      expect(alarmScheduler.scheduledAlarms.length).toBe(3);

      // Verify repository reflects cancelled state
      const inRepo = await repository.getById(created.id);
      expect(inRepo?.status).toBe('cancelled');

      // -------------------------------------------------------------
      // Step 5: DELETE schedule
      // -------------------------------------------------------------
      const deleteResult = await manager.deleteSchedule(created.id);

      expect(deleteResult).toBe(true);
      // Must disarm alarm for safety
      expect(alarmScheduler.cancelledAlarms.length).toBe(4);
      expect(alarmScheduler.cancelledAlarms[3]).toBe(cancelled.alarmRequestCode);
      // Completely removed from repository
      expect(await repository.getById(created.id)).toBeNull();
    });

    it('rolls back database creation atomically if alarm scheduling throws an exception', async () => {
      alarmScheduler.failNextSchedule = true;

      await expect(
        manager.createSchedule({
          recipientName: 'Crash Test',
          phoneNumber: '+15559998888',
          messageText: 'This will fail on alarm arming',
          scheduledAt: new Date(FIXED_NOW.getTime() + 60000),
        })
      ).rejects.toThrow('MOCK_ALARM_FAILURE_INJECTED');

      // Repository must have 0 records (rolled back, not orphaned)
      const allSchedules = await repository.getAll();
      expect(allSchedules.length).toBe(0);
      expect(alarmScheduler.scheduledAlarms.length).toBe(0);
    });

    it('preserves existing schedule and alarm when reschedule validation fails', async () => {
      const validDate = new Date(FIXED_NOW.getTime() + 60000);
      const created = await manager.createSchedule({
        recipientName: 'Safe Contact',
        phoneNumber: '+15553334444',
        messageText: 'Preserve me',
        scheduledAt: validDate,
      });

      expect(alarmScheduler.scheduledAlarms.length).toBe(1);
      expect(alarmScheduler.cancelledAlarms.length).toBe(0);

      // Attempt to reschedule to a past date
      const pastDate = new Date(FIXED_NOW.getTime() - 10000);
      await expect(manager.reschedule(created.id, pastDate)).rejects.toThrow('VALIDATION_ERROR');

      // Alarm must NOT have been cancelled or altered!
      expect(alarmScheduler.cancelledAlarms.length).toBe(0);
      expect(alarmScheduler.scheduledAlarms.length).toBe(1);

      // Schedule in repository must remain intact with original date
      const fetched = await repository.getById(created.id);
      expect(fetched?.scheduledAt).toBe(validDate.toISOString());
    });

    it('preserves existing schedule and alarm when updateSchedule validation fails', async () => {
      const validDate = new Date(FIXED_NOW.getTime() + 60000);
      const created = await manager.createSchedule({
        recipientName: 'Safe Contact',
        phoneNumber: '+15553334444',
        messageText: 'Preserve me',
        scheduledAt: validDate,
      });

      // Attempt update with invalid phone number (too short)
      await expect(
        manager.updateSchedule(created.id, {
          phoneNumber: '12345',
        })
      ).rejects.toThrow('VALIDATION_ERROR');

      // Alarm was not disarmed because validation aborted before mutation
      expect(alarmScheduler.cancelledAlarms.length).toBe(0);

      // Attempt update with blank message
      await expect(
        manager.updateSchedule(created.id, {
          messageText: '   ',
        })
      ).rejects.toThrow('VALIDATION_ERROR');

      expect(alarmScheduler.cancelledAlarms.length).toBe(0);
    });

    it('survives 20 rapid sequential updates maintaining single-active-alarm invariant', async () => {
      const initialDate = new Date(FIXED_NOW.getTime() + 60000);
      const created = await manager.createSchedule({
        recipientName: 'Rapid Contact',
        phoneNumber: '+15557778888',
        messageText: 'Rapid update text initial',
        scheduledAt: initialDate,
      });

      // 20 rapid sequential updates changing scheduledAt and messageText
      for (let i = 1; i <= 20; i++) {
        const nextDate = new Date(FIXED_NOW.getTime() + 60000 + i * 10000);
        await manager.updateSchedule(created.id, {
          messageText: `Rapid update message cycle #${i}`,
          scheduledAt: nextDate,
        });
      }

      // Initial create: 1 scheduleAlarm
      // 20 updates: 20 cancelAlarm + 20 scheduleAlarm
      expect(alarmScheduler.cancelledAlarms.length).toBe(20);
      expect(alarmScheduler.scheduledAlarms.length).toBe(21);

      const latestAlarm = alarmScheduler.scheduledAlarms[alarmScheduler.scheduledAlarms.length - 1];
      expect(latestAlarm.messageText).toBe('Rapid update message cycle #20');
      expect(latestAlarm.timestampMs).toBe(FIXED_NOW.getTime() + 60000 + 20 * 10000);
    });
  });

  // =========================================================================
  // 3. Reactive State Transitions in ScheduleContext
  // =========================================================================
  describe('3. Reactive State Transitions in ScheduleContext', () => {
    let repository: InMemoryScheduleRepository;
    let alarmScheduler: TrackingAlarmScheduler;
    let dispatcher: MockSmsDispatcher;
    let manager: ScheduleManager;
    let hookValue: ScheduleContextValue | undefined;

    const TestConsumer: React.FC = () => {
      hookValue = useSchedules();
      return null;
    };

    beforeEach(() => {
      repository = new InMemoryScheduleRepository();
      alarmScheduler = new TrackingAlarmScheduler();
      dispatcher = new MockSmsDispatcher();
      manager = new ScheduleManager({
        repository,
        alarmScheduler,
        smsDispatcher: dispatcher,
        getCurrentTime: () => FIXED_NOW,
        leadBufferMs: 30000,
      });
      hookValue = undefined;
    });

    it('correctly updates reactive state and filters activeSchedules across lifecycle', async () => {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          React.createElement(
            ScheduleProvider,
            { scheduleManager: manager, autoLoad: true },
            React.createElement(TestConsumer, null)
          )
        );
      });

      expect(hookValue).toBeDefined();
      expect(hookValue!.schedules).toEqual([]);
      expect(hookValue!.activeSchedules).toEqual([]);

      // 1. Create schedule
      let created!: ScheduledMessage;
      await act(async () => {
        created = await hookValue!.createSchedule({
          recipientName: 'Context Contact',
          phoneNumber: '+15556667777',
          messageText: 'Context lifecycle test',
          scheduledAt: new Date(FIXED_NOW.getTime() + 60000),
        });
      });

      expect(hookValue!.schedules.length).toBe(1);
      expect(hookValue!.activeSchedules.length).toBe(1);
      expect(hookValue!.activeSchedules[0].id).toBe(created.id);

      // 2. Reschedule
      const rescheduledDate = new Date(FIXED_NOW.getTime() + 180000);
      await act(async () => {
        await hookValue!.reschedule(created.id, rescheduledDate);
      });

      expect(hookValue!.schedules.length).toBe(1);
      expect(hookValue!.activeSchedules.length).toBe(1);
      expect(hookValue!.activeSchedules[0].scheduledAt).toBe(rescheduledDate.toISOString());

      // 3. Cancel schedule -> stays in `schedules` but disappears from `activeSchedules`
      await act(async () => {
        await hookValue!.cancelSchedule(created.id);
      });

      expect(hookValue!.schedules.length).toBe(1);
      expect(hookValue!.schedules[0].status).toBe('cancelled');
      expect(hookValue!.activeSchedules.length).toBe(0); // active only includes pending!

      // 4. Delete schedule -> removed from both
      await act(async () => {
        await hookValue!.deleteSchedule(created.id);
      });

      expect(hookValue!.schedules.length).toBe(0);
      expect(hookValue!.activeSchedules.length).toBe(0);

      act(() => {
        renderer.unmount();
      });
    });
  });

  // =========================================================================
  // 4. UI Component Adversarial Boundary Verification
  // =========================================================================
  describe('4. UI Component Adversarial Boundary Verification', () => {
    describe('4.1 ScheduleFormModal Form Submission Boundaries', () => {
      it('blocks submission and highlights errors for invalid recipient, invalid phone, and blank message', async () => {
        const onSubmitMock = jest.fn();
        let renderer!: ReactTestRenderer.ReactTestRenderer;

        act(() => {
          renderer = ReactTestRenderer.create(
            React.createElement(ScheduleFormModal, {
              visible: true,
              onClose: jest.fn(),
              onSubmit: onSubmitMock,
              now: FIXED_NOW,
            })
          );
        });

        // 1. Enter invalid phone with only letters
        act(() => {
          renderer.root.findByProps({ testID: 'recipient-name-input' }).props.onChangeText('');
          renderer.root
            .findByProps({ testID: 'recipient-phone-input' })
            .props.onChangeText('invalid-phone');
          renderer.root.findByProps({ testID: 'message-text-input' }).props.onChangeText('   ');
        });

        const submitBtn = renderer.root.findByProps({ testID: 'schedule-form-submit-button' });
        await act(async () => {
          await submitBtn.props.onPress();
        });

        expect(onSubmitMock).not.toHaveBeenCalled();
        const banner = renderer.root.findByProps({ testID: 'form-error-banner' });
        expect(banner).toBeDefined();

        act(() => {
          renderer.unmount();
        });
      });

      it('normalizes formatted phone number and creates clean payload on submission', async () => {
        const onSubmitMock = jest.fn();
        const onCloseMock = jest.fn();
        let renderer!: ReactTestRenderer.ReactTestRenderer;

        act(() => {
          renderer = ReactTestRenderer.create(
            React.createElement(ScheduleFormModal, {
              visible: true,
              onClose: onCloseMock,
              onSubmit: onSubmitMock,
              now: FIXED_NOW,
            })
          );
        });

        // Input formatted phone with spaces and dashes
        act(() => {
          renderer.root
            .findByProps({ testID: 'recipient-name-input' })
            .props.onChangeText('   Dr. Jane Watson   ');
          renderer.root
            .findByProps({ testID: 'recipient-phone-input' })
            .props.onChangeText('+1 (202) 555-0199');
          renderer.root
            .findByProps({ testID: 'message-text-input' })
            .props.onChangeText('Appointment confirmation for tomorrow');
        });

        const submitBtn = renderer.root.findByProps({ testID: 'schedule-form-submit-button' });
        await act(async () => {
          await submitBtn.props.onPress();
        });

        expect(onSubmitMock).toHaveBeenCalledTimes(1);
        const submittedPayload = onSubmitMock.mock.calls[0][0] as CreateScheduleInput;
        expect(submittedPayload.recipient.name).toBe('Dr. Jane Watson');
        expect(submittedPayload.recipient.phoneNumber).toBe('+12025550199');
        expect(onCloseMock).toHaveBeenCalledTimes(1);

        act(() => {
          renderer.unmount();
        });
      });

      it('submits UpdateScheduleInput with proper fields when editing initialSchedule', async () => {
        const existing: ScheduledMessage = {
          id: 'existing-schedule-1',
          recipient: { name: 'Existing User', phoneNumber: '+15551234567' },
          messageText: 'Original text',
          scheduledAt: new Date(FIXED_NOW.getTime() + 3600000).toISOString(),
          recurrence: { type: 'none' },
          status: 'pending',
          alarmRequestCode: 4242,
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString(),
        };

        const onSubmitMock = jest.fn();
        let renderer!: ReactTestRenderer.ReactTestRenderer;

        act(() => {
          renderer = ReactTestRenderer.create(
            React.createElement(ScheduleFormModal, {
              visible: true,
              initialSchedule: existing,
              onClose: jest.fn(),
              onSubmit: onSubmitMock,
              now: FIXED_NOW,
            })
          );
        });

        // Change message text
        act(() => {
          renderer.root
            .findByProps({ testID: 'message-text-input' })
            .props.onChangeText('Updated text in edit mode');
        });

        const submitBtn = renderer.root.findByProps({ testID: 'schedule-form-submit-button' });
        await act(async () => {
          await submitBtn.props.onPress();
        });

        expect(onSubmitMock).toHaveBeenCalledTimes(1);
        const updatePayload = onSubmitMock.mock.calls[0][0] as UpdateScheduleInput;
        expect(updatePayload.messageText).toBe('Updated text in edit mode');
        expect(updatePayload.recipient.name).toBe('Existing User');

        act(() => {
          renderer.unmount();
        });
      });
    });

    describe('4.2 ScheduleList Delete Confirmation Workflow', () => {
      it('triggers native Alert.alert confirmation before executing onDelete callback', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert');
        const onDeleteMock = jest.fn();

        const testSchedule: ScheduledMessage = {
          id: 'del-sched-1',
          recipient: { name: 'Delete Target', phoneNumber: '+15559990000' },
          messageText: 'Delete me',
          scheduledAt: new Date(FIXED_NOW.getTime() + 60000).toISOString(),
          recurrence: { type: 'none' },
          status: 'pending',
          alarmRequestCode: 9999,
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString(),
        };

        confirmAndDeleteSchedule(testSchedule, onDeleteMock);

        expect(alertSpy).toHaveBeenCalledTimes(1);
        expect(alertSpy).toHaveBeenCalledWith(
          'Delete Schedule',
          'Are you sure you want to cancel and delete this scheduled message?',
          expect.any(Array),
          { cancelable: true }
        );

        // Simulate user clicking "Delete" button (second button in alert options)
        const alertButtons = alertSpy.mock.calls[0][2] as any[];
        const deleteButton = alertButtons.find(b => b.text === 'Delete');
        expect(deleteButton).toBeDefined();

        await act(async () => {
          await deleteButton.onPress();
        });

        expect(onDeleteMock).toHaveBeenCalledTimes(1);
        expect(onDeleteMock).toHaveBeenCalledWith(testSchedule);

        alertSpy.mockRestore();
      });

      it('aborts deletion when user clicks "Cancel" in Alert.alert', () => {
        const alertSpy = jest.spyOn(Alert, 'alert');
        const onDeleteMock = jest.fn();
        const onCancelMock = jest.fn();

        const testSchedule: ScheduledMessage = {
          id: 'del-sched-2',
          recipient: { name: 'Cancel Target', phoneNumber: '+15559990000' },
          messageText: 'Do not delete me',
          scheduledAt: new Date(FIXED_NOW.getTime() + 60000).toISOString(),
          recurrence: { type: 'none' },
          status: 'pending',
          alarmRequestCode: 9998,
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString(),
        };

        confirmAndDeleteSchedule(testSchedule, onDeleteMock, onCancelMock);

        const alertButtons = alertSpy.mock.calls[0][2] as any[];
        const cancelButton = alertButtons.find(b => b.text === 'Cancel');
        expect(cancelButton).toBeDefined();

        act(() => {
          cancelButton.onPress?.();
        });

        expect(onCancelMock).toHaveBeenCalledTimes(1);
        expect(onDeleteMock).not.toHaveBeenCalled();

        alertSpy.mockRestore();
      });
    });
  });
});
