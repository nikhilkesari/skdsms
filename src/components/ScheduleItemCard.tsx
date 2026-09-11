/**
 * Sked SMS — ScheduleItemCard Component
 * Target: src/components/ScheduleItemCard.tsx
 *
 * Card presentation component displaying a scheduled message:
 * - Recipient name and normalized phone number
 * - Truncated message text preview
 * - Formatted scheduled date & time
 * - Recurrence badge ("Daily", "Daily • until YYYY-MM-DD", "One-time")
 * - Status badge ("Pending", "Sent", "Failed", "Cancelled", "Completed")
 * - Action buttons for Edit / Reschedule and Delete
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
import type {
  ScheduledMessage,
  RecurrenceRule,
  ScheduleStatus,
} from '../types/schedule';

export interface ScheduleItemCardProps {
  schedule: ScheduledMessage;
  onPress?: (schedule: ScheduledMessage) => void;
  onEdit?: (schedule: ScheduledMessage) => void;
  onDelete?: (schedule: ScheduledMessage) => void;
  useUTC?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Formats an ISO 8601 string into a human-readable date and time representation.
 * Defaults to UTC for cross-timezone test determinism.
 * e.g., "Sep 15, 2026 at 10:00 AM"
 */
export function formatScheduledDateTime(
  isoString: string,
  useUTC: boolean = false
): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = useUTC ? months[d.getUTCMonth()] : months[d.getMonth()];
  const day = useUTC ? d.getUTCDate() : d.getDate();
  const year = useUTC ? d.getUTCFullYear() : d.getFullYear();

  let hours = useUTC ? d.getUTCHours() : d.getHours();
  const minutes = (useUTC ? d.getUTCMinutes() : d.getMinutes())
    .toString()
    .padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  return `${month} ${day}, ${year} at ${displayHours}:${minutes} ${ampm}`;
}

/**
 * Returns human-readable label for recurrence rules.
 */
export function getRecurrenceLabel(rule?: RecurrenceRule): string {
  if (!rule || rule.type === 'none') {
    return 'One-time';
  }
  if (rule.type === 'daily') {
    if (rule.hasEndDate && rule.endDate) {
      return `Daily (until ${rule.endDate})`;
    }
    return 'Daily';
  }
  return 'Custom';
}

/**
 * Returns styling and label configuration for schedule statuses.
 */
export function getStatusConfig(status: ScheduleStatus): {
  label: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        backgroundColor: '#FEF3C7',
        textColor: '#92400E',
        borderColor: '#FDE68A',
      };
    case 'sent':
      return {
        label: 'Sent',
        backgroundColor: '#DCFCE7',
        textColor: '#166534',
        borderColor: '#BBF7D0',
      };
    case 'failed':
      return {
        label: 'Failed',
        backgroundColor: '#FEE2E2',
        textColor: '#991B1B',
        borderColor: '#FECACA',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        backgroundColor: '#F3F4F6',
        textColor: '#4B5563',
        borderColor: '#E5E7EB',
      };
    case 'completed':
      return {
        label: 'Completed',
        backgroundColor: '#E0E7FF',
        textColor: '#3730A3',
        borderColor: '#C7D2FE',
      };
    default:
      return {
        label: status,
        backgroundColor: '#F3F4F6',
        textColor: '#4B5563',
        borderColor: '#E5E7EB',
      };
  }
}

export const ScheduleItemCard: React.FC<ScheduleItemCardProps> = ({
  schedule,
  onPress,
  onEdit,
  onDelete,
  useUTC = false,
  testID,
  style,
}) => {
  const cardTestID = testID || `schedule-card-${schedule.id}`;
  const statusConfig = getStatusConfig(schedule.status);
  const formattedDateTime = formatScheduledDateTime(schedule.scheduledAt, useUTC);
  const recurrenceLabel = getRecurrenceLabel(schedule.recurrence);

  const handleCardPress = () => {
    if (onPress) {
      onPress(schedule);
    } else if (onEdit) {
      onEdit(schedule);
    }
  };

  const handleEditPress = (e: any) => {
    e?.stopPropagation?.();
    if (onEdit) {
      onEdit(schedule);
    } else if (onPress) {
      onPress(schedule);
    }
  };

  const handleDeletePress = (e: any) => {
    e?.stopPropagation?.();
    if (onDelete) {
      onDelete(schedule);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={handleCardPress}
      activeOpacity={0.7}
      testID={cardTestID}
      accessibilityRole="button"
      accessibilityLabel={`Scheduled message to ${schedule.recipient.name}`}
    >
      {/* Header Row: Recipient & Badges */}
      <View style={styles.headerRow}>
        <View style={styles.recipientContainer}>
          <Text
            style={styles.recipientName}
            numberOfLines={1}
            testID={`schedule-recipient-${schedule.id}`}
          >
            {schedule.recipient.name}
          </Text>
          <Text
            style={styles.phoneNumber}
            numberOfLines={1}
            testID={`schedule-phone-${schedule.id}`}
          >
            {schedule.recipient.phoneNumber}
          </Text>
        </View>

        <View style={styles.badgesContainer}>
          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: statusConfig.backgroundColor,
                borderColor: statusConfig.borderColor,
              },
            ]}
            testID={`schedule-status-${schedule.id}`}
          >
            <Text
              style={[styles.statusText, { color: statusConfig.textColor }]}
            >
              {statusConfig.label}
            </Text>
          </View>

          {/* Recurrence Badge */}
          <View
            style={[
              styles.recurrenceBadge,
              schedule.recurrence?.type === 'daily'
                ? styles.dailyBadge
                : styles.oneTimeBadge,
            ]}
            testID={`schedule-recurrence-${schedule.id}`}
          >
            <Text
              style={[
                styles.recurrenceText,
                schedule.recurrence?.type === 'daily'
                  ? styles.dailyText
                  : styles.oneTimeText,
              ]}
            >
              {recurrenceLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Message Preview Body */}
      <View style={styles.bodyRow}>
        <Text
          style={styles.messagePreview}
          numberOfLines={2}
          ellipsizeMode="tail"
          testID={`schedule-message-${schedule.id}`}
        >
          {schedule.messageText}
        </Text>
      </View>

      {/* Footer Row: Scheduled Date & Action Buttons */}
      <View style={styles.footerRow}>
        <View style={styles.dateTimeContainer}>
          <Text style={styles.clockIcon}>🕒</Text>
          <Text
            style={styles.dateTimeText}
            numberOfLines={1}
            testID={`schedule-datetime-${schedule.id}`}
          >
            {formattedDateTime}
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditPress}
            activeOpacity={0.6}
            testID={`schedule-edit-${schedule.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Edit schedule for ${schedule.recipient.name}`}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeletePress}
            activeOpacity={0.6}
            testID={`schedule-delete-${schedule.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Delete schedule for ${schedule.recipient.name}`}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  recipientContainer: {
    flex: 1,
    marginRight: 8,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  phoneNumber: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recurrenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  recurrenceText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dailyBadge: {
    backgroundColor: '#EDE9FE',
    borderColor: '#DDD6FE',
  },
  dailyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6D28D9',
  },
  oneTimeBadge: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  oneTimeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#475569',
  },
  bodyRow: {
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#0D9488',
  },
  messagePreview: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  clockIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  dateTimeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
});

export default ScheduleItemCard;
