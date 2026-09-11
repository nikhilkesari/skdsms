/**
 * Sked SMS — SMS Dispatcher Module Entry Point & Factory
 * Target: src/services/sms/index.ts
 */

import { Platform } from 'react-native';
import type { SmsDispatcher } from './types';
import { MockSmsDispatcher } from './MockSmsDispatcher';
import { NativeSmsDispatcher } from './NativeSmsDispatcher';

export * from './types';
export { MockSmsDispatcher } from './MockSmsDispatcher';
export { NativeSmsDispatcher } from './NativeSmsDispatcher';

let mockDispatcherInstance: MockSmsDispatcher | null = null;
let nativeDispatcherInstance: NativeSmsDispatcher | null = null;
let customDispatcherInstance: SmsDispatcher | null = null;

/**
 * Returns an SmsDispatcher instance according to configuration and platform.
 *
 * Selection Rules:
 * 1. If a custom dispatcher was injected via `setSmsDispatcher`, it is returned.
 * 2. If `forceMock === true`, returns the shared `MockSmsDispatcher` singleton.
 * 3. If `forceMock === false`, returns the shared `NativeSmsDispatcher` singleton.
 * 4. If `forceMock` is omitted:
 *    - On Android (`Platform.OS === 'android'`), returns `NativeSmsDispatcher`.
 *    - On other platforms (iOS, Web, Jest/Node default), returns `MockSmsDispatcher`.
 */
export function getSmsDispatcher(forceMock?: boolean): SmsDispatcher {
  if (customDispatcherInstance) {
    return customDispatcherInstance;
  }

  const shouldUseMock =
    forceMock !== undefined ? forceMock : Platform.OS !== 'android';

  if (shouldUseMock) {
    if (!mockDispatcherInstance) {
      mockDispatcherInstance = new MockSmsDispatcher();
    }
    return mockDispatcherInstance;
  }

  if (!nativeDispatcherInstance) {
    nativeDispatcherInstance = new NativeSmsDispatcher();
  }
  return nativeDispatcherInstance;
}

/**
 * Injects a custom SmsDispatcher instance (useful for test overrides).
 */
export function setSmsDispatcher(dispatcher: SmsDispatcher | null): void {
  customDispatcherInstance = dispatcher;
}

/**
 * Resets cached singleton dispatcher instances.
 */
export function resetSmsDispatcher(): void {
  mockDispatcherInstance = null;
  nativeDispatcherInstance = null;
  customDispatcherInstance = null;
}
