/**
 * Cameo Unlock System E2E Tests (Backend Only)
 *
 * Tests the complete cameo unlock flow WITHOUT the UI:
 * 1. Topic detection triggers introduction opportunity
 * 2. Context builder injects introduction hints
 * 3. introduceMember tool emits unlock events
 * 4. Fallback triggers after grace period
 * 5. Session tracking prevents double introductions
 *
 * These tests validate the backend plumbing independent of frontend.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const createMockLogger = (): Record<string, unknown> => {
  const mockLogger: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  };
  return mockLogger;
};

vi.mock('@livekit/agents', () => ({
  log: () => createMockLogger(),
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => createMockLogger(),
  safeLog: () => createMockLogger(),
  createLogger: () => createMockLogger(),
}));

// ============================================================================
// TEST SUITE: Topic Detection
// ============================================================================

// TODO: Skipped - imports from 'cameo-unlock.js' which has been moved/deleted
describe.skip('Cameo Unlock - Topic Detection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear session tracking between tests
    const { clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');
    clearSessionTracking();
  });

  it('should detect Maya topics (habits, routines)', async () => {
    const { detectTopicMatch, SPECIALTY_TOPICS } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    // Verify Maya's topics are defined
    expect(SPECIALTY_TOPICS['maya-santos']).toBeDefined();
    expect(SPECIALTY_TOPICS['maya-santos'].length).toBeGreaterThan(0);

    // Test topic detection
    const habitMatch = detectTopicMatch('I want to build better habits', 'maya-santos');
    expect(habitMatch).toContain('habit');

    const routineMatch = detectTopicMatch('My morning routine is broken', 'maya-santos');
    expect(routineMatch).toContain('routine');
    expect(routineMatch).toContain('morning');

    const workoutMatch = detectTopicMatch('I keep skipping my workout', 'maya-santos');
    expect(workoutMatch).toContain('workout');
  });

  it('should detect Peter topics (data, finance, tracking)', async () => {
    const { detectTopicMatch } = await import('../intelligence/context-builders/cameo-unlock.js');

    const dataMatch = detectTopicMatch('I want to see the patterns in my behavior', 'peter-john');
    expect(dataMatch).toContain('pattern');

    const financeMatch = detectTopicMatch('How much do I really need to budget?', 'peter-john');
    expect(financeMatch).toContain('budget');
    expect(financeMatch).toContain('how much do i');

    const trackingMatch = detectTopicMatch('Can you track my progress?', 'peter-john');
    expect(trackingMatch).toContain('track');
  });

  it('should detect Alex topics (communication, boundaries)', async () => {
    const { detectTopicMatch } = await import('../intelligence/context-builders/cameo-unlock.js');

    const commMatch = detectTopicMatch('I need help with a difficult conversation', 'alex-chen');
    expect(commMatch).toContain('difficult conversation');

    const boundaryMatch = detectTopicMatch('How do I set better boundaries?', 'alex-chen');
    expect(boundaryMatch).toContain('boundaries');

    const scriptMatch = detectTopicMatch('What should I say to my boss?', 'alex-chen');
    expect(scriptMatch).toContain('what should i say');
  });

  it('should detect Jordan topics (planning, goals, life changes)', async () => {
    const { detectTopicMatch } = await import('../intelligence/context-builders/cameo-unlock.js');

    const planMatch = detectTopicMatch("I'm planning a big move next year", 'jordan-taylor');
    expect(planMatch).toContain('plan');
    expect(planMatch).toContain('move');

    const goalMatch = detectTopicMatch('I want to set some life goals', 'jordan-taylor');
    expect(goalMatch).toContain('goal');

    const futureMatch = detectTopicMatch('What should I do for my future?', 'jordan-taylor');
    expect(futureMatch).toContain('future');
  });

  it('should detect Nayan topics (wisdom, meaning, perspective)', async () => {
    const { detectTopicMatch } = await import('../intelligence/context-builders/cameo-unlock.js');

    const wisdomMatch = detectTopicMatch('I need some wisdom about this', 'nayan-patel');
    expect(wisdomMatch).toContain('wisdom');

    const meaningMatch = detectTopicMatch("What's the meaning of all this?", 'nayan-patel');
    expect(meaningMatch).toContain('meaning');

    const perspectiveMatch = detectTopicMatch('I need a bigger picture perspective', 'nayan-patel');
    expect(perspectiveMatch).toContain('bigger picture');
    expect(perspectiveMatch).toContain('perspective');
  });

  it('should return empty array for non-matching topics', async () => {
    const { detectTopicMatch } = await import('../intelligence/context-builders/cameo-unlock.js');

    const noMatch = detectTopicMatch('The weather is nice today', 'maya-santos');
    expect(noMatch).toHaveLength(0);

    const wrongMember = detectTopicMatch('I need to set boundaries', 'maya-santos');
    expect(wrongMember).toHaveLength(0); // Boundaries is Alex's topic
  });
});

// ============================================================================
// TEST SUITE: Candidate Finding
// ============================================================================

describe.skip('Cameo Unlock - Candidate Finding', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');
    clearSessionTracking();
  });

  it('should find candidate when topic matches eligible member', async () => {
    const { findCameoUnlockCandidate } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    // Create mock input with habit topic and enough conversations for Maya (10+)
    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'I want to build better exercise habits',
      analysis: {
        topics: { detected: ['health', 'fitness'] },
        intent: { primary: 'behavior_change' },
      },
      userProfile: {
        totalConversations: 12, // Above Maya's threshold of 10
        subscription: { tier: 'friend' },
      },
      userData: { turnCount: 5 },
    };

    // Mock state where Maya is NOT yet unlocked
    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 12,
      daysSinceJoined: 5,
      consecutiveStreak: 3,
    };

    const result = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());

    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.memberId).toBe('maya-santos');
    expect(result.candidate?.matchedTopics).toContain('habit');
    expect(result.candidate?.isFallback).toBe(false);
  });

  it('should not find candidate if member already unlocked', async () => {
    const { findCameoUnlockCandidate } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'I want to build better habits',
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: { totalConversations: 15 },
      userData: { turnCount: 5 },
    };

    // Maya is already unlocked
    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni', 'maya-santos'],
      conversationCount: 15,
      daysSinceJoined: 5,
      consecutiveStreak: 3,
    };

    const result = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());

    expect(result.candidate).toBeNull();
    // Maya is unlocked, so either no eligible members OR no topic match
    expect(
      result.reason.includes('No members eligible') || result.reason.includes('No topic match')
    ).toBe(true);
  });

  it('should not find candidate if already introduced this session', async () => {
    const { findCameoUnlockCandidate, markIntroduced } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    // Mark Maya as already introduced
    markIntroduced('maya-santos');

    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'I need help with habits again',
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: { totalConversations: 15 },
      userData: { turnCount: 10 },
    };

    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 15,
      daysSinceJoined: 5,
      consecutiveStreak: 3,
    };

    const introducedSet = new Set<string>();
    introducedSet.add('maya-santos');

    const result = findCameoUnlockCandidate(
      mockInput as never,
      mockState as never,
      introducedSet as never
    );

    expect(result.candidate?.memberId).not.toBe('maya-santos');
  });
});

// ============================================================================
// TEST SUITE: Fallback Logic
// ============================================================================

describe.skip('Cameo Unlock - Fallback Logic', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');
    clearSessionTracking();
  });

  it('should trigger fallback after grace period without topic match', async () => {
    const { findCameoUnlockCandidate } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    // User has 13+ conversations (10 threshold + 3 grace period)
    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'Just wanted to chat about the weather', // No matching topics
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: { totalConversations: 14 },
      userData: { turnCount: 5 },
    };

    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 14,
      daysSinceJoined: 5,
      consecutiveStreak: 3,
    };

    const result = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());

    // Should find a fallback candidate
    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.isFallback).toBe(true);
    expect(result.reason).toContain('Fallback');
  });

  it('should NOT trigger fallback before grace period ends', async () => {
    const { findCameoUnlockCandidate } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    // User has only 11 conversations (1 past threshold, not at grace period yet)
    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'Random chat about nothing specific',
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: { totalConversations: 11 },
      userData: { turnCount: 5 },
    };

    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 11,
      daysSinceJoined: 3,
      consecutiveStreak: 2,
    };

    const result = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());

    // Should NOT find a candidate yet
    expect(result.candidate).toBeNull();
    expect(result.reason).toContain('not yet at fallback');
  });
});

// ============================================================================
// TEST SUITE: Session Tracking
// ============================================================================

describe.skip('Cameo Unlock - Session Tracking', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');
    clearSessionTracking();
  });

  it('should track introduced members for the session', async () => {
    const { markIntroduced, wasIntroducedThisSession, clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    expect(wasIntroducedThisSession('maya-santos')).toBe(false);

    markIntroduced('maya-santos');
    expect(wasIntroducedThisSession('maya-santos')).toBe(true);
    expect(wasIntroducedThisSession('peter-john')).toBe(false);

    markIntroduced('peter-john');
    expect(wasIntroducedThisSession('peter-john')).toBe(true);

    clearSessionTracking();
    expect(wasIntroducedThisSession('maya-santos')).toBe(false);
    expect(wasIntroducedThisSession('peter-john')).toBe(false);
  });

  it('should prevent double introduction in same session', async () => {
    const { findCameoUnlockCandidate, markIntroduced } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'I need to build better habits',
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: { totalConversations: 15 },
      userData: { turnCount: 5 },
    };

    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 15,
      daysSinceJoined: 5,
      consecutiveStreak: 3,
    };

    // First call should find Maya
    const result1 = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());
    expect(result1.candidate?.memberId).toBe('maya-santos');

    // Mark Maya as introduced
    markIntroduced('maya-santos');

    // Create new set that includes maya
    const introducedSet = new Set<string>();
    introducedSet.add('maya-santos');

    // Second call should NOT find Maya
    const result2 = findCameoUnlockCandidate(
      mockInput as never,
      mockState as never,
      introducedSet as never
    );
    expect(result2.candidate?.memberId).not.toBe('maya-santos');
  });
});

// ============================================================================
// TEST SUITE: Event Emitter Integration
// ============================================================================

describe.skip('Cameo Unlock - Event Integration', () => {
  let mockEvents: EventEmitter;
  let capturedEvents: Array<{ type: string; data: unknown }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockEvents = new EventEmitter();
    capturedEvents = [];

    // Capture events
    mockEvents.on('memberUnlocked', (data) => {
      capturedEvents.push({ type: 'memberUnlocked', data });
    });
  });

  afterEach(() => {
    mockEvents.removeAllListeners();
  });

  it('should emit memberUnlocked event with correct data shape', async () => {
    const { cameoUnlockEvents } = await import('../tools/handoff/state.js');

    // Capture the real event
    const eventPromise = new Promise<unknown>((resolve) => {
      cameoUnlockEvents.once('memberUnlocked', resolve);
    });

    // Emit a test event
    cameoUnlockEvents.emit('memberUnlocked', {
      memberId: 'maya-santos',
      displayName: 'Maya',
      role: 'Habit Coach',
      spokenIntro: 'I want to introduce you to Maya!',
    });

    const event = await eventPromise;

    expect(event).toMatchObject({
      memberId: 'maya-santos',
      displayName: 'Maya',
      role: 'Habit Coach',
      spokenIntro: expect.any(String),
    });
  });

  it('should allow multiple listeners on cameoUnlockEvents', async () => {
    const { cameoUnlockEvents } = await import('../tools/handoff/state.js');

    let listener1Called = false;
    let listener2Called = false;

    cameoUnlockEvents.once('memberUnlocked', () => {
      listener1Called = true;
    });
    cameoUnlockEvents.once('memberUnlocked', () => {
      listener2Called = true;
    });

    cameoUnlockEvents.emit('memberUnlocked', { memberId: 'test' });

    expect(listener1Called).toBe(true);
    expect(listener2Called).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: Team Unlock Thresholds
// ============================================================================

describe.skip('Cameo Unlock - Threshold Validation', () => {
  it('should have correct stage thresholds', async () => {
    const { TEAM_MEMBERS } = await import('../services/team-unlocks.js');

    // Verify member unlock stages match expected thresholds
    const maya = TEAM_MEMBERS.find((m) => m.memberId === 'maya-santos');
    expect(maya?.unlocksAt).toBe('getting-started');

    const peter = TEAM_MEMBERS.find((m) => m.memberId === 'peter-john');
    expect(peter?.unlocksAt).toBe('building-trust');

    const alex = TEAM_MEMBERS.find((m) => m.memberId === 'alex-chen');
    expect(alex?.unlocksAt).toBe('established');

    const jordan = TEAM_MEMBERS.find((m) => m.memberId === 'jordan-taylor');
    expect(jordan?.unlocksAt).toBe('established');

    const nayan = TEAM_MEMBERS.find((m) => m.memberId === 'nayan-patel');
    expect(nayan?.unlocksAt).toBe('deep-partnership');
  });

  it('should have introduction messages for all team members', async () => {
    const { TEAM_MEMBERS } = await import('../services/team-unlocks.js');

    for (const member of TEAM_MEMBERS) {
      if (member.memberId === 'ferni') continue;

      expect(member.introductionMessage).toBeDefined();
      expect(member.introductionMessage.length).toBeGreaterThan(20);
      expect(member.displayName).toBeDefined();
      expect(member.role).toBeDefined();
    }
  });
});

// ============================================================================
// TEST SUITE: Integration - Full Flow
// ============================================================================

describe.skip('Cameo Unlock - Full Flow Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');
    clearSessionTracking();
  });

  it('should complete full topic-based introduction flow', async () => {
    const {
      findCameoUnlockCandidate,
      markIntroduced,
      wasIntroducedThisSession,
      clearSessionTracking,
    } = await import('../intelligence/context-builders/cameo-unlock.js');
    const { cameoUnlockEvents } = await import('../tools/handoff/state.js');

    // Step 1: User mentions habits
    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'I really want to start a morning routine and build better exercise habits',
      analysis: {
        topics: { detected: ['health', 'lifestyle'] },
        intent: { primary: 'behavior_change' },
      },
      userProfile: { totalConversations: 12 },
      userData: { turnCount: 5 },
    };

    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 12,
      daysSinceJoined: 7,
      consecutiveStreak: 3,
    };

    // Step 2: Find candidate
    const result = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());

    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.memberId).toBe('maya-santos');
    expect(result.candidate?.isFallback).toBe(false);

    // Step 3: Simulate tool execution (what introduceMember tool does)
    const unlockPromise = new Promise<{ memberId: string }>((resolve) => {
      cameoUnlockEvents.once('memberUnlocked', resolve);
    });

    // Mark introduced and emit event
    markIntroduced('maya-santos');
    cameoUnlockEvents.emit('memberUnlocked', {
      memberId: result.candidate!.memberId,
      displayName: result.candidate!.displayName,
      role: result.candidate!.role,
      spokenIntro: result.candidate!.introductionMessage,
    });

    // Step 4: Verify event was received
    const unlockEvent = await unlockPromise;
    expect(unlockEvent.memberId).toBe('maya-santos');

    // Step 5: Verify session tracking
    expect(wasIntroducedThisSession('maya-santos')).toBe(true);

    // Step 6: Verify no duplicate introduction
    const secondResult = findCameoUnlockCandidate(
      mockInput as never,
      mockState as never,
      new Set(['maya-santos']) as never
    );
    expect(secondResult.candidate?.memberId).not.toBe('maya-santos');

    // Cleanup
    clearSessionTracking();
  });

  it('should complete fallback introduction flow', async () => {
    const { findCameoUnlockCandidate, markIntroduced, clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');
    const { cameoUnlockEvents } = await import('../tools/handoff/state.js');

    // User has exceeded grace period without topic match
    const mockInput = {
      persona: { id: 'ferni' },
      userText: "Let's just talk about random stuff",
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: { totalConversations: 14 }, // 10 + 3 grace + 1
      userData: { turnCount: 10 },
    };

    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 14,
      daysSinceJoined: 10,
      consecutiveStreak: 5,
    };

    // Find fallback candidate
    const result = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());

    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.isFallback).toBe(true);
    expect(result.reason).toContain('Fallback');

    // Simulate tool execution
    const unlockPromise = new Promise<{ memberId: string }>((resolve) => {
      cameoUnlockEvents.once('memberUnlocked', resolve);
    });

    markIntroduced(result.candidate!.memberId as never);
    cameoUnlockEvents.emit('memberUnlocked', {
      memberId: result.candidate!.memberId,
      displayName: result.candidate!.displayName,
      role: result.candidate!.role,
      spokenIntro: result.candidate!.introductionMessage,
    });

    const unlockEvent = await unlockPromise;
    expect(unlockEvent.memberId).toBeDefined();

    clearSessionTracking();
  });
});

// ============================================================================
// TEST SUITE: Edge Cases
// ============================================================================

describe.skip('Cameo Unlock - Edge Cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearSessionTracking } =
      await import('../intelligence/context-builders/cameo-unlock.js');
    clearSessionTracking();
  });

  it('should not trigger for non-Ferni personas', async () => {
    const { findCameoUnlockCandidate } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    const mockInput = {
      persona: { id: 'maya-santos' }, // Not Ferni
      userText: 'I want to build better habits',
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: { totalConversations: 15 },
      userData: { turnCount: 5 },
    };

    const mockState = {
      currentStage: 'getting-started',
      unlockedMembers: ['ferni'],
      conversationCount: 15,
      daysSinceJoined: 5,
      consecutiveStreak: 3,
    };

    // The context builder should skip non-Ferni personas,
    // so the raw findCandidate will still work, but the builder won't run
    // This test validates the topic detection still works
    const result = findCameoUnlockCandidate(mockInput as never, mockState as never, new Set());

    // Even though persona is Maya, the function still works
    // (the buildCameoUnlockContext wrapper handles persona filtering)
    expect(result.candidate?.memberId).toBe('maya-santos');
  });

  it('should handle missing user profile gracefully', async () => {
    const { findCameoUnlockCandidate } =
      await import('../intelligence/context-builders/cameo-unlock.js');

    const mockInput = {
      persona: { id: 'ferni' },
      userText: 'Build habits',
      analysis: { topics: { detected: [] }, intent: {} },
      userProfile: undefined, // Missing profile
      userData: { turnCount: 5 },
    };

    const mockState = {
      currentStage: 'first-meeting',
      unlockedMembers: ['ferni'],
      conversationCount: 0,
      daysSinceJoined: 0,
      consecutiveStreak: 0,
    };

    // Should not throw
    expect(() =>
      findCameoUnlockCandidate(mockInput as never, mockState as never, new Set())
    ).not.toThrow();
  });

  it('should handle empty user text', async () => {
    const { detectTopicMatch } = await import('../intelligence/context-builders/cameo-unlock.js');

    const result = detectTopicMatch('', 'maya-santos');
    expect(result).toHaveLength(0);
  });

  it('should be case-insensitive in topic matching', async () => {
    const { detectTopicMatch } = await import('../intelligence/context-builders/cameo-unlock.js');

    const lowercase = detectTopicMatch('habits', 'maya-santos');
    const uppercase = detectTopicMatch('HABITS', 'maya-santos');
    const mixed = detectTopicMatch('HaBiTs', 'maya-santos');

    expect(lowercase).toContain('habit');
    expect(uppercase).toContain('habit');
    expect(mixed).toContain('habit');
  });
});
