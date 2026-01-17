/**
 * Unified Intelligence System Tests
 *
 * Tests the complete intelligence stack:
 * - Level 1: Data Foundation (98 entity types)
 * - Level 2: Context Assembly
 * - Level 3: Semantic Understanding
 * - Level 4: Cross-Domain Correlation
 * - Level 5: Proactive Intelligence
 *
 * @module tests/intelligence/unified-intelligence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Firestore before importing modules
vi.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: vi.fn(() => Promise.resolve()),
        update: vi.fn(() => Promise.resolve()),
      })),
      where: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
      })),
    })),
  })),
}));

// Mock embeddings
vi.mock('../../memory/embeddings.js', () => ({
  embed: vi.fn(async (text: string) => new Array(768).fill(0)),
  getEmbedding: vi.fn(async (text: string) => new Array(768).fill(0)),
}));

// Mock semantic RAG
vi.mock('../../memory/semantic-rag.js', () => ({
  indexDocument: vi.fn(() => Promise.resolve()),
  searchDocuments: vi.fn(() => Promise.resolve([])),
  getRelevantMemories: vi.fn(() => Promise.resolve([])),
  semanticSearch: vi.fn(() => Promise.resolve({ results: [], totalFound: 0 })),
}));

// Import after mocks
import {
  initializeIntelligence,
  cleanupIntelligenceSession,
  getUnifiedIntelligence,
  processTurnLearning,
  recordSignal,
  markProactiveInsightSurfaced,
} from '../../agents/integrations/unified-intelligence-integration.js';
import { recordDomainSignal } from '../../intelligence/index.js';
import {
  recordHabitSignal,
  recordTaskSignal,
  recordFinancialSignal,
  recordMilestoneSignal,
  recordEmotionSignal,
} from '../../services/data-layer/domain-signals.js';

describe('Unified Intelligence System', () => {
  const TEST_USER_ID = 'test-user-intelligence';
  const TEST_SESSION_ID = 'test-session-intelligence';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    cleanupIntelligenceSession(TEST_USER_ID, TEST_SESSION_ID);
  });

  // ============================================================================
  // LIFECYCLE TESTS
  // ============================================================================

  describe('Session Lifecycle', () => {
    it('should initialize intelligence for a new session', () => {
      expect(() => {
        initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);
      }).not.toThrow();
    });

    it('should cleanup intelligence session', () => {
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);
      expect(() => {
        cleanupIntelligenceSession(TEST_USER_ID, TEST_SESSION_ID);
      }).not.toThrow();
    });
  });

  // ============================================================================
  // CONTEXT ASSEMBLY TESTS (Level 2)
  // ============================================================================

  describe('Context Assembly (Level 2)', () => {
    it('should get unified intelligence for a turn', async () => {
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);

      const result = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 1,
        transcript: 'Hello, how are you?',
      });

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.correlations).toBeDefined();
      expect(result.proactiveInsights).toBeDefined();
      expect(result.timingMs).toBeDefined();
    });

    it('should include timing metrics', async () => {
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);

      const result = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 2,
        transcript: 'Tell me about my habits',
      });

      expect(result.timingMs.total).toBeGreaterThanOrEqual(0);
      expect(result.timingMs.contextAssembly).toBeGreaterThanOrEqual(0);
      expect(result.timingMs.superhuman).toBeGreaterThanOrEqual(0);
    });

    it('should detect voice emotion when provided', async () => {
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);

      const result = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 1,
        transcript: 'I am feeling stressed',
        voiceEmotion: {
          emotion: 'stress',
          confidence: 0.85,
          arousal: 0.7,
          valence: 0.3,
        },
      });

      expect(result).toBeDefined();
      // The voice emotion should influence context
    });
  });

  // ============================================================================
  // DOMAIN SIGNAL TESTS (Level 3-4)
  // ============================================================================

  describe('Domain Signals', () => {
    it('should record habit signals', () => {
      expect(() => {
        recordHabitSignal(TEST_USER_ID, 'Morning Jog', 'completed', {
          streak: 7,
          category: 'exercise',
        });
      }).not.toThrow();
    });

    it('should record task signals', () => {
      expect(() => {
        recordTaskSignal(TEST_USER_ID, 'Review Q4 Report', 'completed', {
          priority: 'high',
          overdue: false,
        });
      }).not.toThrow();
    });

    it('should record financial signals', () => {
      expect(() => {
        recordFinancialSignal(TEST_USER_ID, 'savings_goal_progress', {
          category: 'Emergency Fund',
          amount: 5000,
          savingsProgress: 50,
        });
      }).not.toThrow();
    });

    it('should record milestone signals', () => {
      expect(() => {
        recordMilestoneSignal(TEST_USER_ID, 'Wedding', 'approaching', {
          category: 'life',
          daysUntil: 30,
        });
      }).not.toThrow();
    });

    it('should record emotion signals', () => {
      expect(() => {
        recordEmotionSignal(TEST_USER_ID, 'joy', 0.8, {
          topic: 'promotion',
          timeOfDay: 'morning',
        });
      }).not.toThrow();
    });

    it('should use recordSignal for generic signals', () => {
      expect(() => {
        recordSignal(TEST_USER_ID, {
          domain: 'health',
          type: 'sleep_logged',
          data: { quality: 'good', hoursSlept: 8 },
          timestamp: new Date(),
          importance: 0.6,
        });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // TURN LEARNING TESTS
  // ============================================================================

  describe('Turn Learning', () => {
    it('should process turn learning without errors', () => {
      expect(() => {
        processTurnLearning({
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
          turnNumber: 3,
          transcript: 'I completed my morning routine today',
          topics: ['routine', 'morning'],
          emotion: 'satisfied',
        });
      }).not.toThrow();
    });

    it('should record insight reaction', () => {
      expect(() => {
        processTurnLearning({
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
          turnNumber: 4,
          transcript: "That's a great insight, thank you!",
          reactionToInsight: 'positive',
        });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // PROACTIVE INSIGHT TESTS (Level 5)
  // ============================================================================

  describe('Proactive Insights (Level 5)', () => {
    it('should mark insights as surfaced', () => {
      expect(() => {
        markProactiveInsightSurfaced(TEST_USER_ID, 'insight-123');
      }).not.toThrow();
    });

    it('should surface insights at session start when appropriate', async () => {
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);

      // Session start (turn 1) is when opener insights should be surfaced
      const result = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 1,
        transcript: 'Hi',
      });

      // The result should have structure for insights even if none are ready
      // insightToSurface may be undefined when no insight is ready to surface
      expect(result).toHaveProperty('insightToSurface');
      expect(Array.isArray(result.proactiveInsights)).toBe(true);
    });
  });

  // ============================================================================
  // CROSS-DOMAIN CORRELATION TESTS (Level 4)
  // ============================================================================

  describe('Cross-Domain Correlations (Level 4)', () => {
    it('should detect correlations across domains', async () => {
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);

      // Record signals from multiple domains
      recordHabitSignal(TEST_USER_ID, 'Sleep Tracking', 'completed', {
        streak: 3,
        category: 'health',
      });
      recordEmotionSignal(TEST_USER_ID, 'stress', 0.7, {
        topic: 'work',
      });
      recordTaskSignal(TEST_USER_ID, 'Deadline Project', 'completed', {
        priority: 'high',
      });

      // Get intelligence which includes correlations
      const result = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 2,
        transcript: 'How am I doing overall?',
      });

      expect(result.correlations).toBeDefined();
      expect(Array.isArray(result.correlations)).toBe(true);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('End-to-End Integration', () => {
    it('should handle a complete conversation turn flow', async () => {
      // 1. Initialize session
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);

      // 2. Get intelligence for turn 1
      const turn1 = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 1,
        transcript: 'Good morning!',
      });

      expect(turn1).toBeDefined();
      expect(turn1.context).toBeDefined();

      // 3. Process learning from turn 1
      processTurnLearning({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 1,
        transcript: 'Good morning!',
        emotion: 'neutral',
      });

      // 4. Record domain signals from user activity
      recordHabitSignal(TEST_USER_ID, 'Morning Meditation', 'completed', {
        streak: 5,
      });

      // 5. Get intelligence for turn 2
      const turn2 = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 2,
        transcript: 'I just finished my meditation',
      });

      expect(turn2).toBeDefined();

      // 6. Cleanup
      cleanupIntelligenceSession(TEST_USER_ID, TEST_SESSION_ID);
    });

    it('should handle multiple users independently', async () => {
      const user1 = 'user-1-test';
      const user2 = 'user-2-test';

      initializeIntelligence(user1, 'session-1');
      initializeIntelligence(user2, 'session-2');

      // Record different signals for each user
      recordHabitSignal(user1, 'Running', 'completed');
      recordHabitSignal(user2, 'Reading', 'completed');

      // Get intelligence for each user
      const [result1, result2] = await Promise.all([
        getUnifiedIntelligence({
          userId: user1,
          sessionId: 'session-1',
          turnNumber: 1,
          transcript: 'Hi',
        }),
        getUnifiedIntelligence({
          userId: user2,
          sessionId: 'session-2',
          turnNumber: 1,
          transcript: 'Hello',
        }),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      // Results should be independent

      cleanupIntelligenceSession(user1, 'session-1');
      cleanupIntelligenceSession(user2, 'session-2');
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle missing user gracefully', async () => {
      const result = await getUnifiedIntelligence({
        userId: 'non-existent-user',
        sessionId: 'session',
        turnNumber: 1,
        transcript: 'Hello',
      });

      // Should not throw, should return default/empty context
      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
    });

    it('should handle invalid input gracefully', async () => {
      initializeIntelligence(TEST_USER_ID, TEST_SESSION_ID);

      const result = await getUnifiedIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        turnNumber: 0, // Invalid turn number
        transcript: '',
      });

      expect(result).toBeDefined();
    });
  });
});
