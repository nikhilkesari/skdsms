/**
 * Sked SMS — Floating Action Button (FAB)
 * Target: src/components/FloatingActionButton.tsx
 *
 * Material Design FAB positioned at bottom-right corner of screen.
 * Accessible touch target (>= 48x48 dp), high elevation/shadow, opens schedule creation modal.
 */

import React, { memo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
  StyleProp,
  GestureResponderEvent,
} from 'react-native';

export interface FloatingActionButtonProps {
  onPress: (event?: GestureResponderEvent) => void;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
}

const ACC_STATE_DISABLED = { disabled: true };
const ACC_STATE_ENABLED = { disabled: false };

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = memo(({
  onPress,
  testID = 'fab-add-schedule',
  accessibilityLabel = 'Schedule new SMS message',
  accessibilityHint = 'Opens the schedule creation form modal',
  disabled = false,
  style,
  label = '+',
}) => {
  const containerStyle = disabled
    ? (style ? [styles.fab, styles.fabDisabled, style] : [styles.fab, styles.fabDisabled])
    : (style ? [styles.fab, style] : styles.fab);

  const iconStyle = disabled ? [styles.fabIcon, styles.fabIconDisabled] : styles.fabIcon;

  const handlePress = (e?: GestureResponderEvent) => {
    if (!disabled && onPress) {
      onPress(e);
    }
  };

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={disabled ? ACC_STATE_DISABLED : ACC_STATE_ENABLED}
      accessible={true}
      activeOpacity={0.8}
      onPress={handlePress}
      disabled={disabled}
      style={containerStyle}
    >
      <Text style={iconStyle} testID="fab-icon">
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0D9488', // Primary Teal
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabDisabled: {
    backgroundColor: '#BDBDBD',
    elevation: 0,
    shadowOpacity: 0,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '400',
    lineHeight: 34,
    textAlign: 'center',
  },
  fabIconDisabled: {
    color: '#F5F5F5',
  },
});

export default FloatingActionButton;
