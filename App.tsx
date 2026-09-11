/**
 * Sked SMS — Main Application Root Component
 * Target: App.tsx
 *
 * Root component integrating:
 * - ScheduleProvider (State Management & Persistence Layer)
 * - Header branding ("Sked SMS", "Automated SMS Scheduler")
 * - ScheduleList with pull-to-refresh & EmptyState
 * - FloatingActionButton (FAB, bottom-right)
 * - ScheduleFormModal (Create & Edit schedule modal dialog)
 * - Edit, Reschedule & Delete Action Workflows
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { ScheduleProvider, useSchedules } from './src/context/ScheduleContext';
import ScheduleList from './src/components/ScheduleList';
import FloatingActionButton from './src/components/FloatingActionButton';
import ScheduleFormModal from './src/components/ScheduleFormModal';
import type {
  ScheduledMessage,
  CreateScheduleInput,
  UpdateScheduleInput,
} from './src/types/schedule';
import type { ScheduleRepository } from './src/repositories/ScheduleRepository';
import type { AlarmScheduler, SmsDispatcher } from './src/services/sms/types';

export interface AppProps {
  repository?: ScheduleRepository;
  dispatcher?: SmsDispatcher;
  smsDispatcher?: SmsDispatcher;
  alarmScheduler?: AlarmScheduler;
  autoLoad?: boolean;
}

/**
 * Inner application content connected to ScheduleContext state.
 */
export const MainScreen: React.FC = () => {
  const {
    activeSchedules = [],
    schedules = [],
    loading = false,
    refreshSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  } = useSchedules();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduledMessage | null>(null);

  // Request essential SMS, Contacts, and Notification permissions on Android launch
  useEffect(() => {
    if (Platform.OS === 'android') {
      const requestAppPermissions = async () => {
        try {
          const perms: any[] = [
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
            PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          ];
          const versionNum =
            typeof Platform.Version === 'number'
              ? Platform.Version
              : parseInt(String(Platform.Version), 10);
          if (versionNum >= 33) {
            perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          }
          await PermissionsAndroid.requestMultiple(perms);
        } catch {
          // Gracefully continue
        }
      };
      requestAppPermissions();
    }
  }, []);

  // Workflow: Opening modal in create mode
  const handleOpenCreate = useCallback(() => {
    setSelectedSchedule(null);
    setIsModalOpen(true);
  }, []);

  // Workflow: Opening modal in edit/reschedule mode
  const handleOpenEdit = useCallback((schedule: ScheduledMessage) => {
    setSelectedSchedule(schedule);
    setIsModalOpen(true);
  }, []);

  // Workflow: Closing modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedSchedule(null);
  }, []);

  // Workflow: Submitting create or edit form
  const handleSubmitSchedule = useCallback(
    async (data: CreateScheduleInput | UpdateScheduleInput) => {
      if (selectedSchedule) {
        await updateSchedule(selectedSchedule.id, data as UpdateScheduleInput);
      } else {
        await createSchedule(data as CreateScheduleInput);
      }
      handleCloseModal();
    },
    [selectedSchedule, updateSchedule, createSchedule, handleCloseModal]
  );

  // Workflow: Deleting schedule (ScheduleList already confirms via native Alert)
  const handleDeleteSchedule = useCallback(
    async (schedule: ScheduledMessage) => {
      await deleteSchedule(schedule.id);
    },
    [deleteSchedule]
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />

      {/* Header View: Branding */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} testID="app-header-title">
          Sked SMS
        </Text>
        <Text style={styles.headerSubtitle}>Automated SMS Scheduler</Text>
      </View>

      {/* Content View: Schedule List, FAB, and Modal */}
      <View style={styles.content}>
        <ScheduleList
          schedules={schedules}
          refreshing={loading}
          onRefresh={refreshSchedules}
          onEdit={handleOpenEdit}
          onSelect={handleOpenEdit}
          onDelete={handleDeleteSchedule}
          testID="app-schedule-list"
        />

        {/* Floating Action Button (Material Design, bottom-right 24dp) */}
        <FloatingActionButton
          onPress={handleOpenCreate}
          testID="app-fab-button"
        />

        {/* Schedule Creation & Edit Modal */}
        <ScheduleFormModal
          visible={isModalOpen}
          initialSchedule={selectedSchedule}
          onClose={handleCloseModal}
          onSubmit={handleSubmitSchedule}
          testID="app-schedule-form-modal"
        />
      </View>
    </SafeAreaView>
  );
};

/**
 * Root App component wrapping hierarchy with ScheduleProvider.
 */
const App: React.FC<AppProps> = ({
  repository,
  dispatcher,
  smsDispatcher,
  alarmScheduler,
  autoLoad,
}) => {
  const effectiveDispatcher = smsDispatcher ?? dispatcher;
  const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const effectiveAutoLoad = autoLoad ?? (isTestEnv ? Boolean(repository) : true);

  return (
    <ScheduleProvider
      repository={repository}
      smsDispatcher={effectiveDispatcher}
      alarmScheduler={alarmScheduler}
      autoLoad={effectiveAutoLoad}
    >
      <MainScreen />
    </ScheduleProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    backgroundColor: '#0D9488',
    paddingVertical: 18,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#E0F2F1',
    marginTop: 2,
  },
  content: {
    flex: 1,
    position: 'relative',
  },
});

export default App;
