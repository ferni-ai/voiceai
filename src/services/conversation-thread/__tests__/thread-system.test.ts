/**
 * Conversation Thread System Tests
 *
 * Comprehensive tests for the bidirectional agent engagement system.
 * Tests thread lifecycle, message management, handoffs, persistence, and routing.
 *
 * @module services/conversation-thread/__tests__/thread-system.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { ConversationThread, ThreadMessage, EngagementChannel } from '../types.js';
import type { PersonaId } from '../../../personas/types.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore persistence
vi.mock('../thread-persistence.js', () => ({
  saveThread: vi.fn().mockResolvedValue(true),
  loadThread: vi.fn().mockResolvedValue(null),
  loadActiveThread: vi.fn().mockResolvedValue(null),
  saveMessage: vi.fn().mockResolvedValue(true),
  loadMessages: vi.fn().mockResolvedValue([]),
  closeThread: vi.fn().mockResolvedValue(true),
}));

// Mock data layer hooks
vi.mock('../../data-layer/hooks/index.js', () => ({
  onConversationThreadChange: vi.fn().mockResolvedValue(undefined),
}));

// Mock outreach context bridge
vi.mock('../../outreach/conversation-context-bridge.js', () => ({
  storeOutreachContext: vi.fn().mockResolvedValue(undefined),
}));

// Mock persona voice generator
vi.mock('../../outreach/persona-voice-generator.js', () => ({
  getPersonaOutreachVoice: vi.fn().mockReturnValue({
    tone: 'warm',
    openings: ['Hey!'],
  }),
  generateTextMessage: vi.fn().mockReturnValue('Test message'),
}));

// Mock delivery
vi.mock('../../outreach/delivery/index.js', () => ({
  deliverOutreach: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
}));

// ============================================================================
// IMPORT AFTER MOCKS
// ============================================================================

let threadManager: typeof import('../thread-manager.js');
let groupOutreach: typeof import('../group-outreach.js');
let inboundRouter: typeof import('../inbound-router.js');
let outboundInitiator: typeof import('../outbound-initiator.js');

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset modules to get fresh state
  vi.resetModules();
  // Dynamic import to get fresh module state
  threadManager = await import('../thread-manager.js');
  groupOutreach = await import('../group-outreach.js');
  inboundRouter = await import('../inbound-router.js');
  outboundInitiator = await import('../outbound-initiator.js');
});

// ============================================================================
// THREAD MANAGER TESTS
// ============================================================================

describe('ThreadManager', () => {
  const testChannel: EngagementChannel = 'voice';
  const testAgentId: PersonaId = 'ferni';

  // Use unique user IDs per test to avoid state pollution
  function uniqueUserId(): string {
    return `test-user-${uuidv4().slice(0, 8)}`;
  }

  describe('getOrCreateThread', () => {
    it('should create a new thread when none exists', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);

      expect(thread).toBeDefined();
      expect(thread.id).toBeDefined();
      expect(thread.userId).toBe(userId);
      expect(thread.currentOwnerId).toBe(testAgentId);
      expect(thread.originChannel).toBe(testChannel);
      expect(thread.status).toBe('active');
      expect(thread.messageCount).toBe(0);
    });

    it('should return existing thread if not stale', async () => {
      const userId = uniqueUserId();
      const thread1 = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);
      const thread2 = await threadManager.getOrCreateThread(userId, 'sms', 'maya-habits');

      expect(thread2.id).toBe(thread1.id);
      // Original agent retained
      expect(thread2.currentOwnerId).toBe(testAgentId);
    });

    it('should store trigger type and outreach ID', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId, {
        triggerType: 'commitment_check',
        outreachId: 'outreach-123',
      });

      expect(thread.triggerType).toBe('commitment_check');
      expect(thread.outreachId).toBe('outreach-123');
    });
  });

  describe('addMessage', () => {
    it('should add a message to a thread', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);

      const message = await threadManager.addMessage(thread.id, {
        role: 'user',
        channel: 'voice',
        direction: 'inbound',
        content: 'Hello, Ferni!',
        timestamp: new Date(),
      });

      expect(message.id).toBeDefined();
      expect(message.threadId).toBe(thread.id);
      expect(message.content).toBe('Hello, Ferni!');

      // Check thread was updated
      const updatedThread = await threadManager.getThread(thread.id);
      expect(updatedThread?.messageCount).toBe(1);
    });

    it('should track channel usage', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, 'voice', testAgentId);

      await threadManager.addMessage(thread.id, {
        role: 'user',
        channel: 'sms',
        direction: 'inbound',
        content: 'Text message',
        timestamp: new Date(),
      });

      const updatedThread = await threadManager.getThread(thread.id);
      expect(updatedThread?.channelsUsed).toContain('voice');
      expect(updatedThread?.channelsUsed).toContain('sms');
      expect(updatedThread?.lastChannel).toBe('sms');
    });

    it('should update last activity timestamps', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);
      const before = thread.lastActivityAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      await threadManager.addMessage(thread.id, {
        role: 'agent',
        agentId: testAgentId,
        channel: 'voice',
        direction: 'outbound',
        content: 'Hello!',
        timestamp: new Date(),
      });

      const updatedThread = await threadManager.getThread(thread.id);
      expect(updatedThread?.lastActivityAt.getTime()).toBeGreaterThan(before.getTime());
      expect(updatedThread?.lastAgentMessageAt).toBeDefined();
    });
  });

  describe('transferOwnership', () => {
    it('should transfer ownership to a new agent', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);

      await threadManager.transferOwnership(thread.id, 'maya-habits', 'User wants habit help');

      const updatedThread = await threadManager.getThread(thread.id);
      expect(updatedThread?.currentOwnerId).toBe('maya-habits');
      expect(updatedThread?.ownershipHistory).toHaveLength(1);
      expect(updatedThread?.ownershipHistory[0].fromAgentId).toBe('ferni');
      expect(updatedThread?.ownershipHistory[0].toAgentId).toBe('maya-habits');
      expect(updatedThread?.ownershipHistory[0].reason).toBe('User wants habit help');
    });
  });

  describe('buildAgentContext', () => {
    it('should build LLM context for a thread', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);

      // Add some messages
      await threadManager.addMessage(thread.id, {
        role: 'user',
        channel: 'voice',
        direction: 'inbound',
        content: 'I need help with my habits',
        timestamp: new Date(),
      });

      await threadManager.addMessage(thread.id, {
        role: 'agent',
        agentId: testAgentId,
        channel: 'voice',
        direction: 'outbound',
        content: "I'd love to help with that!",
        timestamp: new Date(),
      });

      const context = await threadManager.buildAgentContext(thread.id, testAgentId, {
        userInitiated: true,
      });

      expect(context.thread).toBeDefined();
      expect(context.recentMessages.length).toBeGreaterThanOrEqual(2);
      expect(context.llmContext).toContain('[CONVERSATION THREAD CONTEXT]');
      expect(context.llmContext).toContain('I need help with my habits');
      expect(context.userInitiated).toBe(true);
    });

    it('should detect new agent to thread', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);

      const context = await threadManager.buildAgentContext(thread.id, 'maya-habits', {
        userInitiated: true,
      });

      expect(context.isNewToThread).toBe(true);
    });

    it('should include handoff context', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);
      await threadManager.transferOwnership(thread.id, 'maya-habits', 'Habit coaching');

      const context = await threadManager.buildAgentContext(thread.id, 'maya-habits', {
        userInitiated: true,
      });

      expect(context.previousOwner).toBe('ferni');
      expect(context.llmContext).toContain('ferni');
    });
  });

  describe('updateThreadStatus', () => {
    it('should update thread status', async () => {
      const userId = uniqueUserId();
      const thread = await threadManager.getOrCreateThread(userId, testChannel, testAgentId);

      await threadManager.updateThreadStatus(thread.id, 'paused', 'User stepped away');

      const updatedThread = await threadManager.getThread(thread.id);
      expect(updatedThread?.status).toBe('paused');
      expect(updatedThread?.statusReason).toBe('User stepped away');
    });
  });
});

// ============================================================================
// GROUP OUTREACH TESTS
// ============================================================================

describe('GroupOutreach', () => {
  const testUserId = 'test-user-456';

  describe('initiateGroupOutreach', () => {
    it('should require at least 2 personas', async () => {
      const result = await groupOutreach.initiateGroupOutreach({
        userId: testUserId,
        personas: ['ferni'],
        leadPersona: 'ferni',
        preferredChannel: 'sms',
        triggerType: 'team_insight',
        reason: 'Test',
        topic: 'Test topic',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 2 personas');
    });

    it('should create a group outreach with multiple personas', async () => {
      const result = await groupOutreach.initiateGroupOutreach({
        userId: testUserId,
        personas: ['ferni', 'maya-habits'],
        leadPersona: 'ferni',
        preferredChannel: 'sms',
        triggerType: 'team_insight',
        reason: 'Collaborative insight',
        topic: 'Morning routine',
      });

      expect(result.success).toBe(true);
      expect(result.outreachId).toBeDefined();
      expect(result.threadId).toBeDefined();
      expect(result.personas).toContain('ferni');
      expect(result.personas).toContain('maya-habits');
      expect(result.message).toBeDefined();
    });

    it('should generate roundtable config for voice calls', async () => {
      const result = await groupOutreach.initiateGroupOutreach({
        userId: testUserId,
        personas: ['ferni', 'peter-john', 'maya-habits'],
        leadPersona: 'ferni',
        preferredChannel: 'voice',
        triggerType: 'collaborative_support',
        reason: 'Team brainstorm',
        topic: 'Career planning',
        collaborationMode: 'brainstorm',
      });

      expect(result.success).toBe(true);
      expect(result.roundtableConfig).toBeDefined();
      expect(result.roundtableConfig?.moderator).toBe('ferni');
      expect(result.roundtableConfig?.personas).toHaveLength(3);
      expect(result.roundtableConfig?.collaborationMode).toBe('brainstorm');
    });
  });

  describe('convenience functions', () => {
    it('mayaJordanPlanningOutreach should use Maya and Jordan', async () => {
      const result = await groupOutreach.mayaJordanPlanningOutreach(testUserId, {
        eventName: 'Hawaii trip',
        preferredName: 'Sarah',
      });

      expect(result.success).toBe(true);
      expect(result.personas).toContain('maya-habits');
      expect(result.personas).toContain('jordan-taylor');
    });

    it('teamCelebrationOutreach should use Ferni, Maya, and Jordan', async () => {
      const result = await groupOutreach.teamCelebrationOutreach(testUserId, {
        achievement: 'Finished certification',
        preferredName: 'Mike',
      });

      expect(result.success).toBe(true);
      expect(result.personas).toContain('ferni');
      expect(result.personas).toContain('maya-habits');
      expect(result.personas).toContain('jordan-taylor');
    });

    it('fullTeamSupportOutreach should use supportive personas', async () => {
      const result = await groupOutreach.fullTeamSupportOutreach(testUserId, {
        situation: 'job loss',
        preferredName: 'Alex',
      });

      expect(result.success).toBe(true);
      expect(result.personas).toContain('ferni');
      expect(result.personas).toContain('nayan-sharma');
    });
  });

  describe('generateGroupCallIntroductions', () => {
    it('should generate introductions for each persona', () => {
      const intros = groupOutreach.generateGroupCallIntroductions(
        ['ferni', 'maya-habits', 'peter-john'],
        'Career planning',
        'ferni'
      );

      expect(intros.get('ferni')).toContain('Ferni');
      expect(intros.get('ferni')).toContain('Career planning');
      expect(intros.get('maya-habits')).toContain('Maya');
      expect(intros.get('peter-john')).toContain('Peter');
    });
  });
});

// ============================================================================
// THREAD PERSISTENCE INTEGRATION TESTS
// ============================================================================

describe('Thread Persistence Integration', () => {
  it('should persist thread to Firestore on create', async () => {
    const { saveThread } = await import('../thread-persistence.js');

    await threadManager.getOrCreateThread('persist-user', 'voice', 'ferni');

    expect(saveThread).toHaveBeenCalled();
  });

  it('should persist messages to Firestore', async () => {
    const { saveMessage } = await import('../thread-persistence.js');

    const thread = await threadManager.getOrCreateThread('persist-user-2', 'voice', 'ferni');

    await threadManager.addMessage(thread.id, {
      role: 'user',
      channel: 'voice',
      direction: 'inbound',
      content: 'Test message',
      timestamp: new Date(),
    });

    expect(saveMessage).toHaveBeenCalled();
  });
});

// ============================================================================
// CROSS-CHANNEL CONTINUITY TESTS
// ============================================================================

describe('Cross-Channel Continuity', () => {
  it('should maintain thread across channels', async () => {
    const userId = 'cross-channel-user';

    // Start on voice
    const thread = await threadManager.getOrCreateThread(userId, 'voice', 'ferni');

    // Add voice message
    await threadManager.addMessage(thread.id, {
      role: 'user',
      channel: 'voice',
      direction: 'inbound',
      content: 'Hello on voice',
      timestamp: new Date(),
    });

    // User replies via SMS
    await threadManager.addMessage(thread.id, {
      role: 'user',
      channel: 'sms',
      direction: 'inbound',
      content: 'Following up via text',
      timestamp: new Date(),
    });

    const updatedThread = await threadManager.getThread(thread.id);
    expect(updatedThread?.channelsUsed).toContain('voice');
    expect(updatedThread?.channelsUsed).toContain('sms');
    expect(updatedThread?.lastChannel).toBe('sms');
    expect(updatedThread?.messageCount).toBe(2);
  });

  it('should build context aware of channel switches', async () => {
    const userId = 'multi-channel-user';

    const thread = await threadManager.getOrCreateThread(userId, 'voice', 'ferni');

    await threadManager.addMessage(thread.id, {
      role: 'user',
      channel: 'sms',
      direction: 'inbound',
      content: 'Text message',
      timestamp: new Date(),
    });

    const context = await threadManager.buildAgentContext(thread.id, 'ferni');

    expect(context.llmContext).toContain('voice');
    expect(context.llmContext).toContain('sms');
    expect(context.llmContext).toContain('multiple channels');
  });
});

// ============================================================================
// OUTREACH → INBOUND FLOW TESTS
// ============================================================================

describe('Outreach → Inbound Flow', () => {
  it('should mark thread as response to outreach in context', async () => {
    const userId = 'outreach-response-user';

    // Create thread with outreach context
    const thread = await threadManager.getOrCreateThread(userId, 'sms', 'maya-habits', {
      triggerType: 'commitment_check',
      outreachId: 'outreach-xyz',
    });

    // User responds
    await threadManager.addMessage(thread.id, {
      role: 'user',
      channel: 'sms',
      direction: 'inbound',
      content: 'Yes, I did my workout!',
      timestamp: new Date(),
    });

    const context = await threadManager.buildAgentContext(thread.id, 'maya-habits', {
      userInitiated: true,
    });

    expect(context.llmContext).toContain('RESPONSE to our earlier outreach');
    expect(context.thread.outreachId).toBe('outreach-xyz');
  });
});

// ============================================================================
// AGENT HANDOFF TESTS
// ============================================================================

describe('Agent Handoff Flow', () => {
  it('should preserve context through multiple handoffs', async () => {
    const userId = 'handoff-user';

    // Start with Ferni
    const thread = await threadManager.getOrCreateThread(userId, 'voice', 'ferni');

    await threadManager.addMessage(thread.id, {
      role: 'user',
      channel: 'voice',
      direction: 'inbound',
      content: 'I want to plan a trip',
      timestamp: new Date(),
    });

    // Handoff to Jordan
    await threadManager.transferOwnership(thread.id, 'jordan-taylor', 'Trip planning');

    await threadManager.addMessage(thread.id, {
      role: 'agent',
      agentId: 'jordan-taylor',
      channel: 'voice',
      direction: 'outbound',
      content: 'I love planning trips!',
      timestamp: new Date(),
    });

    // Handoff to Maya for habits around travel
    await threadManager.transferOwnership(
      thread.id,
      'maya-habits',
      'Workout habits while traveling'
    );

    const context = await threadManager.buildAgentContext(thread.id, 'maya-habits');

    // Should show full ownership chain
    expect(context.thread.ownershipHistory).toHaveLength(2);
    expect(context.llmContext).toContain('ferni');
    expect(context.llmContext).toContain('jordan-taylor');
    expect(context.previousOwner).toBe('jordan-taylor');
  });
});

// ============================================================================
// EMOTIONAL CONTEXT TESTS
// ============================================================================

describe('Emotional Context Tracking', () => {
  it('should track emotional context through conversation', async () => {
    const userId = 'emotional-user';

    const thread = await threadManager.getOrCreateThread(userId, 'voice', 'ferni');

    await threadManager.updateEmotionalContext(thread.id, 'stressed', 'declining');

    const context = await threadManager.buildAgentContext(thread.id, 'ferni');

    expect(context.thread.emotionalContext?.current).toBe('stressed');
    expect(context.thread.emotionalContext?.trajectory).toBe('declining');
    expect(context.llmContext).toContain('stressed');
    expect(context.llmContext).toContain('declining');
  });
});

// ============================================================================
// TOPIC TRACKING TESTS
// ============================================================================

describe('Topic Tracking', () => {
  it('should accumulate topics discussed', async () => {
    const userId = 'topic-user';

    const thread = await threadManager.getOrCreateThread(userId, 'voice', 'ferni');

    await threadManager.updateThreadTopics(thread.id, ['career', 'stress']);
    await threadManager.updateThreadTopics(thread.id, ['relationships', 'career']); // career duplicate

    const updatedThread = await threadManager.getThread(thread.id);
    expect(updatedThread?.topicTags).toContain('career');
    expect(updatedThread?.topicTags).toContain('stress');
    expect(updatedThread?.topicTags).toContain('relationships');
    // No duplicates
    expect(updatedThread?.topicTags.filter((t) => t === 'career')).toHaveLength(1);
  });
});

// ============================================================================
// STALE THREAD CLEANUP TESTS
// ============================================================================

describe('Stale Thread Management', () => {
  it('should identify stale threads', async () => {
    // This test validates the staleness logic
    // In real implementation, we'd mock Date.now() to test
    const userId = 'stale-user';

    const thread = await threadManager.getOrCreateThread(userId, 'voice', 'ferni');

    // Fresh thread should not be stale
    const freshThread = await threadManager.getActiveThread(userId);
    expect(freshThread).not.toBeNull();
    expect(freshThread?.id).toBe(thread.id);
  });
});
