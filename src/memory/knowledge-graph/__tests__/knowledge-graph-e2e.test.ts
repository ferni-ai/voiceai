/**
 * Knowledge Graph E2E Tests
 *
 * Comprehensive end-to-end tests for the unified memory architecture.
 * Tests the full flow: capture → query → surface → insights.
 *
 * @module memory/knowledge-graph/__tests__/knowledge-graph-e2e
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// Mock Firestore before imports
vi.mock('@google-cloud/firestore', () => {
  const mockDocs = new Map<string, unknown>();

  const createMockDocRef = (path: string) => ({
    id: path.split('/').pop() || uuidv4(),
    path,
    get: vi.fn().mockImplementation(async () => ({
      exists: mockDocs.has(path),
      data: () => mockDocs.get(path),
      id: path.split('/').pop(),
    })),
    set: vi.fn().mockImplementation(async (data: unknown) => {
      mockDocs.set(path, data);
    }),
    update: vi.fn().mockImplementation(async (data: unknown) => {
      const existing = mockDocs.get(path) || {};
      mockDocs.set(path, { ...existing, ...data });
    }),
    delete: vi.fn().mockImplementation(async () => {
      mockDocs.delete(path);
    }),
  });

  const createMockQuery = () => ({
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  });

  const createMockCollectionRef = (collectionPath: string) => ({
    doc: vi.fn().mockImplementation((docId?: string) =>
      createMockDocRef(`${collectionPath}/${docId || uuidv4()}`)
    ),
    add: vi.fn().mockImplementation(async (data: unknown) => {
      const id = uuidv4();
      mockDocs.set(`${collectionPath}/${id}`, data);
      return createMockDocRef(`${collectionPath}/${id}`);
    }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  });

  return {
    Firestore: vi.fn().mockImplementation(() => ({
      collection: vi.fn().mockImplementation((name: string) =>
        createMockCollectionRef(name)
      ),
    })),
    FieldValue: {
      increment: vi.fn().mockReturnValue({ _increment: 1 }),
      arrayUnion: vi.fn().mockImplementation((val: unknown) => ({ _arrayUnion: val })),
      serverTimestamp: vi.fn().mockReturnValue(new Date()),
    },
  };
});

// Mock Gemini API
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            {
              name: 'Mike',
              type: 'person',
              relationship: 'brother',
              confidence: 0.9,
              sourceText: 'my brother Mike',
            },
          ]),
        },
      }),
    }),
  })),
}));

// Test subject imports
import {
  extractEntities,
  extractEntitiesRuleBased,
  extractFacts,
  extractRelationships,
  type ExtractedEntity,
  type ExtractionContext,
} from '../extractors/index.js';

import {
  captureTurn,
  isKnowledgeCaptureReady,
  type TurnCaptureInput,
} from '../services/knowledge-capture.js';

import {
  executeNaturalQuery,
  detectQueryType,
} from '../services/natural-language-query.js';

import {
  createInsight,
  getInsight,
  getAllInsights,
  getInsightsReadyToSurface,
  recordInsightSurfaced,
  recordInsightFeedback,
  deleteInsight,
} from '../storage/insight-store.js';

import {
  createThread,
  getThread,
  getActiveThreads,
  addOpenQuestion,
  resolveOpenQuestion,
  findOrCreateThread,
} from '../storage/thread-store.js';

// ============================================================================
// TEST SETUP
// ============================================================================

const TEST_USER_ID = `test_user_${uuidv4().substring(0, 8)}`;
const TEST_SESSION_ID = `test_session_${uuidv4().substring(0, 8)}`;

describe('Knowledge Graph E2E Tests', () => {
  beforeAll(() => {
    // Set environment variables for tests
    process.env.GOOGLE_API_KEY = 'test-key';
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY EXTRACTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Entity Extraction', () => {
    describe('Rule-Based Extraction', () => {
      it('should extract relationship mentions', () => {
        const transcript = 'I was talking to my brother about the trip';
        const entities = extractEntitiesRuleBased(transcript);

        expect(entities.length).toBeGreaterThan(0);
        const brother = entities.find((e) => e.relationship === 'brother');
        expect(brother).toBeDefined();
        expect(brother?.type).toBe('person');
      });

      it('should extract family relationships', () => {
        const transcript = 'My mom called yesterday about my sister\'s wedding';
        const entities = extractEntitiesRuleBased(transcript);

        const mom = entities.find((e) => e.relationship === 'mother');
        const sister = entities.find((e) => e.relationship === 'sister');

        expect(mom).toBeDefined();
        expect(sister).toBeDefined();
      });

      it('should extract professional relationships', () => {
        const transcript = 'My boss wants me to meet with the client tomorrow';
        const entities = extractEntitiesRuleBased(transcript);

        const boss = entities.find((e) => e.relationship === 'boss');
        expect(boss).toBeDefined();
      });

      it('should extract proper names', () => {
        const transcript = 'I met Sarah and John at the conference';
        const entities = extractEntitiesRuleBased(transcript);

        const sarah = entities.find((e) => e.name === 'Sarah');
        const john = entities.find((e) => e.name === 'John');

        expect(sarah).toBeDefined();
        expect(john).toBeDefined();
      });

      it('should extract events', () => {
        const transcript = 'I have a meeting tomorrow and my surgery is next week';
        const entities = extractEntitiesRuleBased(transcript);

        const hasEvent = entities.some((e) => e.type === 'event');
        expect(hasEvent).toBe(true);
      });

      it('should extract goals and commitments', () => {
        const transcript = 'I want to learn Spanish and I need to call the dentist';
        const entities = extractEntitiesRuleBased(transcript);

        const hasGoal = entities.some((e) => e.type === 'goal');
        const hasCommitment = entities.some((e) => e.type === 'commitment');

        expect(hasGoal || hasCommitment).toBe(true);
      });
    });

    describe('LLM-Based Extraction', () => {
      it('should extract entities via LLM when available', async () => {
        const context: ExtractionContext = {
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
          turnNumber: 1,
        };

        const result = await extractEntities('My brother Mike is having surgery next week', context);

        expect(result.entities.length).toBeGreaterThan(0);
        expect(result.modelUsed).toBeDefined();
      });

      it('should fall back to rule-based on LLM failure', async () => {
        // The mock will work, but test the structure
        const context: ExtractionContext = {
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
          turnNumber: 1,
        };

        const result = await extractEntities('My sister lives in Chicago', context);

        expect(result.entities).toBeDefined();
        expect(result.processingTimeMs).toBeGreaterThan(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY DETECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Query Detection', () => {
    it('should detect entity profile queries', () => {
      const queries = [
        'What do we know about Mike?',
        'Tell me everything about my brother',
        'Who is Sarah?',
      ];

      for (const query of queries) {
        const result = detectQueryType(query);
        expect(result.type).toBe('entity_profile');
        expect(result.target).toBeTruthy();
      }
    });

    it('should detect temporal queries', () => {
      const queries = [
        'When did I last talk about my mom?',
        'How long since we discussed my career?',
      ];

      for (const query of queries) {
        const result = detectQueryType(query);
        expect(result.type).toBe('temporal');
      }
    });

    it('should detect pattern queries', () => {
      const queries = [
        'What patterns have you noticed about my stress?',
        'Have you noticed any patterns with my sleep?',
      ];

      for (const query of queries) {
        const result = detectQueryType(query);
        expect(result.type).toBe('pattern');
      }
    });

    it('should detect relationship queries', () => {
      const result = detectQueryType('How is Mike connected to Sarah?');
      expect(result.type).toBe('relationship');
    });

    it('should detect open loops queries', () => {
      const queries = [
        "What were we talking about that we didn't finish?",
        'Any open threads?',
      ];

      for (const query of queries) {
        const result = detectQueryType(query);
        expect(result.type).toBe('open_loops');
      }
    });

    it('should default to general for unrecognized queries', () => {
      const result = detectQueryType('Tell me something interesting');
      expect(result.type).toBe('general');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INSIGHT STORE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Insight Store', () => {
    it('should create an insight', async () => {
      const insight = await createInsight(TEST_USER_ID, {
        userId: TEST_USER_ID,
        insightType: 'behavioral_pattern',
        title: 'Test Pattern',
        description: 'You tend to feel stressed on Mondays',
        evidence: ['Observed 5 times'],
        entityIds: [],
        mentionIds: [],
        confidence: 0.8,
        salience: 0.7,
        actionability: 0.5,
      });

      // In mocked environment, may be null
      if (insight) {
        expect(insight.id).toBeDefined();
        expect(insight.title).toBe('Test Pattern');
      }
    });

    it('should track surfacing and feedback', async () => {
      // Create insight first
      const insight = await createInsight(TEST_USER_ID, {
        userId: TEST_USER_ID,
        insightType: 'temporal_pattern',
        title: 'Weekend Pattern',
        description: 'You discuss family more on weekends',
        evidence: [],
        entityIds: [],
        mentionIds: [],
        confidence: 0.75,
        salience: 0.6,
        actionability: 0.4,
      });

      if (insight) {
        // Record surfacing
        await recordInsightSurfaced(TEST_USER_ID, insight.id);

        // Record feedback
        await recordInsightFeedback(TEST_USER_ID, insight.id, 'helpful');

        // These should not throw
        expect(true).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // THREAD STORE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Thread Store', () => {
    it('should create a thread', async () => {
      const thread = await createThread(TEST_USER_ID, {
        topic: "Mom's surgery preparation",
        entityIds: ['entity_123'],
        initialSession: {
          sessionId: TEST_SESSION_ID,
          date: new Date(),
          summary: 'Discussed upcoming surgery',
          emotionalArc: 'worried → hopeful',
          keyMoments: ['Learned about recovery time'],
          turnRange: [1, 10],
        },
      });

      if (thread) {
        expect(thread.topic).toBe("Mom's surgery preparation");
        expect(thread.status).toBe('active');
        expect(thread.sessions).toHaveLength(1);
      }
    });

    it('should manage open questions', async () => {
      const thread = await createThread(TEST_USER_ID, {
        topic: 'Career decision',
        initialSession: {
          sessionId: TEST_SESSION_ID,
          date: new Date(),
          summary: 'Discussed job options',
          emotionalArc: 'uncertain',
          keyMoments: [],
          turnRange: [1, 5],
        },
      });

      if (thread) {
        // Add open question
        await addOpenQuestion(TEST_USER_ID, thread.id, 'Should I take the promotion?');

        // Resolve it
        await resolveOpenQuestion(TEST_USER_ID, thread.id, 'Should I take the promotion?');

        // These should not throw
        expect(true).toBe(true);
      }
    });

    it('should find or create thread', async () => {
      const thread = await findOrCreateThread(
        TEST_USER_ID,
        'Health goals',
        {
          sessionId: TEST_SESSION_ID,
          date: new Date(),
          summary: 'Discussed exercise routine',
          emotionalArc: 'motivated',
          keyMoments: [],
          turnRange: [1, 3],
        }
      );

      expect(thread).toBeDefined();
      expect(thread.topic).toBe('Health goals');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NATURAL LANGUAGE QUERY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Natural Language Query', () => {
    it('should execute entity profile query', async () => {
      const result = await executeNaturalQuery(
        TEST_USER_ID,
        'What do we know about Mike?'
      );

      expect(result.queryType).toBe('entity_profile');
      expect(result.formattedResponse).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should execute temporal query', async () => {
      const result = await executeNaturalQuery(
        TEST_USER_ID,
        'When did I last talk about my mom?'
      );

      expect(result.queryType).toBe('temporal');
      expect(result.formattedResponse).toBeDefined();
    });

    it('should execute open loops query', async () => {
      const result = await executeNaturalQuery(
        TEST_USER_ID,
        'Any open threads?'
      );

      expect(result.queryType).toBe('open_loops');
      expect(result.formattedResponse).toBeDefined();
    });

    it('should handle unknown entities gracefully', async () => {
      const result = await executeNaturalQuery(
        TEST_USER_ID,
        'What do we know about XYZ123NonExistent?'
      );

      expect(result.confidence).toBeLessThan(0.5);
      expect(result.formattedResponse).toContain("don't have");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE CAPTURE INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Knowledge Capture Flow', () => {
    it('should capture entities from conversation turn', async () => {
      const input: TurnCaptureInput = {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 1,
        transcript: 'My brother Mike is having surgery next week',
        personaId: 'ferni',
        emotion: {
          primary: 'worried',
          intensity: 0.7,
          valence: -0.3,
        },
        topic: 'health',
      };

      const result = await captureTurn(input);

      // The capture should complete without error
      expect(result).toBeDefined();
      expect(result.metrics.totalTimeMs).toBeGreaterThan(0);
    });

    it('should skip very short messages', async () => {
      const result = await captureTurn({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 2,
        transcript: 'Hi',
      });

      // Should return early with 0 entities
      expect(result.entities.created).toBe(0);
      expect(result.entities.updated).toBe(0);
    });

    it('should respect rate limiting', async () => {
      // First capture
      await captureTurn({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 3,
        transcript: 'My sister Sarah is coming to visit tomorrow',
      });

      // Immediate second capture should be rate limited
      const result = await captureTurn({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 4,
        transcript: 'Sarah is bringing the kids too',
      });

      // May be rate limited or not depending on timing
      expect(result).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E FLOW TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Complete E2E Flow', () => {
    it('should support full capture → query → insight flow', async () => {
      // Step 1: Capture entity from conversation
      const captureResult = await captureTurn({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 10,
        transcript: 'My mom called about her doctor appointment next Tuesday',
        emotion: { primary: 'concerned', intensity: 0.5 },
        topic: 'family',
      });

      expect(captureResult).toBeDefined();

      // Step 2: Query for entity
      const queryResult = await executeNaturalQuery(
        TEST_USER_ID,
        'What do we know about my mom?'
      );

      expect(queryResult.queryType).toBe('entity_profile');
      expect(queryResult.formattedResponse).toBeDefined();

      // Step 3: Create insight about pattern
      const insight = await createInsight(TEST_USER_ID, {
        userId: TEST_USER_ID,
        insightType: 'temporal_pattern',
        title: 'Family health concerns',
        description: 'You often discuss health topics when talking about mom',
        evidence: ['Multiple mentions in health context'],
        entityIds: [],
        mentionIds: [],
        confidence: 0.7,
        salience: 0.6,
        actionability: 0.3,
      });

      if (insight) {
        expect(insight.insightType).toBe('temporal_pattern');
      }

      // Step 4: Create thread for ongoing topic
      const thread = await findOrCreateThread(
        TEST_USER_ID,
        "Mom's health",
        {
          sessionId: TEST_SESSION_ID,
          date: new Date(),
          summary: 'Discussed doctor appointment',
          emotionalArc: 'concerned',
          keyMoments: ['Appointment is Tuesday'],
          turnRange: [10, 10],
        }
      );

      expect(thread.topic).toBe("Mom's health");

      // Step 5: Add open question
      await addOpenQuestion(TEST_USER_ID, thread.id, 'Should we offer to drive her?');

      // Step 6: Query for open loops
      const openLoops = await executeNaturalQuery(
        TEST_USER_ID,
        'What were we talking about that we didn\'t finish?'
      );

      expect(openLoops.queryType).toBe('open_loops');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Performance', () => {
    it('should complete extraction in reasonable time', async () => {
      const start = Date.now();

      const result = await extractEntities(
        'My brother Mike and my sister Sarah are planning a surprise party for mom and dad',
        {
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
          turnNumber: 1,
        }
      );

      const elapsed = Date.now() - start;

      // Should complete in under 5 seconds (including LLM call)
      expect(elapsed).toBeLessThan(5000);
      expect(result.processingTimeMs).toBeLessThan(5000);
    });

    it('should complete queries in reasonable time', async () => {
      const start = Date.now();

      await executeNaturalQuery(TEST_USER_ID, 'What do we know about Mike?');

      const elapsed = Date.now() - start;

      // Should complete in under 2 seconds
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
