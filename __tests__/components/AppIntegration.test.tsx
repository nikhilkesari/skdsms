/**
 * Sked SMS — Main App Integration Tests
 * Target: __tests__/components/AppIntegration.test.tsx
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App, { MainScreen } from '../../App';
import { ScheduleProvider } from '../../src/context/ScheduleContext';
import { InMemoryScheduleRepository } from '../../src/repositories/InMemoryScheduleRepository';
import { MockSmsDispatcher } from '../../src/services/sms/MockSmsDispatcher';
import type { ScheduledMessage } from '../../src/types/schedule';

describe('App & Main UI Integration Tests', () => {
  let repository: InMemoryScheduleRepository;
  let dispatcher: MockSmsDispatcher;
  let currentRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    repository = new InMemoryScheduleRepository();
    dispatcher = new MockSmsDispatcher();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    if (currentRenderer) {
      act(() => {
        currentRenderer?.unmount();
      });
      currentRenderer = null;
    }
    jest.restoreAllMocks();
  });

  it('mounts App root hierarchy without crashing', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    expect(renderer).toBeDefined();
    const json = renderer.toJSON();
    expect(json).toBeTruthy();
  });

  it('renders application branding ("Sked SMS" and "Automated SMS Scheduler")', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const headerTitle = root.findByProps({ testID: 'app-header-title' });
    expect(headerTitle.props.children).toBe('Sked SMS');

    const textNodes = root.findAllByType('Text' as any);
    const subtitle = textNodes.find(
      (n) => n.props.children === 'Automated SMS Scheduler'
    );
    expect(subtitle).toBeDefined();
  });

  it('renders EmptyState when repository contains no scheduled messages', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const emptyStateTitle = root.findByProps({ testID: 'empty-state-title' });
    expect(emptyStateTitle.props.children).toBe('No Scheduled Messages');

    const welcomeText = root.findByProps({ testID: 'app-welcome-text' });
    expect(welcomeText.props.children).toBe('Welcome to Sked SMS');
  });

  it('renders FloatingActionButton and ScheduleFormModal in closed state initially', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const fab = root.findByProps({ testID: 'app-fab-button' });
    expect(fab).toBeDefined();

    const modal = root.findByProps({ testID: 'app-schedule-form-modal' });
    expect(modal.props.visible).toBe(false);
  });

  it('opens ScheduleFormModal when FloatingActionButton is pressed', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const fab = root.findByProps({ testID: 'app-fab-button' });

    act(() => {
      fab.props.onPress();
    });

    const modal = root.findByProps({ testID: 'app-schedule-form-modal' });
    expect(modal.props.visible).toBe(true);
    expect(modal.props.initialSchedule).toBeNull();
  });

  it('opens ScheduleFormModal pre-filled when a schedule card is selected', async () => {
    // Pre-populate repository with a schedule
    const schedule = await repository.create({
      recipient: { name: 'Alice Bob', phoneNumber: '+15551234567' },
      messageText: 'Pre-existing schedule test',
      scheduledAt: '2026-09-16T10:00:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const card = root.findByProps({
      testID: `schedule-card-${schedule.id}`,
    });
    expect(card).toBeDefined();

    act(() => {
      card.props.onPress();
    });

    const modal = root.findByProps({ testID: 'app-schedule-form-modal' });
    expect(modal.props.visible).toBe(true);
    expect(modal.props.initialSchedule).toEqual(
      expect.objectContaining({ id: schedule.id })
    );
  });

  it('triggers native delete confirmation alert and removes schedule from list upon confirmation', async () => {
    let capturedButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      capturedButtons = buttons || [];
    });

    const schedule = await repository.create({
      recipient: { name: 'To Be Deleted', phoneNumber: '+15559998888' },
      messageText: 'Will be deleted via UI action',
      scheduledAt: '2026-09-16T12:00:00.000Z',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    const root = renderer.root;
    const deleteBtn = root.findByProps({
      testID: `schedule-delete-${schedule.id}`,
    });

    act(() => {
      deleteBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Schedule',
      'Are you sure you want to cancel and delete this scheduled message?',
      expect.any(Array),
      { cancelable: true }
    );

    const deleteAction = capturedButtons.find((b) => b.text === 'Delete');
    expect(deleteAction).toBeDefined();

    await act(async () => {
      await deleteAction.onPress();
    });

    const remaining = await repository.getAll();
    expect(remaining.length).toBe(0);
  });

  it('preserves native tree hierarchy of RCTSafeAreaView with 2 child Views (Header and Content)', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <App repository={repository} dispatcher={dispatcher} />
      );
    });
    currentRenderer = renderer;

    const json = renderer.toJSON() as any;
    expect(json.type).toBe('RCTSafeAreaView');
    expect(json.children.length).toBe(2);
    expect(json.children[0].type).toBe('View'); // Header
    expect(json.children[1].type).toBe('View'); // Content
  });
});
