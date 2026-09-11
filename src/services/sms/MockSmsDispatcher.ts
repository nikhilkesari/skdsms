/**
 * Sked SMS — Mock SMS Dispatcher Test Harness
 * Target: src/services/sms/MockSmsDispatcher.ts
 */

import { calculateSmsSegments } from '../../utils/smsCalculator';
import {
  DispatcherEventEmitter,
  type SmsDispatcher,
  type AlarmScheduler,
  type SendSmsParams,
  type SmsDispatchResult,
  type SentMessageRecord,
  type ScheduleAlarmParams,
  type AlarmScheduleResult,
  type SmsDispatcherEvents,
  type SmsDispatcherEventType,
  type SmsDispatcherListener,
} from './types';

export class MockSmsDispatcher
  extends DispatcherEventEmitter
  implements SmsDispatcher, AlarmScheduler
{
  private sentMessages: SentMessageRecord[] = [];
  private scheduledAlarms: Map<number, ScheduleAlarmParams> = new Map();
  private shouldFail: boolean = false;
  private failureErrorCode: number | null = null;
  private failureErrorMessage: string | null = null;
  private simulatedDelayMs: number = 0;
  private available: boolean = true;

  /**
   * Dispatches an SMS in memory, optionally applying simulated delay and failures.
   */
  async sendSms(params: SendSmsParams): Promise<SmsDispatchResult> {
    if (this.simulatedDelayMs > 0) {
      await new Promise<void>(resolve =>
        setTimeout(resolve, this.simulatedDelayMs)
      );
    }

    if (!this.available) {
      const error = new Error('SmsDispatcher is currently unavailable');
      const failureResult: SmsDispatchResult = {
        success: false,
        messageId: params.id,
        timestamp: new Date().toISOString(),
        partsCount: 0,
        carrierErrorCode: null,
        errorMessage: error.message,
      };
      this.emit('sms_failed', { params, result: failureResult, error });
      throw error;
    }

    const segments = calculateSmsSegments(params.messageText);
    const partsCount = segments.segmentCount;

    if (this.shouldFail) {
      const result: SmsDispatchResult = {
        success: false,
        messageId: params.id,
        timestamp: new Date().toISOString(),
        partsCount,
        carrierErrorCode: this.failureErrorCode ?? 1, // Default: RESULT_ERROR_GENERIC_FAILURE
        errorMessage: this.failureErrorMessage ?? 'Simulated SMS dispatch failure',
      };
      const record: SentMessageRecord = { params, result, sentAt: new Date() };
      this.sentMessages.push(record);
      this.emit('sms_failed', { params, result });
      return result;
    }

    const result: SmsDispatchResult = {
      success: true,
      messageId: params.id,
      timestamp: new Date().toISOString(),
      partsCount,
      carrierErrorCode: null,
      errorMessage: null,
    };
    const record: SentMessageRecord = { params, result, sentAt: new Date() };
    this.sentMessages.push(record);
    this.emit('sms_sent', { params, result });
    return result;
  }

  /**
   * Checks whether the mock dispatcher is marked as available.
   */
  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  // --- Mock Behavior Configuration ---

  /**
   * Configures simulated delay in milliseconds before dispatch completion.
   */
  setSimulatedDelay(ms: number): void {
    this.simulatedDelayMs = Math.max(0, ms);
  }

  /**
   * Alias for setSimulatedDelay.
   */
  setSimulateDelay(delayMs: number): void {
    this.setSimulatedDelay(delayMs);
  }

  /**
   * Configures failure injection parameters for subsequent dispatches.
   */
  setFailureMode(
    shouldFail: boolean,
    errorCode?: number | null,
    errorMessage?: string | null
  ): void {
    this.shouldFail = shouldFail;
    this.failureErrorCode = errorCode ?? null;
    this.failureErrorMessage = errorMessage ?? null;
  }

  /**
   * Alias for setFailureMode.
   */
  setSimulateFailure(
    fail: boolean,
    errorCode?: number | null,
    errorMessage?: string | null
  ): void {
    this.setFailureMode(fail, errorCode, errorMessage);
  }

  /**
   * Configures availability flag for isAvailable() and sendSms().
   */
  setAvailability(isAvailable: boolean): void {
    this.available = isAvailable;
  }

  /**
   * Alias for setAvailability.
   */
  setAvailable(available: boolean): void {
    this.setAvailability(available);
  }

  // --- In-Memory Message Store & Inspection ---

  /**
   * Returns a copy of all dispatched message records.
   */
  getSentMessages(): SentMessageRecord[] {
    return [...this.sentMessages];
  }

  /**
   * Returns the most recently dispatched message record, or undefined if empty.
   */
  getLastSentMessage(): SentMessageRecord | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Clears the in-memory store of dispatched message records.
   */
  clearSentMessages(): void {
    this.sentMessages = [];
  }

  /**
   * Clears sent messages and resets all simulation configurations to defaults.
   */
  clear(): void {
    this.sentMessages = [];
    this.scheduledAlarms.clear();
    this.shouldFail = false;
    this.failureErrorCode = null;
    this.failureErrorMessage = null;
    this.simulatedDelayMs = 0;
    this.available = true;
  }

  // --- Mock Alarm Scheduling ---

  async scheduleAlarm(params: ScheduleAlarmParams): Promise<AlarmScheduleResult> {
    this.scheduledAlarms.set(params.alarmRequestCode, { ...params });
    return {
      success: true,
      alarmRequestCode: params.alarmRequestCode,
      scheduledAtMs: params.timestampMs,
      errorMessage: null,
    };
  }

  async cancelAlarm(alarmRequestCode: number): Promise<boolean> {
    return this.scheduledAlarms.delete(alarmRequestCode);
  }

  getScheduledAlarms(): ScheduleAlarmParams[] {
    return Array.from(this.scheduledAlarms.values());
  }

  getScheduledAlarmByRequestCode(
    requestCode: number
  ): ScheduleAlarmParams | undefined {
    return this.scheduledAlarms.get(requestCode);
  }

  clearScheduledAlarms(): void {
    this.scheduledAlarms.clear();
  }
}
