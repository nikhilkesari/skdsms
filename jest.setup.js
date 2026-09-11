/* eslint-env jest */

// Mock @react-native-async-storage/async-storage using official mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

// Mock React Native TurboModuleRegistry / NativeModules for headless testing
const { NativeModules } = require('react-native');
NativeModules.SmsModule = {
  sendSms: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'mock-sms-init-id',
    timestamp: new Date().toISOString(),
    partsCount: 1,
  }),
  isAvailable: jest.fn().mockResolvedValue(true),
};
NativeModules.ContactPickerModule = {
  pickContact: jest.fn().mockResolvedValue({
    displayName: 'Test Contact',
    phoneNumber: '+15551234567',
  }),
};
