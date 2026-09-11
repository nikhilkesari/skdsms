import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  DateTimePickerInput,
  formatScheduleDateTime,
  formatScheduleDate,
  formatScheduleTime,
} from '../../src/components/DateTimePickerInput';

describe('DateTimePickerInput Component Unit & UI Tests', () => {
  const BASE_TIME = new Date('2026-09-15T10:00:00.000Z');

  it('formats dates and times accurately in "MMM DD, YYYY at HH:mm" format', () => {
    const testDate = new Date('2026-12-25T15:45:00');
    expect(formatScheduleDateTime(testDate)).toContain('Dec 25, 2026 at 15:45');
    expect(formatScheduleDate(testDate)).toBe('Dec 25, 2026');
    expect(formatScheduleTime(testDate)).toBe('15:45');
  });

  it('displays valid confirmation banner when selected date is >= 30 seconds in the future', () => {
    const futureDate = new Date(BASE_TIME.getTime() + 10 * 60 * 1000); // +10 minutes
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <DateTimePickerInput
          selectedDate={futureDate}
          onChangeDate={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const validBanner = renderer.root.findByProps({ testID: 'datetime-validation-banner-valid' });
    expect(validBanner).toBeDefined();
  });

  it('displays error banner blocking past dates with 30s lead buffer', () => {
    const pastDate = new Date(BASE_TIME.getTime() - 5000); // 5 seconds in past
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <DateTimePickerInput
          selectedDate={pastDate}
          onChangeDate={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const errorBanner = renderer.root.findByProps({ testID: 'datetime-validation-banner' });
    expect(errorBanner).toBeDefined();
    const errorText = renderer.root.findByProps({ testID: 'datetime-validation-error-text' });
    expect(errorText.props.children.join('')).toContain('minimum 30 seconds');
  });

  it('blocks dates that are in future but less than 30 seconds ahead (< 30s buffer)', () => {
    const soonDate = new Date(BASE_TIME.getTime() + 15000); // 15 seconds in future
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <DateTimePickerInput
          selectedDate={soonDate}
          onChangeDate={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const errorBanner = renderer.root.findByProps({ testID: 'datetime-validation-banner' });
    expect(errorBanner).toBeDefined();
  });

  it('opens date picker modal when date trigger button is pressed', () => {
    const futureDate = new Date(BASE_TIME.getTime() + 60 * 60 * 1000);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <DateTimePickerInput
          selectedDate={futureDate}
          onChangeDate={jest.fn()}
          now={BASE_TIME}
        />
      );
    });

    const dateTrigger = renderer.root.findByProps({ testID: 'date-picker-trigger' });
    act(() => {
      dateTrigger.props.onPress();
    });

    const dateModal = renderer.root.findByProps({ testID: 'date-picker-modal' });
    expect(dateModal.props.visible).toBe(true);
  });

  it('allows selecting Tomorrow preset and confirming date change', () => {
    const futureDate = new Date(BASE_TIME.getTime() + 60 * 60 * 1000);
    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <DateTimePickerInput
          selectedDate={futureDate}
          onChangeDate={onChangeMock}
          now={BASE_TIME}
        />
      );
    });

    // Open modal
    act(() => {
      renderer.root.findByProps({ testID: 'date-picker-trigger' }).props.onPress();
    });

    // Tap "Tomorrow" preset
    act(() => {
      renderer.root.findByProps({ testID: 'date-preset-tomorrow' }).props.onPress();
    });

    // Confirm
    act(() => {
      renderer.root.findByProps({ testID: 'confirm-date-button' }).props.onPress();
    });

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const newDate: Date = onChangeMock.mock.calls[0][0];
    expect(newDate.getDate()).toBe(BASE_TIME.getDate() + 1);
  });

  it('opens time picker modal and allows selecting preset and confirming', () => {
    const futureDate = new Date(BASE_TIME.getTime() + 60 * 60 * 1000);
    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <DateTimePickerInput
          selectedDate={futureDate}
          onChangeDate={onChangeMock}
          now={BASE_TIME}
        />
      );
    });

    // Open time modal
    act(() => {
      renderer.root.findByProps({ testID: 'time-picker-trigger' }).props.onPress();
    });

    const timeModal = renderer.root.findByProps({ testID: 'time-picker-modal' });
    expect(timeModal.props.visible).toBe(true);

    // Tap "+1 Hour" preset
    act(() => {
      renderer.root.findByProps({ testID: 'time-preset-1h' }).props.onPress();
    });

    // Confirm
    act(() => {
      renderer.root.findByProps({ testID: 'confirm-time-button' }).props.onPress();
    });

    expect(onChangeMock).toHaveBeenCalled();
  });

  it('cancels date modal without invoking onChangeDate', () => {
    const futureDate = new Date(BASE_TIME.getTime() + 60 * 60 * 1000);
    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <DateTimePickerInput
          selectedDate={futureDate}
          onChangeDate={onChangeMock}
          now={BASE_TIME}
        />
      );
    });

    // Open date modal
    act(() => {
      renderer.root.findByProps({ testID: 'date-picker-trigger' }).props.onPress();
    });

    // Cancel
    act(() => {
      renderer.root.findByProps({ testID: 'cancel-date-button' }).props.onPress();
    });

    expect(onChangeMock).not.toHaveBeenCalled();
    const dateModal = renderer.root.findByProps({ testID: 'date-picker-modal' });
    expect(dateModal.props.visible).toBe(false);
  });
});
