/**
 * Sked SMS — Schedule Repository Unit Tests
 * Target: __tests__/unit/repository.test.ts
 *
 * Comprehensive tests verifying both InMemoryScheduleRepository and
 * AsyncStorageScheduleRepository implementations against the ScheduleRepository contract.
 */

import type { ScheduleRepository } from '../../src/repositories/ScheduleRepository';
import { SCHEDULE_STORAGE_KEY } from '../../src/repositories/ScheduleRepository';
import { InMemoryScheduleRepository } from '../../src/repositories/InMemoryScheduleRepository';
import { AsyncStorageScheduleRepository } from '../../src/repositories/AsyncStorageScheduleRepository';
import type { StorageAdapter } from '../../src/repositories/AsyncStorageScheduleRepository';
import type { CreateScheduleInput } from '../../src/types/schedule';

// Mock AsyncStorage for headless unit testing
const createInMemoryStorage = (): StorageAdapter & { store: Map<string, string> } => {
  const store = new Map<string, string>();
  return {
    store,
    async getItem(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
    async clear(): Promise<void> {
      store.clear();
    },
  };
};

describe('Schedule Repository Suite', () => {
  const sampleCreateInput: CreateScheduleInput = {
    recipient: {
      name: 'Alice Smith',
      phoneNumber: '+1 (555) 234-5678',
    },
    messageText: 'Hello Alice, your appointment is confirmed.',
    scheduledAt: '2026-10-01T14:30:00Z',
    recurrence: { type: 'none' },
  };

  describe.each([
    {
      name: 'InMemoryScheduleRepository',
      createRepo: () => new InMemoryScheduleRepository(),
    },
    {
      name: 'AsyncStorageScheduleRepository',
      createRepo: () => {
        const mockStorage = createInMemoryStorage();
        return new AsyncStorageScheduleRepository(mockStorage);
      },
    },
  ])('$name Contract Verification', ({ createRepo }) => {
    let repo: ScheduleRepository;

    beforeEach(async () => {
      repo = createRepo();
      await repo.clearAll();
    });

    // -----------------------------------------------------------------------
    // Creation & Field Population
    // -----------------------------------------------------------------------
    describe('create()', () => {
      it('creates a new schedule with populated defaults and metadata', async () => {
        const created = await repo.create(sampleCreateInput);

        expect(created.id).toBeDefined();
        expect(typeof created.id).toBe('string');
        expect(created.id.length).toBeGreaterThan(0);

        expect(created.recipient.name).toBe('Alice Smith');
        expect(created.recipient.phoneNumber).toBe('+15552345678');
        expect(created.messageText).toBe(sampleCreateInput.messageText);
        expect(created.scheduledAt).toBe('2026-10-01T14:30:00Z');
        expect(created.recurrence).toEqual({ type: 'none' });
        expect(created.status).toBe('pending');

        expect(typeof created.alarmRequestCode).toBe('number');
        expect(created.alarmRequestCode).toBeGreaterThanOrEqual(0);
        expect(created.alarmRequestCode).toBeLessThan(2147483647);

        expect(created.createdAt).toBeDefined();
        expect(created.updatedAt).toBeDefined();
        expect(created.lastSentAt).toBeNull();
        expect(created.errorMessage).toBeNull();
        expect(created.carrierErrorCode).toBeNull();
        expect(created.partsCount).toBe(1);
      });

      it('correctly calculates partsCount for multipart GSM-7 and Unicode messages', async () => {
        const gsmLong = 'A'.repeat(161);
        const s1 = await repo.create({
          recipient: { name: 'Bob', phoneNumber: '5551234' },
          messageText: gsmLong,
          scheduledAt: '2026-10-01T10:00:00Z',
        });
        expect(s1.partsCount).toBe(2);

        const unicodeLong = '🚀'.repeat(71); // 71 emojis > 70 UCS-2 chars boundary
        const s2 = await repo.create({
          recipient: { name: 'Charlie', phoneNumber: '5551234' },
          messageText: unicodeLong,
          scheduledAt: '2026-10-01T11:00:00Z',
        });
        expect(s2.partsCount).toBe(2);
      });

      it('generates distinct IDs and alarm request codes for multiple schedules', async () => {
        const s1 = await repo.create(sampleCreateInput);
        const s2 = await repo.create(sampleCreateInput);

        expect(s1.id).not.toBe(s2.id);
        expect(typeof s1.alarmRequestCode).toBe('number');
        expect(typeof s2.alarmRequestCode).toBe('number');
      });
    });

    // -----------------------------------------------------------------------
    // Retrieval (getById, getAll, getActivePending)
    // -----------------------------------------------------------------------
    describe('getById()', () => {
      it('retrieves an existing schedule by ID', async () => {
        const created = await repo.create(sampleCreateInput);
        const found = await repo.getById(created.id);

        expect(found).not.toBeNull();
        expect(found?.id).toBe(created.id);
        expect(found?.recipient.name).toBe(created.recipient.name);
      });

      it('returns null when querying non-existent ID', async () => {
        const found = await repo.getById('non-existent-id-999');
        expect(found).toBeNull();
      });
    });

    describe('getAll()', () => {
      it('returns empty array when repository is empty', async () => {
        const all = await repo.getAll();
        expect(all).toEqual([]);
      });

      it('returns all schedules sorted chronologically ascending by scheduledAt', async () => {
        await repo.create({
          recipient: { name: 'Third', phoneNumber: '5553333' },
          messageText: 'Late',
          scheduledAt: '2026-10-03T10:00:00Z',
        });
        await repo.create({
          recipient: { name: 'First', phoneNumber: '5551111' },
          messageText: 'Early',
          scheduledAt: '2026-10-01T10:00:00Z',
        });
        await repo.create({
          recipient: { name: 'Second', phoneNumber: '5552222' },
          messageText: 'Mid',
          scheduledAt: '2026-10-02T10:00:00Z',
        });

        const all = await repo.getAll();
        expect(all.length).toBe(3);
        expect(all[0].recipient.name).toBe('First');
        expect(all[1].recipient.name).toBe('Second');
        expect(all[2].recipient.name).toBe('Third');
      });

      it('maintains data immutability so external mutations do not affect repository', async () => {
        const created = await repo.create(sampleCreateInput);
        const all = await repo.getAll();
        all[0].recipient.name = 'Tampered Name';

        const fresh = await repo.getById(created.id);
        expect(fresh?.recipient.name).toBe('Alice Smith');
      });
    });

    describe('getActivePending()', () => {
      it('returns only pending schedules sorted chronologically', async () => {
        const s1 = await repo.create({
          recipient: { name: 'P2', phoneNumber: '5552222' },
          messageText: 'P2',
          scheduledAt: '2026-10-02T10:00:00Z',
        });
        const s2 = await repo.create({
          recipient: { name: 'P1', phoneNumber: '5551111' },
          messageText: 'P1',
          scheduledAt: '2026-10-01T10:00:00Z',
        });
        const s3 = await repo.create({
          recipient: { name: 'Sent', phoneNumber: '5553333' },
          messageText: 'Sent',
          scheduledAt: '2026-10-01T08:00:00Z',
        });

        // Mark s3 as sent
        await repo.update(s3.id, { status: 'sent' });

        const pending = await repo.getActivePending();
        expect(pending.length).toBe(2);
        expect(pending[0].id).toBe(s2.id);
        expect(pending[1].id).toBe(s1.id);
      });

      it('excludes failed, cancelled, and completed schedules', async () => {
        const sFailed = await repo.create({
          recipient: { name: 'Failed', phoneNumber: '5551111' },
          messageText: 'M1',
          scheduledAt: '2026-10-01T10:00:00Z',
        });
        const sCompleted = await repo.create({
          recipient: { name: 'Completed', phoneNumber: '5552222' },
          messageText: 'M2',
          scheduledAt: '2026-10-02T10:00:00Z',
        });

        await repo.update(sFailed.id, { status: 'failed' });
        await repo.update(sCompleted.id, { status: 'completed' });

        const pending = await repo.getActivePending();
        expect(pending.length).toBe(0);
      });
    });

    // -----------------------------------------------------------------------
    // Updates
    // -----------------------------------------------------------------------
    describe('update()', () => {
      it('updates recipient, messageText, and recalculates partsCount', async () => {
        const created = await repo.create(sampleCreateInput);
        const longText = 'B'.repeat(165);

        const updated = await repo.update(created.id, {
          recipient: { name: 'Alice Cooper', phoneNumber: '+1 (555) 999-8888' },
          messageText: longText,
        });

        expect(updated.recipient.name).toBe('Alice Cooper');
        expect(updated.recipient.phoneNumber).toBe('+15559998888');
        expect(updated.messageText).toBe(longText);
        expect(updated.partsCount).toBe(2);
        expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(created.updatedAt).getTime()
        );
      });

      it('reschedules to a new future date and updates status', async () => {
        const created = await repo.create(sampleCreateInput);
        const updated = await repo.update(created.id, {
          scheduledAt: '2026-11-01T09:00:00Z',
          status: 'pending',
        });

        expect(updated.scheduledAt).toBe('2026-11-01T09:00:00Z');
        expect(updated.status).toBe('pending');
      });

      it('updates delivery status and error details', async () => {
        const created = await repo.create(sampleCreateInput);
        const updated = await repo.update(created.id, {
          status: 'failed',
          errorMessage: 'Carrier network unavailable',
          carrierErrorCode: 2,
          lastSentAt: '2026-10-01T14:30:05Z',
        });

        expect(updated.status).toBe('failed');
        expect(updated.errorMessage).toBe('Carrier network unavailable');
        expect(updated.carrierErrorCode).toBe(2);
        expect(updated.lastSentAt).toBe('2026-10-01T14:30:05Z');
      });

      it('preserves existing properties when empty update input is provided', async () => {
        const created = await repo.create(sampleCreateInput);
        const updated = await repo.update(created.id, {});

        expect(updated.recipient.name).toBe(created.recipient.name);
        expect(updated.recipient.phoneNumber).toBe(created.recipient.phoneNumber);
        expect(updated.messageText).toBe(created.messageText);
        expect(updated.scheduledAt).toBe(created.scheduledAt);
        expect(updated.status).toBe(created.status);
      });

      it('throws an error matching /not found/ when updating non-existent schedule', async () => {
        await expect(
          repo.update('non-existent-uuid', { messageText: 'New text' })
        ).rejects.toThrow(/not found/);
      });
    });

    // -----------------------------------------------------------------------
    // Deletion & Clearing
    // -----------------------------------------------------------------------
    describe('delete()', () => {
      it('deletes an existing schedule and returns true', async () => {
        const created = await repo.create(sampleCreateInput);
        const deleted = await repo.delete(created.id);

        expect(deleted).toBe(true);
        expect(await repo.getById(created.id)).toBeNull();
        expect((await repo.getAll()).length).toBe(0);
      });

      it('returns false when attempting to delete non-existent ID', async () => {
        const deleted = await repo.delete('non-existent-id');
        expect(deleted).toBe(false);
      });
    });

    describe('clearAll()', () => {
      it('removes all schedules from storage', async () => {
        await repo.create(sampleCreateInput);
        await repo.create({
          recipient: { name: 'Bob', phoneNumber: '5551234' },
          messageText: 'Msg 2',
          scheduledAt: '2026-10-02T10:00:00Z',
        });

        expect((await repo.getAll()).length).toBe(2);
        await repo.clearAll();
        expect((await repo.getAll()).length).toBe(0);
      });

      it('succeeds gracefully when clearAll is invoked on an already empty repository', async () => {
        await repo.clearAll();
        expect((await repo.getAll()).length).toBe(0);
      });
    });
  });

  // =========================================================================
  // AsyncStorage-Specific Behaviors (Key, Persistence, Concurrency, Failures)
  // =========================================================================
  describe('AsyncStorageScheduleRepository Specific Behaviors', () => {
    let mockStorage: ReturnType<typeof createInMemoryStorage>;
    let repo: AsyncStorageScheduleRepository;

    beforeEach(() => {
      mockStorage = createInMemoryStorage();
      repo = new AsyncStorageScheduleRepository(mockStorage);
    });

    it('persists data under the official storage key @sked_sms_schedules_v1', async () => {
      expect(SCHEDULE_STORAGE_KEY).toBe('@sked_sms_schedules_v1');

      await repo.create(sampleCreateInput);
      const rawStored = mockStorage.store.get('@sked_sms_schedules_v1');

      expect(rawStored).toBeDefined();
      const parsed = JSON.parse(rawStored!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].recipient.name).toBe('Alice Smith');
    });

    it('preserves data across separate repository instances sharing the same storage', async () => {
      const created = await repo.create(sampleCreateInput);

      // Create separate repository instance pointing to the same storage
      const secondInstance = new AsyncStorageScheduleRepository(mockStorage);
      const retrieved = await secondInstance.getById(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.messageText).toBe(sampleCreateInput.messageText);
    });

    it('handles concurrent creates atomically without dropping records', async () => {
      const tasks = Array.from({ length: 15 }, (_, i) =>
        repo.create({
          recipient: { name: `User ${i}`, phoneNumber: `555000${i}` },
          messageText: `Concurrent message ${i}`,
          scheduledAt: `2026-10-01T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
        })
      );

      const results = await Promise.all(tasks);
      expect(results.length).toBe(15);

      const all = await repo.getAll();
      expect(all.length).toBe(15);

      const uniqueIds = new Set(all.map(s => s.id));
      expect(uniqueIds.size).toBe(15);
    });

    it('handles concurrent updates and deletes safely', async () => {
      const s1 = await repo.create(sampleCreateInput);
      const s2 = await repo.create({
        recipient: { name: 'Bob', phoneNumber: '5552222' },
        messageText: 'Bob Msg',
        scheduledAt: '2026-10-02T10:00:00Z',
      });

      await Promise.all([
        repo.update(s1.id, { messageText: 'Updated parallel 1' }),
        repo.update(s2.id, { messageText: 'Updated parallel 2' }),
        repo.delete(s1.id),
      ]);

      const remaining = await repo.getAll();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(s2.id);
      expect(remaining[0].messageText).toBe('Updated parallel 2');
    });

    it('throws descriptive error on malformed/corrupted JSON in storage', async () => {
      mockStorage.store.set('@sked_sms_schedules_v1', '{ invalid json syntax');

      await expect(repo.getAll()).rejects.toThrow(
        /\[AsyncStorageScheduleRepository\] Failed to parse schedules from storage/
      );
    });

    it('throws descriptive error when storage read operation fails', async () => {
      const failingStorage: StorageAdapter = {
        async getItem() {
          throw new Error('Native disk I/O error');
        },
        async setItem() {},
        async removeItem() {},
      };

      const failingRepo = new AsyncStorageScheduleRepository(failingStorage);
      await expect(failingRepo.getAll()).rejects.toThrow(
        /\[AsyncStorageScheduleRepository\] Failed to read from storage: Native disk I\/O error/
      );
    });

    it('throws descriptive error when storage write operation fails', async () => {
      const failingStorage: StorageAdapter = {
        async getItem() {
          return '[]';
        },
        async setItem() {
          throw new Error('Disk full');
        },
        async removeItem() {},
      };

      const failingRepo = new AsyncStorageScheduleRepository(failingStorage);
      await expect(failingRepo.create(sampleCreateInput)).rejects.toThrow(
        /\[AsyncStorageScheduleRepository\] Failed to write to storage: Disk full/
      );
    });

    it('throws descriptive error when storage clear operation fails', async () => {
      const failingStorage: StorageAdapter = {
        async getItem() {
          return '[]';
        },
        async setItem() {},
        async removeItem() {
          throw new Error('Permission denied');
        },
      };

      const failingRepo = new AsyncStorageScheduleRepository(failingStorage);
      await expect(failingRepo.clearAll()).rejects.toThrow(
        /\[AsyncStorageScheduleRepository\] Failed to clear schedules: Permission denied/
      );
    });
  });
});
