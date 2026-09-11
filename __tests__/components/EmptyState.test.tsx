/**
 * Sked SMS — EmptyState Component Tests
 * Target: __tests__/components/EmptyState.test.tsx
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import EmptyState from '../../src/components/EmptyState';

describe('EmptyState Component', () => {
  it('renders default empty state title and subtitle', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<EmptyState />);
    });

    const root = renderer.root;
    const title = root.findByProps({ testID: 'empty-state-title' });
    expect(title.props.children).toBe('No Scheduled Messages');

    const subtitle = root.findByProps({ testID: 'empty-state-subtitle' });
    expect(subtitle.props.children).toBe(
      'Tap the + button below to schedule your first SMS'
    );
  });

  it('renders baseline branding welcome and body description text', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<EmptyState />);
    });

    const root = renderer.root;
    const welcome = root.findByProps({ testID: 'app-welcome-text' });
    expect(welcome.props.children).toBe('Welcome to Sked SMS');

    const body = root.findByProps({ testID: 'app-body-text' });
    expect(body.props.children).toContain('Schedule automated SMS messages');
  });

  it('renders custom title and subtitle when props are supplied', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <EmptyState
          title="Custom Empty Title"
          subtitle="Custom empty subtitle instructions"
        />
      );
    });

    const root = renderer.root;
    const title = root.findByProps({ testID: 'empty-state-title' });
    expect(title.props.children).toBe('Custom Empty Title');

    const subtitle = root.findByProps({ testID: 'empty-state-subtitle' });
    expect(subtitle.props.children).toBe('Custom empty subtitle instructions');
  });

  it('renders optional action button and triggers onActionPress callback', () => {
    const handleActionPress = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <EmptyState
          onActionPress={handleActionPress}
          actionLabel="Create First Schedule"
        />
      );
    });

    const root = renderer.root;
    const button = root.findByProps({ testID: 'empty-state-action-btn' });
    expect(button).toBeDefined();

    act(() => {
      button.props.onPress();
    });

    expect(handleActionPress).toHaveBeenCalledTimes(1);
  });

  it('renders illustration icon with mail symbol', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<EmptyState />);
    });

    const root = renderer.root;
    const icon = root.findByProps({ testID: 'empty-state-icon' });
    expect(icon).toBeDefined();
  });
});
