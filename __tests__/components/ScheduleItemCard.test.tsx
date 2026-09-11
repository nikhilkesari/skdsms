/**
 * Sked SMS — ScheduleItemCard Component Tests
 * Target: __tests__/components/ScheduleItemCard.test.tsx
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import ScheduleItemCard, {
  formatScheduledDateTime,
  getRecurrenceLabel,
  getStatusConfig,
} from '../../src/components/ScheduleItemCard';
import type { ScheduledMessage } from '../../src/types/schedule';

describe('ScheduleItemCard Component', () => {
  const mockSchedule: ScheduledMessage = {
    id: 'test-uuid-1234',
    recipient: {
      name: 'Jane Doe',
      phoneNumber: '+15551234567',
    },
    messageText: 'Hello Jane, meeting at 2 PM today!',
    scheduledAt: '2026-09-15T14:00:00.000Z',
    recurrence: {
      type: 'daily',
      hasEndDate: false,
    },
    status: 'pending',
    alarmRequestCode: 98765,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
  };

  it('renders recipient name and phone number', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} />
      );
    });

    const root = renderer.root;
    const nameNode = root.findByProps({
      testID: `schedule-recipient-${mockSchedule.id}`,
    });
    expect(nameNode.props.children).toBe('Jane Doe');

    const phoneNode = root.findByProps({
      testID: `schedule-phone-${mockSchedule.id}`,
    });
    expect(phoneNode.props.children).toBe('+15551234567');
  });

  it('renders message text preview', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} />
      );
    });

    const root = renderer.root;
    const msgNode = root.findByProps({
      testID: `schedule-message-${mockSchedule.id}`,
    });
    expect(msgNode.props.children).toBe('Hello Jane, meeting at 2 PM today!');
    expect(msgNode.props.numberOfLines).toBe(2);
  });

  it('renders formatted scheduled date & time', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} useUTC={true} />
      );
    });

    const root = renderer.root;
    const dateNode = root.findByProps({
      testID: `schedule-datetime-${mockSchedule.id}`,
    });
    expect(dateNode.props.children).toBe('Sep 15, 2026 at 2:00 PM');
  });

  it('renders correct recurrence badge for daily recurrence', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} />
      );
    });

    const root = renderer.root;
    const recurrenceNode = root.findByProps({
      testID: `schedule-recurrence-${mockSchedule.id}`,
    });
    const textNode = recurrenceNode.findByType('Text' as any);
    expect(textNode.props.children).toBe('Daily');
  });

  it('renders correct recurrence badge for one-time schedule', () => {
    const oneTimeSchedule: ScheduledMessage = {
      ...mockSchedule,
      recurrence: { type: 'none' },
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={oneTimeSchedule} />
      );
    });

    const root = renderer.root;
    const recurrenceNode = root.findByProps({
      testID: `schedule-recurrence-${mockSchedule.id}`,
    });
    const textNode = recurrenceNode.findByType('Text' as any);
    expect(textNode.props.children).toBe('One-time');
  });

  it('renders status badge with Pending styling', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} />
      );
    });

    const root = renderer.root;
    const statusNode = root.findByProps({
      testID: `schedule-status-${mockSchedule.id}`,
    });
    const textNode = statusNode.findByType('Text' as any);
    expect(textNode.props.children).toBe('Pending');
  });

  it('triggers onPress callback when card is pressed', () => {
    const handlePress = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} onPress={handlePress} />
      );
    });

    const root = renderer.root;
    const card = root.findByProps({
      testID: `schedule-card-${mockSchedule.id}`,
    });

    act(() => {
      card.props.onPress();
    });

    expect(handlePress).toHaveBeenCalledWith(mockSchedule);
  });

  it('triggers onEdit callback when Edit button is tapped', () => {
    const handleEdit = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} onEdit={handleEdit} />
      );
    });

    const root = renderer.root;
    const editBtn = root.findByProps({
      testID: `schedule-edit-${mockSchedule.id}`,
    });

    act(() => {
      editBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(handleEdit).toHaveBeenCalledWith(mockSchedule);
  });

  it('triggers onDelete callback when Delete button is tapped', () => {
    const handleDelete = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleItemCard schedule={mockSchedule} onDelete={handleDelete} />
      );
    });

    const root = renderer.root;
    const deleteBtn = root.findByProps({
      testID: `schedule-delete-${mockSchedule.id}`,
    });

    act(() => {
      deleteBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(handleDelete).toHaveBeenCalledWith(mockSchedule);
  });

  describe('Utility Functions', () => {
    it('formatScheduledDateTime formats invalid date gracefully', () => {
      expect(formatScheduledDateTime('invalid-date')).toBe('invalid-date');
      expect(formatScheduledDateTime('')).toBe('');
    });

    it('getRecurrenceLabel handles daily with end date', () => {
      expect(
        getRecurrenceLabel({
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-30',
        })
      ).toBe('Daily (until 2026-09-30)');
    });

    it('getStatusConfig provides config for sent, failed, cancelled, completed', () => {
      expect(getStatusConfig('sent').label).toBe('Sent');
      expect(getStatusConfig('failed').label).toBe('Failed');
      expect(getStatusConfig('cancelled').label).toBe('Cancelled');
      expect(getStatusConfig('completed').label).toBe('Completed');
    });
  });
});
