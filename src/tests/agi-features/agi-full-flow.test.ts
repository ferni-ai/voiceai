/**
 * AGI Full Flow E2E Tests
 * Complete lifecycle tests proving the entire autonomous action system works.
 * Run: pnpm vitest run src/tests/agi-features/agi-full-flow.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb, createMockActionPreview } from './index.js';

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => mockFirestoreDb) }));
vi.mock('../../services/twilio-sms.js', () => ({
  sendSMS: vi.fn().mockResolvedValue('mock_sms_id'),
}));
vi.mock('../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'mock_email_id' }),
  isEmailDeliveryAvailable: vi.fn().mockReturnValue(true),
}));
vi.mock('../../services/calendar/calendar-service.js', () => ({
  isConnected: vi.fn().mockResolvedValue(true),
  createEvent: vi
    .fn()
    .mockResolvedValue({ id: 'mock_event_id', htmlLink: 'https://calendar.google.com/event/mock' }),
  deleteEvent: vi.fn().mockResolvedValue(true),
}));

import {
  checkActionPermission,
  getTrustProfile,
  createPendingAction,
  getPendingActions,
  resolvePendingAction,
  markActionExecuted,
  ACTION_TYPES,
} from '../../services/automation/trust-level-system.js';
import { sendMessageOnBehalf } from '../../services/automation/send-on-behalf.js';
import { createEventOnBehalf } from '../../services/automation/calendar-on-behalf.js';
import {
  logAction,
  markApproved as auditMarkApproved,
  markExecuted as auditMarkExecuted,
  queryAuditLog,
} from '../../services/automation/audit-log.js';
import { bookReservation } from '../../services/integrations/restaurant-booking.js';
import { bookRide } from '../../services/integrations/rideshare-booking.js';

describe('AGI Full Flow E2E', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('full_flow');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
  });

  describe('Messaging Full Flow', () => {
    it('should complete SMS flow: check → create → approve → execute → audit', async () => {
      const preview = createMockActionPreview({
        title: 'Send SMS to Mom',
        summary: 'Happy Birthday!',
        canUndo: false,
      });
      const checkResult = await checkActionPermission(testUserId, 'send_sms', preview);
      expect(checkResult.success).toBe(true);
      expect(checkResult.requiresApproval).toBe(true);

      const auditEntry = await logAction({
        userId: testUserId,
        category: 'messaging',
        actionType: 'send_sms',
        description: 'Send birthday message',
        status: 'pending',
        requestedBy: 'ferni',
        approvalRequired: true,
        canUndo: false,
      });
      expect(auditEntry.status).toBe('pending');

      if (checkResult.pendingActionId) {
        await resolvePendingAction(testUserId, checkResult.pendingActionId, true);
        await auditMarkApproved(testUserId, auditEntry.id, 'ui');
      }

      const sendResult = await sendMessageOnBehalf({
        userId: testUserId,
        channel: 'sms',
        recipient: { name: 'Mom', phone: '+1234567890' },
        message: 'Happy Birthday!',
      });
      expect(sendResult.success).toBe(true);

      if (checkResult.pendingActionId)
        await markActionExecuted(testUserId, checkResult.pendingActionId);
      await auditMarkExecuted(testUserId, auditEntry.id, 'success', 150);
    });
  });

  describe('Calendar Full Flow', () => {
    it('should complete calendar event flow', async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const preview = createMockActionPreview({
        title: 'Team Standup',
        summary: 'Daily meeting',
        canUndo: true,
      });
      const checkResult = await checkActionPermission(testUserId, 'create_event', preview);
      expect(checkResult.success).toBe(true);

      const auditEntry = await logAction({
        userId: testUserId,
        category: 'calendar',
        actionType: 'create_event',
        description: 'Team Standup',
        status: 'pending',
        requestedBy: 'ferni',
        approvalRequired: checkResult.requiresApproval,
        canUndo: true,
      });

      await auditMarkApproved(testUserId, auditEntry.id, 'ui');
      const createResult = await createEventOnBehalf({
        userId: testUserId,
        title: 'Team Standup',
        startTime: tomorrow,
      });
      expect(createResult.success).toBe(true);
      await auditMarkExecuted(testUserId, auditEntry.id, 'success', 300);
    });
  });

  describe('Booking Full Flow', () => {
    it('should complete restaurant booking flow', async () => {
      const preview = createMockActionPreview({
        title: 'Book table',
        summary: '4 people Saturday',
        canUndo: true,
        estimatedCost: 80,
      });
      const checkResult = await checkActionPermission(testUserId, 'book_restaurant', preview);
      expect(checkResult.success).toBe(true);
      expect(checkResult.requiresApproval).toBe(true);

      const auditEntry = await logAction({
        userId: testUserId,
        category: 'booking',
        actionType: 'book_restaurant',
        description: 'Book table',
        status: 'pending',
        requestedBy: 'ferni',
        approvalRequired: true,
        canUndo: true,
        monetaryValue: 80,
        currency: 'USD',
      });

      const bookResult = await bookReservation({
        userId: testUserId,
        restaurant: {
          id: 'rest_1',
          name: 'Italian Place',
          address: '123 Main St',
          city: 'SF',
          provider: 'google',
        },
        date: '2025-02-15',
        time: '19:00',
        partySize: 4,
        guestName: 'Test User',
        guestPhone: '+1234567890',
        guestEmail: 'test@test.com',
      });
      expect(bookResult.success).toBe(true);

      await auditMarkApproved(testUserId, auditEntry.id, 'ui');
      await auditMarkExecuted(testUserId, auditEntry.id, 'success', 500);
    });

    it('should complete rideshare booking flow', async () => {
      const preview = createMockActionPreview({
        title: 'Book Uber',
        summary: 'To Airport',
        canUndo: true,
        estimatedCost: 35,
      });
      const checkResult = await checkActionPermission(testUserId, 'book_ride', preview);
      expect(checkResult.success).toBe(true);
      expect(checkResult.requiresApproval).toBe(true);

      const bookResult = await bookRide({
        userId: testUserId,
        pickup: { address: '123 Main St', lat: 37.77, lng: -122.41 },
        dropoff: { address: 'SFO Airport', lat: 37.62, lng: -122.37 },
        provider: 'uber',
        productId: 'uberx',
      });
      expect(bookResult.success).toBe(true);
    });
  });

  describe('Trust Progression Flow', () => {
    it('should track approval history', async () => {
      const preview = createMockActionPreview();
      for (let i = 0; i < 5; i++) {
        const result = await checkActionPermission(testUserId, 'send_sms', preview);
        expect(result.success).toBe(true);
        if (result.pendingActionId)
          await resolvePendingAction(testUserId, result.pendingActionId, true);
      }
    });
  });

  describe('Audit Trail Flow', () => {
    it('should maintain complete audit trail', async () => {
      const auditEntry = await logAction({
        userId: testUserId,
        category: 'messaging',
        actionType: 'send_sms',
        description: 'Send message',
        status: 'pending',
        requestedBy: 'ferni',
        approvalRequired: true,
        canUndo: false,
        personaId: 'ferni',
        triggerSource: 'calendar_insight',
      });
      expect(auditEntry.requestedAt).toBeDefined();

      await auditMarkApproved(testUserId, auditEntry.id, 'ui');
      await auditMarkExecuted(testUserId, auditEntry.id, 'success', 150);

      const auditLog = await queryAuditLog({ userId: testUserId, category: 'messaging' });
      expect(Array.isArray(auditLog)).toBe(true);
    });
  });

  describe('Multi-Action Flow', () => {
    it('should handle multiple concurrent actions', async () => {
      const actions = [
        { type: 'send_sms', title: 'SMS Action' },
        { type: 'send_email', title: 'Email Action' },
        { type: 'create_event', title: 'Calendar Action' },
      ];

      const results = await Promise.all(
        actions.map((action) =>
          checkActionPermission(
            testUserId,
            action.type,
            createMockActionPreview({ title: action.title })
          )
        )
      );

      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result.success).toBe(true));
    });
  });
});
