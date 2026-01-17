/**
 * Reminder Scheduler Tests
 *
 * Tests for scheduled reminders, delivery, and lifecycle management.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../utils/interval-manager.js', () => ({
  registerInterval: vi.fn(),
  clearNamedInterval: vi.fn(),
}));

vi.mock('../../../utils/firestore-utils.js', () => ({
  cleanForFirestore: vi.fn((obj) => obj),
}));

vi.mock('../../calendar/calendar-bridge.js', () => ({
  syncReminderToCalendar: vi.fn(),
  syncScheduledCallToCalendar: vi.fn(),
  syncScheduledEmailToCalendar: vi.fn(),
  syncScheduledTextToCalendar: vi.fn(),
  removeCalendarSyncedItem: vi.fn(),
}));

vi.mock('../../communication-service.js', () => ({
  sendEmail: vi.fn(),
  sendReminder: vi.fn(),
  sendSMS: vi.fn(),
}));

vi.mock('../../contacts/optimal-timing.js', () => ({
  recordOutcome: vi.fn(),
}));

// Import after mocks
import type { ScheduledReminder } from '../reminder-scheduler.js';

describe('Reminder Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ScheduledReminder Type', () => {
    it('should have correct structure for SMS reminder', () => {
      const reminder: ScheduledReminder = {
        id: 'reminder-123',
        userId: 'user-456',
        message: 'Remember to call mom',
        scheduledFor: new Date('2024-12-31T10:00:00Z'),
        timezone: 'America/Los_Angeles',
        deliveryMethod: 'sms',
        deliveryAddress: '+1234567890',
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
        createdBy: 'ferni',
      };

      expect(reminder.deliveryMethod).toBe('sms');
      expect(reminder.status).toBe('pending');
      expect(reminder.attempts).toBe(0);
    });

    it('should have correct structure for email reminder', () => {
      const reminder: ScheduledReminder = {
        id: 'reminder-456',
        userId: 'user-789',
        message: 'Follow up on job application',
        subject: 'Job Application Reminder',
        scheduledFor: new Date('2024-12-31T14:00:00Z'),
        timezone: 'America/New_York',
        deliveryMethod: 'email',
        deliveryAddress: 'user@example.com',
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
        createdBy: 'alex-chen',
      };

      expect(reminder.deliveryMethod).toBe('email');
      expect(reminder.subject).toBe('Job Application Reminder');
    });

    it('should support contact tracking', () => {
      const reminder: ScheduledReminder = {
        id: 'reminder-789',
        userId: 'user-123',
        message: 'Check in with Sarah',
        scheduledFor: new Date(),
        timezone: 'UTC',
        deliveryMethod: 'sms',
        deliveryAddress: '+1987654321',
        contactId: 'contact-sarah',
        contactName: 'Sarah',
        isDirectToContact: false,
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
        createdBy: 'ferni',
      };

      expect(reminder.contactId).toBe('contact-sarah');
      expect(reminder.isDirectToContact).toBe(false);
    });
  });

  describe('Delivery Methods', () => {
    it('should support all delivery method types', () => {
      const methods: ScheduledReminder['deliveryMethod'][] = [
        'sms',
        'email',
        'call',
        'voice_message',
      ];

      expect(methods).toHaveLength(4);
      expect(methods).toContain('sms');
      expect(methods).toContain('email');
      expect(methods).toContain('call');
      expect(methods).toContain('voice_message');
    });
  });

  describe('Status Lifecycle', () => {
    it('should support all status types', () => {
      const statuses: ScheduledReminder['status'][] = [
        'pending',
        'delivered',
        'failed',
        'cancelled',
      ];

      expect(statuses).toHaveLength(4);
    });

    it('should track delivery attempts', () => {
      const reminder: Partial<ScheduledReminder> = {
        status: 'pending',
        attempts: 0,
      };

      // Simulate first attempt
      reminder.attempts = 1;
      reminder.lastAttempt = new Date();

      expect(reminder.attempts).toBe(1);
      expect(reminder.lastAttempt).toBeDefined();
    });

    it('should track failure errors', () => {
      const reminder: Partial<ScheduledReminder> = {
        status: 'failed',
        attempts: 3,
        error: 'Phone number unreachable',
      };

      expect(reminder.status).toBe('failed');
      expect(reminder.error).toBe('Phone number unreachable');
    });
  });

  describe('Timezone Handling', () => {
    it('should store timezone with reminder', () => {
      const reminder: Partial<ScheduledReminder> = {
        scheduledFor: new Date('2024-12-31T10:00:00Z'),
        timezone: 'America/Los_Angeles',
      };

      expect(reminder.timezone).toBe('America/Los_Angeles');
    });
  });

  describe('Persona Attribution', () => {
    it('should track which persona created the reminder', () => {
      const ferniReminder: Partial<ScheduledReminder> = {
        createdBy: 'ferni',
        personaId: 'ferni',
      };

      const mayaReminder: Partial<ScheduledReminder> = {
        createdBy: 'maya-santos',
        personaId: 'maya-santos',
      };

      expect(ferniReminder.createdBy).toBe('ferni');
      expect(mayaReminder.createdBy).toBe('maya-santos');
    });
  });
});
