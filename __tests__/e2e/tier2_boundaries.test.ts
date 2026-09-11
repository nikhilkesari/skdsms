/**
 * Tier 2: Boundary & Corner Cases
 *
 * Requirements: >= 5 tests per inventoried feature covering boundary, limit, and edge cases.
 * Authoritative Sources: ORIGINAL_REQUEST.md (R1, R2, R3), PROJECT.md, Survey Reports.
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

describe('Tier 2: Boundary & Corner Cases', () => {
  let ctx: E2ETestContext;
  const BASE_TIME = new Date('2026-09-15T08:00:00Z');

  beforeEach(() => {
    ctx = new E2ETestContext(BASE_TIME);
  });

  // =========================================================================
  // Feature 1: Schedule Creation Boundaries (R1)
  // =========================================================================
  describe('Feature 1: Schedule Creation Boundaries', () => {
    it('T2.F1.1: should reject schedule creation when recipient name is empty', async () => {
      await expect(
        ctx.createSchedule({
          recipientName: '',
          phoneNumber: '+15551234567',
          messageText: 'Test message',
          scheduledAt: '2026-09-15T10:00:00Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR: Recipient name is required/);
    });

    it('T2.F1.2: should reject schedule creation when recipient name is only whitespace', async () => {
      await expect(
        ctx.createSchedule({
          recipientName: '    \t   ',
          phoneNumber: '+15551234567',
          messageText: 'Test message',
          scheduledAt: '2026-09-15T10:00:00Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR: Recipient name is required/);
    });

    it('T2.F1.3: should reject schedule creation when message text is empty string', async () => {
      await expect(
        ctx.createSchedule({
          recipientName: 'Valid Name',
          phoneNumber: '+15551234567',
          messageText: '',
          scheduledAt: '2026-09-15T10:00:00Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR: Message text is required/);
    });

    it('T2.F1.4: should reject schedule creation when message text is only whitespace/newlines', async () => {
      await expect(
        ctx.createSchedule({
          recipientName: 'Valid Name',
          phoneNumber: '+15551234567',
          messageText: '\n   \t  \r\n',
          scheduledAt: '2026-09-15T10:00:00Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR: Message text is required/);
    });

    it('T2.F1.5: should accept single non-whitespace character as minimum valid message', async () => {
      const schedule = await ctx.createSchedule({
        recipientName: 'Valid Name',
        phoneNumber: '+15551234567',
        messageText: '!',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      expect(schedule.messageText).toBe('!');
      expect(schedule.status).toBe('pending');
    });
  });

  // =========================================================================
  // Feature 2: Past Date & Time Boundaries (R1)
  // =========================================================================
  describe('Feature 2: Past Date & Time Boundaries', () => {
    it('T2.F2.1: should reject schedule set in the past (1 hour ago)', () => {
      const pastTime = new Date(BASE_TIME.getTime() - 60 * 60 * 1000);
      const res = validateScheduledTime(pastTime, BASE_TIME);

      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Scheduled time must be in the future');
    });

    it('T2.F2.2: should reject schedule set to exact current second (now)', () => {
      const res = validateScheduledTime(BASE_TIME, BASE_TIME);

      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Scheduled time must be in the future');
    });

    it('T2.F2.3: should reject schedule within minimum buffer lead time (10 seconds from now)', () => {
      const insideBuffer = new Date(BASE_TIME.getTime() + 10 * 1000);
      const res = validateScheduledTime(insideBuffer, BASE_TIME, 30000); // 30s buffer

      expect(res.isValid).toBe(false);
      expect(res.error).toContain('minimum 30 seconds from now');
    });

    it('T2.F2.4: should accept schedule exactly at buffer lead boundary (30 seconds from now)', () => {
      const atBuffer = new Date(BASE_TIME.getTime() + 30 * 1000);
      const res = validateScheduledTime(atBuffer, BASE_TIME, 30000);

      expect(res.isValid).toBe(true);
    });

    it('T2.F2.5: should reject malformed or non-date string', () => {
      const res = validateScheduledTime('invalid-date-string-xyz', BASE_TIME);

      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Invalid date or time format');
    });
  });

  // =========================================================================
  // Feature 3: Phone Number Boundaries (R1)
  // =========================================================================
  describe('Feature 3: Phone Number Boundaries', () => {
    it('T2.F3.1: should reject phone number shorter than 7 digits', () => {
      const res = validatePhoneNumber('12345');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('too short');
    });

    it('T2.F3.2: should reject phone number longer than 15 digits', () => {
      const res = validatePhoneNumber('+1234567890123456'); // 16 digits
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('exceeds maximum length');
    });

    it('T2.F3.3: should reject empty phone number string', () => {
      const res = validatePhoneNumber('');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Phone number is required');
    });

    it('T2.F3.4: should reject string containing only alphabetic or special characters', () => {
      const res = validatePhoneNumber('abc-def-ghij');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Phone number is required');
    });

    it('T2.F3.5: should accept minimum length 7-digit local number', () => {
      const res = validatePhoneNumber('5551234');
      expect(res.isValid).toBe(true);
    });
  });

  // =========================================================================
  // Feature 4: Schedule Persistence Boundaries (R2)
  // =========================================================================
  describe('Feature 4: Schedule Persistence Boundaries', () => {
    it('T2.F4.1: should return null when querying getById with non-existent UUID', async () => {
      const found = await ctx.repository.getById('non-existent-uuid-1234');
      expect(found).toBeNull();
    });

    it('T2.F4.2: should throw error when attempting to update non-existent schedule', async () => {
      await expect(
        ctx.repository.update('non-existent-uuid', { messageText: 'New text' })
      ).rejects.toThrow(/not found/);
    });

    it('T2.F4.3: should handle clearAll on already empty repository gracefully', async () => {
      await ctx.repository.clearAll();
      const all = await ctx.repository.getAll();
      expect(all).toEqual([]);
    });

    it('T2.F4.4: should create distinct unique records when identical content is scheduled multiple times', async () => {
      const payload = {
        recipientName: 'Clone User',
        phoneNumber: '+15551234567',
        messageText: 'Identical payload',
        scheduledAt: '2026-09-15T11:00:00Z',
      };

      const s1 = await ctx.createSchedule(payload);
      const s2 = await ctx.createSchedule(payload);

      expect(s1.id).not.toBe(s2.id);
      expect(s1.recipient.name).toBe(s2.recipient.name);
      expect(s1.messageText).toBe(s2.messageText);
    });

    it('T2.F4.5: should preserve all existing properties when update contains empty fields', async () => {
      const created = await ctx.createSchedule({
        recipientName: 'Keep State',
        phoneNumber: '+15551234567',
        messageText: 'Original text',
        scheduledAt: '2026-09-15T11:00:00Z',
      });

      const updated = await ctx.repository.update(created.id, {});

      expect(updated.recipient.name).toBe(created.recipient.name);
      expect(updated.recipient.phoneNumber).toBe(
        created.recipient.phoneNumber
      );
      expect(updated.messageText).toBe(created.messageText);
      expect(updated.scheduledAt).toBe(created.scheduledAt);
    });
  });

  // =========================================================================
  // Feature 5: Edit & Reschedule Boundaries (R2)
  // =========================================================================
  describe('Feature 5: Edit & Reschedule Boundaries', () => {
    it('T2.F5.1: should reject rescheduling to a timestamp in the past', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Past Reschedule',
        phoneNumber: '+15551234567',
        messageText: 'Msg',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      await expect(
        ctx.reschedule(s.id, '2026-09-15T07:00:00Z') // 1 hr before BASE_TIME
      ).rejects.toThrow(/VALIDATION_ERROR: Scheduled time must be in the future/);
    });

    it('T2.F5.2: should reject editing phone number to invalid format', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Bad Phone Edit',
        phoneNumber: '+15551234567',
        messageText: 'Msg',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      await expect(
        ctx.editSchedule(s.id, { phoneNumber: '12345' })
      ).rejects.toThrow(/VALIDATION_ERROR: Phone number is too short/);
    });

    it('T2.F5.3: should reject editing message text to whitespace only', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Blank Edit',
        phoneNumber: '+15551234567',
        messageText: 'Valid msg',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      await expect(
        ctx.editSchedule(s.id, { messageText: '   ' })
      ).rejects.toThrow(/VALIDATION_ERROR: Message text is required/);
    });

    it('T2.F5.4: should throw error when editing non-existent schedule', async () => {
      await expect(
        ctx.editSchedule('non-existent-id', { messageText: 'New text' })
      ).rejects.toThrow(/Schedule non-existent-id not found/);
    });

    it('T2.F5.5: should throw error when rescheduling non-existent schedule', async () => {
      await expect(
        ctx.reschedule('non-existent-id', '2026-09-15T12:00:00Z')
      ).rejects.toThrow(/Schedule non-existent-id not found/);
    });
  });

  // =========================================================================
  // Feature 6: Schedule Deletion Boundaries (R2)
  // =========================================================================
  describe('Feature 6: Schedule Deletion Boundaries', () => {
    it('T2.F6.1: should return false when deleting already deleted schedule', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Double Delete',
        phoneNumber: '+15551234567',
        messageText: 'Delete twice',
        scheduledAt: '2026-09-15T10:00:00Z',
      });

      const first = await ctx.deleteSchedule(s.id);
      expect(first).toBe(true);

      const second = await ctx.deleteSchedule(s.id);
      expect(second).toBe(false);
    });

    it('T2.F6.2: should return false when deleting with empty string ID', async () => {
      const res = await ctx.deleteSchedule('');
      expect(res).toBe(false);
    });

    it('T2.F6.3: should delete sent schedule without throwing error', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Sent Delete',
        phoneNumber: '+15551234567',
        messageText: 'Sent then deleted',
        scheduledAt: '2026-09-15T08:10:00Z',
      });

      ctx.advanceTimeTo('2026-09-15T08:15:00Z');
      await ctx.triggerDueSchedules();

      const deleted = await ctx.deleteSchedule(s.id);
      expect(deleted).toBe(true);
      expect(await ctx.repository.getById(s.id)).toBeNull();
    });

    it('T2.F6.4: should delete recurring schedule and ensure next alarm is disarmed', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Recurring Delete',
        phoneNumber: '+15551234567',
        messageText: 'Daily repeat delete',
        scheduledAt: '2026-09-15T09:00:00Z',
        recurrence: { type: 'daily', hasEndDate: false },
      });

      expect(ctx.alarms.has(s.id)).toBe(true);
      await ctx.deleteSchedule(s.id);
      expect(ctx.alarms.has(s.id)).toBe(false);
    });

    it('T2.F6.5: should maintain accurate total count after deleting all items one by one', async () => {
      const s1 = await ctx.createSchedule({
        recipientName: 'A',
        phoneNumber: '+15551111111',
        messageText: 'M1',
        scheduledAt: '2026-09-15T10:00:00Z',
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'B',
        phoneNumber: '+15552222222',
        messageText: 'M2',
        scheduledAt: '2026-09-15T11:00:00Z',
      });

      await ctx.deleteSchedule(s1.id);
      expect((await ctx.repository.getAll()).length).toBe(1);

      await ctx.deleteSchedule(s2.id);
      expect((await ctx.repository.getAll()).length).toBe(0);
    });
  });

  // =========================================================================
  // Feature 7: Concurrent Schedules Boundaries (R2)
  // =========================================================================
  describe('Feature 7: Concurrent Schedules Boundaries', () => {
    it('T2.F7.1: should support multiple distinct schedules set to the exact same millisecond', async () => {
      const exactTime = '2026-09-15T10:00:00.000Z';
      const s1 = await ctx.createSchedule({
        recipientName: 'User A',
        phoneNumber: '+15551111111',
        messageText: 'Same second A',
        scheduledAt: exactTime,
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'User B',
        phoneNumber: '+15552222222',
        messageText: 'Same second B',
        scheduledAt: exactTime,
      });

      expect(s1.id).not.toBe(s2.id);
      expect(s1.scheduledAt).toBe(s2.scheduledAt);
      const active = await ctx.repository.getActivePending();
      expect(active.length).toBe(2);
    });

    it('T2.F7.2: should support 10 simultaneous concurrent schedules without data race', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        ctx.createSchedule({
          recipientName: `Parallel ${i}`,
          phoneNumber: `+155500000${String(i).padStart(2, '0')}`,
          messageText: `Parallel task ${i}`,
          scheduledAt: '2026-09-15T12:00:00Z',
        })
      );

      const created = await Promise.all(promises);
      expect(created.length).toBe(10);
      const all = await ctx.repository.getAll();
      expect(all.length).toBe(10);
    });

    it('T2.F7.3: should delete one schedule without altering status or alarm of sibling same-time schedule', async () => {
      const exactTime = '2026-09-15T14:00:00Z';
      const s1 = await ctx.createSchedule({
        recipientName: 'Sibling 1',
        phoneNumber: '+15551111111',
        messageText: 'Stay',
        scheduledAt: exactTime,
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'Sibling 2',
        phoneNumber: '+15552222222',
        messageText: 'Remove',
        scheduledAt: exactTime,
      });

      await ctx.deleteSchedule(s2.id);

      expect(ctx.alarms.has(s1.id)).toBe(true);
      expect(ctx.alarms.has(s2.id)).toBe(false);
      const active = await ctx.repository.getActivePending();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe(s1.id);
    });

    it('T2.F7.4: should update one concurrent schedule without impacting another with identical text', async () => {
      const s1 = await ctx.createSchedule({
        recipientName: 'Recipient 1',
        phoneNumber: '+15551111111',
        messageText: 'Common text',
        scheduledAt: '2026-09-15T15:00:00Z',
      });
      const s2 = await ctx.createSchedule({
        recipientName: 'Recipient 2',
        phoneNumber: '+15552222222',
        messageText: 'Common text',
        scheduledAt: '2026-09-15T15:00:00Z',
      });

      await ctx.editSchedule(s1.id, { messageText: 'Customized text 1' });

      const updatedS1 = await ctx.repository.getById(s1.id);
      const unchangedS2 = await ctx.repository.getById(s2.id);

      expect(updatedS1?.messageText).toBe('Customized text 1');
      expect(unchangedS2?.messageText).toBe('Common text');
    });

    it('T2.F7.5: should trigger both same-time schedules simultaneously when time arrives', async () => {
      const targetTime = '2026-09-15T09:30:00Z';
      await ctx.createSchedule({
        recipientName: 'Simul 1',
        phoneNumber: '+15551111111',
        messageText: 'Simul A',
        scheduledAt: targetTime,
      });
      await ctx.createSchedule({
        recipientName: 'Simul 2',
        phoneNumber: '+15552222222',
        messageText: 'Simul B',
        scheduledAt: targetTime,
      });

      ctx.advanceTimeTo('2026-09-15T09:30:00Z');
      const processed = await ctx.triggerDueSchedules();

      expect(processed.length).toBe(2);
      expect(ctx.dispatcher.getSentMessages().length).toBe(2);
    });
  });

  // =========================================================================
  // Feature 8: Daily Recurrence Engine Boundaries (R2)
  // =========================================================================
  describe('Feature 8: Daily Recurrence Engine Boundaries', () => {
    it('T2.F8.1: should reject schedule creation when recurrence end date is earlier than scheduled date', async () => {
      await expect(
        ctx.createSchedule({
          recipientName: 'Bad Recurrence End',
          phoneNumber: '+15551234567',
          messageText: 'Invalid end date',
          scheduledAt: '2026-09-20T10:00:00Z',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-15', // 5 days earlier
          },
        })
      ).rejects.toThrow(/Recurrence end date cannot be earlier/);
    });

    it('T2.F8.2: should reject recurrence rule with invalid end date string format', () => {
      const res = validateScheduleInput(
        {
          recipientName: 'Invalid End Date',
          phoneNumber: '+15551234567',
          messageText: 'Format check',
          scheduledDate: '2026-09-15T10:00:00Z',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: 'not-a-valid-date',
          },
        },
        BASE_TIME
      );

      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toContain('Invalid recurrence end date format');
    });

    it('T2.F8.3: should correctly roll over across month boundary (Sep 30 to Oct 01)', () => {
      const current = '2026-09-30T08:00:00.000Z';
      const rule = { type: 'daily' as const, hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2026-10-01T08:00:00.000Z');
    });

    it('T2.F8.4: should correctly roll over across year boundary (Dec 31 to Jan 01)', () => {
      const current = '2026-12-31T23:30:00.000Z';
      const rule = { type: 'daily' as const, hasEndDate: false };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(false);
      expect(res.nextRunAt).toBe('2027-01-01T23:30:00.000Z');
    });

    it('T2.F8.5: should complete when next run timestamp matches or exceeds end of endDate day', () => {
      const current = '2026-09-15T20:00:00.000Z';
      const rule = { type: 'daily' as const, hasEndDate: true, endDate: '2026-09-15' };
      const res = calculateNextRun(current, rule);

      expect(res.isCompleted).toBe(true);
      expect(res.nextRunAt).toBeNull();
    });
  });

  // =========================================================================
  // Feature 9: SMS Dispatcher Boundaries (R3)
  // =========================================================================
  describe('Feature 9: SMS Dispatcher Boundaries', () => {
    it('T2.F9.1: should dispatch message with maximum length text without truncation', async () => {
      const longMessage = 'A'.repeat(500);
      const result = await ctx.dispatcher.sendSms({
        id: 'msg-max-len',
        recipient: { name: 'Max Len', phoneNumber: '+15551234567' },
        messageText: longMessage,
      });

      expect(result.success).toBe(true);
      expect(result.partsCount).toBe(4); // ceil(500 / 153) = 4
    });

    it('T2.F9.2: should support simulated delay without losing message data', async () => {
      ctx.dispatcher.setSimulateDelay(10); // 10ms delay

      const result = await ctx.dispatcher.sendSms({
        id: 'msg-delay',
        recipient: { name: 'Delayed', phoneNumber: '+15551234567' },
        messageText: 'Delayed text',
      });

      expect(result.success).toBe(true);
      expect(ctx.dispatcher.getLastSentMessage()?.params.id).toBe('msg-delay');
    });

    it('T2.F9.3: should correctly preserve custom subscriptionId for Multi-SIM devices', async () => {
      const result = await ctx.dispatcher.sendSms({
        id: 'msg-sim2',
        recipient: { name: 'Dual SIM', phoneNumber: '+15551234567' },
        messageText: 'SIM 2 transmission',
        subscriptionId: 2,
      });

      expect(result.success).toBe(true);
      const sent = ctx.dispatcher.getLastSentMessage();
      expect(sent?.params.subscriptionId).toBe(2);
    });

    it('T2.F9.4: should record accurate ISO timestamp upon dispatch execution', async () => {
      const result = await ctx.dispatcher.sendSms({
        id: 'msg-iso-time',
        recipient: { name: 'Time Check', phoneNumber: '+15551234567' },
        messageText: 'Check time',
      });

      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });

    it('T2.F9.5: should return undefined when calling getLastSentMessage on empty dispatcher', () => {
      expect(ctx.dispatcher.getLastSentMessage()).toBeUndefined();
    });
  });

  // =========================================================================
  // Feature 10: SMS Segmentation Boundaries (GSM-7 vs UCS-2) (R3)
  // =========================================================================
  describe('Feature 10: SMS Segmentation Boundaries', () => {
    it('T2.F10.1: should return 0 parts and 0 length for empty string', () => {
      const res = calculateSmsSegments('');
      expect(res.charCount).toBe(0);
      expect(res.segmentCount).toBe(0);
    });

    it('T2.F10.2: should handle exact 160-char GSM-7 boundary as 1 part and 161-char as 2 parts', () => {
      const text160 = 'B'.repeat(160);
      const text161 = 'B'.repeat(161);

      expect(calculateSmsSegments(text160).segmentCount).toBe(1);
      expect(calculateSmsSegments(text161).segmentCount).toBe(2);
    });

    it('T2.F10.3: should handle exact 70-char UCS-2 boundary as 1 part and 71-char as 2 parts', () => {
      // 1 emoji (count as 1 char) + 69 ASCII = 70 chars
      const text70 = '🌟' + 'C'.repeat(69);
      // 1 emoji + 70 ASCII = 71 chars
      const text71 = '🌟' + 'C'.repeat(70);

      expect(calculateSmsSegments(text70).segmentCount).toBe(1);
      expect(calculateSmsSegments(text71).segmentCount).toBe(2);
    });

    it('T2.F10.4: should detect non-Latin scripts (Devanagari / Hindi) as Unicode UCS-2', () => {
      const hindiGreeting = 'नमस्ते दुनिया'; // Hello world in Hindi
      const res = calculateSmsSegments(hindiGreeting);

      expect(res.isUnicode).toBe(true);
      expect(res.segmentCount).toBe(1); // Fits in 70 chars
    });

    it('T2.F10.5: should calculate 5 parts for large 650-character GSM-7 text', () => {
      const text650 = 'D'.repeat(650);
      const res = calculateSmsSegments(text650);

      // 650 / 153 = 4.24 -> 5 parts
      expect(res.segmentCount).toBe(5);
    });
  });

  // =========================================================================
  // Feature 11: Carrier Error Handling Boundaries (R3)
  // =========================================================================
  describe('Feature 11: Carrier Error Handling Boundaries', () => {
    it('T2.F11.1: should handle custom carrier error code (code 9999)', async () => {
      ctx.dispatcher.setSimulateFailure(true, 9999, 'Custom carrier gateway timeout');

      const result = await ctx.dispatcher.sendSms({
        id: 'msg-custom-err',
        recipient: { name: 'Err', phoneNumber: '+15551234567' },
        messageText: 'Error test',
      });

      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(9999);
      expect(result.errorMessage).toBe('Custom carrier gateway timeout');
    });

    it('T2.F11.2: should recover and succeed when simulateFailure is toggled back to false', async () => {
      ctx.dispatcher.setSimulateFailure(true, 1);
      const failResult = await ctx.dispatcher.sendSms({
        id: 'msg-failing',
        recipient: { name: 'Recover', phoneNumber: '+15551234567' },
        messageText: 'Fail first',
      });
      expect(failResult.success).toBe(false);

      // Recover
      ctx.dispatcher.setSimulateFailure(false);
      const successResult = await ctx.dispatcher.sendSms({
        id: 'msg-recovered',
        recipient: { name: 'Recover', phoneNumber: '+15551234567' },
        messageText: 'Now succeed',
      });
      expect(successResult.success).toBe(true);
    });

    it('T2.F11.3: should simulate rate limiting error (RESULT_ERROR_LIMIT_EXCEEDED code 5)', async () => {
      ctx.dispatcher.setSimulateFailure(true, 5, 'Rate limit throttled');

      const result = await ctx.dispatcher.sendSms({
        id: 'msg-rate-limit',
        recipient: { name: 'Throttled', phoneNumber: '+15551234567' },
        messageText: 'Spam check',
      });

      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(5);
    });

    it('T2.F11.4: should allow rescheduling a failed schedule to a new time', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Retry Contact',
        phoneNumber: '+15551234567',
        messageText: 'Will fail then retry',
        scheduledAt: '2026-09-15T08:10:00Z',
      });

      ctx.dispatcher.setSimulateFailure(true, 1);
      ctx.advanceTimeTo('2026-09-15T08:15:00Z');
      await ctx.triggerDueSchedules();

      const failedRecord = await ctx.repository.getById(s.id);
      expect(failedRecord?.status).toBe('failed');

      // Reschedule for 11:00 AM
      const rescheduled = await ctx.reschedule(s.id, '2026-09-15T11:00:00Z');
      expect(rescheduled.status).toBe('pending');
      expect(rescheduled.scheduledAt).toBe('2026-09-15T11:00:00Z');
    });

    it('T2.F11.5: should retain failed status if no trigger has run', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'No Trigger',
        phoneNumber: '+15551234567',
        messageText: 'Pending unchanged',
        scheduledAt: '2026-09-15T12:00:00Z',
      });

      expect((await ctx.repository.getById(s.id))?.status).toBe('pending');
    });
  });

  // =========================================================================
  // Feature 12: Device Reboot Boundaries (R3)
  // =========================================================================
  describe('Feature 12: Device Reboot Boundaries', () => {
    it('T2.F12.1: should handle reboot cleanly when repository is completely empty', async () => {
      const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();
      expect(rearmedCount).toBe(0);
      expect(expiredCount).toBe(0);
      expect(ctx.alarms.size).toBe(0);
    });

    it('T2.F12.2: should handle reboot when all schedules expired during power-off', async () => {
      await ctx.createSchedule({
        recipientName: 'E1',
        phoneNumber: '+15551111111',
        messageText: 'M1',
        scheduledAt: '2026-09-15T08:30:00Z',
      });
      await ctx.createSchedule({
        recipientName: 'E2',
        phoneNumber: '+15552222222',
        messageText: 'M2',
        scheduledAt: '2026-09-15T08:45:00Z',
      });

      ctx.advanceTimeTo('2026-09-15T12:00:00Z'); // 3 hours later
      const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();

      expect(rearmedCount).toBe(0);
      expect(expiredCount).toBe(2);
      expect(ctx.alarms.size).toBe(0);
    });

    it('T2.F12.3: should correctly partition mixed expired and future schedules upon reboot', async () => {
      // Expired
      await ctx.createSchedule({
        recipientName: 'Expired',
        phoneNumber: '+15551111111',
        messageText: 'Past',
        scheduledAt: '2026-09-15T08:30:00Z',
      });
      // Future
      await ctx.createSchedule({
        recipientName: 'Future',
        phoneNumber: '+15552222222',
        messageText: 'Future',
        scheduledAt: '2026-09-15T14:00:00Z',
      });

      ctx.advanceTimeTo('2026-09-15T10:00:00Z');
      const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();

      expect(rearmedCount).toBe(1);
      expect(expiredCount).toBe(1);
      expect(ctx.alarms.size).toBe(1);
    });

    it('T2.F12.4: should not revive cancelled or deleted schedules on reboot', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Deleted Before Boot',
        phoneNumber: '+15551234567',
        messageText: 'Should stay dead',
        scheduledAt: '2026-09-15T16:00:00Z',
      });

      await ctx.deleteSchedule(s.id);
      const { rearmedCount } = await ctx.simulateBootCompleted();

      expect(rearmedCount).toBe(0);
      expect(ctx.alarms.has(s.id)).toBe(false);
    });

    it('T2.F12.5: should retain status completed for finished recurring schedules across reboot', async () => {
      const s = await ctx.createSchedule({
        recipientName: 'Finished Recurring',
        phoneNumber: '+15551234567',
        messageText: 'Single day only',
        scheduledAt: '2026-09-15T08:30:00Z',
        recurrence: { type: 'daily', hasEndDate: true, endDate: '2026-09-15' },
      });

      ctx.advanceTimeTo('2026-09-15T08:35:00Z');
      await ctx.triggerDueSchedules();

      const finished = await ctx.repository.getById(s.id);
      expect(finished?.status).toBe('completed');

      // Reboot
      const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();
      expect(rearmedCount).toBe(0);
      expect(expiredCount).toBe(0);

      const afterBoot = await ctx.repository.getById(s.id);
      expect(afterBoot?.status).toBe('completed');
    });
  });
});
