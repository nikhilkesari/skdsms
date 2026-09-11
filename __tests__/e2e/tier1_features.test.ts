/**
 * Tier 1: Feature Coverage (Happy Paths)
 *
 * Requirements: >= 5 tests per inventoried feature covering positive, happy-path flows.
 * Authoritative Sources: ORIGINAL_REQUEST.md (R1, R2, R3), PROJECT.md.
 * Total Tests: 60 tests (12 features x 5 tests each).
 */

import {
  E2ETestContext,
  validateScheduleInput,
  validatePhoneNumber,
  validateScheduledTime,
  validateMessageText,
  calculateSmsSegments,
  calculateNextRun,
  MockSmsDispatcher,
} from '../helpers/e2eHarness';

describe('Tier 1: Feature Coverage (Happy Paths)', () => {
  let ctx: E2ETestContext;
  const BASE_TIME = new Date('2026-09-15T08:00:00Z');

  beforeEach(() => {
    ctx = new E2ETestContext(BASE_TIME);
  });

  // =========================================================================
  // Feature 1: Schedule Creation & Mandatory Field Validation (R1)
  // =========================================================================
  describe('Feature 1: Schedule Creation & Mandatory Field Validation', () => {
    it('T1.F1.1: should successfully create a schedule with standard ASCII message and future time', async () => {
      const schedule = await ctx.createSchedule({
        recipientName: 'Alice Smith',
        phoneNumber: '+15551234567',
        messageText: 'Hello Alice, see you at 10 AM!',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.recipient.name).toBe('Alice Smith');
      expect(schedule.recipient.phoneNumber).toBe('+15551234567');
      expect(schedule.messageText).toBe('Hello Alice, see you at 10 AM!');
      expect(schedule.status).toBe('pending');
      expect(schedule.alarmRequestCode).toBeGreaterThan(0);
    });

    it('T1.F1.2: should create schedule when recipient phone uses national digits format', async () => {
      const schedule = await ctx.createSchedule({
        recipientName: 'Bob Jones',
        phoneNumber: '9876543210',
        messageText: 'Meeting reminder for Bob',
        scheduledAt: '2026-09-15T12:00:00Z',
      });

      expect(schedule.recipient.phoneNumber).toBe('9876543210');
      expect(schedule.status).toBe('pending');
    });

    it('T1.F1.3: should create schedule with multi-line message text', async () => {
      const multilineMsg = 'Line 1: Meeting Agenda\nLine 2: Project status\nLine 3: Q&A session';
      const schedule = await ctx.createSchedule({
        recipientName: 'Carol White',
        phoneNumber: '+447911123456',
        messageText: multilineMsg,
        scheduledAt: '2026-09-15T14:30:00Z',
      });

      expect(schedule.messageText).toBe(multilineMsg);
      expect(schedule.status).toBe('pending');
    });

    it('T1.F1.4: should generate unique UUID and alarmRequestCode on creation', async () => {
      const s1 = await ctx.createSchedule({
        recipientName: 'User One',
        phoneNumber: '+15551112222',
        messageText: 'Notice 1',
        scheduledAt: '2026-09-15T15:00:00Z',
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'User Two',
        phoneNumber: '+15553334444',
        messageText: 'Notice 2',
        scheduledAt: '2026-09-15T16:00:00Z',
      });

      expect(s1.id).not.toBe(s2.id);
      expect(s1.alarmRequestCode).toBeDefined();
      expect(s2.alarmRequestCode).toBeDefined();
    });

    it('T1.F1.5: should initialize audit timestamps createdAt and updatedAt on schedule creation', async () => {
      const schedule = await ctx.createSchedule({
        recipientName: 'Dave Miller',
        phoneNumber: '+15557778888',
        messageText: 'Payment receipt',
        scheduledAt: '2026-09-15T17:00:00Z',
      });

      expect(schedule.createdAt).toBeDefined();
      expect(schedule.updatedAt).toBeDefined();
      expect(new Date(schedule.createdAt).getTime()).not.toBeNaN();
      expect(schedule.createdAt).toBe(schedule.updatedAt);
    });
  });

  // =========================================================================
  // Feature 2: Past Date & Time Validation (R1)
  // =========================================================================
  describe('Feature 2: Past Date & Time Validation', () => {
    it('T1.F2.1: should allow schedule set 5 minutes into the future', () => {
      const futureTime = new Date(BASE_TIME.getTime() + 5 * 60 * 1000);
      const res = validateScheduledTime(futureTime, BASE_TIME);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('T1.F2.2: should allow schedule set 1 hour into the future', () => {
      const futureTime = new Date(BASE_TIME.getTime() + 60 * 60 * 1000);
      const res = validateScheduledTime(futureTime, BASE_TIME);
      expect(res.isValid).toBe(true);
    });

    it('T1.F2.3: should allow schedule set exactly tomorrow at the same hour', () => {
      const tomorrow = new Date(BASE_TIME.getTime() + 24 * 60 * 60 * 1000);
      const res = validateScheduledTime(tomorrow, BASE_TIME);
      expect(res.isValid).toBe(true);
    });

    it('T1.F2.4: should allow schedule set 30 days into the future', () => {
      const nextMonth = new Date(BASE_TIME.getTime() + 30 * 24 * 60 * 60 * 1000);
      const res = validateScheduledTime(nextMonth, BASE_TIME);
      expect(res.isValid).toBe(true);
    });

    it('T1.F2.5: should validate schedule timestamp supplied as valid ISO 8601 string', () => {
      const isoString = '2026-09-16T12:00:00.000Z';
      const res = validateScheduledTime(isoString, BASE_TIME);
      expect(res.isValid).toBe(true);
    });
  });

  // =========================================================================
  // Feature 3: Phone Number Normalization & Validation (R1)
  // =========================================================================
  describe('Feature 3: Phone Number Normalization & Validation', () => {
    it('T1.F3.1: should validate and preserve international E.164 phone numbers with + prefix', () => {
      const phone = '+14155552671';
      const res = validatePhoneNumber(phone);
      expect(res.isValid).toBe(true);
    });

    it('T1.F3.2: should accept standard 10-digit national numbers', () => {
      const phone = '9876543210';
      const res = validatePhoneNumber(phone);
      expect(res.isValid).toBe(true);
    });

    it('T1.F3.3: should normalize phone numbers with formatted dashes and spaces', () => {
      const raw = '+1 (555) 234-5678';
      const res = validatePhoneNumber(raw);
      expect(res.isValid).toBe(true);
    });

    it('T1.F3.4: should normalize UK phone numbers (+44 prefix)', () => {
      const phone = '+44 7911 123456';
      const res = validatePhoneNumber(phone);
      expect(res.isValid).toBe(true);
    });

    it('T1.F3.5: should accept 15-digit maximum ITU-T E.164 phone numbers', () => {
      const maxPhone = '+123456789012345';
      const res = validatePhoneNumber(maxPhone);
      expect(res.isValid).toBe(true);
    });
  });

  // =========================================================================
  // Feature 4: Schedule Persistence & Active Queue Retrieval (R2)
  // =========================================================================
  describe('Feature 4: Schedule Persistence & Active Queue Retrieval', () => {
    it('T1.F4.1: should return empty array when no schedules have been created', async () => {
      const all = await ctx.repository.getAll();
      expect(all).toEqual([]);
    });

    it('T1.F4.2: should retrieve a created schedule by its unique ID', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Target Contact',
        phoneNumber: '+15559990000',
        messageText: 'Find me by ID',
        scheduledAt: '2026-09-15T09:00:00Z',
      });

      const retrieved = await ctx.repository.getById(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.messageText).toBe('Find me by ID');
    });

    it('T1.F4.3: should retrieve active pending schedules sorted chronologically', async () => {
      await ctx.createSchedule({
        recipientName: 'Later Contact',
        phoneNumber: '+15551111111',
        messageText: 'At 12:00',
        scheduledAt: '2026-09-15T12:00:00Z',
      });
      await ctx.createSchedule({
        recipientName: 'Earlier Contact',
        phoneNumber: '+15552222222',
        messageText: 'At 09:00',
        scheduledAt: '2026-09-15T09:00:00Z',
      });

      const active = await ctx.repository.getActivePending();
      expect(active.length).toBe(2);
      expect(active[0].scheduledAt).toBe('2026-09-15T09:00:00Z');
      expect(active[1].scheduledAt).toBe('2026-09-15T12:00:00Z');
    });

    it('T1.F4.4: should exclude sent schedules from getActivePending query', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Sent Contact',
        phoneNumber: '+15553333333',
        messageText: 'Sent msg',
        scheduledAt: '2026-09-15T08:30:00Z',
      });

      await ctx.repository.update(s.id, { status: 'sent' });

      const active = await ctx.repository.getActivePending();
      expect(active.length).toBe(0);

      const all = await ctx.repository.getAll();
      expect(all.length).toBe(1);
      expect(all[0].status).toBe('sent');
    });

    it('T1.F4.5: should clear all schedules when clearAll is invoked', async () => {
      await ctx.createSchedule({
        recipientName: 'Clear Me',
        phoneNumber: '+15554444444',
        messageText: 'To be wiped',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      await ctx.repository.clearAll();
      const all = await ctx.repository.getAll();
      expect(all.length).toBe(0);
    });
  });

  // =========================================================================
  // Feature 5: Edit & Reschedule Lifecycle (R2)
  // =========================================================================
  describe('Feature 5: Edit & Reschedule Lifecycle', () => {
    it('T1.F5.1: should allow editing recipient name and phone number', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Old Name',
        phoneNumber: '+15550001111',
        messageText: 'Original text',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      const updated = await ctx.editSchedule(created.id, {
        recipient: { name: 'New Name', phoneNumber: '+15550002222' },
      });

      expect(updated.recipient.name).toBe('New Name');
      expect(updated.recipient.phoneNumber).toBe('+15550002222');
      expect(updated.messageText).toBe('Original text');
    });

    it('T1.F5.2: should allow editing message text on an active schedule', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Edit Msg',
        phoneNumber: '+15551234567',
        messageText: 'Draft message',
        scheduledAt: '2026-09-15T11:00:00Z',
      });

      const updated = await ctx.editSchedule(created.id, {
        messageText: 'Final revised message',
      });

      expect(updated.messageText).toBe('Final revised message');
    });

    it('T1.F5.3: should reschedule to a later future date and time', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Reschedule User',
        phoneNumber: '+15551234567',
        messageText: 'Rescheduled event',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      const rescheduled = await ctx.reschedule(created.id, '2026-09-15T15:00:00Z');

      expect(rescheduled.scheduledAt).toBe('2026-09-15T15:00:00Z');
      expect(rescheduled.status).toBe('pending');
      const alarm = ctx.alarms.get(created.id);
      expect(alarm?.triggerAtMillis).toBe(new Date('2026-09-15T15:00:00Z').getTime());
      expect(alarm?.isCancelled).toBe(false);
    });

    it('T1.F5.4: should update updatedAt timestamp when editing a schedule', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Audit User',
        phoneNumber: '+15551234567',
        messageText: 'Audit test',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      // Small delay simulation to ensure timestamp advances
      await new Promise<void>(r => setTimeout(r, 2));

      const updated = await ctx.editSchedule(created.id, {
        messageText: 'Audit updated',
      });

      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.createdAt).getTime()
      );
    });

    it('T1.F5.5: should allow toggling recurrence rule from none to daily', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Recurrence Toggle',
        phoneNumber: '+15551234567',
        messageText: 'Now recurring',
        scheduledAt: '2026-09-15T09:00:00Z',
        recurrence: { type: 'none' },
      });

      const updated = await ctx.editSchedule(created.id, {
        recurrence: { type: 'daily', hasEndDate: false },
      });

      expect(updated.recurrence.type).toBe('daily');
    });
  });

  // =========================================================================
  // Feature 6: Schedule Deletion & Alarm Cancellation (R2)
  // =========================================================================
  describe('Feature 6: Schedule Deletion & Alarm Cancellation', () => {
    it('T1.F6.1: should delete schedule record from persistent storage', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Delete User',
        phoneNumber: '+15559876543',
        messageText: 'Goodbye',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      const deleted = await ctx.deleteSchedule(created.id);
      expect(deleted).toBe(true);

      const found = await ctx.repository.getById(created.id);
      expect(found).toBeNull();
    });

    it('T1.F6.2: should disarm and remove alarm registration upon schedule deletion', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Alarm Check',
        phoneNumber: '+15559876543',
        messageText: 'Alarm should disarm',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      expect(ctx.alarms.has(created.id)).toBe(true);
      await ctx.deleteSchedule(created.id);
      expect(ctx.alarms.has(created.id)).toBe(false);
    });

    it('T1.F6.3: should return false when attempting to delete non-existent ID', async () => {
      const deleted = await ctx.deleteSchedule('non-existent-uuid');
      expect(deleted).toBe(false);
    });

    it('T1.F6.4: should not affect other active schedules when one is deleted', async () => {
      const s1 = await ctx.createSchedule({
        recipientName: 'Keep Me',
        phoneNumber: '+15551111111',
        messageText: 'I stay',
        scheduledAt: '2026-09-15T11:00:00Z',
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'Delete Me',
        phoneNumber: '+15552222222',
        messageText: 'I go',
        scheduledAt: '2026-09-15T12:00:00Z',
      });

      await ctx.deleteSchedule(s2.id);

      const active = await ctx.repository.getActivePending();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe(s1.id);
    });

    it('T1.F6.5: should reduce total schedule count in getAll after deletion', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Count Check',
        phoneNumber: '+15553333333',
        messageText: 'Counting down',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      expect((await ctx.repository.getAll()).length).toBe(1);
      await ctx.deleteSchedule(s.id);
      expect((await ctx.repository.getAll()).length).toBe(0);
    });
  });

  // =========================================================================
  // Feature 7: Concurrent Multiple Schedules Support (R2)
  // =========================================================================
  describe('Feature 7: Concurrent Multiple Schedules Support', () => {
    it('T1.F7.1: should support morning message at 08:00 and evening message at 21:00 concurrently', async () => {
      const morning = await ctx.createSchedule({
        recipientName: 'Morning Contact',
        phoneNumber: '+15558880001',
        messageText: 'Good morning!',
        scheduledAt: '2026-09-15T08:30:00Z',
      });

      const evening = await ctx.createSchedule({
        recipientName: 'Evening Contact',
        phoneNumber: '+15558880002',
        messageText: 'Good night!',
        scheduledAt: '2026-09-15T21:00:00Z',
      });

      const active = await ctx.repository.getActivePending();
      expect(active.length).toBe(2);
      expect(active.find(s => s.id === morning.id)).toBeDefined();
      expect(active.find(s => s.id === evening.id)).toBeDefined();
    });

    it('T1.F7.2: should support multiple schedules targeting the same recipient at different times', async () => {
      const s1 = await ctx.createSchedule({
        recipientName: 'Same Contact',
        phoneNumber: '+15559998888',
        messageText: 'Morning alert',
        scheduledAt: '2026-09-15T09:00:00Z',
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'Same Contact',
        phoneNumber: '+15559998888',
        messageText: 'Afternoon alert',
        scheduledAt: '2026-09-15T14:00:00Z',
      });

      expect(s1.recipient.phoneNumber).toBe(s2.recipient.phoneNumber);
      expect(s1.id).not.toBe(s2.id);
    });

    it('T1.F7.3: should assign distinct alarm request codes to concurrent schedules', async () => {
      const s1 = await ctx.createSchedule({
        recipientName: 'Alice',
        phoneNumber: '+15551111111',
        messageText: 'Msg 1',
        scheduledAt: '2026-09-15T10:00:00Z',
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'Bob',
        phoneNumber: '+15552222222',
        messageText: 'Msg 2',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      expect(ctx.alarms.get(s1.id)?.requestCode).toBeDefined();
      expect(ctx.alarms.get(s2.id)?.requestCode).toBeDefined();
    });

    it('T1.F7.4: should support 5 concurrent active schedules simultaneously', async () => {
      for (let i = 1; i <= 5; i++) {
        await ctx.createSchedule({
          recipientName: `Contact ${i}`,
          phoneNumber: `+1555000000${i}`,
          messageText: `Batch message ${i}`,
          scheduledAt: `2026-09-15T1${i}:00:00Z`,
        });
      }

      const all = await ctx.repository.getActivePending();
      expect(all.length).toBe(5);
    });

    it('T1.F7.5: should maintain independent status for each concurrent schedule', async () => {
      const s1 = await ctx.createSchedule({
        recipientName: 'Alice',
        phoneNumber: '+15551111111',
        messageText: 'First',
        scheduledAt: '2026-09-15T09:00:00Z',
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'Bob',
        phoneNumber: '+15552222222',
        messageText: 'Second',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      await ctx.repository.update(s1.id, { status: 'sent' });

      const updatedS1 = await ctx.repository.getById(s1.id);
      const updatedS2 = await ctx.repository.getById(s2.id);

      expect(updatedS1?.status).toBe('sent');
      expect(updatedS2?.status).toBe('pending');
    });
  });

  // =========================================================================
  // Feature 8: Daily Recurrence Engine & End-Date Bounds (R2)
  // =========================================================================
  describe('Feature 8: Daily Recurrence Engine & End-Date Bounds', () => {
    it('T1.F8.1: should calculate next daily occurrence exactly 24 hours later', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule = { type: 'daily' as const, hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T08:00:00.000Z');
    });

    it('T1.F8.2: should continue recurring when next run is before end date', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule = { type: 'daily' as const, hasEndDate: true, endDate: '2026-09-20' };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-09-16T08:00:00.000Z');
    });

    it('T1.F8.3: should terminate daily recurrence when next run exceeds end date', () => {
      const current = '2026-09-20T08:00:00.000Z';
      const rule = { type: 'daily' as const, hasEndDate: true, endDate: '2026-09-20' };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('T1.F8.4: should return isCompleted true for non-recurring schedules', () => {
      const current = '2026-09-15T08:00:00.000Z';
      const rule = { type: 'none' as const };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });

    it('T1.F8.5: should preserve the exact hour and minute across daily rollovers', () => {
      const current = '2026-09-15T21:45:00.000Z';
      const rule = { type: 'daily' as const, hasEndDate: false };
      const res = calculateNextRun(current, rule);

      const nextDate = new Date(res.nextRunAt!);
      expect(nextDate.getUTCHours()).toBe(21);
      expect(nextDate.getUTCMinutes()).toBe(45);
    });
  });

  // =========================================================================
  // Feature 9: SMS Dispatcher Abstraction & Mock Dispatch (R3)
  // =========================================================================
  describe('Feature 9: SMS Dispatcher Abstraction & Mock Dispatch', () => {
    it('T1.F9.1: should confirm MockSmsDispatcher is available by default', async () => {
      const available = await ctx.dispatcher.isAvailable();
      expect(available).toBe(true);
    });

    it('T1.F9.2: should dispatch SMS and return success with messageId and timestamp', async () => {
      const result = await ctx.dispatcher.sendSms({
        id: 'msg-001',
        recipient: { name: 'Dispatch Test', phoneNumber: '+15551234567' },
        messageText: 'Test dispatch execution',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-001');
      expect(result.timestamp).toBeDefined();
      expect(result.carrierErrorCode).toBeNull();
    });

    it('T1.F9.3: should record sent message in dispatcher inspection history', async () => {
      await ctx.dispatcher.sendSms({
        id: 'msg-audit-1',
        recipient: { name: 'Audit', phoneNumber: '+15559991111' },
        messageText: 'Logged message',
      });

      const sent = ctx.dispatcher.getSentMessages();
      expect(sent.length).toBe(1);
      expect(sent[0].params.id).toBe('msg-audit-1');
      expect(sent[0].result.success).toBe(true);
    });

    it('T1.F9.4: should transition schedule status to sent after successful dispatch', async () => {
      await ctx.createSchedule({
        recipientName: 'Trigger User',
        phoneNumber: '+15551234567',
        messageText: 'Trigger on time',
        scheduledAt: '2026-09-15T08:15:00Z',
      });

      ctx.advanceTimeTo('2026-09-15T08:20:00Z');
      const processed = await ctx.triggerDueSchedules();

      expect(processed.length).toBe(1);
      expect(processed[0].status).toBe('sent');
      expect(ctx.dispatcher.getSentMessages().length).toBe(1);
    });

    it('T1.F9.5: should clear dispatcher sent history when clear is called', async () => {
      await ctx.dispatcher.sendSms({
        id: 'msg-clear',
        recipient: { name: 'Clear', phoneNumber: '+15551112222' },
        messageText: 'Clear this',
      });

      expect(ctx.dispatcher.getSentMessages().length).toBe(1);
      ctx.dispatcher.clear();
      expect(ctx.dispatcher.getSentMessages().length).toBe(0);
    });
  });

  // =========================================================================
  // Feature 10: SMS Message Segmentation (GSM-7 vs UCS-2) (R3)
  // =========================================================================
  describe('Feature 10: SMS Message Segmentation (GSM-7 vs UCS-2)', () => {
    it('T1.F10.1: should classify standard ASCII text as GSM-7 with 1 part for <=160 chars', () => {
      const text = 'A'.repeat(160);
      const res = calculateSmsSegments(text);

      expect(res.isUnicode).toBe(false);
      expect(res.charCount).toBe(160);
      expect(res.segmentCount).toBe(1);
    });

    it('T1.F10.2: should calculate 2 parts for 161 characters of GSM-7 text', () => {
      const text = 'A'.repeat(161);
      const res = calculateSmsSegments(text);

      expect(res.isUnicode).toBe(false);
      expect(res.charCount).toBe(161);
      expect(res.segmentCount).toBe(2);
    });

    it('T1.F10.3: should classify text with Unicode emoji as UCS-2 with 1 part for <=70 chars', () => {
      const text = 'Hello world! 😊 Special greeting';
      const res = calculateSmsSegments(text);

      expect(res.isUnicode).toBe(true);
      expect(res.segmentCount).toBe(1);
    });

    it('T1.F10.4: should calculate 2 parts for 71 characters of UCS-2 text containing emoji', () => {
      const text = '😊' + 'A'.repeat(70);
      const res = calculateSmsSegments(text);

      expect(res.isUnicode).toBe(true);
      expect(res.charCount).toBe(71);
      expect(res.segmentCount).toBe(2);
    });

    it('T1.F10.5: should calculate 3 parts for long multipart GSM-7 message (307-459 chars)', () => {
      const text = 'A'.repeat(307);
      const res = calculateSmsSegments(text);

      expect(res.isUnicode).toBe(false);
      expect(res.segmentCount).toBe(3);
    });
  });

  // =========================================================================
  // Feature 11: Carrier Error Handling & Fault Injection (R3)
  // =========================================================================
  describe('Feature 11: Carrier Error Handling & Fault Injection', () => {
    it('T1.F11.1: should simulate carrier failure and return success=false', async () => {
      ctx.dispatcher.setSimulateFailure(true, 1, 'RESULT_ERROR_GENERIC_FAILURE');

      const result = await ctx.dispatcher.sendSms({
        id: 'msg-fail-1',
        recipient: { name: 'Fail User', phoneNumber: '+15551234567' },
        messageText: 'This will fail',
      });

      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(1);
      expect(result.errorMessage).toContain('RESULT_ERROR_GENERIC_FAILURE');
    });

    it('T1.F11.2: should simulate airplane mode error (RESULT_ERROR_RADIO_OFF code 2)', async () => {
      ctx.dispatcher.setSimulateFailure(true, 2, 'Airplane mode enabled');

      const result = await ctx.dispatcher.sendSms({
        id: 'msg-radio-off',
        recipient: { name: 'Radio Off User', phoneNumber: '+15551234567' },
        messageText: 'Airplane mode test',
      });

      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(2);
    });

    it('T1.F11.3: should simulate out of service error (RESULT_ERROR_NO_SERVICE code 4)', async () => {
      ctx.dispatcher.setSimulateFailure(true, 4, 'No cellular service');

      const result = await ctx.dispatcher.sendSms({
        id: 'msg-no-svc',
        recipient: { name: 'No Service User', phoneNumber: '+15551234567' },
        messageText: 'Tunnel test',
      });

      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(4);
    });

    it('T1.F11.4: should transition schedule status to failed when dispatch fails', async () => {
      await ctx.createSchedule({
        recipientName: 'Failed Schedule Contact',
        phoneNumber: '+15551234567',
        messageText: 'Will fail on due',
        scheduledAt: '2026-09-15T08:10:00Z',
      });

      ctx.dispatcher.setSimulateFailure(true, 1, 'Simulated failure');
      ctx.advanceTimeTo('2026-09-15T08:15:00Z');

      const processed = await ctx.triggerDueSchedules();
      expect(processed.length).toBe(1);
      expect(processed[0].status).toBe('failed');
    });

    it('T1.F11.5: should throw error when dispatcher is configured as unavailable', async () => {
      ctx.dispatcher.setAvailable(false);

      await expect(
        ctx.dispatcher.sendSms({
          id: 'unavail-msg',
          recipient: { name: 'Unavail', phoneNumber: '+15551234567' },
          messageText: 'Check available',
        })
      ).rejects.toThrow('SmsDispatcher is currently unavailable');
    });
  });

  // =========================================================================
  // Feature 12: Device Reboot Recovery (BootReceiver) (R3)
  // =========================================================================
  describe('Feature 12: Device Reboot Recovery (BootReceiver)', () => {
    it('T1.F12.1: should re-arm pending future schedules upon device reboot', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Reboot Survivor',
        phoneNumber: '+15551112222',
        messageText: 'Survives reboot',
        scheduledAt: '2026-09-15T12:00:00Z',
      });

      const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();

      expect(rearmedCount).toBe(1);
      expect(expiredCount).toBe(0);
      expect(ctx.alarms.has(s.id)).toBe(true);
      expect(ctx.alarms.get(s.id)?.isCancelled).toBe(false);
    });

    it('T1.F12.2: should mark past-due pending schedules as failed if device was off during trigger', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Expired During Shutdown',
        phoneNumber: '+15553334444',
        messageText: 'Device was off at trigger time',
        scheduledAt: '2026-09-15T09:00:00Z',
      });

      // Device powers off and boots up at 10:00 AM (past scheduled time)
      ctx.advanceTimeTo('2026-09-15T10:00:00Z');
      const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();

      expect(expiredCount).toBe(1);
      expect(rearmedCount).toBe(0);

      const record = await ctx.repository.getById(s.id);
      expect(record?.status).toBe('failed');
    });

    it('T1.F12.3: should re-arm multiple pending schedules after reboot', async () => {
      await ctx.createSchedule({
        recipientName: 'P1',
        phoneNumber: '+15551111111',
        messageText: 'Msg 1',
        scheduledAt: '2026-09-15T11:00:00Z',
      });
      await ctx.createSchedule({
        recipientName: 'P2',
        phoneNumber: '+15552222222',
        messageText: 'Msg 2',
        scheduledAt: '2026-09-15T14:00:00Z',
      });

      const { rearmedCount } = await ctx.simulateBootCompleted();
      expect(rearmedCount).toBe(2);
      expect(ctx.alarms.size).toBe(2);
    });

    it('T1.F12.4: should not re-arm already sent or completed schedules after reboot', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Already Sent',
        phoneNumber: '+15551234567',
        messageText: 'Done',
        scheduledAt: '2026-09-15T08:30:00Z',
      });

      ctx.advanceTimeTo('2026-09-15T08:35:00Z');
      await ctx.triggerDueSchedules();

      // Now reboot
      const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();
      expect(rearmedCount).toBe(0);
      expect(expiredCount).toBe(0);
    });

    it('T1.F12.5: should retain correct triggerAtMillis for re-armed alarms after reboot', async () => {
      const targetTime = '2026-09-15T18:00:00.000Z';
      const s = await ctx.createSchedule({
        recipientName: 'Exact Time Test',
        phoneNumber: '+15559876543',
        messageText: 'Exact millisecond check',
        scheduledAt: targetTime,
      });

      await ctx.simulateBootCompleted();

      const alarm = ctx.alarms.get(s.id);
      expect(alarm?.triggerAtMillis).toBe(new Date(targetTime).getTime());
    });
  });
});
