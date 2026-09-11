/**
 * Empirical Stress Harness: Milestone 2 Iteration 3 Adversarial Testing
 * Path: __tests__/unit/m2_it3_empirical_stress.test.ts
 *
 * Authored by: teamwork_preview_challenger_m2_it3_1
 * Scope:
 * Probing boundary conditions, whitespace variations (tabs, newlines),
 * non-primitive / exotic inputs, and repository update safety without `as any`.
 */

import {
  validateScheduledTime,
  validateScheduleInput,
  validatePhoneNumber,
  validateMessageText,
} from '../../src/utils/validation';
import { InMemoryScheduleRepository } from '../../src/repositories/InMemoryScheduleRepository';
import { AsyncStorageScheduleRepository } from '../../src/repositories/AsyncStorageScheduleRepository';
import type { IStorageAdapter } from '../../src/repositories/ScheduleRepository';

describe('M2 Iteration 3 Challenger: Adversarial Stress Tests', () => {
  const BASE_NOW = new Date('2026-09-15T12:00:00.000Z');
  const validPayloadBase = {
    recipientName: 'Stress Challenger',
    phoneNumber: '+15551234567',
    messageText: 'Stress test payload',
  };

  describe('Adversarial Whitespace Variations in ISO Timestamps', () => {
    it('accepts ISO string with tab and newline whitespace', () => {
      const scheduledDate = '\t\n 2026-09-15T12:01:00.000Z \r\n ';
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate,
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('accepts recurrence endDate with tab and newline whitespace', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-15T12:01:00.000Z',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '\t\n 2026-09-20 \r\n ',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('rejects recurrence endDate that is whitespace-only with tabs', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: '2026-09-15T12:01:00.000Z',
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: ' \t \n ',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe('Invalid recurrence end date format.');
    });
  });

  describe('Exotic and Symbol Types for scheduledDate', () => {
    it('handles Symbol input safely without throwing', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: Symbol('date') as any,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59.999Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles BigInt input safely without throwing', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: BigInt(1789560000000) as any,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59.999Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Scheduled date and time is required and cannot be empty.');
    });

    it('handles function input safely without throwing', () => {
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: (() => '2026-09-20') as any,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: '2026-09-20T23:59:59.999Z',
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.scheduledAt).toBe('Scheduled date and time is required and cannot be empty.');
    });
  });

  describe('Sub-second and Boundary Comparison Math', () => {
    it('rejects recurrence endDate that is 1 millisecond before scheduled start time', () => {
      const scheduledDate = '2026-09-15T12:01:00.000Z';
      const endDate = '2026-09-15T12:00:59.999Z';
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate,
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.recurrence).toBe(
        'Recurrence end date cannot be earlier than scheduled start date.'
      );
    });

    it('accepts recurrence endDate that matches exact millisecond of scheduled start time', () => {
      const exactTime = '2026-09-15T12:01:00.000Z';
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate: exactTime,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate: exactTime,
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });

    it('accepts recurrence endDate that is 1 millisecond after scheduled start time', () => {
      const scheduledDate = '2026-09-15T12:01:00.000Z';
      const endDate = '2026-09-15T12:01:00.001Z';
      const res = validateScheduleInput(
        {
          ...validPayloadBase,
          scheduledDate,
          recurrence: {
            type: 'daily',
            hasEndDate: true,
            endDate,
          },
        },
        BASE_NOW
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.recurrence).toBeUndefined();
    });
  });

  describe('Repository Type Safety and Recipient Name Updates', () => {
    it('InMemoryScheduleRepository updates recipientName cleanly without as any', async () => {
      const repo = new InMemoryScheduleRepository();
      const created = await repo.create({
        recipient: { name: 'Alice Original', phoneNumber: '+15551234567' },
        messageText: 'Hello Alice',
        scheduledAt: '2026-09-15T12:01:00.000Z',
      });

      const updated = await repo.update(created.id, {
        recipientName: 'Alice Updated',
      });

      expect(updated.recipient.name).toBe('Alice Updated');
      expect(updated.recipient.phoneNumber).toBe('+15551234567');
    });

    it('AsyncStorageScheduleRepository updates recipientName cleanly without as any', async () => {
      const storageMap = new Map<string, string>();
      const mockStorage: IStorageAdapter = {
        getItem: async (key: string) => storageMap.get(key) ?? null,
        setItem: async (key: string, value: string) => {
          storageMap.set(key, value);
        },
        removeItem: async (key: string) => {
          storageMap.delete(key);
        },
        clear: async () => {
          storageMap.clear();
        },
      };

      const repo = new AsyncStorageScheduleRepository(mockStorage);
      const created = await repo.create({
        recipient: { name: 'Bob Original', phoneNumber: '+15559876543' },
        messageText: 'Hello Bob',
        scheduledAt: '2026-09-15T12:01:00.000Z',
      });

      const updated = await repo.update(created.id, {
        recipientName: 'Bob Updated',
      });

      expect(updated.recipient.name).toBe('Bob Updated');
      expect(updated.recipient.phoneNumber).toBe('+15559876543');
    });
  });
});
