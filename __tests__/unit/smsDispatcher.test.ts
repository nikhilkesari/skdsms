/**
 * Sked SMS — SMS Dispatcher Unit & Integration Tests
 * Target: __tests__/unit/smsDispatcher.test.ts
 */

import { NativeModules, Platform } from 'react-native';
import {
  MockSmsDispatcher,
  NativeSmsDispatcher,
  getSmsDispatcher,
  resetSmsDispatcher,
  setSmsDispatcher,
  type SendSmsParams,
  type SmsDispatchResult,
  type ScheduleAlarmParams,
} from '../../src/services/sms';

describe('SMS Dispatcher Abstraction & Test Harness', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    // Restore platform and reset singletons
    Platform.OS = originalPlatformOS;
    resetSmsDispatcher();
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. MockSmsDispatcher Tests
  // =========================================================================
  describe('MockSmsDispatcher', () => {
    let dispatcher: MockSmsDispatcher;

    beforeEach(() => {
      dispatcher = new MockSmsDispatcher();
    });

    it('dispatches a single-segment GSM-7 message successfully (happy path)', async () => {
      const sentListener = jest.fn();
      dispatcher.on('sms_sent', sentListener);

      const params: SendSmsParams = {
        id: 'msg-001',
        recipient: { name: 'Alice Smith', phoneNumber: '+15551234567' },
        messageText: 'Hello Alice, your appointment is confirmed.',
      };

      const result = await dispatcher.sendSms(params);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-001');
      expect(result.partsCount).toBe(1);
      expect(result.carrierErrorCode).toBeNull();
      expect(result.errorMessage).toBeNull();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();

      // Verify in-memory message history
      expect(dispatcher.getSentMessages()).toHaveLength(1);
      const last = dispatcher.getLastSentMessage();
      expect(last).toBeDefined();
      expect(last?.params).toEqual(params);
      expect(last?.result).toEqual(result);

      // Verify event emission
      expect(sentListener).toHaveBeenCalledTimes(1);
      expect(sentListener).toHaveBeenCalledWith({ params, result });
    });

    it('correctly calculates partsCount for multipart GSM-7 messages', async () => {
      // 160 characters -> 1 segment
      const text160 = 'A'.repeat(160);
      const res160 = await dispatcher.sendSms({
        id: 'msg-160',
        recipient: { name: 'Test', phoneNumber: '+15550000001' },
        messageText: text160,
      });
      expect(res160.partsCount).toBe(1);

      // 161 characters -> 2 segments (153 chars per multipart segment)
      const text161 = 'A'.repeat(161);
      const res161 = await dispatcher.sendSms({
        id: 'msg-161',
        recipient: { name: 'Test', phoneNumber: '+15550000002' },
        messageText: text161,
      });
      expect(res161.partsCount).toBe(2);

      // 320 characters -> ceil(320 / 153) = 3 segments
      const text320 = 'A'.repeat(320);
      const res320 = await dispatcher.sendSms({
        id: 'msg-320',
        recipient: { name: 'Test', phoneNumber: '+15550000003' },
        messageText: text320,
      });
      expect(res320.partsCount).toBe(3);

      // 500 characters -> ceil(500 / 153) = 4 segments
      const text500 = 'A'.repeat(500);
      const res500 = await dispatcher.sendSms({
        id: 'msg-500',
        recipient: { name: 'Test', phoneNumber: '+15550000004' },
        messageText: text500,
      });
      expect(res500.partsCount).toBe(4);
    });

    it('correctly calculates partsCount for Unicode and Emoji messages', async () => {
      // 70 characters with emoji -> 1 segment (UCS-2 limit = 70)
      const unicode70 = 'Hello 😊 ' + 'x'.repeat(62); // 8 (emoji + chars) + 62 = 70
      const res70 = await dispatcher.sendSms({
        id: 'msg-uni-70',
        recipient: { name: 'Unicode Test', phoneNumber: '+15550000005' },
        messageText: unicode70,
      });
      expect(res70.partsCount).toBe(1);

      // 71 characters with emoji -> 2 segments (67 chars per multipart segment)
      const unicode71 = 'Hello 😊 ' + 'x'.repeat(63); // 8 (emoji + chars) + 63 = 71
      const res71 = await dispatcher.sendSms({
        id: 'msg-uni-71',
        recipient: { name: 'Unicode Test', phoneNumber: '+15550000006' },
        messageText: unicode71,
      });
      expect(res71.partsCount).toBe(2);

      // 140 characters with emoji -> ceil(140 / 67) = 3 segments
      const unicode140 = '🎉'.repeat(10) + 'x'.repeat(130);
      const res140 = await dispatcher.sendSms({
        id: 'msg-uni-140',
        recipient: { name: 'Unicode Test', phoneNumber: '+15550000007' },
        messageText: unicode140,
      });
      expect(res140.partsCount).toBe(3);
    });

    it('applies simulated delay before resolving dispatch', async () => {
      dispatcher.setSimulatedDelay(60);

      const start = Date.now();
      const result = await dispatcher.sendSms({
        id: 'msg-delay',
        recipient: { name: 'Delayed', phoneNumber: '+15551234567' },
        messageText: 'Delayed transmission',
      });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(50);

      // Reset delay via alias
      dispatcher.setSimulateDelay(0);
      const immediateStart = Date.now();
      await dispatcher.sendSms({
        id: 'msg-fast',
        recipient: { name: 'Fast', phoneNumber: '+15551234567' },
        messageText: 'Immediate transmission',
      });
      const immediateElapsed = Date.now() - immediateStart;
      expect(immediateElapsed).toBeLessThan(50);
    });

    it('injects simulated failures and emits sms_failed event', async () => {
      const failedListener = jest.fn();
      dispatcher.on('sms_failed', failedListener);

      dispatcher.setFailureMode(true, 2, 'Simulated radio off (Airplane mode)');

      const params: SendSmsParams = {
        id: 'msg-fail',
        recipient: { name: 'Bob', phoneNumber: '+15559876543' },
        messageText: 'This should fail',
      };

      const result = await dispatcher.sendSms(params);

      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(2);
      expect(result.errorMessage).toBe('Simulated radio off (Airplane mode)');
      expect(dispatcher.getLastSentMessage()?.result.success).toBe(false);

      expect(failedListener).toHaveBeenCalledTimes(1);
      expect(failedListener).toHaveBeenCalledWith({ params, result });

      // Reset failure mode via alias
      dispatcher.setSimulateFailure(false);
      const recovered = await dispatcher.sendSms({
        id: 'msg-recovered',
        recipient: { name: 'Bob', phoneNumber: '+15559876543' },
        messageText: 'This should succeed',
      });
      expect(recovered.success).toBe(true);
    });

    it('handles availability toggle and blocks sendSms when unavailable', async () => {
      expect(await dispatcher.isAvailable()).toBe(true);

      dispatcher.setAvailability(false);
      expect(await dispatcher.isAvailable()).toBe(false);

      const params: SendSmsParams = {
        id: 'msg-unavail',
        recipient: { name: 'Charlie', phoneNumber: '+15551112233' },
        messageText: 'Unavailable test',
      };

      await expect(dispatcher.sendSms(params)).rejects.toThrow(
        'SmsDispatcher is currently unavailable'
      );

      // Restore via alias
      dispatcher.setAvailable(true);
      expect(await dispatcher.isAvailable()).toBe(true);
      const res = await dispatcher.sendSms(params);
      expect(res.success).toBe(true);
    });

    it('manages message history with clearSentMessages and clear', async () => {
      await dispatcher.sendSms({
        id: 'msg-h1',
        recipient: { name: 'User 1', phoneNumber: '+15550000010' },
        messageText: 'Message 1',
      });
      await dispatcher.sendSms({
        id: 'msg-h2',
        recipient: { name: 'User 2', phoneNumber: '+15550000020' },
        messageText: 'Message 2',
      });

      expect(dispatcher.getSentMessages()).toHaveLength(2);
      expect(dispatcher.getLastSentMessage()?.params.id).toBe('msg-h2');

      dispatcher.clearSentMessages();
      expect(dispatcher.getSentMessages()).toHaveLength(0);
      expect(dispatcher.getLastSentMessage()).toBeUndefined();

      // Configure failure and delay, then verify clear() resets everything
      dispatcher.setSimulatedDelay(100);
      dispatcher.setFailureMode(true, 1, 'Error');
      dispatcher.setAvailability(false);

      dispatcher.clear();
      expect(await dispatcher.isAvailable()).toBe(true);
      const res = await dispatcher.sendSms({
        id: 'msg-after-clear',
        recipient: { name: 'User 3', phoneNumber: '+15550000030' },
        messageText: 'Clean slate',
      });
      expect(res.success).toBe(true);
    });

    it('supports event listener removal and listener count', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      dispatcher.on('sms_sent', listener1);
      dispatcher.on('sms_sent', listener2);
      expect(dispatcher.listenerCount('sms_sent')).toBe(2);

      dispatcher.off('sms_sent', listener1);
      expect(dispatcher.listenerCount('sms_sent')).toBe(1);

      dispatcher.removeAllListeners('sms_sent');
      expect(dispatcher.listenerCount('sms_sent')).toBe(0);
    });

    it('supports mock alarm scheduling and cancellation', async () => {
      const alarmParams: ScheduleAlarmParams = {
        id: 'sched-001',
        timestampMs: 1726000000000,
        alarmRequestCode: 1001,
        recipientName: 'Dave',
        phoneNumber: '+15554443322',
        messageText: 'Meeting reminder',
      };

      const schedRes = await dispatcher.scheduleAlarm(alarmParams);
      expect(schedRes.success).toBe(true);
      expect(schedRes.alarmRequestCode).toBe(1001);
      expect(schedRes.scheduledAtMs).toBe(1726000000000);

      expect(dispatcher.getScheduledAlarms()).toHaveLength(1);
      expect(dispatcher.getScheduledAlarmByRequestCode(1001)).toEqual(alarmParams);

      const cancelRes = await dispatcher.cancelAlarm(1001);
      expect(cancelRes).toBe(true);
      expect(dispatcher.getScheduledAlarms()).toHaveLength(0);

      const cancelNonExistent = await dispatcher.cancelAlarm(9999);
      expect(cancelNonExistent).toBe(false);
    });
  });

  // =========================================================================
  // 2. NativeSmsDispatcher Tests
  // =========================================================================
  describe('NativeSmsDispatcher', () => {
    let nativeDispatcher: NativeSmsDispatcher;

    beforeEach(() => {
      nativeDispatcher = new NativeSmsDispatcher();
      // Ensure clean mock state
      NativeModules.SmsModule = {
        sendSms: jest.fn(),
        isAvailable: jest.fn(),
      };
      NativeModules.AlarmSchedulerModule = {
        scheduleAlarm: jest.fn(),
        cancelAlarm: jest.fn(),
      };
    });

    it('rejects on non-Android platforms with descriptive error', async () => {
      Platform.OS = 'ios';

      expect(await nativeDispatcher.isAvailable()).toBe(false);

      const params: SendSmsParams = {
        id: 'msg-ios',
        recipient: { name: 'iOS User', phoneNumber: '+15551234567' },
        messageText: 'Test iOS',
      };

      await expect(nativeDispatcher.sendSms(params)).rejects.toThrow(
        'NativeSmsDispatcher is only supported on Android (current platform: ios)'
      );

      await expect(
        nativeDispatcher.scheduleAlarm({
          id: 'alarm-ios',
          timestampMs: 1000,
          alarmRequestCode: 1,
          recipientName: 'User',
          phoneNumber: '+15551234567',
          messageText: 'Test',
        })
      ).rejects.toThrow(
        'AlarmScheduler is only supported on Android (current platform: ios)'
      );

      await expect(nativeDispatcher.cancelAlarm(1)).rejects.toThrow(
        'AlarmScheduler is only supported on Android (current platform: ios)'
      );
    });

    it('delegates to fallbackDispatcher on non-Android platform when configured', async () => {
      Platform.OS = 'ios';
      const mockFallback = new MockSmsDispatcher();
      const dispatcherWithFallback = new NativeSmsDispatcher({
        fallbackDispatcher: mockFallback,
      });

      const params: SendSmsParams = {
        id: 'msg-fallback',
        recipient: { name: 'Fallback User', phoneNumber: '+15551234567' },
        messageText: 'Fallback test message',
      };

      const result = await dispatcherWithFallback.sendSms(params);
      expect(result.success).toBe(true);
      expect(mockFallback.getSentMessages()).toHaveLength(1);

      const alarmRes = await dispatcherWithFallback.scheduleAlarm({
        id: 'alarm-fallback',
        timestampMs: 5000,
        alarmRequestCode: 42,
        recipientName: 'Fallback',
        phoneNumber: '+15551234567',
        messageText: 'Fallback reminder',
      });
      expect(alarmRes.success).toBe(true);
      expect(mockFallback.getScheduledAlarms()).toHaveLength(1);

      const cancelRes = await dispatcherWithFallback.cancelAlarm(42);
      expect(cancelRes).toBe(true);
      expect(mockFallback.getScheduledAlarms()).toHaveLength(0);
    });

    it('rejects on Android if NativeModules.SmsModule is missing or unregistered', async () => {
      Platform.OS = 'android';
      delete NativeModules.SmsModule;

      expect(await nativeDispatcher.isAvailable()).toBe(false);

      const params: SendSmsParams = {
        id: 'msg-no-module',
        recipient: { name: 'Android User', phoneNumber: '+15551234567' },
        messageText: 'Missing module test',
      };

      await expect(nativeDispatcher.sendSms(params)).rejects.toThrow(
        'NativeModule SmsModule is not available or registered'
      );
    });

    it('rejects on Android if NativeModules.AlarmSchedulerModule is missing', async () => {
      Platform.OS = 'android';
      delete NativeModules.AlarmSchedulerModule;

      await expect(
        nativeDispatcher.scheduleAlarm({
          id: 'sched-missing',
          timestampMs: 1000,
          alarmRequestCode: 99,
          recipientName: 'User',
          phoneNumber: '+15551234567',
          messageText: 'Test',
        })
      ).rejects.toThrow(
        'NativeModule AlarmSchedulerModule is not available or registered'
      );

      await expect(nativeDispatcher.cancelAlarm(99)).rejects.toThrow(
        'NativeModule AlarmSchedulerModule is not available or registered'
      );
    });

    it('bridges sendSms to NativeModules.SmsModule with accurate parameter translation', async () => {
      Platform.OS = 'android';
      const mockSendSms = jest.fn().mockResolvedValue({
        success: true,
        messageId: 'native-001',
        partsCount: 2,
        timestamp: '2026-09-07T12:00:00.000Z',
      });
      const mockIsAvailable = jest.fn().mockResolvedValue(true);

      NativeModules.SmsModule = {
        sendSms: mockSendSms,
        isAvailable: mockIsAvailable,
      };

      expect(await nativeDispatcher.isAvailable()).toBe(true);
      expect(mockIsAvailable).toHaveBeenCalledTimes(1);

      const sentListener = jest.fn();
      nativeDispatcher.on('sms_sent', sentListener);

      const params: SendSmsParams = {
        id: 'native-001',
        recipient: { name: 'Evelyn Reed', phoneNumber: '+15559876543' },
        messageText: 'A'.repeat(200), // Multipart message
      };

      const result = await nativeDispatcher.sendSms(params);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('native-001');
      expect(result.partsCount).toBe(2);
      expect(result.carrierErrorCode).toBeNull();

      // Verify parameter translation to native module
      expect(mockSendSms).toHaveBeenCalledWith(
        'native-001',
        'Evelyn Reed',
        '+15559876543',
        'A'.repeat(200)
      );

      expect(sentListener).toHaveBeenCalledWith({ params, result });
    });

    it('handles controlled failure resolution from native module', async () => {
      Platform.OS = 'android';
      NativeModules.SmsModule = {
        sendSms: jest.fn().mockResolvedValue({
          success: false,
          messageId: 'native-fail-001',
          errorCode: 4, // SmsManager.RESULT_ERROR_NO_SERVICE
          errorMessage: 'No cellular service available',
        }),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const failedListener = jest.fn();
      nativeDispatcher.on('sms_failed', failedListener);

      const params: SendSmsParams = {
        id: 'native-fail-001',
        recipient: { name: 'Frank', phoneNumber: '+15558887766' },
        messageText: 'Will fail due to coverage',
      };

      const result = await nativeDispatcher.sendSms(params);

      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(4);
      expect(result.errorMessage).toBe('No cellular service available');

      expect(failedListener).toHaveBeenCalledWith({ params, result });
    });

    it('propagates rejected errors from NativeModules.SmsModule and emits sms_failed', async () => {
      Platform.OS = 'android';
      const nativeError = new Error('SecurityException: SEND_SMS permission denied');
      NativeModules.SmsModule = {
        sendSms: jest.fn().mockRejectedValue(nativeError),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const failedListener = jest.fn();
      nativeDispatcher.on('sms_failed', failedListener);

      const params: SendSmsParams = {
        id: 'native-error-001',
        recipient: { name: 'Grace', phoneNumber: '+15553332211' },
        messageText: 'Permission error test',
      };

      await expect(nativeDispatcher.sendSms(params)).rejects.toThrow(
        'SecurityException: SEND_SMS permission denied'
      );

      expect(failedListener).toHaveBeenCalledTimes(1);
      expect(failedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          params,
          error: nativeError,
          result: expect.objectContaining({
            success: false,
            errorMessage: 'SecurityException: SEND_SMS permission denied',
          }),
        })
      );
    });

    it('bridges scheduleAlarm and cancelAlarm to NativeModules.AlarmSchedulerModule', async () => {
      Platform.OS = 'android';
      const mockScheduleAlarm = jest.fn().mockResolvedValue({ success: true });
      const mockCancelAlarm = jest.fn().mockResolvedValue(true);

      NativeModules.AlarmSchedulerModule = {
        scheduleAlarm: mockScheduleAlarm,
        cancelAlarm: mockCancelAlarm,
      };

      const alarmParams: ScheduleAlarmParams = {
        id: 'alarm-007',
        timestampMs: 1726100000000,
        alarmRequestCode: 7007,
        recipientName: 'James Bond',
        phoneNumber: '+15550070007',
        messageText: 'Mission rendezvous',
      };

      const schedRes = await nativeDispatcher.scheduleAlarm(alarmParams);
      expect(schedRes.success).toBe(true);
      expect(schedRes.alarmRequestCode).toBe(7007);
      expect(schedRes.scheduledAtMs).toBe(1726100000000);

      expect(mockScheduleAlarm).toHaveBeenCalledWith(
        'alarm-007',
        1726100000000,
        7007,
        'James Bond',
        '+15550070007',
        'Mission rendezvous'
      );

      const cancelRes = await nativeDispatcher.cancelAlarm(7007);
      expect(cancelRes).toBe(true);
      expect(mockCancelAlarm).toHaveBeenCalledWith(7007);
    });

    it('propagates errors when AlarmSchedulerModule rejects', async () => {
      Platform.OS = 'android';
      NativeModules.AlarmSchedulerModule = {
        scheduleAlarm: jest.fn().mockRejectedValue(new Error('Exact alarms not permitted')),
        cancelAlarm: jest.fn().mockRejectedValue(new Error('Alarm cancel failed')),
      };

      await expect(
        nativeDispatcher.scheduleAlarm({
          id: 'fail-alarm',
          timestampMs: 1726100000000,
          alarmRequestCode: 1234,
          recipientName: 'Test',
          phoneNumber: '+15551234567',
          messageText: 'Alarm fail test',
        })
      ).rejects.toThrow('Exact alarms not permitted');

      await expect(nativeDispatcher.cancelAlarm(1234)).rejects.toThrow(
        'Alarm cancel failed'
      );
    });
  });

  // =========================================================================
  // 3. Factory & Singleton Selection Tests (getSmsDispatcher)
  // =========================================================================
  describe('getSmsDispatcher Factory Selection Logic', () => {
    it('returns MockSmsDispatcher when forceMock is true', () => {
      Platform.OS = 'android';
      const dispatcher = getSmsDispatcher(true);
      expect(dispatcher).toBeInstanceOf(MockSmsDispatcher);
    });

    it('returns NativeSmsDispatcher when forceMock is false', () => {
      Platform.OS = 'ios';
      const dispatcher = getSmsDispatcher(false);
      expect(dispatcher).toBeInstanceOf(NativeSmsDispatcher);
    });

    it('defaults to NativeSmsDispatcher on Android when forceMock is omitted', () => {
      Platform.OS = 'android';
      const dispatcher = getSmsDispatcher();
      expect(dispatcher).toBeInstanceOf(NativeSmsDispatcher);
    });

    it('defaults to MockSmsDispatcher on non-Android platforms when forceMock is omitted', () => {
      Platform.OS = 'ios';
      const dispatcher = getSmsDispatcher();
      expect(dispatcher).toBeInstanceOf(MockSmsDispatcher);
    });

    it('maintains singleton instances across repeated calls', () => {
      const mock1 = getSmsDispatcher(true);
      const mock2 = getSmsDispatcher(true);
      expect(mock1).toBe(mock2);

      const native1 = getSmsDispatcher(false);
      const native2 = getSmsDispatcher(false);
      expect(native1).toBe(native2);
    });

    it('clears singleton cache when resetSmsDispatcher is called', () => {
      const mock1 = getSmsDispatcher(true);
      resetSmsDispatcher();
      const mock2 = getSmsDispatcher(true);
      expect(mock1).not.toBe(mock2);
    });

    it('allows custom dispatcher override via setSmsDispatcher', () => {
      const customMock = new MockSmsDispatcher();
      setSmsDispatcher(customMock);

      expect(getSmsDispatcher()).toBe(customMock);
      expect(getSmsDispatcher(false)).toBe(customMock);

      setSmsDispatcher(null);
      resetSmsDispatcher();
      Platform.OS = 'ios';
      expect(getSmsDispatcher()).not.toBe(customMock);
    });
  });
});
