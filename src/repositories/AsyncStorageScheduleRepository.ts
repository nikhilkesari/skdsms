/**
 * Sked SMS — AsyncStorage Schedule Repository Implementation
 * Target: src/repositories/AsyncStorageScheduleRepository.ts
 *
 * Implements persistent storage for schedules using React Native AsyncStorage.
 * Features:
 * - Storage key: @sked_sms_schedules_v1
 * - Atomic serialized reads/writes via in-process async queue mutex
 * - Defensive error handling and JSON validation
 * - Dependency injection for testing and alternative storage engines
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import type {
  ScheduledMessage,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '../types/schedule';
import type { ScheduleRepository } from './ScheduleRepository';
import { SCHEDULE_STORAGE_KEY } from './ScheduleRepository';
import { normalizePhoneNumber } from '../utils/validation';
import { calculateSmsSegments } from '../utils/smsCalculator';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear?(): Promise<void>;
}

const memoryFallbackMap = new Map<string, string>();

export const defaultStorageAdapter: StorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const module = NativeModules.LocalStorageModule;
    if (module && typeof module.getItem === 'function') {
      try {
        const val = await module.getItem(key);
        return val ?? null;
      } catch {
        return memoryFallbackMap.get(key) ?? null;
      }
    }
    try {
      if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
        const val = await AsyncStorage.getItem(key);
        return val ?? null;
      }
    } catch {
      // Ignore null native module in release
    }
    return memoryFallbackMap.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const module = NativeModules.LocalStorageModule;
    if (module && typeof module.setItem === 'function') {
      try {
        await module.setItem(key, value);
        return;
      } catch {
        memoryFallbackMap.set(key, value);
        return;
      }
    }
    try {
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(key, value);
        return;
      }
    } catch {
      // Ignore null native module in release
    }
    memoryFallbackMap.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    const module = NativeModules.LocalStorageModule;
    if (module && typeof module.removeItem === 'function') {
      try {
        await module.removeItem(key);
        return;
      } catch {
        memoryFallbackMap.delete(key);
        return;
      }
    }
    try {
      if (AsyncStorage && typeof AsyncStorage.removeItem === 'function') {
        await AsyncStorage.removeItem(key);
        return;
      }
    } catch {
      // Ignore null native module in release
    }
    memoryFallbackMap.delete(key);
  },
  async clear(): Promise<void> {
    const module = NativeModules.LocalStorageModule;
    if (module && typeof module.clear === 'function') {
      try {
        await module.clear();
        return;
      } catch {
        memoryFallbackMap.clear();
        return;
      }
    }
    try {
      if (AsyncStorage && typeof AsyncStorage.clear === 'function') {
        await AsyncStorage.clear();
        return;
      }
    } catch {
      // Ignore null native module
    }
    memoryFallbackMap.clear();
  },
};

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function computeAlarmRequestCode(id: string): number {
  return Math.abs(hashCode(id)) % 2147483647;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Sequential queue lock to ensure atomic read-modify-write cycles
 */
class AsyncLock {
  private queue: Promise<any> = Promise.resolve();
  private pending = 0;

  acquire<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;
    const next = this.queue.then(fn, fn);
    this.queue = next
      .catch(() => {})
      .finally(() => {
        this.pending--;
        if (this.pending === 0) {
          this.queue = Promise.resolve();
        }
      });
    return next;
  }
}

export class AsyncStorageScheduleRepository implements ScheduleRepository {
  private readonly storage: StorageAdapter;
  private readonly storageKey: string;
  private readonly lock = new AsyncLock();

  constructor(
    storage: StorageAdapter = defaultStorageAdapter,
    storageKey: string = SCHEDULE_STORAGE_KEY
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  async getAll(): Promise<ScheduledMessage[]> {
    return this.lock.acquire(async () => {
      const items = await this.readItems();
      return items.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    });
  }

  async getById(id: string): Promise<ScheduledMessage | null> {
    return this.lock.acquire(async () => {
      const items = await this.readItems();
      const found = items.find(s => s.id === id);
      return found ? { ...found } : null;
    });
  }

  async getActivePending(): Promise<ScheduledMessage[]> {
    return this.lock.acquire(async () => {
      const items = await this.readItems();
      return items
        .filter(s => s.status === 'pending')
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    });
  }

  async create(input: CreateScheduleInput): Promise<ScheduledMessage> {
    return this.lock.acquire(async () => {
      const items = await this.readItems();

      const id = generateUUID();
      const now = new Date().toISOString();
      const alarmRequestCode = computeAlarmRequestCode(id);
      const partsCount = calculateSmsSegments(input.messageText).segmentCount;

      const schedule: ScheduledMessage = {
        id,
        recipient: {
          name: input.recipient.name.trim(),
          phoneNumber: normalizePhoneNumber(input.recipient.phoneNumber),
        },
        messageText: input.messageText,
        scheduledAt: input.scheduledAt,
        recurrence: input.recurrence ?? { type: 'none' },
        status: 'pending',
        alarmRequestCode,
        createdAt: now,
        updatedAt: now,
        lastSentAt: null,
        errorMessage: null,
        carrierErrorCode: null,
        partsCount,
      };

      items.push(schedule);
      await this.writeItems(items);
      return { ...schedule };
    });
  }

  async update(id: string, input: UpdateScheduleInput): Promise<ScheduledMessage> {
    return this.lock.acquire(async () => {
      const items = await this.readItems();
      const index = items.findIndex(s => s.id === id);

      if (index === -1) {
        throw new Error(`Schedule with id ${id} not found.`);
      }

      const existing = items[index];

      let recipient = { ...existing.recipient };
      if (input.recipient) {
        recipient = {
          name: input.recipient.name.trim(),
          phoneNumber: normalizePhoneNumber(input.recipient.phoneNumber),
        };
      } else {
        if (input.phoneNumber !== undefined) {
          recipient.phoneNumber = normalizePhoneNumber(input.phoneNumber);
        }
        if (input.recipientName !== undefined) {
          recipient.name = input.recipientName.trim();
        }
      }

      const partsCount = input.messageText !== undefined
        ? calculateSmsSegments(input.messageText).segmentCount
        : existing.partsCount;

      const updated: ScheduledMessage = {
        ...existing,
        recipient,
        messageText: input.messageText !== undefined ? input.messageText : existing.messageText,
        scheduledAt: input.scheduledAt !== undefined ? input.scheduledAt : existing.scheduledAt,
        recurrence: input.recurrence !== undefined ? input.recurrence : existing.recurrence,
        status: input.status !== undefined ? input.status : existing.status,
        updatedAt: new Date().toISOString(),
        lastSentAt: input.lastSentAt !== undefined ? input.lastSentAt : existing.lastSentAt,
        errorMessage: input.errorMessage !== undefined ? input.errorMessage : existing.errorMessage,
        carrierErrorCode: input.carrierErrorCode !== undefined ? input.carrierErrorCode : existing.carrierErrorCode,
        partsCount,
      };

      items[index] = updated;
      await this.writeItems(items);
      return { ...updated };
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.lock.acquire(async () => {
      const items = await this.readItems();
      const index = items.findIndex(s => s.id === id);

      if (index === -1) {
        return false;
      }

      items.splice(index, 1);
      await this.writeItems(items);
      return true;
    });
  }

  async clearAll(): Promise<void> {
    return this.lock.acquire(async () => {
      try {
        await this.storage.removeItem(this.storageKey);
      } catch (error) {
        throw new Error(`[AsyncStorageScheduleRepository] Failed to clear schedules: ${(error as Error).message}`);
      }
    });
  }

  private async readItems(): Promise<ScheduledMessage[]> {
    let raw: string | null;
    try {
      raw = await this.storage.getItem(this.storageKey);
    } catch (error) {
      throw new Error(`[AsyncStorageScheduleRepository] Failed to read from storage: ${(error as Error).message}`);
    }

    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as ScheduledMessage[];
    } catch (error) {
      throw new Error(`[AsyncStorageScheduleRepository] Failed to parse schedules from storage: ${(error as Error).message}`);
    }
  }

  private async writeItems(items: ScheduledMessage[]): Promise<void> {
    let serialized: string;
    try {
      serialized = JSON.stringify(items);
    } catch (error) {
      throw new Error(`[AsyncStorageScheduleRepository] Failed to serialize schedules: ${(error as Error).message}`);
    }

    try {
      await this.storage.setItem(this.storageKey, serialized);
    } catch (error) {
      throw new Error(`[AsyncStorageScheduleRepository] Failed to write to storage: ${(error as Error).message}`);
    }
  }
}
