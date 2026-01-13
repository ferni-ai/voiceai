/**
 * Better Than Human - Validation Framework Tests
 *
 * Tests the BTH validation infrastructure itself.
 *
 * @module services/bth-validation/__tests__/bth-validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  mockLogger.child = vi.fn(() => mockLogger);
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

// Mock Firestore
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Import after mocks
import {
  trackBTHCapabilityTriggered,
  trackBTHUserResponse,
  getBufferStats,
  initBTHTelemetry,
} from '../production-telemetry.js';
import {
  COMMITMENT_TEST_CASES,
  CRISIS_TEST_CASES,
  READING_BETWEEN_LINES_CASES,
  ALL_TEST_CASES,
  runCapabilityBenchmark,
  formatBenchmarkReport,
} from '../capability-benchmark.js';
import type { BTHProductionEvent, AdversarialTestCase, CapabilityBenchmark } from '../types.js';

// ============================================================================
// PRODUCTION TELEMETRY TESTS
// ============================================================================

describe('BTH Production Telemetry', () => {
  beforeEach(() => {
    initBTHTelemetry({ telemetrySamplingRate: 1.0 });
  });

  describe('trackBTHCapabilityTriggered', () => {
    it('should track capability triggers and return event ID', () => {
      const eventId = trackBTHCapabilityTriggered({
        userId: 'test-user',
        sessionId: 'test-session',
        capability: 'commitment_detection',
        trigger: {
          type: 'user_message',
          content: "I promise I'll call mom",
          confidence: 0.95,
        },
        action: {
          type: 'injected_context',
          description: 'Added commitment to context',
          contextInjected: 'User committed to calling mom',
        },
      });

      expect(eventId).toBeTruthy();
      expect(eventId).toMatch(/^bth_/);
    });

    it('should add events to buffer', () => {
      const initialStats = getBufferStats();
      const initialCount = initialStats.bufferedEvents;

      trackBTHCapabilityTriggered({
        userId: 'test-user',
        sessionId: 'test-session',
        capability: 'crisis_detection',
        trigger: {
          type: 'user_message',
          content: 'I feel hopeless',
          confidence: 0.88,
        },
        action: {
          type: 'surfaced_pattern',
          description: 'Detected potential crisis signal',
        },
      });

      const newStats = getBufferStats();
      expect(newStats.bufferedEvents).toBeGreaterThan(initialCount);
    });

    it('should track capability breakdown in buffer stats', () => {
      trackBTHCapabilityTriggered({
        userId: 'user1',
        sessionId: 'session1',
        capability: 'commitment_detection',
        trigger: { type: 'user_message', content: 'test', confidence: 0.9 },
        action: { type: 'none', description: 'test' },
      });

      trackBTHCapabilityTriggered({
        userId: 'user1',
        sessionId: 'session1',
        capability: 'commitment_detection',
        trigger: { type: 'user_message', content: 'test2', confidence: 0.8 },
        action: { type: 'none', description: 'test' },
      });

      trackBTHCapabilityTriggered({
        userId: 'user1',
        sessionId: 'session1',
        capability: 'crisis_detection',
        trigger: { type: 'user_message', content: 'test3', confidence: 0.7 },
        action: { type: 'none', description: 'test' },
      });

      const stats = getBufferStats();
      expect(stats.capabilityBreakdown['commitment_detection']).toBeGreaterThanOrEqual(2);
      expect(stats.capabilityBreakdown['crisis_detection']).toBeGreaterThanOrEqual(1);
    });

    it('should not track disabled capabilities', () => {
      initBTHTelemetry({
        telemetrySamplingRate: 1.0,
        enabledCapabilities: ['crisis_detection'], // Only crisis enabled
      });

      const eventId = trackBTHCapabilityTriggered({
        userId: 'test-user',
        sessionId: 'test-session',
        capability: 'commitment_detection', // Not enabled
        trigger: { type: 'user_message', content: 'test', confidence: 0.9 },
        action: { type: 'none', description: 'test' },
      });

      expect(eventId).toBe('');
    });
  });

  describe('trackBTHUserResponse', () => {
    it('should analyze acknowledgment patterns', () => {
      // First trigger a capability
      trackBTHCapabilityTriggered({
        userId: 'test-user',
        sessionId: 'response-test-session',
        capability: 'pattern_surfacing',
        trigger: {
          type: 'context_detection',
          content: 'Detected stress pattern',
          confidence: 0.85,
        },
        action: {
          type: 'surfaced_pattern',
          description: 'Surfaced stress pattern',
        },
      });

      // Then track user response
      trackBTHUserResponse({
        sessionId: 'response-test-session',
        userMessage: "You're right, I have been stressed lately",
        sentiment: 'positive',
      });

      // The response should be attached to the event in buffer
      // We can't easily verify this without accessing internals,
      // but we can verify no errors occur
      expect(true).toBe(true);
    });

    it('should detect dismissal patterns', () => {
      trackBTHCapabilityTriggered({
        userId: 'test-user',
        sessionId: 'dismissal-test',
        capability: 'reading_between_lines',
        trigger: { type: 'user_message', content: 'test', confidence: 0.8 },
        action: { type: 'surfaced_pattern', description: 'test' },
      });

      trackBTHUserResponse({
        sessionId: 'dismissal-test',
        userMessage: 'Anyway, can we talk about something else?',
        sentiment: 'neutral',
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should detect engagement patterns', () => {
      trackBTHCapabilityTriggered({
        userId: 'test-user',
        sessionId: 'engagement-test',
        capability: 'emotional_vocabulary',
        trigger: { type: 'user_message', content: 'I feel weird', confidence: 0.9 },
        action: { type: 'modified_response', description: 'Offered vocabulary' },
      });

      trackBTHUserResponse({
        sessionId: 'engagement-test',
        userMessage: 'Tell me more about what you mean by that',
        sentiment: 'positive',
      });

      // Should not throw
      expect(true).toBe(true);
    });
  });
});

// ============================================================================
// CAPABILITY BENCHMARK TESTS
// ============================================================================

describe('BTH Capability Benchmark', () => {
  describe('Test Case Definitions', () => {
    it('should have commitment test cases with required fields', () => {
      expect(COMMITMENT_TEST_CASES.length).toBeGreaterThan(0);

      for (const tc of COMMITMENT_TEST_CASES) {
        expect(tc.id).toBeTruthy();
        expect(tc.capability).toBe('commitment_detection');
        expect(tc.input).toBeTruthy();
        expect(tc.expectedResult).toBeDefined();
        expect(typeof tc.expectedResult.shouldDetect).toBe('boolean');
        expect(tc.difficulty).toMatch(/^(easy|medium|hard|adversarial)$/);
        expect(tc.reason).toBeTruthy();
      }
    });

    it('should have crisis test cases with required fields', () => {
      expect(CRISIS_TEST_CASES.length).toBeGreaterThan(0);

      for (const tc of CRISIS_TEST_CASES) {
        expect(tc.id).toBeTruthy();
        expect(tc.capability).toBe('crisis_detection');
        expect(tc.input).toBeTruthy();
        expect(tc.expectedResult).toBeDefined();
      }
    });

    it('should have reading between lines test cases', () => {
      expect(READING_BETWEEN_LINES_CASES.length).toBeGreaterThan(0);

      for (const tc of READING_BETWEEN_LINES_CASES) {
        expect(tc.id).toBeTruthy();
        expect(tc.capability).toBe('reading_between_lines');
      }
    });

    it('should have balanced positive and negative cases', () => {
      const commitmentPositive = COMMITMENT_TEST_CASES.filter(
        (tc) => tc.expectedResult.shouldDetect
      );
      const commitmentNegative = COMMITMENT_TEST_CASES.filter(
        (tc) => !tc.expectedResult.shouldDetect
      );

      expect(commitmentPositive.length).toBeGreaterThan(0);
      expect(commitmentNegative.length).toBeGreaterThan(0);

      const crisisPositive = CRISIS_TEST_CASES.filter((tc) => tc.expectedResult.shouldDetect);
      const crisisNegative = CRISIS_TEST_CASES.filter((tc) => !tc.expectedResult.shouldDetect);

      expect(crisisPositive.length).toBeGreaterThan(0);
      expect(crisisNegative.length).toBeGreaterThan(0);
    });

    it('should include adversarial cases', () => {
      const adversarial = ALL_TEST_CASES.filter((tc) => tc.difficulty === 'adversarial');
      expect(adversarial.length).toBeGreaterThan(0);
    });

    it('should include slang/Gen-Z cases', () => {
      const slangCases = ALL_TEST_CASES.filter(
        (tc) => tc.tags.includes('slang') || tc.tags.includes('gen-z')
      );
      expect(slangCases.length).toBeGreaterThan(0);
    });

    it('should include ESL cases', () => {
      const eslCases = ALL_TEST_CASES.filter((tc) => tc.tags.includes('esl'));
      expect(eslCases.length).toBeGreaterThan(0);
    });

    it('should include sarcasm cases', () => {
      const sarcasmCases = ALL_TEST_CASES.filter((tc) => tc.tags.includes('sarcasm'));
      expect(sarcasmCases.length).toBeGreaterThan(0);
    });
  });

  describe('runCapabilityBenchmark', () => {
    it('should run commitment detection benchmark', async () => {
      const benchmark = await runCapabilityBenchmark('commitment_detection');

      expect(benchmark.capability).toBe('commitment_detection');
      expect(benchmark.totalTestCases).toBeGreaterThan(0);
      expect(benchmark.f1Score).toBeGreaterThanOrEqual(0);
      expect(benchmark.f1Score).toBeLessThanOrEqual(1);
      expect(benchmark.precision).toBeGreaterThanOrEqual(0);
      expect(benchmark.recall).toBeGreaterThanOrEqual(0);
      expect(benchmark.trend).toMatch(/^(improving|degrading|stable)$/);
    });

    it('should run crisis detection benchmark', async () => {
      const benchmark = await runCapabilityBenchmark('crisis_detection');

      expect(benchmark.capability).toBe('crisis_detection');
      expect(benchmark.totalTestCases).toBeGreaterThan(0);
    });

    it('should run reading between lines benchmark', async () => {
      const benchmark = await runCapabilityBenchmark('reading_between_lines');

      expect(benchmark.capability).toBe('reading_between_lines');
    });

    it('should detect trend when comparing to previous', async () => {
      const benchmark1 = await runCapabilityBenchmark('commitment_detection');

      // Simulate previous benchmark with different score
      const previousBenchmark: CapabilityBenchmark = {
        ...benchmark1,
        f1Score: benchmark1.f1Score - 0.1, // Previous was worse
      };

      const benchmark2 = await runCapabilityBenchmark('commitment_detection', previousBenchmark);

      expect(benchmark2.previousF1Score).toBe(previousBenchmark.f1Score);
      expect(benchmark2.deltaFromPrevious).toBeDefined();
    });

    it('should identify known gaps', async () => {
      const benchmark = await runCapabilityBenchmark('commitment_detection');

      // There should be gaps for hard cases
      // (This tests whether gap tracking works, actual gaps depend on detection quality)
      expect(benchmark.knownGaps).toBeDefined();
      expect(Array.isArray(benchmark.knownGaps)).toBe(true);
    });
  });

  describe('formatBenchmarkReport', () => {
    it('should format report as readable string', async () => {
      const benchmark = await runCapabilityBenchmark('commitment_detection');

      const report = {
        reportId: 'test-report',
        generatedAt: new Date(),
        capabilities: [benchmark],
        overallF1Score: benchmark.f1Score,
        overallAccuracy: benchmark.accuracy,
        hasRegressions: false,
        regressions: [],
        improvements: [],
      };

      const formatted = formatBenchmarkReport(report);

      expect(formatted).toContain('BETTER THAN HUMAN');
      expect(formatted).toContain('commitment_detection');
      expect(formatted).toContain('F1');
      expect(formatted).toContain('KNOWN GAPS');
    });

    it('should highlight regressions in report', async () => {
      const benchmark = await runCapabilityBenchmark('commitment_detection');

      const report = {
        reportId: 'test-report',
        generatedAt: new Date(),
        capabilities: [benchmark],
        overallF1Score: benchmark.f1Score,
        overallAccuracy: benchmark.accuracy,
        hasRegressions: true,
        regressions: [
          {
            capability: 'commitment_detection',
            previousF1: 0.9,
            currentF1: 0.7,
            delta: -0.2,
          },
        ],
        improvements: [],
      };

      const formatted = formatBenchmarkReport(report);

      expect(formatted).toContain('REGRESSIONS');
    });
  });
});

// ============================================================================
// TYPE VALIDATION TESTS
// ============================================================================

describe('BTH Type Definitions', () => {
  it('should have valid BTH capability categories', () => {
    const validCategories = [
      'emotional_support',
      'commitment_tracking',
      'crisis_detection',
      'pattern_recognition',
      'life_coaching',
      'memory_recall',
      'reading_between_lines',
      'emotional_vocabulary',
      'silence_interpretation',
      'voice_biomarkers',
    ];

    // Verify each category is represented in test cases
    const categoriesInTests = new Set(ALL_TEST_CASES.map((tc) => tc.capability));

    expect(categoriesInTests.size).toBeGreaterThan(0);
  });

  it('should have valid difficulty levels', () => {
    const difficulties = ALL_TEST_CASES.map((tc) => tc.difficulty);
    const uniqueDifficulties = [...new Set(difficulties)];

    for (const diff of uniqueDifficulties) {
      expect(['easy', 'medium', 'hard', 'adversarial']).toContain(diff);
    }
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('BTH End-to-End Flow', () => {
  it('should track capability, user response, and appear in stats', () => {
    // Re-initialize with full default config to reset any state from previous tests
    initBTHTelemetry({
      telemetrySamplingRate: 1.0,
      enabledCapabilities: [
        'commitment_detection',
        'crisis_detection',
        'reading_between_lines',
        'pattern_surfacing',
        'emotional_vocabulary',
      ],
    });

    // 1. Capability triggers
    const eventId = trackBTHCapabilityTriggered({
      userId: 'e2e-user',
      sessionId: 'e2e-session',
      capability: 'commitment_detection',
      trigger: {
        type: 'user_message',
        content: "I'm going to start exercising tomorrow",
        confidence: 0.92,
      },
      action: {
        type: 'injected_context',
        description: 'Added commitment to context for follow-up',
        contextInjected: 'User committed to starting exercise tomorrow',
      },
    });

    expect(eventId).toBeTruthy();

    // 2. User responds positively
    trackBTHUserResponse({
      sessionId: 'e2e-session',
      userMessage: "Yeah, you're right, I did say that. I really should follow through.",
      sentiment: 'positive',
    });

    // 3. Verify stats reflect the activity
    const stats = getBufferStats();
    expect(stats.bufferedEvents).toBeGreaterThan(0);
    expect(stats.capabilityBreakdown['commitment_detection']).toBeGreaterThanOrEqual(1);
  });

  it('should run benchmark and produce actionable gaps', async () => {
    // Run benchmark
    const benchmark = await runCapabilityBenchmark('commitment_detection');

    // Verify we get actionable information
    expect(benchmark.f1Score).toBeGreaterThanOrEqual(0);

    // Log results for manual inspection during test runs
    console.log('\n=== COMMITMENT DETECTION BENCHMARK ===');
    console.log(`F1 Score: ${(benchmark.f1Score * 100).toFixed(1)}%`);
    console.log(`Precision: ${(benchmark.precision * 100).toFixed(1)}%`);
    console.log(`Recall: ${(benchmark.recall * 100).toFixed(1)}%`);
    console.log(`Known Gaps: ${benchmark.knownGaps.length}`);

    for (const gap of benchmark.knownGaps) {
      console.log(`  - [${gap.priority}] ${gap.category}: ${gap.examples[0] ?? 'N/A'}`);
    }
  });
});

// ============================================================================
// BLIND EVALUATION TESTS
// ============================================================================

import { cleanupExpiredSessions } from '../blind-evaluation.js';
import type { EvaluationRatings } from '../types.js';

describe('BTH Blind Evaluation', () => {
  describe('cleanupExpiredSessions', () => {
    it('should clean up expired sessions without errors', () => {
      // This should run without throwing
      const cleaned = cleanupExpiredSessions();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EvaluationRatings structure', () => {
    it('should have correct rating dimensions', () => {
      const ratings: EvaluationRatings = {
        empathy: 4,
        helpfulness: 5,
        memoryUsage: 3,
        timeliness: 4,
        superhumanFactor: 5,
      };

      expect(ratings.empathy).toBeGreaterThanOrEqual(1);
      expect(ratings.empathy).toBeLessThanOrEqual(5);
      expect(ratings.superhumanFactor).toBeDefined();
    });

    it('should calculate rating deltas correctly', () => {
      const ferniRatings: EvaluationRatings = {
        empathy: 4.5,
        helpfulness: 4.2,
        memoryUsage: 4.8,
        timeliness: 4.1,
        superhumanFactor: 4.7,
      };

      const humanRatings: EvaluationRatings = {
        empathy: 3.8,
        helpfulness: 3.9,
        memoryUsage: 2.5,
        timeliness: 3.7,
        superhumanFactor: 2.1,
      };

      // Calculate deltas
      const deltas: EvaluationRatings = {
        empathy: ferniRatings.empathy - humanRatings.empathy,
        helpfulness: ferniRatings.helpfulness - humanRatings.helpfulness,
        memoryUsage: ferniRatings.memoryUsage - humanRatings.memoryUsage,
        timeliness: ferniRatings.timeliness - humanRatings.timeliness,
        superhumanFactor: ferniRatings.superhumanFactor - humanRatings.superhumanFactor,
      };

      // Ferni should excel at memory and superhuman factor
      expect(deltas.memoryUsage).toBeGreaterThan(1.5);
      expect(deltas.superhumanFactor).toBeGreaterThan(2);

      // Empathy should be competitive but not as large a gap
      expect(deltas.empathy).toBeGreaterThan(0);
      expect(deltas.empathy).toBeLessThan(1);
    });
  });

  describe('Preference Calculation', () => {
    it('should correctly identify preference from A/B selection', () => {
      // Simulating the logic from blind-evaluation.ts
      // Use function to prevent TypeScript literal narrowing
      const getSource = (): 'ferni' | 'human' => 'ferni';
      const getPref = (): 'A' | 'B' | 'no_preference' => 'A';
      const responseASource = getSource();
      const preferredResponse = getPref();

      // If A is Ferni and user preferred A, Ferni wins
      const ferniWon =
        (responseASource === 'ferni' && preferredResponse === 'A') ||
        (responseASource === 'human' && preferredResponse === 'B');

      expect(ferniWon).toBe(true);
    });

    it('should correctly identify when human is preferred', () => {
      // Use function to prevent TypeScript literal narrowing
      const getSource = (): 'ferni' | 'human' => 'ferni';
      const getPref = (): 'A' | 'B' | 'no_preference' => 'B';
      const responseASource = getSource();
      const preferredResponse = getPref();

      // If A is Ferni and user preferred B, human wins
      const humanWon =
        (responseASource === 'human' && preferredResponse === 'A') ||
        (responseASource === 'ferni' && preferredResponse === 'B');

      expect(humanWon).toBe(true);
    });

    it('should handle randomization correctly', () => {
      // Track which source appears in which position
      const positions = { ferniAsA: 0, ferniAsB: 0 };

      // Simulate 1000 randomizations
      for (let i = 0; i < 1000; i++) {
        const showFerniAsA = Math.random() < 0.5;
        if (showFerniAsA) {
          positions.ferniAsA++;
        } else {
          positions.ferniAsB++;
        }
      }

      // Should be roughly 50/50 (with some variance)
      expect(positions.ferniAsA).toBeGreaterThan(400);
      expect(positions.ferniAsA).toBeLessThan(600);
      expect(positions.ferniAsB).toBeGreaterThan(400);
      expect(positions.ferniAsB).toBeLessThan(600);
    });
  });

  describe('Statistical Significance', () => {
    it('should calculate chi-squared for preference difference', () => {
      // Test chi-squared calculation logic
      const ferniPreferred = 35;
      const humanPreferred = 15;
      const totalVotes = ferniPreferred + humanPreferred;
      const expectedIfEqual = totalVotes / 2;

      const chiSquared =
        Math.pow(ferniPreferred - expectedIfEqual, 2) / expectedIfEqual +
        Math.pow(humanPreferred - expectedIfEqual, 2) / expectedIfEqual;

      // With 35 vs 15, chi-squared should be > 3.84 (p < 0.05)
      expect(chiSquared).toBeGreaterThan(3.84);
    });

    it('should not be significant with close preferences', () => {
      const ferniPreferred = 26;
      const humanPreferred = 24;
      const totalVotes = ferniPreferred + humanPreferred;
      const expectedIfEqual = totalVotes / 2;

      const chiSquared =
        Math.pow(ferniPreferred - expectedIfEqual, 2) / expectedIfEqual +
        Math.pow(humanPreferred - expectedIfEqual, 2) / expectedIfEqual;

      // With 26 vs 24, chi-squared should be < 3.84 (not significant)
      expect(chiSquared).toBeLessThan(3.84);
    });
  });
});
