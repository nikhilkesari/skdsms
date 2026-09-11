/**
 * Sked SMS — Application Schedule State Context & Provider
 * Target: src/context/ScheduleContext.tsx
 *
 * Provides React state management for scheduled messages:
 * - Reactive schedules list and active pending schedules filter.
 * - Loading and error states with clearError action.
 * - CRUD & lifecycle actions: createSchedule, updateSchedule, reschedule,
 *   deleteSchedule, cancelSchedule, and refreshSchedules.
 * - Injects ScheduleRepository, SmsDispatcher, and AlarmScheduler via ScheduleManager.
 * - Includes unmount guards and singleton caching for default instances to prevent
 *   memory leaks during high-frequency mount/unmount cycles.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { NativeModules, Platform, DeviceEventEmitter } from 'react-native';
import type {
  ScheduledMessage,
  ScheduleStatus,
  RecurrenceRule,
  Recipient,
} from '../types/schedule';
import type { ScheduleRepository } from '../repositories/ScheduleRepository';
import { AsyncStorageScheduleRepository } from '../repositories/AsyncStorageScheduleRepository';
import type { AlarmScheduler, SmsDispatcher } from '../services/sms/types';
import { getSmsDispatcher } from '../services/sms';
import {
  ScheduleManager,
  type CreateScheduleParams,
  type UpdateScheduleParams,
} from '../services/scheduler/ScheduleManager';
import { NativeAlarmBridge } from '../services/scheduler/NativeAlarmBridge';

export type { CreateScheduleParams, UpdateScheduleParams };

export interface ScheduleContextValue {
  schedules: ScheduledMessage[];
  activeSchedules: ScheduledMessage[];
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  createSchedule: (input: CreateScheduleParams) => Promise<ScheduledMessage>;
  updateSchedule: (id: string, input: UpdateScheduleParams) => Promise<ScheduledMessage>;
  reschedule: (id: string, newDate: string | Date) => Promise<ScheduledMessage>;
  deleteSchedule: (id: string) => Promise<boolean>;
  cancelSchedule: (id: string) => Promise<ScheduledMessage>;
  refreshSchedules: () => Promise<void>;
  manager: ScheduleManager;
}

export interface ScheduleProviderProps {
  children: ReactNode;
  repository?: ScheduleRepository;
  alarmScheduler?: AlarmScheduler;
  smsDispatcher?: SmsDispatcher;
  scheduleManager?: ScheduleManager;
  autoLoad?: boolean;
}

const EMPTY_SCHEDULES: ScheduledMessage[] = [];

function sortSchedules(items: ScheduledMessage[]): ScheduledMessage[] {
  if (items.length <= 1) return items;
  return [...items].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
}

// Module-level singletons for default wiring
let defaultRepoInstance: ScheduleRepository | null = null;
let defaultDispatcherInstance: SmsDispatcher | null = null;
let defaultAlarmBridgeInstance: AlarmScheduler | null = null;
let defaultScheduleManagerInstance: ScheduleManager | null = null;

function getDefaultRepo(): ScheduleRepository {
  if (!defaultRepoInstance) {
    defaultRepoInstance = new AsyncStorageScheduleRepository();
  }
  return defaultRepoInstance;
}

function getDefaultDispatcher(): SmsDispatcher {
  if (!defaultDispatcherInstance) {
    defaultDispatcherInstance = getSmsDispatcher();
  }
  return defaultDispatcherInstance;
}

function getDefaultAlarmBridge(): AlarmScheduler {
  if (!defaultAlarmBridgeInstance) {
    defaultAlarmBridgeInstance = new NativeAlarmBridge();
  }
  return defaultAlarmBridgeInstance;
}

function getDefaultScheduleManager(): ScheduleManager {
  if (!defaultScheduleManagerInstance) {
    const repo = getDefaultRepo();
    const dispatcher = getDefaultDispatcher();
    const scheduler =
      typeof (dispatcher as any)?.scheduleAlarm === 'function'
        ? (dispatcher as unknown as AlarmScheduler)
        : getDefaultAlarmBridge();

    defaultScheduleManagerInstance = new ScheduleManager({
      repository: repo,
      alarmScheduler: scheduler,
      smsDispatcher: dispatcher,
    });
  }
  return defaultScheduleManagerInstance;
}

export const ScheduleContext = createContext<ScheduleContextValue | undefined>(
  undefined
);

export const ScheduleProvider: React.FC<ScheduleProviderProps> = ({
  children,
  repository,
  alarmScheduler,
  smsDispatcher,
  scheduleManager,
  autoLoad = true,
}) => {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const manager = useMemo(() => {
    if (scheduleManager) {
      return scheduleManager;
    }
    if (!repository && !alarmScheduler && !smsDispatcher) {
      return getDefaultScheduleManager();
    }
    const repo = repository ?? getDefaultRepo();
    const dispatcher = smsDispatcher ?? getDefaultDispatcher();
    const scheduler =
      alarmScheduler ??
      (typeof (dispatcher as any)?.scheduleAlarm === 'function'
        ? (dispatcher as unknown as AlarmScheduler)
        : getDefaultAlarmBridge());

    return new ScheduleManager({
      repository: repo,
      alarmScheduler: scheduler,
      smsDispatcher: dispatcher,
    });
  }, [scheduleManager, repository, alarmScheduler, smsDispatcher]);

  const [schedules, setSchedules] = useState<ScheduledMessage[]>(EMPTY_SCHEDULES);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshSchedules = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      if (
        Platform.OS === 'android' &&
        NativeModules.AlarmSchedulerModule &&
        typeof NativeModules.AlarmSchedulerModule.syncExecutedSchedules === 'function'
      ) {
        try {
          await NativeModules.AlarmSchedulerModule.syncExecutedSchedules();
        } catch {
          // Gracefully continue
        }
      }
      const all = await manager.getAllSchedules();
      if (!isMountedRef.current) return;
      setSchedules(sortSchedules(all));
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const errMsg = err?.message ?? 'Failed to load schedules';
      setError(errMsg);
      throw err;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [manager]);

  useEffect(() => {
    if (autoLoad) {
      refreshSchedules().catch(() => {
        // Error state is captured in refreshSchedules
      });
    }
  }, [autoLoad, refreshSchedules]);

  // Live real-time update when an SMS is dispatched while app is active
  useEffect(() => {
    if (Platform.OS === 'android') {
      const subscription = DeviceEventEmitter.addListener('onSmsDispatched', () => {
        refreshSchedules().catch(() => {});
      });
      return () => {
        subscription.remove();
      };
    }
  }, [refreshSchedules]);

  const createSchedule = useCallback(
    async (input: CreateScheduleParams): Promise<ScheduledMessage> => {
      if (!isMountedRef.current) throw new Error('Component unmounted');
      setLoading(true);
      setError(null);
      try {
        const created = await manager.createSchedule(input);
        if (isMountedRef.current) {
          setSchedules(prev => sortSchedules([...prev.filter(s => s.id !== created.id), created]));
        }
        return created;
      } catch (err: any) {
        if (isMountedRef.current) {
          const errMsg = err?.message ?? 'Failed to create schedule';
          setError(errMsg);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [manager]
  );

  const updateSchedule = useCallback(
    async (id: string, input: UpdateScheduleParams): Promise<ScheduledMessage> => {
      if (!isMountedRef.current) throw new Error('Component unmounted');
      setLoading(true);
      setError(null);
      try {
        const updated = await manager.updateSchedule(id, input);
        if (isMountedRef.current) {
          setSchedules(prev => sortSchedules(prev.map(s => (s.id === id ? updated : s))));
        }
        return updated;
      } catch (err: any) {
        if (isMountedRef.current) {
          const errMsg = err?.message ?? 'Failed to update schedule';
          setError(errMsg);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [manager]
  );

  const reschedule = useCallback(
    async (id: string, newDate: string | Date): Promise<ScheduledMessage> => {
      if (!isMountedRef.current) throw new Error('Component unmounted');
      setLoading(true);
      setError(null);
      try {
        const updated = await manager.reschedule(id, newDate);
        if (isMountedRef.current) {
          setSchedules(prev => sortSchedules(prev.map(s => (s.id === id ? updated : s))));
        }
        return updated;
      } catch (err: any) {
        if (isMountedRef.current) {
          const errMsg = err?.message ?? 'Failed to reschedule';
          setError(errMsg);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [manager]
  );

  const deleteSchedule = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isMountedRef.current) return false;
      setLoading(true);
      setError(null);
      try {
        const success = await manager.deleteSchedule(id);
        if (isMountedRef.current && success) {
          setSchedules(prev => prev.filter(s => s.id !== id));
        }
        return success;
      } catch (err: any) {
        if (isMountedRef.current) {
          const errMsg = err?.message ?? 'Failed to delete schedule';
          setError(errMsg);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [manager]
  );

  const cancelSchedule = useCallback(
    async (id: string): Promise<ScheduledMessage> => {
      if (!isMountedRef.current) throw new Error('Component unmounted');
      setLoading(true);
      setError(null);
      try {
        const cancelled = await manager.cancelSchedule(id);
        if (isMountedRef.current) {
          setSchedules(prev => sortSchedules(prev.map(s => (s.id === id ? cancelled : s))));
        }
        return cancelled;
      } catch (err: any) {
        if (isMountedRef.current) {
          const errMsg = err?.message ?? 'Failed to cancel schedule';
          setError(errMsg);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [manager]
  );

  const activeSchedules = useMemo(() => {
    if (schedules.length === 0) return schedules;
    return schedules.filter(s => s.status === 'pending');
  }, [schedules]);

  const value: ScheduleContextValue = useMemo(
    () => ({
      schedules,
      activeSchedules,
      loading,
      isLoading: loading,
      error,
      clearError,
      createSchedule,
      updateSchedule,
      reschedule,
      deleteSchedule,
      cancelSchedule,
      refreshSchedules,
      manager,
    }),
    [
      schedules,
      activeSchedules,
      loading,
      error,
      clearError,
      createSchedule,
      updateSchedule,
      reschedule,
      deleteSchedule,
      cancelSchedule,
      refreshSchedules,
      manager,
    ]
  );

  return (
    <ScheduleContext.Provider value={value}>
      {children}
    </ScheduleContext.Provider>
  );
};

export function useSchedules(): ScheduleContextValue {
  const context = useContext(ScheduleContext);
  if (!context) {
    throw new Error('useSchedules must be used within a ScheduleProvider');
  }
  return context;
}

export function useSchedule(id: string): ScheduledMessage | undefined {
  const { schedules } = useSchedules();
  return schedules.find(s => s.id === id);
}
