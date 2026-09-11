/**
 * Sked SMS — Challenger Empirical Stress Suite for Milestone 2 Validation & SMS Calculation
 * Target: __tests__/unit/challenger_m2_validation.test.ts
 *
 * Adversarial and boundary test coverage:
 * 1. Scheduled time buffer boundaries (now, now - 1ms, now + 1ms, now + 29s, now + 30s, now + 31s, far future, epoch, invalid)
 * 2. International & malformed phone numbers (+1, +91, +44, +61, +81, spaces, parens, hyphens, letters, symbols, short, long, +0)
 * 3. Message texts & SMS segment calculation (empty, whitespace, single GSM-7, 160 chars, 161 chars, 153*N boundaries, Unicode emojis, mixed)
 * 4. Combined schedule form validation stress testing & edge combinations
 */

import {
  normalizePhoneNumber,
  validatePhoneNumber,
  validateScheduledTime,
  validateMessageText,
  validateScheduleInput,
} from '../../src/utils/validation';
import { calculateSmsSegments } from '../../src/utils/smsCalculator';

describe('Challenger M2: Scheduled Time Boundary Stress Testing', () => {
  const BASE_NOW = new Date('2026-09-07T12:00:00.000Z');
  const BASE_MS = BASE_NOW.getTime();

  describe('Strict 30-Second Lead Buffer Boundaries', () => {
    it('rejects scheduled time at exact now timestamp', () => {
      const target = new Date(BASE_MS);
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
    });

    it('rejects scheduled time at now - 1ms (past boundary)', () => {
      const target = new Date(BASE_MS - 1);
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
    });

    it('rejects scheduled time at now + 1ms (future, but within buffer)', () => {
      const target = new Date(BASE_MS + 1);
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
    });

    it('rejects scheduled time at now + 29s (29,000ms, within buffer)', () => {
      const target = new Date(BASE_MS + 29000);
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
    });

    it('rejects scheduled time at now + 29,999ms (1ms before buffer boundary)', () => {
      const target = new Date(BASE_MS + 29999);
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Scheduled time must be in the future (minimum 30 seconds from now).');
    });

    it('accepts scheduled time at exactly now + 30,000ms (buffer threshold)', () => {
      const target = new Date(BASE_MS + 30000);
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts scheduled time at now + 31s (31,000ms, outside buffer)', () => {
      const target = new Date(BASE_MS + 31000);
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts scheduled time in far future (1 year ahead)', () => {
      const target = new Date('2027-09-07T12:00:00.000Z');
      const result = validateScheduledTime(target, BASE_NOW);
      expect(result.isValid).toBe(true);
    });

    it('rejects deep past times (Unix epoch 0, 1 year ago)', () => {
      expect(validateScheduledTime(new Date(0), BASE_NOW).isValid).toBe(false);
      expect(validateScheduledTime(new Date('2025-09-07T12:00:00.000Z'), BASE_NOW).isValid).toBe(false);
    });

    it('supports custom buffer parameters (e.g. 5 seconds, 0 seconds)', () => {
      // With 5s buffer, +6s is valid, +4s is invalid
      expect(validateScheduledTime(new Date(BASE_MS + 6000), BASE_NOW, 5000).isValid).toBe(true);
      expect(validateScheduledTime(new Date(BASE_MS + 4000), BASE_NOW, 5000).isValid).toBe(false);

      // With 0ms buffer, +1ms is valid, -1ms is invalid
      expect(validateScheduledTime(new Date(BASE_MS + 1), BASE_NOW, 0).isValid).toBe(true);
      expect(validateScheduledTime(new Date(BASE_MS - 1), BASE_NOW, 0).isValid).toBe(false);
    });

    it('handles malformed date inputs gracefully', () => {
      expect(validateScheduledTime('not-a-real-date', BASE_NOW)).toEqual({
        isValid: false,
        error: 'Invalid date or time format.',
      });
      expect(validateScheduledTime('', BASE_NOW)).toEqual({
        isValid: false,
        error: 'Invalid date or time format.',
      });
      expect(validateScheduledTime(new Date(NaN), BASE_NOW)).toEqual({
        isValid: false,
        error: 'Invalid date or time format.',
      });
    });
  });
});

describe('Challenger M2: International & Malformed Phone Numbers', () => {
  describe('normalizePhoneNumber Adversarial Tests', () => {
    it('normalizes various international country dial codes correctly', () => {
      expect(normalizePhoneNumber('+1 (415) 555-2671')).toBe('+14155552671');
      expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958');
      expect(normalizePhoneNumber('+61 412 345 678')).toBe('+61412345678');
      expect(normalizePhoneNumber('+81 90 1234 5678')).toBe('+819012345678');
      expect(normalizePhoneNumber('+49 (0) 151 23456789')).toBe('+49015123456789');
    });

    it('strips random punctuation, symbols, and letters interspersed among digits', () => {
      expect(normalizePhoneNumber('+1-800-FLOWERS')).toBe('+1800');
      expect(normalizePhoneNumber('  (555) . 123 - 4567  ')).toBe('5551234567');
      expect(normalizePhoneNumber('+1 (555) 0199 ext 101')).toBe('+15550199101');
      // If no leading +, plain digits are returned
      expect(normalizePhoneNumber('tel:1-555-0199')).toBe('15550199');
    });

    it('returns empty string when input has no digits at all', () => {
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber('   ')).toBe('');
      expect(normalizePhoneNumber('phone-number-here')).toBe('');
      expect(normalizePhoneNumber('++++')).toBe('');
      expect(normalizePhoneNumber('()-#*')).toBe('');
      expect(normalizePhoneNumber(null as unknown as string)).toBe('');
      expect(normalizePhoneNumber(undefined as unknown as string)).toBe('');
    });

    it('handles leading + correctly even if followed by spaces before digits', () => {
      expect(normalizePhoneNumber('+ 1 555 123 4567')).toBe('+15551234567');
    });
  });

  describe('validatePhoneNumber Adversarial & Edge Cases', () => {
    it('accepts valid international numbers with country codes', () => {
      // US (+1, 11 digits total)
      expect(validatePhoneNumber('+14155552671')).toEqual({ isValid: true });
      // India (+91, 12 digits total)
      expect(validatePhoneNumber('+919876543210')).toEqual({ isValid: true });
      // UK (+44, 12 digits total)
      expect(validatePhoneNumber('+447911123456')).toEqual({ isValid: true });
      // Australia (+61, 11 digits total)
      expect(validatePhoneNumber('+61412345678')).toEqual({ isValid: true });
      // Japan (+81, 12 digits total)
      expect(validatePhoneNumber('+819012345678')).toEqual({ isValid: true });
    });

    it('accepts boundary digit counts (min 7, max 15 digits)', () => {
      // 7 digits (minimum allowed)
      expect(validatePhoneNumber('5551234')).toEqual({ isValid: true });
      expect(validatePhoneNumber('+1555123')).toEqual({ isValid: true });

      // 15 digits (maximum ITU-T E.164 allowed)
      expect(validatePhoneNumber('123456789012345')).toEqual({ isValid: true });
      expect(validatePhoneNumber('+123456789012345')).toEqual({ isValid: true });
    });

    it('rejects numbers strictly outside the 7 to 15 digit boundary', () => {
      // 6 digits (too short)
      const res6 = validatePhoneNumber('123456');
      expect(res6.isValid).toBe(false);
      expect(res6.error).toBe('Phone number is too short (minimum 7 digits).');

      const resPlus6 = validatePhoneNumber('+12345');
      expect(resPlus6.isValid).toBe(false);
      expect(resPlus6.error).toBe('Phone number is too short (minimum 7 digits).');

      // 16 digits (too long)
      const res16 = validatePhoneNumber('1234567890123456');
      expect(res16.isValid).toBe(false);
      expect(res16.error).toBe('Phone number exceeds maximum length (15 digits).');

      const resPlus16 = validatePhoneNumber('+1234567890123456');
      expect(resPlus16.isValid).toBe(false);
      expect(resPlus16.error).toBe('Phone number exceeds maximum length (15 digits).');
    });

    it('rejects malformed non-digit inputs', () => {
      expect(validatePhoneNumber('').error).toBe('Phone number is required.');
      expect(validatePhoneNumber('     ').error).toBe('Phone number is required.');
      expect(validatePhoneNumber('no-digits-here').error).toBe('Phone number is required.');
      expect(validatePhoneNumber('***---###').error).toBe('Phone number is required.');
    });

    it('rejects numbers starting with 0 after + (invalid E.164 country code)', () => {
      expect(validatePhoneNumber('+0123456789').isValid).toBe(false);
      expect(validatePhoneNumber('+0123456789').error).toBe('Phone number format is invalid.');
    });

    it('rejects national numbers starting with 0 under E.164 digit rule', () => {
      expect(validatePhoneNumber('0123456789').isValid).toBe(false);
      expect(validatePhoneNumber('0123456789').error).toBe('Phone number format is invalid.');
    });

    it('handles excessively long strings without performance degradation or crash', () => {
      const hugeInput = '9'.repeat(10000);
      const res = validatePhoneNumber(hugeInput);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Phone number exceeds maximum length (15 digits).');
    });
  });
});

describe('Challenger M2: Message Text Validation & SMS Calculator Stress', () => {
  describe('validateMessageText', () => {
    it('accepts valid text containing ASCII, punctuation, and multi-line content', () => {
      expect(validateMessageText('Hello!').isValid).toBe(true);
      expect(validateMessageText('Line 1\nLine 2').isValid).toBe(true);
      expect(validateMessageText('?').isValid).toBe(true);
    });

    it('accepts single character GSM-7 text', () => {
      expect(validateMessageText('A')).toEqual({ isValid: true });
      expect(validateMessageText('1')).toEqual({ isValid: true });
      expect(validateMessageText('.')).toEqual({ isValid: true });
    });

    it('rejects empty string', () => {
      const res = validateMessageText('');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Message text is required and cannot be empty.');
    });

    it('rejects whitespace-only text with tabs, spaces, and newlines', () => {
      expect(validateMessageText(' ').isValid).toBe(false);
      expect(validateMessageText('   \t\t\n\r\n   ').isValid).toBe(false);
      expect(validateMessageText('   \t\t\n\r\n   ').error).toBe(
        'Message text is required and cannot be empty.'
      );
    });
  });

  describe('calculateSmsSegments GSM-7 & Multipart Boundaries', () => {
    it('returns zero metrics for empty string', () => {
      expect(calculateSmsSegments('')).toEqual({
        charCount: 0,
        segmentCount: 0,
        isUnicode: false,
        bytesTotal: 0,
      });
    });

    it('calculates single GSM-7 character correctly', () => {
      const res = calculateSmsSegments('X');
      expect(res).toEqual({
        charCount: 1,
        segmentCount: 1,
        isUnicode: false,
        bytesTotal: 1,
      });
    });

    it('calculates exactly 160 characters of GSM-7 as 1 segment (boundary)', () => {
      const text160 = 'A'.repeat(160);
      const res = calculateSmsSegments(text160);
      expect(res.charCount).toBe(160);
      expect(res.segmentCount).toBe(1);
      expect(res.isUnicode).toBe(false);
      expect(res.bytesTotal).toBe(160);
    });

    it('calculates exactly 161 characters of GSM-7 as 2 segments (multipart trigger)', () => {
      const text161 = 'A'.repeat(161);
      const res = calculateSmsSegments(text161);
      expect(res.charCount).toBe(161);
      expect(res.segmentCount).toBe(2);
      expect(res.isUnicode).toBe(false);
      expect(res.bytesTotal).toBe(161);
    });

    it('verifies 153*N multipart boundaries for GSM-7', () => {
      // 153 chars -> 1 segment (under 160 threshold)
      expect(calculateSmsSegments('A'.repeat(153)).segmentCount).toBe(1);

      // 153 * 2 = 306 chars -> exactly 2 segments
      expect(calculateSmsSegments('A'.repeat(306)).segmentCount).toBe(2);

      // 307 chars -> enters segment 3
      expect(calculateSmsSegments('A'.repeat(307)).segmentCount).toBe(3);

      // 153 * 3 = 459 chars -> exactly 3 segments
      expect(calculateSmsSegments('A'.repeat(459)).segmentCount).toBe(3);

      // 460 chars -> enters segment 4
      expect(calculateSmsSegments('A'.repeat(460)).segmentCount).toBe(4);

      // 153 * 4 = 612 chars -> exactly 4 segments
      expect(calculateSmsSegments('A'.repeat(612)).segmentCount).toBe(4);

      // 613 chars -> enters segment 5
      expect(calculateSmsSegments('A'.repeat(613)).segmentCount).toBe(5);

      // 153 * 10 = 1530 chars -> exactly 10 segments
      expect(calculateSmsSegments('A'.repeat(1530)).segmentCount).toBe(10);

      // 1531 chars -> 11 segments
      expect(calculateSmsSegments('A'.repeat(1531)).segmentCount).toBe(11);
    });

    it('identifies whitespace-only text as GSM-7 without crash', () => {
      const res = calculateSmsSegments('   \n\t  ');
      expect(res.charCount).toBe(7);
      expect(res.segmentCount).toBe(1);
      expect(res.isUnicode).toBe(false);
      expect(res.bytesTotal).toBe(7);
    });
  });

  describe('calculateSmsSegments Unicode & Multipart Boundaries', () => {
    it('detects Unicode emojis and calculates 1 segment up to 70 code points', () => {
      // Single emoji (surrogate pair)
      const single = calculateSmsSegments('🚀');
      expect(single.charCount).toBe(1);
      expect(single.segmentCount).toBe(1);
      expect(single.isUnicode).toBe(true);
      expect(single.bytesTotal).toBe(4); // 2 UTF-16 code units * 2 bytes = 4 bytes

      // Exactly 70 emojis -> 1 segment
      const text70 = '🔥'.repeat(70);
      const res70 = calculateSmsSegments(text70);
      expect(res70.charCount).toBe(70);
      expect(res70.segmentCount).toBe(1);
      expect(res70.isUnicode).toBe(true);

      // 71 emojis -> 2 segments (Math.ceil(71 / 67) = 2)
      const text71 = '🔥'.repeat(71);
      const res71 = calculateSmsSegments(text71);
      expect(res71.charCount).toBe(71);
      expect(res71.segmentCount).toBe(2);
      expect(res71.isUnicode).toBe(true);
    });

    it('verifies 67*N multipart boundaries for Unicode', () => {
      // 67 * 2 = 134 chars -> 2 segments
      expect(calculateSmsSegments('😊'.repeat(134)).segmentCount).toBe(2);

      // 135 chars -> 3 segments
      expect(calculateSmsSegments('😊'.repeat(135)).segmentCount).toBe(3);

      // 67 * 3 = 201 chars -> 3 segments
      expect(calculateSmsSegments('😊'.repeat(201)).segmentCount).toBe(3);

      // 202 chars -> 4 segments
      expect(calculateSmsSegments('😊'.repeat(202)).segmentCount).toBe(4);
    });

    it('handles mixed GSM-7 and Unicode correctly', () => {
      // 11 GSM-7 chars + 1 emoji = 12 chars, isUnicode: true, 1 segment
      const mixed1 = 'Hello 2026 🌍';
      const res1 = calculateSmsSegments(mixed1);
      expect(res1.isUnicode).toBe(true);
      expect(res1.charCount).toBe(12);
      expect(res1.segmentCount).toBe(1);

      // 69 GSM chars + 1 emoji = 70 chars, fits in 1 segment
      const mixed70 = 'A'.repeat(69) + '🎉';
      const res70 = calculateSmsSegments(mixed70);
      expect(res70.charCount).toBe(70);
      expect(res70.segmentCount).toBe(1);

      // 70 GSM chars + 1 emoji = 71 chars, spills to 2 segments
      const mixed71 = 'A'.repeat(70) + '🎉';
      const res71 = calculateSmsSegments(mixed71);
      expect(res71.charCount).toBe(71);
      expect(res71.segmentCount).toBe(2);

      // 160 GSM chars + 1 emoji = 161 chars, in Unicode mode (161 / 67 = 2.40 -> 3 segments)
      const mixed161 = 'A'.repeat(160) + '🎉';
      const res161 = calculateSmsSegments(mixed161);
      expect(res161.charCount).toBe(161);
      expect(res161.isUnicode).toBe(true);
      expect(res161.segmentCount).toBe(3);
    });

    it('correctly handles international scripts (Devanagari, Cyrillic, CJK, Arabic)', () => {
      const devanagari = 'शुभ प्रभात मित्र!';
      expect(calculateSmsSegments(devanagari).isUnicode).toBe(true);
      expect(calculateSmsSegments(devanagari).segmentCount).toBe(1);

      const arabic = 'صباح الخير';
      expect(calculateSmsSegments(arabic).isUnicode).toBe(true);
      expect(calculateSmsSegments(arabic).segmentCount).toBe(1);

      const japanese = 'こんにちは世界';
      expect(calculateSmsSegments(japanese).isUnicode).toBe(true);
      expect(calculateSmsSegments(japanese).segmentCount).toBe(1);
    });
  });
});

describe('Challenger M2: validateScheduleInput Combined Stress Testing', () => {
  const BASE_NOW = new Date('2026-09-07T12:00:00.000Z');

  it('aggregates multiple distinct validation errors simultaneously', () => {
    const res = validateScheduleInput(
      {
        recipientName: '   ',
        phoneNumber: 'invalid-phone',
        messageText: '',
        scheduledDate: new Date(BASE_NOW.getTime() - 1000), // in past
      },
      BASE_NOW
    );

    expect(res.isValid).toBe(false);
    expect(res.errors.recipient).toBe('Recipient name is required.');
    expect(res.errors.phoneNumber).toBe('Phone number is required.');
    expect(res.errors.message).toBe('Message text is required and cannot be empty.');
    expect(res.errors.scheduledAt).toBe(
      'Scheduled time must be in the future (minimum 30 seconds from now).'
    );
  });

  it('accepts valid schedule inputs with international formats', () => {
    const res = validateScheduleInput(
      {
        recipientName: 'Dev Sharma',
        phoneNumber: '+91-98765-43210',
        messageText: 'Meeting scheduled for tomorrow at 10 AM',
        scheduledDate: new Date(BASE_NOW.getTime() + 60000), // +60s
      },
      BASE_NOW
    );

    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  it('validates recurrence end date rules thoroughly', () => {
    const scheduledTime = new Date('2026-09-08T10:00:00.000Z');

    // Recurrence with endDate before scheduledDate
    const resBefore = validateScheduleInput(
      {
        recipientName: 'Alice',
        phoneNumber: '+14155552671',
        messageText: 'Daily digest',
        scheduledDate: scheduledTime,
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-07', // day before scheduled date
        },
      },
      BASE_NOW
    );
    expect(resBefore.isValid).toBe(false);
    expect(resBefore.errors.recurrence).toBe(
      'Recurrence end date cannot be earlier than scheduled start date.'
    );

    // Recurrence with endDate on the same day (end of day 23:59:59.999Z >= 10:00:00Z)
    const resSameDay = validateScheduleInput(
      {
        recipientName: 'Alice',
        phoneNumber: '+14155552671',
        messageText: 'Daily digest',
        scheduledDate: scheduledTime,
        recurrence: {
          type: 'daily',
          hasEndDate: true,
          endDate: '2026-09-08',
        },
      },
      BASE_NOW
    );
    expect(resSameDay.isValid).toBe(true);

    // Recurrence without hasEndDate flag ignores endDate
    const resNoFlag = validateScheduleInput(
      {
        recipientName: 'Alice',
        phoneNumber: '+14155552671',
        messageText: 'Daily digest',
        scheduledDate: scheduledTime,
        recurrence: {
          type: 'daily',
          hasEndDate: false,
          endDate: '2026-01-01', // old date but hasEndDate is false
        },
      },
      BASE_NOW
    );
    expect(resNoFlag.isValid).toBe(true);

    // Recurrence with non-daily type ignores endDate
    const resNoneType = validateScheduleInput(
      {
        recipientName: 'Alice',
        phoneNumber: '+14155552671',
        messageText: 'Single shot',
        scheduledDate: scheduledTime,
        recurrence: {
          type: 'none',
          hasEndDate: true,
          endDate: '2020-01-01',
        },
      },
      BASE_NOW
    );
    expect(resNoneType.isValid).toBe(true);
  });

  describe('Complex Unicode, Emojis with Modifiers & Extended Charsets', () => {
    it('handles composite and modified emojis with surrogate pairs', () => {
      // Skin tone modifier: 👍 (code point 1) + 🏽 (modifier code point 2) = 2 code points
      const thumb = '👍🏽';
      const res = calculateSmsSegments(thumb);
      expect(res.isUnicode).toBe(true);
      expect(res.charCount).toBe(2);
      expect(res.segmentCount).toBe(1);

      // Flag emoji: 2 regional indicator code points
      const flag = '🇺🇸';
      const resFlag = calculateSmsSegments(flag);
      expect(resFlag.isUnicode).toBe(true);
      expect(resFlag.charCount).toBe(2);
      expect(resFlag.segmentCount).toBe(1);
    });

    it('handles multi-line text with combinations of \\r, \\n, and \\t in GSM-7', () => {
      const multiline = 'Line 1\r\nLine 2\tTabbed\nLine 3';
      const res = calculateSmsSegments(multiline);
      expect(res.isUnicode).toBe(false);
      expect(res.charCount).toBe(multiline.length);
      expect(res.segmentCount).toBe(1);
    });

    it('rejects invalid recurrence date strings in validateScheduleInput', () => {
      const res = validateScheduleInput(
        {
          recipientName: 'Alice',
          phoneNumber: '+14155552671',
          messageText: 'Message',
          scheduledDate: new Date(BASE_NOW.getTime() + 60000),
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: 'not-a-date-string',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
    });
  });
});

