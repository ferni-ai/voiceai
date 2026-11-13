/**
 * Multi-Agent Orchestrator Tests
 *
 * Tests the AgentOrchestrator for:
 * - Initial agent spawning
 * - Handoff flow
 * - Concurrent handoff prevention
 * - Cleanup
 *
 * @module agents/multi-agent/__tests__/orchestrator.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentOrchestrator,
  createAgentOrchestrator,
  type PersonaAgent,
  type OrchestratorConfig,
} from '../orchestrator.js';

// Mock all external dependencies - must include both createLogger and getLogger
vi.mock('../../../utils/safe-logger.js', async () => {
  const { realReplyForLog } = await import('../../../tests/helpers/real-reply-for-log.js');
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => mockLogger,
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
    ...(await realReplyForLog()),
  };
});

vi.mock('../../../services/diagnostic-logger.js', () => ({
  diag: {
    entry: vi.fn(),
  },
}));

// Mock the engagement module that's loaded via require()
vi.mock('../../../services/engagement/team-engagement.js', () => ({
  getHandoffBanter: () => 'Goodbye!',
  getArrivingBanter: () => 'Hello!',
}));

describe('AgentOrchestrator', () => {
  let mockConfig: OrchestratorConfig;
  let mockAgents: Map<string, PersonaAgent>;
  let agentIdCounter: number;

  beforeEach(() => {
    // Each line is waited out for its estimated length (seconds); nothing here plays audio
    vi.spyOn(
      AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
      'estimateSpeechDuration'
    ).mockReturnValue(0);
    mockAgents = new Map();
    agentIdCounter = 0;

    // Create mock agent factory
    const createPersonaAgent = vi.fn(async (personaId: string): Promise<PersonaAgent> => {
      const agentId = `${personaId}-${++agentIdCounter}`;
      const agent: PersonaAgent = {
        id: agentId,
        personaId,
        isActive: false,
        session: {},
        cleanup: vi.fn().mockResolvedValue(undefined),
        say: vi.fn(),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      };
      mockAgents.set(agentId, agent);
      return agent;
    });

    mockConfig = {
      ctx: {} as OrchestratorConfig['ctx'],
      room: {} as OrchestratorConfig['room'],
      userParticipant: {} as OrchestratorConfig['userParticipant'],
      createPersonaAgent,
      sessionId: 'test-session-123',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('start()', () => {
    it('should spawn initial agent and make it active', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);

      const agent = await orchestrator.start('ferni');

      expect(agent.personaId).toBe('ferni');
      expect(agent.isActive).toBe(true);
      expect(orchestrator.getCurrentPersonaId()).toBe('ferni');
      expect(mockConfig.createPersonaAgent).toHaveBeenCalledWith('ferni', expect.any(Object));
    });

    it('should pass isHandoff=false for initial agent', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);

      await orchestrator.start('ferni');

      expect(mockConfig.createPersonaAgent).toHaveBeenCalledWith(
        'ferni',
        expect.objectContaining({
          isHandoff: false,
        })
      );
    });
  });

  describe('handoff()', () => {
    it('should execute handoff successfully', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      await orchestrator.start('ferni');

      const result = await orchestrator.handoff({
        targetPersonaId: 'peter-john',
        reason: 'User wants research help',
      });

      expect(result.success).toBe(true);
      expect(orchestrator.getCurrentPersonaId()).toBe('peter-john');
      expect(result.durationMs).toBeDefined();
    });

    it('should fail if already with target persona', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      await orchestrator.start('ferni');

      const result = await orchestrator.handoff({
        targetPersonaId: 'ferni',
        reason: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Already with');
    });

    it('should fail if handoff already in progress', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      await orchestrator.start('ferni');

      // Start a slow handoff
      const slowHandoff = orchestrator.handoff({
        targetPersonaId: 'peter-john',
        reason: 'first',
      });

      // Try to start another
      const result = await orchestrator.handoff({
        targetPersonaId: 'maya',
        reason: 'second',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already in progress');

      // Wait for first to complete
      await slowHandoff;
    });

    it('should call goodbye and greeting banter', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      const ferniAgent = await orchestrator.start('ferni');

      await orchestrator.handoff({
        targetPersonaId: 'peter-john',
        reason: 'test',
      });

      // Ferni should have said goodbye
      expect(ferniAgent.say).toHaveBeenCalled();

      // Peter should have greeted
      const peterAgent = orchestrator.getActiveAgent();
      expect(peterAgent?.say).toHaveBeenCalled();
    });

    it('should cleanup old agent after handoff', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      const ferniAgent = await orchestrator.start('ferni');

      await orchestrator.handoff({
        targetPersonaId: 'peter-john',
        reason: 'test',
      });

      expect(ferniAgent.cleanup).toHaveBeenCalled();
    });

    it('should pass conversation context to new agent', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      await orchestrator.start('ferni');

      await orchestrator.handoff({
        targetPersonaId: 'peter-john',
        reason: 'User wants research help',
        conversationSummary: 'Discussed morning habits',
        recentMessages: ['User: I need help with research'],
        userName: 'TestUser',
      });

      // Check that createPersonaAgent was called twice (once for ferni, once for peter)
      expect(mockConfig.createPersonaAgent).toHaveBeenCalledTimes(2);

      // Check the second call (peter-john) has handoff context
      const secondCall = (mockConfig.createPersonaAgent as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(secondCall[0]).toBe('peter-john');
      expect(secondCall[1]).toMatchObject({
        isHandoff: true,
        previousPersonaId: 'ferni',
        conversationSummary: 'Discussed morning habits',
        recentMessages: ['User: I need help with research'],
      });
    });

    it('should call onHandoffComplete callback', async () => {
      const onHandoffComplete = vi.fn();
      mockConfig.onHandoffComplete = onHandoffComplete;

      const orchestrator = createAgentOrchestrator(mockConfig);
      await orchestrator.start('ferni');

      await orchestrator.handoff({
        targetPersonaId: 'peter-john',
        reason: 'test',
      });

      expect(onHandoffComplete).toHaveBeenCalledWith('ferni', 'peter-john');
    });
  });

  // This file's safe-logger mock takes replyForLog from tests/helpers/real-reply-for-log.ts:
  // with no database set (prod) the goodbye is logged as a length, never as the words.
  describe('the goodbye in the log', () => {
    const handOffAndReadLog = async () => {
      const { getLogger } = await import('../../../utils/safe-logger.js');
      const orchestrator = createAgentOrchestrator(mockConfig);
      const ferniAgent = await orchestrator.start('ferni');
      await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'test' });
      const spoken = vi.mocked(ferniAgent.say).mock.calls.at(-1)?.[0] ?? '';
      const fields = vi
        .mocked(getLogger().info)
        .mock.calls.map((call: unknown[]): unknown => call[0])
        .find(
          (first): first is Record<string, unknown> =>
            typeof first === 'object' && first !== null && 'goodbyePreview' in first
        );
      expect(spoken.length).toBeGreaterThan(0);
      return { spoken, preview: fields?.goodbyePreview };
    };

    afterEach(() => vi.unstubAllEnvs());

    it('logs a length, not the words, when no database is set (prod)', async () => {
      vi.stubEnv('FIRESTORE_DATABASE', undefined);
      const { spoken, preview } = await handOffAndReadLog();
      expect(preview).toBe(`[${spoken.length} chars]`);
      expect(preview).not.toContain(spoken);
    });

    it('logs the words on a dev database (positive control)', async () => {
      vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
      const { spoken, preview } = await handOffAndReadLog();
      expect(preview).toBe(spoken);
    });
  });

  describe('shutdown()', () => {
    it('should cleanup all agents', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      await orchestrator.start('ferni');
      await orchestrator.handoff({
        targetPersonaId: 'peter-john',
        reason: 'test',
      });

      // Get reference before shutdown
      const peterAgent = orchestrator.getActiveAgent();

      await orchestrator.shutdown();

      expect(peterAgent?.cleanup).toHaveBeenCalled();
      expect(orchestrator.getActiveAgent()).toBeNull();
    });
  });

  describe('isHandoffInProgress()', () => {
    it('should return false when idle', async () => {
      const orchestrator = createAgentOrchestrator(mockConfig);
      await orchestrator.start('ferni');

      expect(orchestrator.isHandoffInProgress()).toBe(false);
    });
  });
});
