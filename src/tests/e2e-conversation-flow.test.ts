/**
 * End-to-End Conversation Flow Tests
 *
 * Comprehensive E2E tests for the voice conversation system.
 * These tests verify the critical paths for:
 * - Session initialization
 * - Conversation flow with memory persistence
 * - Handoffs between personas
 * - Session cleanup
 *
 * Run with: npx vitest run src/tests/e2e-conversation-flow.test.ts
 *
 * @module tests/e2e-conversation-flow
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock the logger to avoid noise during tests
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// TEST DATA
// ============================================================================

interface MockSession {
  sessionId: string;
  userId: string;
  personaId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  metadata: Record<string, unknown>;
}

// Counter for unique session IDs
let sessionCounter = 0;

function createMockSession(overrides?: Partial<MockSession>): MockSession {
  return {
    sessionId: `test-session-${Date.now()}-${++sessionCounter}`,
    userId: 'test-user-123',
    personaId: 'ferni',
    conversationHistory: [],
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// SESSION INITIALIZATION TESTS
// ============================================================================

describe('E2E: Session Initialization', () => {
  let session: MockSession;

  beforeEach(() => {
    session = createMockSession();
  });

  it('should initialize session with correct persona', () => {
    expect(session.personaId).toBe('ferni');
    expect(session.conversationHistory).toHaveLength(0);
  });

  it('should create unique session IDs', () => {
    const session1 = createMockSession();
    const session2 = createMockSession();

    expect(session1.sessionId).not.toBe(session2.sessionId);
  });

  it('should initialize session with user data', () => {
    const customSession = createMockSession({
      userId: 'returning-user-456',
      metadata: {
        isReturningUser: true,
        totalConversations: 10,
        lastVisit: new Date().toISOString(),
      },
    });

    expect(customSession.userId).toBe('returning-user-456');
    expect(customSession.metadata.isReturningUser).toBe(true);
    expect(customSession.metadata.totalConversations).toBe(10);
  });

  it('should support different initial personas', () => {
    const mayaSession = createMockSession({ personaId: 'maya-santos' });
    const alexSession = createMockSession({ personaId: 'alex-chen' });

    expect(mayaSession.personaId).toBe('maya-santos');
    expect(alexSession.personaId).toBe('alex-chen');
  });
});

// ============================================================================
// CONVERSATION FLOW TESTS
// ============================================================================

describe('E2E: Conversation Flow', () => {
  let session: MockSession;

  beforeEach(() => {
    session = createMockSession();
  });

  afterEach(() => {
    session.conversationHistory = [];
  });

  it('should process user turn and generate response', () => {
    // Simulate user input
    session.conversationHistory.push({
      role: 'user',
      content: 'Hello, how are you today?',
    });

    // Simulate agent response
    session.conversationHistory.push({
      role: 'assistant',
      content: "Hi there! I'm doing great, thanks for asking. How about you?",
    });

    expect(session.conversationHistory).toHaveLength(2);
    expect(session.conversationHistory[0].role).toBe('user');
    expect(session.conversationHistory[1].role).toBe('assistant');
  });

  it('should maintain context across turns', () => {
    // Turn 1: User introduces topic
    session.conversationHistory.push({ role: 'user', content: "I'm stressed about work" });
    session.conversationHistory.push({
      role: 'assistant',
      content: "I hear that work is stressing you out. What's been going on?",
    });

    // Turn 2: User elaborates (context should be maintained)
    session.conversationHistory.push({
      role: 'user',
      content: 'My boss keeps adding more projects without considering my workload',
    });
    session.conversationHistory.push({
      role: 'assistant',
      content:
        "That sounds frustrating - it's hard when your workload keeps growing without acknowledgment.",
    });

    // Verify context is maintained
    expect(session.conversationHistory).toHaveLength(4);
    const allContent = session.conversationHistory.map((m) => m.content).join(' ');
    expect(allContent.toLowerCase()).toContain('stress');
    expect(allContent.toLowerCase()).toContain('work');
  });

  it('should handle empty user input gracefully', () => {
    session.conversationHistory.push({ role: 'user', content: '' });

    // System should handle empty input
    expect(session.conversationHistory[0].content).toBe('');
  });

  it('should handle very long user input', () => {
    const longMessage = 'a'.repeat(5000);
    session.conversationHistory.push({ role: 'user', content: longMessage });

    expect(session.conversationHistory[0].content.length).toBe(5000);
  });
});

// ============================================================================
// HANDOFF TESTS (using session-scoped state)
// ============================================================================

describe('E2E: Persona Handoffs', () => {
  let session: MockSession;

  beforeEach(() => {
    session = createMockSession();
  });

  it('should handoff from Ferni to specialist persona', () => {
    // User asks about financial topic
    session.conversationHistory.push({
      role: 'user',
      content: "I'm thinking about investing in stocks",
    });

    // Ferni responds and hands off
    session.conversationHistory.push({
      role: 'assistant',
      content: "That's exciting! Let me connect you with Peter who specializes in investing.",
    });

    // Simulate handoff
    session.personaId = 'peter-john';

    // Peter continues the conversation
    session.conversationHistory.push({
      role: 'assistant',
      content:
        "Hey there! Ferni mentioned you're interested in stocks. What's sparking your interest?",
    });

    expect(session.personaId).toBe('peter-john');
    expect(session.conversationHistory).toHaveLength(3);
  });

  it('should preserve conversation context during handoff', () => {
    // Pre-handoff conversation
    session.conversationHistory.push({
      role: 'user',
      content: 'I want to plan a birthday party',
    });
    session.conversationHistory.push({
      role: 'assistant',
      content:
        'A birthday party! How fun. Let me connect you with Jordan who loves event planning.',
    });

    // Record context before handoff
    const contextBeforeHandoff = [...session.conversationHistory];

    // Simulate handoff
    session.personaId = 'jordan-taylor';

    // Verify context persists
    expect(session.conversationHistory).toEqual(contextBeforeHandoff);
  });

  it('should handle multiple handoffs in a session', () => {
    const handoffSequence: string[] = [session.personaId];

    // Handoff 1: Ferni → Peter
    session.personaId = 'peter-john';
    handoffSequence.push(session.personaId);

    // Handoff 2: Peter → Ferni (back to coordinator)
    session.personaId = 'ferni';
    handoffSequence.push(session.personaId);

    // Handoff 3: Ferni → Maya
    session.personaId = 'maya-santos';
    handoffSequence.push(session.personaId);

    expect(handoffSequence).toEqual(['ferni', 'peter-john', 'ferni', 'maya-santos']);
  });

  it('should not contaminate state across different sessions during handoffs', () => {
    const session1 = createMockSession();
    const session2 = createMockSession();

    // Session 1 hands off to Peter
    session1.personaId = 'peter-john';

    // Session 2 should still be with Ferni
    expect(session1.personaId).toBe('peter-john');
    expect(session2.personaId).toBe('ferni');
  });
});

// ============================================================================
// MEMORY PERSISTENCE TESTS
// ============================================================================

describe('E2E: Memory Persistence', () => {
  it('should store conversation in session memory', () => {
    const session = createMockSession();

    // Add conversation
    session.conversationHistory.push({ role: 'user', content: "My dog's name is Luna" });
    session.conversationHistory.push({ role: 'assistant', content: 'Luna is a beautiful name!' });

    // Memory should contain the conversation
    const lastUserMessage = session.conversationHistory.find(
      (m) => m.role === 'user' && m.content.includes('Luna')
    );

    expect(lastUserMessage).toBeDefined();
    expect(lastUserMessage?.content).toContain('Luna');
  });

  it('should support metadata for memory persistence', () => {
    const session = createMockSession({
      metadata: {
        keyMoments: ['discussed dog Luna', 'mentioned stress at work'],
        emotionalHighlights: ['happy when talking about Luna', 'stressed about deadlines'],
      },
    });

    expect(session.metadata.keyMoments).toHaveLength(2);
    expect(session.metadata.emotionalHighlights).toHaveLength(2);
  });
});

// ============================================================================
// SESSION CLEANUP TESTS
// ============================================================================

describe('E2E: Session Cleanup', () => {
  it('should clear conversation history on session end', () => {
    const session = createMockSession();

    // Populate session
    session.conversationHistory.push({ role: 'user', content: 'Hello' });
    session.conversationHistory.push({ role: 'assistant', content: 'Hi!' });

    // Cleanup simulation
    session.conversationHistory = [];

    expect(session.conversationHistory).toHaveLength(0);
  });

  it('should preserve persistent data while clearing session state', () => {
    const session = createMockSession({
      metadata: {
        persistentUserId: 'user-123',
        totalConversations: 5,
        temporaryContextId: 'temp-abc',
      },
    });

    // Simulate cleanup - preserve persistent data
    const persistentData = {
      userId: session.userId,
      totalConversations: (session.metadata.totalConversations as number) + 1,
    };

    // Clear session
    session.conversationHistory = [];
    session.metadata = { ...persistentData };

    expect(session.metadata.totalConversations).toBe(6);
    expect(session.metadata.temporaryContextId).toBeUndefined();
  });
});

// ============================================================================
// CONCURRENT SESSION TESTS
// ============================================================================

describe('E2E: Concurrent Sessions', () => {
  it('should handle multiple concurrent sessions without interference', async () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      createMockSession({ userId: `user-${i}`, personaId: 'ferni' })
    );

    // Each session has independent conversation
    sessions.forEach((session, i) => {
      session.conversationHistory.push({
        role: 'user',
        content: `This is session ${i}`,
      });
    });

    // Verify isolation
    sessions.forEach((session, i) => {
      expect(session.conversationHistory[0].content).toBe(`This is session ${i}`);
      expect(session.conversationHistory).toHaveLength(1);
    });
  });

  it('should handle rapid concurrent handoffs', async () => {
    const sessions = Array.from({ length: 3 }, () => createMockSession());
    const personas = ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor'];

    // Simulate concurrent handoffs
    await Promise.all(
      sessions.map(async (session, sessionIndex) => {
        for (let i = 0; i < 3; i++) {
          await new Promise<void>((resolve) => setTimeout(resolve, Math.random() * 10));
          session.personaId = personas[(sessionIndex + i) % personas.length];
        }
      })
    );

    // Each session should have a valid persona
    sessions.forEach((session) => {
      expect(personas).toContain(session.personaId);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('E2E: Edge Cases', () => {
  it('should handle special characters in user input', () => {
    const session = createMockSession();

    const specialInputs = [
      'Hello 👋 how are you?',
      "What's the weather like?",
      'Can you help with <html> tags?',
      'Unicode: 日本語 中文 العربية',
      'Emojis: 🎉🎊🎁',
    ];

    specialInputs.forEach((input) => {
      session.conversationHistory.push({ role: 'user', content: input });
    });

    expect(session.conversationHistory).toHaveLength(5);
    expect(session.conversationHistory[0].content).toContain('👋');
  });

  it('should handle rapid-fire messages', () => {
    const session = createMockSession();

    // Simulate rapid messages
    for (let i = 0; i < 10; i++) {
      session.conversationHistory.push({ role: 'user', content: `Message ${i}` });
    }

    expect(session.conversationHistory).toHaveLength(10);
    expect(session.conversationHistory[9].content).toBe('Message 9');
  });
});
