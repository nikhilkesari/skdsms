/**
 * Sked SMS — Android Native SMS Dispatcher & Alarm Scheduler Bridge
 * Target: src/services/sms/NativeSmsDispatcher.ts
 */

import { NativeModules, Platform } from 'react-native';
import { calculateSmsSegments } from '../../utils/smsCalculator';
import {
  DispatcherEventEmitter,
  type SmsDispatcher,
  type AlarmScheduler,
  type SendSmsParams,
  type SmsDispatchResult,
  type ScheduleAlarmParams,
  type AlarmScheduleResult,
  type SmsDispatcherEvents,
  type SmsDispatcherEventType,
  type SmsDispatcherListener,
} from './types';

export interface NativeSmsDispatcherOptions {
  fallbackDispatcher?: SmsDispatcher;
}

export class NativeSmsDispatcher
  extends DispatcherEventEmitter
  implements SmsDispatcher, AlarmScheduler
{
  private fallbackDispatcher?: SmsDispatcher;

  constructor(options?: NativeSmsDispatcherOptions) {
    super();
    this.fallbackDispatcher = options?.fallbackDispatcher;
  }

  /**
   * Checks whether native SMS dispatch is available on the current device.
   */
  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    const module = NativeModules.SmsModule;
    if (!module) {
      return false;
    }
    try {
      if (typeof module.isAvailable === 'function') {
        return await module.isAvailable();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Dispatches an SMS via Android NativeModules.SmsModule.
   */
  async sendSms(params: SendSmsParams): Promise<SmsDispatchResult> {
    if (Platform.OS !== 'android') {
      if (this.fallbackDispatcher) {
        return this.fallbackDispatcher.sendSms(params);
      }
      const error = new Error(
        `NativeSmsDispatcher is only supported on Android (current platform: ${Platform.OS})`
      );
      const failureResult: SmsDispatchResult = {
        success: false,
        messageId: params.id,
        timestamp: new Date().toISOString(),
        partsCount: calculateSmsSegments(params.messageText).segmentCount,
        carrierErrorCode: null,
        errorMessage: error.message,
      };
      this.emit('sms_failed', { params, result: failureResult, error });
      throw error;
    }

    const module = NativeModules.SmsModule;
    if (!module) {
      if (this.fallbackDispatcher) {
        return this.fallbackDispatcher.sendSms(params);
      }
      const error = new Error(
        'NativeModule SmsModule is not available or registered'
      );
      const failureResult: SmsDispatchResult = {
        success: false,
        messageId: params.id,
        timestamp: new Date().toISOString(),
        partsCount: calculateSmsSegments(params.messageText).segmentCount,
        carrierErrorCode: null,
        errorMessage: error.message,
      };
      this.emit('sms_failed', { params, result: failureResult, error });
      throw error;
    }

    try {
      const rawResult = await module.sendSms(
        params.id,
        params.recipient.name,
        params.recipient.phoneNumber,
        params.messageText
      );

      const calculatedParts = calculateSmsSegments(params.messageText).segmentCount;
      const partsCount =
        typeof rawResult?.partsCount === 'number'
          ? rawResult.partsCount
          : calculatedParts > 0
          ? calculatedParts
          : 1;

      const success = rawResult?.success !== false;
      const carrierErrorCode =
        rawResult?.carrierErrorCode ?? rawResult?.errorCode ?? null;
      const errorMessage = rawResult?.errorMessage ?? null;

      const result: SmsDispatchResult = {
        success,
        messageId: rawResult?.messageId ?? params.id,
        timestamp: rawResult?.timestamp ?? new Date().toISOString(),
        partsCount,
        carrierErrorCode: success ? null : carrierErrorCode,
        errorMessage: success ? null : errorMessage,
      };

      if (success) {
        this.emit('sms_sent', { params, result });
      } else {
        this.emit('sms_failed', { params, result });
      }

      return result;
    } catch (error: any) {
      const calculatedParts = calculateSmsSegments(params.messageText).segmentCount;
      const failureResult: SmsDispatchResult = {
        success: false,
        messageId: params.id,
        timestamp: new Date().toISOString(),
        partsCount: calculatedParts > 0 ? calculatedParts : 1,
        carrierErrorCode: error?.code ?? error?.carrierErrorCode ?? null,
        errorMessage: error?.message ?? String(error),
      };
      this.emit('sms_failed', { params, result: failureResult, error });
      throw error;
    }
  }

  /**
   * Schedules an exact system alarm via NativeModules.AlarmSchedulerModule.
   */
  async scheduleAlarm(params: ScheduleAlarmParams): Promise<AlarmScheduleResult> {
    if (Platform.OS !== 'android') {
      if (this.fallbackDispatcher?.scheduleAlarm) {
        return this.fallbackDispatcher.scheduleAlarm(params);
      }
      throw new Error(
        `AlarmScheduler is only supported on Android (current platform: ${Platform.OS})`
      );
    }

    const module = NativeModules.AlarmSchedulerModule;
    if (!module) {
      if (this.fallbackDispatcher?.scheduleAlarm) {
        return this.fallbackDispatcher.scheduleAlarm(params);
      }
      throw new Error(
        'NativeModule AlarmSchedulerModule is not available or registered'
      );
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
      if (this.fallbackDispatcher?.cancelAlarm) {
        return this.fallbackDispatcher.cancelAlarm(alarmRequestCode);
      }
      throw new Error(
        `AlarmScheduler is only supported on Android (current platform: ${Platform.OS})`
      );
    }

    const module = NativeModules.AlarmSchedulerModule;
    if (!module) {
      if (this.fallbackDispatcher?.cancelAlarm) {
        return this.fallbackDispatcher.cancelAlarm(alarmRequestCode);
      }
      throw new Error(
        'NativeModule AlarmSchedulerModule is not available or registered'
      );
    }

    const result = await module.cancelAlarm(alarmRequestCode);
    return result !== false;
  }
}
