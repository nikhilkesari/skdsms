/**
 * Tier 3: Pairwise Cross-Feature Combinations
 *
 * Requirements: Systematic pairwise interaction testing between subsystem features.
 * Authoritative Sources: ORIGINAL_REQUEST.md (R1, R2, R3), PROJECT.md.
 * Total Tests: 10 comprehensive pairwise cross-feature tests.
 */

import {
  E2ETestContext,
  calculateSmsSegments,
  calculateNextRun,
  validateScheduleInput,
  MockSmsDispatcher,
} from '../helpers/e2eHarness';

describe('Tier 3: Pairwise Cross-Feature Combinations', () => {
  let ctx: E2ETestContext;
  const BASE_TIME = new Date('2026-09-15T08:00:00Z');

  beforeEach(() => {
    ctx = new E2ETestContext(BASE_TIME);
  });

  // -------------------------------------------------------------------------
  // Pairwise 1: Daily Recurrence + In-Flight Reschedule / Edit (F8 x F5)
  // -------------------------------------------------------------------------
  it('T3.1: should allow editing message text and rescheduling a recurring schedule while preserving daily recurrence rule', async () => {
    const s = await ctx.createSchedule({
      recipientName: 'Daily Contact',
      phoneNumber: '+15551112222',
      messageText: 'Daily Morning Report v1',
      scheduledAt: '2026-09-15T09:00:00Z',
      recurrence: { type: 'daily', hasEndDate: false },
    });

    // In-flight edit
    const updated = await ctx.editSchedule(s.id, {
      messageText: 'Daily Morning Report v2 (Revised)',
    });
    expect(updated.messageText).toBe('Daily Morning Report v2 (Revised)');
    expect(updated.recurrence.type).toBe('daily');

    // Reschedule to later today
    const rescheduled = await ctx.reschedule(s.id, '2026-09-15T11:00:00Z');
    expect(rescheduled.scheduledAt).toBe('2026-09-15T11:00:00Z');
    expect(rescheduled.recurrence.type).toBe('daily');

    // Trigger schedule
    ctx.advanceTimeTo('2026-09-15T11:05:00Z');
    const processed = await ctx.triggerDueSchedules();
    expect(processed.length).toBe(1);

    // Verify next run rolled over to tomorrow at 11:00 AM with updated message text
    const nextRecord = await ctx.repository.getById(s.id);
    expect(nextRecord?.status).toBe('pending');
    expect(nextRecord?.scheduledAt).toBe('2026-09-16T11:00:00.000Z');
    expect(nextRecord?.messageText).toBe('Daily Morning Report v2 (Revised)');
  });

  // -------------------------------------------------------------------------
  // Pairwise 2: Concurrent Schedules + Mock Dispatch at Identical Timestamps (F7 x F9)
  // -------------------------------------------------------------------------
  it('T3.2: should concurrently dispatch multiple schedules targeting different contacts at the exact same second', async () => {
    const exactTime = '2026-09-15T10:00:00.000Z';
    const contacts = [
      { name: 'Alice', phone: '+15551111111', msg: 'Alert Alice' },
      { name: 'Bob', phone: '+15552222222', msg: 'Alert Bob' },
      { name: 'Charlie', phone: '+15553333333', msg: 'Alert Charlie' },
    ];

    for (const c of contacts) {
      await ctx.createSchedule({
        recipientName: c.name,
        phoneNumber: c.phone,
        messageText: c.msg,
        scheduledAt: exactTime,
      });
    }

    ctx.advanceTimeTo(exactTime);
    const processed = await ctx.triggerDueSchedules();

    expect(processed.length).toBe(3);
    for (const p of processed) {
      expect(p.status).toBe('sent');
    }

    const sent = ctx.dispatcher.getSentMessages();
    expect(sent.length).toBe(3);
    expect(sent.map(s => s.params.recipient.name)).toEqual(
      expect.arrayContaining(['Alice', 'Bob', 'Charlie'])
    );
  });

  // -------------------------------------------------------------------------
  // Pairwise 3: Schedule Deletion + Alarm Cancellation Verification (F6 x F12)
  // -------------------------------------------------------------------------
  it('T3.3: should disarm alarm upon schedule deletion and ensure it is not resurrected during reboot', async () => {
    const s = await ctx.createSchedule({
      recipientName: 'Ghost Test',
      phoneNumber: '+15554445555',
      messageText: 'To be purged',
      scheduledAt: '2026-09-15T14:00:00Z',
    });

    expect(ctx.alarms.has(s.id)).toBe(true);

    // Delete schedule
    await ctx.deleteSchedule(s.id);
    expect(ctx.alarms.has(s.id)).toBe(false);

    // Simulate device reboot
    const { rearmedCount } = await ctx.simulateBootCompleted();
    expect(rearmedCount).toBe(0);
    expect(ctx.alarms.has(s.id)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Pairwise 4: Phone Normalization + Multi-Part SMS Segmentation (F3 x F10)
  // -------------------------------------------------------------------------
  it('T3.4: should normalize phone formatting while accurately calculating multipart segments for Unicode message', async () => {
    const rawPhone = '  +1 (555) 789-0123  ';
    const unicodeText = '🎉 Big Announcement! ' + 'Important event details: '.repeat(5);

    const s = await ctx.createSchedule({
      recipientName: 'Unicode Recipient',
      phoneNumber: rawPhone,
      messageText: unicodeText,
      scheduledAt: '2026-09-15T09:00:00Z',
    });

    expect(s.recipient.phoneNumber).toBe('+15557890123');

    const segments = calculateSmsSegments(unicodeText);
    expect(segments.isUnicode).toBe(true);
    expect(segments.segmentCount).toBeGreaterThan(1);
    expect(s.partsCount).toBe(segments.segmentCount);

    ctx.advanceTimeTo('2026-09-15T09:05:00Z');
    await ctx.triggerDueSchedules();

    const last = ctx.dispatcher.getLastSentMessage();
    expect(last?.result.partsCount).toBe(segments.segmentCount);
    expect(last?.params.recipient.phoneNumber).toBe('+15557890123');
  });

  // -------------------------------------------------------------------------
  // Pairwise 5: Past Date Boundary Validation + Recurrence Rollover (F2 x F8)
  // -------------------------------------------------------------------------
  it('T3.5: should enforce future validation during initial schedule while recurrence rollover automatically advances to valid future day', async () => {
    // Initial past date is strictly rejected
    const pastValidation = validateScheduleInput(
      {
        recipientName: 'Boundary User',
        phoneNumber: '+15551234567',
        messageText: 'Boundary msg',
        scheduledDate: '2026-09-15T07:30:00Z', // Past
        recurrence: { type: 'daily' },
      },
      BASE_TIME
    );
    expect(pastValidation.isValid).toBe(false);

    // Valid initial future schedule
    const s = await ctx.createSchedule({
      recipientName: 'Boundary User',
      phoneNumber: '+15551234567',
      messageText: 'Boundary msg',
      scheduledAt: '2026-09-15T08:30:00Z',
      recurrence: { type: 'daily' },
    });

    ctx.advanceTimeTo('2026-09-15T08:30:00Z');
    await ctx.triggerDueSchedules();

    const next = await ctx.repository.getById(s.id);
    expect(next?.scheduledAt).toBe('2026-09-16T08:30:00.000Z');
    // Future validation against next day
    expect(new Date(next!.scheduledAt).getTime()).toBeGreaterThan(ctx.currentTime.getTime());
  });

  // -------------------------------------------------------------------------
  // Pairwise 6: Carrier Outage Error Injection + Manual Reschedule (F11 x F5)
  // -------------------------------------------------------------------------
  it('T3.6: should fail on carrier error, record failure status, and recover successfully when rescheduled to later time', async () => {
    const s = await ctx.createSchedule({
      recipientName: 'Resilience User',
      phoneNumber: '+15559998888',
      messageText: 'Network dependent message',
      scheduledAt: '2026-09-15T08:15:00Z',
    });

    // Simulate carrier radio outage
    ctx.dispatcher.setSimulateFailure(true, 2, 'RESULT_ERROR_RADIO_OFF');
    ctx.advanceTimeTo('2026-09-15T08:20:00Z');
    await ctx.triggerDueSchedules();

    const failed = await ctx.repository.getById(s.id);
    expect(failed?.status).toBe('failed');

    // Restore carrier service and reschedule
    ctx.dispatcher.setSimulateFailure(false);
    const rescheduled = await ctx.reschedule(s.id, '2026-09-15T12:00:00Z');
    expect(rescheduled.status).toBe('pending');
    expect(rescheduled.scheduledAt).toBe('2026-09-15T12:00:00Z');

    // Trigger rescheduled time
    ctx.advanceTimeTo('2026-09-15T12:05:00Z');
    await ctx.triggerDueSchedules();

    const recovered = await ctx.repository.getById(s.id);
    expect(recovered?.status).toBe('sent');
  });

  // -------------------------------------------------------------------------
  // Pairwise 7: Rapid CRUD Lifecycle with State Transitions (F4 x F5 x F6)
  // -------------------------------------------------------------------------
  it('T3.7: should preserve repository integrity through rapid create, edit, reschedule, and delete operations', async () => {
    // Create
    const s = await ctx.createSchedule({
      recipientName: 'Lifecycle User',
      phoneNumber: '+15551234567',
      messageText: 'Initial v1',
      scheduledAt: '2026-09-15T09:00:00Z',
    });
    expect((await ctx.repository.getAll()).length).toBe(1);

    // Edit
    await ctx.editSchedule(s.id, { messageText: 'Updated v2' });
    expect((await ctx.repository.getById(s.id))?.messageText).toBe('Updated v2');

    // Reschedule
    await ctx.reschedule(s.id, '2026-09-15T15:00:00Z');
    expect((await ctx.repository.getById(s.id))?.scheduledAt).toBe('2026-09-15T15:00:00Z');

    // Delete
    await ctx.deleteSchedule(s.id);
    expect((await ctx.repository.getAll()).length).toBe(0);
    expect(ctx.alarms.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Pairwise 8: Device Reboot Recovery + Active Pending Queue Filtering (F12 x F4)
  // -------------------------------------------------------------------------
  it('T3.8: should accurately re-arm only active pending future schedules and update queue upon reboot', async () => {
    // S1: Future pending
    const s1 = await ctx.createSchedule({
      recipientName: 'Future 1',
      phoneNumber: '+15551111111',
      messageText: 'M1',
      scheduledAt: '2026-09-15T16:00:00Z',
    });

    // S2: Completed earlier
    const s2 = await ctx.createSchedule({
      recipientName: 'Done Earlier',
      phoneNumber: '+15552222222',
      messageText: 'M2',
      scheduledAt: '2026-09-15T08:15:00Z',
    });
    ctx.advanceTimeTo('2026-09-15T08:20:00Z');
    await ctx.triggerDueSchedules();

    // S3: Past-due during shutdown
    await ctx.createSchedule({
      recipientName: 'Expired While Off',
      phoneNumber: '+15553333333',
      messageText: 'M3',
      scheduledAt: '2026-09-15T11:00:00Z',
    });

    // Boot at 12:00 PM
    ctx.advanceTimeTo('2026-09-15T12:00:00Z');
    const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();

    expect(rearmedCount).toBe(1); // Only s1
    expect(expiredCount).toBe(1); // s3 expired

    const active = await ctx.repository.getActivePending();
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(s1.id);
  });

  // -------------------------------------------------------------------------
  // Pairwise 9: Recurring Schedule with Reached End Date + Dispatch Termination (F8 x F9)
  // -------------------------------------------------------------------------
  it('T3.9: should dispatch final SMS on end date and transition status to completed with alarm disarmed', async () => {
    const s = await ctx.createSchedule({
      recipientName: 'Final Day User',
      phoneNumber: '+15556667777',
      messageText: 'Final day notification',
      scheduledAt: '2026-09-15T08:30:00Z',
      recurrence: {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-15', // Today is the last day
      },
    });

    ctx.advanceTimeTo('2026-09-15T08:30:00Z');
    const processed = await ctx.triggerDueSchedules();

    expect(processed.length).toBe(1);
    expect(processed[0].status).toBe('completed');
    expect(ctx.alarms.has(s.id)).toBe(false); // Disarmed

    const active = await ctx.repository.getActivePending();
    expect(active.length).toBe(0); // No longer in pending queue

    const last = ctx.dispatcher.getLastSentMessage();
    expect(last?.result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Pairwise 10: Multi-Recipient Broadcast vs Single-Recipient Concurrent Schedules (F7 x F3 x F9)
  // -------------------------------------------------------------------------
  it('T3.10: should support scheduling both broadcast messages to multiple recipients and multi-schedule reminders to single contact', async () => {
    const team = [
      { name: 'Dev 1', phone: '+15551110001' },
      { name: 'Dev 2', phone: '+15551110002' },
      { name: 'Dev 3', phone: '+15551110003' },
    ];

    // Broadcast at 09:00
    for (const member of team) {
      await ctx.createSchedule({
        recipientName: member.name,
        phoneNumber: member.phone,
        messageText: 'Daily Standup at 09:30 AM',
        scheduledAt: '2026-09-15T09:00:00Z',
      });
    }

    // Two individual reminders for Dev 1 at 12:00 and 17:00
    await ctx.createSchedule({
      recipientName: 'Dev 1',
      phoneNumber: '+15551110001',
      messageText: 'Submit PR review',
      scheduledAt: '2026-09-15T12:00:00Z',
    });
    await ctx.createSchedule({
      recipientName: 'Dev 1',
      phoneNumber: '+15551110001',
      messageText: 'Update timesheet',
      scheduledAt: '2026-09-15T17:00:00Z',
    });

    const all = await ctx.repository.getAll();
    expect(all.length).toBe(5);

    // Trigger broadcast at 09:00
    ctx.advanceTimeTo('2026-09-15T09:00:00Z');
    const standupDispatched = await ctx.triggerDueSchedules();
    expect(standupDispatched.length).toBe(3);

    // 2 individual reminders for Dev 1 still pending
    const remaining = await ctx.repository.getActivePending();
    expect(remaining.length).toBe(2);
    expect(remaining.every(r => r.recipient.phoneNumber === '+15551110001')).toBe(true);
  });
});
