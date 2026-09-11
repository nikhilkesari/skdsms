import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ScheduleFormModal } from '../../src/components/ScheduleFormModal';
import type { ScheduledMessage } from '../../src/types/schedule';

describe('ScheduleFormModal Component Unit & Form Validation Tests', () => {
  const BASE_TIME = new Date('2026-09-15T08:00:00.000Z');

  it('renders modal when visible is true and shows "Schedule New SMS" title', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const title = renderer.root.findByProps({ testID: 'schedule-form-title' });
    expect(title.props.children).toBe('Schedule New SMS');
  });

  it('renders "Edit Scheduled SMS" title and populates initial fields when editing', () => {
    const existingSchedule: ScheduledMessage = {
      id: 'uuid-1234',
      recipient: { name: 'John Doe', phoneNumber: '+15551234567' },
      messageText: 'Meeting reminder for John',
      scheduledAt: '2026-09-15T12:00:00.000Z',
      recurrence: { type: 'daily', hasEndDate: true, endDate: '2026-09-30' },
      status: 'pending',
      alarmRequestCode: 101,
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-15T08:00:00.000Z',
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          initialSchedule={existingSchedule}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const title = renderer.root.findByProps({ testID: 'schedule-form-title' });
    expect(title.props.children).toBe('Edit Scheduled SMS');

    const nameInput = renderer.root.findByProps({ testID: 'recipient-name-input' });
    const phoneInput = renderer.root.findByProps({ testID: 'recipient-phone-input' });
    const messageInput = renderer.root.findByProps({ testID: 'message-text-input' });

    expect(nameInput.props.value).toBe('John Doe');
    expect(phoneInput.props.value).toBe('+15551234567');
    expect(messageInput.props.value).toBe('Meeting reminder for John');
  });

  it('updates live SMS segment counter as user inputs GSM-7 and Unicode text', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const messageInput = renderer.root.findByProps({ testID: 'message-text-input' });

    // 1. GSM-7 text under 160 characters -> 1 segment
    act(() => {
      messageInput.props.onChangeText('Hello team, see you at 10 AM.');
    });

    let counter = renderer.root.findByProps({ testID: 'sms-segment-counter' });
    expect(counter.props.children.props.children.join('')).toContain('1 segment');
    expect(counter.props.children.props.children.join('')).toContain('GSM-7');

    // 2. Unicode text (emoji) -> limits to 70 chars per segment
    act(() => {
      messageInput.props.onChangeText('Good morning ☀️! Have a great day.');
    });

    counter = renderer.root.findByProps({ testID: 'sms-segment-counter' });
    expect(counter.props.children.props.children.join('')).toContain('Unicode');
  });

  it('toggles daily recurrence switch and displays end date options', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const dailySwitch = renderer.root.findByProps({ testID: 'recurrence-daily-switch' });
    expect(dailySwitch.props.value).toBe(false);

    // Toggle daily recurrence on
    act(() => {
      dailySwitch.props.onValueChange(true);
    });

    expect(renderer.root.findByProps({ testID: 'recurrence-daily-switch' }).props.value).toBe(true);

    // End date toggle appears
    const endDateSwitch = renderer.root.findByProps({ testID: 'recurrence-has-end-date-switch' });
    expect(endDateSwitch).toBeDefined();

    act(() => {
      endDateSwitch.props.onValueChange(true);
    });

    const endDateButton = renderer.root.findByProps({ testID: 'recurrence-end-date-button' });
    expect(endDateButton).toBeDefined();
  });

  it('blocks submission and shows error banner when required fields are missing', async () => {
    const onSubmitMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          onClose={jest.fn()}
          onSubmit={onSubmitMock}
          now={BASE_TIME}
        />
      );
    });

    const submitBtn = renderer.root.findByProps({ testID: 'schedule-form-submit-button' });
    await act(async () => {
      await submitBtn.props.onPress();
    });

    expect(onSubmitMock).not.toHaveBeenCalled();
    const errorBanner = renderer.root.findByProps({ testID: 'form-error-banner' });
    expect(errorBanner).toBeDefined();
  });

  it('submits valid form data and triggers onSubmit with CreateScheduleInput', async () => {
    const onSubmitMock = jest.fn();
    const onCloseMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          onClose={onCloseMock}
          onSubmit={onSubmitMock}
          now={BASE_TIME}
        />
      );
    });

    // Populate inputs with valid values
    act(() => {
      renderer.root.findByProps({ testID: 'recipient-name-input' }).props.onChangeText('Jane Doe');
      renderer.root.findByProps({ testID: 'recipient-phone-input' }).props.onChangeText('+15551234567');
      renderer.root.findByProps({ testID: 'message-text-input' }).props.onChangeText('Happy Birthday!');
    });

    const submitBtn = renderer.root.findByProps({ testID: 'schedule-form-submit-button' });
    await act(async () => {
      await submitBtn.props.onPress();
    });

    expect(onSubmitMock).toHaveBeenCalledTimes(1);
    expect(onSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: {
          name: 'Jane Doe',
          phoneNumber: '+15551234567',
        },
        messageText: 'Happy Birthday!',
        recurrence: {
          type: 'none',
          hasEndDate: false,
          endDate: null,
        },
      })
    );
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel button or close icon is tapped', () => {
    const onCloseMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          onClose={onCloseMock}
          onSubmit={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const cancelBtn = renderer.root.findByProps({ testID: 'schedule-form-cancel-button' });
    act(() => {
      cancelBtn.props.onPress();
    });
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    const closeIcon = renderer.root.findByProps({ testID: 'schedule-form-close-button' });
    act(() => {
      closeIcon.props.onPress();
    });
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });

  it('automatically rolls past scheduled date to next future 24hr cycle when editing a daily schedule', async () => {
    const onSubmitMock = jest.fn();
    // Schedule originally set for 06:00:00 UTC, while BASE_TIME is 08:00:00 UTC (2 hours in the past)
    const pastDailySchedule: ScheduledMessage = {
      id: 'uuid-past-daily',
      recipient: { name: 'Alice', phoneNumber: '+15559876543' },
      messageText: 'Daily status update',
      scheduledAt: '2026-09-15T06:00:00.000Z',
      recurrence: { type: 'daily', hasEndDate: false, endDate: null },
      status: 'pending',
      alarmRequestCode: 102,
      createdAt: '2026-09-14T06:00:00.000Z',
      updatedAt: '2026-09-15T06:00:00.000Z',
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          initialSchedule={pastDailySchedule}
          onClose={jest.fn()}
          onSubmit={onSubmitMock}
          now={BASE_TIME}
        />
      );
    });

    const submitBtn = renderer.root.findByProps({ testID: 'schedule-form-submit-button' });
    await act(async () => {
      await submitBtn.props.onPress();
    });

    // Should successfully submit because it rolled forward to 2026-09-16T06:00:00.000Z
    expect(onSubmitMock).toHaveBeenCalledTimes(1);
    const submittedData = onSubmitMock.mock.calls[0][0];
    expect(new Date(submittedData.scheduledAt).getTime()).toBeGreaterThan(BASE_TIME.getTime());
    expect(new Date(submittedData.scheduledAt).toISOString()).toBe('2026-09-16T06:00:00.000Z');
  });

  it('rolls past scheduled date to next future 24hr cycle when toggling daily recurrence on', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleFormModal
          visible={true}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const dailySwitch = renderer.root.findByProps({ testID: 'recurrence-daily-switch' });
    act(() => {
      dailySwitch.props.onValueChange(true);
    });

    expect(renderer.root.findByProps({ testID: 'recurrence-daily-switch' }).props.value).toBe(true);
  });
});
