/**
 * Phase 5: Deep Dive Features Tests
 *
 * Tests all the missing deep dive features:
 * - Protection Engine
 * - LLM Link Detection
 * - Spreading Activation
 * - Decay Curves
 * - Context Carrier
 * - Tool Success Tracker
 * - Pattern Formation
 * - Memory-Aware Router
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: vi.fn((obj) => obj),
}));

// Mock Google AI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(() => ({
        response: { text: () => '{"links":[]}' },
      })),
    })),
  })),
}));

// ============================================================================
// PROTECTION ENGINE TESTS
// ============================================================================

describe('Phase 5: Protection Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export protection engine functions', async () => {
    const { getProtectionEngine, resetProtectionEngine } =
      await import('../memory/protection-engine.js');

    expect(getProtectionEngine).toBeDefined();
    expect(resetProtectionEngine).toBeDefined();
  });

  it('should create a singleton instance', async () => {
    const { getProtectionEngine, resetProtectionEngine } =
      await import('../memory/protection-engine.js');

    resetProtectionEngine();
    const engine1 = getProtectionEngine();
    const engine2 = getProtectionEngine();

    expect(engine1).toBe(engine2);
  });

  it('should protect high emotional weight memories', async () => {
    const { getProtectionEngine, resetProtectionEngine } =
      await import('../memory/protection-engine.js');

    resetProtectionEngine();
    const engine = getProtectionEngine();

    const memory = {
      id: 'mem_test_1',
      type: 'moment' as const,
      content: 'Got married today, happiest day of my life',
      timestamp: new Date(),
      emotionalWeight: 0.9, // High emotional weight
      relevanceDecay: 0.1,
      baseImportance: 0.8,
      topics: ['life', 'relationship'],
      source: { collection: 'memories', documentId: 'mem_test_1' },
    };

    const result = await engine.analyzeAndProtect(memory, 'test-user');

    expect(result).not.toBeNull();
    // "married" keyword triggers life_milestone which takes precedence
    expect(result?.protectionLevel).toBe('life_milestone');
  });

  it('should protect memories with milestone keywords', async () => {
    const { getProtectionEngine, resetProtectionEngine } =
      await import('../memory/protection-engine.js');

    resetProtectionEngine();
    const engine = getProtectionEngine();

    const memory = {
      id: 'mem_test_2',
      type: 'event' as const,
      content: 'I finally graduated from college today!',
      timestamp: new Date(),
      emotionalWeight: 0.5,
      relevanceDecay: 0.1,
      baseImportance: 0.6,
      topics: ['education'],
      source: { collection: 'memories', documentId: 'mem_test_2' },
    };

    const result = await engine.analyzeAndProtect(memory, 'test-user');

    expect(result).not.toBeNull();
    expect(result?.protectionLevel).toBe('life_milestone');
  });

  it('should protect user-marked memories', async () => {
    const { getProtectionEngine, resetProtectionEngine } =
      await import('../memory/protection-engine.js');

    resetProtectionEngine();
    const engine = getProtectionEngine();

    const memory = {
      id: 'mem_test_3',
      type: 'preference' as const,
      content: 'Please remember this - my anniversary is June 15th',
      timestamp: new Date(),
      emotionalWeight: 0.3,
      relevanceDecay: 0.1,
      baseImportance: 0.5,
      source: { collection: 'memories', documentId: 'mem_test_3' },
    };

    const result = await engine.analyzeAndProtect(memory, 'test-user');

    expect(result).not.toBeNull();
    expect(result?.protectionLevel).toBe('user_marked');
  });
});

// ============================================================================
// SPREADING ACTIVATION TESTS
// ============================================================================

describe('Phase 5: Spreading Activation', () => {
  it('should export spreading activation functions', async () => {
    const { getSpreadingActivation, resetSpreadingActivation } =
      await import('../memory/spreading-activation.js');

    expect(getSpreadingActivation).toBeDefined();
    expect(resetSpreadingActivation).toBeDefined();
  });

  it('should create engine with default config', async () => {
    const { getSpreadingActivation, resetSpreadingActivation } =
      await import('../memory/spreading-activation.js');

    resetSpreadingActivation();
    const engine = getSpreadingActivation();

    expect(engine).toBeDefined();
  });

  it('should spread activation from a source memory', async () => {
    const { SpreadingActivationEngine } = await import('../memory/spreading-activation.js');

    const engine = new SpreadingActivationEngine({
      decayFactor: 0.5,
      maxDepth: 2,
      minActivation: 0.1,
    });

    // Mock getMemoryGraph to return empty links
    const results = await engine.spreadFromMemory('test-user', 'source_memory');

    // Should return empty array when no links exist
    expect(Array.isArray(results)).toBe(true);
  });
});

// ============================================================================
// DECAY CURVES TESTS
// ============================================================================

// NOTE: decay-curves.js module is planned but not yet implemented
// These tests are skipped until the feature is implemented
describe.skip('Phase 5: Decay Curves', () => {
  it('should export decay curve functions', async () => {
    const { getDecayCurveCalculator, MEMORY_TYPE_CURVES } =
      await import('../memory/decay-curves.js');

    expect(getDecayCurveCalculator).toBeDefined();
    expect(MEMORY_TYPE_CURVES).toBeDefined();
  });

  it('should have decay curves for all memory types', async () => {
    const { MEMORY_TYPE_CURVES } = await import('../memory/decay-curves.js');

    expect(MEMORY_TYPE_CURVES.summary).toBe('linear');
    expect(MEMORY_TYPE_CURVES.moment).toBe('exponential');
    expect(MEMORY_TYPE_CURVES.commitment).toBe('step');
    expect(MEMORY_TYPE_CURVES.preference).toBe('plateau');
    expect(MEMORY_TYPE_CURVES.person).toBe('plateau');
  });

  it('should calculate exponential decay correctly', async () => {
    const { getDecayCurveCalculator, resetDecayCurveCalculator } =
      await import('../memory/decay-curves.js');

    resetDecayCurveCalculator();
    const calculator = getDecayCurveCalculator();

    // Recent memory should have low decay
    const recentMemory = {
      id: 'mem_1',
      type: 'moment' as const,
      content: 'Test',
      timestamp: new Date(),
      emotionalWeight: 0.5,
      relevanceDecay: 0,
      baseImportance: 0.5,
      source: { collection: 'memories', documentId: 'mem_1' },
    };

    const decay = calculator.calculateDecay(recentMemory);
    expect(decay).toBeLessThan(0.1); // Very recent = very low decay
  });

  it('should respect protection flag', async () => {
    const { getDecayCurveCalculator, resetDecayCurveCalculator } =
      await import('../memory/decay-curves.js');

    resetDecayCurveCalculator();
    const calculator = getDecayCurveCalculator();

    const oldMemory = {
      id: 'mem_2',
      type: 'moment' as const,
      content: 'Test',
      timestamp: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      emotionalWeight: 0.5,
      relevanceDecay: 0,
      baseImportance: 0.5,
      source: { collection: 'memories', documentId: 'mem_2' },
    };

    // Without protection
    const decayWithoutProtection = calculator.calculateDecay(oldMemory);

    // With protection
    const decayWithProtection = calculator.calculateDecay(oldMemory, {
      isProtected: true,
    });

    expect(decayWithProtection).toBe(0);
    expect(decayWithoutProtection).toBeGreaterThan(0);
  });
});

// ============================================================================
// CONTEXT CARRIER TESTS
// ============================================================================

describe('Phase 5: Context Carrier', () => {
  it('should export context carrier functions', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    expect(getContextCarrier).toBeDefined();
    expect(resetContextCarrier).toBeDefined();
  });

  it('should start and end sessions', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    resetContextCarrier();
    const carrier = getContextCarrier();

    const state = carrier.startSession('session_1', 'user_1');
    expect(state.sessionId).toBe('session_1');
    expect(state.userId).toBe('user_1');

    const snapshot = carrier.endSession('session_1');
    expect(snapshot).not.toBeNull();
  });

  it('should track surfaced memories', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    resetContextCarrier();
    const carrier = getContextCarrier();

    carrier.startSession('session_2', 'user_1');
    carrier.recordMemorySurfaced('session_2', 'mem_123');

    expect(carrier.wasMemorySurfaced('session_2', 'mem_123')).toBe(true);
    expect(carrier.wasMemorySurfaced('session_2', 'mem_456')).toBe(false);
  });

  it('should track tool usage', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    resetContextCarrier();
    const carrier = getContextCarrier();

    carrier.startSession('session_3', 'user_1');
    carrier.recordToolUsage('session_3', 'recallMemory', 'success', {
      duration: 100,
    });

    const tools = carrier.getToolsUsed('session_3');
    expect(tools.length).toBe(1);
    expect(tools[0].toolId).toBe('recallMemory');
    expect(tools[0].result).toBe('success');
  });

  it('should track emotional journey', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    resetContextCarrier();
    const carrier = getContextCarrier();

    carrier.startSession('session_4', 'user_1');
    carrier.recordEmotion('session_4', 'anxious', 0.7, 'work stress');
    carrier.recordEmotion('session_4', 'calm', 0.5, 'after talking');

    const current = carrier.getCurrentEmotion('session_4');
    expect(current?.emotion).toBe('calm');

    const trend = carrier.getEmotionalTrend('session_4');
    // With only 2 emotions, trend detection is limited
    expect(['improving', 'stable', 'volatile'].includes(trend)).toBe(true);
  });

  it('should manage follow-ups', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    resetContextCarrier();
    const carrier = getContextCarrier();

    carrier.startSession('session_5', 'user_1');

    const id = carrier.addFollowUp(
      'session_5',
      'career goals',
      'User mentioned wanting to revisit',
      'high'
    );

    const followUps = carrier.getFollowUps('session_5');
    expect(followUps.length).toBe(1);

    const next = carrier.getNextFollowUp('session_5');
    expect(next?.topic).toBe('career goals');

    carrier.completeFollowUp('session_5', id);
    expect(carrier.getFollowUps('session_5').length).toBe(0);
  });
});

// ============================================================================
// TOOL SUCCESS TRACKER TESTS
// ============================================================================

// src/tools/tool-success-tracker.ts was removed in e0ccff0af. Tool outcome
// tracking now lives on the context carrier (src/tools/context-carrier.ts).
describe('Phase 5: Tool Success Tracker (context carrier)', () => {
  it('should export tool tracking functions', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    expect(getContextCarrier).toBeDefined();
    expect(resetContextCarrier).toBeDefined();
  });

  it('should record tool calls', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    resetContextCarrier();
    const carrier = getContextCarrier();
    carrier.startSession('session_1', 'user_1');

    carrier.recordToolUsage('session_1', 'recallMemory', 'success', { duration: 150 });

    const used = carrier.getToolsUsed('session_1');
    expect(used.length).toBe(1);
    expect(used[0].toolId).toBe('recallMemory');
    expect(used[0].result).toBe('success');
    expect(used[0].duration).toBe(150);
    expect(carrier.wasToolUsedRecently('session_1', 'recallMemory')).toBe(true);

    resetContextCarrier();
  });

  it('should calculate contextual success rate', async () => {
    const { getContextCarrier, resetContextCarrier } = await import('../tools/context-carrier.js');

    resetContextCarrier();
    const carrier = getContextCarrier();
    carrier.startSession('session_2', 'user_1');

    // No data yet
    expect(carrier.getToolSuccessRate('session_2', 'recallMemory')).toBe(0);

    carrier.recordToolUsage('session_2', 'recallMemory', 'success');
    carrier.recordToolUsage('session_2', 'recallMemory', 'failure');
    expect(carrier.getToolSuccessRate('session_2', 'recallMemory')).toBe(0.5);

    carrier.recordToolUsage('session_2', 'recallMemory', 'success');
    carrier.recordToolUsage('session_2', 'recallMemory', 'success');
    expect(carrier.getToolSuccessRate('session_2', 'recallMemory')).toBe(0.75);

    // Unknown tool is not counted against a known one
    expect(carrier.getToolSuccessRate('session_2', 'unknownTool')).toBe(0);

    resetContextCarrier();
  });
});

// ============================================================================
// PATTERN FORMATION TESTS
// ============================================================================

describe('Phase 5: Pattern Formation', () => {
  it('should export pattern formation functions', async () => {
    const { getPatternFormation, resetPatternFormation } =
      await import('../memory/pattern-formation.js');

    expect(getPatternFormation).toBeDefined();
    expect(resetPatternFormation).toBeDefined();
  });

  it('should detect behavioral patterns', async () => {
    const { getPatternFormation, resetPatternFormation } =
      await import('../memory/pattern-formation.js');

    resetPatternFormation();
    const engine = getPatternFormation();

    // Create memories with behavioral patterns
    const memories = [
      {
        id: 'mem_1',
        type: 'moment' as const,
        content: 'I started exercising this morning',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        emotionalWeight: 0.5,
        relevanceDecay: 0,
        baseImportance: 0.5,
        topics: ['exercise'],
        source: { collection: 'memories', documentId: 'mem_1' },
      },
      {
        id: 'mem_2',
        type: 'moment' as const,
        content: 'Started my workout routine again',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        emotionalWeight: 0.5,
        relevanceDecay: 0,
        baseImportance: 0.5,
        topics: ['exercise'],
        source: { collection: 'memories', documentId: 'mem_2' },
      },
      {
        id: 'mem_3',
        type: 'moment' as const,
        content: 'Started the day with a run',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        emotionalWeight: 0.5,
        relevanceDecay: 0,
        baseImportance: 0.5,
        topics: ['exercise'],
        source: { collection: 'memories', documentId: 'mem_3' },
      },
    ];

    const patterns = await engine.detectPatterns('user_1', memories);

    // Should detect some patterns
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('should detect temporal patterns', async () => {
    const { PatternFormationEngine } = await import('../memory/pattern-formation.js');

    const engine = new PatternFormationEngine({
      minOccurrences: 2,
    });

    // Create memories on the same day of week
    const memories = Array.from({ length: 5 }, (_, i) => ({
      id: `mem_${i}`,
      type: 'moment' as const,
      content: `Memory ${i}`,
      timestamp: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000), // Same day each week
      emotionalWeight: 0.5,
      relevanceDecay: 0,
      baseImportance: 0.5,
      topics: ['work'],
      source: { collection: 'memories', documentId: `mem_${i}` },
    }));

    const patterns = await engine.detectPatterns('user_1', memories);

    expect(Array.isArray(patterns)).toBe(true);
  });
});

// ============================================================================
// MEMORY-AWARE ROUTER TESTS
// ============================================================================

// src/tools/memory-aware-router.ts was removed in e0ccff0af. Memory-influenced
// routing now lives in src/tools/memory-aware/router-integration.ts as
// calculateToolAdjustments() + applyAdjustments().
describe('Phase 5: Memory-Aware Router (router-integration)', () => {
  const baseContext = {
    query: 'help me with career',
    userTopics: ['career'],
    recentTopics: ['career'],
    importantPeople: [],
    activeCommitments: 0,
    sessionDepth: 'moderate' as const,
    relevantMemories: [],
  };

  it('should export memory-aware routing functions', async () => {
    const { calculateToolAdjustments, applyAdjustments } = await import(
      '../tools/memory-aware/router-integration.js'
    );

    expect(calculateToolAdjustments).toBeDefined();
    expect(applyAdjustments).toBeDefined();
  });

  it('should calculate routing adjustments from memory context', async () => {
    const { calculateToolAdjustments } = await import(
      '../tools/memory-aware/router-integration.js'
    );

    // No commitments -> no commitment-tool boost
    const none = calculateToolAdjustments({ ...baseContext });
    expect(none.some((a) => a.toolName === 'check_commitments')).toBe(false);

    // Active commitments -> commitment tools get boosted, with a reason
    const withCommitments = calculateToolAdjustments({
      ...baseContext,
      activeCommitments: 3,
    });

    const check = withCommitments.find((a) => a.toolName === 'check_commitments');
    expect(check).toBeDefined();
    expect(check?.adjustment).toBeGreaterThan(0);
    expect(check?.reason).toContain('3');
    expect(withCommitments.every((a) => typeof a.adjustment === 'number')).toBe(true);
  });

  it('should apply adjustments to tool scores, clamped to [0,1]', async () => {
    const { applyAdjustments } = await import('../tools/memory-aware/router-integration.js');

    const scores = new Map<string, number>([
      ['check_commitments', 0.5],
      ['breathingExercise', 0.7],
      ['alreadyMaxed', 0.95],
    ]);

    const adjusted = applyAdjustments(scores, [
      { toolName: 'check_commitments', adjustment: 0.3, reason: 'has commitments' },
      { toolName: 'alreadyMaxed', adjustment: 0.5, reason: 'clamp check' },
      { toolName: 'notPresent', adjustment: -0.5, reason: 'floor check' },
    ]);

    expect(adjusted.get('check_commitments')).toBeCloseTo(0.8);
    // untouched tools keep their score
    expect(adjusted.get('breathingExercise')).toBe(0.7);
    // clamped at 1 and 0
    expect(adjusted.get('alreadyMaxed')).toBe(1);
    expect(adjusted.get('notPresent')).toBe(0);
    // the input map is not mutated
    expect(scores.get('check_commitments')).toBe(0.5);
  });
});

// ============================================================================
// LLM LINK DETECTOR TESTS
// ============================================================================

describe('Phase 5: LLM Link Detector', () => {
  it('should export LLM link detector functions', async () => {
    const { getLLMLinkDetector, resetLLMLinkDetector } =
      await import('../memory/llm-link-detector.js');

    expect(getLLMLinkDetector).toBeDefined();
    expect(resetLLMLinkDetector).toBeDefined();
  });

  it('should handle empty memory arrays', async () => {
    const { getLLMLinkDetector, resetLLMLinkDetector } =
      await import('../memory/llm-link-detector.js');

    resetLLMLinkDetector();
    const detector = getLLMLinkDetector();

    const causal = await detector.detectCausalLinks([]);
    const narrative = await detector.detectNarrativeLinks([]);
    const contrast = await detector.detectContrastLinks([]);

    expect(causal).toEqual([]);
    expect(narrative).toEqual([]);
    expect(contrast).toEqual([]);
  });

  it('should detect all link types at once', async () => {
    const { LLMLinkDetector } = await import('../memory/llm-link-detector.js');

    const detector = new LLMLinkDetector();

    const memories = [
      {
        id: 'mem_1',
        type: 'event' as const,
        content: 'Got promoted at work',
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        emotionalWeight: 0.8,
        relevanceDecay: 0,
        baseImportance: 0.7,
        topics: ['career'],
        source: { collection: 'memories', documentId: 'mem_1' },
      },
      {
        id: 'mem_2',
        type: 'event' as const,
        content: 'Bought a new house',
        timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        emotionalWeight: 0.9,
        relevanceDecay: 0,
        baseImportance: 0.8,
        topics: ['life'],
        source: { collection: 'memories', documentId: 'mem_2' },
      },
    ];

    const result = await detector.detectAllLinks(memories);

    expect(result).toBeDefined();
    expect(typeof result.processedPairs).toBe('number');
    expect(typeof result.llmCalls).toBe('number');
    expect(Array.isArray(result.detected)).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TEST
// ============================================================================

// NOTE: This test imports decay-curves.js which is not yet implemented
describe.skip('Phase 5: Integration', () => {
  it('should have all modules working together', async () => {
    // Import all modules to ensure they compile and can be used together
    const [
      protectionEngine,
      spreadingActivation,
      decayCurves,
      contextCarrier,
      toolTracker,
      patternFormation,
      memoryRouter,
      llmDetector,
    ] = await Promise.all([
      import('../memory/protection-engine.js'),
      import('../memory/spreading-activation.js'),
      import('../memory/decay-curves.js'),
      import('../tools/context-carrier.js'),
      import('../tools/tool-success-tracker.js'),
      import('../memory/pattern-formation.js'),
      import('../tools/memory-aware-router.js'),
      import('../memory/llm-link-detector.js'),
    ]);

    expect(protectionEngine.getProtectionEngine).toBeDefined();
    expect(spreadingActivation.getSpreadingActivation).toBeDefined();
    expect(decayCurves.getDecayCurveCalculator).toBeDefined();
    expect(contextCarrier.getContextCarrier).toBeDefined();
    expect(toolTracker.getToolSuccessTracker).toBeDefined();
    expect(patternFormation.getPatternFormation).toBeDefined();
    expect(memoryRouter.getMemoryAwareRouter).toBeDefined();
    expect(llmDetector.getLLMLinkDetector).toBeDefined();
  });
});
