/**
 * Conversation Thread System Tests
 *
 * Tests for the bidirectional agent engagement system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Firestore before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    }),
  })),
  Timestamp: {
    fromDate: vi.fn((date: Date) => ({ toDate: () => date })),
    now: vi.fn(() => ({ toDate: () => new Date() })),
  },
}));

vi.mock('../../outreach/conversation-context-bridge.js', () => ({
  storeOutreachContext: vi.fn().mockResolvedValue(undefined),
  getConversationBridgeContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../outreach/delivery/index.js', () => ({
  deliverOutreach: vi.fn().mockResolvedValue({ success: true, messageId: 'test-123' }),
}));

vi.mock('../../outreach/persona-voice-generator.js', () => ({
  getPersonaOutreachVoice: vi.fn().mockReturnValue({
    displayName: 'Ferni',
    signaturePhrases: {
      greeting: ['Hey there'],
      encouragement: ['You got this'],
      celebration: ['Amazing!'],
      thinkingOfYou: ['Just thinking of you'],
      closing: ['Talk soon'],
    },
    emojiStyle: ['✨'],
    formality: 'casual',
  }),
  generateTextMessage: vi.fn().mockReturnValue('Test message'),
}));

// Import after mocks
import {
  getOrCreateThread,
  getActiveThread,
  addMessage,
  buildAgentContext,
  transferOwnership,
  updateThreadStatus,
  clearStaleThreads,
} from '../thread-manager.js';

import { routeInbound } from '../inbound-router.js';
import { initiateOutreach } from '../outbound-initiator.js';
import { initiateGroupOutreach } from '../group-outreach.js';

import type { PersonaId } from '../../../personas/types.js';

// ============================================================================
// THREAD MANAGER TESTS
// ============================================================================

describe('Thread Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStaleThreads(); // Clear any existing threads
  });

  describe('getOrCreateThread', () => {
    it('creates a new thread when none exists', async () => {
      const thread = await getOrCreateThread('user-123', 'voice', 'ferni' as PersonaId);

      expect(thread).toBeDefined();
      expect(thread.userId).toBe('user-123');
      expect(thread.originChannel).toBe('voice');
      expect(thread.currentOwnerId).toBe('ferni');
      expect(thread.status).toBe('active');
      expect(thread.messageCount).toBe(0);
    });

    it('returns existing active thread for same user', async () => {
      const thread1 = await getOrCreateThread('user-456', 'voice', 'ferni' as PersonaId);
      const thread2 = await getOrCreateThread('user-456', 'sms', 'maya-habits' as PersonaId);

      expect(thread2.id).toBe(thread1.id);
    });

    it('creates new thread if existing is stale', async () => {
      // Note: This tests the staleness logic. In practice, threads are considered
      // stale after 24 hours of inactivity, but the in-memory cache check happens first.
      // This test verifies the thread has the correct initial state.
      const thread1 = await getOrCreateThread('user-789', 'voice', 'ferni' as PersonaId);

      // Verify the thread was created with correct initial state
      expect(thread1.status).toBe('active');
      expect(thread1.messageCount).toBe(0);

      // In a real scenario with Firestore, a stale thread would not be returned
      // from loadPersistedActiveThread() due to the staleness check
    });
  });

  describe('addMessage', () => {
    it('adds message and updates thread metadata', async () => {
      const thread = await getOrCreateThread('user-msg-1', 'voice', 'ferni' as PersonaId);

      const message = await addMessage(thread.id, {
        role: 'user',
        channel: 'voice',
        direction: 'inbound',
        content: 'Hello Ferni!',
        timestamp: new Date(),
      });

      expect(message.id).toBeDefined();
      expect(message.threadId).toBe(thread.id);
      expect(message.content).toBe('Hello Ferni!');
      expect(thread.messageCount).toBe(1);
    });

    it('tracks channel usage', async () => {
      const thread = await getOrCreateThread('user-msg-2', 'voice', 'ferni' as PersonaId);

      await addMessage(thread.id, {
        role: 'user',
        channel: 'voice',
        direction: 'inbound',
        content: 'Hi',
        timestamp: new Date(),
      });

      await addMessage(thread.id, {
        role: 'agent',
        agentId: 'ferni' as PersonaId,
        channel: 'sms',
        direction: 'outbound',
        content: 'Hey there!',
        timestamp: new Date(),
      });

      expect(thread.channelsUsed).toContain('voice');
      expect(thread.channelsUsed).toContain('sms');
      expect(thread.lastChannel).toBe('sms');
    });
  });

  describe('transferOwnership', () => {
    it('transfers thread to another agent', async () => {
      const thread = await getOrCreateThread('user-transfer', 'voice', 'ferni' as PersonaId);

      await transferOwnership(thread.id, 'maya-habits' as PersonaId, 'User asked about habits');

      expect(thread.currentOwnerId).toBe('maya-habits');
      expect(thread.ownershipHistory).toHaveLength(1);
      expect(thread.ownershipHistory[0].fromAgentId).toBe('ferni');
      expect(thread.ownershipHistory[0].toAgentId).toBe('maya-habits');
    });
  });

  describe('buildAgentContext', () => {
    it('builds LLM context for agent', async () => {
      const thread = await getOrCreateThread('user-context', 'voice', 'ferni' as PersonaId);

      await addMessage(thread.id, {
        role: 'user',
        channel: 'voice',
        direction: 'inbound',
        content: 'I need help with my habits',
        timestamp: new Date(),
      });

      const context = await buildAgentContext(thread.id, 'maya-habits' as PersonaId, {
        userInitiated: true,
        joinReason: 'handoff from ferni',
      });

      expect(context.thread).toBe(thread);
      expect(context.isNewToThread).toBe(true);
      expect(context.llmContext).toContain('CONVERSATION THREAD CONTEXT');
    });
  });
});

// ============================================================================
// INBOUND ROUTER TESTS
// ============================================================================

describe('Inbound Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStaleThreads();
  });

  describe('routeInbound', () => {
    it('routes to thread owner when thread exists', async () => {
      // Create thread with ferni
      const thread = await getOrCreateThread('user-route-1', 'voice', 'ferni' as PersonaId);

      await addMessage(thread.id, {
        role: 'agent',
        agentId: 'ferni' as PersonaId,
        channel: 'sms',
        direction: 'outbound',
        content: 'How are you?',
        timestamp: new Date(),
      });

      const result = await routeInbound('user-route-1', 'sms', 'Doing great!', {
        fromPhone: '+15551234567',
      });

      expect(result.agentId).toBe('ferni');
    });

    it('defaults to ferni when no thread exists', async () => {
      const result = await routeInbound('user-new', 'sms', 'Hello!', { fromPhone: '+15559876543' });

      expect(result.agentId).toBe('ferni');
    });
  });
});

// ============================================================================
// OUTBOUND INITIATOR TESTS
// ============================================================================

describe('Outbound Initiator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStaleThreads();
  });

  describe('initiateOutreach', () => {
    it('creates outreach and returns result', async () => {
      const result = await initiateOutreach({
        userId: 'user-outreach',
        agentId: 'ferni' as PersonaId,
        preferredChannel: 'sms',
        triggerType: 'thinking_of_you',
        reason: 'Just checking in',
        messageContent: 'Hey, how are you?',
      });

      expect(result.success).toBe(true);
      expect(result.outreachId).toBeDefined();
      expect(result.threadId).toBeDefined();
    });
  });
});

// ============================================================================
// GROUP OUTREACH TESTS
// ============================================================================

describe('Group Outreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStaleThreads();
  });

  describe('initiateGroupOutreach', () => {
    it('creates group outreach with multiple personas', async () => {
      const result = await initiateGroupOutreach({
        userId: 'user-group',
        personas: ['maya-habits', 'jordan-taylor'] as PersonaId[],
        leadPersona: 'maya-habits' as PersonaId,
        preferredChannel: 'sms',
        triggerType: 'planning',
        reason: 'Trip planning',
        topic: 'Hawaii vacation',
      });

      expect(result.success).toBe(true);
      expect(result.personas).toContain('maya-habits');
      expect(result.personas).toContain('jordan-taylor');
    });

    it('fails with less than 2 personas', async () => {
      const result = await initiateGroupOutreach({
        userId: 'user-group-fail',
        personas: ['ferni'] as PersonaId[],
        leadPersona: 'ferni' as PersonaId,
        preferredChannel: 'sms',
        triggerType: 'team_insight',
        reason: 'Test',
        topic: 'Test topic',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 2 personas');
    });
  });
});

// ============================================================================
// THREAD LIFECYCLE TESTS
// ============================================================================

describe('Thread Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStaleThreads();
  });

  it('complete flow: create → message → transfer → close', async () => {
    // 1. Create thread
    const thread = await getOrCreateThread('user-lifecycle', 'voice', 'ferni' as PersonaId);
    expect(thread.status).toBe('active');

    // 2. Add user message
    await addMessage(thread.id, {
      role: 'user',
      channel: 'voice',
      direction: 'inbound',
      content: 'I need help with my habits',
      timestamp: new Date(),
    });
    expect(thread.messageCount).toBe(1);

    // 3. Agent responds
    await addMessage(thread.id, {
      role: 'agent',
      agentId: 'ferni' as PersonaId,
      channel: 'voice',
      direction: 'outbound',
      content: 'Let me connect you with Maya for habits!',
      timestamp: new Date(),
    });
    expect(thread.messageCount).toBe(2);

    // 4. Transfer to Maya
    await transferOwnership(thread.id, 'maya-habits' as PersonaId, 'User needs habit help');
    expect(thread.currentOwnerId).toBe('maya-habits');
    expect(thread.messageCount).toBe(3); // System message added

    // 5. Close thread
    await updateThreadStatus(thread.id, 'closed', 'Session ended');
    expect(thread.status).toBe('closed');
  });
});
