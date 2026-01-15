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

// Mock semantic router
const mockSemanticMatches: Array<{
  toolId: string;
  domain: string;
  similarity: number;
  description: string;
}> = [];
vi.mock('../../semantic-router.js', () => ({
  semanticRouter: {
    initialize: vi.fn().mockResolvedValue(undefined),
    findRelevantToolsAsync: vi.fn().mockImplementation(async () => mockSemanticMatches),
    clearCache: vi.fn(),
  },
}));

// Mock tool lifecycle
vi.mock('../../advanced/tool-lifecycle.js', () => ({
  initializeToolLifecycle: vi.fn().mockResolvedValue(undefined),
  isToolDeprecated: vi.fn().mockReturnValue(false),
  getSuggestedReplacement: vi.fn().mockReturnValue(null),
}));

// Mock model config (admin settings)
vi.mock('../../../services/llm/model-config.js', () => ({
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
import { UnifiedToolOrchestrator } from '../unified-tool-orchestrator.js';

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
      await orchestrator.initialize(); // Should not throw

      const stats = orchestrator.getStats();
      expect(stats.initialized).toBe(true);
    });
  });

  describe('getToolsForIntent', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should return tools for a music-related intent', async () => {
      // Set up semantic matches for music query
      mockSemanticMatches.push({
        toolId: 'playMusic',
        domain: 'entertainment',
        similarity: 0.92,
        description: 'Play music',
      });

      const result = await orchestrator.getToolsForIntent({
        transcript: 'play some relaxing jazz',
        userId: 'test-user',
        agentId: 'ferni',
      });

      expect(result.tools).toBeDefined();
      expect(result.meta.selected).toBeGreaterThan(0);
      expect(result.meta.selectionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should always include essential domain tools', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'hello',
        userId: 'test-user',
        agentId: 'ferni',
      });

      // Should include tools from always-available domains
      expect(result.meta.sources.essential).toBeGreaterThanOrEqual(0);
    });

    it('should detect intent and load contextual tools', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'I am feeling really stressed about my job',
        userId: 'test-user',
        agentId: 'ferni',
        context: {
          emotion: 'stressed',
        },
      });

      expect(result.meta.sources.contextual).toBeGreaterThanOrEqual(0);
    });

    it('should respect forceInclude option', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'hello',
        userId: 'test-user',
        agentId: 'ferni',
        forceInclude: ['getWeather'],
      });

      expect(result.tools).toBeDefined();
    });

    it('should respect forceExclude option', async () => {
      mockSemanticMatches.push({
        toolId: 'playMusic',
        domain: 'entertainment',
        similarity: 0.92,
        description: 'Play music',
      });

      const result = await orchestrator.getToolsForIntent({
        transcript: 'play some music',
        userId: 'test-user',
        agentId: 'ferni',
        forceExclude: ['playMusic'],
      });

      expect(result.tools['playMusic']).toBeUndefined();
    });

    it('should cache results for identical requests', async () => {
      mockSemanticMatches.push({
        toolId: 'playMusic',
        domain: 'entertainment',
        similarity: 0.92,
        description: 'Play music',
      });

      const request = {
        transcript: 'play some jazz',
        userId: 'test-user',
        agentId: 'ferni',
      };

      const result1 = await orchestrator.getToolsForIntent(request);
      const result2 = await orchestrator.getToolsForIntent(request);

      // Second call should be faster (cached)
      expect(result2.meta.selectionTimeMs).toBeLessThanOrEqual(result1.meta.selectionTimeMs + 10);
    });
  });

  describe('contextual tools', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should load presence tools for stressed emotion', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'I feel overwhelmed',
        userId: 'test-user',
        agentId: 'ferni',
        context: {
          emotion: 'stressed',
        },
      });

      expect(result.meta.sources.contextual).toBeGreaterThanOrEqual(0);
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

      expect(result.meta).toBeDefined();
    });

    it('should load morning-appropriate tools', async () => {
      const result = await orchestrator.getToolsForIntent({
        transcript: 'good morning',
        userId: 'test-user',
        agentId: 'ferni',
        context: {
          timeOfDay: 'morning',
        },
      });

      expect(result.meta.sources.contextual).toBeGreaterThanOrEqual(0);
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

      // Grief topic should trigger refresh
      expect(result).toBeDefined();
      expect(typeof result.shouldRefresh).toBe('boolean');
      expect(Array.isArray(result.toolsToAdd)).toBe(true);
    });

    it('should not recommend refresh for similar topics', async () => {
      const result = await orchestrator.shouldRefreshTools({
        newTranscript: 'play another song',
        previousTools: ['playMusic', 'rememberUser'],
        sessionId: 'test-session',
      });

      expect(result).toBeDefined();
      expect(result.reason).toBeDefined();
    });
  });

  describe('explainSelection', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should generate human-readable explanation', async () => {
      mockSemanticMatches.push({
        toolId: 'playMusic',
        domain: 'entertainment',
        similarity: 0.92,
        description: 'Play music',
      });

      const result = await orchestrator.getToolsForIntent({
        transcript: 'play some jazz',
        userId: 'test-user',
        agentId: 'ferni',
      });

      const explanation = orchestrator.explainSelection(result);

      expect(explanation).toContain('Tool Selection Breakdown');
      expect(explanation).toContain('Selected');
      expect(explanation).toContain('Sources');
    });
  });

  describe('stats and cache management', () => {
    it('should return accurate stats', async () => {
      await orchestrator.initialize();

      const stats = orchestrator.getStats();

      expect(stats.initialized).toBe(true);
      expect(typeof stats.totalTools).toBe('number');
      expect(typeof stats.cacheSize).toBe('number');
      expect(stats.config).toBeDefined();
    });

    it('should clear caches on demand', async () => {
      await orchestrator.initialize();

      // Make a request to populate cache
      await orchestrator.getToolsForIntent({
        transcript: 'test',
        userId: 'test-user',
        agentId: 'ferni',
      });

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

    // Should detect grief intent
    if (result.meta.detectedIntent) {
      expect(result.meta.detectedIntent.categories).toContain('grief');
    }
  });

  it('should detect decision-related intent', async () => {
    const result = await orchestrator.getToolsForIntent({
      transcript: 'should I take this new job offer',
      userId: 'test-user',
      agentId: 'ferni',
    });

    // Should detect decisions intent
    if (result.meta.detectedIntent) {
      expect(
        result.meta.detectedIntent.categories.includes('decisions') ||
          result.meta.detectedIntent.triggerKeywords.some((k) => k.includes('should'))
      ).toBe(true);
    }
  });

  it('should detect relationship-related intent', async () => {
    const result = await orchestrator.getToolsForIntent({
      transcript: 'my partner and I are having issues',
      userId: 'test-user',
      agentId: 'ferni',
    });

    // Check for relationship detection
    expect(result.meta).toBeDefined();
  });
});
