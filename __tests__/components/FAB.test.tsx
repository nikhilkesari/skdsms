import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';

describe('FloatingActionButton Component Unit & UI Tests', () => {
  it('renders with default testID "fab-add-schedule" and label "+"', () => {
    const onPressMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<FloatingActionButton onPress={onPressMock} />);
    });

    const root = renderer.root;
    const fabButton = root.findByProps({ testID: 'fab-add-schedule' });
    expect(fabButton).toBeDefined();

    const icon = root.findByProps({ testID: 'fab-icon' });
    expect(icon.props.children).toBe('+');
  });

  it('triggers onPress callback when clicked', () => {
    const onPressMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<FloatingActionButton onPress={onPressMock} />);
    });

    const fabButton = renderer.root.findByProps({ testID: 'fab-add-schedule' });
    act(() => {
      fabButton.props.onPress();
    });

    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('has accessible button role and accessibility labels', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <FloatingActionButton
          onPress={jest.fn()}
          accessibilityLabel="Custom Add Button"
          accessibilityHint="Creates a message"
        />
      );
    });

    const fabButton = renderer.root.findByProps({ testID: 'fab-add-schedule' });
    expect(fabButton.props.accessibilityRole).toBe('button');
    expect(fabButton.props.accessibilityLabel).toBe('Custom Add Button');
    expect(fabButton.props.accessibilityHint).toBe('Creates a message');
    expect(fabButton.props.accessible).toBe(true);
  });

  it('has absolute positioning at bottom-right corner (bottom: 24, right: 24)', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<FloatingActionButton onPress={jest.fn()} />);
    });

    const fabButton = renderer.root.findByProps({ testID: 'fab-add-schedule' });
    const flattenedStyle = Array.isArray(fabButton.props.style)
      ? Object.assign({}, ...fabButton.props.style.filter(Boolean))
      : fabButton.props.style;

    expect(flattenedStyle.position).toBe('absolute');
    expect(flattenedStyle.bottom).toBe(24);
    expect(flattenedStyle.right).toBe(24);
    expect(flattenedStyle.width).toBe(56);
    expect(flattenedStyle.height).toBe(56);
    expect(flattenedStyle.borderRadius).toBe(28);
  });

  it('respects disabled prop: does not trigger onPress and applies disabled style', () => {
    const onPressMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <FloatingActionButton onPress={onPressMock} disabled={true} />
      );
    });

    const fabButton = renderer.root.findByProps({ testID: 'fab-add-schedule' });
    expect(fabButton.props.disabled).toBe(true);

    const flattenedStyle = Array.isArray(fabButton.props.style)
      ? Object.assign({}, ...fabButton.props.style.filter(Boolean))
      : fabButton.props.style;

    expect(flattenedStyle.backgroundColor).toBe('#BDBDBD');
  });

  it('allows rendering custom label text', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <FloatingActionButton onPress={jest.fn()} label="Add" />
      );
    });

    const icon = renderer.root.findByProps({ testID: 'fab-icon' });
    expect(icon.props.children).toBe('Add');
  });

  it('unmounts cleanly without throwing', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<FloatingActionButton onPress={jest.fn()} />);
    });

    expect(() => {
      act(() => {
        renderer.unmount();
      });
    }).not.toThrow();
  });
});
