/**
 * Sked SMS — EmptyState Component
 * Target: src/components/EmptyState.tsx
 *
 * Displays an inviting empty state when no active scheduled messages exist,
 * prompting the user to tap the floating action button (+) to schedule an SMS.
 * Also integrates application welcome & description to satisfy baseline branding requirements.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';

export interface EmptyStateProps {
  title?: string;
  subtitle?: string;
  welcomeText?: string;
  descriptionText?: string;
  onActionPress?: () => void;
  actionLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Scheduled Messages',
  subtitle = 'Tap the + button below to schedule your first SMS',
  welcomeText = 'Welcome to Sked SMS',
  descriptionText = 'Schedule automated SMS messages to selected contacts at specified dates and times.',
  onActionPress,
  actionLabel = 'Schedule a Message',
  testID = 'empty-state',
  style,
}) => {
  const rootStyle = style ? [styles.container, style] : styles.container;

  return (
    <View style={rootStyle} testID={testID}>
      {/* Welcome Section */}
      <Text style={styles.welcomeText} testID="app-welcome-text">
        {welcomeText}
      </Text>
      <Text style={styles.bodyText} testID="app-body-text">
        {descriptionText}
      </Text>

      {/* Empty State Illustration / Badge */}
      <Text style={styles.iconCircle} testID="empty-state-icon">
        ✉️
      </Text>

      {/* Empty State Messaging */}
      <Text style={styles.title} testID="empty-state-title">
        {title}
      </Text>
      <Text style={styles.subtitle} testID="empty-state-subtitle">
        {subtitle}
      </Text>

      {/* Optional Action Button */}
      {onActionPress ? (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onActionPress}
          activeOpacity={0.8}
          testID="empty-state-action-btn"
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 14,
    color: '#616161',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E0F2F1',
    textAlign: 'center',
    lineHeight: 68,
    fontSize: 30,
    overflow: 'hidden',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  actionButton: {
    marginTop: 20,
    backgroundColor: '#0D9488',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default EmptyState;
