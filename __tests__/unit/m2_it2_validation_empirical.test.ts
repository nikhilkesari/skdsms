/**
 * Empirical Challenge Suite: Milestone 2 Iteration 2 Validation
 * Path: __tests__/unit/m2_it2_validation_empirical.test.ts
 *
 * Authored by: teamwork_preview_challenger_m2_it2_1
 * Scope:
 * 1. validateScheduleInput with various ISO formats:
 *    - UTC 'Z' (with and without ms)
 *    - Timezone offsets (+05:30, -04:00, +00:00, -08:00)
 *    - Surrounding whitespace on ISO timestamps
 *    - Date-only vs Full ISO in recurrence end dates
 *    - Malformed ISO strings and boundary timestamps
 * 2. validateScheduledTime with edge case inputs:
 *    - null, undefined
 *    - numbers (0, positive integer, negative integer, NaN, Infinity)
 *    - booleans (true, false)
 *    - NaN Date (new Date(NaN), new Date('invalid'))
 *    - empty string and whitespace string
 *    - objects and arrays
 * 3. validateScheduleInput cross-field interaction:
 *    - Malformed/null scheduledDate combined with recurrence rules
 */

import {
  validateScheduledTime,
  validateScheduleInput,
  validatePhoneNumber,
  validateMessageText,
} from '../../src/utils/validation';

describe('M2 Iteration 2 Challenger: validateScheduledTime Edge Cases', () => {
  const BASE_NOW = new Date('2026-09-15T12:00:00.000Z');

  describe('Null, Undefined, and Primitive Non-Date/String Types', () => {
    it('rejects null input safely without throwing TypeError', () => {
      const res = validateScheduledTime(null as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects undefined input safely without throwing TypeError', () => {
      const res = validateScheduledTime(undefined as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects number 0 safely', () => {
      const res = validateScheduledTime(0 as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects positive timestamp numbers safely', () => {
      const res = validateScheduledTime(1789560000000 as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects negative numbers safely', () => {
      const res = validateScheduledTime(-1000 as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects numeric NaN safely', () => {
      const res = validateScheduledTime(NaN as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects numeric Infinity safely', () => {
      const res = validateScheduledTime(Infinity as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects boolean true safely', () => {
      const res = validateScheduledTime(true as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects boolean false safely', () => {
      const res = validateScheduledTime(false as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects plain object {} safely', () => {
      const res = validateScheduledTime({} as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('rejects array [] safely', () => {
      const res = validateScheduledTime([] as any, BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Scheduled date and time is required and cannot be empty.');
    });
  });

  describe('Invalid Dates and Empty Strings', () => {
    it('rejects empty string "" with Invalid date or time format error', () => {
      const res = validateScheduledTime('', BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Invalid date or time format.');
    });

    it('rejects whitespace-only string "   " with Invalid date or time format error', () => {
      const res = validateScheduledTime('   ', BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Invalid date or time format.');
    });

    it('rejects new Date(NaN) with Invalid date or time format error', () => {
      const res = validateScheduledTime(new Date(NaN), BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Invalid date or time format.');
    });

    it('rejects new Date("invalid") with Invalid date or time format error', () => {
      const res = validateScheduledTime(new Date('invalid'), BASE_NOW);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Invalid date or time format.');
    });
  });

  describe('Valid Date and Future Lead Buffer Boundary', () => {
    it('accepts future Date object beyond 30s buffer', () => {
      const future = new Date(BASE_NOW.getTime() + 45000);
      const res = validateScheduledTime(future, BASE_NOW);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts future ISO string beyond 30s buffer', () => {
      const futureIso = '2026-09-15T12:00:31.000Z';
      const res = validateScheduledTime(futureIso, BASE_NOW);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });
  });
});

describe('M2 Iteration 2 Challenger: validateScheduleInput ISO Format Variations', () => {
  const BASE_NOW = new Date('2026-09-15T12:00:00.000Z');
  const validPayloadBase = {
    recipientName: 'Empirical Challenger',
    phoneNumber: '+15551234567',
    messageText: 'Validation test payload',
  };

  describe('scheduledDate ISO Formats', () => {
    it('accepts UTC with Z and milliseconds (e.g. 2026-09-15T12:01:00.000Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-15T12:01:00.000Z',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('accepts UTC with Z without milliseconds (e.g. 2026-09-15T12:01:00Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-15T12:01:00Z',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('accepts positive timezone offset +05:30 (e.g. 17:31:00+05:30 == 12:01:00Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-15T17:31:00+05:30',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('accepts negative timezone offset -04:00 (e.g. 08:01:00-04:00 == 12:01:00Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-15T08:01:00-04:00',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('accepts timezone offset +00:00 (e.g. 2026-09-15T12:01:00+00:00)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-15T12:01:00+00:00',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('accepts ISO string with surrounding whitespace (e.g. "  2026-09-15T12:01:00.000Z  ")', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '  2026-09-15T12:01:00.000Z  ',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('rejects malformed ISO date strings (e.g. 2026-99-99T99:99:99Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-99-99T99:99:99Z',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Invalid date or time format.');
    });

    it('rejects garbage string (e.g. not-an-iso-string)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: 'not-an-iso-string',
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Invalid date or time format.');
    });
  });

  describe('recurrence.endDate ISO Formats', () => {
    const scheduledFuture = '2026-09-15T14:00:00.000Z';

    it('accepts standard date-only YYYY-MM-DD format (e.g. 2026-09-20)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('accepts date-only format with surrounding whitespace (e.g. "   2026-09-20   ")', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '   2026-09-20   ',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('accepts full ISO timestamp with Z and milliseconds (e.g. 2026-09-20T23:59:59.999Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59.999Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('accepts full ISO timestamp with Z without milliseconds (e.g. 2026-09-20T23:59:59Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('accepts ISO timestamp with positive timezone offset +05:30', () => {
      // 2026-09-20T23:59:59+05:30 is 2026-09-20T18:29:59Z (chronologically after 14:00:00Z)
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59+05:30',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('accepts ISO timestamp with negative timezone offset -04:00', () => {
      // 2026-09-20T23:59:59-04:00 is 2026-09-21T03:59:59Z
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59-04:00',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('accepts full ISO timestamp with surrounding whitespace', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '  2026-09-20T23:59:59.999Z  ',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('rejects malformed recurrence end date with T (e.g. 2026-99-99T99:99:99Z)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-99-99T99:99:99Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
    });

    it('rejects malformed recurrence end date without T (e.g. not-a-date)', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: scheduledFuture,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: 'not-a-date',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
    });

    it('rejects recurrence end date when chronologically earlier than scheduled date', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-20T10:00:00.000Z',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-19T10:00:00.000Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe(
        'Recurrence end date cannot be earlier than scheduled start date.'
      );
    });
  });

  describe('Adversarial Cross-Field Combinations', () => {
    it('handles scheduledDate as null safely even when recurrence with endDate is present', () => {
      // In JavaScript runtime, scheduledDate might be passed as null
      // validateScheduleInput should not crash with TypeError
      let errorThrown: any = null;
      let res: any = null;
      try {
        res = validateScheduleInput(
          {
            ...validPayloadBase,
            scheduledDate: null as any,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-20T23:59:59.999Z',
            },
          },
          BASE_NOW
        );
      } catch (err) {
        errorThrown = err;
      }

      if (errorThrown) {
        expect(errorThrown).toBeNull();
      } else {
        expect(res.isValid).toBe(false);
        expect(res.errors.scheduledAt).toBeDefined();
      }
    });

    it('handles scheduledDate as undefined safely even when recurrence with endDate is present', () => {
      let errorThrown: any = null;
      let res: any = null;
      try {
        res = validateScheduleInput(
          {
            ...validPayloadBase,
            scheduledDate: undefined as any,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-20T23:59:59.999Z',
            },
          },
          BASE_NOW
        );
      } catch (err) {
        errorThrown = err;
      }

      if (errorThrown) {
        expect(errorThrown).toBeNull();
      } else {
        expect(res.isValid).toBe(false);
        expect(res.errors.scheduledAt).toBeDefined();
      }
    });

    it('handles scheduledDate as number safely even when recurrence with endDate is present', () => {
      let errorThrown: any = null;
      let res: any = null;
      try {
        res = validateScheduleInput(
          {
            ...validPayloadBase,
            scheduledDate: 1234567890 as any,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-20T23:59:59.999Z',
            },
          },
          BASE_NOW
        );
      } catch (err) {
        errorThrown = err;
      }

      if (errorThrown) {
        expect(errorThrown).toBeNull();
      } else {
        expect(res.isValid).toBe(false);
        expect(res.errors.scheduledAt).toBeDefined();
      }
    });

    it('handles scheduledDate as boolean safely even when recurrence with endDate is present', () => {
      let errorThrown: any = null;
      let res: any = null;
      try {
        res = validateScheduleInput(
          {
            ...validPayloadBase,
            scheduledDate: true as any,
            recurrence: {
              type: 'daily',
              hasEndDate: true,
              endDate: '2026-09-20T23:59:59.999Z',
            },
          },
          BASE_NOW
        );
      } catch (err) {
        errorThrown = err;
      }

      if (errorThrown) {
        expect(errorThrown).toBeNull();
      } else {
        expect(res.isValid).toBe(false);
        expect(res.errors.scheduledAt).toBeDefined();
      }
    });

    it('handles scheduledDate as invalid string safely when recurrence with endDate is present', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: 'invalid-scheduled-date',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59.999Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Invalid date or time format.');
    });
  });
});
