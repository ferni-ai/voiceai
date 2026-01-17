/**
 * Family Messages Service Tests
 *
 * Tests for the family messages service.
 *
 * Run with: pnpm vitest run src/tests/family-messages.test.ts
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore
const mockFirestore = {
  collection: vi.fn().mockReturnThis(),
  doc: vi.fn().mockReturnThis(),
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};

vi.mock('../memory/firestore-factory.js', () => ({
  getFirestore: () => mockFirestore,
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

import {
  createFamilyMessage,
  formatMessageForDelivery,
  formatMessagesForDelivery,
  type FamilyMessage,
} from '../services/family/family-messages.js';

describe('Family Messages Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFamilyMessage', () => {
    it('should create a message with correct fields', async () => {
      const message = await createFamilyMessage({
        fromIdentityId: 'sponsored_123',
        fromName: 'Mom',
        fromRelationship: 'mother',
        toUserId: 'user_456',
        messageType: 'text',
        content: "I'm thinking of you",
      });

      expect(message).toBeDefined();
      expect(message.id).toMatch(/^fmsg_/);
      expect(message.fromIdentityId).toBe('sponsored_123');
      expect(message.fromName).toBe('Mom');
      expect(message.fromRelationship).toBe('mother');
      expect(message.toUserId).toBe('user_456');
      expect(message.messageType).toBe('text');
      expect(message.content).toBe("I'm thinking of you");
      expect(message.status).toBe('pending');
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    it('should include optional fields when provided', async () => {
      const message = await createFamilyMessage({
        fromIdentityId: 'sponsored_123',
        fromName: 'Mom',
        fromRelationship: 'mother',
        toUserId: 'user_456',
        messageType: 'voice',
        content: 'Voice transcription',
        audioUrl: 'https://example.com/audio.mp3',
        sourceSessionId: 'session_789',
        emotionalContext: 'She sounded happy',
      });

      expect(message.audioUrl).toBe('https://example.com/audio.mp3');
      expect(message.sourceSessionId).toBe('session_789');
      expect(message.emotionalContext).toBe('She sounded happy');
    });
  });

  describe('formatMessageForDelivery', () => {
    it('should format a simple message', () => {
      const message: FamilyMessage = {
        id: 'fmsg_1',
        fromIdentityId: 'sponsored_123',
        fromName: 'Mom',
        fromRelationship: 'mother',
        toUserId: 'user_456',
        messageType: 'text',
        content: "I'm thinking of you",
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        status: 'pending',
      };

      const formatted = formatMessageForDelivery(message);

      expect(formatted).toContain('Your mom Mom');
      expect(formatted).toContain("I'm thinking of you");
      expect(formatted).toContain('5 minutes ago');
    });

    it('should include emotional context when present', () => {
      const message: FamilyMessage = {
        id: 'fmsg_1',
        fromIdentityId: 'sponsored_123',
        fromName: 'Mom',
        fromRelationship: 'mother',
        toUserId: 'user_456',
        messageType: 'text',
        content: 'Call me when you can',
        emotionalContext: 'She seemed a bit worried',
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        status: 'pending',
      };

      const formatted = formatMessageForDelivery(message);

      expect(formatted).toContain('She seemed a bit worried');
    });

    it('should format different relationships correctly', () => {
      const dadMessage: FamilyMessage = {
        id: 'fmsg_1',
        fromIdentityId: 'sponsored_123',
        fromName: 'Dad',
        fromRelationship: 'father',
        toUserId: 'user_456',
        messageType: 'text',
        content: 'Hello!',
        createdAt: new Date(),
        status: 'pending',
      };

      const formatted = formatMessageForDelivery(dadMessage);
      expect(formatted).toContain('Your dad Dad');
    });
  });

  describe('formatMessagesForDelivery', () => {
    it('should return empty string for no messages', () => {
      const formatted = formatMessagesForDelivery([]);
      expect(formatted).toBe('');
    });

    it('should format single message correctly', () => {
      const messages: FamilyMessage[] = [
        {
          id: 'fmsg_1',
          fromIdentityId: 'sponsored_123',
          fromName: 'Mom',
          fromRelationship: 'mother',
          toUserId: 'user_456',
          messageType: 'text',
          content: 'Hello!',
          createdAt: new Date(),
          status: 'pending',
        },
      ];

      const formatted = formatMessagesForDelivery(messages);
      expect(formatted).toContain('Hello!');
    });

    it('should format multiple messages with intro', () => {
      const messages: FamilyMessage[] = [
        {
          id: 'fmsg_1',
          fromIdentityId: 'sponsored_123',
          fromName: 'Mom',
          fromRelationship: 'mother',
          toUserId: 'user_456',
          messageType: 'text',
          content: 'Hello from mom!',
          createdAt: new Date(),
          status: 'pending',
        },
        {
          id: 'fmsg_2',
          fromIdentityId: 'sponsored_456',
          fromName: 'Dad',
          fromRelationship: 'father',
          toUserId: 'user_456',
          messageType: 'text',
          content: 'Hello from dad!',
          createdAt: new Date(),
          status: 'pending',
        },
      ];

      const formatted = formatMessagesForDelivery(messages);
      expect(formatted).toContain('couple of messages');
      expect(formatted).toContain('Hello from mom!');
      expect(formatted).toContain('Hello from dad!');
    });

    it('should use proper intro for 3+ messages', () => {
      const messages: FamilyMessage[] = [
        {
          id: 'fmsg_1',
          fromIdentityId: 'sponsored_123',
          fromName: 'Mom',
          fromRelationship: 'mother',
          toUserId: 'user_456',
          messageType: 'text',
          content: 'Message 1',
          createdAt: new Date(),
          status: 'pending',
        },
        {
          id: 'fmsg_2',
          fromIdentityId: 'sponsored_456',
          fromName: 'Dad',
          fromRelationship: 'father',
          toUserId: 'user_456',
          messageType: 'text',
          content: 'Message 2',
          createdAt: new Date(),
          status: 'pending',
        },
        {
          id: 'fmsg_3',
          fromIdentityId: 'sponsored_789',
          fromName: 'Grandma',
          fromRelationship: 'grandmother',
          toUserId: 'user_456',
          messageType: 'text',
          content: 'Message 3',
          createdAt: new Date(),
          status: 'pending',
        },
      ];

      const formatted = formatMessagesForDelivery(messages);
      expect(formatted).toContain('3 messages');
    });
  });
});
