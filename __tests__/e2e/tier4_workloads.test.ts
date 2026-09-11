/**
 * Tier 4: Real-World Application Workloads
 *
 * Requirements: >= 5 realistic end-to-end user application workflows from start to finish.
 * Authoritative Sources: ORIGINAL_REQUEST.md (R1, R2, R3), PROJECT.md, automatedsms.md.
 * Total Tests: 5 comprehensive multi-step workload scenarios.
 */

import {
  E2ETestContext,
  calculateSmsSegments,
  MockSmsDispatcher,
} from '../helpers/e2eHarness';

describe('Tier 4: Real-World Application Workloads', () => {
  let ctx: E2ETestContext;
  const BASE_TIME = new Date('2026-09-15T07:30:00Z');

  beforeEach(() => {
    ctx = new E2ETestContext(BASE_TIME);
  });

  // =========================================================================
  // Workload 1: Morning 08:00 & Evening 21:00 Daily Recurring Routine
  // =========================================================================
  it('Workload 1: Morning 08:00 & Evening 21:00 Daily Routine with Independent Rollovers', async () => {
    // 1. User sets up morning message at 08:00 AM (daily recurring)
    const morning = await ctx.createSchedule({
      recipientName: 'Sarah Partner',
      phoneNumber: '+15552345678',
      messageText: 'Good morning! Have a wonderful day ahead ❤️',
      scheduledAt: '2026-09-15T08:00:00Z',
      recurrence: { type: 'daily', hasEndDate: false },
    });

    // 2. User sets up evening message at 21:00 (daily recurring)
    const evening = await ctx.createSchedule({
      recipientName: 'Sarah Partner',
      phoneNumber: '+15552345678',
      messageText: 'Good night! Sleep well and sweet dreams 🌙',
      scheduledAt: '2026-09-15T21:00:00Z',
      recurrence: { type: 'daily', hasEndDate: false },
    });

    // 3. Verify both active schedules in queue, sorted chronologically
    let active = await ctx.repository.getActivePending();
    expect(active.length).toBe(2);
    expect(active[0].id).toBe(morning.id);
    expect(active[1].id).toBe(evening.id);

    // 4. Advance time to 08:00 AM — trigger morning dispatch
    ctx.advanceTimeTo('2026-09-15T08:00:00Z');
    const morningProcessed = await ctx.triggerDueSchedules();
    expect(morningProcessed.length).toBe(1);
    expect(morningProcessed[0].id).toBe(morning.id);

    // 5. Morning schedule rolls over to tomorrow at 08:00 AM
    const morningUpdated = await ctx.repository.getById(morning.id);
    expect(morningUpdated?.status).toBe('pending');
    expect(morningUpdated?.scheduledAt).toBe('2026-09-16T08:00:00.000Z');

    // 6. Evening schedule remains armed and pending for 21:00 today
    const eveningCheck = await ctx.repository.getById(evening.id);
    expect(eveningCheck?.status).toBe('pending');
    expect(eveningCheck?.scheduledAt).toBe('2026-09-15T21:00:00Z');

    // 7. Advance time to 21:00 — trigger evening dispatch
    ctx.advanceTimeTo('2026-09-15T21:00:00Z');
    const eveningProcessed = await ctx.triggerDueSchedules();
    expect(eveningProcessed.length).toBe(1);
    expect(eveningProcessed[0].id).toBe(evening.id);

    // 8. Evening schedule rolls over to tomorrow at 21:00
    const eveningUpdated = await ctx.repository.getById(evening.id);
    expect(eveningUpdated?.status).toBe('pending');
    expect(eveningUpdated?.scheduledAt).toBe('2026-09-16T21:00:00.000Z');

    // 9. Inspect dispatcher history: exactly 2 messages dispatched today
    const sentMessages = ctx.dispatcher.getSentMessages();
    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].params.messageText).toContain('Good morning');
    expect(sentMessages[1].params.messageText).toContain('Good night');

    // 10. Queue for tomorrow has both schedules ready
    active = await ctx.repository.getActivePending();
    expect(active.length).toBe(2);
    expect(active[0].scheduledAt).toBe('2026-09-16T08:00:00.000Z');
    expect(active[1].scheduledAt).toBe('2026-09-16T21:00:00.000Z');
  });

  // =========================================================================
  // Workload 2: 7-Day Medication Reminder with End Date Completion
  // =========================================================================
  it('Workload 2: 7-Day Finite Medication Reminder with End Date Rollovers and Completion', async () => {
    // Patient prescribed 7-day antibiotic course from Sep 15 to Sep 21
    const startDate = '2026-09-15T09:00:00Z';
    const endDate = '2026-09-21';

    const medicationSchedule = await ctx.createSchedule({
      recipientName: 'Patient John',
      phoneNumber: '+15553334444',
      messageText: 'Time to take your Amoxicillin 500mg dose with water 💊',
      scheduledAt: startDate,
      recurrence: {
        type: 'daily',
        hasEndDate: true,
        endDate: endDate,
      },
    });

    // Simulate dispatches across the 7 days
    for (let day = 15; day <= 21; day++) {
      const dayIso = `2026-09-${String(day).padStart(2, '0')}T09:00:00Z`;
      ctx.advanceTimeTo(dayIso);

      const processed = await ctx.triggerDueSchedules();
      expect(processed.length).toBe(1);

      if (day < 21) {
        // Days 1 to 6: status stays pending, rolled over to next day
        const nextDay = String(day + 1).padStart(2, '0');
        expect(processed[0].status).toBe('pending');
        expect(processed[0].scheduledAt).toBe(`2026-09-${nextDay}T09:00:00.000Z`);
      } else {
        // Day 7 (Final Day): end date reached, status transitions to completed
        expect(processed[0].status).toBe('completed');
      }
    }

    // Verify 7 total dispatches recorded in mock SMS dispatcher
    expect(ctx.dispatcher.getSentMessages().length).toBe(7);

    // Verify active pending queue is now completely empty
    const pending = await ctx.repository.getActivePending();
    expect(pending.length).toBe(0);

    // Verify final state in repository
    const finalRecord = await ctx.repository.getById(medicationSchedule.id);
    expect(finalRecord?.status).toBe('completed');
    expect(ctx.alarms.has(medicationSchedule.id)).toBe(false); // Disarmed
  });

  // =========================================================================
  // Workload 3: Client Follow-up Rescheduling on Carrier Network Outage
  // =========================================================================
  it('Workload 3: Carrier Outage Handling, Error Logging, and Rescheduling Recovery', async () => {
    // 1. Account executive schedules urgent client contract reminder for 14:00
    const followUp = await ctx.createSchedule({
      recipientName: 'Client Executive',
      phoneNumber: '+15557778888',
      messageText: 'Hi Mark, following up on the enterprise contract signed copies.',
      scheduledAt: '2026-09-15T14:00:00Z',
    });

    // 2. Executive is in an underground metro; cellular radio goes down
    ctx.dispatcher.setSimulateFailure(true, 4, 'RESULT_ERROR_NO_SERVICE: No cellular connection');

    // 3. Alarm fires at 14:00
    ctx.advanceTimeTo('2026-09-15T14:00:00Z');
    const processed = await ctx.triggerDueSchedules();

    // 4. Dispatch fails; record updated to status 'failed'
    expect(processed.length).toBe(1);
    expect(processed[0].status).toBe('failed');

    const failedRecord = await ctx.repository.getById(followUp.id);
    expect(failedRecord?.status).toBe('failed');

    // 5. User checks app at 14:30, sees failed status banner, edits text with new context
    ctx.advanceTimeTo('2026-09-15T14:30:00Z');
    await ctx.editSchedule(followUp.id, {
      messageText: 'Hi Mark, apologies for earlier delay. Following up on enterprise contract copies.',
    });

    // 6. User reschedules message for 16:30 when out of the metro
    const rescheduled = await ctx.reschedule(followUp.id, '2026-09-15T16:30:00Z');
    expect(rescheduled.status).toBe('pending');
    expect(rescheduled.scheduledAt).toBe('2026-09-15T16:30:00Z');

    // 7. Cellular connection restored
    ctx.dispatcher.setSimulateFailure(false);

    // 8. Alarm fires at 16:30; SMS transmits successfully
    ctx.advanceTimeTo('2026-09-15T16:30:00Z');
    const finalProcessed = await ctx.triggerDueSchedules();

    expect(finalProcessed.length).toBe(1);
    expect(finalProcessed[0].status).toBe('sent');

    // 9. Verify dispatcher audit log captures the successful transmission
    const lastSent = ctx.dispatcher.getLastSentMessage();
    expect(lastSent?.result.success).toBe(true);
    expect(lastSent?.params.messageText).toContain('apologies for earlier delay');
  });

  // =========================================================================
  // Workload 4: Multi-Contact Event Speaker Notification Blast
  // =========================================================================
  it('Workload 4: Conference Event Speaker Staggered Notification Timeline', async () => {
    const speakers = [
      { name: 'Dr. Aris Thorne', phone: '+15551000001', slot: '2026-09-15T09:00:00Z', topic: 'AI Keynote' },
      { name: 'Bethany Vance', phone: '+15551000002', slot: '2026-09-15T11:00:00Z', topic: 'Mobile Architecture' },
      { name: 'Carlos Mendez', phone: '+15551000003', slot: '2026-09-15T14:00:00Z', topic: 'React Native Bridge' },
      { name: 'Diana Prince', phone: '+15551000004', slot: '2026-09-15T16:30:00Z', topic: 'Closing Panel' },
    ];

    // 1. Organizer schedules reminders for all 4 speakers
    for (const s of speakers) {
      await ctx.createSchedule({
        recipientName: s.name,
        phoneNumber: s.phone,
        messageText: `Reminder: Your session "${s.topic}" begins in 15 minutes. Please proceed to Green Room.`,
        scheduledAt: s.slot,
      });
    }

    // 2. Verify all 4 are pending and sorted chronologically
    let pending = await ctx.repository.getActivePending();
    expect(pending.length).toBe(4);
    expect(pending[0].recipient.name).toBe('Dr. Aris Thorne');
    expect(pending[3].recipient.name).toBe('Diana Prince');

    // 3. Staggered dispatches as the day progresses
    for (let i = 0; i < speakers.length; i++) {
      ctx.advanceTimeTo(speakers[i].slot);
      const dispatched = await ctx.triggerDueSchedules();

      expect(dispatched.length).toBe(1);
      expect(dispatched[0].recipient.name).toBe(speakers[i].name);
      expect(dispatched[0].status).toBe('sent');

      const remaining = await ctx.repository.getActivePending();
      expect(remaining.length).toBe(3 - i);
    }

    // 4. Verify all 4 dispatches recorded with correct content and parts count
    const sent = ctx.dispatcher.getSentMessages();
    expect(sent.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(sent[i].params.recipient.name).toBe(speakers[i].name);
      expect(sent[i].params.messageText).toContain(speakers[i].topic);
      expect(sent[i].result.partsCount).toBeGreaterThan(0);
    }

    // 5. Final state: 0 pending, 4 total sent
    expect((await ctx.repository.getActivePending()).length).toBe(0);
    expect((await ctx.repository.getAll()).length).toBe(4);
  });

  // =========================================================================
  // Workload 5: Full Application Lifecycle with Editing, Device Reboot, and Schedule Deletion
  // =========================================================================
  it('Workload 5: Full Lifecycle: Create Multiple, Edit, Device Reboot Recovery, and Selective Deletion', async () => {
    // 1. Create 3 distinct schedules: Doctor (one-time), Birthday (one-time), Rent (daily)
    const doctor = await ctx.createSchedule({
      recipientName: 'Dr. Clinic',
      phoneNumber: '+15551112222',
      messageText: 'Confirming appointment for 10:30 AM',
      scheduledAt: '2026-09-15T10:30:00Z',
    });

    const birthday = await ctx.createSchedule({
      recipientName: 'Brother Ben',
      phoneNumber: '+15553334444',
      messageText: 'Happy Birthday bro! 🎂 Have an awesome celebration!',
      scheduledAt: '2026-09-15T12:00:00Z',
    });

    const rent = await ctx.createSchedule({
      recipientName: 'Landlord Mr. Gable',
      phoneNumber: '+15555556666',
      messageText: 'Rent transfer of $1,800 has been initiated. Ref: RENT-SEP26',
      scheduledAt: '2026-09-15T18:00:00Z',
      recurrence: { type: 'daily', hasEndDate: false },
    });

    expect((await ctx.repository.getAll()).length).toBe(3);
    expect(ctx.alarms.size).toBe(3);

    // 2. Doctor clinic reschedules appointment to 11:00 AM
    const doctorUpdated = await ctx.reschedule(doctor.id, '2026-09-15T11:00:00Z');
    expect(doctorUpdated.scheduledAt).toBe('2026-09-15T11:00:00Z');

    // 3. Device battery dies unexpectedly; phone powers off at 08:30 AM and boots up at 09:00 AM
    ctx.advanceTimeTo('2026-09-15T09:00:00Z');
    const { rearmedCount, expiredCount } = await ctx.simulateBootCompleted();

    // All 3 schedules were scheduled after 09:00 AM, so all 3 re-armed
    expect(rearmedCount).toBe(3);
    expect(expiredCount).toBe(0);
    expect(ctx.alarms.size).toBe(3);

    // 4. User decides to call brother directly, deletes Birthday schedule from queue
    const deleted = await ctx.deleteSchedule(birthday.id);
    expect(deleted).toBe(true);
    expect(ctx.alarms.size).toBe(2);
    expect((await ctx.repository.getAll()).length).toBe(2);

    // 5. Advance time to 11:00 AM — Doctor reminder triggers
    ctx.advanceTimeTo('2026-09-15T11:00:00Z');
    const docProcessed = await ctx.triggerDueSchedules();
    expect(docProcessed.length).toBe(1);
    expect(docProcessed[0].id).toBe(doctor.id);
    expect(docProcessed[0].status).toBe('sent');

    // 6. Advance time to 18:00 — Rent reminder triggers and rolls over
    ctx.advanceTimeTo('2026-09-15T18:00:00Z');
    const rentProcessed = await ctx.triggerDueSchedules();
    expect(rentProcessed.length).toBe(1);
    expect(rentProcessed[0].id).toBe(rent.id);

    // Rent schedule rolled over to tomorrow at 18:00
    const rentNext = await ctx.repository.getById(rent.id);
    expect(rentNext?.status).toBe('pending');
    expect(rentNext?.scheduledAt).toBe('2026-09-16T18:00:00.000Z');

    // 7. Verify final state: Doctor is sent, Birthday is deleted, Rent is pending for tomorrow
    const finalAll = await ctx.repository.getAll();
    expect(finalAll.length).toBe(2);
    expect(finalAll.find(s => s.id === doctor.id)?.status).toBe('sent');
    expect(finalAll.find(s => s.id === rent.id)?.status).toBe('pending');
    expect(finalAll.find(s => s.id === birthday.id)).toBeUndefined();
  });
});
