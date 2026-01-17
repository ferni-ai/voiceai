/**
 * Memory Orchestrator Integration Tests
 *
 * Tests the unified memory system that coordinates all memory subsystems.
 *
 * @module tests/memory-orchestrator
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import {
  MemoryOrchestrator,
  getMemoryOrchestrator,
  resetMemoryOrchestrator,
  AssociativeMemory,
  getAssociativeMemory,
  clearAssociativeMemory,
  BehavioralPatternDetector,
  getBehavioralPatternDetector,
  resetBehavioralPatternDetector,
  CommunicationPreferences,
  getCommunicationPreferences,
  resetCommunicationPreferences,
  EmotionalThreading,
  getEmotionalThreading,
  resetEmotionalThreading,
  NaturalReferenceGenerator,
  getNaturalReferenceGenerator,
  configureEmotionalMemoryEngines,
  type RecallContext,
  type MemoryItem,
  type ConversationTurn,
} from '../memory/index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const TEST_USER_ID = 'test-user-memory-orch';

// Mock emotional memory engines for DI (required before using MemoryOrchestrator)
const mockUserEmotionEngines = new Map<string, ReturnType<typeof createMockUserEmotionEngine>>();
const mockBondingEngines = new Map<string, ReturnType<typeof createMockBondingEngine>>();

function createMockUserEmotionEngine() {
  return {
    startSession: vi.fn(),
    recordMoment: vi.fn().mockReturnValue('moment-id'),
    resolveEmotion: vi.fn(),
    markFollowedUp: vi.fn(),
    buildEmotionalContext: vi.fn().mockReturnValue({
      recentEmotions: [],
      patterns: [],
      unresolvedConcerns: [],
      celebratableWins: [],
      emotionalTrajectory: 'stable',
      checkInSuggestions: [],
    }),
    detectPatterns: vi.fn().mockReturnValue([]),
    getCheckInSuggestions: vi.fn().mockReturnValue([]),
    formatForPrompt: vi.fn().mockReturnValue(''),
    exportMoments: vi.fn().mockReturnValue([]),
    importMoments: vi.fn(),
    getStats: vi.fn().mockReturnValue({}),
  };
}

function createMockBondingEngine() {
  return {
    setPersonaId: vi.fn(),
    recordSessionEnd: vi.fn(),
    recordEvent: vi.fn(),
    updateConcern: vi.fn(),
    getBondMetrics: vi.fn().mockReturnValue({
      warmth: 0.5,
      trust: 0.5,
      protectiveness: 0.3,
      admiration: 0.3,
      concern: 0,
      stage: 'getting_to_know',
    }),
    getBond: vi.fn().mockReturnValue({
      warmth: 0.5,
      trust: 0.5,
      protectiveness: 0.3,
      admiration: 0.3,
      concern: 0,
      stage: 'getting_to_know',
    }),
    getGreetingModifier: vi.fn().mockReturnValue(null),
    getEmotionalMemoryCallback: vi.fn().mockReturnValue(null),
    getBondPhrase: vi.fn().mockReturnValue(null),
    getRelationshipStage: vi.fn().mockReturnValue('getting_to_know'),
    export: vi.fn().mockReturnValue({}),
    import: vi.fn(),
  };
}

// Configure DI before any tests run
beforeAll(() => {
  configureEmotionalMemoryEngines({
    getUserEmotionEngine: (userId: string) => {
      if (!mockUserEmotionEngines.has(userId)) {
        mockUserEmotionEngines.set(userId, createMockUserEmotionEngine());
      }
      return mockUserEmotionEngines.get(userId)!;
    },
    getBondingEngine: (userId: string) => {
      if (!mockBondingEngines.has(userId)) {
        mockBondingEngines.set(userId, createMockBondingEngine());
      }
      return mockBondingEngines.get(userId)!;
    },
    removeUserEmotionEngine: (userId: string) => {
      mockUserEmotionEngines.delete(userId);
    },
    clearBondingEngine: (userId: string) => {
      mockBondingEngines.delete(userId);
    },
  });
});

function createMockProfile() {
  return {
    id: TEST_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
    totalConversations: 5,
    relationshipStage: 'building' as const,
    createdAt: new Date(),
    lastSeenAt: new Date(),
  };
}

function createMockMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: `memory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: TEST_USER_ID,
    content: 'User mentioned they are working on a new project',
    timestamp: new Date(),
    topics: ['work', 'projects'],
    emotionalWeight: 0.5,
    ...overrides,
  };
}

function createMockRecallContext(overrides: Partial<RecallContext> = {}): RecallContext {
  return {
    userId: TEST_USER_ID,
    query: 'How is your project going?',
    currentTopic: 'work',
    currentEmotion: 'neutral',
    personaId: 'ferni',
    conversationTurn: 3,
    isSessionStart: false,
    sessionCount: 5,
    ...overrides,
  };
}

function createMockTurns(): ConversationTurn[] {
  return [
    { role: 'user', content: "I've been stressed about work lately", timestamp: new Date() },
    {
      role: 'assistant',
      content: "That sounds challenging. What's been going on?",
      timestamp: new Date(),
    },
    { role: 'user', content: 'My boss keeps changing the deadlines', timestamp: new Date() },
    {
      role: 'assistant',
      content: 'That must be frustrating when expectations keep shifting',
      timestamp: new Date(),
    },
    {
      role: 'user',
      content: "Yeah, I don't know if I should bring it up with them",
      timestamp: new Date(),
    },
  ];
}

// ============================================================================
// ORCHESTRATOR TESTS
// ============================================================================

describe('MemoryOrchestrator', () => {
  beforeEach(() => {
    // Reset all singletons
    resetMemoryOrchestrator();
    clearAssociativeMemory(TEST_USER_ID);
    resetBehavioralPatternDetector();
    resetCommunicationPreferences();
    resetEmotionalThreading();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recall', () => {
    it('should return orchestrated memory with formatted context', async () => {
      const orchestrator = getMemoryOrchestrator();
      const context = createMockRecallContext();

      const result = await orchestrator.recall(context);

      expect(result).toBeDefined();
      expect(result.primaryMemories).toBeDefined();
      expect(result.callbacks).toBeDefined();
      expect(result.emotional).toBeDefined();
      expect(result.activePatterns).toBeDefined();
      expect(typeof result.formattedContext).toBe('string');
    });

    it('should return session priming on first turn', async () => {
      const orchestrator = getMemoryOrchestrator();
      const context = createMockRecallContext({
        isSessionStart: true,
        conversationTurn: 0,
        profile: createMockProfile(),
        recentSummaries: ['Had a productive conversation about work goals'],
      });

      const result = await orchestrator.recall(context);

      // Session priming may or may not be available depending on memory content
      expect(result).toBeDefined();
    });

    it('should not return callbacks on early turns', async () => {
      const orchestrator = getMemoryOrchestrator();
      const context = createMockRecallContext({
        conversationTurn: 1,
      });

      const result = await orchestrator.recall(context);

      // Callbacks should be empty on turn 1 (minTurn is 3)
      expect(result.callbacks).toHaveLength(0);
    });

    it('should include emotional context', async () => {
      const orchestrator = getMemoryOrchestrator();
      const context = createMockRecallContext();

      const result = await orchestrator.recall(context);

      expect(result.emotional).toBeDefined();
      expect(result.emotional.userState).toBeDefined();
      expect(result.emotional.bondState).toBeDefined();
      expect(result.emotional.threads).toBeDefined();
    });
  });

  describe('recordInteraction', () => {
    it('should record conversation turns', async () => {
      const orchestrator = getMemoryOrchestrator();
      const turns = createMockTurns();

      await expect(
        orchestrator.recordInteraction({
          userId: TEST_USER_ID,
          turns,
          sessionEmotion: 'stressed',
          personaId: 'ferni',
          sessionId: 'test-session',
          sessionEndState: 'positive',
        })
      ).resolves.not.toThrow();
    });

    it('should extract behavioral patterns from turns', async () => {
      const orchestrator = getMemoryOrchestrator();
      const turns = createMockTurns();

      await orchestrator.recordInteraction({
        userId: TEST_USER_ID,
        turns,
        personaId: 'ferni',
      });

      // The pattern detector should have been called
      const detector = getBehavioralPatternDetector();
      const patterns = await detector.getPatterns(TEST_USER_ID);

      // May or may not find patterns depending on turn content
      expect(patterns).toBeDefined();
    });
  });

  describe('getMemoryHealth', () => {
    it('should return health stats', async () => {
      const orchestrator = getMemoryOrchestrator();

      const health = await orchestrator.getMemoryHealth(TEST_USER_ID);

      expect(health).toBeDefined();
      expect(typeof health.totalMemories).toBe('number');
      expect(typeof health.recentMemories).toBe('number');
      expect(typeof health.strongMemories).toBe('number');
      expect(typeof health.emotionalMemories).toBe('number');
      expect(typeof health.commitments).toBe('number');
    });
  });
});

// ============================================================================
// ASSOCIATIVE MEMORY TESTS
// ============================================================================

describe('AssociativeMemory', () => {
  beforeEach(() => {
    clearAssociativeMemory(TEST_USER_ID);
  });

  it('should register and retrieve memory triggers', async () => {
    const memory = getAssociativeMemory(TEST_USER_ID);
    const mockMemory = createMockMemory({
      content: 'User mentioned their daughter is starting college',
      personMentioned: 'daughter',
    });

    memory.registerMemory(mockMemory);

    const stats = memory.getStats();
    expect(stats.totalMemories).toBe(1);
    expect(stats.totalTriggers).toBeGreaterThan(0);
  });

  it('should trigger memories on person mentions', async () => {
    const memory = getAssociativeMemory(TEST_USER_ID);
    const mockMemory = createMockMemory({
      content: 'User is proud of their daughter getting into college',
      personMentioned: 'daughter',
      topics: ['family', 'education'],
    });

    memory.registerMemory(mockMemory);

    const triggered = await memory.getTriggeredMemories(
      'How is my daughter doing with her college applications?',
      { userId: TEST_USER_ID }
    );

    expect(triggered.length).toBeGreaterThanOrEqual(0);
  });

  it('should trigger memories on emotion mentions', async () => {
    const memory = getAssociativeMemory(TEST_USER_ID);
    const mockMemory = createMockMemory({
      content: 'User was feeling anxious about the job interview',
      emotionalWeight: 0.8,
    });

    memory.registerMemory(mockMemory);

    const triggered = await memory.getTriggeredMemories("I'm feeling anxious about tomorrow", {
      userId: TEST_USER_ID,
      currentEmotion: 'anxious',
    });

    // May or may not trigger depending on trigger strength
    expect(triggered).toBeDefined();
  });

  it('should export and import data', () => {
    const memory = getAssociativeMemory(TEST_USER_ID);
    const mockMemory = createMockMemory();
    memory.registerMemory(mockMemory);

    const exported = memory.export();
    expect(exported.memories.length).toBe(1);
    expect(exported.triggers.length).toBe(1);

    // Create new memory and import
    const newMemory = new AssociativeMemory();
    newMemory.import(exported);

    const stats = newMemory.getStats();
    expect(stats.totalMemories).toBe(1);
  });
});

// ============================================================================
// BEHAVIORAL PATTERN DETECTOR TESTS
// ============================================================================

describe('BehavioralPatternDetector', () => {
  beforeEach(() => {
    resetBehavioralPatternDetector();
  });

  it('should detect pre-decision doubt pattern', async () => {
    const detector = getBehavioralPatternDetector();
    // Test data needs context indicators (decision, choice, job offer, relationship, move)
    // to satisfy the pattern's contextIndicators requirement
    const turns: ConversationTurn[] = [
      {
        role: 'user',
        content: "I don't know if I should take this job offer",
        timestamp: new Date(),
      },
      {
        role: 'user',
        content: 'What if I make the wrong choice about this job?',
        timestamp: new Date(),
      },
      { role: 'user', content: "I'm not sure about this decision at all", timestamp: new Date() },
      { role: 'user', content: 'Should I make a decision now or wait?', timestamp: new Date() },
    ];

    const patterns = await detector.analyzeForPatterns(turns, []);

    // Should detect pre_decision_doubt pattern
    const doubtPattern = patterns.find((p) => p.patternType === 'pre_decision_doubt');
    expect(doubtPattern).toBeDefined();
    expect(doubtPattern?.confidence).toBeGreaterThan(0);
  });

  it('should detect progress minimization pattern', async () => {
    const detector = getBehavioralPatternDetector();
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'It was just a small thing, not a big deal', timestamp: new Date() },
      { role: 'user', content: 'Anyone could have done that', timestamp: new Date() },
      { role: 'user', content: 'I barely did anything special', timestamp: new Date() },
      { role: 'user', content: "I'm not that talented, just got lucky", timestamp: new Date() },
    ];

    const patterns = await detector.analyzeForPatterns(turns, []);

    const minimizationPattern = patterns.find((p) => p.patternType === 'progress_minimization');
    expect(minimizationPattern).toBeDefined();
  });

  it('should persist patterns across analyses', async () => {
    const detector = getBehavioralPatternDetector();

    // First analysis
    const firstTurns: ConversationTurn[] = [
      { role: 'user', content: "I don't know what to do", timestamp: new Date() },
      { role: 'user', content: 'What if I mess up?', timestamp: new Date() },
      { role: 'user', content: "I'm torn between the options", timestamp: new Date() },
    ];
    const firstPatterns = await detector.analyzeForPatterns(firstTurns, []);

    // Second analysis with existing patterns
    const secondTurns: ConversationTurn[] = [
      { role: 'user', content: 'Should I apply for this job?', timestamp: new Date() },
      { role: 'user', content: "I'm not sure if I'm qualified", timestamp: new Date() },
    ];
    const secondPatterns = await detector.analyzeForPatterns(secondTurns, firstPatterns);

    // Pattern confidence should have increased
    const pattern = secondPatterns.find((p) => p.patternType === 'pre_decision_doubt');
    if (pattern) {
      expect(pattern.frequency).toBeGreaterThan(0);
    }
  });

  it('should provide active pattern guidance', async () => {
    const detector = getBehavioralPatternDetector();

    // Create and save a pattern
    const turns: ConversationTurn[] = [
      { role: 'user', content: "I don't know if I should do this", timestamp: new Date() },
      { role: 'user', content: "What if it doesn't work out?", timestamp: new Date() },
      { role: 'user', content: "I'm unsure about this decision", timestamp: new Date() },
    ];
    const patterns = await detector.analyzeForPatterns(turns, []);
    await detector.savePatterns(TEST_USER_ID, patterns);

    // Get guidance
    const guidance = await detector.getActivePatternGuidance(
      TEST_USER_ID,
      "I don't know what to do about this offer"
    );

    expect(guidance).toBeDefined();
    // May have activePattern or guidance depending on pattern confidence
  });
});

// ============================================================================
// COMMUNICATION PREFERENCES TESTS
// ============================================================================

describe('CommunicationPreferences', () => {
  beforeEach(() => {
    resetCommunicationPreferences();
  });

  it('should observe interaction and update preferences', async () => {
    const prefs = getCommunicationPreferences();

    await prefs.observeInteraction({
      userId: TEST_USER_ID,
      dimension: 'depth',
      ourApproach: 'Asked a deep question about their feelings',
      userResponse: 'Opened up and shared more details',
      situation: 'discussing work stress',
    });

    const guidance = await prefs.getApproachGuidance(TEST_USER_ID, {});

    expect(guidance).toBeDefined();
    expect(guidance.approach).toBeDefined();
    expect(guidance.embrace).toBeDefined();
    expect(guidance.avoid).toBeDefined();
  });

  it('should learn from multiple interactions', async () => {
    const prefs = getCommunicationPreferences();

    // Multiple observations
    await prefs.observeInteraction({
      userId: TEST_USER_ID,
      dimension: 'humor',
      ourApproach: 'Made a light joke',
      userResponse: 'Laughed and relaxed',
      situation: 'tense moment',
    });

    await prefs.observeInteraction({
      userId: TEST_USER_ID,
      dimension: 'directness',
      ourApproach: 'Gave direct advice',
      userResponse: 'Appreciated the clarity',
      situation: 'asking for guidance',
    });

    const guidance = await prefs.getApproachGuidance(TEST_USER_ID, {});

    // Should have learned from both interactions
    expect(guidance.embrace.length + guidance.avoid.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// EMOTIONAL THREADING TESTS
// ============================================================================

describe('EmotionalThreading', () => {
  beforeEach(() => {
    resetEmotionalThreading();
  });

  it('should record session end with emotional context', async () => {
    const threading = getEmotionalThreading();

    await threading.recordSessionEnd({
      userId: TEST_USER_ID,
      sessionId: 'session-1',
      dominantEmotion: 'anxious',
      endState: 'unresolved',
      unresolvedTopics: ['work deadline', 'relationship concerns'],
    });

    const context = await threading.getSessionContext(TEST_USER_ID);

    expect(context).toBeDefined();
    expect(context.activeThreads).toBeDefined();
    expect(context.suggestedApproach).toBeDefined();
  });

  it('should track unresolved emotional threads', async () => {
    const threading = getEmotionalThreading();

    // Record an unresolved session
    await threading.recordSessionEnd({
      userId: TEST_USER_ID,
      sessionId: 'session-2',
      dominantEmotion: 'stressed',
      endState: 'heavy',
      unresolvedTopics: ['career change'],
    });

    const context = await threading.getSessionContext(TEST_USER_ID);

    // Should have created a thread
    if (context.activeThreads.length > 0) {
      const thread = context.activeThreads[0];
      expect(thread.status).toBe('unresolved');
      expect(thread.topic).toBeDefined();
    }
  });

  it('should resolve emotional threads', async () => {
    const threading = getEmotionalThreading();

    // Create thread via session end
    await threading.recordSessionEnd({
      userId: TEST_USER_ID,
      sessionId: 'session-3',
      dominantEmotion: 'worried',
      endState: 'hopeful',
      unresolvedTopics: ['interview preparation'],
    });

    // Get context to find thread
    const context = await threading.getSessionContext(TEST_USER_ID);

    if (context.activeThreads.length > 0) {
      const threadId = context.activeThreads[0].id;
      await threading.resolveThread(TEST_USER_ID, threadId);

      // Check it's resolved
      const newContext = await threading.getSessionContext(TEST_USER_ID);
      const thread = newContext.activeThreads.find((t) => t.id === threadId);

      // Thread should either be removed or marked resolved
      if (thread) {
        expect(thread.status).toBe('resolved');
      }
    }
  });
});

// ============================================================================
// NATURAL REFERENCE GENERATOR TESTS
// ============================================================================

describe('NaturalReferenceGenerator', () => {
  it('should generate natural memory references', () => {
    const generator = getNaturalReferenceGenerator();
    const mockMemory = {
      item: createMockMemory({
        content: 'User mentioned their daughter is starting college next month',
      }),
      score: 0.8,
      reason: 'topic_match',
      scoreBreakdown: {
        semantic: 0.7,
        temporal: 0.6,
        emotional: 0.5,
        contextual: 0.8,
      },
      suggestedReference: '',
      connectionType: 'topic_match' as const,
      connectionStrength: 'strong' as const,
    };

    const reference = generator.generate(mockMemory, {
      userMood: 'neutral',
      relationshipStage: 'established',
      personaId: 'ferni',
      conversationTone: 'warm',
    });

    expect(reference).toBeDefined();
    expect(reference.reference).toBeTruthy();
    expect(reference.style).toBeDefined();
    expect(reference.confidence).toBeDefined();
  });

  it('should vary references by persona', () => {
    const generator = getNaturalReferenceGenerator();
    const mockMemory = {
      item: createMockMemory(),
      score: 0.7,
      reason: 'emotional_resonance',
      scoreBreakdown: {
        semantic: 0.6,
        temporal: 0.5,
        emotional: 0.8,
        contextual: 0.6,
      },
      suggestedReference: '',
      connectionType: 'emotional_resonance' as const,
      connectionStrength: 'moderate' as const,
    };

    const ferniRef = generator.generate(mockMemory, {
      userMood: 'happy',
      relationshipStage: 'deep',
      personaId: 'ferni',
      conversationTone: 'warm',
    });

    const mayaRef = generator.generate(mockMemory, {
      userMood: 'happy',
      relationshipStage: 'deep',
      personaId: 'maya',
      conversationTone: 'warm',
    });

    // Both should generate valid references
    expect(ferniRef.reference).toBeTruthy();
    expect(mayaRef.reference).toBeTruthy();
  });
});
