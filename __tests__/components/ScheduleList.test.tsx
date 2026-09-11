/**
 * Sked SMS — ScheduleList Component Tests
 * Target: __tests__/components/ScheduleList.test.tsx
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import ScheduleList, {
  confirmAndDeleteSchedule,
} from '../../src/components/ScheduleList';
import type { ScheduledMessage } from '../../src/types/schedule';

describe('ScheduleList Component', () => {
  const mockSchedules: ScheduledMessage[] = [
    {
      id: 'uuid-late',
      recipient: { name: 'Late Contact', phoneNumber: '+15552222222' },
      messageText: 'Later meeting at 4 PM',
      scheduledAt: '2026-09-15T16:00:00.000Z',
      recurrence: { type: 'none' },
      status: 'pending',
      alarmRequestCode: 1001,
      createdAt: '2026-09-14T10:00:00.000Z',
      updatedAt: '2026-09-14T10:00:00.000Z',
    },
    {
      id: 'uuid-early',
      recipient: { name: 'Early Contact', phoneNumber: '+15551111111' },
      messageText: 'Morning standup at 9 AM',
      scheduledAt: '2026-09-15T09:00:00.000Z',
      recurrence: { type: 'daily' },
      status: 'pending',
      alarmRequestCode: 1002,
      createdAt: '2026-09-14T10:00:00.000Z',
      updatedAt: '2026-09-14T10:00:00.000Z',
    },
  ];

  let currentRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (currentRenderer) {
      act(() => {
        currentRenderer?.unmount();
      });
      currentRenderer = null;
    }
    jest.restoreAllMocks();
  });

  it('renders EmptyState when schedules list is empty', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ScheduleList schedules={[]} />);
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const emptyState = root.findByProps({ testID: 'schedule-empty-state' });
    expect(emptyState).toBeDefined();

    const title = root.findByProps({ testID: 'empty-state-title' });
    expect(title.props.children).toBe('No Scheduled Messages');
  });

  it('renders all scheduled items in the FlatList', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleList schedules={mockSchedules} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const earlyCard = root.findByProps({
      testID: 'schedule-card-uuid-early',
    });
    const lateCard = root.findByProps({
      testID: 'schedule-card-uuid-late',
    });

    expect(earlyCard).toBeDefined();
    expect(lateCard).toBeDefined();
  });

  it('sorts scheduled items chronologically by scheduledAt ascending', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      // Pass late item first, early item second
      renderer = ReactTestRenderer.create(
        <ScheduleList schedules={mockSchedules} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const flatList = root.findByProps({ testID: 'schedule-list' });
    const renderedData = flatList.props.data as ScheduledMessage[];

    expect(renderedData[0].id).toBe('uuid-early'); // 09:00 AM
    expect(renderedData[1].id).toBe('uuid-late');  // 16:00 PM
  });

  it('supports pull-to-refresh and calls onRefresh when triggered', () => {
    const handleRefresh = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleList
          schedules={mockSchedules}
          refreshing={false}
          onRefresh={handleRefresh}
        />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const flatList = root.findByProps({ testID: 'schedule-list' });
    const refreshControl = flatList.props.refreshControl;
    expect(refreshControl).toBeDefined();

    act(() => {
      refreshControl.props.onRefresh();
    });

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect or onEdit when a schedule card is selected', () => {
    const handleSelect = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleList
          schedules={mockSchedules}
          onSelect={handleSelect}
        />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const earlyCard = root.findByProps({
      testID: 'schedule-card-uuid-early',
    });

    act(() => {
      earlyCard.props.onPress();
    });

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'uuid-early' })
    );
  });

  it('triggers native confirmation alert dialog when Delete is tapped on a card', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const handleDelete = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleList
          schedules={mockSchedules}
          onDelete={handleDelete}
        />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const deleteBtn = root.findByProps({
      testID: 'schedule-delete-uuid-early',
    });

    act(() => {
      deleteBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Schedule',
      'Are you sure you want to cancel and delete this scheduled message?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ]),
      { cancelable: true }
    );
  });

  it('disarms and removes schedule when Delete is confirmed in Alert dialog', async () => {
    let capturedButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      capturedButtons = buttons || [];
    });

    const handleDelete = jest.fn().mockResolvedValue(true);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleList
          schedules={mockSchedules}
          onDelete={handleDelete}
        />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const deleteBtn = root.findByProps({
      testID: 'schedule-delete-uuid-early',
    });

    act(() => {
      deleteBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    const deleteAction = capturedButtons.find((b) => b.text === 'Delete');
    expect(deleteAction).toBeDefined();

    await act(async () => {
      await deleteAction.onPress();
    });

    expect(handleDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'uuid-early' })
    );
  });

  it('does not invoke onDelete when Cancel is pressed in confirmation dialog', () => {
    let capturedButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      capturedButtons = buttons || [];
    });

    const handleDelete = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleList
          schedules={mockSchedules}
          onDelete={handleDelete}
        />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const deleteBtn = root.findByProps({
      testID: 'schedule-delete-uuid-early',
    });

    act(() => {
      deleteBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    const cancelAction = capturedButtons.find((b) => b.text === 'Cancel');
    expect(cancelAction).toBeDefined();

    act(() => {
      if (cancelAction.onPress) {
        cancelAction.onPress();
      }
    });

    expect(handleDelete).not.toHaveBeenCalled();
  });

  it('filters pending only when filterPendingOnly is enabled', () => {
    const mixedSchedules: ScheduledMessage[] = [
      ...mockSchedules,
      {
        id: 'uuid-sent',
        recipient: { name: 'Sent User', phoneNumber: '+15553333333' },
        messageText: 'Already sent',
        scheduledAt: '2026-09-14T08:00:00.000Z',
        recurrence: { type: 'none' },
        status: 'sent',
        alarmRequestCode: 1003,
        createdAt: '2026-09-13T10:00:00.000Z',
        updatedAt: '2026-09-14T08:00:00.000Z',
      },
    ];

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ScheduleList
          schedules={mixedSchedules}
          filterPendingOnly={true}
        />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const flatList = root.findByProps({ testID: 'schedule-list' });
    const renderedData = flatList.props.data as ScheduledMessage[];

    expect(renderedData.length).toBe(2);
    expect(renderedData.find((s) => s.id === 'uuid-sent')).toBeUndefined();
  });
});
