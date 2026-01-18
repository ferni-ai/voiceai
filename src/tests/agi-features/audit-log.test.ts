/**
 * Audit Log Tests
 * Run: pnpm vitest run src/tests/agi-features/audit-log.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb } from './index.js';

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => mockFirestoreDb) }));

import {
  logAction, markApproved, markRejected, markExecuted, queryAuditLog, getAuditSummary,
  logMessagingAction, logCalendarAction, logBookingAction,
} from '../../services/automation/audit-log.js';

describe('Audit Log', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('audit');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
  });

  describe('logAction', () => {
    it('should create audit entry with required fields', async () => {
      const entry = await logAction({
        userId: testUserId, category: 'messaging', actionType: 'send_sms',
        description: 'Send SMS', status: 'pending', requestedBy: 'ferni',
        approvalRequired: true, canUndo: false,
      });
      expect(entry.id).toBeDefined();
      expect(entry.id).toMatch(/^audit_/);
      expect(entry.userId).toBe(testUserId);
      expect(entry.requestedAt).toBeDefined();
    });
  });

  describe('Status Transitions', () => {
    it('should mark entry as approved', async () => {
      const entry = await logAction({
        userId: testUserId, category: 'messaging', actionType: 'send_email',
        description: 'Send email', status: 'pending', requestedBy: 'ferni',
        approvalRequired: true, canUndo: false,
      });
      await markApproved(testUserId, entry.id, 'ui');
    });

    it('should mark entry as rejected', async () => {
      const entry = await logAction({
        userId: testUserId, category: 'calendar', actionType: 'create_event',
        description: 'Create event', status: 'pending', requestedBy: 'ferni',
        approvalRequired: true, canUndo: true,
      });
      await markRejected(testUserId, entry.id);
    });

    it('should mark entry as executed', async () => {
      const entry = await logAction({
        userId: testUserId, category: 'smart_home', actionType: 'control_lights',
        description: 'Turn on lights', status: 'approved', requestedBy: 'user',
        approvalRequired: false, canUndo: true,
      });
      await markExecuted(testUserId, entry.id, 'success', 150);
    });
  });

  describe('queryAuditLog', () => {
    it('should return empty array for user with no entries', async () => {
      const entries = await queryAuditLog({ userId: testUserId });
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('getAuditSummary', () => {
    it('should return summary with all required fields', async () => {
      const summary = await getAuditSummary(testUserId);
      expect(summary).toHaveProperty('totalActions');
      expect(summary).toHaveProperty('byStatus');
      expect(summary).toHaveProperty('failureRate');
    });
  });

  describe('Convenience Functions', () => {
    it('should log SMS action', async () => {
      const entry = await logMessagingAction(testUserId, 'send_sms', 'John', 'ferni', true);
      expect(entry.category).toBe('messaging');
      expect(entry.actionType).toBe('send_sms');
    });

    it('should log calendar action', async () => {
      const entry = await logCalendarAction(testUserId, 'create_event', 'Meeting', 'ferni', true);
      expect(entry.category).toBe('calendar');
    });

    it('should log booking action', async () => {
      const entry = await logBookingAction(testUserId, 'book_restaurant', 'Dinner', 75.00, 'ferni');
      expect(entry.category).toBe('booking');
      expect(entry.monetaryValue).toBe(75.00);
    });
  });
});
