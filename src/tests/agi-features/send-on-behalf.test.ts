/**
 * Send on Behalf Tests
 * Run: pnpm vitest run src/tests/agi-features/send-on-behalf.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb } from './index.js';

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => mockFirestoreDb) }));
vi.mock('../../services/automation/trust-level-system.js', () => ({
  checkActionPermission: vi
    .fn()
    .mockResolvedValue({ success: true, requiresApproval: true, pendingActionId: 'mock_123' }),
  markActionExecuted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/twilio-sms.js', () => ({
  sendSMS: vi.fn().mockResolvedValue('mock_sms_id'),
}));
vi.mock('../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'mock_email_id' }),
  isEmailDeliveryAvailable: vi.fn().mockReturnValue(true),
}));

import {
  sendMessageOnBehalf,
  getMessageHistory,
  type SendMessageRequest,
} from '../../services/automation/send-on-behalf.js';

describe('Send on Behalf', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('send');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
  });

  describe('Request Validation', () => {
    it('should reject request without userId', async () => {
      const request: SendMessageRequest = {
        userId: '',
        channel: 'sms',
        recipient: { name: 'John', phone: '+1234567890' },
        message: 'Hello',
      };
      const result = await sendMessageOnBehalf(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should reject SMS without phone number', async () => {
      const request: SendMessageRequest = {
        userId: testUserId,
        channel: 'sms',
        recipient: { name: 'John' },
        message: 'Hello',
      };
      const result = await sendMessageOnBehalf(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('phone');
    });

    it('should reject email without email address', async () => {
      const request: SendMessageRequest = {
        userId: testUserId,
        channel: 'email',
        recipient: { name: 'John' },
        message: 'Hello',
      };
      const result = await sendMessageOnBehalf(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('email');
    });

    it('should reject empty message', async () => {
      const request: SendMessageRequest = {
        userId: testUserId,
        channel: 'sms',
        recipient: { name: 'John', phone: '+1234567890' },
        message: '',
      };
      const result = await sendMessageOnBehalf(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('message');
    });

    it('should accept valid SMS request', async () => {
      const request: SendMessageRequest = {
        userId: testUserId,
        channel: 'sms',
        recipient: { name: 'John', phone: '+1234567890' },
        message: 'Hello',
      };
      const result = await sendMessageOnBehalf(request);
      expect(result.success).toBe(true);
    });

    it('should accept valid email request', async () => {
      const request: SendMessageRequest = {
        userId: testUserId,
        channel: 'email',
        recipient: { name: 'Jane', email: 'jane@test.com' },
        message: 'Hello',
      };
      const result = await sendMessageOnBehalf(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Approval Flow', () => {
    it('should require approval for new users', async () => {
      const request: SendMessageRequest = {
        userId: testUserId,
        channel: 'sms',
        recipient: { name: 'John', phone: '+1234567890' },
        message: 'Test',
      };
      const result = await sendMessageOnBehalf(request);
      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.pendingActionId).toBeDefined();
    });
  });

  describe('Message History', () => {
    it('should return empty array for user with no history', async () => {
      const history = await getMessageHistory(testUserId);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
