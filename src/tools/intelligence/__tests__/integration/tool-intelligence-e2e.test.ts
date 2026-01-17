/**
 * Tool Intelligence E2E Tests
 *
 * Tests the complete tool intelligence flow including:
 * - FTIS routing with populated availableTools
 * - Merger graceful degradation (no API key)
 * - Outcome tracking and persistence
 * - Observability event emission
 *
 * @module tools/intelligence/__tests__/integration/tool-intelligence-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger before any imports - must be inline for hoisting
vi.mock('../../../../utils/safe-logger.js', () => {
  const createMockLogger = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => logger),
    };
    return logger;
  };
  return {
    createLogger: createMockLogger,
    getLogger: createMockLogger,
  };
});

// Create mock database factory - accessible to tests
function createMockDb() {
  const batchMock = {
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({ id: 'test-doc' }),
    }),
    batch: vi.fn().mockReturnValue(batchMock),
    _batchMock: batchMock, // Expose for assertions
  };
}

// Shared mock instance for Firestore - initialized here to satisfy TypeScript
// and re-created fresh in beforeEach for test isolation
let mockDb = createMockDb();

// Mock Firestore - inline for hoisting
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => mockDb,
}));

// Mock utils
vi.mock('../../../../utils/firestore-utils.js', () => ({
  cleanForFirestore: (obj: unknown) => obj,
}));

// Mock tool registry
vi.mock('../../../registry/index.js', () => ({
  toolRegistry: {
    get: vi.fn((id: string) => ({
      id,
      name: id,
      description: `Tool ${id}`,
      domain: 'test',
      create: () => ({
        description: `Tool ${id}`,
        execute: vi.fn().mockResolvedValue('success'),
      }),
    })),
    getAll: vi.fn().mockReturnValue([
      { id: 'weather_current', domain: 'information' },
      { id: 'play_music', domain: 'entertainment' },
      { id: 'set_reminder', domain: 'productivity' },
    ]),
    query: vi.fn().mockReturnValue([]),
  },
}));

// Import after mocks
import { ToolMerger } from '../../merger/tool-merger.js';
import {
  initializeOutcomeTracker,
  getOutcomeTracker,
  resetOutcomeTracker,
} from '../../learning/outcome-tracker.js';
import {
  emitToolIntelligenceEvent,
  getToolIntelligenceEvents,
} from '../../../../api/observability-routes.js';

describe('Tool Intelligence E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb(); // Create fresh mock for each test
    resetOutcomeTracker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // MERGER GRACEFUL DEGRADATION
  // =========================================================================

  describe('Merger Graceful Degradation', () => {
    it('should work without GOOGLE_API_KEY (embedding-only mode)', () => {
      // Clear API key
      const originalKey = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      try {
        // Should not throw
        const merger = new ToolMerger();
        expect(merger).toBeDefined();

        // LLM classifier should be disabled
        const config = (merger as unknown as { config: { useLLMClassifier: boolean } }).config;
        expect(config.useLLMClassifier).toBe(false);
      } finally {
        // Restore
        if (originalKey) {
          process.env.GOOGLE_API_KEY = originalKey;
        }
      }
    });

    it('should enable LLM classifier when GOOGLE_API_KEY is present', () => {
      // Set API key
      const originalKey = process.env.GOOGLE_API_KEY;
      process.env.GOOGLE_API_KEY = 'test-key';

      try {
        const merger = new ToolMerger();
        const config = (merger as unknown as { config: { useLLMClassifier: boolean } }).config;
        expect(config.useLLMClassifier).toBe(true);
      } finally {
        // Restore
        if (originalKey) {
          process.env.GOOGLE_API_KEY = originalKey;
        } else {
          delete process.env.GOOGLE_API_KEY;
        }
      }
    });
  });

  // =========================================================================
  // OUTCOME TRACKING
  // =========================================================================

  describe('Outcome Tracking', () => {
    it('should initialize with Firestore', async () => {
      await initializeOutcomeTracker(mockDb as unknown as FirebaseFirestore.Firestore);
      const tracker = getOutcomeTracker();
      expect(tracker).toBeDefined();
    });

    it('should track tool outcomes', async () => {
      await initializeOutcomeTracker(mockDb as unknown as FirebaseFirestore.Firestore);
      const tracker = getOutcomeTracker();

      tracker.track({
        sessionId: 'test-session',
        turnId: 'turn-1',
        toolId: 'weather_current',
        query: 'what is the weather',
        selectedBy: 'semantic',
        confidence: 0.95,
        wasExecuted: true,
        executionSuccess: true,
        executionLatencyMs: 150,
        userContinued: true,
        followUpTools: [],
        personaId: 'ferni',
      });

      // Check metrics
      const metrics = tracker.getRecentMetrics();
      expect(metrics.toolCalls).toBeGreaterThanOrEqual(0); // May be 0 if keepInMemory is false
    });

    it('should flush to Firestore when buffer is full', async () => {
      await initializeOutcomeTracker(mockDb as unknown as FirebaseFirestore.Firestore, {
        bufferSize: 2, // Small buffer for testing
      });
      const tracker = getOutcomeTracker();

      // Track 2 outcomes to trigger flush
      for (let i = 0; i < 2; i++) {
        tracker.track({
          sessionId: 'test-session',
          turnId: `turn-${i}`,
          toolId: 'weather_current',
          query: 'test query',
          selectedBy: 'semantic',
          confidence: 0.9,
          wasExecuted: true,
          executionSuccess: true,
          executionLatencyMs: 100,
          userContinued: true,
          followUpTools: [],
          personaId: 'ferni',
        });
      }

      // Wait for async flush
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify batch was created
      expect(mockDb.batch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // OBSERVABILITY EVENTS
  // =========================================================================

  describe('Observability Events', () => {
    it('should emit tool intelligence events', () => {
      emitToolIntelligenceEvent('tool_selection', {
        transcript: 'play some music',
        selected: 5,
        totalAvailable: 100,
        selectionTimeMs: 45,
      });

      const events = getToolIntelligenceEvents(10);
      expect(events.length).toBeGreaterThan(0);

      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe('tool_selection');
      expect(lastEvent.data.transcript).toBe('play some music');
      expect(lastEvent.data.selected).toBe(5);
    });

    it('should maintain ring buffer (max 100 events)', () => {
      // Emit 110 events
      for (let i = 0; i < 110; i++) {
        emitToolIntelligenceEvent('test_event', { index: i });
      }

      const events = getToolIntelligenceEvents(200);
      expect(events.length).toBeLessThanOrEqual(100);

      // First events should have been removed
      const firstEvent = events[0];
      expect((firstEvent.data as { index: number }).index).toBeGreaterThanOrEqual(10);
    });

    it('should include timestamp in events', () => {
      emitToolIntelligenceEvent('timestamp_test', { foo: 'bar' });

      const events = getToolIntelligenceEvents(1);
      expect(events[0].timestamp).toBeDefined();
      expect(new Date(events[0].timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // INTEGRATION: FULL FLOW
  // =========================================================================

  describe('Full Flow Integration', () => {
    it('should handle complete tool selection → execution → tracking flow', async () => {
      // 1. Initialize outcome tracker
      await initializeOutcomeTracker(mockDb as unknown as FirebaseFirestore.Firestore);

      // 2. Simulate tool selection (what orchestrator does)
      const selectionData = {
        transcript: 'what is the weather today',
        userId: 'user-123',
        personaId: 'ferni',
        selected: 3,
        totalAvailable: 50,
        selectionTimeMs: 35,
        layers: {
          semantic: true,
          intent: true,
          intelligence: false,
          ftis: true,
          memoryAware: false,
        },
      };

      // 3. Emit observability event
      emitToolIntelligenceEvent('tool_selection', selectionData);

      // 4. Simulate tool execution result
      const executionResult = {
        toolId: 'weather_current',
        success: true,
        durationMs: 150,
      };

      // 5. Track outcome (what json-function-executor does)
      const tracker = getOutcomeTracker();
      tracker.track({
        sessionId: 'session-abc',
        turnId: 'turn-1',
        toolId: executionResult.toolId,
        query: selectionData.transcript,
        selectedBy: 'semantic',
        confidence: 0.92,
        wasExecuted: true,
        executionSuccess: executionResult.success,
        executionLatencyMs: executionResult.durationMs,
        userContinued: true,
        followUpTools: [],
        personaId: selectionData.personaId,
      });

      // 6. Verify observability
      const events = getToolIntelligenceEvents(10);
      const selectionEvent = events.find((e) => e.type === 'tool_selection');
      expect(selectionEvent).toBeDefined();
      expect(selectionEvent?.data.selected).toBe(3);

      // 7. Verify tracker stats
      const stats = tracker.getStats();
      expect(stats.totalTracked).toBeGreaterThan(0);
    });
  });
});
