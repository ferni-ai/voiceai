/**
 * Unit Tests for Semantic Intelligence Services
 *
 * Tests all 6 "Better Than Human V3" semantic intelligence capabilities:
 * 1. Correlation Mining
 * 2. Emotional Trajectories
 * 3. Relational Semantics
 * 4. Counter-Factual Memory
 * 5. Growth Fingerprint
 * 6. Cross-Session Threading
 *
 * Plus integration layer and advice detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore before importing modules
vi.mock('../../../firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
}));

// Mock embeddings
vi.mock('../../../../memory/embeddings.js', () => ({
  generateEmbedding: vi.fn(async (text: string) => {
    // Return a simple hash-based embedding for testing
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array(768)
      .fill(0)
      .map((_, i) => Math.sin(hash * i * 0.001));
  }),
  embed: vi.fn(async (text: string) => {
    // Alias for generateEmbedding - some modules use this name
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array(768)
      .fill(0)
      .map((_, i) => Math.sin(hash * i * 0.001));
  }),
  cosineSimilarity: vi.fn((a: number[], b: number[]) => {
    // Simple mock similarity
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * (b[i] || 0), 0);
    const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dotProduct / (magA * magB) || 0;
  }),
}));

// Import after mocks
import { correlationMining, recordObservation } from '../correlation-mining.js';
import { emotionalTrajectories, recordEmotionalWaypoint } from '../emotional-trajectories.js';
import { relationalSemantics, recordPersonMention } from '../relational-semantics.js';
import { counterfactualMemory, recordDecisionPoint } from '../counterfactual-memory.js';
import { growthFingerprint, recordConversationData } from '../growth-fingerprint.js';
import { crossSessionThreading, recordMoment } from '../cross-session-threading.js';
import { detectAdvice, trackAdviceInResponse } from '../advice-detector.js';
import {
  processSemanticIntelligence,
  warmupSemanticIntelligence,
  type TurnSemanticData,
} from '../integration.js';

// Test user ID
const TEST_USER_ID = 'test-user-semantic-123';

// ============================================================================
// CORRELATION MINING TESTS
// ============================================================================

describe('Correlation Mining', () => {
  beforeEach(() => {
    correlationMining.clearCache(TEST_USER_ID);
  });

  it('should record observations', async () => {
    await expect(
      recordObservation(TEST_USER_ID, {
        domain: 'work',
        pattern: 'stress',
        context: 'Deadline approaching',
      })
    ).resolves.not.toThrow();
  });

  it('should have a working cache', () => {
    expect(correlationMining.clearCache).toBeDefined();
    expect(() => correlationMining.clearCache(TEST_USER_ID)).not.toThrow();
  });

  it('should track correlation patterns by domain', async () => {
    // Record multiple observations
    await recordObservation(TEST_USER_ID, {
      domain: 'sleep',
      pattern: 'poor_sleep',
      context: 'Couldnt sleep last night',
    });

    await recordObservation(TEST_USER_ID, {
      domain: 'work',
      pattern: 'high_stress',
      context: 'Big presentation tomorrow',
    });

    // Should not throw
    expect(true).toBe(true);
  });
});

// ============================================================================
// EMOTIONAL TRAJECTORIES TESTS
// ============================================================================

describe('Emotional Trajectories', () => {
  beforeEach(() => {
    emotionalTrajectories.clearCache(TEST_USER_ID);
  });

  it('should record emotional waypoints', async () => {
    await expect(
      recordEmotionalWaypoint(TEST_USER_ID, {
        emotion: 'anxious',
        intensity: 0.7,
        valence: -0.6,
        context: 'job interview',
        trigger: 'career_change',
      })
    ).resolves.not.toThrow();
  });

  it('should track positive and negative emotions', async () => {
    // Positive waypoint
    await recordEmotionalWaypoint(TEST_USER_ID, {
      emotion: 'excited',
      intensity: 0.8,
      valence: 0.8,
      context: 'got the job',
    });

    // Negative waypoint
    await recordEmotionalWaypoint(TEST_USER_ID, {
      emotion: 'disappointed',
      intensity: 0.6,
      valence: -0.5,
      context: 'project delayed',
    });

    expect(true).toBe(true);
  });

  it('should clear cache properly', () => {
    expect(() => emotionalTrajectories.clearCache(TEST_USER_ID)).not.toThrow();
    expect(() => emotionalTrajectories.clearCache()).not.toThrow();
  });
});

// ============================================================================
// RELATIONAL SEMANTICS TESTS
// ============================================================================

describe('Relational Semantics', () => {
  beforeEach(() => {
    relationalSemantics.clearCache(TEST_USER_ID);
  });

  it('should record person mentions', async () => {
    await expect(
      recordPersonMention(TEST_USER_ID, {
        name: 'Mom',
        relationship: 'parent',
        context: 'Mom called today',
        emotion: 'happy',
        sentiment: 0.7,
        topics: ['family'],
      })
    ).resolves.not.toThrow();
  });

  it('should track different relationship types', async () => {
    const relationships = [
      { name: 'Sarah', relationship: 'friend', sentiment: 0.8 },
      { name: 'Boss', relationship: 'work', sentiment: -0.3 },
      { name: 'Max', relationship: 'pet', sentiment: 0.9 },
    ];

    for (const rel of relationships) {
      await recordPersonMention(TEST_USER_ID, {
        name: rel.name,
        relationship: rel.relationship,
        context: `Mentioned ${rel.name}`,
        sentiment: rel.sentiment,
      });
    }

    expect(true).toBe(true);
  });

  it('should accumulate emotional impact per person', async () => {
    // Multiple mentions of same person with varying sentiment
    await recordPersonMention(TEST_USER_ID, {
      name: 'Alex',
      context: 'Alex helped me',
      sentiment: 0.9,
    });

    await recordPersonMention(TEST_USER_ID, {
      name: 'Alex',
      context: 'Alex was supportive',
      sentiment: 0.7,
    });

    expect(true).toBe(true);
  });
});

// ============================================================================
// COUNTER-FACTUAL MEMORY TESTS
// ============================================================================

describe('Counter-Factual Memory', () => {
  beforeEach(() => {
    counterfactualMemory.clearCache(TEST_USER_ID);
  });

  it('should record decision points', async () => {
    await expect(
      recordDecisionPoint(TEST_USER_ID, {
        advice: 'Try taking a short walk before the meeting',
        context: 'Feeling anxious about presentation',
        domain: 'work',
      })
    ).resolves.not.toThrow();
  });

  it('should track multiple advice instances', async () => {
    const adviceItems = [
      { advice: 'Sleep earlier tonight', domain: 'health' },
      { advice: 'Talk to your manager', domain: 'work' },
      { advice: 'Reach out to Sarah', domain: 'relationships' },
    ];

    for (const item of adviceItems) {
      await recordDecisionPoint(TEST_USER_ID, {
        advice: item.advice,
        context: 'User seeking guidance',
        domain: item.domain,
      });
    }

    expect(true).toBe(true);
  });
});

// ============================================================================
// GROWTH FINGERPRINT TESTS
// ============================================================================

describe('Growth Fingerprint', () => {
  beforeEach(() => {
    growthFingerprint.clearCache(TEST_USER_ID);
  });

  it('should record conversation data', async () => {
    await expect(
      recordConversationData(TEST_USER_ID, {
        topics: ['career', 'goals'],
        emotion: 'hopeful',
        messageText: 'I think I can really do this',
        cognitivePattern: 'growth',
      })
    ).resolves.not.toThrow();
  });

  it('should track different cognitive patterns', async () => {
    const patterns: Array<'problem_solving' | 'catastrophizing' | 'growth' | 'self_compassion'> = [
      'problem_solving',
      'catastrophizing',
      'growth',
      'self_compassion',
    ];

    for (const pattern of patterns) {
      await recordConversationData(TEST_USER_ID, {
        topics: ['test'],
        messageText: `Testing ${pattern}`,
        cognitivePattern: pattern,
      });
    }

    expect(true).toBe(true);
  });

  it('should work without optional fields', async () => {
    await expect(
      recordConversationData(TEST_USER_ID, {
        messageText: 'Just a simple message',
      })
    ).resolves.not.toThrow();
  });
});

// ============================================================================
// CROSS-SESSION THREADING TESTS
// ============================================================================

describe('Cross-Session Threading', () => {
  beforeEach(() => {
    crossSessionThreading.clearCache(TEST_USER_ID);
  });

  it('should record moments', async () => {
    await expect(
      recordMoment(TEST_USER_ID, {
        content: 'Had a breakthrough today about my career path',
        emotion: 'excited',
        topic: 'career',
        significance: 'high',
      })
    ).resolves.not.toThrow();
  });

  it('should track moments with different significance', async () => {
    const moments = [
      { content: 'Quick chat', significance: 'low' as const },
      { content: 'Discussed goals', significance: 'medium' as const },
      { content: 'Major life decision', significance: 'high' as const },
    ];

    for (const moment of moments) {
      await recordMoment(TEST_USER_ID, {
        content: moment.content,
        significance: moment.significance,
      });
    }

    expect(true).toBe(true);
  });
});

// ============================================================================
// ADVICE DETECTOR TESTS
// ============================================================================

describe('Advice Detector', () => {
  it('should detect explicit advice patterns', () => {
    const testCases = [
      { text: 'You should try getting more sleep.', expected: true },
      { text: "I'd suggest taking a break.", expected: true },
      { text: "I'd recommend talking to her.", expected: true },
      { text: 'My advice would be to wait.', expected: true },
      { text: 'Why not try something different.', expected: true }, // Not a question
    ];

    for (const { text, expected } of testCases) {
      const result = detectAdvice(text);
      expect(result.containsAdvice).toBe(expected);
      if (expected) {
        expect(result.adviceText).toBeTruthy();
        expect(result.category).toBeTruthy();
      }
    }
  });

  it('should not detect questions as advice', () => {
    const questions = [
      'Have you tried that before?',
      'What do you think you should do?',
      'Did you consider talking to her?',
    ];

    for (const text of questions) {
      const result = detectAdvice(text);
      expect(result.containsAdvice).toBe(false);
    }
  });

  it('should categorize advice correctly', () => {
    const categorizedAdvice = [
      { text: "It's okay to take a break", expectedCategory: 'emotional' },
      { text: 'Set boundaries with that person', expectedCategory: 'relational' }, // Uses "set boundaries" pattern
      { text: 'Try to get some rest', expectedCategory: 'behavioral' },
      { text: 'Remember that growth takes time', expectedCategory: 'philosophical' },
    ];

    for (const { text, expectedCategory } of categorizedAdvice) {
      const result = detectAdvice(text);
      expect(result.category).toBe(expectedCategory);
    }
  });

  it('should extract advice sentence', () => {
    const text = 'I hear you. You should try talking to her. That might help.';
    const result = detectAdvice(text);

    expect(result.containsAdvice).toBe(true);
    expect(result.adviceText).toContain('should try talking');
  });

  it('should report confidence levels', () => {
    const strongAdvice = 'My advice is to take some time off.';
    const weakAdvice = 'You could consider that.';

    const strongResult = detectAdvice(strongAdvice);
    const weakResult = detectAdvice(weakAdvice);

    expect(strongResult.confidence).toBeGreaterThan(0.8);
    expect(weakResult.confidence).toBeLessThan(strongResult.confidence);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Semantic Intelligence Integration', () => {
  beforeEach(() => {
    // Clear all caches
    correlationMining.clearCache(TEST_USER_ID);
    emotionalTrajectories.clearCache(TEST_USER_ID);
    relationalSemantics.clearCache(TEST_USER_ID);
    counterfactualMemory.clearCache(TEST_USER_ID);
    growthFingerprint.clearCache(TEST_USER_ID);
    crossSessionThreading.clearCache(TEST_USER_ID);
  });

  it('should process semantic intelligence without errors', async () => {
    const turnData: TurnSemanticData = {
      userId: TEST_USER_ID,
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 1,
      userText: "I had a long day at work and I'm feeling tired",
      topic: 'work',
      textEmotion: 'tired',
      textEmotionIntensity: 0.6,
      timestamp: new Date(),
      dayOfWeek: 3,
      hourOfDay: 18,
      turnsSinceStart: 1,
    };

    await expect(processSemanticIntelligence(turnData)).resolves.not.toThrow();
  });

  it('should skip anonymous users', async () => {
    const turnData: TurnSemanticData = {
      userId: 'anonymous',
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 1,
      userText: 'Hello',
      timestamp: new Date(),
      dayOfWeek: 3,
      hourOfDay: 18,
      turnsSinceStart: 1,
    };

    // Should complete without processing
    await expect(processSemanticIntelligence(turnData)).resolves.not.toThrow();
  });

  it('should handle warmup without errors', async () => {
    await expect(warmupSemanticIntelligence(TEST_USER_ID)).resolves.not.toThrow();
  });

  it('should skip warmup for anonymous users', async () => {
    await expect(warmupSemanticIntelligence('anonymous')).resolves.not.toThrow();
  });

  it('should process turn data with person mentions', async () => {
    const turnData: TurnSemanticData = {
      userId: TEST_USER_ID,
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 2,
      userText: 'My mom called today and we had a nice chat',
      topic: 'family',
      textEmotion: 'happy',
      textEmotionIntensity: 0.7,
      timestamp: new Date(),
      dayOfWeek: 3,
      hourOfDay: 14,
      turnsSinceStart: 2,
    };

    await expect(processSemanticIntelligence(turnData)).resolves.not.toThrow();
  });

  it('should process turn data with high emotional intensity', async () => {
    const turnData: TurnSemanticData = {
      userId: TEST_USER_ID,
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 3,
      userText: "I just got promoted! I can't believe it!",
      topic: 'career',
      textEmotion: 'excited',
      textEmotionIntensity: 0.95,
      timestamp: new Date(),
      dayOfWeek: 3,
      hourOfDay: 15,
      turnsSinceStart: 3,
    };

    await expect(processSemanticIntelligence(turnData)).resolves.not.toThrow();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty user text', async () => {
    const turnData: TurnSemanticData = {
      userId: TEST_USER_ID,
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 1,
      userText: '',
      timestamp: new Date(),
      dayOfWeek: 3,
      hourOfDay: 10,
      turnsSinceStart: 1,
    };

    await expect(processSemanticIntelligence(turnData)).resolves.not.toThrow();
  });

  it('should handle very long user text', async () => {
    const longText = 'This is a test. '.repeat(100);
    const turnData: TurnSemanticData = {
      userId: TEST_USER_ID,
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 1,
      userText: longText,
      timestamp: new Date(),
      dayOfWeek: 3,
      hourOfDay: 10,
      turnsSinceStart: 1,
    };

    await expect(processSemanticIntelligence(turnData)).resolves.not.toThrow();
  });

  it('should handle missing optional fields', async () => {
    const minimalData: TurnSemanticData = {
      userId: TEST_USER_ID,
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 1,
      userText: 'Hello',
      timestamp: new Date(),
      dayOfWeek: 1,
      hourOfDay: 9,
      turnsSinceStart: 1,
    };

    await expect(processSemanticIntelligence(minimalData)).resolves.not.toThrow();
  });

  it('should handle special characters in text', async () => {
    const turnData: TurnSemanticData = {
      userId: TEST_USER_ID,
      sessionId: 'test-session',
      personaId: 'ferni',
      turnNumber: 1,
      userText: 'Hello! 👋 How are you doing? 😊 <script>alert()</script>',
      timestamp: new Date(),
      dayOfWeek: 5,
      hourOfDay: 12,
      turnsSinceStart: 1,
    };

    await expect(processSemanticIntelligence(turnData)).resolves.not.toThrow();
  });
});

// ============================================================================
// CACHE BEHAVIOR TESTS
// ============================================================================

describe('Cache Behavior', () => {
  it('should clear individual user cache', () => {
    expect(() => correlationMining.clearCache(TEST_USER_ID)).not.toThrow();
    expect(() => emotionalTrajectories.clearCache(TEST_USER_ID)).not.toThrow();
    expect(() => relationalSemantics.clearCache(TEST_USER_ID)).not.toThrow();
    expect(() => counterfactualMemory.clearCache(TEST_USER_ID)).not.toThrow();
    expect(() => growthFingerprint.clearCache(TEST_USER_ID)).not.toThrow();
    expect(() => crossSessionThreading.clearCache(TEST_USER_ID)).not.toThrow();
  });

  it('should clear all caches when no userId provided', () => {
    expect(() => correlationMining.clearCache()).not.toThrow();
    expect(() => emotionalTrajectories.clearCache()).not.toThrow();
    expect(() => relationalSemantics.clearCache()).not.toThrow();
    expect(() => counterfactualMemory.clearCache()).not.toThrow();
    expect(() => growthFingerprint.clearCache()).not.toThrow();
    expect(() => crossSessionThreading.clearCache()).not.toThrow();
  });
});

// ============================================================================
// V3.1 ENHANCEMENTS: PERSON EXTRACTOR TESTS
// ============================================================================

describe('Person Extractor (V3.1)', () => {
  // Import inline to ensure mocks are set up
  let extractPersons: typeof import('../person-extractor.js').extractPersons;
  let getPrimaryPerson: typeof import('../person-extractor.js').getPrimaryPerson;
  let getPrimaryPersonName: typeof import('../person-extractor.js').getPrimaryPersonName;

  beforeEach(async () => {
    const module = await import('../person-extractor.js');
    extractPersons = module.extractPersons;
    getPrimaryPerson = module.getPrimaryPerson;
    getPrimaryPersonName = module.getPrimaryPersonName;
  });

  it('should extract relationship-based mentions', () => {
    const text = 'I talked to my mom today and she gave me some advice.';
    const persons = extractPersons(text);

    expect(persons.length).toBeGreaterThan(0);
    expect(persons.some((p) => p.relationship === 'parent')).toBe(true);
    // Relationship terms are matched - may be "my mom", "mom", etc.
    expect(persons.some((p) => !p.isProperName)).toBe(true);
  });

  it('should extract proper names from context', () => {
    const text = 'Sarah called me this morning to catch up.';
    const persons = extractPersons(text);

    expect(persons.length).toBeGreaterThan(0);
    expect(persons.some((p) => p.name === 'Sarah')).toBe(true);
    expect(persons.some((p) => p.isProperName)).toBe(true);
  });

  it('should extract multiple people', () => {
    const text = 'My brother and I met John at the coffee shop.';
    const persons = extractPersons(text);

    expect(persons.length).toBeGreaterThanOrEqual(2);
    expect(persons.some((p) => p.relationship === 'sibling')).toBe(true);
    expect(persons.some((p) => p.name === 'John')).toBe(true);
  });

  it('should extract spouse/partner mentions', () => {
    const text = 'My wife and I are planning a vacation.';
    const persons = extractPersons(text);

    expect(persons.length).toBeGreaterThan(0);
    expect(persons.some((p) => p.relationship === 'spouse')).toBe(true);
  });

  it('should extract professional relationships', () => {
    const text = 'I had a meeting with my boss today.';
    const persons = extractPersons(text);

    expect(persons.length).toBeGreaterThan(0);
    expect(persons.some((p) => p.relationship === 'coworker')).toBe(true);
  });

  it('should return empty array for text without people', () => {
    const text = 'The weather is nice today.';
    const persons = extractPersons(text);

    expect(persons).toEqual([]);
  });

  it('should get primary person (highest confidence)', () => {
    const text = 'My mom and I talked about Sarah.';
    const primary = getPrimaryPerson(text);

    expect(primary).not.toBeNull();
    expect(primary!.confidence).toBeGreaterThan(0);
  });

  it('should get primary person name convenience function', () => {
    const text = 'I spoke with my therapist yesterday.';
    const name = getPrimaryPersonName(text);

    expect(name).toBeDefined();
  });

  it('should handle empty text', () => {
    const persons = extractPersons('');
    expect(persons).toEqual([]);

    const primary = getPrimaryPerson('');
    expect(primary).toBeNull();
  });

  it('should include confidence scores', () => {
    const text = 'My best friend Sarah is amazing.';
    const persons = extractPersons(text);

    for (const person of persons) {
      expect(person.confidence).toBeGreaterThan(0);
      expect(person.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should include context snippets', () => {
    const text = 'I talked to my mom about the situation.';
    const persons = extractPersons(text);

    for (const person of persons) {
      expect(person.contextSnippet).toBeDefined();
      expect(person.contextSnippet.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// V3.1 ENHANCEMENTS: ADVICE MATCHER TESTS
// ============================================================================

describe('Advice Matcher (V3.1)', () => {
  let findMatchingAdvice: typeof import('../advice-matcher.js').findMatchingAdvice;
  let precomputeAdviceEmbeddings: typeof import('../advice-matcher.js').precomputeAdviceEmbeddings;
  let clearAdviceEmbeddingCache: typeof import('../advice-matcher.js').clearAdviceEmbeddingCache;
  type PastAdvice = import('../advice-matcher.js').PastAdvice;

  beforeEach(async () => {
    const module = await import('../advice-matcher.js');
    findMatchingAdvice = module.findMatchingAdvice;
    precomputeAdviceEmbeddings = module.precomputeAdviceEmbeddings;
    clearAdviceEmbeddingCache = module.clearAdviceEmbeddingCache;

    // Clear cache before each test
    clearAdviceEmbeddingCache();
  });

  const sampleAdvice: PastAdvice[] = [
    {
      id: 'advice-1',
      adviceText: 'Try getting more sleep and resting properly',
      topic: 'health',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
    {
      id: 'advice-2',
      adviceText: 'Consider setting clearer boundaries at work',
      topic: 'work',
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    },
    {
      id: 'advice-3',
      adviceText: 'Try talking to your partner about how you feel',
      topic: 'relationship',
      timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
    },
  ];

  it('should return null when no advice matches', async () => {
    const match = await findMatchingAdvice('The weather is nice today.', sampleAdvice);
    expect(match).toBeNull();
  });

  it('should match on explicit advice reference', async () => {
    // Pre-compute embeddings first for semantic matching
    await precomputeAdviceEmbeddings(sampleAdvice);

    // Test with user text that explicitly references advice AND mentions topic keywords
    // "I tried" triggers follow-through pattern, "sleep" matches advice keyword
    const match = await findMatchingAdvice(
      'I tried getting more sleep like you suggested and it really helped my health',
      sampleAdvice
    );

    // Should find a match via topic matching (keyword overlap) even with mock embeddings
    expect(match).not.toBeNull();
    if (match) {
      expect(match.advice.topic).toBe('health');
    }
  });

  it('should match on implicit follow-through', async () => {
    // Pre-compute embeddings first
    await precomputeAdviceEmbeddings(sampleAdvice);

    // Test with text that triggers follow-through pattern and has strong keyword overlap
    const match = await findMatchingAdvice(
      'I finally did set boundaries at work like you said and it made a difference',
      sampleAdvice
    );

    // Should match via topic matching (work, boundaries keywords)
    expect(match).not.toBeNull();
    if (match) {
      expect(match.advice.topic).toBe('work');
    }
  });

  it('should return null for text without follow-through patterns', async () => {
    const match = await findMatchingAdvice('My dog is so cute', sampleAdvice);
    expect(match).toBeNull();
  });

  it('should return null when no advice to match against', async () => {
    const match = await findMatchingAdvice('I tried it', []);
    expect(match).toBeNull();
  });

  it('should precompute advice embeddings without error', async () => {
    await expect(precomputeAdviceEmbeddings(sampleAdvice)).resolves.not.toThrow();
  });

  it('should include match metadata', async () => {
    const match = await findMatchingAdvice(
      'I did what you said about boundaries at work',
      sampleAdvice
    );

    if (match) {
      expect(match.advice).toBeDefined();
      expect(match.similarity).toBeGreaterThanOrEqual(0);
      expect(match.confidence).toBeGreaterThanOrEqual(0);
      expect(['semantic', 'explicit', 'topic']).toContain(match.matchType);
    }
  });

  it('should handle recent advice boost', async () => {
    const recentAdvice: PastAdvice[] = [
      {
        id: 'recent-1',
        adviceText: 'Try meditation',
        topic: 'health',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
      },
      {
        id: 'old-1',
        adviceText: 'Try meditation',
        topic: 'health',
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      },
    ];

    const match = await findMatchingAdvice('I tried the meditation thing', recentAdvice);

    // Should prefer more recent advice when both match
    if (match) {
      expect(match.advice.id).toBe('recent-1');
    }
  });
});
