/**
 * Sked SMS — Native Alarm Scheduler Bridge
 * Target: src/services/scheduler/NativeAlarmBridge.ts
 *
 * Bridges TypeScript schedule management to Android NativeModules.AlarmSchedulerModule
 * using exact system alarms via AlarmManager.
 */

import { NativeModules, Platform } from 'react-native';
import type {
  AlarmScheduler,
  ScheduleAlarmParams,
  AlarmScheduleResult,
} from '../sms/types';

export class NativeAlarmBridge implements AlarmScheduler {
  /**
   * Schedules an exact system alarm via NativeModules.AlarmSchedulerModule.
   */
  async scheduleAlarm(params: ScheduleAlarmParams): Promise<AlarmScheduleResult> {
    if (Platform.OS !== 'android') {
      throw new Error(
        `AlarmScheduler is only supported on Android (current platform: ${Platform.OS})`
      );
    }

    const module = NativeModules.AlarmSchedulerModule;
    if (!module) {
      throw new Error('NativeModule AlarmSchedulerModule is not available or registered');
    }

    await module.scheduleAlarm(
      params.id,
      params.timestampMs,
      params.alarmRequestCode,
      params.recipientName,
      params.phoneNumber,
      params.messageText
    );

    return {
      success: true,
      alarmRequestCode: params.alarmRequestCode,
      scheduledAtMs: params.timestampMs,
      errorMessage: null,
    };
  }

  /**
   * Cancels a previously scheduled exact alarm via NativeModules.AlarmSchedulerModule.
   */
  async cancelAlarm(alarmRequestCode: number): Promise<boolean> {
    if (Platform.OS !== 'android') {
      throw new Error(
        `AlarmScheduler is only supported on Android (current platform: ${Platform.OS})`
      );
    }

    const module = NativeModules.AlarmSchedulerModule;
    if (!module) {
      throw new Error('NativeModule AlarmSchedulerModule is not available or registered');
    }

    const result = await module.cancelAlarm(alarmRequestCode);
    return result !== false;
  }
}
