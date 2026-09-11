/**
 * Sked SMS — SMS Dispatcher Adversarial & Empirical Stress Test Suite
 * Target: __tests__/unit/smsDispatcher.adversarial.test.ts
 *
 * Scenarios tested:
 * 1. Extreme multipart messages: 1000+ chars, mixed scripts (Devanagari, Cyrillic, CJK, Arabic),
 *    complex emojis with surrogate pairs and ZWJ sequences, exact boundary transitions.
 * 2. High concurrency dispatches: 50 parallel sendSms calls under MockSmsDispatcher and NativeSmsDispatcher,
 *    mixed successes, controlled failures, and native rejections without cross-talk or race conditions.
 * 3. Delay simulation & failure mode injection: combined delay + failure, mid-flight failure toggling,
 *    availability checks, and state clearing.
 * 4. Event listener edge cases: multiple listeners, throwing listeners (non-fatal error boundary),
 *    removing listeners during dispatch, and idempotent cleanup.
 * 5. Factory fallback switching: comprehensive OS matrix ('android', 'ios', 'windows', 'web', 'macos'),
 *    forceMock boolean overrides, singleton lifecycle, and custom dispatcher overrides.
 */

import { NativeModules, Platform } from 'react-native';
import {
  MockSmsDispatcher,
  NativeSmsDispatcher,
  getSmsDispatcher,
  resetSmsDispatcher,
  setSmsDispatcher,
  DispatcherEventEmitter,
  type SendSmsParams,
  type SmsDispatchResult,
  type ScheduleAlarmParams,
  type SmsSentEventPayload,
  type SmsFailedEventPayload,
} from '../../src/services/sms';
import { calculateSmsSegments } from '../../src/utils/smsCalculator';

describe('Adversarial Stress Testing: SMS Dispatcher Implementations', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    resetSmsDispatcher();
    jest.clearAllMocks();
  });

  // =========================================================================
  // Challenge 1: Extreme Multipart Messages & Multi-Byte Unicode Boundaries
  // =========================================================================
  describe('Challenge 1: Extreme Multipart Messages & Multi-Byte Unicode Boundaries', () => {
    let mockDispatcher: MockSmsDispatcher;

    beforeEach(() => {
      mockDispatcher = new MockSmsDispatcher();
    });

    it('calculates exact segment boundaries for large GSM-7 messages up to 2500 characters', async () => {
      // GSM-7 boundaries: single: <= 160; multipart: ceil(N / 153)
      const boundaries = [
        { length: 160, expectedSegments: 1 },
        { length: 161, expectedSegments: 2 },
        { length: 306, expectedSegments: 2 }, // 2 * 153
        { length: 307, expectedSegments: 3 },
        { length: 459, expectedSegments: 3 }, // 3 * 153
        { length: 460, expectedSegments: 4 },
        { length: 1071, expectedSegments: 7 }, // 7 * 153
        { length: 1530, expectedSegments: 10 }, // 10 * 153
        { length: 1531, expectedSegments: 11 },
        { length: 2500, expectedSegments: Math.ceil(2500 / 153) }, // 17 segments
      ];

      for (const b of boundaries) {
        const text = 'X'.repeat(b.length);
        const result = await mockDispatcher.sendSms({
          id: `gsm-${b.length}`,
          recipient: { name: 'Recipient', phoneNumber: '+15551234567' },
          messageText: text,
        });

        expect(result.success).toBe(true);
        expect(result.partsCount).toBe(b.expectedSegments);
        expect(result.messageId).toBe(`gsm-${b.length}`);
      }

      expect(mockDispatcher.getSentMessages()).toHaveLength(boundaries.length);
    });

    it('handles 1000+ characters of mixed multilingual scripts (Hindi, Arabic, Russian, Japanese)', async () => {
      // UCS-2 encoding: single: <= 70; multipart: ceil(N / 67)
      const hindi = 'नमस्ते दुनिया '; // 14 code points
      const arabic = 'مرحبا بالعالم '; // 14 code points
      const russian = 'Привет мир '; // 11 code points
      const japanese = 'こんにちは世界 '; // 8 code points
      const combinedUnit = hindi + arabic + russian + japanese; // 47 code points
      const unitCodePoints = Array.from(combinedUnit).length;

      // Repeat combinedUnit until we exceed 1000 code points
      const repeatCount = Math.ceil(1000 / unitCodePoints);
      const largeMultilingualText = combinedUnit.repeat(repeatCount);
      const totalCodePoints = Array.from(largeMultilingualText).length;
      expect(totalCodePoints).toBeGreaterThanOrEqual(1000);

      const expectedSegments = Math.ceil(totalCodePoints / 67);

      const result = await mockDispatcher.sendSms({
        id: 'multilingual-1000',
        recipient: { name: 'Global Recipient', phoneNumber: '+919876543210' },
        messageText: largeMultilingualText,
      });

      expect(result.success).toBe(true);
      expect(result.partsCount).toBe(expectedSegments);
      expect(mockDispatcher.getLastSentMessage()?.params.messageText).toBe(largeMultilingualText);
    });

    it('correctly counts multi-byte Unicode surrogate pairs, astral plane emojis, and ZWJ sequences', async () => {
      // Complex emoji samples
      const simpleAstral = '🚀'; // 1 code point, 2 UTF-16 code units
      expect(simpleAstral.length).toBe(2);
      expect(Array.from(simpleAstral).length).toBe(1);

      // ZWJ Family: 👨‍👩‍👧‍👦 (Man + ZWJ + Woman + ZWJ + Girl + ZWJ + Boy)
      const zwjFamily = '👨‍👩‍👧‍👦';
      const zwjFamilyCodePoints = Array.from(zwjFamily).length; // 7 code points

      // Rainbow flag: 🏳️‍🌈 (White flag + VS16 + ZWJ + Rainbow)
      const rainbowFlag = '🏳️‍🌈';
      const rainbowCodePoints = Array.from(rainbowFlag).length;

      // Construct 70-codepoint boundary using astral emojis
      // 70 * 🚀 = 70 code points -> exactly 1 segment in UCS-2
      const emoji70 = simpleAstral.repeat(70);
      expect(Array.from(emoji70).length).toBe(70);
      const res70 = await mockDispatcher.sendSms({
        id: 'emoji-70',
        recipient: { name: 'Emoji Fan', phoneNumber: '+15559998888' },
        messageText: emoji70,
      });
      expect(res70.partsCount).toBe(1);

      // 71 * 🚀 = 71 code points -> exactly 2 segments in UCS-2
      const emoji71 = simpleAstral.repeat(71);
      expect(Array.from(emoji71).length).toBe(71);
      const res71 = await mockDispatcher.sendSms({
        id: 'emoji-71',
        recipient: { name: 'Emoji Fan', phoneNumber: '+15559998888' },
        messageText: emoji71,
      });
      expect(res71.partsCount).toBe(2);

      // 134 * 🚀 = 134 code points -> exactly 2 segments (2 * 67)
      const emoji134 = simpleAstral.repeat(134);
      const res134 = await mockDispatcher.sendSms({
        id: 'emoji-134',
        recipient: { name: 'Emoji Fan', phoneNumber: '+15559998888' },
        messageText: emoji134,
      });
      expect(res134.partsCount).toBe(2);

      // 135 * 🚀 = 135 code points -> 3 segments
      const emoji135 = simpleAstral.repeat(135);
      const res135 = await mockDispatcher.sendSms({
        id: 'emoji-135',
        recipient: { name: 'Emoji Fan', phoneNumber: '+15559998888' },
        messageText: emoji135,
      });
      expect(res135.partsCount).toBe(3);

      // Mixed ZWJ message: 20 families + 20 flags + text
      const mixedText = `${zwjFamily.repeat(20)} ${rainbowFlag.repeat(20)} Message payload`;
      const mixedCodePoints = Array.from(mixedText).length;
      const expectedMixedSegments = Math.ceil(mixedCodePoints / 67);

      const mixedRes = await mockDispatcher.sendSms({
        id: 'emoji-complex',
        recipient: { name: 'Unicode Tester', phoneNumber: '+15557776666' },
        messageText: mixedText,
      });
      expect(mixedRes.partsCount).toBe(expectedMixedSegments);
    });

    it('passes large Unicode payload to NativeSmsDispatcher intact and calculates segment fallback', async () => {
      Platform.OS = 'android';
      const mockSendSms = jest.fn().mockImplementation((id, name, phone, text) => {
        return Promise.resolve({
          success: true,
          messageId: id,
          // Native module omits partsCount to test fallback calculation in JS
          timestamp: new Date().toISOString(),
        });
      });

      NativeModules.SmsModule = {
        sendSms: mockSendSms,
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const nativeDispatcher = new NativeSmsDispatcher();
      const largeUnicodeMsg = '🔥'.repeat(200); // 200 code points -> ceil(200 / 67) = 3 segments

      const result = await nativeDispatcher.sendSms({
        id: 'native-unicode-large',
        recipient: { name: 'Native Recipient', phoneNumber: '+15552223333' },
        messageText: largeUnicodeMsg,
      });

      expect(result.success).toBe(true);
      expect(result.partsCount).toBe(3); // calculated fallback in NativeSmsDispatcher
      expect(mockSendSms).toHaveBeenCalledWith(
        'native-unicode-large',
        'Native Recipient',
        '+15552223333',
        largeUnicodeMsg
      );
    });
  });

  // =========================================================================
  // Challenge 2: High Concurrency Dispatches (20–50 Parallel Calls)
  // =========================================================================
  describe('Challenge 2: High Concurrency Dispatches (20–50 Parallel Calls)', () => {
    it('MockSmsDispatcher reliably processes 50 parallel sendSms calls without data loss or race conditions', async () => {
      const dispatcher = new MockSmsDispatcher();
      const concurrency = 50;

      const sentListener = jest.fn();
      dispatcher.on('sms_sent', sentListener);

      const promises: Promise<SmsDispatchResult>[] = [];

      for (let i = 0; i < concurrency; i++) {
        const isUnicode = i % 2 === 0;
        const messageText = isUnicode
          ? `Parallel Unicode message #${i} 🌟`
          : `Parallel ASCII message #${i} - ${'Z'.repeat(180)}`; // Multipart GSM-7

        promises.push(
          dispatcher.sendSms({
            id: `concurrent-${i}`,
            recipient: { name: `User ${i}`, phoneNumber: `+1555000${String(i).padStart(4, '0')}` },
            messageText,
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrency);
      expect(sentListener).toHaveBeenCalledTimes(concurrency);

      const sentHistory = dispatcher.getSentMessages();
      expect(sentHistory).toHaveLength(concurrency);

      // Verify each individual result matches input ID and proper segment count
      for (let i = 0; i < concurrency; i++) {
        const res = results[i];
        expect(res.success).toBe(true);
        expect(res.messageId).toBe(`concurrent-${i}`);
        if (i % 2 === 0) {
          expect(res.partsCount).toBe(1); // Short Unicode
        } else {
          expect(res.partsCount).toBe(2); // 180 chars + prefix > 160 -> 2 segments
        }
      }
    });

    it('NativeSmsDispatcher processes 50 parallel sendSms calls through native module with simulated async jitter', async () => {
      Platform.OS = 'android';

      const mockSendSms = jest.fn().mockImplementation((id, name, phone, text) => {
        // Simulate real-world asynchronous native telephony jitter between 5ms and 25ms
        const jitterMs = Math.floor(Math.random() * 20) + 5;
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              success: true,
              messageId: id,
              partsCount: text.length > 160 ? 2 : 1,
              timestamp: new Date().toISOString(),
            });
          }, jitterMs);
        });
      });

      NativeModules.SmsModule = {
        sendSms: mockSendSms,
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const nativeDispatcher = new NativeSmsDispatcher();
      const sentListener = jest.fn();
      nativeDispatcher.on('sms_sent', sentListener);

      const concurrency = 50;
      const promises: Promise<SmsDispatchResult>[] = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          nativeDispatcher.sendSms({
            id: `native-concurrent-${i}`,
            recipient: { name: `Native User ${i}`, phoneNumber: `+1555111${String(i).padStart(4, '0')}` },
            messageText: `Concurrent test message ${i}`,
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrency);
      expect(mockSendSms).toHaveBeenCalledTimes(concurrency);
      expect(sentListener).toHaveBeenCalledTimes(concurrency);

      // Verify that all 50 distinct message IDs were resolved
      const resolvedIds = new Set(results.map(r => r.messageId));
      expect(resolvedIds.size).toBe(concurrency);
    });

    it('NativeSmsDispatcher isolates 30 concurrent dispatches with mixed success, failure codes, and rejections', async () => {
      Platform.OS = 'android';

      // 10 succeed, 10 return controlled carrier error, 10 reject with native exception
      const mockSendSms = jest.fn().mockImplementation((id: string) => {
        const index = parseInt(id.replace('mixed-', ''), 10);
        if (index < 10) {
          return Promise.resolve({
            success: true,
            messageId: id,
            partsCount: 1,
            timestamp: new Date().toISOString(),
          });
        } else if (index < 20) {
          return Promise.resolve({
            success: false,
            messageId: id,
            partsCount: 1,
            errorCode: 2, // RESULT_ERROR_RADIO_OFF
            errorMessage: 'Airplane mode active',
          });
        } else {
          return Promise.reject(new Error(`Native crash for ${id}`));
        }
      });

      NativeModules.SmsModule = {
        sendSms: mockSendSms,
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const nativeDispatcher = new NativeSmsDispatcher();
      const sentListener = jest.fn();
      const failedListener = jest.fn();
      nativeDispatcher.on('sms_sent', sentListener);
      nativeDispatcher.on('sms_failed', failedListener);

      const totalDispatches = 30;
      const settledResults = await Promise.allSettled(
        Array.from({ length: totalDispatches }, (_, i) =>
          nativeDispatcher.sendSms({
            id: `mixed-${i}`,
            recipient: { name: `Mixed User ${i}`, phoneNumber: '+15550001234' },
            messageText: `Mixed content ${i}`,
          })
        )
      );

      // 0-9: Fulfilled with success: true
      for (let i = 0; i < 10; i++) {
        expect(settledResults[i].status).toBe('fulfilled');
        const val = (settledResults[i] as PromiseFulfilledResult<SmsDispatchResult>).value;
        expect(val.success).toBe(true);
        expect(val.messageId).toBe(`mixed-${i}`);
      }

      // 10-19: Fulfilled with success: false (controlled carrier error)
      for (let i = 10; i < 20; i++) {
        expect(settledResults[i].status).toBe('fulfilled');
        const val = (settledResults[i] as PromiseFulfilledResult<SmsDispatchResult>).value;
        expect(val.success).toBe(false);
        expect(val.carrierErrorCode).toBe(2);
        expect(val.errorMessage).toBe('Airplane mode active');
      }

      // 20-29: Rejected with native Error
      for (let i = 20; i < 30; i++) {
        expect(settledResults[i].status).toBe('rejected');
        const reason = (settledResults[i] as PromiseRejectedResult).reason;
        expect(reason.message).toBe(`Native crash for mixed-${i}`);
      }

      expect(sentListener).toHaveBeenCalledTimes(10);
      expect(failedListener).toHaveBeenCalledTimes(20); // 10 controlled + 10 rejected
    });
  });

  // =========================================================================
  // Challenge 3: Delay Simulation & Failure Mode Injection
  // =========================================================================
  describe('Challenge 3: Delay Simulation & Failure Mode Injection', () => {
    let mockDispatcher: MockSmsDispatcher;

    beforeEach(() => {
      mockDispatcher = new MockSmsDispatcher();
    });

    it('applies simulated delay before resolving failure with exact carrier error code', async () => {
      const delayMs = 60;
      mockDispatcher.setSimulatedDelay(delayMs);
      mockDispatcher.setFailureMode(true, 5, 'RESULT_ERROR_LIMIT_EXCEEDED: Daily quota exceeded');

      const failedListener = jest.fn();
      mockDispatcher.on('sms_failed', failedListener);

      const startTime = Date.now();
      const result = await mockDispatcher.sendSms({
        id: 'msg-delayed-fail',
        recipient: { name: 'Quota User', phoneNumber: '+15554445555' },
        messageText: 'This message hits rate limit',
      });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(delayMs - 15); // Allow slight clock jitter
      expect(result.success).toBe(false);
      expect(result.carrierErrorCode).toBe(5);
      expect(result.errorMessage).toBe('RESULT_ERROR_LIMIT_EXCEEDED: Daily quota exceeded');

      expect(failedListener).toHaveBeenCalledTimes(1);
      expect(failedListener).toHaveBeenCalledWith({
        params: expect.objectContaining({ id: 'msg-delayed-fail' }),
        result,
      });

      // Verify record is preserved in history
      expect(mockDispatcher.getLastSentMessage()?.result).toEqual(result);
    });

    it('rejects immediately when unavailable even if simulated delay is set', async () => {
      mockDispatcher.setSimulatedDelay(100);
      mockDispatcher.setAvailability(false);

      const failedListener = jest.fn();
      mockDispatcher.on('sms_failed', failedListener);

      const start = Date.now();
      await expect(
        mockDispatcher.sendSms({
          id: 'unavail-delayed',
          recipient: { name: 'Offline', phoneNumber: '+15551234567' },
          messageText: 'Should reject after delay',
        })
      ).rejects.toThrow('SmsDispatcher is currently unavailable');
      const elapsed = Date.now() - start;

      // Note: delay executes first, then availability check blocks
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(failedListener).toHaveBeenCalledTimes(1);
      expect(failedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          result: expect.objectContaining({ success: false, errorMessage: 'SmsDispatcher is currently unavailable' }),
        })
      );
    });

    it('clear() atomically resets messages, alarms, delay, failure mode, and availability', async () => {
      mockDispatcher.setSimulatedDelay(500);
      mockDispatcher.setFailureMode(true, 99, 'Custom failure');
      mockDispatcher.setAvailability(false);

      await mockDispatcher.scheduleAlarm({
        id: 'sched-clear',
        timestampMs: Date.now() + 100000,
        alarmRequestCode: 444,
        recipientName: 'To Clear',
        phoneNumber: '+15551112222',
        messageText: 'Alarm to clear',
      });

      expect(mockDispatcher.getScheduledAlarms()).toHaveLength(1);
      expect(await mockDispatcher.isAvailable()).toBe(false);

      mockDispatcher.clear();

      expect(mockDispatcher.getSentMessages()).toHaveLength(0);
      expect(mockDispatcher.getScheduledAlarms()).toHaveLength(0);
      expect(await mockDispatcher.isAvailable()).toBe(true);

      // Now send should succeed immediately without failure or delay
      const start = Date.now();
      const res = await mockDispatcher.sendSms({
        id: 'after-clear',
        recipient: { name: 'Clean', phoneNumber: '+15551112222' },
        messageText: 'Clean test',
      });
      const elapsed = Date.now() - start;

      expect(res.success).toBe(true);
      expect(elapsed).toBeLessThan(50);
    });
  });

  // =========================================================================
  // Challenge 4: Event Listener Edge Cases
  // =========================================================================
  describe('Challenge 4: Event Listener Edge Cases', () => {
    let mockDispatcher: MockSmsDispatcher;

    beforeEach(() => {
      mockDispatcher = new MockSmsDispatcher();
    });

    it('handles multiple listeners and ensures a throwing listener does NOT crash other listeners or sendSms', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const order: string[] = [];

      const safeListener1 = jest.fn(() => order.push('safe1'));
      const throwingListener = jest.fn(() => {
        order.push('throwing');
        throw new Error('Listener catastrophe!');
      });
      const safeListener2 = jest.fn(() => order.push('safe2'));

      mockDispatcher.on('sms_sent', safeListener1);
      mockDispatcher.on('sms_sent', throwingListener);
      mockDispatcher.on('sms_sent', safeListener2);

      expect(mockDispatcher.listenerCount('sms_sent')).toBe(3);

      const result = await mockDispatcher.sendSms({
        id: 'listener-robustness',
        recipient: { name: 'Resilient', phoneNumber: '+15551234567' },
        messageText: 'Testing listener resilience',
      });

      expect(result.success).toBe(true);
      expect(order).toEqual(['safe1', 'throwing', 'safe2']);
      expect(safeListener1).toHaveBeenCalledTimes(1);
      expect(throwingListener).toHaveBeenCalledTimes(1);
      expect(safeListener2).toHaveBeenCalledTimes(1);

      // Verify error was trapped and logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in sms_sent listener:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('safely handles listener self-removal and removing other listeners during emit execution', async () => {
      let listenerARuns = 0;
      let listenerBRuns = 0;
      let listenerCRuns = 0;

      const listenerA = jest.fn(() => {
        listenerARuns++;
        // Listener A unregisters itself during execution
        mockDispatcher.off('sms_sent', listenerA);
      });

      const listenerB = jest.fn(() => {
        listenerBRuns++;
        // Listener B unregisters Listener C during execution
        mockDispatcher.off('sms_sent', listenerC);
      });

      const listenerC = jest.fn(() => {
        listenerCRuns++;
      });

      mockDispatcher.on('sms_sent', listenerA);
      mockDispatcher.on('sms_sent', listenerB);
      mockDispatcher.on('sms_sent', listenerC);

      expect(mockDispatcher.listenerCount('sms_sent')).toBe(3);

      // First dispatch: all 3 should execute because emit iterates a snapshot
      await mockDispatcher.sendSms({
        id: 'removal-test-1',
        recipient: { name: 'Removal 1', phoneNumber: '+15551234567' },
        messageText: 'First dispatch',
      });

      expect(listenerARuns).toBe(1);
      expect(listenerBRuns).toBe(1);
      expect(listenerCRuns).toBe(1);

      // Both listenerA and listenerC are now unregistered
      expect(mockDispatcher.listenerCount('sms_sent')).toBe(1);

      // Second dispatch: only listenerB should execute
      await mockDispatcher.sendSms({
        id: 'removal-test-2',
        recipient: { name: 'Removal 2', phoneNumber: '+15551234567' },
        messageText: 'Second dispatch',
      });

      expect(listenerARuns).toBe(1); // unchanged
      expect(listenerBRuns).toBe(2); // incremented
      expect(listenerCRuns).toBe(1); // unchanged
    });

    it('safely handles removeAllListeners for specific and all events', () => {
      const sentListener = jest.fn();
      const failedListener = jest.fn();

      mockDispatcher.on('sms_sent', sentListener);
      mockDispatcher.on('sms_failed', failedListener);

      expect(mockDispatcher.listenerCount('sms_sent')).toBe(1);
      expect(mockDispatcher.listenerCount('sms_failed')).toBe(1);

      // Removing specific event listeners
      mockDispatcher.removeAllListeners('sms_sent');
      expect(mockDispatcher.listenerCount('sms_sent')).toBe(0);
      expect(mockDispatcher.listenerCount('sms_failed')).toBe(1);

      // Removing all event listeners
      mockDispatcher.removeAllListeners();
      expect(mockDispatcher.listenerCount('sms_failed')).toBe(0);
    });

    it('handles idempotent off calls and non-existent listener removal gracefully', () => {
      const dummyListener = jest.fn();
      expect(mockDispatcher.listenerCount('sms_sent')).toBe(0);

      // off on unconfigured event does not throw
      expect(() => mockDispatcher.off('sms_sent', dummyListener)).not.toThrow();

      mockDispatcher.on('sms_sent', dummyListener);
      expect(mockDispatcher.listenerCount('sms_sent')).toBe(1);

      // Duplicate registration with same reference is a Set operation
      mockDispatcher.on('sms_sent', dummyListener);
      expect(mockDispatcher.listenerCount('sms_sent')).toBe(1);

      mockDispatcher.off('sms_sent', dummyListener);
      expect(mockDispatcher.listenerCount('sms_sent')).toBe(0);

      // Second off call is a no-op
      expect(() => mockDispatcher.off('sms_sent', dummyListener)).not.toThrow();
    });
  });

  // =========================================================================
  // Challenge 5: Factory Fallback Switching & Platform Matrix
  // =========================================================================
  describe('Challenge 5: Factory Fallback Switching & Platform Matrix', () => {
    it('exhaustively validates getSmsDispatcher across OS platform matrix', () => {
      const platforms: Array<{ os: any; expectedClass: any }> = [
        { os: 'android', expectedClass: NativeSmsDispatcher },
        { os: 'ios', expectedClass: MockSmsDispatcher },
        { os: 'windows', expectedClass: MockSmsDispatcher },
        { os: 'macos', expectedClass: MockSmsDispatcher },
        { os: 'web', expectedClass: MockSmsDispatcher },
      ];

      for (const p of platforms) {
        Platform.OS = p.os;
        resetSmsDispatcher();

        // Default resolution without forceMock
        const defaultDispatcher = getSmsDispatcher();
        expect(defaultDispatcher).toBeInstanceOf(p.expectedClass);

        // Explicit forceMock = true always returns MockSmsDispatcher
        const forcedMock = getSmsDispatcher(true);
        expect(forcedMock).toBeInstanceOf(MockSmsDispatcher);

        // Explicit forceMock = false always returns NativeSmsDispatcher
        const forcedNative = getSmsDispatcher(false);
        expect(forcedNative).toBeInstanceOf(NativeSmsDispatcher);
      }
    });

    it('verifies NativeSmsDispatcher fallbackDispatcher delegation across all APIs on non-Android platform', async () => {
      Platform.OS = 'ios';
      const mockFallback = new MockSmsDispatcher();
      const nativeWithFallback = new NativeSmsDispatcher({
        fallbackDispatcher: mockFallback,
      });

      // 1. isAvailable on non-Android still reports false for NativeSmsDispatcher
      expect(await nativeWithFallback.isAvailable()).toBe(false);

      // 2. sendSms delegates to fallback
      const sendRes = await nativeWithFallback.sendSms({
        id: 'fallback-send',
        recipient: { name: 'Fallback Target', phoneNumber: '+15558889999' },
        messageText: 'Testing fallback delegation',
      });
      expect(sendRes.success).toBe(true);
      expect(mockFallback.getSentMessages()).toHaveLength(1);
      expect(mockFallback.getLastSentMessage()?.params.id).toBe('fallback-send');

      // 3. scheduleAlarm delegates to fallback
      const schedRes = await nativeWithFallback.scheduleAlarm({
        id: 'fallback-sched',
        timestampMs: 1726500000000,
        alarmRequestCode: 5050,
        recipientName: 'Alarm Target',
        phoneNumber: '+15558889999',
        messageText: 'Fallback alarm text',
      });
      expect(schedRes.success).toBe(true);
      expect(mockFallback.getScheduledAlarms()).toHaveLength(1);
      expect(mockFallback.getScheduledAlarmByRequestCode(5050)?.id).toBe('fallback-sched');

      // 4. cancelAlarm delegates to fallback
      const cancelRes = await nativeWithFallback.cancelAlarm(5050);
      expect(cancelRes).toBe(true);
      expect(mockFallback.getScheduledAlarms()).toHaveLength(0);
    });

    it('verifies NativeSmsDispatcher fallbackDispatcher delegation on Android when NativeModules are absent', async () => {
      Platform.OS = 'android';
      delete NativeModules.SmsModule;
      delete NativeModules.AlarmSchedulerModule;

      const mockFallback = new MockSmsDispatcher();
      const nativeWithFallback = new NativeSmsDispatcher({
        fallbackDispatcher: mockFallback,
      });

      expect(await nativeWithFallback.isAvailable()).toBe(false);

      const sendRes = await nativeWithFallback.sendSms({
        id: 'android-no-module-fallback',
        recipient: { name: 'No Module User', phoneNumber: '+15557778888' },
        messageText: 'Fallback when SmsModule missing',
      });
      expect(sendRes.success).toBe(true);
      expect(mockFallback.getSentMessages()).toHaveLength(1);

      const schedRes = await nativeWithFallback.scheduleAlarm({
        id: 'sched-fallback-android',
        timestampMs: 1726600000000,
        alarmRequestCode: 6060,
        recipientName: 'Alarm Fallback',
        phoneNumber: '+15557778888',
        messageText: 'Alarm fallback',
      });
      expect(schedRes.success).toBe(true);
      expect(mockFallback.getScheduledAlarms()).toHaveLength(1);

      const cancelRes = await nativeWithFallback.cancelAlarm(6060);
      expect(cancelRes).toBe(true);
      expect(mockFallback.getScheduledAlarms()).toHaveLength(0);
    });

    it('verifies setSmsDispatcher takes strict precedence over all platform and forceMock rules until cleared', () => {
      const customDispatcher = new MockSmsDispatcher();
      setSmsDispatcher(customDispatcher);

      Platform.OS = 'android';
      expect(getSmsDispatcher()).toBe(customDispatcher);
      expect(getSmsDispatcher(false)).toBe(customDispatcher);
      expect(getSmsDispatcher(true)).toBe(customDispatcher);

      Platform.OS = 'ios';
      expect(getSmsDispatcher()).toBe(customDispatcher);
      expect(getSmsDispatcher(false)).toBe(customDispatcher);
      expect(getSmsDispatcher(true)).toBe(customDispatcher);

      setSmsDispatcher(null);
      resetSmsDispatcher();

      // Restored
      Platform.OS = 'android';
      expect(getSmsDispatcher()).toBeInstanceOf(NativeSmsDispatcher);
    });
  });
});
