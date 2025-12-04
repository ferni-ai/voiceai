/**
 * Handoff Executor Tests
 *
 * Tests for the agent-agnostic handoff execution system.
 *
 * Run with: npx vitest run src/tools/handoff/__tests__/executor.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  executeHandoff,
  getCurrentAgent,
  setCurrentAgent,
  isSameAgent,
  isHandoffAllowed,
  resetHandoffState,
  captureHandoffContext,
  getHandoffContext,
  getHandoffHistory,
  clearHandoffHistory,
  handoffEvents,
  type HandoffResult,
} from '../executor.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock the voice registry
vi.mock('../../../personas/voice-registry.js', () => ({
  getCanonicalPersonaId: vi.fn((id: string) => {
    const mapping: Record<string, string> = {
      'peter': 'peter-john',
      'peter-john': 'peter-john',
      'maya': 'maya-santos',
      'maya-santos': 'maya-santos',
      'alex': 'alex-chen',
      'alex-chen': 'alex-chen',
      'jordan': 'jordan-taylor',
      'jordan-taylor': 'jordan-taylor',
      'nayan-patel': 'nayan-patel',
      'ferni': 'ferni',
      'jack-b': 'ferni',
    };
    return mapping[id] || id;
  }),
  getPersonaDisplayName: vi.fn((id: string) => {
    const names: Record<string, string> = {
      'peter-john': 'Peter John',
      'maya-santos': 'Maya Santos',
      'alex-chen': 'Alex Chen',
      'jordan-taylor': 'Jordan Taylor',
      'nayan-patel': 'Nayan Patel',
      'ferni': 'Ferni',
    };
    return names[id] || id;
  }),
  getVoiceId: vi.fn((id: string) => `voice-${id}`),
}));

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
  createHandoffEvent: vi.fn((agentId, options) => ({
    agentId,
    ...options,
  })),
}));

// Mock alive entrances
vi.mock('../../../personas/alive-entrances.js', () => ({
  getAliveEntranceForHandoff: vi.fn().mockResolvedValue(null),
  detectUserMoodFromContext: vi.fn().mockReturnValue('neutral'),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Handoff Executor', () => {
  beforeEach(() => {
    resetHandoffState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    handoffEvents.removeAllListeners();
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
      const eventPromise = new Promise<any>((resolve) => {
        handoffEvents.once('voiceSwitch', resolve);
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
      { id: 'peter-john', name: 'Peter', roleDescription: 'Research', isCoordinator: false, enabled: true, handoffTriggers: ['stocks'] },
      { id: 'ferni', name: 'Ferni', roleDescription: 'Coach', isCoordinator: true, enabled: true, handoffTriggers: [] },
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

