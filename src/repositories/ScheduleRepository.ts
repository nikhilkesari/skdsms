/**
 * Sked SMS — Persistence Repository Interface Contract
 * Target: src/repositories/ScheduleRepository.ts
 */

import type {
  ScheduledMessage,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '../types/schedule';

export const SCHEDULE_STORAGE_KEY = '@sked_sms_schedules_v1';

export interface ScheduleRepository {
  /**
   * Retrieves all scheduled messages stored in the repository,
   * sorted chronologically by scheduledAt ascending.
   */
  getAll(): Promise<ScheduledMessage[]>;

  /**
   * Retrieves a single scheduled message by its unique ID.
   * Returns null if not found.
   */
  getById(id: string): Promise<ScheduledMessage | null>;

  /**
   * Retrieves all scheduled messages whose status is 'pending',
   * sorted chronologically by scheduledAt ascending.
   */
  getActivePending(): Promise<ScheduledMessage[]>;

  /**
   * Creates and persists a new scheduled message.
   * Generates a unique UUID v4, computes alarmRequestCode,
   * calculates partsCount, normalizes the recipient phone number,
   * and sets createdAt and updatedAt timestamps.
   */
  create(input: CreateScheduleInput): Promise<ScheduledMessage>;

  /**
   * Updates an existing scheduled message by ID.
   * Throws an Error matching /not found/ if the schedule does not exist.
   * Updates updatedAt timestamp and recalculates partsCount if messageText is modified.
   */
  update(id: string, input: UpdateScheduleInput): Promise<ScheduledMessage>;

  /**
   * Deletes a scheduled message by ID.
   * Returns true if deleted, or false if not found.
   */
  delete(id: string): Promise<boolean>;

  /**
   * Removes all scheduled messages from persistence.
   */
  clearAll(): Promise<void>;
}
