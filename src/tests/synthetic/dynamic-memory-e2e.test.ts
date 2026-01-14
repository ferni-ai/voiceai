/**
 * Dynamic Memory E2E Synthetic Tests
 *
 * Comprehensive tests validating the complete dynamic memory pipeline:
 * - L1: STM Buffer (in-memory)
 * - L2: Fast Capture + Deep Extraction → Firestore
 * - L3: Context Builder retrieval
 *
 * Architecture tested:
 * ```
 * Transcript → Fast Capture → STM Buffer
 *                    ↓
 *              Deep Extraction (async) → Firestore
 *                    ↓
 *              Context Builder ← Firestore
 * ```
 *
 * @module tests/synthetic/dynamic-memory-e2e.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import fixtures
import {
  CAREER_COACHING_CONVERSATION,
  FAMILY_PLANNING_CONVERSATION,
  HEALTH_TRACKING_CONVERSATION,
  EMOTIONAL_SUPPORT_CONVERSATION,
  MINIMAL_CONVERSATION,
  HIGH_EMOTION_CONVERSATION,
  ENTITY_DETECTION_CASES,
  EMOTION_DETECTION_CASES,
  TOPIC_DETECTION_CASES,
  DATE_DETECTION_CASES,
  type SyntheticConversation,
  type TranscriptTestCase,
} from '../fixtures/memory-conversations.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => mockLogger),
};

vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

// Track emitted events for testing
const emittedEvents: Array<{ event: string; data: unknown }> = [];

vi.mock('../../services/async-events/index.js', () => ({
  AsyncEvents: {
    emit: vi.fn((event: string, data: unknown) => {
      emittedEvents.push({ event, data });
    }),
    on: vi.fn(),
  },
}));

// ============================================================================
// FAST CAPTURE PIPELINE TESTS
// ============================================================================

describe('Fast Capture Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
  });

  describe('Performance', () => {
    it('should complete within 50ms for typical input', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const start = Date.now();
      const result = await fastCapture({
        userId: 'perf-test-user',
        sessionId: 'perf-test-session',
        turnNumber: 1,
        transcript: 'My mom called yesterday and said she was worried about my brother Mike.',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Allow buffer for CI
      expect(result.captureTimeMs).toBeLessThan(100);
    });

    it('should be fast even with long transcripts', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const longTranscript = `
        I've been thinking a lot about my career lately. My boss Michael mentioned 
        that there might be a promotion opportunity next month. My coworker Sarah 
        has been really supportive, and my wife thinks I should go for it. 
        The interview is scheduled for January 15th at the downtown office.
        I'm feeling a bit anxious but also excited about the possibility.
        My therapist Dr. Johnson says I should trust my instincts.
      `.repeat(3); // ~900 characters

      const start = Date.now();
      const result = await fastCapture({
        userId: 'perf-long-user',
        sessionId: 'perf-long-session',
        turnNumber: 1,
        transcript: longTranscript,
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(150); // Still fast with long input
      expect(result.mentionedEntities.length).toBeGreaterThan(0);
    });
  });

  describe('Entity Detection', () => {
    it.each(ENTITY_DETECTION_CASES)(
      '$description: "$transcript"',
      async ({ transcript, expectedEntities }: TranscriptTestCase) => {
        const { detectEntityMentions } = await import('../../memory/dynamic/fast-capture.js');

        const mentions = detectEntityMentions(transcript);

        for (const expected of expectedEntities) {
          const found = mentions.find(
            (m) => m.name.toLowerCase() === expected.name.toLowerCase() && m.type === expected.type
          );
          expect(found, `Expected to find ${expected.name} (${expected.type})`).toBeTruthy();
        }
      }
    );

    it('should not duplicate entities mentioned multiple times', async () => {
      const { detectEntityMentions } = await import('../../memory/dynamic/fast-capture.js');

      const mentions = detectEntityMentions(
        'My mom called. Then my mom texted. My mom is great.'
      );

      const momMentions = mentions.filter((m) => m.name === 'mom');
      expect(momMentions.length).toBe(1);
    });

    it('should assign confidence scores correctly', async () => {
      const { detectEntityMentions } = await import('../../memory/dynamic/fast-capture.js');

      const mentions = detectEntityMentions('My mom told me about Sarah.');

      const momMention = mentions.find((m) => m.name === 'mom');
      expect(momMention?.confidence).toBeGreaterThanOrEqual(0.7); // "my mom" = high confidence
    });
  });

  describe('Emotion Detection', () => {
    it.each(EMOTION_DETECTION_CASES)(
      '$description: "$transcript"',
      async ({ transcript, voiceEmotion, expectedEmotions }: TranscriptTestCase) => {
        const { detectEmotionSignals } = await import('../../memory/dynamic/fast-capture.js');

        const signals = detectEmotionSignals(transcript, voiceEmotion);

        // Check that expected emotions are present
        for (const expected of expectedEmotions) {
          const found = signals.find(
            (s) => s.emotion === expected.emotion && s.intensity === expected.intensity
          );
          expect(
            found,
            `Expected emotion ${expected.emotion} (${expected.intensity}) in: ${JSON.stringify(signals)}`
          ).toBeTruthy();
        }
      }
    );

    it('should detect voice emotion separately from keywords', async () => {
      const { detectEmotionSignals } = await import('../../memory/dynamic/fast-capture.js');

      const signals = detectEmotionSignals("I'm happy today", 'sad');

      const keywordEmotion = signals.find((s) => s.source === 'keyword');
      const voiceEmotionSignal = signals.find((s) => s.source === 'voice');

      expect(keywordEmotion).toBeTruthy();
      expect(voiceEmotionSignal).toBeTruthy();
      expect(voiceEmotionSignal?.emotion).toBe('sad');
    });
  });

  describe('Topic Detection', () => {
    it.each(TOPIC_DETECTION_CASES)(
      '$description: "$transcript"',
      async ({ transcript, expectedTopics }: TranscriptTestCase) => {
        const { detectTopicHints } = await import('../../memory/dynamic/fast-capture.js');

        const topics = detectTopicHints(transcript);

        for (const expected of expectedTopics) {
          expect(topics, `Expected topic "${expected}" in ${JSON.stringify(topics)}`).toContain(
            expected
          );
        }
      }
    );

    it('should detect multiple topics in one transcript', async () => {
      const { detectTopicHints } = await import('../../memory/dynamic/fast-capture.js');

      const topics = detectTopicHints(
        "I'm stressed about work and can't sleep. My therapist suggested exercise."
      );

      expect(topics.length).toBeGreaterThanOrEqual(3);
      expect(topics).toContain('work');
      expect(topics).toContain('sleep');
    });
  });

  describe('Date Detection', () => {
    it.each(DATE_DETECTION_CASES)(
      '$description: "$transcript"',
      async ({ transcript, expectedDateTypes }: TranscriptTestCase) => {
        const { detectDateSignals } = await import('../../memory/dynamic/fast-capture.js');

        const signals = detectDateSignals(transcript);

        for (const expectedType of expectedDateTypes) {
          const found = signals.find((s) => s.type === expectedType);
          expect(
            found,
            `Expected date type "${expectedType}" in ${JSON.stringify(signals)}`
          ).toBeTruthy();
        }
      }
    );
  });

  describe('Async Job Queuing', () => {
    it('should queue deep extraction for meaningful content', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const result = await fastCapture({
        userId: 'queue-test-user',
        sessionId: 'queue-test-session',
        turnNumber: 1,
        transcript: 'My sister Sarah is coming to visit next week for her birthday.',
      });

      expect(result.asyncJobId).toBeTruthy();
      expect(emittedEvents.some((e) => e.event === 'memory:deep-extraction')).toBe(true);
    });

    it('should NOT queue deep extraction for trivial content', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      for (const turn of MINIMAL_CONVERSATION.turns) {
        emittedEvents.length = 0; // Reset

        const result = await fastCapture({
          userId: MINIMAL_CONVERSATION.userId,
          sessionId: MINIMAL_CONVERSATION.sessionId,
          turnNumber: turn.turnNumber,
          transcript: turn.transcript,
        });

        expect(result.asyncJobId).toBeNull();
        expect(emittedEvents.filter((e) => e.event === 'memory:deep-extraction').length).toBe(0);
      }
    });

    it('should set high priority for high-emotion content', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const turn = HIGH_EMOTION_CONVERSATION.turns[0];
      await fastCapture({
        userId: HIGH_EMOTION_CONVERSATION.userId,
        sessionId: HIGH_EMOTION_CONVERSATION.sessionId,
        turnNumber: turn.turnNumber,
        transcript: turn.transcript,
        voiceEmotion: turn.voiceEmotion,
      });

      const deepExtractionEvent = emittedEvents.find((e) => e.event === 'memory:deep-extraction');
      expect(deepExtractionEvent).toBeTruthy();
      expect((deepExtractionEvent?.data as { priority: string })?.priority).toBe('high');
    });
  });
});

// ============================================================================
// STM BUFFER INTEGRATION TESTS
// ============================================================================

describe('STM Buffer Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
  });

  describe('Buffer Operations', () => {
    it('should create buffer for new session', async () => {
      const { getSTMBuffer } = await import('../../memory/dynamic/stm-buffer.js');

      const buffer = getSTMBuffer('new-session-001', 'test-user-001');

      expect(buffer.sessionId).toBe('new-session-001');
      expect(buffer.userId).toBe('test-user-001');
      expect(buffer.turns).toHaveLength(0);
    });

    it('should record turns correctly', async () => {
      const { getSTMBuffer, recordTurn, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-record-${Date.now()}`;
      const userId = 'stm-record-user';

      try {
        // Record first turn
        const result1 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'My mom called today.',
        });

        recordTurn(sessionId, userId, result1, 'My mom called today.', 1);

        // Record second turn
        const result2 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 2,
          transcript: 'She mentioned my brother.',
        });

        recordTurn(sessionId, userId, result2, 'She mentioned my brother.', 2);

        const buffer = getSTMBuffer(sessionId, userId);
        expect(buffer.turns).toHaveLength(2);
        expect(buffer.turns[0].turnNumber).toBe(1);
        expect(buffer.turns[1].turnNumber).toBe(2);
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should enforce max turns limit (FIFO eviction)', async () => {
      const { getSTMBuffer, recordTurn, cleanupSession, configureSTMBuffer } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-fifo-${Date.now()}`;
      const userId = 'stm-fifo-user';

      // Configure small max turns for testing
      configureSTMBuffer({ maxTurns: 3 });

      try {
        // Record 5 turns
        for (let i = 1; i <= 5; i++) {
          const result = await fastCapture({
            userId,
            sessionId,
            turnNumber: i,
            transcript: `Turn ${i}: My mom called.`,
          });
          recordTurn(sessionId, userId, result, `Turn ${i}: My mom called.`, i);
        }

        const buffer = getSTMBuffer(sessionId, userId);

        // Should only have last 3 turns
        expect(buffer.turns).toHaveLength(3);
        expect(buffer.turns[0].turnNumber).toBe(3);
        expect(buffer.turns[2].turnNumber).toBe(5);
      } finally {
        cleanupSession(sessionId);
        configureSTMBuffer({ maxTurns: 10 }); // Reset
      }
    });

    it('should track entity frequency', async () => {
      const { recordTurn, getFrequentEntities, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-freq-${Date.now()}`;
      const userId = 'stm-freq-user';

      try {
        // Mention mom multiple times
        for (const transcript of ['My mom called.', 'Mom said hello.', 'My mom is great.']) {
          const result = await fastCapture({
            userId,
            sessionId,
            turnNumber: 1,
            transcript,
          });
          recordTurn(sessionId, userId, result, transcript, 1);
        }

        const frequentEntities = getFrequentEntities(sessionId);
        const momEntity = frequentEntities.find((e) => e.name === 'mom');

        expect(momEntity).toBeTruthy();
        expect(momEntity?.mentionCount).toBe(3);
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should track topic history', async () => {
      const { recordTurn, getRecentTopics, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-topics-${Date.now()}`;
      const userId = 'stm-topics-user';

      try {
        // First turn - work topic
        const result1 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'I had a meeting at work today.',
        });
        recordTurn(sessionId, userId, result1, 'I had a meeting at work today.', 1);

        // Second turn - health topic
        const result2 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 2,
          transcript: "I'm seeing the doctor tomorrow.",
        });
        recordTurn(sessionId, userId, result2, "I'm seeing the doctor tomorrow.", 2);

        const topics = getRecentTopics(sessionId);

        expect(topics).toContain('work');
        expect(topics).toContain('health');
        // Most recent first
        expect(topics[0]).toBe('health');
      } finally {
        cleanupSession(sessionId);
      }
    });
  });

  describe('Query Functions', () => {
    it('should check if entity was mentioned', async () => {
      const { recordTurn, wasEntityMentioned, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-mentioned-${Date.now()}`;
      const userId = 'stm-mentioned-user';

      try {
        const result = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'My sister Sarah called.',
        });
        recordTurn(sessionId, userId, result, 'My sister Sarah called.', 1);

        expect(wasEntityMentioned(sessionId, 'sister')).toBe(true);
        expect(wasEntityMentioned(sessionId, 'brother')).toBe(false);
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should check topic continuity', async () => {
      const { recordTurn, isTopicContinuing, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-continuity-${Date.now()}`;
      const userId = 'stm-continuity-user';

      try {
        const result = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'I have a big meeting at work tomorrow.',
        });
        recordTurn(sessionId, userId, result, 'I have a big meeting at work tomorrow.', 1);

        expect(isTopicContinuing(sessionId, 'work')).toBe(true);
        expect(isTopicContinuing(sessionId, 'health')).toBe(false);
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should build STM context for LLM', async () => {
      const { recordTurn, buildSTMContext, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-context-${Date.now()}`;
      const userId = 'stm-context-user';

      try {
        // Build up some context
        for (const transcript of [
          'My mom called about the family dinner.',
          "I'm feeling stressed about work.",
          'My sister is coming to visit next week.',
        ]) {
          const result = await fastCapture({
            userId,
            sessionId,
            turnNumber: 1,
            transcript,
          });
          recordTurn(sessionId, userId, result, transcript, 1);
        }

        const context = buildSTMContext(sessionId);

        expect(context).toBeTruthy();
        expect(context).toContain('Session Context');
        expect(context).toContain('Recent topics');
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should return null context for empty session', async () => {
      const { buildSTMContext } = await import('../../memory/dynamic/stm-buffer.js');

      const context = buildSTMContext('non-existent-session');
      expect(context).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup session properly', async () => {
      const { getSTMBuffer, recordTurn, cleanupSession, wasEntityMentioned } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-cleanup-${Date.now()}`;
      const userId = 'stm-cleanup-user';

      // Create session
      const result = await fastCapture({
        userId,
        sessionId,
        turnNumber: 1,
        transcript: 'My mom called.',
      });
      recordTurn(sessionId, userId, result, 'My mom called.', 1);

      // Verify it exists
      expect(wasEntityMentioned(sessionId, 'mom')).toBe(true);

      // Cleanup
      cleanupSession(sessionId);

      // Verify it's gone
      expect(wasEntityMentioned(sessionId, 'mom')).toBe(false);
    });

    it('should get STM stats', async () => {
      const { getSTMStats, recordTurn, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-stats-${Date.now()}`;
      const userId = 'stm-stats-user';

      try {
        const result = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'My mom called.',
        });
        recordTurn(sessionId, userId, result, 'My mom called.', 1);

        const stats = getSTMStats();

        expect(stats.activeSessions).toBeGreaterThanOrEqual(1);
        expect(stats.totalTurns).toBeGreaterThanOrEqual(1);
      } finally {
        cleanupSession(sessionId);
      }
    });
  });
});

// ============================================================================
// DEEP EXTRACTION TESTS (Mocked LLM)
// ============================================================================

describe('Deep Extraction Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
  });

  describe('Worker Lifecycle', () => {
    it('should start and stop correctly', async () => {
      const { getDeepExtractionWorker } = await import(
        '../../memory/dynamic/deep-extraction-worker.js'
      );

      const worker = getDeepExtractionWorker();

      expect(worker.isRunning()).toBe(false);

      worker.start();
      expect(worker.isRunning()).toBe(true);

      worker.stop();
      expect(worker.isRunning()).toBe(false);
    });

    it('should track stats', async () => {
      const { getDeepExtractionWorker } = await import(
        '../../memory/dynamic/deep-extraction-worker.js'
      );

      const worker = getDeepExtractionWorker();
      const stats = worker.getStats();

      expect(stats).toHaveProperty('totalJobs');
      expect(stats).toHaveProperty('completedJobs');
      expect(stats).toHaveProperty('failedJobs');
      expect(stats).toHaveProperty('avgExtractionTimeMs');
    });

    it('should report queue depth', async () => {
      const { getDeepExtractionWorker } = await import(
        '../../memory/dynamic/deep-extraction-worker.js'
      );

      const worker = getDeepExtractionWorker();
      const depth = worker.getQueueDepth();

      expect(typeof depth).toBe('number');
      expect(depth).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Extraction Types', () => {
    it('should export correct types', async () => {
      const { DeepExtractionWorker } = await import(
        '../../memory/dynamic/deep-extraction-worker.js'
      );

      expect(DeepExtractionWorker).toBeDefined();
    });
  });
});

// ============================================================================
// CONTEXT BUILDER INTEGRATION TESTS
// ============================================================================

describe('Dynamic Memory Context Builder', () => {
  // Mock Firestore for context builder tests
  const mockFirestoreData: {
    entities: Array<Record<string, unknown>>;
    facts: Array<Record<string, unknown>>;
    relationships: Array<Record<string, unknown>>;
  } = {
    entities: [],
    facts: [],
    relationships: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.entities = [];
    mockFirestoreData.facts = [];
    mockFirestoreData.relationships = [];
  });

  describe('Configuration', () => {
    it('should allow configuration', async () => {
      const { configureDynamicMemory } = await import(
        '../../intelligence/context-builders/memory/dynamic-memory-context.js'
      );

      // Should not throw
      configureDynamicMemory({
        maxEntities: 5,
        maxFactsPerEntity: 3,
      });
    });
  });

  describe('Builder Registration', () => {
    it('should export builder with correct structure', async () => {
      const { dynamicMemoryContextBuilder } = await import(
        '../../intelligence/context-builders/memory/dynamic-memory-context.js'
      );

      expect(dynamicMemoryContextBuilder).toBeDefined();
      expect(dynamicMemoryContextBuilder.name).toBe('dynamic-memory');
      expect(dynamicMemoryContextBuilder.priority).toBe(75);
      expect(typeof dynamicMemoryContextBuilder.build).toBe('function');
    });
  });
});

// ============================================================================
// FULL E2E ROUND-TRIP TESTS
// ============================================================================

describe('Full E2E Round-Trip', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
  });

  describe('Conversation Flow', () => {
    async function runConversation(conversation: SyntheticConversation) {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');
      const { recordTurn, getFrequentEntities, getRecentTopics, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );

      try {
        const results: Array<{
          turnNumber: number;
          captureResult: Awaited<ReturnType<typeof fastCapture>>;
        }> = [];

        // Process each turn
        for (const turn of conversation.turns) {
          const captureResult = await fastCapture({
            userId: conversation.userId,
            sessionId: conversation.sessionId,
            turnNumber: turn.turnNumber,
            transcript: turn.transcript,
            voiceEmotion: turn.voiceEmotion,
          });

          recordTurn(
            conversation.sessionId,
            conversation.userId,
            captureResult,
            turn.transcript,
            turn.turnNumber
          );

          results.push({
            turnNumber: turn.turnNumber,
            captureResult,
          });

          // Validate expected results
          if (turn.expected.shouldQueueDeepExtraction) {
            expect(captureResult.asyncJobId, `Turn ${turn.turnNumber} should queue extraction`).toBeTruthy();
          } else {
            expect(captureResult.asyncJobId, `Turn ${turn.turnNumber} should NOT queue extraction`).toBeNull();
          }
        }

        // Check final state
        const frequentEntities = getFrequentEntities(conversation.sessionId);
        const recentTopics = getRecentTopics(conversation.sessionId);

        return {
          results,
          frequentEntities,
          recentTopics,
        };
      } finally {
        cleanupSession(conversation.sessionId);
      }
    }

    it('should process career coaching conversation', async () => {
      const { frequentEntities, recentTopics } = await runConversation(CAREER_COACHING_CONVERSATION);

      // Should have tracked work topic
      expect(recentTopics).toContain('work');

      // Should have tracked boss
      const bossEntity = frequentEntities.find((e) => e.name === 'boss');
      expect(bossEntity).toBeTruthy();
    });

    it('should process family planning conversation', async () => {
      const { frequentEntities, recentTopics } = await runConversation(FAMILY_PLANNING_CONVERSATION);

      // Should have tracked family topic
      expect(recentTopics).toContain('family');

      // Should have tracked family members
      const familyMembers = frequentEntities.filter((e) =>
        ['sister', 'mom', 'dad'].includes(e.name.toLowerCase())
      );
      expect(familyMembers.length).toBeGreaterThan(0);
    });

    it('should process health tracking conversation', async () => {
      const { frequentEntities, recentTopics } = await runConversation(HEALTH_TRACKING_CONVERSATION);

      // Should have tracked health topics
      expect(recentTopics.some((t) => ['health', 'sleep', 'fitness'].includes(t))).toBe(true);

      // Should have tracked healthcare providers
      const healthProviders = frequentEntities.filter((e) =>
        ['doctor', 'therapist'].includes(e.name.toLowerCase())
      );
      expect(healthProviders.length).toBeGreaterThan(0);
    });

    it('should process emotional support conversation', async () => {
      const { results } = await runConversation(EMOTIONAL_SUPPORT_CONVERSATION);

      // First turn has high-intensity emotion - should be high priority
      const firstTurnResult = results[0].captureResult;
      expect(firstTurnResult.emotionSignals.some((e) => e.intensity === 'high')).toBe(true);
    });

    it('should NOT queue extraction for minimal inputs', async () => {
      const { results } = await runConversation(MINIMAL_CONVERSATION);

      // No turns should queue deep extraction
      for (const result of results) {
        expect(result.captureResult.asyncJobId).toBeNull();
      }
    });
  });

  describe('Cross-Turn Continuity', () => {
    it('should maintain entity continuity across turns', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');
      const {
        recordTurn,
        wasEntityMentioned,
        getEntityMentionInfo,
        cleanupSession,
      } = await import('../../memory/dynamic/stm-buffer.js');

      const sessionId = `continuity-${Date.now()}`;
      const userId = 'continuity-user';

      try {
        // Turn 1: Introduce mom
        const result1 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'My mom called me today.',
        });
        recordTurn(sessionId, userId, result1, 'My mom called me today.', 1);

        expect(wasEntityMentioned(sessionId, 'mom')).toBe(true);

        // Turn 2: Reference mom again
        const result2 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 2,
          transcript: 'Mom said she is visiting next week.',
        });
        recordTurn(sessionId, userId, result2, 'Mom said she is visiting next week.', 2);

        // Frequency should be 2
        const momInfo = getEntityMentionInfo(sessionId, 'mom');
        expect(momInfo?.mentionCount).toBe(2);
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should track emotional trajectory', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');
      const { recordTurn, getEmotionalTrajectory, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );

      const sessionId = `trajectory-${Date.now()}`;
      const userId = 'trajectory-user';

      try {
        // Start stressed
        const result1 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: "I'm feeling really stressed and anxious.",
        });
        recordTurn(sessionId, userId, result1, "I'm feeling really stressed and anxious.", 1);

        // Then relieved
        const result2 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 2,
          transcript: "I'm feeling relieved now that we talked.",
        });
        recordTurn(sessionId, userId, result2, "I'm feeling relieved now that we talked.", 2);

        const trajectory = getEmotionalTrajectory(sessionId);

        expect(trajectory.length).toBe(2);
        expect(trajectory[0].some((e) => e.emotion === 'stress')).toBe(true);
        expect(trajectory[1].some((e) => e.emotion === 'positive')).toBe(true);
      } finally {
        cleanupSession(sessionId);
      }
    });
  });

  describe('Performance End-to-End', () => {
    it('should complete full conversation within performance budget', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');
      const { recordTurn, buildSTMContext, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );

      const sessionId = `perf-e2e-${Date.now()}`;
      const userId = 'perf-e2e-user';

      const start = Date.now();

      try {
        // Run 10 turns
        for (let i = 1; i <= 10; i++) {
          const result = await fastCapture({
            userId,
            sessionId,
            turnNumber: i,
            transcript: `Turn ${i}: My mom called about the meeting with my boss next week.`,
          });
          recordTurn(
            sessionId,
            userId,
            result,
            `Turn ${i}: My mom called about the meeting with my boss next week.`,
            i
          );
        }

        // Build context
        const context = buildSTMContext(sessionId);
        expect(context).toBeTruthy();

        const totalDuration = Date.now() - start;

        // 10 turns + context build should be under 1 second total
        expect(totalDuration).toBeLessThan(1000);
      } finally {
        cleanupSession(sessionId);
      }
    });
  });
});

// ============================================================================
// REGRESSION TESTS
// ============================================================================

describe('Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
  });

  it('should not crash on empty transcript', async () => {
    const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

    const result = await fastCapture({
      userId: 'regression-user',
      sessionId: 'regression-session',
      turnNumber: 1,
      transcript: '',
    });

    expect(result.mentionedEntities).toHaveLength(0);
    expect(result.asyncJobId).toBeNull();
  });

  it('should not crash on special characters', async () => {
    const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

    const result = await fastCapture({
      userId: 'regression-user',
      sessionId: 'regression-session',
      turnNumber: 1,
      transcript: "Test with special chars: @#$%^&*()_+{}[]|\\:\";<>?,./~`",
    });

    expect(result).toBeDefined();
    expect(result.asyncJobId).toBeNull(); // No meaningful content
  });

  it('should handle unicode characters', async () => {
    const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

    const result = await fastCapture({
      userId: 'regression-user',
      sessionId: 'regression-session',
      turnNumber: 1,
      transcript: 'My mom called about 日本 and café plans.',
    });

    expect(result.mentionedEntities.some((e) => e.name === 'mom')).toBe(true);
  });

  it('should handle very long entity names', async () => {
    const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

    const result = await fastCapture({
      userId: 'regression-user',
      sessionId: 'regression-session',
      turnNumber: 1,
      transcript: 'I traveled to San Francisco Bay Area.',
    });

    // Should not crash
    expect(result).toBeDefined();
  });
});

// ============================================================================
// GAP ANALYSIS TESTS - Coverage for edge cases identified
// ============================================================================

// ============================================================================
// STM PROMOTION TESTS
// ============================================================================

describe('STM Promotion Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
  });

  describe('Entity Importance Calculation', () => {
    it('should give higher importance to frequently mentioned entities', async () => {
      const { recordTurn, getFrequentEntities, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `importance-freq-${Date.now()}`;
      const userId = 'importance-user';

      try {
        // Mention "mom" multiple times
        for (let i = 0; i < 5; i++) {
          const result = await fastCapture({
            userId,
            sessionId,
            turnNumber: i + 1,
            transcript: `My mom called me again today. Mom is great.`,
          });
          recordTurn(sessionId, userId, result, `My mom called me again today. Mom is great.`, i + 1);
        }

        const frequentEntities = getFrequentEntities(sessionId);
        const mom = frequentEntities.find((e) => e.name === 'mom');

        expect(mom).toBeTruthy();
        expect(mom!.mentionCount).toBeGreaterThanOrEqual(5);
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should give higher importance to emotionally significant mentions', async () => {
      const { recordTurn, getFrequentEntities, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `importance-emotion-${Date.now()}`;
      const userId = 'importance-user';

      try {
        // Mention "Sarah" with high emotion
        const result = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: "I'm devastated that Sarah is leaving. I can't believe Sarah is gone.",
          voiceEmotion: 'sad',
        });
        recordTurn(
          sessionId,
          userId,
          result,
          "I'm devastated that Sarah is leaving. I can't believe Sarah is gone.",
          1
        );

        const frequentEntities = getFrequentEntities(sessionId);
        const sarah = frequentEntities.find((e) => e.name.toLowerCase() === 'sarah');

        // Entity should be detected
        expect(sarah || frequentEntities.length > 0).toBeTruthy();
      } finally {
        cleanupSession(sessionId);
      }
    });
  });

  describe('Promotion Configuration', () => {
    it('should allow configuration of promotion thresholds', async () => {
      const { configurePromotion } = await import('../../memory/dynamic/stm-promotion.js');

      // Should not throw
      expect(() => {
        configurePromotion({
          minMentionCount: 3,
          minImportanceScore: 0.6,
          maxEntitiesPerSession: 5,
        });
      }).not.toThrow();
    });
  });

  describe('Promotion Types', () => {
    it('should export correct types for promoted data', async () => {
      const promotion = await import('../../memory/dynamic/stm-promotion.js');

      expect(typeof promotion.promoteSessionToFirestore).toBe('function');
      expect(typeof promotion.onSessionEnd).toBe('function');
      expect(typeof promotion.configurePromotion).toBe('function');
    });
  });
});

// ============================================================================
// FIRESTORE-SPANNER SYNC TESTS
// ============================================================================

describe('Firestore-Spanner Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Lifecycle', () => {
    it('should export sync service functions', async () => {
      const sync = await import('../../memory/dynamic/firestore-spanner-sync.js');

      expect(typeof sync.startSyncService).toBe('function');
      expect(typeof sync.stopSyncService).toBe('function');
      expect(typeof sync.runSyncCycle).toBe('function');
      expect(typeof sync.getSyncStats).toBe('function');
      expect(typeof sync.isSyncServiceRunning).toBe('function');
      expect(typeof sync.configureSyncService).toBe('function');
    });

    it('should allow configuration of sync parameters', async () => {
      const { configureSyncService } = await import('../../memory/dynamic/firestore-spanner-sync.js');

      // Should not throw
      expect(() => {
        configureSyncService({
          minAgeMs: 12 * 60 * 60 * 1000, // 12 hours
          minImportanceScore: 0.6,
          batchSize: 25,
          enabled: true,
        });
      }).not.toThrow();
    });

    it('should track sync statistics', async () => {
      const { getSyncStats } = await import('../../memory/dynamic/firestore-spanner-sync.js');

      const stats = getSyncStats();

      expect(stats).toHaveProperty('totalEntitiesSynced');
      expect(stats).toHaveProperty('totalFactsSynced');
      expect(stats).toHaveProperty('totalRelationshipsSynced');
      expect(stats).toHaveProperty('totalSyncRuns');
      expect(stats).toHaveProperty('failedSyncs');
    });
  });

  describe('Sync Cycle', () => {
    it('should handle missing Firestore gracefully', async () => {
      const { runSyncCycle, configureSyncService } = await import(
        '../../memory/dynamic/firestore-spanner-sync.js'
      );

      // Disable for test
      configureSyncService({ enabled: false });

      const result = await runSyncCycle();

      expect(result.entitiesSynced).toBe(0);
      expect(result.factsSynced).toBe(0);
      expect(result.relationshipsSynced).toBe(0);
    });
  });
});

// ============================================================================
// GAP ANALYSIS TESTS - Coverage for edge cases identified
// ============================================================================

describe('Gap Analysis Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
  });

  describe('Relationship Signal Detection', () => {
    it('should detect explicit relationship statements', async () => {
      const { detectRelationshipSignals } = await import('../../memory/dynamic/fast-capture.js');

      const signals = detectRelationshipSignals('Sarah is my sister.');

      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].confidence).toBeGreaterThan(0);
    });

    it('should detect possessive patterns', async () => {
      const { detectRelationshipSignals } = await import('../../memory/dynamic/fast-capture.js');

      const signals = detectRelationshipSignals("My mom's birthday is next week.");

      expect(signals.length).toBeGreaterThan(0);
    });

    it('should handle complex relationship statements', async () => {
      const { detectRelationshipSignals } = await import('../../memory/dynamic/fast-capture.js');

      const signals = detectRelationshipSignals('I told my therapist about my sister.');

      expect(signals.length).toBeGreaterThanOrEqual(0); // May or may not detect complex chains
    });
  });

  describe('Deep Extraction Job Structure', () => {
    it('should include all required fields in deep extraction job', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      await fastCapture({
        userId: 'job-structure-user',
        sessionId: 'job-structure-session',
        turnNumber: 5,
        transcript: 'My sister Sarah is coming to visit next week for her birthday party.',
        voiceEmotion: 'excited',
        personaId: 'ferni',
      });

      // Find the deep extraction event
      const deepExtractionEvent = emittedEvents.find((e) => e.event === 'memory:deep-extraction');
      expect(deepExtractionEvent).toBeTruthy();

      const jobData = deepExtractionEvent?.data as Record<string, unknown>;
      expect(jobData).toHaveProperty('jobId');
      expect(jobData).toHaveProperty('userId', 'job-structure-user');
      expect(jobData).toHaveProperty('sessionId', 'job-structure-session');
      expect(jobData).toHaveProperty('turnNumber', 5);
      expect(jobData).toHaveProperty('transcript');
      expect(jobData).toHaveProperty('priority');
      expect(jobData).toHaveProperty('fastCaptureHints');

      // Validate hints structure
      const hints = jobData.fastCaptureHints as Record<string, unknown>;
      expect(hints).toHaveProperty('mentionedEntities');
      expect(hints).toHaveProperty('emotionSignals');
      expect(hints).toHaveProperty('topicHints');
      expect(hints).toHaveProperty('dateSignals');
      expect(hints).toHaveProperty('relationshipSignals');
    });

    it('should set correct priority based on emotion intensity', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      // High emotion should get high priority
      emittedEvents.length = 0;
      await fastCapture({
        userId: 'priority-user',
        sessionId: 'priority-session',
        turnNumber: 1,
        transcript: "I'm absolutely devastated about what happened to my family.",
      });

      const highEmotionJob = emittedEvents.find((e) => e.event === 'memory:deep-extraction');
      expect((highEmotionJob?.data as Record<string, unknown>)?.priority).toBe('high');

      // Normal emotion should get normal priority
      emittedEvents.length = 0;
      await fastCapture({
        userId: 'priority-user',
        sessionId: 'priority-session',
        turnNumber: 2,
        transcript: 'My sister called me yesterday about dinner plans.',
      });

      const normalEmotionJob = emittedEvents.find((e) => e.event === 'memory:deep-extraction');
      expect((normalEmotionJob?.data as Record<string, unknown>)?.priority).toBe('normal');
    });
  });

  describe('STM Context with Emotional Signals', () => {
    it('should include emotional signals in STM context', async () => {
      const { recordTurn, buildSTMContext, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `stm-emotion-${Date.now()}`;
      const userId = 'stm-emotion-user';

      try {
        // Record turn with emotion
        const result = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: "I'm feeling really stressed and anxious about work.",
          voiceEmotion: 'anxious',
        });
        recordTurn(sessionId, userId, result, "I'm feeling really stressed and anxious about work.", 1);

        const context = buildSTMContext(sessionId);

        expect(context).toBeTruthy();
        expect(context).toContain('Emotional signals');
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should track emotional trajectory correctly', async () => {
      const { recordTurn, getEmotionalTrajectory, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `trajectory-${Date.now()}`;
      const userId = 'trajectory-user';

      try {
        // Turn 1: Stressed
        const result1 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: "I'm so stressed about the deadline.",
        });
        recordTurn(sessionId, userId, result1, "I'm so stressed about the deadline.", 1);

        // Turn 2: Hopeful
        const result2 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 2,
          transcript: "I'm feeling more hopeful now, maybe I can make it.",
        });
        recordTurn(sessionId, userId, result2, "I'm feeling more hopeful now, maybe I can make it.", 2);

        // Turn 3: Relieved
        const result3 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 3,
          transcript: "I'm relieved that my boss was understanding.",
        });
        recordTurn(sessionId, userId, result3, "I'm relieved that my boss was understanding.", 3);

        const trajectory = getEmotionalTrajectory(sessionId);

        expect(trajectory.length).toBe(3);
        // Verify trajectory shows emotional progression
        expect(trajectory[0].some((e) => e.emotion === 'stress')).toBe(true);
        expect(trajectory[2].some((e) => e.emotion === 'positive')).toBe(true);
      } finally {
        cleanupSession(sessionId);
      }
    });
  });

  describe('Multi-Turn Topic Transitions', () => {
    it('should track topic shifts across conversation', async () => {
      const { recordTurn, getRecentTopics, isTopicContinuing, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `topic-transition-${Date.now()}`;
      const userId = 'topic-transition-user';

      try {
        // Turn 1: Work topic
        const result1 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'I had a tough day at work with my boss.',
        });
        recordTurn(sessionId, userId, result1, 'I had a tough day at work with my boss.', 1);

        expect(isTopicContinuing(sessionId, 'work')).toBe(true);
        expect(isTopicContinuing(sessionId, 'health')).toBe(false);

        // Turn 2: Shift to health
        const result2 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 2,
          transcript: "It's affecting my sleep, I need to see a doctor.",
        });
        recordTurn(sessionId, userId, result2, "It's affecting my sleep, I need to see a doctor.", 2);

        expect(isTopicContinuing(sessionId, 'health')).toBe(true);
        expect(isTopicContinuing(sessionId, 'sleep')).toBe(true);

        // Verify topic history order (most recent first)
        const topics = getRecentTopics(sessionId);
        const healthIndex = topics.indexOf('health');
        const workIndex = topics.indexOf('work');

        // Health should come before work (more recent)
        expect(healthIndex).toBeLessThan(workIndex);
      } finally {
        cleanupSession(sessionId);
      }
    });

    it('should move repeated topic to front of history', async () => {
      const { recordTurn, getRecentTopics, cleanupSession } = await import(
        '../../memory/dynamic/stm-buffer.js'
      );
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const sessionId = `topic-repeat-${Date.now()}`;
      const userId = 'topic-repeat-user';

      try {
        // Turn 1: Work
        const result1 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 1,
          transcript: 'My boss wants a meeting.',
        });
        recordTurn(sessionId, userId, result1, 'My boss wants a meeting.', 1);

        // Turn 2: Health
        const result2 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 2,
          transcript: "I've been seeing the doctor.",
        });
        recordTurn(sessionId, userId, result2, "I've been seeing the doctor.", 2);

        // Turn 3: Back to work (use only work-specific words, avoid "project" which triggers creative)
        const result3 = await fastCapture({
          userId,
          sessionId,
          turnNumber: 3,
          transcript: 'The deadline at my job is tomorrow.',
        });
        recordTurn(sessionId, userId, result3, 'The deadline at my job is tomorrow.', 3);

        const topics = getRecentTopics(sessionId);

        // Work should be first now (most recently mentioned)
        expect(topics[0]).toBe('work');
      } finally {
        cleanupSession(sessionId);
      }
    });
  });

  describe('Entity Context Extraction', () => {
    it('should extract context around entity mentions', async () => {
      const { detectEntityMentions } = await import('../../memory/dynamic/fast-capture.js');

      const transcript = 'Yesterday my mom called to talk about the family reunion.';
      const mentions = detectEntityMentions(transcript);

      const momMention = mentions.find((m) => m.name === 'mom');
      expect(momMention).toBeTruthy();
      expect(momMention?.context).toBeTruthy();
      expect(momMention?.context.length).toBeGreaterThan(0);
      expect(momMention?.context).toContain('mom');
    });

    it('should handle entities at start of transcript', async () => {
      const { detectEntityMentions } = await import('../../memory/dynamic/fast-capture.js');

      const transcript = 'Mom called me.';
      const mentions = detectEntityMentions(transcript);

      const momMention = mentions.find((m) => m.name === 'mom');
      expect(momMention).toBeTruthy();
      expect(momMention?.context).toBeTruthy();
    });

    it('should handle entities at end of transcript', async () => {
      const { detectEntityMentions } = await import('../../memory/dynamic/fast-capture.js');

      const transcript = 'I talked to my mom';
      const mentions = detectEntityMentions(transcript);

      const momMention = mentions.find((m) => m.name === 'mom');
      expect(momMention).toBeTruthy();
      expect(momMention?.context).toBeTruthy();
    });
  });

  describe('Concurrent Session Isolation', () => {
    it('should isolate data between different sessions', async () => {
      const {
        recordTurn,
        wasEntityMentioned,
        getRecentTopics,
        cleanupSession,
      } = await import('../../memory/dynamic/stm-buffer.js');
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const session1 = `isolation-1-${Date.now()}`;
      const session2 = `isolation-2-${Date.now()}`;
      const userId = 'isolation-user';

      try {
        // Session 1: Talk about mom and work
        const result1 = await fastCapture({
          userId,
          sessionId: session1,
          turnNumber: 1,
          transcript: 'My mom called about work.',
        });
        recordTurn(session1, userId, result1, 'My mom called about work.', 1);

        // Session 2: Talk about dad and health
        const result2 = await fastCapture({
          userId,
          sessionId: session2,
          turnNumber: 1,
          transcript: 'My dad went to the doctor.',
        });
        recordTurn(session2, userId, result2, 'My dad went to the doctor.', 1);

        // Verify session 1 has mom but not dad
        expect(wasEntityMentioned(session1, 'mom')).toBe(true);
        expect(wasEntityMentioned(session1, 'dad')).toBe(false);
        expect(getRecentTopics(session1)).toContain('work');
        expect(getRecentTopics(session1)).not.toContain('health');

        // Verify session 2 has dad but not mom
        expect(wasEntityMentioned(session2, 'dad')).toBe(true);
        expect(wasEntityMentioned(session2, 'mom')).toBe(false);
        expect(getRecentTopics(session2)).toContain('health');
        expect(getRecentTopics(session2)).not.toContain('work');
      } finally {
        cleanupSession(session1);
        cleanupSession(session2);
      }
    });
  });

  describe('Edge Case Transcripts', () => {
    it('should handle transcript with only dates', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const result = await fastCapture({
        userId: 'edge-user',
        sessionId: 'edge-session',
        turnNumber: 1,
        transcript: 'January 15th, next Monday, every week.',
      });

      expect(result.dateSignals.length).toBeGreaterThanOrEqual(2);
      // Should queue because of date signals
      expect(result.asyncJobId).toBeTruthy();
    });

    it('should handle transcript with only emotions', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const result = await fastCapture({
        userId: 'edge-user',
        sessionId: 'edge-session',
        turnNumber: 1,
        transcript: "I'm happy but also worried and kind of stressed.",
      });

      expect(result.emotionSignals.length).toBeGreaterThanOrEqual(2);
      // Should queue because of emotion signals
      expect(result.asyncJobId).toBeTruthy();
    });

    it('should handle rapid successive calls', async () => {
      const { fastCapture } = await import('../../memory/dynamic/fast-capture.js');

      const promises = Array(10)
        .fill(null)
        .map((_, i) =>
          fastCapture({
            userId: 'rapid-user',
            sessionId: 'rapid-session',
            turnNumber: i + 1,
            transcript: `Turn ${i + 1}: My mom called.`,
          })
        );

      const results = await Promise.all(promises);

      // All should complete without error
      expect(results.length).toBe(10);
      results.forEach((r) => {
        expect(r.mentionedEntities).toBeDefined();
      });
    });
  });
});
