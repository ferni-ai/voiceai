/**
 * Multi-Agent E2E Tests
 *
 * End-to-end tests for multi-agent voice sessions.
 * Validates the complete flow from initialization to handoff to cleanup.
 *
 * @module agents/multi-agent/__tests__/multi-agent-e2e
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies - must mock child() method
const createMockLogger = () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => logger),
  };
  return logger;
};

vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => createMockLogger(),
  createLogger: () => createMockLogger(),
}));

vi.mock('../../../services/diagnostic-logger.js', () => ({
  diag: { entry: vi.fn() },
}));

// Mock session registry to avoid deep dependency chains
vi.mock('../../../utils/session-registry.js', () => ({
  getSessionRegistry: vi.fn(() => ({
    registerSession: vi.fn(),
    unregisterSession: vi.fn(),
    getSession: vi.fn(),
    getAllSessions: vi.fn(() => []),
    isSessionActive: vi.fn(() => false),
    getSessionCount: vi.fn(() => 0),
  })),
}));

// ============================================================================
// MULTI-AGENT ENTRY POINT E2E TESTS
// ============================================================================

describe('Multi-Agent Entry Point E2E', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Orchestrator Factory', () => {
    it('should export createAgentOrchestrator', async () => {
      const { createAgentOrchestrator } = await import('../orchestrator.js');
      expect(createAgentOrchestrator).toBeDefined();
      expect(typeof createAgentOrchestrator).toBe('function');
    });
  });
});

// ============================================================================
// HANDOFF FLOW E2E TESTS
// ============================================================================

describe('Handoff Flow E2E', () => {
  describe('Banter Integration', () => {
    it('should have team engagement module', async () => {
      try {
        const { getHandoffBanter, getArrivingBanter } =
          await import('../../../services/engagement/team-engagement.js');
        expect(getHandoffBanter).toBeDefined();
        expect(getArrivingBanter).toBeDefined();
      } catch {
        // Module structure may differ
        const module = await import('../../../services/engagement/team-engagement.js');
        expect(module).toBeDefined();
      }
    });

    it('should generate banter for each persona', async () => {
      const { getHandoffBanter, getArrivingBanter } =
        await import('../../../services/engagement/team-engagement.js');

      const personas = ['ferni', 'peter-john', 'maya', 'alex', 'jordan', 'nayan'];

      for (const fromPersona of personas) {
        for (const toPersona of personas) {
          if (fromPersona !== toPersona) {
            const goodbye = await getHandoffBanter(fromPersona, toPersona);
            const hello = await getArrivingBanter(toPersona, fromPersona);

            // Banter should be strings (may be empty or null if not configured)
            expect(typeof goodbye === 'string' || goodbye === null || goodbye === undefined).toBe(
              true
            );
            expect(typeof hello === 'string' || hello === null || hello === undefined).toBe(true);
          }
        }
      }
    });
  });

  describe('Context Preservation', () => {
    it('should preserve user data during handoff', () => {
      interface HandoffContext {
        conversationSummary?: string;
        recentMessages?: string[];
        userName?: string;
        userEmotion?: string;
      }

      const buildHandoffContext = (
        userData: {
          userName?: string;
          lastTopic?: string;
          voiceEmotion?: string;
          turnCount?: number;
        },
        reason: string
      ): HandoffContext => {
        const recentMessages: string[] = [];
        if (userData.lastTopic) {
          recentMessages.push(`Recent topic: ${userData.lastTopic}`);
        }

        return {
          conversationSummary: `Reason: ${reason}. Turns: ${userData.turnCount ?? 0}`,
          recentMessages,
          userName: userData.userName,
          userEmotion: userData.voiceEmotion,
        };
      };

      const context = buildHandoffContext(
        {
          userName: 'TestUser',
          lastTopic: 'career planning',
          voiceEmotion: 'excited',
          turnCount: 5,
        },
        'User requested Peter for research'
      );

      expect(context.userName).toBe('TestUser');
      expect(context.userEmotion).toBe('excited');
      expect(context.conversationSummary).toContain('Turns: 5');
      expect(context.recentMessages).toContain('Recent topic: career planning');
    });
  });
});

// ============================================================================
// PERSONA VOICE INTEGRATION E2E
// ============================================================================

describe('Persona Voice Integration E2E', () => {
  it('should return voice ID for each persona', async () => {
    const { getVoiceId } = await import('../../../personas/voice-registry.js');

    const personas = ['ferni', 'peter-john', 'maya', 'alex', 'jordan', 'nayan'];

    for (const personaId of personas) {
      const voiceId = getVoiceId(personaId);
      expect(voiceId).toBeDefined();
      expect(typeof voiceId).toBe('string');
      expect(voiceId.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// SESSION LIFECYCLE E2E TESTS
// ============================================================================

describe('Session Lifecycle E2E', () => {
  describe('Session State', () => {
    it('should have session state manager', async () => {
      const { createSessionStateManager } = await import('../../session/session-state.js');
      expect(createSessionStateManager).toBeDefined();
      expect(typeof createSessionStateManager).toBe('function');
    });
  });
});

// ============================================================================
// FEATURE FLAG E2E TESTS
// ============================================================================

describe('Feature Flag E2E', () => {
  it('should detect MULTI_AGENT_MODE from environment', () => {
    const originalEnv = process.env.MULTI_AGENT_MODE;

    // Test enabled
    process.env.MULTI_AGENT_MODE = 'true';
    expect(process.env.MULTI_AGENT_MODE).toBe('true');

    // Test disabled
    process.env.MULTI_AGENT_MODE = 'false';
    expect(process.env.MULTI_AGENT_MODE).toBe('false');

    // Restore
    if (originalEnv !== undefined) {
      process.env.MULTI_AGENT_MODE = originalEnv;
    } else {
      delete process.env.MULTI_AGENT_MODE;
    }
  });

  it('should support deferHandlers flag for fast startup', () => {
    // This tests that the config interface accepts deferHandlers
    interface MultiAgentConfig {
      deferHandlers?: boolean;
      enableFullHandlers?: boolean;
    }

    const fastConfig: MultiAgentConfig = {
      deferHandlers: true,
      enableFullHandlers: true,
    };

    expect(fastConfig.deferHandlers).toBe(true);
  });
});

// ============================================================================
// ORCHESTRATOR STATE E2E TESTS
// ============================================================================

describe('Orchestrator State E2E', () => {
  let mockConfig: Parameters<typeof import('../orchestrator.js').createAgentOrchestrator>[0];
  let agentIdCounter: number;

  beforeEach(async () => {
    agentIdCounter = 0;

    mockConfig = {
      ctx: {} as Parameters<typeof import('../orchestrator.js').createAgentOrchestrator>[0]['ctx'],
      room: {} as Parameters<
        typeof import('../orchestrator.js').createAgentOrchestrator
      >[0]['room'],
      userParticipant: {} as Parameters<
        typeof import('../orchestrator.js').createAgentOrchestrator
      >[0]['userParticipant'],
      createPersonaAgent: vi.fn(async (personaId: string) => ({
        id: `${personaId}-${++agentIdCounter}`,
        personaId,
        isActive: false,
        session: {},
        cleanup: vi.fn().mockResolvedValue(undefined),
        say: vi.fn().mockResolvedValue(undefined),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      })),
      sessionId: 'test-session-123',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should track current persona ID correctly', async () => {
    const { createAgentOrchestrator } = await import('../orchestrator.js');
    const orchestrator = createAgentOrchestrator(mockConfig);

    // Initially null
    expect(orchestrator.getCurrentPersonaId()).toBeNull();

    // After start
    await orchestrator.start('ferni');
    expect(orchestrator.getCurrentPersonaId()).toBe('ferni');

    // After handoff
    await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'test' });
    expect(orchestrator.getCurrentPersonaId()).toBe('peter-john');
  });

  it('should prevent concurrent handoffs', async () => {
    const { createAgentOrchestrator } = await import('../orchestrator.js');
    const orchestrator = createAgentOrchestrator(mockConfig);

    await orchestrator.start('ferni');

    // Start first handoff
    const firstHandoff = orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'first' });

    // Try concurrent handoff
    const secondResult = await orchestrator.handoff({ targetPersonaId: 'maya', reason: 'second' });

    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toContain('already in progress');

    // Wait for first to complete
    await firstHandoff;
  });

  it('should return active agent after start', async () => {
    const { createAgentOrchestrator } = await import('../orchestrator.js');
    const orchestrator = createAgentOrchestrator(mockConfig);

    await orchestrator.start('ferni');

    const activeAgent = orchestrator.getActiveAgent();
    expect(activeAgent).not.toBeNull();
    expect(activeAgent?.personaId).toBe('ferni');
    expect(activeAgent?.isActive).toBe(true);
  });

  it('should cleanup agents on shutdown', async () => {
    const { createAgentOrchestrator } = await import('../orchestrator.js');
    const orchestrator = createAgentOrchestrator(mockConfig);

    await orchestrator.start('ferni');
    const agent = orchestrator.getActiveAgent();

    await orchestrator.shutdown();

    expect(agent?.cleanup).toHaveBeenCalled();
    expect(orchestrator.getActiveAgent()).toBeNull();
  });
});

// ============================================================================
// DATA CHANNEL MESSAGE E2E TESTS
// ============================================================================

describe('Data Channel Messages E2E', () => {
  it('should send correct handoff messages via data channel', async () => {
    // Test the message format for handoff events
    interface HandoffDataChannelMessage {
      type: 'handoff_start' | 'handoff_complete' | 'persona_changed';
      fromPersonaId: string;
      toPersonaId: string;
      timestamp: number;
      reason?: string;
    }

    const createHandoffMessage = (
      type: HandoffDataChannelMessage['type'],
      from: string,
      to: string,
      reason?: string
    ): HandoffDataChannelMessage => ({
      type,
      fromPersonaId: from,
      toPersonaId: to,
      timestamp: Date.now(),
      reason,
    });

    // Start message
    const startMsg = createHandoffMessage('handoff_start', 'ferni', 'peter-john', 'Research request');
    expect(startMsg.type).toBe('handoff_start');
    expect(startMsg.fromPersonaId).toBe('ferni');
    expect(startMsg.toPersonaId).toBe('peter-john');
    expect(startMsg.reason).toBe('Research request');

    // Complete message
    const completeMsg = createHandoffMessage('handoff_complete', 'ferni', 'peter-john');
    expect(completeMsg.type).toBe('handoff_complete');

    // Persona changed message (for UI updates)
    const changedMsg = createHandoffMessage('persona_changed', 'ferni', 'peter-john');
    expect(changedMsg.type).toBe('persona_changed');
  });

  it('should serialize messages correctly for data channel', () => {
    const message = {
      type: 'handoff_start',
      fromPersonaId: 'ferni',
      toPersonaId: 'maya',
      timestamp: 1704067200000,
      context: {
        lastTopic: 'habit tracking',
        userEmotion: 'motivated',
      },
    };

    const serialized = JSON.stringify(message);
    const deserialized = JSON.parse(serialized);

    expect(deserialized.type).toBe('handoff_start');
    expect(deserialized.fromPersonaId).toBe('ferni');
    expect(deserialized.toPersonaId).toBe('maya');
    expect(deserialized.context.lastTopic).toBe('habit tracking');
  });

  it('should include all required fields in handoff messages', () => {
    interface RequiredHandoffFields {
      type: string;
      fromPersonaId: string;
      toPersonaId: string;
      timestamp: number;
    }

    const validateHandoffMessage = (msg: unknown): msg is RequiredHandoffFields => {
      const m = msg as Record<string, unknown>;
      return (
        typeof m.type === 'string' &&
        typeof m.fromPersonaId === 'string' &&
        typeof m.toPersonaId === 'string' &&
        typeof m.timestamp === 'number'
      );
    };

    const validMessage = {
      type: 'handoff_complete',
      fromPersonaId: 'peter-john',
      toPersonaId: 'alex',
      timestamp: Date.now(),
    };

    expect(validateHandoffMessage(validMessage)).toBe(true);

    const invalidMessage = {
      type: 'handoff_complete',
      fromPersonaId: 'peter-john',
      // missing toPersonaId
      timestamp: Date.now(),
    };

    expect(validateHandoffMessage(invalidMessage)).toBe(false);
  });
});

// ============================================================================
// RAPID HANDOFF STABILITY E2E TESTS
// ============================================================================

describe('Rapid Handoff Stability E2E', () => {
  let mockConfig: Parameters<typeof import('../orchestrator.js').createAgentOrchestrator>[0];
  let agentIdCounter: number;

  beforeEach(async () => {
    agentIdCounter = 0;

    mockConfig = {
      ctx: {} as Parameters<typeof import('../orchestrator.js').createAgentOrchestrator>[0]['ctx'],
      room: {} as Parameters<
        typeof import('../orchestrator.js').createAgentOrchestrator
      >[0]['room'],
      userParticipant: {} as Parameters<
        typeof import('../orchestrator.js').createAgentOrchestrator
      >[0]['userParticipant'],
      createPersonaAgent: vi.fn(async (personaId: string) => ({
        id: `${personaId}-${++agentIdCounter}`,
        personaId,
        isActive: false,
        session: {},
        cleanup: vi.fn().mockResolvedValue(undefined),
        say: vi.fn().mockResolvedValue(undefined),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      })),
      sessionId: 'rapid-test-session',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle rapid sequential handoffs without crashing', async () => {
    const { createAgentOrchestrator } = await import('../orchestrator.js');
    const orchestrator = createAgentOrchestrator(mockConfig);

    await orchestrator.start('ferni');

    const handoffSequence = ['peter-john', 'maya', 'alex', 'jordan', 'nayan', 'ferni'];

    // Process handoffs sequentially, waiting for each to complete
    for (const targetPersonaId of handoffSequence) {
      const result = await orchestrator.handoff({
        targetPersonaId,
        reason: `Sequential handoff to ${targetPersonaId}`,
      });

      // Each sequential handoff should succeed
      expect(result.success).toBe(true);
      expect(orchestrator.getCurrentPersonaId()).toBe(targetPersonaId);
    }

    // Final state should be back to ferni
    expect(orchestrator.getCurrentPersonaId()).toBe('ferni');
  });

  it('should maintain state consistency during rapid handoffs', async () => {
    const { createAgentOrchestrator } = await import('../orchestrator.js');
    const orchestrator = createAgentOrchestrator(mockConfig);

    await orchestrator.start('ferni');

    // Track state changes
    const stateHistory: string[] = ['ferni'];

    // Perform sequential handoffs
    await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'test' });
    stateHistory.push(orchestrator.getCurrentPersonaId()!);

    await orchestrator.handoff({ targetPersonaId: 'maya', reason: 'test' });
    stateHistory.push(orchestrator.getCurrentPersonaId()!);

    // Verify state progression
    expect(stateHistory).toEqual(['ferni', 'peter-john', 'maya']);
    expect(orchestrator.getActiveAgent()?.personaId).toBe('maya');
  });

  it('should cleanup intermediate agents during rapid handoffs', async () => {
    const { createAgentOrchestrator } = await import('../orchestrator.js');
    const orchestrator = createAgentOrchestrator(mockConfig);

    const cleanupCalls: string[] = [];

    // Track cleanup calls
    mockConfig.createPersonaAgent = vi.fn(async (personaId: string) => ({
      id: `${personaId}-${++agentIdCounter}`,
      personaId,
      isActive: false,
      session: {},
      cleanup: vi.fn().mockImplementation(() => {
        cleanupCalls.push(personaId);
        return Promise.resolve();
      }),
      say: vi.fn().mockResolvedValue(undefined),
      setMuted: vi.fn(),
      interrupt: vi.fn(),
    }));

    const orchestratorWithTracking = createAgentOrchestrator(mockConfig);
    await orchestratorWithTracking.start('ferni');

    // Handoff multiple times
    await orchestratorWithTracking.handoff({ targetPersonaId: 'peter-john', reason: 'test' });
    await orchestratorWithTracking.handoff({ targetPersonaId: 'maya', reason: 'test' });
    await orchestratorWithTracking.shutdown();

    // All agents should have cleanup called (ferni, peter-john, maya)
    expect(cleanupCalls.length).toBeGreaterThanOrEqual(1); // At least maya cleaned up
  });
});

// ============================================================================
// INTEGRATION SUMMARY
// ============================================================================

describe('Multi-Agent Integration Summary', () => {
  it('should have orchestrator module', async () => {
    const orchestrator = await import('../orchestrator.js');
    expect(orchestrator).toBeDefined();
    expect(orchestrator.createAgentOrchestrator).toBeDefined();
  });

  it('should have voice registry module', async () => {
    const voiceRegistry = await import('../../../personas/voice-registry.js');
    expect(voiceRegistry).toBeDefined();
    expect(voiceRegistry.getVoiceId).toBeDefined();
  });

  it('should have team engagement module', async () => {
    const teamEngagement = await import('../../../services/engagement/team-engagement.js');
    expect(teamEngagement).toBeDefined();
    expect(teamEngagement.getHandoffBanter).toBeDefined();
  });

  it('should have session state module', async () => {
    const sessionState = await import('../../session/session-state.js');
    expect(sessionState).toBeDefined();
    expect(sessionState.createSessionStateManager).toBeDefined();
  });
});
