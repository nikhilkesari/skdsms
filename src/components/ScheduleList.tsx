/**
 * Sked SMS — ScheduleList Component
 * Target: src/components/ScheduleList.tsx
 *
 * Displays all active scheduled messages in a chronologically sorted list:
 * - Chronological ascending sort by scheduledAt
 * - Pull-to-refresh support via RefreshControl
 * - EmptyState illustration and prompt when queue is empty
 * - Edit / Reschedule selection triggers
 * - Delete confirmation alert dialog (Alert.alert) with alarm cancellation
 */

import React, { useMemo } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Alert,
  StyleProp,
  ViewStyle,
  View,
} from 'react-native';
import type { ScheduledMessage } from '../types/schedule';
import ScheduleItemCard from './ScheduleItemCard';
import EmptyState from './EmptyState';

export interface ScheduleListProps {
  schedules?: ScheduledMessage[];
  refreshing?: boolean;
  onRefresh?: () => Promise<void> | void;
  onEdit?: (schedule: ScheduledMessage) => void;
  onDelete?: (schedule: ScheduledMessage) => void | Promise<void>;
  onSelect?: (schedule: ScheduledMessage) => void;
  onAddPress?: () => void;
  filterPendingOnly?: boolean;
  useUTC?: boolean;
  testID?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Native confirmation alert dialog for deleting a scheduled message.
 * Confirms user intent before disarming alarms and deleting records.
 */
export function confirmAndDeleteSchedule(
  schedule: ScheduledMessage,
  onConfirmDelete: (schedule: ScheduledMessage) => Promise<void> | void,
  onCancel?: () => void
): void {
  Alert.alert(
    'Delete Schedule',
    'Are you sure you want to cancel and delete this scheduled message?',
    [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: onCancel,
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await onConfirmDelete(schedule);
        },
      },
    ],
    { cancelable: true }
  );
}

export const ScheduleList: React.FC<ScheduleListProps> = ({
  schedules = [],
  refreshing = false,
  onRefresh,
  onEdit,
  onDelete,
  onSelect,
  onAddPress,
  filterPendingOnly = false,
  useUTC = false,
  testID = 'schedule-list',
  contentContainerStyle,
}) => {
  // Filter (if requested) and sort chronologically ascending by scheduledAt
  const sortedSchedules = useMemo(() => {
    if (schedules.length === 0) return schedules;

    const list = filterPendingOnly
      ? schedules.filter((s) => s.status === 'pending')
      : schedules;

    if (list.length <= 1) return list;

    return [...list].sort((a, b) => {
      const timeA = new Date(a.scheduledAt).getTime();
      const timeB = new Date(b.scheduledAt).getTime();
      return timeA - timeB;
    });
  }, [schedules, filterPendingOnly]);

  const handleDeleteItem = (schedule: ScheduledMessage) => {
    if (!onDelete) return;
    confirmAndDeleteSchedule(schedule, onDelete);
  };

  const handleCardPress = (schedule: ScheduledMessage) => {
    if (onSelect) {
      onSelect(schedule);
    } else if (onEdit) {
      onEdit(schedule);
    }
  };

  if (sortedSchedules.length === 0) {
    return (
      <EmptyState
        onActionPress={onAddPress}
        testID="schedule-empty-state"
        style={contentContainerStyle ? [styles.emptyContainer, contentContainerStyle] : styles.emptyContainer}
      />
    );
  }

  return (
    <View style={styles.container} testID={`${testID}-container`}>
      <FlatList
        data={sortedSchedules}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ScheduleItemCard
            schedule={item}
            onPress={handleCardPress}
            onEdit={onEdit}
            onDelete={handleDeleteItem}
            useUTC={useUTC}
          />
        )}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0D9488']}
              tintColor="#0D9488"
            />
          ) : undefined
        }
        contentContainerStyle={[styles.listContent, contentContainerStyle]}
        testID={testID}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F5F7FA',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 96,
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 96, // Clearance for bottom-right Floating Action Button
  },
});

export default ScheduleList;
