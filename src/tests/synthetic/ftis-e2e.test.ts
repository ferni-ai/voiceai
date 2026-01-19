/**
 * FTIS End-to-End Tests
 *
 * Comprehensive tests for the Ferni Tool Intelligence System (FTIS).
 * Validates the complete flow from query → routing → execution → response.
 *
 * @module tests/synthetic/ftis-e2e.test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock environment for FTIS_ONLY_MODE
beforeAll(() => {
  vi.stubEnv('FTIS_ONLY_MODE', 'true');
  vi.stubEnv('FTIS_COLLECT_TRAINING_DATA', 'true');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ============================================================================
// DOMAIN BRIDGE TESTS
// ============================================================================

describe('FTIS Domain Bridge', () => {
  describe('Tool Mapping Coverage', () => {
    it('should have 800+ semantic tool mappings', async () => {
      const { getAllMappings, getMappingStats } = await import(
        '../../tools/semantic-router/domain-bridge.js'
      );

      const mappings = getAllMappings();
      const stats = getMappingStats();

      expect(Object.keys(mappings).length).toBeGreaterThan(800);
      expect(stats.totalMappings).toBeGreaterThan(800);
    });

    it('should cover all major categories', async () => {
      const { getAllMappings } = await import(
        '../../tools/semantic-router/domain-bridge.js'
      );

      const mappings = getAllMappings();
      const categories = new Set<string>();

      for (const semanticId of Object.keys(mappings)) {
        const category = semanticId.split('_')[0];
        categories.add(category);
      }

      // Should have at least 50 unique category prefixes
      expect(categories.size).toBeGreaterThan(50);

      // Should include critical categories
      expect(categories.has('music')).toBe(true);
      expect(categories.has('weather')).toBe(true);
      expect(categories.has('calendar')).toBe(true);
      expect(categories.has('habit')).toBe(true);
      expect(categories.has('handoff')).toBe(true);
    });

    it('should have valid domain tool IDs for each mapping', async () => {
      const { getAllMappings } = await import(
        '../../tools/semantic-router/domain-bridge.js'
      );

      const mappings = getAllMappings();
      const invalidMappings: string[] = [];

      for (const [semanticId, mapping] of Object.entries(mappings)) {
        if (!mapping.domainToolId || typeof mapping.domainToolId !== 'string') {
          invalidMappings.push(semanticId);
        }
      }

      expect(invalidMappings).toHaveLength(0);
    });
  });

  describe('Tool ID Lookup', () => {
    it('should resolve semantic ID to domain tool ID', async () => {
      const { getDomainToolId, hasDomainMapping } = await import(
        '../../tools/semantic-router/domain-bridge.js'
      );

      // Test music
      expect(hasDomainMapping('music_play')).toBe(true);
      expect(getDomainToolId('music_play')).toBe('playMusic');

      // Test weather
      expect(hasDomainMapping('weather_current')).toBe(true);
      expect(getDomainToolId('weather_current')).toBe('getWeather');

      // Test calendar
      expect(hasDomainMapping('calendar_create')).toBe(true);
      expect(getDomainToolId('calendar_create')).toBe('createCalendarEvent');
    });

    it('should return null/undefined for unknown semantic IDs', async () => {
      const { getDomainToolId, hasDomainMapping } = await import(
        '../../tools/semantic-router/domain-bridge.js'
      );

      expect(hasDomainMapping('nonexistent_tool')).toBe(false);
      expect(getDomainToolId('nonexistent_tool')).toBeFalsy();
    });
  });

  describe('Argument Transformation', () => {
    it('should transform arguments correctly', async () => {
      const { transformArguments, hasDomainMapping } = await import(
        '../../tools/semantic-router/domain-bridge.js'
      );

      // Test a tool with argument transformation
      expect(hasDomainMapping('alarm_set')).toBe(true);

      const transformed = transformArguments('alarm_set', {
        time: '7:00 AM',
        label: 'Wake up',
      });

      // Should have transformed the args
      expect(transformed).toBeDefined();
    });

    it('should pass through args for tools without transformation', async () => {
      const { transformArguments } = await import(
        '../../tools/semantic-router/domain-bridge.js'
      );

      const originalArgs = { query: 'jazz music' };
      const transformed = transformArguments('music_play', originalArgs);

      expect(transformed).toEqual(originalArgs);
    });
  });
});

// ============================================================================
// CONVERSATION TOOL INJECTOR TESTS
// ============================================================================

describe('FTIS Conversation Tool Injector', () => {
  describe('Configuration', () => {
    it('should be enabled when FTIS_ONLY_MODE=true', async () => {
      const { isToolInjectionEnabled } = await import(
        '../../tools/intelligence/conversation-tool-injector.js'
      );

      expect(isToolInjectionEnabled()).toBe(true);
    });
  });

  describe('Turn Analysis', () => {
    it('should detect tool intent from clear queries', async () => {
      const { getConversationToolInjector } = await import(
        '../../tools/intelligence/conversation-tool-injector.js'
      );

      const injector = getConversationToolInjector();

      // This would normally call FTIS - we'll mock it for unit tests
      const result = await injector.analyzeTurn(
        "What's the weather like?",
        {
          userId: 'test-user',
          sessionId: 'test-session',
          personaId: 'ferni',
          turnNumber: 1,
        }
      );

      // Should have analyzed (whether injection needed depends on FTIS)
      expect(result).toBeDefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.reason).toBeDefined();
    });

    it('should not inject for empty transcripts', async () => {
      const { getConversationToolInjector } = await import(
        '../../tools/intelligence/conversation-tool-injector.js'
      );

      const injector = getConversationToolInjector();

      const result = await injector.analyzeTurn('', {
        userId: 'test-user',
        sessionId: 'test-session',
        personaId: 'ferni',
        turnNumber: 1,
      });

      expect(result.shouldInject).toBe(false);
      expect(result.reason).toContain('Empty');
    });
  });

  describe('Result Formatting', () => {
    it('should format successful results correctly', async () => {
      const { getConversationToolInjector } = await import(
        '../../tools/intelligence/conversation-tool-injector.js'
      );

      const injector = getConversationToolInjector();

      const formatted = injector.formatAsSystemMessage({
        toolId: 'weather_current',
        success: true,
        naturalResponse: "It's 72°F and sunny",
        durationMs: 150,
      });

      expect(formatted).toContain('[TOOL_RESULT');
      expect(formatted).toContain('weather_current');
      expect(formatted).toContain("72°F");
    });

    it('should format failed results gracefully', async () => {
      const { getConversationToolInjector } = await import(
        '../../tools/intelligence/conversation-tool-injector.js'
      );

      const injector = getConversationToolInjector();

      const formatted = injector.formatAsSystemMessage({
        toolId: 'weather_current',
        success: false,
        naturalResponse: '',
        durationMs: 5000,
      });

      expect(formatted).toContain('[TOOL_RESULT');
      expect(formatted).toContain('Unable to complete');
    });
  });
});

// ============================================================================
// COMPLEXITY CLASSIFIER TESTS
// ============================================================================

describe('FTIS Complexity Classifier', () => {
  describe('FTIS-Only Configuration', () => {
    it('should use lower thresholds in FTIS_ONLY_MODE', async () => {
      const { ComplexityClassifier } = await import(
        '../../tools/intelligence/planning/complexity-classifier.js'
      );

      const classifier = new ComplexityClassifier();

      // Simple query should be classified as simple with lower threshold
      const result = classifier.classify({
        query: "What's the weather?",
        routerOutput: {
          topConfidence: 0.75, // Below 0.85 but above 0.70
          predictions: [{ toolId: 'weather', confidence: 0.75 }],
        },
      });

      // With FTIS_ONLY_MODE, 0.75 should be considered high enough
      expect(result.complexity).toBe('simple');
    });
  });

  describe('Complexity Detection', () => {
    it('should classify simple queries as direct', async () => {
      const { ComplexityClassifier } = await import(
        '../../tools/intelligence/planning/complexity-classifier.js'
      );

      const classifier = new ComplexityClassifier();

      const result = classifier.classify({
        query: 'Play some jazz',
        routerOutput: {
          topConfidence: 0.92,
          predictions: [{ toolId: 'music_play', confidence: 0.92 }],
        },
      });

      expect(result.complexity).toBe('simple');
      expect(result.suggestedApproach).toBe('direct');
    });

    it('should classify multi-step queries as medium/sequence', async () => {
      const { ComplexityClassifier } = await import(
        '../../tools/intelligence/planning/complexity-classifier.js'
      );

      const classifier = new ComplexityClassifier();

      const result = classifier.classify({
        query: "First check my calendar, then set a reminder for the meeting",
        routerOutput: {
          topConfidence: 0.6,
          predictions: [
            { toolId: 'calendar_today', confidence: 0.6 },
            { toolId: 'reminder_create', confidence: 0.5 },
          ],
        },
      });

      expect(['medium', 'complex']).toContain(result.complexity);
      expect(['sequence', 'mcts']).toContain(result.suggestedApproach);
    });

    it('should detect complex planning keywords', async () => {
      const { ComplexityClassifier } = await import(
        '../../tools/intelligence/planning/complexity-classifier.js'
      );

      const classifier = new ComplexityClassifier();

      const result = classifier.classify({
        query: 'Help me plan and analyze my options for this career decision',
      });

      expect(result.complexity).toBe('complex');
      expect(result.reasons.some((r) => r.toLowerCase().includes('complex'))).toBe(true);
    });
  });
});

// ============================================================================
// PERSONA TOOL ROUTER TESTS
// ============================================================================

describe('FTIS Persona Tool Router', () => {
  describe('Persona Specialties', () => {
    it('should route habit queries to Maya', async () => {
      const { routeToPersona } = await import(
        '../../tools/intelligence/persona-tool-router.js'
      );

      const result = routeToPersona(
        'Help me track my meditation habit',
        'ferni',
        'habits'
      );

      expect(result.recommendedPersona).toBe('maya');
    });

    it('should route research queries to Peter', async () => {
      const { routeToPersona } = await import(
        '../../tools/intelligence/persona-tool-router.js'
      );

      const result = routeToPersona(
        'Can you research this topic for me? I need a deep dive.',
        'ferni'
      );

      expect(result.recommendedPersona).toBe('peter');
    });

    it('should route calendar queries to Alex', async () => {
      const { routeToPersona } = await import(
        '../../tools/intelligence/persona-tool-router.js'
      );

      const result = routeToPersona(
        'Schedule a meeting for tomorrow',
        'ferni',
        'calendar'
      );

      expect(result.recommendedPersona).toBe('alex');
    });

    it('should route event planning to Jordan', async () => {
      const { routeToPersona } = await import(
        '../../tools/intelligence/persona-tool-router.js'
      );

      const result = routeToPersona(
        "Help me plan a birthday party for my friend",
        'ferni',
        'events'
      );

      expect(result.recommendedPersona).toBe('jordan');
    });

    it('should route wisdom queries to Nayan', async () => {
      const { routeToPersona } = await import(
        '../../tools/intelligence/persona-tool-router.js'
      );

      const result = routeToPersona(
        "I'm questioning the meaning of life",
        'ferni',
        'meaning'
      );

      expect(result.recommendedPersona).toBe('nayan');
    });
  });

  describe('Handoff Suggestions', () => {
    it('should suggest handoff for strong specialty match', async () => {
      const { getHandoffSuggestion } = await import(
        '../../tools/intelligence/persona-tool-router.js'
      );

      const suggestion = getHandoffSuggestion(
        'I need help with my habits and morning routine',
        'ferni',
        'habits'
      );

      expect(suggestion).not.toBeNull();
      expect(suggestion?.targetPersona).toBe('maya');
    });

    it('should not suggest handoff for general queries', async () => {
      const { getHandoffSuggestion } = await import(
        '../../tools/intelligence/persona-tool-router.js'
      );

      const suggestion = getHandoffSuggestion(
        'I just want to talk',
        'ferni'
      );

      // Ferni handles general conversation
      expect(suggestion).toBeNull();
    });
  });
});

// ============================================================================
// SAFETY NET TESTS
// ============================================================================

describe('FTIS Safety Net', () => {
  describe('Timeout Wrapper', () => {
    it('should return result when within timeout', async () => {
      const { withTimeout } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      const fastPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('success'), 50);
      });

      const result = await withTimeout(fastPromise, { 
        routingTimeoutMs: 200,
        confidenceFloor: 0.5,
        accuracyAlertThreshold: 0.9,
        ftisOnlyMode: true,
      });

      expect(result.timedOut).toBe(false);
      expect(result.result).toBe('success');
    });

    it('should timeout for slow operations', async () => {
      const { withTimeout } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      const slowPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('success'), 500);
      });

      const result = await withTimeout(slowPromise, { 
        routingTimeoutMs: 100,
        confidenceFloor: 0.5,
        accuracyAlertThreshold: 0.9,
        ftisOnlyMode: true,
      });

      expect(result.timedOut).toBe(true);
      expect(result.result).toBeNull();
    });
  });

  describe('Confidence Check', () => {
    it('should pass for high confidence', async () => {
      const { checkConfidence } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      const result = checkConfidence(0.85, "What's the weather?");

      expect(result.safe).toBe(true);
    });

    it('should fail for low confidence and suggest clarification', async () => {
      const { checkConfidence } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      const result = checkConfidence(0.35, 'Help');

      expect(result.safe).toBe(false);
      expect(result.suggestedAction).toBe('ask_clarification');
      expect(result.clarifyingQuestion).toBeDefined();
    });
  });

  describe('Accuracy Monitoring', () => {
    it('should track outcomes correctly', async () => {
      const { recordOutcome, getAccuracyMetrics, resetAccuracyMetrics } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      resetAccuracyMetrics();

      recordOutcome(true);
      recordOutcome(true);
      recordOutcome(false);

      const metrics = getAccuracyMetrics();

      expect(metrics.totalDecisions).toBe(3);
      expect(metrics.successfulExecutions).toBe(2);
      expect(metrics.failedExecutions).toBe(1);
      expect(metrics.accuracy).toBeCloseTo(0.667, 2);
    });

    it('should enter alert state when accuracy drops', async () => {
      const { recordOutcome, getAccuracyMetrics, resetAccuracyMetrics } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      resetAccuracyMetrics();

      // Record many failures
      for (let i = 0; i < 10; i++) {
        recordOutcome(i < 8); // 80% success
      }

      const metrics = getAccuracyMetrics();

      expect(metrics.accuracy).toBe(0.8);
      expect(metrics.isAlertState).toBe(true); // Below 90% threshold
    });
  });

  describe('Health Status', () => {
    it('should report healthy status with good metrics', async () => {
      const { getHealthStatus, resetAccuracyMetrics, recordOutcome } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      resetAccuracyMetrics();

      // Record 100% success
      for (let i = 0; i < 10; i++) {
        recordOutcome(true);
      }

      const health = getHealthStatus();

      expect(health.status).toBe('healthy');
    });

    it('should report critical status with poor metrics', async () => {
      const { getHealthStatus, resetAccuracyMetrics, recordOutcome } = await import(
        '../../tools/intelligence/ftis-safety.js'
      );

      resetAccuracyMetrics();

      // Record 50% success (very poor)
      for (let i = 0; i < 10; i++) {
        recordOutcome(i < 5);
      }

      const health = getHealthStatus();

      expect(health.status).toBe('critical');
      expect(health.recommendations.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TRAINING DATA COLLECTION TESTS
// ============================================================================

describe('FTIS Training Data Collection', () => {
  it('should be enabled when FTIS_COLLECT_TRAINING_DATA=true', async () => {
    const { isTrainingDataCollectionEnabled } = await import(
      '../../tools/intelligence/learning/index.js'
    );

    expect(isTrainingDataCollectionEnabled()).toBe(true);
  });
});

// ============================================================================
// SYNTHETIC DATA GENERATOR TESTS
// ============================================================================

describe('FTIS Synthetic Data Generator', () => {
  it('should generate examples for all tool mappings', async () => {
    const { SyntheticTrainingGenerator } = await import(
      '../../tools/intelligence/router/training/synthetic-generator.js'
    );

    const generator = new SyntheticTrainingGenerator({
      examplesPerTool: 2, // Small number for test speed
      paraphraseCount: 1,
    });

    const result = await generator.generateAll();

    // Should have generated many examples
    expect(result.examples.length).toBeGreaterThan(1000);
    expect(result.hardNegatives.length).toBeGreaterThan(0);
    expect(result.stats.totalTools).toBeGreaterThan(800);
  });

  it('should generate diverse personas and time slots', async () => {
    const { SyntheticTrainingGenerator } = await import(
      '../../tools/intelligence/router/training/synthetic-generator.js'
    );

    const generator = new SyntheticTrainingGenerator({
      examplesPerTool: 3,
      paraphraseCount: 2,
    });

    const result = await generator.generateAll();

    const personas = new Set(result.examples.map((e) => e.personaId));
    const timeSlots = new Set(result.examples.map((e) => e.timeOfDay));

    expect(personas.size).toBeGreaterThanOrEqual(4);
    expect(timeSlots.size).toBe(4); // morning, afternoon, evening, night
  });
});

// ============================================================================
// GEMINI PROVIDER FTIS INTEGRATION TESTS
// ============================================================================

describe('FTIS Gemini Provider Integration', () => {
  it('should disable function calling in FTIS_ONLY_MODE', async () => {
    const { GeminiLiveProvider } = await import(
      '../../agents/model-provider/gemini-live.js'
    );

    const provider = new GeminiLiveProvider();

    // In FTIS_ONLY_MODE, native FC should be disabled
    expect(provider.hasNativeFunctionCalling()).toBe(false);
    expect(provider.needsJsonWorkaround()).toBe(false);
  });

  it('should exclude function calling prompts in FTIS_ONLY_MODE', async () => {
    const { GeminiLiveProvider } = await import(
      '../../agents/model-provider/gemini-live.js'
    );

    const provider = new GeminiLiveProvider();
    const modules = provider.getPromptModules();

    expect(modules.includeFunctionCallingBase).toBe(false);
    expect(modules.includeFunctionCallingSpecialty).toBe(false);
    expect(modules.includeToolUsageGuidance).toBe(false);
  });
});
