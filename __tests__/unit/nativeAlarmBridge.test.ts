/**
 * Unit Test Suite for NativeAlarmBridge
 * Target: __tests__/unit/nativeAlarmBridge.test.ts
 */

import { NativeModules, Platform } from 'react-native';
import { NativeAlarmBridge } from '../../src/services/scheduler/NativeAlarmBridge';

describe('NativeAlarmBridge', () => {
  let bridge: NativeAlarmBridge;

  beforeEach(() => {
    bridge = new NativeAlarmBridge();
    Platform.OS = 'android';
  });

  afterEach(() => {
    Platform.OS = 'android';
  });

  it('bridges scheduleAlarm to NativeModules.AlarmSchedulerModule on Android', async () => {
    const mockSchedule = jest.fn().mockResolvedValue(true);
    NativeModules.AlarmSchedulerModule = {
      scheduleAlarm: mockSchedule,
      cancelAlarm: jest.fn().mockResolvedValue(true),
    };

    const result = await bridge.scheduleAlarm({
      id: 'test-id-1',
      timestampMs: 1726401600000,
      alarmRequestCode: 12345,
      recipientName: 'Alice',
      phoneNumber: '+15551234567',
      messageText: 'Test message',
    });

    expect(result.success).toBe(true);
    expect(result.alarmRequestCode).toBe(12345);
    expect(mockSchedule).toHaveBeenCalledWith(
      'test-id-1',
      1726401600000,
      12345,
      'Alice',
      '+15551234567',
      'Test message'
    );
  });

  it('bridges cancelAlarm to NativeModules.AlarmSchedulerModule on Android', async () => {
    const mockCancel = jest.fn().mockResolvedValue(true);
    NativeModules.AlarmSchedulerModule = {
      scheduleAlarm: jest.fn().mockResolvedValue(true),
      cancelAlarm: mockCancel,
    };

    const result = await bridge.cancelAlarm(12345);
    expect(result).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith(12345);
  });

  it('rejects scheduleAlarm on non-Android platform with descriptive error', async () => {
    Platform.OS = 'ios';
    await expect(
      bridge.scheduleAlarm({
        id: 'test-id',
        timestampMs: 1726401600000,
        alarmRequestCode: 12345,
        recipientName: 'Alice',
        phoneNumber: '+15551234567',
        messageText: 'Test message',
      })
    ).rejects.toThrow('AlarmScheduler is only supported on Android (current platform: ios)');
  });

  it('rejects cancelAlarm on non-Android platform with descriptive error', async () => {
    Platform.OS = 'ios';
    await expect(bridge.cancelAlarm(12345)).rejects.toThrow(
      'AlarmScheduler is only supported on Android (current platform: ios)'
    );
  });

  it('rejects on Android if AlarmSchedulerModule is missing', async () => {
    delete NativeModules.AlarmSchedulerModule;
    await expect(
      bridge.scheduleAlarm({
        id: 'test-id',
        timestampMs: 1726401600000,
        alarmRequestCode: 12345,
        recipientName: 'Alice',
        phoneNumber: '+15551234567',
        messageText: 'Test message',
      })
    ).rejects.toThrow('NativeModule AlarmSchedulerModule is not available or registered');
  });
});
