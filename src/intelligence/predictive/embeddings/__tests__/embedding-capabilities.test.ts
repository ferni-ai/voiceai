/**
 * Tests for Embedding-Powered Predictive Intelligence
 *
 * Tests all 7 embedding capabilities:
 * 1. Semantic Avoidance
 * 2. Trajectory Patterns
 * 3. Breakthrough Embeddings
 * 4. Conversation Trajectory
 * 5. Cognitive Similarity
 * 6. Ripple Embedding Space
 * 7. Intervention Matching
 *
 * Note: These tests use mock embeddings to avoid API calls.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the embeddings module before imports
vi.mock('../../../../memory/embeddings.js', () => ({
  embed: vi.fn().mockImplementation((text: string) => {
    // Generate deterministic mock embedding based on text hash
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const embedding = new Array(768).fill(0).map((_, i) => Math.sin(hash + i) * 0.5);
    // Normalize
    const mag = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return Promise.resolve(embedding.map((v) => v / mag));
  }),
  embedBatch: vi.fn().mockImplementation((texts: string[]) => {
    return Promise.all(
      texts.map((text) => {
        const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const embedding = new Array(768).fill(0).map((_, i) => Math.sin(hash + i) * 0.5);
        const mag = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        return embedding.map((v) => v / mag);
      })
    );
  }),
  cosineSimilarity: vi.fn().mockImplementation((a: number[], b: number[]) => {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }),
  findTopK: vi.fn().mockImplementation((query, vectors, k) => {
    return vectors
      .slice(0, k)
      .map((v: number[], i: number) => ({ index: i, score: 0.8 - i * 0.1 }));
  }),
}));

// Import after mock
import { semanticAvoidance } from '../semantic-avoidance.js';
import { trajectoryPatterns } from '../trajectory-patterns.js';
import { breakthroughEmbeddings } from '../breakthrough-embeddings.js';
import { conversationTrajectory } from '../conversation-trajectory.js';
import { cognitiveSimilarity } from '../cognitive-similarity.js';
import { rippleEmbeddingSpace } from '../ripple-embedding-space.js';
import { interventionMatching } from '../intervention-matching.js';
import { getEmbeddingPredictiveContext } from '../index.js';

// Test user ID
const TEST_USER = 'test-embedding-' + Date.now();

describe('Embedding-Powered Predictive Intelligence', () => {
  // =========================================================================
  // 1. SEMANTIC AVOIDANCE
  // =========================================================================
  describe('Semantic Avoidance', () => {
    it('should record avoidance with embedding', async () => {
      const userId = `${TEST_USER}-avoidance`;

      await semanticAvoidance.recordAvoidanceWithEmbedding(userId, 'relationship:father', {
        deflectionStyle: 'humor',
        emotionalState: 'anxious',
      });

      // Should have recorded
      const context = semanticAvoidance.buildSemanticAvoidanceContext(userId);
      expect(typeof context).toBe('string');
    });

    it('should find related avoidances', async () => {
      const userId = `${TEST_USER}-avoidance-related`;

      // Record multiple avoidances
      await semanticAvoidance.recordAvoidanceWithEmbedding(userId, 'authority figures', {
        deflectionStyle: 'topic_change',
      });
      await semanticAvoidance.recordAvoidanceWithEmbedding(userId, 'being judged', {
        deflectionStyle: 'minimize',
      });

      // Find related
      const related = await semanticAvoidance.findRelatedAvoidances(userId, 'father');
      expect(Array.isArray(related)).toBe(true);
    });

    it('should check if near avoided territory', async () => {
      const userId = `${TEST_USER}-avoidance-near`;

      await semanticAvoidance.recordAvoidanceWithEmbedding(userId, 'childhood trauma', {
        deflectionStyle: 'humor',
      });

      const result = await semanticAvoidance.isNearAvoidedTerritory(
        userId,
        'my early memories',
        'thinking about when I was young'
      );

      expect(result).toHaveProperty('isNear');
      expect(result).toHaveProperty('distance');
    });
  });

  // =========================================================================
  // 2. TRAJECTORY PATTERNS
  // =========================================================================
  describe('Trajectory Patterns', () => {
    it('should record trajectory pattern', async () => {
      const userId = `${TEST_USER}-trajectory`;

      const pattern = await trajectoryPatterns.recordTrajectoryPattern(userId, {
        userId,
        trajectory: 'anxiety_spike',
        severity: 0.7,
        duration: 48,
        precursorSignals: [
          { signal: 'rumination_increase', value: 0.8, daysBeforeOnset: 3 },
          { signal: 'sleep_pattern_change', value: 0.6, daysBeforeOnset: 2 },
        ],
        contextDescription: 'Work deadline approaching with team conflict',
        lifeDomains: ['work', 'relationships'],
        recordedAt: Date.now(),
        onsetAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        resolution: 'intervention',
        helpfulInterventions: ['grounding exercises', 'talking through concerns'],
      });

      expect(pattern.id).toBeDefined();
      expect(pattern.trajectoryEmbedding).toBeDefined();
    });

    it('should find similar patterns', async () => {
      const userId = `${TEST_USER}-trajectory-similar`;

      // Record a pattern
      await trajectoryPatterns.recordTrajectoryPattern(userId, {
        userId,
        trajectory: 'mood_decline',
        severity: 0.5,
        duration: 72,
        precursorSignals: [{ signal: 'energy_fluctuation', value: 0.7, daysBeforeOnset: 4 }],
        contextDescription: 'Feeling isolated after moving',
        lifeDomains: ['social', 'mental_health'],
        recordedAt: Date.now(),
        onsetAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
        resolution: 'natural',
      });

      // Find similar
      const similar = await trajectoryPatterns.findSimilarPatterns(userId, {
        signals: [{ signal: 'energy_fluctuation', value: 0.6 }],
        contextDescription: 'Feeling lonely in new city',
        lifeDomains: ['social'],
        emotionalState: 'sad',
      });

      expect(Array.isArray(similar)).toBe(true);
    });
  });

  // =========================================================================
  // 3. BREAKTHROUGH EMBEDDINGS
  // =========================================================================
  describe('Breakthrough Embeddings', () => {
    it('should record breakthrough with embeddings', async () => {
      const userId = `${TEST_USER}-breakthrough`;

      const breakthrough = await breakthroughEmbeddings.recordBreakthroughWithEmbeddings(userId, {
        topic: 'self-worth',
        type: 'pattern_recognition',
        insightSummary: 'Realized my self-criticism comes from trying to meet others expectations',
        impact: 0.8,
        indicators: [
          {
            type: 'questioning_beliefs',
            strength: 0.7,
            content: 'Why do I always feel not enough?',
          },
          {
            type: 'connecting_dots',
            strength: 0.9,
            content: "It's the same pattern with work and relationships",
          },
        ],
        catalystType: 'reflection',
        catalystDescription: 'Asked about what self-criticism really protects',
        conversationContext: 'Discussing feeling inadequate at work',
        emotionalState: 'vulnerable',
        conversationLength: 25,
      });

      expect(breakthrough.id).toBeDefined();
      expect(breakthrough.insightEmbedding).toBeDefined();
    });

    it('should find similar breakthroughs', async () => {
      const userId = `${TEST_USER}-breakthrough-similar`;

      // Record a breakthrough
      await breakthroughEmbeddings.recordBreakthroughWithEmbeddings(userId, {
        topic: 'relationship patterns',
        type: 'pattern_recognition',
        insightSummary: 'I keep choosing unavailable partners',
        impact: 0.7,
        indicators: [
          { type: 'connecting_dots', strength: 0.8, content: 'Same pattern three times' },
        ],
        catalystType: 'question',
        catalystDescription: 'What do these relationships have in common?',
        conversationContext: 'Talking about recent breakup',
        emotionalState: 'reflective',
        conversationLength: 30,
      });

      // Find similar
      const similar = await breakthroughEmbeddings.findSimilarBreakthroughs(userId, {
        topic: 'dating patterns',
        conversationContext: 'Noticing I always pick the same type',
        emotionalState: 'curious',
        indicators: [],
      });

      expect(Array.isArray(similar)).toBe(true);
    });
  });

  // =========================================================================
  // 4. CONVERSATION TRAJECTORY
  // =========================================================================
  describe('Conversation Trajectory', () => {
    it('should track conversation trajectory', async () => {
      const sessionId = `session-${Date.now()}`;
      const userId = `${TEST_USER}-conv`;

      // Start trajectory
      const trajectory = conversationTrajectory.startTrajectory(sessionId, userId);
      expect(trajectory.sessionId).toBe(sessionId);

      // Record turns
      await conversationTrajectory.recordTurn(sessionId, {
        text: 'I wanted to talk about something that happened at work',
        speaker: 'user',
        emotionalValence: 0,
      });

      await conversationTrajectory.recordTurn(sessionId, {
        text: 'It made me really upset when my boss criticized me in front of everyone',
        speaker: 'user',
        emotionalValence: -0.6,
      });

      await conversationTrajectory.recordTurn(sessionId, {
        text: 'I think it reminded me of something from my childhood',
        speaker: 'user',
        emotionalValence: -0.4,
      });

      // Get trajectory
      const result = conversationTrajectory.getTrajectory(sessionId);
      expect(result).not.toBeNull();
      expect(result!.turns.length).toBe(3);
    });

    it('should analyze trajectory pattern', async () => {
      const sessionId = `session-analyze-${Date.now()}`;
      const userId = `${TEST_USER}-conv-analyze`;

      conversationTrajectory.startTrajectory(sessionId, userId);

      // Record several turns
      for (let i = 0; i < 5; i++) {
        await conversationTrajectory.recordTurn(sessionId, {
          text: `Turn ${i}: Discussing deeper feelings about ${i % 2 === 0 ? 'work' : 'family'}`,
          speaker: 'user',
          emotionalValence: -0.2 - i * 0.1,
          topicDepth: 0.3 + i * 0.1,
        });
      }

      // Analyze
      const analysis = conversationTrajectory.analyzeTrajectory(sessionId);
      expect(analysis).not.toBeNull();
      expect(analysis!.pattern).toBeDefined();
      expect(analysis!.depth).toBeDefined();
    });
  });

  // =========================================================================
  // 5. COGNITIVE SIMILARITY
  // =========================================================================
  describe('Cognitive Similarity', () => {
    it('should register fingerprint for community', async () => {
      const userId = `${TEST_USER}-cognitive`;

      const fingerprint = await cognitiveSimilarity.registerFingerprintForCommunity(userId, {
        userId,
        decisionStyle: { primary: 'analytical', confidence: 0.8, observations: 10 },
        stressResponse: {
          primary: 'analyze',
          recoveryTime: 24,
          escalationPattern: ['worry', 'research', 'plan'],
          deEscalationTriggers: ['information', 'control'],
          confidence: 0.7,
          observations: 8,
        },
        changeVelocity: {
          speed: 0.4,
          insightToAction: 72,
          integrationTime: 168,
          preference: 'gradual',
          confidence: 0.6,
        },
        emotionalPatterns: {
          precursors: new Map<string, string[]>(),
          recoverySignals: ['deep_breath', 'humor'],
          overwhelmThreshold: 0.7,
          typicalCycles: [['anxious', 'calm', 'focused']],
          avoidedEmotions: ['anger'],
          confidence: 0.6,
        },
        communicationPatterns: {
          deflectionStyle: 'intellectualize',
          readinessSignals: ['asking_questions', 'future_talk'],
          trustBuilders: ['consistency', 'competence'],
          trustBreakers: ['unreliability'],
          preferredTone: 'warm',
          spaceNeeds: 'moderate',
          confidence: 0.7,
        },
        growthPatterns: {
          learningStyle: 'conceptual',
          resistancePatterns: ['overwhelm', 'perfectionism'],
          breakthroughCatalysts: ['connecting dots', 'reflection'],
          integrationTime: 168,
          concurrentCapacity: 2,
          confidence: 0.6,
        },
        temporalPatterns: {
          optimalConversationTimes: [{ dayOfWeek: 3, hour: 19, effectiveness: 0.8 }],
          weeklyEnergyPattern: [0.6, 0.7, 0.8, 0.8, 0.7, 0.5, 0.4],
          seasonalPatterns: [{ season: 'winter', tendency: 'reflective' }],
          confidence: 0.5,
        },
        vulnerabilityPatterns: {
          expressionStyle: 'indirect',
          safetyFactors: ['trust', 'privacy'],
          warmupTime: 15,
          protectedTopics: ['family'],
          confidence: 0.6,
        },
        totalObservations: 50,
        lastUpdated: Date.now(),
        fingerprintVersion: 1,
      });

      expect(fingerprint.userId).toBe(userId);
      expect(fingerprint.overallEmbedding).toBeDefined();
    });

    it('should get community stats', () => {
      const stats = cognitiveSimilarity.getCommunityStats();
      expect(stats).toHaveProperty('totalProfiles');
      expect(stats).toHaveProperty('decisionStyleDistribution');
    });
  });

  // =========================================================================
  // 6. RIPPLE EMBEDDING SPACE
  // =========================================================================
  describe('Ripple Embedding Space', () => {
    it('should initialize domain space', async () => {
      const userId = `${TEST_USER}-ripple`;

      const space = await rippleEmbeddingSpace.initializeDomainSpace(userId);

      expect(space.userId).toBe(userId);
      expect(space.domains.size).toBeGreaterThan(0);
    });

    it('should predict ripple path', async () => {
      const userId = `${TEST_USER}-ripple-predict`;

      await rippleEmbeddingSpace.initializeDomainSpace(userId);

      const prediction = await rippleEmbeddingSpace.predictRipplePath(userId, {
        domain: 'work',
        eventType: 'deadline_pressure',
        magnitude: -0.7,
        description: 'Major project deadline causing stress',
      });

      expect(prediction.event.domain).toBe('work');
      expect(Array.isArray(prediction.predictedPath)).toBe(true);
    });

    it('should find domain clusters', async () => {
      const userId = `${TEST_USER}-ripple-clusters`;

      await rippleEmbeddingSpace.initializeDomainSpace(userId);

      const clusters = rippleEmbeddingSpace.findDomainClusters(userId);
      expect(Array.isArray(clusters)).toBe(true);
    });
  });

  // =========================================================================
  // 7. INTERVENTION MATCHING
  // =========================================================================
  describe('Intervention Matching', () => {
    it('should record situation outcome', async () => {
      const userId = `${TEST_USER}-intervention`;

      const situation = await interventionMatching.recordSituationOutcome(userId, {
        transcript: 'I feel really anxious about the presentation tomorrow',
        emotionalState: 'anxious',
        topic: 'work anxiety',
        conversationDepth: 'moderate',
        intervention: 'grounding',
        outcome: 'success',
        effectivenessScore: 0.8,
        userResponse: 'engaged',
      });

      expect(situation.id).toBeDefined();
      expect(situation.situationEmbedding).toBeDefined();
    });

    it('should get intervention recommendations', async () => {
      const userId = `${TEST_USER}-intervention-rec`;

      // Record some outcomes
      await interventionMatching.recordSituationOutcome(userId, {
        transcript: 'I am so stressed about everything',
        emotionalState: 'stressed',
        topic: 'overwhelm',
        conversationDepth: 'moderate',
        intervention: 'validation',
        outcome: 'success',
        effectivenessScore: 0.9,
        userResponse: 'engaged',
      });

      await interventionMatching.recordSituationOutcome(userId, {
        transcript: 'Work is too much right now',
        emotionalState: 'overwhelmed',
        topic: 'work stress',
        conversationDepth: 'moderate',
        intervention: 'validation',
        outcome: 'success',
        effectivenessScore: 0.85,
        userResponse: 'engaged',
      });

      await interventionMatching.recordSituationOutcome(userId, {
        transcript: "I can't handle this",
        emotionalState: 'distressed',
        topic: 'overwhelm',
        conversationDepth: 'deep',
        intervention: 'grounding',
        outcome: 'success',
        effectivenessScore: 0.75,
        userResponse: 'engaged',
      });

      // Get recommendations
      const recommendations = await interventionMatching.getInterventionRecommendations(userId, {
        transcript: 'Everything is piling up',
        emotionalState: 'overwhelmed',
        topic: 'stress',
      });

      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  // =========================================================================
  // UNIFIED CONTEXT
  // =========================================================================
  describe('Unified Context', () => {
    it('should build comprehensive embedding context', async () => {
      const userId = `${TEST_USER}-unified`;

      // Initialize some data
      await rippleEmbeddingSpace.initializeDomainSpace(userId);

      const context = await getEmbeddingPredictiveContext({
        userId,
        sessionId: `session-${Date.now()}`,
        currentTopic: 'work stress',
        currentSituation: {
          transcript: 'I have been feeling overwhelmed lately',
          emotionalState: 'overwhelmed',
          topic: 'stress',
        },
      });

      expect(typeof context).toBe('string');
    });
  });
});
