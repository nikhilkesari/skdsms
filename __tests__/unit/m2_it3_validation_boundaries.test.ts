/**
 * M2 Iteration 3 Adversarial Boundary & Stress Suite
 * Target: __tests__/unit/m2_it3_validation_boundaries.test.ts
 *
 * Authored by: teamwork_preview_challenger_m2_it3_2
 *
 * Specific Focus:
 * 1. Whitespace combinations: tabs, newlines, carriage returns, multi-space padding around:
 *    - phone numbers (international, national, formatted, whitespace-only)
 *    - messages (single-char, multiline, whitespace-only)
 *    - dates (ISO UTC, ISO offset, date-only, whitespace-only, malformed)
 *    - recurrence end dates
 * 2. Bizarre inputs:
 *    - empty objects ({}) as input, as scheduledDate, as recurrence
 *    - arrays as dates ([], ['2026-10-01'], [2026, 9, 15])
 *    - Symbols (Symbol('date'), Symbol())
 *    - BigInts (0n, 1234567890n)
 *    - Date objects with invalid times (new Date('invalid'), new Date(NaN), new Date(Infinity))
 * 3. Robustness Guarantee:
 *    - Validation returns clean { isValid: false, errors } and never throws an unhandled exception.
 */

import {
  normalizePhoneNumber,
  validatePhoneNumber,
  validateMessageText,
  validateScheduledTime,
  validateScheduleInput,
} from '../../src/utils/validation';

describe('M2 Iteration 3 Boundary Challenger: Whitespace Combinations', () => {
  const BASE_NOW = new Date('2026-09-15T12:00:00.000Z');

  describe('Phone Number Whitespace Handling', () => {
    it('accepts and normalizes phone numbers with surrounding tabs', () => {
      const input = '\t\t+12345678901\t\t';
      const normalized = normalizePhoneNumber(input);
      expect(normalized).toBe('+12345678901');

      const res = validatePhoneNumber(input);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts and normalizes phone numbers with newlines and carriage returns', () => {
      const input = '\r\n\n+919876543210\r\n';
      const normalized = normalizePhoneNumber(input);
      expect(normalized).toBe('+919876543210');

      const res = validatePhoneNumber(input);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts and normalizes formatted phone numbers with multi-space, tab, and newline padding', () => {
      const input = '   \t  +1 (555) 234-5678  \r\n\t  ';
      const normalized = normalizePhoneNumber(input);
      expect(normalized).toBe('+15552345678');

      const res = validatePhoneNumber(input);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts national digits with multi-space padding', () => {
      const input = '     9876543210     ';
      const normalized = normalizePhoneNumber(input);
      expect(normalized).toBe('9876543210');

      const res = validatePhoneNumber(input);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects whitespace-only phone inputs cleanly without throwing', () => {
      const whitespaceInputs = [
        '   ',
        '\t\t\t',
        '\r\n\r\n',
        ' \t \n \r \t ',
        '\u00A0\u00A0', // non-breaking spaces
      ];

      for (const ws of whitespaceInputs) {
        expect(() => {
          const res = validatePhoneNumber(ws);
          expect(res.isValid).toBe(false);
          expect(res.error).toBe('Phone number is required.');
        }).not.toThrow();
      }
    });

    it('rejects short phone number padded with whitespace', () => {
      const res = validatePhoneNumber('   \t +123 \n ');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Phone number is too short (minimum 7 digits).');
    });
  });

  describe('Message Text Whitespace Handling', () => {
    it('accepts message text with leading and trailing tabs, spaces, and newlines', () => {
      const input = '\t\n   Appointment reminder for tomorrow at 10 AM   \n\t';
      const res = validateMessageText(input);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts single-character message surrounded by massive whitespace padding', () => {
      const input = '             \t\t\n\r  !  \r\n\t             ';
      const res = validateMessageText(input);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects whitespace-only message inputs cleanly without throwing', () => {
      const whitespaceInputs = [
        '   ',
        '\t\t',
        '\n\r\n',
        '  \t  \n  \r  \t  ',
        '\u0020\u2000\u2001\u3000', // Unicode spaces
      ];

      for (const ws of whitespaceInputs) {
        expect(() => {
          const res = validateMessageText(ws);
          expect(res.isValid).toBe(false);
          expect(res.error).toBe('Message text is required and cannot be empty.');
        }).not.toThrow();
      }
    });
  });

  describe('Scheduled Date Whitespace Handling', () => {
    it('accepts future ISO UTC date with leading/trailing tabs and spaces', () => {
      const input = '\t   2026-09-15T12:01:00.000Z   \t';
      const res = validateScheduledTime(input, BASE_NOW);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts future ISO offset date with newlines and carriage returns', () => {
      const input = '\r\n\n2026-09-15T17:31:00.000+05:30\r\n';
      const res = validateScheduledTime(input, BASE_NOW);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects whitespace-only date string cleanly without throwing', () => {
      const whitespaceDates = [
        '   ',
        '\t\t',
        '\r\n\r\n',
        ' \t \n \r ',
      ];

      for (const ws of whitespaceDates) {
        expect(() => {
          const res = validateScheduledTime(ws, BASE_NOW);
          expect(res.isValid).toBe(false);
          expect(res.error).toBe('Invalid date or time format.');
        }).not.toThrow();
      }
    });

    it('rejects malformed date string with surrounding whitespace cleanly', () => {
      const res = validateScheduledTime('   \t not-a-valid-date \n  ', BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Invalid date or time format.');
    });
  });

  describe('Recurrence End Date Whitespace Handling in validateScheduleInput', () => {
    it('accepts recurrence endDate with leading/trailing tabs, newlines, and spaces', () => {
      const res = validateScheduleInput(
        {
          recipientName: '  \t Alice Smith \n ',
          phoneNumber: '\t +12345678901 \r\n',
          messageText: '\n\t Reminder text \t\n',
          scheduledDate: '  2026-09-15T12:01:00.000Z  ',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '  \t  2026-09-30  \r\n  ',
          },
        },
        BASE_NOW
      );

      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('rejects recurrence endDate that is whitespace-only cleanly without throwing', () => {
      const res = validateScheduleInput(
        {
          recipientName: 'Alice',
          phoneNumber: '+12345678901',
          messageText: 'Reminder',
          scheduledDate: '2026-09-15T12:01:00.000Z',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '     \t\r\n   ',
          },
        },
        BASE_NOW
      );

      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
    });
  });
});

describe('M2 Iteration 3 Boundary Challenger: Bizarre Inputs & Robustness', () => {
  const BASE_NOW = new Date('2026-09-15T12:00:00.000Z');

  describe('Empty Object ({}) Handling', () => {
    it('handles empty object as input to validateScheduleInput cleanly and never throws', () => {
      let result: any;
      expect(() => {
        result = validateScheduleInput({} as any, BASE_NOW);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual({
        recipient: 'Recipient name is required.',
        phoneNumber: 'Phone number is required.',
        message: 'Message text is required and cannot be empty.',
        scheduledAt: 'Scheduled date and time is required and cannot be empty.',
      });
    });

    it('handles empty object ({}) as scheduledDate cleanly without throwing', () => {
      const res = validateScheduledTime({} as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');

      let scheduleRes: any;
      expect(() => {
        scheduleRes = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: {} as any,
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(scheduleRes.isValid).toBe(false);
      expect(scheduleRes.errors.scheduledAt).toBe(
        'Scheduled date and time is required and cannot be empty.'
      );
    });

    it('handles empty object ({}) as scheduledDate combined with daily recurrence without throwing', () => {
      let scheduleRes: any;
      expect(() => {
        scheduleRes = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: {} as any,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-30',
            },
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(scheduleRes.isValid).toBe(false);
      expect(scheduleRes.errors.scheduledAt).toBe(
        'Scheduled date and time is required and cannot be empty.'
      );
      // No spurious recurrence error when scheduledDate is simply an empty object
      expect(scheduleRes.errors.recurrence).toBeUndefined();
    });
  });

  describe('Arrays as Dates Handling', () => {
    it('handles empty array [] as scheduledDate in validateScheduledTime without throwing', () => {
      const res = validateScheduledTime([] as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles string array ["2026-10-01"] as scheduledDate in validateScheduledTime without throwing', () => {
      const res = validateScheduledTime(['2026-10-01'] as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles number array [2026, 9, 15] as scheduledDate in validateScheduledTime without throwing', () => {
      const res = validateScheduledTime([2026, 9, 15] as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles arrays as scheduledDate in validateScheduleInput with daily recurrence without throwing', () => {
      const testArrays = [[], ['2026-10-01'], [2026, 9, 15, 12, 0]];

      for (const arr of testArrays) {
        let scheduleRes: any;
        expect(() => {
          scheduleRes = validateScheduleInput(
            {
              recipientName: 'Bob',
              phoneNumber: '+1234567890',
              messageText: 'Hello',
              scheduledDate: arr as any,
              recurrence: {
                type: 'daily',
                hasEndDate: true,
                endDate: '2026-09-30',
              },
            },
            BASE_NOW
          );
        }).not.toThrow();

        expect(scheduleRes.isValid).toBe(false);
        expect(scheduleRes.errors.scheduledAt).toBe(
          'Scheduled date and time is required and cannot be empty.'
        );
        expect(scheduleRes.errors.recurrence).toBeUndefined();
      }
    });
  });

  describe('Symbols Handling', () => {
    it('handles Symbol as scheduledDate in validateScheduledTime without throwing', () => {
      const sym = Symbol('futureDate');
      let res: any;
      expect(() => {
        res = validateScheduledTime(sym as any, BASE_NOW);
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles Symbol as scheduledDate in validateScheduleInput without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: Symbol('date') as any,
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe(
        'Scheduled date and time is required and cannot be empty.'
      );
    });

    it('handles Symbol as scheduledDate combined with daily recurrence without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: Symbol('date') as any,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-30',
            },
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe(
        'Scheduled date and time is required and cannot be empty.'
      );
      expect(res.errors.recurrence).toBeUndefined();
    });
  });

  describe('BigInts Handling', () => {
    it('handles positive BigInt timestamp as scheduledDate in validateScheduledTime without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduledTime(1789560000000n as any, BASE_NOW);
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles 0n as scheduledDate in validateScheduledTime without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduledTime(0n as any, BASE_NOW);
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles negative BigInt as scheduledDate in validateScheduledTime without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduledTime(-1000n as any, BASE_NOW);
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles BigInt as scheduledDate in validateScheduleInput with recurrence without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: 1789560000000n as any,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-30',
            },
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe(
        'Scheduled date and time is required and cannot be empty.'
      );
      expect(res.errors.recurrence).toBeUndefined();
    });
  });

  describe('Date Objects with Invalid Times Handling', () => {
    it('handles new Date("invalid") in validateScheduledTime without throwing', () => {
      const invalidDate = new Date('invalid');
      expect(isNaN(invalidDate.getTime())).toBe(true);

      let res: any;
      expect(() => {
        res = validateScheduledTime(invalidDate, BASE_NOW);
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Invalid date or time format.');
    });

    it('handles new Date(NaN) in validateScheduledTime without throwing', () => {
      const nanDate = new Date(NaN);
      let res: any;
      expect(() => {
        res = validateScheduledTime(nanDate, BASE_NOW);
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Invalid date or time format.');
    });

    it('handles new Date("invalid") in validateScheduleInput without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: new Date('invalid'),
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Invalid date or time format.');
    });

    it('handles new Date("invalid") combined with daily recurrence without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: new Date('invalid'),
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-30',
            },
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Invalid date or time format.');
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('handles new Date(NaN) combined with daily recurrence without throwing', () => {
      let res: any;
      expect(() => {
        res = validateScheduleInput(
          {
            recipientName: 'Bob',
            phoneNumber: '+1234567890',
            messageText: 'Hello',
            scheduledDate: new Date(NaN),
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-30',
            },
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Invalid date or time format.');
      expect(res.errors.recurrence).toBeUndefined();
    });
  });

  describe('Comprehensive Edge Combinations and Resilience Verification', () => {
    it('returns clean errors object with multiple invalid bizarre fields simultaneously', () => {
      let res: any;
      expect(() => {
        res = validateScheduleInput(
          {
            recipientName: '   ', // whitespace only
            phoneNumber: '   ', // whitespace only
            messageText: '   ', // whitespace only
            scheduledDate: new Date('invalid'), // invalid Date
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: 'not-a-date', // invalid recurrence endDate
            },
          },
          BASE_NOW
        );
      }).not.toThrow();

      expect(res.isValid).toBe(false);
      expect(res.errors).toEqual({
        recipient: 'Recipient name is required.',
        phoneNumber: 'Phone number is required.',
        message: 'Message text is required and cannot be empty.',
        scheduledAt: 'Invalid date or time format.',
        recurrence: 'Invalid recurrence end date format.',
      });
    });

    it('correctly reports chronological error when recurrence endDate is prior to scheduledDate', () => {
      const res = validateScheduleInput(
        {
          recipientName: 'Alice',
          phoneNumber: '+1234567890',
          messageText: 'Daily report',
          scheduledDate: new Date('2026-09-20T10:00:00.000Z'),
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-18', // Earlier than start date
          },
        },
        BASE_NOW
      );

      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe(
        'Recurrence end date cannot be earlier than scheduled start date.'
      );
    });

    it('accepts scheduled date and recurrence endDate when both are clean and chronologically ordered', () => {
      const res = validateScheduleInput(
        {
          recipientName: 'Alice',
          phoneNumber: '+1234567890',
          messageText: 'Daily report',
          scheduledDate: new Date('2026-09-20T10:00:00.000Z'),
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-25',
          },
        },
        BASE_NOW
      );

      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });
  });
});
