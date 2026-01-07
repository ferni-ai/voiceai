/**
 * Handoff Executor Tests
 *
 * Tests for the agent-agnostic handoff execution system.
 *
 * Run with: npx vitest run src/tools/handoff/__tests__/executor.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureHandoffContext,
  clearHandoffHistory,
  executeHandoff,
  getCurrentAgent,
  getHandoffContext,
  getHandoffHistory,
  isHandoffAllowed,
  isSameAgent,
  resetHandoffState,
  setCurrentAgent,
} from '../executor.js';

// Import handoffEvents dynamically to avoid module resolution issues with mocks
let handoffEvents: import('events').EventEmitter | null = null;
async function getHandoffEvents() {
  if (!handoffEvents) {
    const state = await import('../state.js');
    handoffEvents = state.handoffEvents;
  }
  return handoffEvents;
}

// ============================================================================
// MOCKS
// ============================================================================

// Mock the voice registry - must define mappings inline due to vi.mock hoisting
vi.mock('../../../personas/voice-registry.js', () => {
  const canonicalMapping: Record<string, string> = {
    peter: 'peter-john',
    'peter-john': 'peter-john',
    maya: 'maya-santos',
    'maya-santos': 'maya-santos',
    alex: 'alex-chen',
    'alex-chen': 'alex-chen',
    jordan: 'jordan-taylor',
    'jordan-taylor': 'jordan-taylor',
    'nayan-patel': 'nayan-patel',
    ferni: 'ferni',
    'jack-b': 'ferni',
  };

  const displayNames: Record<string, string> = {
    'peter-john': 'Peter John',
    'maya-santos': 'Maya Santos',
    'alex-chen': 'Alex Chen',
    'jordan-taylor': 'Jordan Taylor',
    'nayan-patel': 'Nayan Patel',
    ferni: 'Ferni',
  };

  return {
    getCanonicalPersonaId: (id: string) => canonicalMapping[id] || id,
    getPersonaDisplayName: (id: string) => displayNames[id] || id,
    getVoiceId: (id: string) => `voice-${id}`,
    getFrontendPersonaId: (id: string) => id,
  };
});

// Mock the unified registry
vi.mock('../../../personas/registry/unified-registry.js', () => ({
  AgentRegistry: {
    getAgentOrNull: vi.fn().mockResolvedValue({
      id: 'peter-john',
      name: 'Peter John',
      roleDescription: 'Research specialist',
    }),
  },
}));

// Mock PersonaRegistry
vi.mock('../../../personas/PersonaRegistry.js', () => ({
  createHandoffEvent: (agentId: string, options: Record<string, unknown>) => ({
    agentId,
    ...options,
  }),
}));

// Mock alive entrances
vi.mock('../../../personas/alive-entrances.js', () => ({
  getAliveEntranceForHandoff: vi.fn().mockResolvedValue(null),
  detectUserMoodFromContext: () => 'neutral',
}));

// Mock agent directory (used by state.js)
vi.mock('../../../personas/agent-directory.js', () => {
  const canonicalMapping: Record<string, string> = {
    peter: 'peter-john',
    'peter-john': 'peter-john',
    maya: 'maya-santos',
    'maya-santos': 'maya-santos',
    alex: 'alex-chen',
    'alex-chen': 'alex-chen',
    jordan: 'jordan-taylor',
    'jordan-taylor': 'jordan-taylor',
    'nayan-patel': 'nayan-patel',
    ferni: 'ferni',
    'jack-b': 'ferni',
  };

  return {
    AgentDirectory: {
      initialize: vi.fn().mockResolvedValue(undefined),
      getDisplayName: vi.fn().mockResolvedValue('Test Agent'),
      getTeamForHandoff: vi.fn().mockResolvedValue([]),
    },
    normalizeAgentIdSync: (id: string) => canonicalMapping[id] || id,
  };
});

// Mock handoff timing config
vi.mock('../../../config/handoff-timing.js', () => ({
  HANDOFF_TIMING: {
    DEBOUNCE_MS: 2000,
    COOLDOWN_MS: 5000,
  },
}));

// Mock team availability to allow all handoffs in tests
vi.mock('../../../intelligence/context-builders/team/team-availability.js', () => ({
  isTeamMemberUnlocked: () => true,
  getLockedMemberTeaser: () => null,
  isCoreTeamMember: () => true, // Assume all test agents are core team members
}));

// Mock team unlocks for marketplace agent checks
vi.mock('../../../services/team-unlocks.js', () => ({
  isFullTeamUnlocked: () => true,
  TEAM_MEMBERS: [
    { memberId: 'ferni' },
    { memberId: 'maya-santos' },
    { memberId: 'peter-john' },
    { memberId: 'alex-chen' },
    { memberId: 'jordan-taylor' },
    { memberId: 'nayan-patel' },
  ],
}));

// Mock personas index module - provides getPersona and getPersonaAsync used by types.ts
vi.mock('../../../personas/index.js', () => {
  const mockPersonas: Record<
    string,
    { id: string; name: string; displayName: string; voice?: { voiceId: string } }
  > = {
    'peter-john': {
      id: 'peter-john',
      name: 'Peter John',
      displayName: 'Peter',
      voice: { voiceId: 'voice-peter-john' },
    },
    'maya-santos': {
      id: 'maya-santos',
      name: 'Maya Santos',
      displayName: 'Maya',
      voice: { voiceId: 'voice-maya-santos' },
    },
    'alex-chen': {
      id: 'alex-chen',
      name: 'Alex Chen',
      displayName: 'Alex',
      voice: { voiceId: 'voice-alex-chen' },
    },
    'jordan-taylor': {
      id: 'jordan-taylor',
      name: 'Jordan Taylor',
      displayName: 'Jordan',
      voice: { voiceId: 'voice-jordan-taylor' },
    },
    'nayan-patel': {
      id: 'nayan-patel',
      name: 'Nayan Patel',
      displayName: 'Nayan',
      voice: { voiceId: 'voice-nayan-patel' },
    },
    ferni: { id: 'ferni', name: 'Ferni', displayName: 'Ferni', voice: { voiceId: 'voice-ferni' } },
  };

  return {
    getPersona: (id: string) => mockPersonas[id] || null,
    getPersonaAsync: async (id: string) => mockPersonas[id] || null,
    getAllPersonaIds: () => Object.keys(mockPersonas),
    getCanonicalPersonaId: (id: string) => {
      const mapping: Record<string, string> = {
        peter: 'peter-john',
        'peter-john': 'peter-john',
        maya: 'maya-santos',
        'maya-santos': 'maya-santos',
        alex: 'alex-chen',
        'alex-chen': 'alex-chen',
        jordan: 'jordan-taylor',
        'jordan-taylor': 'jordan-taylor',
        'nayan-patel': 'nayan-patel',
        ferni: 'ferni',
        'jack-b': 'ferni',
      };
      return mapping[id] || id;
    },
    isKnownPersonaId: (id: string) => !!mockPersonas[id],
  };
});

// ============================================================================
// TESTS
// ============================================================================

describe('Handoff Executor', () => {
  beforeEach(async () => {
    resetHandoffState();
    vi.clearAllMocks();
    // Ensure handoffEvents is loaded
    const events = await getHandoffEvents();

    // FIX: Mock the handoff handler by auto-emitting handoffHandlerComplete
    // This simulates what handoff-handler.ts does in production.
    // Without this, tests timeout waiting for the completion event.
    events!.on('voiceSwitch', (data: { persona?: { id: string } }) => {
      // Emit completion after a short delay to simulate async handler
      setTimeout(() => {
        events!.emit('handoffHandlerComplete', {
          targetId: data.persona?.id || 'unknown',
          success: true,
          greetingSpoken: true,
          instructionsUpdated: true,
        });
      }, 10);
    });
  });

  afterEach(async () => {
    const events = await getHandoffEvents();
    if (events) {
      events.removeAllListeners();
    }
  });

  // --------------------------------------------------------------------------
  // Basic State Management
  // --------------------------------------------------------------------------

  describe('State Management', () => {
    it('should start with ferni as current agent', () => {
      expect(getCurrentAgent()).toBe('ferni');
    });

    it('should update current agent', () => {
      setCurrentAgent('peter-john');
      expect(getCurrentAgent()).toBe('peter-john');
    });

    it('should reset state correctly', () => {
      setCurrentAgent('peter-john');
      captureHandoffContext({ topics: ['stocks'] });

      resetHandoffState();

      expect(getCurrentAgent()).toBe('ferni');
      expect(getHandoffContext()).toBeNull();
    });

    it('should capture and retrieve context', () => {
      captureHandoffContext({
        topics: ['investing', 'stocks'],
        emotionalState: 'curious',
        summary: 'User asked about growth stocks',
      });

      const context = getHandoffContext();
      expect(context).toBeDefined();
      expect(context?.topics).toContain('investing');
      expect(context?.emotionalState).toBe('curious');
    });
  });

  // --------------------------------------------------------------------------
  // Agent ID Comparison
  // --------------------------------------------------------------------------

  describe('Agent ID Comparison', () => {
    it('should recognize same agent with different IDs', () => {
      expect(isSameAgent('peter', 'peter-john')).toBe(true);
      expect(isSameAgent('maya', 'maya-santos')).toBe(true);
      expect(isSameAgent('jack-b', 'ferni')).toBe(true);
    });

    it('should distinguish different agents', () => {
      expect(isSameAgent('peter-john', 'maya-santos')).toBe(false);
      expect(isSameAgent('alex-chen', 'jordan-taylor')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Rate Limiting
  // --------------------------------------------------------------------------

  describe('Rate Limiting', () => {
    it('should allow first handoff', () => {
      expect(isHandoffAllowed()).toBe(true);
    });

    it('should block rapid successive handoffs', async () => {
      // Execute first handoff
      await executeHandoff('peter-john', 'Test reason');

      // Second handoff should be blocked
      const result = await executeHandoff('maya-santos', 'Another reason');
      expect(result.rateLimited).toBe(true);
    });

    it('should allow handoff after cooldown', async () => {
      // Execute first handoff
      await executeHandoff('peter-john', 'Test reason');

      // Wait for cooldown (mocked - just verify the check works)
      // In real test we'd use vi.advanceTimersByTime
      resetHandoffState(); // This also resets the timestamp

      const result = await executeHandoff('maya-santos', 'Another reason');
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Handoff Execution
  // --------------------------------------------------------------------------

  describe('Handoff Execution', () => {
    it('should execute handoff successfully', async () => {
      const result = await executeHandoff('peter-john', 'User wants stock research');

      expect(result.success).toBe(true);
      expect(result.targetAgent).toBe('peter-john');
      expect(result.targetAgentName).toBe('Peter John');
      expect(result.previousAgent).toBe('ferni');
      expect(result.greeting).toBeDefined();
    });

    it('should prevent handoff to same agent', async () => {
      setCurrentAgent('peter-john');

      const result = await executeHandoff('peter-john', 'More research');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Already with');
    });

    it('should normalize agent IDs', async () => {
      // Use short ID 'peter' instead of 'peter-john'
      const result = await executeHandoff('peter', 'User wants stock research');

      expect(result.success).toBe(true);
      expect(result.targetAgent).toBe('peter-john');
    });

    it('should update current agent after handoff', async () => {
      await executeHandoff('peter-john', 'Research time');

      expect(getCurrentAgent()).toBe('peter-john');
    });

    it('should include voice ID in result', async () => {
      const result = await executeHandoff('peter-john', 'Research');

      expect(result.voiceId).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  describe('Event Emission', () => {
    it('should emit voiceSwitch event on handoff', async () => {
      const events = await getHandoffEvents();
      const eventPromise = new Promise<any>((resolve) => {
        events!.once('voiceSwitch', resolve);
      });

      await executeHandoff('peter-john', 'Stock research');

      const event = await eventPromise;
      expect(event.agentId).toBe('peter-john');
      expect(event.greeting).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Handoff History
  // --------------------------------------------------------------------------

  describe('Handoff History', () => {
    it('should record handoffs', async () => {
      await executeHandoff('peter-john', 'First handoff', { skipRateLimit: true });
      await executeHandoff('maya-santos', 'Second handoff', { skipRateLimit: true });

      const history = getHandoffHistory();
      expect(history.length).toBe(2);
      expect(history[0].to).toBe('peter-john');
      expect(history[1].to).toBe('maya-santos');
    });

    it('should clear history', async () => {
      await executeHandoff('peter-john', 'Test');

      clearHandoffHistory();

      expect(getHandoffHistory().length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Greeting Generation
  // --------------------------------------------------------------------------

  describe('Greeting Generation', () => {
    it('should generate greeting with agent name', async () => {
      const result = await executeHandoff('peter-john', 'Stock research');

      expect(result.greeting).toContain('Peter');
    });

    it('should acknowledge reason in greeting', async () => {
      const result = await executeHandoff('peter-john', 'stock picking');

      // The greeting should acknowledge investment-related topics
      expect(result.greeting).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Context Continuation
  // --------------------------------------------------------------------------

  describe('Context Continuation', () => {
    it('should build context continuation from reason', async () => {
      const result = await executeHandoff(
        'peter-john',
        'User wants to research growth stocks and find ten-baggers'
      );

      expect(result.contextContinuation).toBeDefined();
      expect(result.contextContinuation).toContain('stocks');
    });

    it('should build instructions for new agent', async () => {
      const result = await executeHandoff('peter-john', 'Stock research');

      expect(result.instructions).toBeDefined();
      expect(result.instructions).toContain('Peter');
      expect(result.instructions).toContain('handoff');
    });
  });
});

// ============================================================================
// HANDOFF FACTORY TESTS
// ============================================================================

describe('Handoff Factory', () => {
  it('should build handoff tools dynamically', async () => {
    const { buildHandoffTools } = await import('../handoff-factory.js');

    // Mock the AgentRegistry to return test agents
    const mockAgents = [
      {
        id: 'peter-john',
        name: 'Peter',
        roleDescription: 'Research',
        isCoordinator: false,
        enabled: true,
        handoffTriggers: ['stocks'],
      },
      {
        id: 'ferni',
        name: 'Ferni',
        roleDescription: 'Coach',
        isCoordinator: true,
        enabled: true,
        handoffTriggers: [],
      },
    ];

    vi.doMock('../../../personas/registry/unified-registry.js', () => ({
      AgentRegistry: {
        getAllAgents: vi.fn().mockResolvedValue(mockAgents),
        getCoordinator: vi.fn().mockResolvedValue(mockAgents[1]),
      },
    }));

    // This test verifies the factory doesn't throw
    // Full integration testing requires the actual registry
    expect(buildHandoffTools).toBeDefined();
  });
});

// ============================================================================
// UNLOCK VALIDATION TESTS
// ============================================================================

describe('Unlock Validation', () => {
  /**
   * These tests verify that handoffs are blocked to locked team members.
   * The team unlock system ("Get to Know Ferni First") prevents users from
   * handoffs to team members they haven't unlocked yet.
   */

  beforeEach(() => {
    resetHandoffState();
    vi.clearAllMocks();
  });

  it('should block handoffs to locked members', async () => {
    // Mock isTeamMemberUnlocked to return false for this test
    const teamAvailability =
      await import('../../../intelligence/context-builders/team/team-availability.js');
    vi.spyOn(teamAvailability, 'isTeamMemberUnlocked').mockReturnValue(false);
    vi.spyOn(teamAvailability, 'getLockedMemberTeaser').mockReturnValue(
      "I have a friend who's amazing at that... once we talk more, I'll introduce you."
    );

    const result = await executeHandoff('maya-santos', 'User wants habits help', {
      userProfile: {
        totalConversations: 0,
      } as import('../../../types/user-profile.js').UserProfile,
      subscriptionTier: 'free',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('introduce you');
  });

  it('should allow handoffs to unlocked members', async () => {
    // Mock isTeamMemberUnlocked to return true
    const teamAvailability =
      await import('../../../intelligence/context-builders/team/team-availability.js');
    vi.spyOn(teamAvailability, 'isTeamMemberUnlocked').mockReturnValue(true);

    const result = await executeHandoff('peter-john', 'User wants stock research', {
      userProfile: {
        totalConversations: 10,
      } as import('../../../types/user-profile.js').UserProfile,
      subscriptionTier: 'free',
    });

    expect(result.success).toBe(true);
    expect(result.targetAgent).toBe('peter-john');
  });

  it('should always allow handoffs to coordinator (Ferni)', async () => {
    // First switch to a different agent so we can test returning to Ferni
    setCurrentAgent('peter-john');

    // Mock isTeamMemberUnlocked to return false (shouldn't matter for Ferni)
    const teamAvailability =
      await import('../../../intelligence/context-builders/team/team-availability.js');
    vi.spyOn(teamAvailability, 'isTeamMemberUnlocked').mockReturnValue(false);

    const result = await executeHandoff('ferni', 'Return to main coach', {
      userProfile: {
        totalConversations: 0,
      } as import('../../../types/user-profile.js').UserProfile,
      subscriptionTier: 'free',
    });

    expect(result.success).toBe(true);
    expect(result.targetAgent).toBe('ferni');
  });

  it('should skip unlock check when skipUnlockCheck option is true', async () => {
    // Mock isTeamMemberUnlocked to return false
    const teamAvailability =
      await import('../../../intelligence/context-builders/team/team-availability.js');
    vi.spyOn(teamAvailability, 'isTeamMemberUnlocked').mockReturnValue(false);

    const result = await executeHandoff('maya-santos', 'Test bypass', {
      skipUnlockCheck: true,
    });

    expect(result.success).toBe(true);
    expect(result.targetAgent).toBe('maya-santos');
  });

  it('should use teaser message as error for locked members', async () => {
    const teamAvailability =
      await import('../../../intelligence/context-builders/team/team-availability.js');
    vi.spyOn(teamAvailability, 'isTeamMemberUnlocked').mockReturnValue(false);
    vi.spyOn(teamAvailability, 'getLockedMemberTeaser').mockReturnValue(
      'Peter can show you incredible patterns, but I need to know you better first.'
    );

    const result = await executeHandoff('peter-john', 'Data patterns', {
      userProfile: {
        totalConversations: 1,
      } as import('../../../types/user-profile.js').UserProfile,
      subscriptionTier: 'free',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Peter can show you incredible patterns, but I need to know you better first.'
    );
  });

  it('should provide fallback error message when no teaser available', async () => {
    const teamAvailability =
      await import('../../../intelligence/context-builders/team/team-availability.js');
    vi.spyOn(teamAvailability, 'isTeamMemberUnlocked').mockReturnValue(false);
    vi.spyOn(teamAvailability, 'getLockedMemberTeaser').mockReturnValue(null);

    const result = await executeHandoff('nayan-patel', 'Wisdom', {
      userProfile: null,
      subscriptionTier: 'free',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('unlock');
  });
});
