/**
 * Unit & Integration Test Suite for ScheduleManager
 * Target: __tests__/unit/scheduleManager.test.ts
 */

import {
  ScheduleManager,
  calculateNextOccurrence,
} from '../../src/services/scheduler/ScheduleManager';
import { InMemoryScheduleRepository } from '../../src/repositories/InMemoryScheduleRepository';
import { MockSmsDispatcher } from '../../src/services/sms/MockSmsDispatcher';
import type { AlarmScheduler, ScheduleAlarmParams } from '../../src/services/sms/types';

describe('ScheduleManager Unit & Integration Tests', () => {
  let repository: InMemoryScheduleRepository;
  let dispatcher: MockSmsDispatcher;
  let manager: ScheduleManager;
  let fakeNow: Date;

  beforeEach(() => {
    fakeNow = new Date('2026-09-15T10:00:00.000Z');
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

  describe('calculateNextOccurrence', () => {
    it('advances daily recurrence by exactly 24 hours', () => {
      const start = '2026-09-15T10:00:00.000Z';
      const result = calculateNextOccurrence(start, { type: 'daily' });
      expect(result.isCompleted).toBe(false);
      expect(result.nextRunAt).toBe('2026-09-16T10:00:00.000Z');
    });

    it('marks completed when next daily occurrence exceeds end date', () => {
      const start = '2026-09-15T10:00:00.000Z';
      const result = calculateNextOccurrence(start, {
        type: 'daily',
        hasEndDate: true,
        endDate: '2026-09-15',
      });
      expect(result.isCompleted).toBe(true);
      expect(result.nextRunAt).toBeNull();
    });

    it('returns completed for non-recurring rule', () => {
      const start = '2026-09-15T10:00:00.000Z';
      const result = calculateNextOccurrence(start, { type: 'none' });
      expect(result.isCompleted).toBe(true);
      expect(result.nextRunAt).toBeNull();
    });
  });

  describe('Schedule Creation', () => {
    it('creates schedule, persists to repository, and arms alarm', async () => {
      const futureDate = '2026-09-15T12:00:00.000Z';
      const schedule = await manager.createSchedule({
        recipientName: 'Jane Doe',
        phoneNumber: '+15551234567',
        messageText: 'Meeting reminder',
        scheduledAt: futureDate,
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.status).toBe('pending');
      expect(schedule.recipient.name).toBe('Jane Doe');
      expect(schedule.recipient.phoneNumber).toBe('+15551234567');

      // Verify persisted in repository
      const fetched = await repository.getById(schedule.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(schedule.id);

      // Verify alarm was armed in dispatcher
      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(1);
      expect(alarms[0].id).toBe(schedule.id);
      expect(alarms[0].alarmRequestCode).toBe(schedule.alarmRequestCode);
      expect(alarms[0].timestampMs).toBe(new Date(futureDate).getTime());
      expect(alarms[0].messageText).toBe('Meeting reminder');
    });

    it('normalizes formatted phone numbers on creation', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'Bob Smith',
        phoneNumber: '(555) 234-5678',
        messageText: 'Test normalization',
        scheduledAt: '2026-09-15T11:00:00.000Z',
      });

      expect(schedule.recipient.phoneNumber).toBe('5552345678');
    });

    it('rolls back repository creation if alarm scheduler throws', async () => {
      const failingScheduler: AlarmScheduler = {
        scheduleAlarm: jest.fn().mockRejectedValue(new Error('AlarmManager security exception')),
        cancelAlarm: jest.fn().mockResolvedValue(true),
      };

      const failingManager = new ScheduleManager({
        repository,
        alarmScheduler: failingScheduler,
        smsDispatcher: dispatcher,
        getCurrentTime: () => fakeNow,
      });

      await expect(
        failingManager.createSchedule({
          recipientName: 'Alice',
          phoneNumber: '+15550001111',
          messageText: 'Rollback test',
          scheduledAt: '2026-09-15T11:00:00.000Z',
        })
      ).rejects.toThrow('AlarmManager security exception');

      const all = await repository.getAll();
      expect(all).toHaveLength(0);
    });

    it('rejects schedule with past scheduled date', async () => {
      const pastDate = '2026-09-15T09:00:00.000Z'; // 1 hour before fakeNow
      await expect(
        manager.createSchedule({
          recipientName: 'Alice',
          phoneNumber: '+15550001111',
          messageText: 'Past message',
          scheduledAt: pastDate,
        })
      ).rejects.toThrow(/VALIDATION_ERROR/);
    });

    it('rejects schedule with missing recipient name', async () => {
      await expect(
        manager.createSchedule({
          recipientName: '   ',
          phoneNumber: '+15550001111',
          messageText: 'Hello',
          scheduledAt: '2026-09-15T12:00:00.000Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR: Recipient name is required/);
    });

    it('rejects schedule with invalid phone number', async () => {
      await expect(
        manager.createSchedule({
          recipientName: 'Alice',
          phoneNumber: '123',
          messageText: 'Hello',
          scheduledAt: '2026-09-15T12:00:00.000Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR: Phone number is too short/);
    });

    it('rejects schedule with empty message text', async () => {
      await expect(
        manager.createSchedule({
          recipientName: 'Alice',
          phoneNumber: '+15550001111',
          messageText: '   ',
          scheduledAt: '2026-09-15T12:00:00.000Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR: Message text is required/);
    });

    it('rejects recurrence end date before scheduled start date', async () => {
      await expect(
        manager.createSchedule({
          recipientName: 'Alice',
          phoneNumber: '+15550001111',
          messageText: 'Hello',
          scheduledAt: '2026-09-20T12:00:00.000Z',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-18',
          },
        })
      ).rejects.toThrow(/Recurrence end date cannot be earlier/);
    });
  });

  describe('Schedule Updates', () => {
    it('updates schedule and disarms old alarm before arming new alarm', async () => {
      const original = await manager.createSchedule({
        recipientName: 'User One',
        phoneNumber: '+15551112222',
        messageText: 'Original text',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });

      const newScheduledAt = '2026-09-15T15:00:00.000Z';
      const updated = await manager.updateSchedule(original.id, {
        messageText: 'Updated text',
        scheduledAt: newScheduledAt,
      });

      expect(updated.messageText).toBe('Updated text');
      expect(updated.scheduledAt).toBe(newScheduledAt);

      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(1);
      expect(alarms[0].timestampMs).toBe(new Date(newScheduledAt).getTime());
      expect(alarms[0].messageText).toBe('Updated text');
    });

    it('rejects update when new scheduled time is in the past', async () => {
      const original = await manager.createSchedule({
        recipientName: 'User One',
        phoneNumber: '+15551112222',
        messageText: 'Original text',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });

      await expect(
        manager.updateSchedule(original.id, {
          scheduledAt: '2026-09-15T09:00:00.000Z',
        })
      ).rejects.toThrow(/VALIDATION_ERROR/);
    });

    it('throws error when updating non-existent schedule', async () => {
      await expect(
        manager.updateSchedule('non-existent-id', {
          messageText: 'New text',
        })
      ).rejects.toThrow(/Schedule with id non-existent-id not found/);
    });
  });

  describe('Rescheduling', () => {
    it('reschedules to future date, resets status to pending, and re-arms alarm', async () => {
      const original = await manager.createSchedule({
        recipientName: 'User',
        phoneNumber: '+15551112222',
        messageText: 'Reschedule test',
        scheduledAt: '2026-09-15T11:00:00.000Z',
      });

      // Advance time slightly
      fakeNow = new Date('2026-09-15T10:30:00.000Z');

      const newDate = '2026-09-15T16:00:00.000Z';
      const rescheduled = await manager.reschedule(original.id, newDate);

      expect(rescheduled.scheduledAt).toBe(newDate);
      expect(rescheduled.status).toBe('pending');

      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(1);
      expect(alarms[0].timestampMs).toBe(new Date(newDate).getTime());
    });

    it('rejects reschedule to past date', async () => {
      const original = await manager.createSchedule({
        recipientName: 'User',
        phoneNumber: '+15551112222',
        messageText: 'Reschedule test',
        scheduledAt: '2026-09-15T11:00:00.000Z',
      });

      await expect(
        manager.reschedule(original.id, '2026-09-15T08:00:00.000Z')
      ).rejects.toThrow(/VALIDATION_ERROR/);
    });
  });

  describe('Deletion & Cancellation', () => {
    it('deletes schedule and cancels registered alarm', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'User',
        phoneNumber: '+15551112222',
        messageText: 'Delete test',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });

      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);

      const deleted = await manager.deleteSchedule(schedule.id);
      expect(deleted).toBe(true);

      expect(await repository.getById(schedule.id)).toBeNull();
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
    });

    it('returns false when deleting non-existent schedule', async () => {
      const deleted = await manager.deleteSchedule('non-existent');
      expect(deleted).toBe(false);
    });

    it('cancels schedule: disarms alarm and sets status to cancelled', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'User',
        phoneNumber: '+15551112222',
        messageText: 'Cancel test',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });

      const cancelled = await manager.cancelSchedule(schedule.id);
      expect(cancelled.status).toBe('cancelled');
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);

      const inRepo = await repository.getById(schedule.id);
      expect(inRepo?.status).toBe('cancelled');
    });
  });

  describe('Recurrence Advances & Lifecycle Transitions', () => {
    it('advances daily recurring schedule +24 hours and re-arms alarm', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'Recurring User',
        phoneNumber: '+15551112222',
        messageText: 'Daily digest',
        scheduledAt: '2026-09-15T12:00:00.000Z',
        recurrence: { type: 'daily' },
      });

      const advanced = await manager.advanceRecurringSchedule(schedule.id);

      expect(advanced.status).toBe('pending');
      expect(advanced.scheduledAt).toBe('2026-09-16T12:00:00.000Z');

      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(1);
      expect(alarms[0].timestampMs).toBe(new Date('2026-09-16T12:00:00.000Z').getTime());
    });

    it('marks recurring schedule completed when next run exceeds end date', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'Recurring User',
        phoneNumber: '+15551112222',
        messageText: 'Daily digest',
        scheduledAt: '2026-09-15T12:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-15',
        },
      });

      const advanced = await manager.advanceRecurringSchedule(schedule.id);

      expect(advanced.status).toBe('completed');
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
    });

    it('marks non-recurring schedule as sent and disarms alarm', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'Single User',
        phoneNumber: '+15551112222',
        messageText: 'One-off message',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });

      const completed = await manager.advanceRecurringSchedule(schedule.id);

      expect(completed.status).toBe('sent');
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
    });
  });

  describe('Execution & Triggering Due Schedules', () => {
    it('executes due schedule via SMS dispatcher and rolls over recurring schedule', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'User',
        phoneNumber: '+15551112222',
        messageText: 'Due message',
        scheduledAt: '2026-09-15T11:00:00.000Z',
        recurrence: { type: 'daily' },
      });

      // Advance time to 11:05
      fakeNow = new Date('2026-09-15T11:05:00.000Z');

      const processed = await manager.triggerDueSchedules(fakeNow);
      expect(processed).toHaveLength(1);
      expect(processed[0].id).toBe(schedule.id);
      expect(processed[0].scheduledAt).toBe('2026-09-16T11:00:00.000Z');

      const sent = dispatcher.getSentMessages();
      expect(sent).toHaveLength(1);
      expect(sent[0].params.messageText).toBe('Due message');
    });

    it('marks schedule failed if SMS dispatch fails', async () => {
      const schedule = await manager.createSchedule({
        recipientName: 'User',
        phoneNumber: '+15551112222',
        messageText: 'Will fail',
        scheduledAt: '2026-09-15T11:00:00.000Z',
      });

      dispatcher.setSimulateFailure(true, 5, 'Network timeout');

      fakeNow = new Date('2026-09-15T11:05:00.000Z');
      const processed = await manager.triggerDueSchedules(fakeNow);

      expect(processed).toHaveLength(1);
      expect(processed[0].status).toBe('failed');
      expect(processed[0].errorMessage).toContain('Network timeout');
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
    });
  });

  describe('Alarm Synchronization & Boot Restore', () => {
    it('re-arms future pending alarms and marks expired schedules as failed', async () => {
      // Create one future schedule
      const future = await manager.createSchedule({
        recipientName: 'Future',
        phoneNumber: '+15551112222',
        messageText: 'Future',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });

      // Create one past schedule manually in repository
      const past = await repository.create({
        recipient: { name: 'Past', phoneNumber: '15552223333' },
        messageText: 'Past',
        scheduledAt: '2026-09-15T09:00:00.000Z',
      });

      // Clear alarms simulating device reboot
      dispatcher.clearScheduledAlarms();
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);

      const restore = await manager.syncPendingAlarms();
      expect(restore.rearmedCount).toBe(1);
      expect(restore.expiredCount).toBe(1);

      const alarms = dispatcher.getScheduledAlarms();
      expect(alarms).toHaveLength(1);
      expect(alarms[0].id).toBe(future.id);

      const pastUpdated = await repository.getById(past.id);
      expect(pastUpdated?.status).toBe('failed');
    });
  });

  describe('Bulk Purge', () => {
    it('disarms all pending alarms and clears all repository records', async () => {
      await manager.createSchedule({
        recipientName: 'One',
        phoneNumber: '+15551112222',
        messageText: 'One',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });
      await manager.createSchedule({
        recipientName: 'Two',
        phoneNumber: '+15553334444',
        messageText: 'Two',
        scheduledAt: '2026-09-15T13:00:00.000Z',
      });

      expect(dispatcher.getScheduledAlarms()).toHaveLength(2);

      await manager.clearAllSchedules();

      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);
      expect(await repository.getAll()).toHaveLength(0);
    });
  });
});
