/**
 * Sked SMS — SMS Dispatcher Abstraction Layer Types
 * Target: src/services/sms/types.ts
 */

import type { Recipient } from '../../types/schedule';

export type { Recipient };

/**
 * Input parameters required to dispatch an SMS message.
 */
export interface SendSmsParams {
  id: string; // Unique schedule or message UUID
  recipient: Recipient;
  messageText: string;
  subscriptionId?: number; // Optional SIM slot subscription ID
}

/**
 * Result returned upon dispatch completion (success or controlled failure).
 */
export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  timestamp: string; // ISO 8601 UTC timestamp
  partsCount: number; // Number of SMS segments
  carrierErrorCode?: number | null; // e.g. SmsManager RESULT_ERROR_*
  errorMessage?: string | null;
}

/**
 * Payload delivered when an SMS is successfully dispatched.
 */
export interface SmsSentEventPayload {
  params: SendSmsParams;
  result: SmsDispatchResult;
}

/**
 * Payload delivered when an SMS dispatch fails or errors.
 */
export interface SmsFailedEventPayload {
  params: SendSmsParams;
  result: SmsDispatchResult;
  error?: Error;
}

/**
 * Map of event types to their corresponding payload structures.
 */
export interface SmsDispatcherEvents {
  sms_sent: SmsSentEventPayload;
  sms_failed: SmsFailedEventPayload;
}

export type SmsDispatcherEventType = keyof SmsDispatcherEvents;

export type SmsDispatcherListener<K extends SmsDispatcherEventType> = (
  payload: SmsDispatcherEvents[K]
) => void;

/**
 * Sent message record retained in mock or in-memory stores.
 */
export interface SentMessageRecord {
  params: SendSmsParams;
  result: SmsDispatchResult;
  sentAt: Date;
}

/**
 * Parameters for scheduling an exact system alarm via AlarmManager.
 */
export interface ScheduleAlarmParams {
  id: string; // Unique schedule UUID
  timestampMs: number; // UTC epoch timestamp in milliseconds
  alarmRequestCode: number; // Unique 32-bit integer requestCode
  recipientName: string;
  phoneNumber: string;
  messageText: string;
}

/**
 * Result returned upon scheduling an exact system alarm.
 */
export interface AlarmScheduleResult {
  success: boolean;
  alarmRequestCode: number;
  scheduledAtMs: number;
  errorMessage?: string | null;
}

/**
 * Interface for native or mock alarm scheduling.
 */
export interface AlarmScheduler {
  scheduleAlarm(params: ScheduleAlarmParams): Promise<AlarmScheduleResult>;
  cancelAlarm(alarmRequestCode: number): Promise<boolean>;
}

/**
 * Core SMS Dispatcher abstraction contract.
 */
export interface SmsDispatcher {
  /**
   * Dispatches an SMS message.
   */
  sendSms(params: SendSmsParams): Promise<SmsDispatchResult>;

  /**
   * Checks whether SMS dispatching capability is currently available.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Registers an event listener for dispatcher events ('sms_sent', 'sms_failed').
   */
  on<K extends SmsDispatcherEventType>(
    event: K,
    listener: SmsDispatcherListener<K>
  ): this | void;

  /**
   * Removes a previously registered event listener.
   */
  off<K extends SmsDispatcherEventType>(
    event: K,
    listener: SmsDispatcherListener<K>
  ): this | void;

  /**
   * Optional alarm scheduling capability (implemented by NativeSmsDispatcher & MockSmsDispatcher).
   */
  scheduleAlarm?(params: ScheduleAlarmParams): Promise<AlarmScheduleResult>;

  /**
   * Optional alarm cancellation capability (implemented by NativeSmsDispatcher & MockSmsDispatcher).
   */
  cancelAlarm?(alarmRequestCode: number): Promise<boolean>;
}

/**
 * Lightweight strongly-typed event emitter base class for dispatcher instances.
 */
export class DispatcherEventEmitter {
  private eventListeners: Map<string, Set<Function>> = new Map();

  on<K extends SmsDispatcherEventType>(
    event: K,
    listener: SmsDispatcherListener<K>
  ): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    return this;
  }

  off<K extends SmsDispatcherEventType>(
    event: K,
    listener: SmsDispatcherListener<K>
  ): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }
    return this;
  }

  emit<K extends SmsDispatcherEventType>(
    event: K,
    payload: SmsDispatcherEvents[K]
  ): boolean {
    const listeners = this.eventListeners.get(event);
    if (!listeners || listeners.size === 0) {
      return false;
    }
    for (const listener of Array.from(listeners)) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`Error in ${event} listener:`, err);
      }
    }
    return true;
  }

  removeAllListeners(event?: SmsDispatcherEventType): this {
    if (event) {
      this.eventListeners.delete(event);
    } else {
      this.eventListeners.clear();
    }
    return this;
  }

  listenerCount(event: SmsDispatcherEventType): number {
    return this.eventListeners.get(event)?.size ?? 0;
  }
}

/**
 * Error subclass representing an SMS dispatch failure.
 */
export class SmsDispatchError extends Error {
  public readonly code: string;
  public readonly carrierErrorCode: number | null;
  public readonly messageId: string;
  public readonly result?: SmsDispatchResult;

  constructor(
    message: string,
    options?: {
      code?: string;
      carrierErrorCode?: number | null;
      messageId?: string;
      result?: SmsDispatchResult;
    }
  ) {
    super(message);
    this.name = 'SmsDispatchError';
    this.code = options?.code ?? 'ERR_SMS_DISPATCH';
    this.carrierErrorCode = options?.carrierErrorCode ?? null;
    this.messageId = options?.messageId ?? '';
    this.result = options?.result;
    Object.setPrototypeOf(this, SmsDispatchError.prototype);
  }
}
