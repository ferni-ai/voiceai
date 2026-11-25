/**
 * Unified Tool Orchestrator Tests
 *
 * Tests the core tool selection logic including:
 * - Semantic retrieval
 * - Always-available tools
 * - Contextual tool loading
 * - Intent detection
 * - Caching behavior
 *
 * Run: npx vitest run src/tools/orchestrator/__tests__/unified-tool-orchestrator.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger - defined inside factory to avoid hoisting issues
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
  };
});

// Mock tool registry
const mockTools = new Map<string, { id: string; domain: string; description: string }>();
vi.mock('../../registry/index.js', () => ({
  toolRegistry: {
    getAll: () => Array.from(mockTools.values()),
    get: (id: string) => mockTools.get(id),
    query: ({ domains }: { domains?: string[] }) => {
      if (!domains) return Array.from(mockTools.values());
      return Array.from(mockTools.values()).filter((t) => domains.includes(t.domain));
    },
    isInitialized: () => true,
  },
}));

// Mock registry loader
vi.mock('../../registry/loader.js', () => ({
  initializeToolRegistry: vi.fn().mockResolvedValue({
    loaded: 10,
    byDomain: {},
    errors: [],
    lazyLoadingEnabled: true,
    remainingDomains: [],
  }),
  loadToolDomainsLazy: vi.fn().mockResolvedValue({
    loaded: 0,
    byDomain: {},
    errors: [],
    lazyLoadingEnabled: true,
    remainingDomains: [],
  }),
}));

// Mock semantic router: the module tool-orchestrator.ts and tool-fetchers.ts import
const mockSemanticMatches: Array<{
  toolId: string;
  domain: string;
  similarity: number;
  description: string;
}> = [];
vi.mock('../../semantic-router/compat.js', () => ({
  semanticRouter: {
    initialize: vi.fn().mockResolvedValue(undefined),
    findRelevantToolsAsync: vi.fn().mockImplementation(async () => mockSemanticMatches),
    clearCache: vi.fn(),
  },
}));

// No built dist/tool-embeddings.json: without this, a machine that has run `pnpm dev` takes the
// precomputed fast path and the router stub above never runs (#4036)
vi.mock('../../semantic-router/precomputed-embeddings.js', () => ({
  areEmbeddingsLoaded: () => false,
  loadPrecomputedEmbeddings: vi.fn().mockRejectedValue(new Error('not built in tests')),
  semanticSearchTools: vi.fn().mockResolvedValue([]),
}));

// Mock tool lifecycle
vi.mock('../../advanced/tool-lifecycle.js', () => ({
  initializeToolLifecycle: vi.fn().mockResolvedValue(undefined),
  isToolDeprecated: vi.fn().mockReturnValue(false),
  getSuggestedReplacement: vi.fn().mockReturnValue(null),
}));

// Mock model config (admin settings)
vi.mock('../../../services/model-config.js', () => ({
  modelConfig: {
    getDefaultToolConfig: () => ({
      debugMode: false,
      maxTools: 35,
      enabledDomains: [],
      excludedTools: [],
      includedTools: [],
      logToolSchemas: false,
      logToolResults: false,
      useOrchestrator: true,
    }),
    getPersonaConfig: vi.fn(),
    getDefaults: vi.fn(),
  },
}));

// Mock builder
vi.mock('../../builder.js', () => ({
  buildEssentialTools: vi.fn().mockResolvedValue({}),
}));

// Import after mocks
import { getLogger } from '../../../utils/safe-logger.js';
import { initializeToolRegistry } from '../../registry/loader.js';
import { semanticRouter } from '../../semantic-router/compat.js';
import { UnifiedToolOrchestrator } from '../tool-orchestrator.js';

// Tools from the always-on domains in the config below (entertainment, memory, handoff, information)
const ALWAYS_ON = ['getWeather', 'handoffToMaya', 'playMusic', 'rememberUser'];

/** A semantic match for a tool outside the always-on domains: only the router can select it. */
function pushSemanticMatch(toolId: string, domain: string, similarity = 0.92): void {
  mockSemanticMatches.push({ toolId, domain, similarity, description: toolId });
}

function toolIds(tools: Record<string, unknown>): string[] {
  return Object.keys(tools).sort();
}

describe('UnifiedToolOrchestrator', () => {
  let orchestrator: UnifiedToolOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTools.clear();
    mockSemanticMatches.length = 0;

    // Set up some mock tools
    const testTools = [
      { id: 'playMusic', domain: 'entertainment', description: 'Play music' },
      { id: 'rememberUser', domain: 'memory', description: 'Remember user info' },
      { id: 'handoffToMaya', domain: 'handoff', description: 'Handoff to Maya' },
      { id: 'getWeather', domain: 'information', description: 'Get weather' },
      { id: 'processGrief', domain: 'grief', description: 'Process grief' },
      { id: 'guidedBreathing', domain: 'presence', description: 'Guided breathing' },
    ];

    for (const tool of testTools) {
      mockTools.set(tool.id, {
        ...tool,
        create: () => ({ description: tool.description }),
      } as never);
    }

    orchestrator = new UnifiedToolOrchestrator({
      maxTools: 35,
      semanticThreshold: 0.15,
      precomputeEmbeddings: true,
      alwaysDomains: ['memory', 'handoff', 'entertainment', 'information', 'games'],
      enableContextualTools: true,
      // New model-config.json connected settings
      enabledDomains: [],
      excludedTools: [],
      includedTools: [],
      debugMode: false,
      logToolSchemas: false,
      logToolResults: false,
    });
  });

  afterEach(() => {
    orchestrator.clearCaches();
  });

  describe('initialization', () => {
    it('should initialize all subsystems', async () => {
      await orchestrator.initialize();

      const stats = orchestrator.getStats();
      expect(stats.initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await orchestrator.initialize();
      await orchestrator.initialize();

      expect(orchestrator.getStats().initialized).toBe(true);
      expect(initializeToolRegistry).toHaveBeenCalledTimes(1);
    });
  });

  describe('getToolsForIntent', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('adds a semantic match from outside the always-on domains', async () => {
      pushSemanticMatch('guidedBreathing', 'presence');

      const result = await orchestrator.getToolsForIntent({
        transcript: 'play some relaxing jazz',
        userId: 'test-user',
        agentId: 'ferni',
      });

      expect(toolIds(result.tools)).toEqual([...ALWAYS_ON, 'guidedBreathing'].sort());
      expect(result.meta.sources.semantic).toBe(1);
      expect(result.meta.semanticMatches.map((m) => m.toolId)).toEqual(['guidedBreathing']);
    });

    it('selects exactly the always-on tools when nothing else matches', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'hello',
        userId: 'test-user',
        agentId: 'ferni',
      });

      expect(toolIds(result.tools)).toEqual(ALWAYS_ON);
      expect(result.meta.sources).toMatchObject({ essential: 4, semantic: 0, contextual: 0 });
    });

    describe('a tool set over the schema token budget (#4399)', () => {
      const select = (agentId: string, transcript: string) =>
        orchestrator.getToolsForIntent({ transcript, userId: 'test-user', agentId });
      const budgetWarnings = () =>
        vi
          .mocked(getLogger().warn)
          .mock.calls.filter(([, message]) => /budget/.test(String(message)));

      beforeEach(() => {
        // 60 always-on tools of about 160 estimated tokens each: 9,600 against the 8,000 budget
        for (let i = 0; i < 60; i++) {
          const description = 'x'.repeat(400);
          mockTools.set(`bulk${i}`, {
            id: `bulk${i}`,
            domain: 'information',
            description,
            create: () => ({ description }),
          } as never);
        }
      });

      const freshOrchestrator = async (maxTools: number) => {
        orchestrator = new UnifiedToolOrchestrator({
          maxTools,
          semanticThreshold: 0.15,
          precomputeEmbeddings: true,
          alwaysDomains: ['information'],
          enableContextualTools: false,
          enabledDomains: [],
          excludedTools: [],
          includedTools: [],
          debugMode: false,
          logToolSchemas: false,
          logToolResults: false,
        });
        await orchestrator.initialize();
      };

      it('warns once per persona, with the numbers and a lever that can be followed', async () => {
        await freshOrchestrator(100);
        await select('budget-persona-a', 'hello');
        await select('budget-persona-a', 'good morning');
        await select('budget-persona-a', 'how are you');
        await select('budget-persona-b', 'hello');

        const warnings = budgetWarnings();
        expect(warnings.map(([fields]) => (fields as { personaId: string }).personaId)).toEqual([
          'budget-persona-a',
          'budget-persona-b',
        ]);
        expect(warnings[0]?.[0]).toMatchObject({ toolCount: 61, usagePercent: 121, maxTools: 100 });
        expect(String(warnings[0]?.[1])).toMatch(/lower it/);
        expect(String(warnings[0]?.[1])).not.toMatch(/consider reducing/);
      });

      it('says the router is the lever when maxTools is 0 (no cap)', async () => {
        await freshOrchestrator(0);
        await select('budget-persona-c', 'hello');

        expect(String(budgetWarnings().at(-1)?.[1])).toMatch(/maxTools is 0.*semantic router/);
      });
    });

    it('detects a presence intent and loads presence tools for a stressed caller', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'I am feeling really stressed about my job',
        userId: 'test-user',
        agentId: 'ferni',
        context: {
          emotion: 'stressed',
        },
      });

      expect(result.meta.detectedIntent?.domains).toEqual(['presence']);
      expect(result.meta.sources.contextual).toBe(1);
      expect(result.tools['guidedBreathing']).toBeDefined();
    });

    it('should respect forceInclude option', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'hello',
        userId: 'test-user',
        agentId: 'ferni',
        forceInclude: ['processGrief'],
      });

      expect(toolIds(result.tools)).toEqual([...ALWAYS_ON, 'processGrief'].sort());
    });

    it('should respect forceExclude option', async () => {
      pushSemanticMatch('guidedBreathing', 'presence');
      pushSemanticMatch('processGrief', 'grief', 0.8);

      const result = await orchestrator.getToolsForIntent({
        transcript: 'play some music',
        userId: 'test-user',
        agentId: 'ferni',
        forceExclude: ['playMusic', 'processGrief'],
      });

      expect(toolIds(result.tools)).toEqual([
        'getWeather',
        'guidedBreathing',
        'handoffToMaya',
        'rememberUser',
      ]);
    });

    it('should cache results for identical requests', async () => {
      pushSemanticMatch('guidedBreathing', 'presence');

      const request = {
        transcript: 'play some jazz',
        userId: 'test-user',
        agentId: 'ferni',
      };

      const result1 = await orchestrator.getToolsForIntent(request);
      const result2 = await orchestrator.getToolsForIntent(request);

      expect(result1.tools['guidedBreathing']).toBeDefined();
      expect(result2).toBe(result1);
      expect(semanticRouter.findRelevantToolsAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('contextual tools', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should load presence tools for stressed emotion', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'hello',
        userId: 'test-user',
        agentId: 'ferni',
        context: {
          emotion: 'stressed',
        },
      });

      expect(result.meta.sources.contextual).toBe(1);
      expect(toolIds(result.tools)).toEqual([...ALWAYS_ON, 'guidedBreathing'].sort());
    });

    it('should load grief tools for sad emotion', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'I lost someone close to me',
        userId: 'test-user',
        agentId: 'ferni',
        context: {
          emotion: 'sad',
        },
      });

      expect(result.meta.sources.contextual).toBe(1);
      expect(toolIds(result.tools)).toEqual([...ALWAYS_ON, 'processGrief'].sort());
    });

    it('should load morning-appropriate tools', async () => {
      mockTools.set('morningRoutine', {
        id: 'morningRoutine',
        domain: 'habits',
        description: 'Morning routine',
        create: () => ({ description: 'Morning routine' }),
      } as never);

      const result = await orchestrator.getToolsForIntent({
        transcript: 'good morning',
        userId: 'test-user',
        agentId: 'ferni',
        context: {
          timeOfDay: 'morning',
        },
      });

      expect(result.meta.sources.contextual).toBe(1);
      expect(result.tools['morningRoutine']).toBeDefined();
    });
  });

  describe('shouldRefreshTools', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should recommend refresh on significant topic change', async () => {
      const result = await orchestrator.shouldRefreshTools({
        newTranscript: 'my dad passed away last week',
        previousTools: ['playMusic', 'rememberUser'],
        sessionId: 'test-session',
      });

      expect(result).toMatchObject({
        shouldRefresh: true,
        toolsToAdd: ['processGrief'],
        toolsToRemove: [],
      });
    });

    it('should not recommend refresh for similar topics', async () => {
      const result = await orchestrator.shouldRefreshTools({
        newTranscript: 'play another song',
        previousTools: ['playMusic', 'rememberUser'],
        sessionId: 'test-session',
      });

      expect(result).toEqual({
        shouldRefresh: false,
        toolsToAdd: [],
        toolsToRemove: [],
        reason: 'Current tools sufficient for detected intent',
      });
    });
  });

  describe('explainSelection', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should generate human-readable explanation', async () => {
      pushSemanticMatch('guidedBreathing', 'presence');

      const result = await orchestrator.getToolsForIntent({
        transcript: 'play some jazz',
        userId: 'test-user',
        agentId: 'ferni',
      });

      const explanation = orchestrator.explainSelection(result);

      expect(explanation).toContain('Tool Selection Breakdown');
      expect(explanation).toContain('Selected 5 of 6 tools');
      expect(explanation).toContain('Semantic (matched): 1');
      expect(explanation).toContain('guidedBreathing (92%)');
    });
  });

  describe('stats and cache management', () => {
    it('should return accurate stats', async () => {
      await orchestrator.initialize();

      const stats = orchestrator.getStats();

      expect(stats).toMatchObject({ initialized: true, totalTools: 6, cacheSize: 0 });
      expect(stats.config.maxTools).toBe(35);
    });

    it('should clear caches on demand', async () => {
      await orchestrator.initialize();

      // Make a request to populate cache
      await orchestrator.getToolsForIntent({
        transcript: 'test',
        userId: 'test-user',
        agentId: 'ferni',
      });
      expect(orchestrator.getStats().cacheSize).toBe(1);

      orchestrator.clearCaches();

      const stats = orchestrator.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });
});

describe('Intent Detection Integration', () => {
  let orchestrator: UnifiedToolOrchestrator;

  beforeEach(async () => {
    mockTools.clear();
    mockSemanticMatches.length = 0;

    // Add tools for various domains
    const tools = [
      { id: 'processGrief', domain: 'grief', description: 'Process grief' },
      { id: 'decisionFramework', domain: 'decisions', description: 'Decision framework' },
      { id: 'relationshipAdvice', domain: 'relationships', description: 'Relationship advice' },
    ];

    for (const tool of tools) {
      mockTools.set(tool.id, {
        ...tool,
        create: () => ({ description: tool.description }),
      } as never);
    }

    orchestrator = new UnifiedToolOrchestrator();
    await orchestrator.initialize();
  });

  afterEach(() => {
    orchestrator.clearCaches();
  });

  it('should detect grief-related intent', async () => {
    const result = await orchestrator.getToolsForIntent({
      transcript: 'my mother passed away last month',
      userId: 'test-user',
      agentId: 'ferni',
    });

    expect(result.meta.detectedIntent?.categories).toEqual(['grief']);
    expect(result.tools['processGrief']).toBeDefined();
  });

  it('should detect decision-related intent', async () => {
    const result = await orchestrator.getToolsForIntent({
      transcript: 'should I take this new job offer',
      userId: 'test-user',
      agentId: 'ferni',
    });

    expect(result.meta.detectedIntent?.categories).toContain('decisions');
    expect(result.tools['decisionFramework']).toBeDefined();
  });

  it('should detect relationship-related intent', async () => {
    const result = await orchestrator.getToolsForIntent({
      transcript: 'my partner and I are having issues',
      userId: 'test-user',
      agentId: 'ferni',
    });

    expect(result.meta.detectedIntent?.categories).toEqual(['relationships']);
    expect(result.tools['relationshipAdvice']).toBeDefined();
  });
});
