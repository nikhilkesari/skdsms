/**
 * Unit & Integration Test Suite for ScheduleContext & useSchedules Hook
 * Target: __tests__/unit/scheduleContext.test.tsx
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  ScheduleProvider,
  useSchedules,
  useSchedule,
  type ScheduleContextValue,
} from '../../src/context/ScheduleContext';
import { InMemoryScheduleRepository } from '../../src/repositories/InMemoryScheduleRepository';
import { MockSmsDispatcher } from '../../src/services/sms/MockSmsDispatcher';
import { ScheduleManager } from '../../src/services/scheduler/ScheduleManager';

describe('ScheduleContext & ScheduleProvider', () => {
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

  // Helper component to capture hook value for assertions
  let hookValue: ScheduleContextValue | undefined;
  const TestConsumer: React.FC = () => {
    hookValue = useSchedules();
    return null;
  };

  it('throws descriptive error if useSchedules is called outside ScheduleProvider', () => {
    // Suppress console.error in React for expected error boundary test
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      act(() => {
        ReactTestRenderer.create(<TestConsumer />);
      });
    }).toThrow('useSchedules must be used within a ScheduleProvider');

    spy.mockRestore();
  });

  it('provides schedules, activeSchedules, and loading state on initial mount', async () => {
    // Seed one pending and one sent schedule
    await repository.create({
      recipient: { name: 'Active User', phoneNumber: '+15551112222' },
      messageText: 'Active',
      scheduledAt: '2026-09-15T12:00:00.000Z',
    });
    const sent = await repository.create({
      recipient: { name: 'Past User', phoneNumber: '+15553334444' },
      messageText: 'Sent',
      scheduledAt: '2026-09-15T11:00:00.000Z',
    });
    await repository.update(sent.id, { status: 'sent' });

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ScheduleProvider scheduleManager={manager}>
          <TestConsumer />
        </ScheduleProvider>
      );
    });

    expect(hookValue).toBeDefined();
    expect(hookValue?.loading).toBe(false);
    expect(hookValue?.schedules).toHaveLength(2);
    expect(hookValue?.activeSchedules).toHaveLength(1);
    expect(hookValue?.activeSchedules[0].recipient.name).toBe('Active User');

    act(() => {
      renderer?.unmount();
    });
  });

  it('creates a new schedule and updates context state and activeSchedules', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ScheduleProvider scheduleManager={manager}>
          <TestConsumer />
        </ScheduleProvider>
      );
    });

    expect(hookValue?.schedules).toHaveLength(0);

    await act(async () => {
      await hookValue?.createSchedule({
        recipientName: 'New Contact',
        phoneNumber: '+15559876543',
        messageText: 'Welcome!',
        scheduledAt: '2026-09-15T14:00:00.000Z',
      });
    });

    expect(hookValue?.schedules).toHaveLength(1);
    expect(hookValue?.activeSchedules).toHaveLength(1);
    expect(hookValue?.schedules[0].recipient.name).toBe('New Contact');
    expect(hookValue?.schedules[0].status).toBe('pending');

    act(() => {
      renderer?.unmount();
    });
  });

  it('updates an existing schedule in context state', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ScheduleProvider scheduleManager={manager}>
          <TestConsumer />
        </ScheduleProvider>
      );
    });

    let createdId = '';
    await act(async () => {
      const created = await hookValue?.createSchedule({
        recipientName: 'Original Name',
        phoneNumber: '+15551112222',
        messageText: 'Initial text',
        scheduledAt: '2026-09-15T13:00:00.000Z',
      });
      createdId = created!.id;
    });

    await act(async () => {
      await hookValue?.updateSchedule(createdId, {
        messageText: 'Modified text',
      });
    });

    expect(hookValue?.schedules[0].messageText).toBe('Modified text');

    act(() => {
      renderer?.unmount();
    });
  });

  it('reschedules an existing schedule in context state', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ScheduleProvider scheduleManager={manager}>
          <TestConsumer />
        </ScheduleProvider>
      );
    });

    let createdId = '';
    await act(async () => {
      const created = await hookValue?.createSchedule({
        recipientName: 'User',
        phoneNumber: '+15551112222',
        messageText: 'Reschedule test',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });
      createdId = created!.id;
    });

    const newDate = '2026-09-15T18:00:00.000Z';
    await act(async () => {
      await hookValue?.reschedule(createdId, newDate);
    });

    expect(hookValue?.schedules[0].scheduledAt).toBe(newDate);
    expect(hookValue?.schedules[0].status).toBe('pending');

    act(() => {
      renderer?.unmount();
    });
  });

  it('deletes a schedule from context state', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ScheduleProvider scheduleManager={manager}>
          <TestConsumer />
        </ScheduleProvider>
      );
    });

    let createdId = '';
    await act(async () => {
      const created = await hookValue?.createSchedule({
        recipientName: 'To Delete',
        phoneNumber: '+15551112222',
        messageText: 'Delete me',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });
      createdId = created!.id;
    });

    expect(hookValue?.schedules).toHaveLength(1);

    await act(async () => {
      const success = await hookValue?.deleteSchedule(createdId);
      expect(success).toBe(true);
    });

    expect(hookValue?.schedules).toHaveLength(0);
    expect(hookValue?.activeSchedules).toHaveLength(0);

    act(() => {
      renderer?.unmount();
    });
  });

  it('cancels a schedule and removes it from activeSchedules', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ScheduleProvider scheduleManager={manager}>
          <TestConsumer />
        </ScheduleProvider>
      );
    });

    let createdId = '';
    await act(async () => {
      const created = await hookValue?.createSchedule({
        recipientName: 'To Cancel',
        phoneNumber: '+15551112222',
        messageText: 'Cancel me',
        scheduledAt: '2026-09-15T12:00:00.000Z',
      });
      createdId = created!.id;
    });

    expect(hookValue?.activeSchedules).toHaveLength(1);

    await act(async () => {
      await hookValue?.cancelSchedule(createdId);
    });

    expect(hookValue?.schedules).toHaveLength(1);
    expect(hookValue?.schedules[0].status).toBe('cancelled');
    expect(hookValue?.activeSchedules).toHaveLength(0);

    act(() => {
      renderer?.unmount();
    });
  });

  it('sets error state on validation failure and supports clearError', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ScheduleProvider scheduleManager={manager}>
          <TestConsumer />
        </ScheduleProvider>
      );
    });

    await act(async () => {
      try {
        await hookValue?.createSchedule({
          recipientName: '',
          phoneNumber: '+15551112222',
          messageText: 'Empty recipient test',
          scheduledAt: '2026-09-15T12:00:00.000Z',
        });
      } catch {
        // Expected validation failure
      }
    });

    expect(hookValue?.error).toContain('VALIDATION_ERROR: Recipient name is required');

    act(() => {
      hookValue?.clearError();
    });

    expect(hookValue?.error).toBeNull();

    act(() => {
      renderer?.unmount();
    });
  });
});
