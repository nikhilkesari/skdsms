/**
 * Sked SMS — Validation & SMS Calculator Unit Tests
 * Target: __tests__/unit/validation.test.ts
 */

import {
  normalizePhoneNumber,
  validatePhoneNumber,
  validateScheduledTime,
  validateMessageText,
  validateScheduleInput,
} from '../../src/utils/validation';
import { calculateSmsSegments } from '../../src/utils/smsCalculator';

describe('Unit: Phone Number Normalization & Validation', () => {
  describe('normalizePhoneNumber', () => {
    it('should return empty string for empty, null, or undefined input', () => {
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber(null as unknown as string)).toBe('');
      expect(normalizePhoneNumber(undefined as unknown as string)).toBe('');
    });

    it('should strip non-digits and preserve leading + for international numbers', () => {
      expect(normalizePhoneNumber('+1 (555) 234-5678')).toBe('+15552345678');
      expect(normalizePhoneNumber('+44 7911 123456')).toBe('+447911123456');
      expect(normalizePhoneNumber('+91-98765-43210')).toBe('+919876543210');
    });

    it('should strip non-digits and preserve plain national numbers without +', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('9876543210');
      expect(normalizePhoneNumber('(555) 123-4567')).toBe('5551234567');
      expect(normalizePhoneNumber('555-1234')).toBe('5551234');
    });

    it('should trim surrounding whitespace', () => {
      expect(normalizePhoneNumber('  +15551234567  ')).toBe('+15551234567');
      expect(normalizePhoneNumber('  9876543210  ')).toBe('9876543210');
    });

    it('should return empty string if input contains only alphabetic or special characters', () => {
      expect(normalizePhoneNumber('abc-def-ghij')).toBe('');
      expect(normalizePhoneNumber('++++')).toBe('');
      expect(normalizePhoneNumber('---')).toBe('');
    });
  });

  describe('validatePhoneNumber', () => {
    it('should accept valid international E.164 phone numbers with + prefix', () => {
      expect(validatePhoneNumber('+14155552671')).toEqual({ isValid: true });
      expect(validatePhoneNumber('+447911123456')).toEqual({ isValid: true });
      expect(validatePhoneNumber('+919876543210')).toEqual({ isValid: true });
      expect(validatePhoneNumber('+1 (555) 234-5678')).toEqual({ isValid: true });
    });

    it('should accept valid 10-digit national phone numbers', () => {
      expect(validatePhoneNumber('9876543210')).toEqual({ isValid: true });
      expect(validatePhoneNumber('5551234567')).toEqual({ isValid: true });
    });

    it('should accept minimum length 7-digit local phone number', () => {
      expect(validatePhoneNumber('5551234')).toEqual({ isValid: true });
      expect(validatePhoneNumber('+1555123')).toEqual({ isValid: true });
    });

    it('should accept maximum length 15-digit ITU-T E.164 phone number', () => {
      expect(validatePhoneNumber('+123456789012345')).toEqual({ isValid: true });
      expect(validatePhoneNumber('123456789012345')).toEqual({ isValid: true });
    });

    it('should reject phone numbers shorter than 7 digits', () => {
      const res = validatePhoneNumber('12345');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Phone number is too short (minimum 7 digits).');
    });

    it('should reject phone numbers longer than 15 digits', () => {
      const res = validatePhoneNumber('+1234567890123456');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Phone number exceeds maximum length (15 digits).');
    });

    it('should reject empty or whitespace-only phone numbers', () => {
      const res = validatePhoneNumber('');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Phone number is required.');

      const resSpace = validatePhoneNumber('   ');
      expect(resSpace.isValid).toBe(false);
      expect(resSpace.error).toBe('Phone number is required.');
    });

    it('should reject phone numbers with no numeric digits', () => {
      const res = validatePhoneNumber('abc-def-ghij');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Phone number is required.');
    });

    it('should reject phone numbers starting with invalid prefixes (e.g. 0 after +)', () => {
      const res = validatePhoneNumber('+0123456789');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Phone number format is invalid.');
    });
  });
});

describe('Unit: Scheduled Time Validation', () => {
  const BASE_TIME = new Date('2026-09-15T08:00:00.000Z');

  it('should accept scheduled time in the future beyond 30s buffer', () => {
    const futureTime = new Date(BASE_TIME.getTime() + 5 * 60 * 1000); // +5 minutes
    const res = validateScheduledTime(futureTime, BASE_TIME);
    expect(res.isValid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('should accept scheduled time as ISO 8601 string', () => {
    const isoString = '2026-09-15T09:30:00.000Z';
    const res = validateScheduledTime(isoString, BASE_TIME);
    expect(res.isValid).toBe(true);
  });

  it('should accept scheduled time exactly at 30-second buffer boundary', () => {
    const atBoundary = new Date(BASE_TIME.getTime() + 30000);
    const res = validateScheduledTime(atBoundary, BASE_TIME, 30000);
    expect(res.isValid).toBe(true);
  });

  it('should reject scheduled time in the past', () => {
    const pastTime = new Date(BASE_TIME.getTime() - 60 * 1000); // 1 min ago
    const res = validateScheduledTime(pastTime, BASE_TIME);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
  });

  it('should reject scheduled time at exact current timestamp (now)', () => {
    const res = validateScheduledTime(BASE_TIME, BASE_TIME);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
  });

  it('should reject scheduled time within 30-second buffer (e.g. +10s)', () => {
    const insideBuffer = new Date(BASE_TIME.getTime() + 10000);
    const res = validateScheduledTime(insideBuffer, BASE_TIME, 30000);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
  });

  it('should reject invalid or malformed date string', () => {
    const res = validateScheduledTime('invalid-date-string-xyz', BASE_TIME);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Invalid date or time format.');
  });

  it('should reject null, undefined, or non-date value', () => {
    const nullRes = validateScheduledTime(null as unknown as Date, BASE_TIME);
    expect(nullRes.isValid).toBe(false);
    expect(nullRes.error).toBe('Scheduled date and time is required and cannot be empty.');

    const undefinedRes = validateScheduledTime(undefined as unknown as Date, BASE_TIME);
    expect(undefinedRes.isValid).toBe(false);
    expect(undefinedRes.error).toBe('Scheduled date and time is required and cannot be empty.');

    const numberRes = validateScheduledTime(1234567890 as unknown as Date, BASE_TIME);
    expect(numberRes.isValid).toBe(false);
    expect(numberRes.error).toBe('Scheduled date and time is required and cannot be empty.');
  });
});

describe('Unit: Message Text Validation', () => {
  it('should accept valid non-empty message string', () => {
    expect(validateMessageText('Hello there!')).toEqual({ isValid: true });
    expect(validateMessageText('!')).toEqual({ isValid: true });
    expect(validateMessageText('Line 1\nLine 2\nLine 3')).toEqual({ isValid: true });
  });

  it('should reject empty message text', () => {
    const res = validateMessageText('');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Message text is required and cannot be empty.');
  });

  it('should reject whitespace-only message text', () => {
    const res = validateMessageText('   \t\n  \r\n ');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Message text is required and cannot be empty.');
  });
});

describe('Unit: SMS Segment Calculator (160 GSM-7 / 70 Unicode)', () => {
  it('should return zeros for empty string or null', () => {
    expect(calculateSmsSegments('')).toEqual({
      charCount: 0,
      segmentCount: 0,
      isUnicode: false,
      bytesTotal: 0,
    });
  });

  it('should calculate 1 segment for GSM-7 text up to 160 characters', () => {
    const text1 = 'A';
    const res1 = calculateSmsSegments(text1);
    expect(res1.isUnicode).toBe(false);
    expect(res1.charCount).toBe(1);
    expect(res1.segmentCount).toBe(1);

    const text160 = 'A'.repeat(160);
    const res160 = calculateSmsSegments(text160);
    expect(res160.isUnicode).toBe(false);
    expect(res160.charCount).toBe(160);
    expect(res160.segmentCount).toBe(1);
    expect(res160.bytesTotal).toBe(160);
  });

  it('should calculate 2 segments for 161 characters of GSM-7 text', () => {
    const text161 = 'A'.repeat(161);
    const res = calculateSmsSegments(text161);
    expect(res.isUnicode).toBe(false);
    expect(res.charCount).toBe(161);
    expect(res.segmentCount).toBe(2);
  });

  it('should calculate multipart boundaries for GSM-7 correctly', () => {
    // 306 chars / 153 = 2 segments
    expect(calculateSmsSegments('A'.repeat(306)).segmentCount).toBe(2);
    // 307 chars / 153 = 3 segments
    expect(calculateSmsSegments('A'.repeat(307)).segmentCount).toBe(3);
    // 650 chars / 153 = 5 segments
    expect(calculateSmsSegments('A'.repeat(650)).segmentCount).toBe(5);
  });

  it('should detect Unicode emoji and calculate 1 segment for up to 70 characters', () => {
    const msg = 'Hello 😊';
    const res = calculateSmsSegments(msg);
    expect(res.isUnicode).toBe(true);
    expect(res.segmentCount).toBe(1);
  });

  it('should correctly count emoji code points using surrogate pairs', () => {
    // 1 emoji + 69 ASCII = 70 characters
    const text70 = '🌟' + 'B'.repeat(69);
    const res70 = calculateSmsSegments(text70);
    expect(res70.charCount).toBe(70);
    expect(res70.segmentCount).toBe(1);

    // 1 emoji + 70 ASCII = 71 characters -> 2 segments
    const text71 = '🌟' + 'B'.repeat(70);
    const res71 = calculateSmsSegments(text71);
    expect(res71.charCount).toBe(71);
    expect(res71.segmentCount).toBe(2);
  });

  it('should detect non-Latin Unicode scripts (Devanagari, Cyrillic, Chinese)', () => {
    const hindi = 'नमस्ते दुनिया';
    const res = calculateSmsSegments(hindi);
    expect(res.isUnicode).toBe(true);
    expect(res.segmentCount).toBe(1);
  });

  it('should calculate multipart boundaries for Unicode correctly', () => {
    // 70 Unicode chars -> 1 segment
    const text70 = '😊'.repeat(70);
    expect(calculateSmsSegments(text70).segmentCount).toBe(1);

    // 71 Unicode chars / 67 = 2 segments
    const text71 = '😊'.repeat(71);
    expect(calculateSmsSegments(text71).segmentCount).toBe(2);

    // 134 Unicode chars / 67 = 2 segments
    const text134 = '😊'.repeat(134);
    expect(calculateSmsSegments(text134).segmentCount).toBe(2);

    // 135 Unicode chars / 67 = 3 segments
    const text135 = '😊'.repeat(135);
    expect(calculateSmsSegments(text135).segmentCount).toBe(3);
  });
});

describe('Unit: Combined Schedule Form Validation (validateScheduleInput)', () => {
  const BASE_TIME = new Date('2026-09-15T08:00:00.000Z');

  it('should return isValid: true with no errors for valid input', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Alice Smith',
        phoneNumber: '+15551234567',
        messageText: 'Meeting reminder',
        scheduledDate: '2026-09-15T10:00:00.000Z',
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  it('should return errors for missing recipientName and messageText', () => {
    const res = validateScheduleInput(
      {
        recipientName: '',
        phoneNumber: '+15551234567',
        messageText: '   ',
        scheduledDate: '2026-09-15T10:00:00.000Z',
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.recipient).toBe('Recipient name is required.');
    expect(res.errors.message).toBe('Message text is required and cannot be empty.');
  });

  it('should return error for past scheduled date', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Bob Jones',
        phoneNumber: '9876543210',
        messageText: 'Past event',
        scheduledDate: '2026-09-15T07:30:00.000Z', // 30 min before BASE_TIME
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.scheduledAt).toBe(
      'Scheduled time must be in the future (minimum 30 seconds from now).'
    );
  });

  it('should return error when recurrence end date is invalid string', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Carol White',
        phoneNumber: '+15551234567',
        messageText: 'Bad end date',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: 'not-a-valid-date',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
  });

  it('should return error when recurrence end date is prior to scheduled start date', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'David Brown',
        phoneNumber: '+15551234567',
        messageText: 'Prior end date',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-14',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.recurrence).toBe(
      'Recurrence end date cannot be earlier than scheduled start date.'
    );
  });

  it('should accept valid daily recurrence with end date chronologically after start date', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Emma Green',
        phoneNumber: '+15551234567',
        messageText: 'Daily reminder',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-20',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(true);
    expect(res.errors.recurrence).toBeUndefined();
  });

  it('should accept valid daily recurrence with full ISO timestamp end date', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Frank Miller',
        phoneNumber: '+15551234567',
        messageText: 'Daily standup reminder',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-20T23:59:59.999Z',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(true);
    expect(res.errors.recurrence).toBeUndefined();
  });

  it('should accept valid daily recurrence with ISO timestamp end date containing specific time of day', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Grace Hopper',
        phoneNumber: '+15551234567',
        messageText: 'Midday sync',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-20T18:00:00.000Z',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(true);
    expect(res.errors.recurrence).toBeUndefined();
  });

  it('should accept and trim surrounding whitespace from ISO timestamp end date', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Hank Rearden',
        phoneNumber: '+15551234567',
        messageText: 'Trimmed ISO end date',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '   2026-09-20T23:59:59.999Z   ',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(true);
    expect(res.errors.recurrence).toBeUndefined();
  });

  it('should return error when ISO timestamp recurrence end date is prior to scheduled date', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Iris West',
        phoneNumber: '+15551234567',
        messageText: 'Past ISO end date',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-15T09:00:00.000Z',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.recurrence).toBe(
      'Recurrence end date cannot be earlier than scheduled start date.'
    );
  });

  it('should return error when ISO string contains T but is an invalid date', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Jack Reacher',
        phoneNumber: '+15551234567',
        messageText: 'Malformed ISO',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-99-99T99:99:99.999Z',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
  });

  it('should return error when recurrence end date contains T with non-date string', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Karen Page',
        phoneNumber: '+15551234567',
        messageText: 'Bogus T string',
        scheduledDate: '2026-09-15T10:00:00.000Z',
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: 'NOT-A-DATE-T-VALUE',
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
  });

  it('should accept recurrence end date matching the exact scheduled date timestamp', () => {
    const exactTimestamp = '2026-09-15T10:00:00.000Z';
    const res = validateScheduleInput(
      {
        recipientName: 'Leo Fitz',
        phoneNumber: '+15551234567',
        messageText: 'Same timestamp boundary',
        scheduledDate: exactTimestamp,
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: exactTimestamp,
        },
      },
      BASE_TIME
    );

    expect(res.isValid).toBe(true);
    expect(res.errors.recurrence).toBeUndefined();
  });
});
