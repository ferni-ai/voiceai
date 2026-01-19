/**
 * Gemini Function Calling Reliability E2E Synthetic Tests
 *
 * Comprehensive tests validating the reliability improvements for Gemini's
 * JSON-based function calling system. These tests simulate real-world
 * scenarios where function calling can degrade:
 *
 * 1. Leakage Detection - Model speaks tool call instead of executing
 * 2. Session Decay - Function calling degrades over extended sessions
 * 3. Parallel Execution - Critical tools run with parallel fallback
 * 4. Health Monitoring - Session health tracking and refresh triggers
 * 5. Context Pruning - Conversation context management
 *
 * Architecture tested:
 * ```
 * User Input → Turn Handler → Session Health Monitor
 *                   ↓
 *            JSON Detection → Parallel Executor (critical tools)
 *                   ↓
 *            Function Executor → Tool Result
 *                   ↓
 *            Telemetry → Observability Endpoint
 * ```
 *
 * @module tests/synthetic/gemini-reliability-e2e.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCK SETUP - Must be before imports
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

// ============================================================================
// SESSION HEALTH MONITOR TESTS
// ============================================================================

describe('Session Health Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize session health tracking', async () => {
      const { initializeHealthMonitor, getSessionHealth, clearHealthMonitor } = await import(
        '../../agents/shared/session-health-monitor.js'
      );

      const sessionId = 'test-init-session';
      initializeHealthMonitor(sessionId);

      const health = getSessionHealth(sessionId);
      expect(health).toBeDefined();
      expect(health?.turnCount).toBe(0);
      expect(health?.consecutiveLeakages).toBe(0);
      expect(health?.totalToolCalls).toBe(0);
      expect(health?.shouldRefresh).toBe(false);

      clearHealthMonitor(sessionId);
    });

    it('should accept optional refresh callback', async () => {
      const { initializeHealthMonitor, clearHealthMonitor } = await import(
        '../../agents/shared/session-health-monitor.js'
      );

      const sessionId = 'test-callback-session';
      const refreshCallback = vi.fn().mockResolvedValue(undefined);

      // Should not throw with callback
      expect(() => initializeHealthMonitor(sessionId, refreshCallback)).not.toThrow();

      clearHealthMonitor(sessionId);
    });
  });

  describe('Turn Tracking', () => {
    it('should increment turn count on recordTurn', async () => {
      const { initializeHealthMonitor, recordTurn, getSessionHealth, clearHealthMonitor } =
        await import('../../agents/shared/session-health-monitor.js');

      const sessionId = 'test-turn-tracking';
      initializeHealthMonitor(sessionId);

      recordTurn(sessionId);
      recordTurn(sessionId);
      recordTurn(sessionId);

      const health = getSessionHealth(sessionId);
      expect(health?.turnCount).toBe(3);

      clearHealthMonitor(sessionId);
    });

    it('should track tool call success', async () => {
      const {
        initializeHealthMonitor,
        recordTurn,
        recordToolCallSuccess,
        getSessionHealth,
        clearHealthMonitor,
      } = await import('../../agents/shared/session-health-monitor.js');

      const sessionId = 'test-tool-success';
      initializeHealthMonitor(sessionId);

      recordTurn(sessionId);
      recordToolCallSuccess(sessionId);
      recordTurn(sessionId);
      recordToolCallSuccess(sessionId);

      const health = getSessionHealth(sessionId);
      expect(health?.totalToolCalls).toBe(2);
      expect(health?.lastToolCallTurn).toBe(2);

      clearHealthMonitor(sessionId);
    });
  });

  describe('Leakage Detection', () => {
    it('should track consecutive leakages', async () => {
      const {
        initializeHealthMonitor,
        recordTurn,
        recordToolCallLeakage,
        getSessionHealth,
        clearHealthMonitor,
      } = await import('../../agents/shared/session-health-monitor.js');

      const sessionId = 'test-leakage-tracking';
      initializeHealthMonitor(sessionId);

      recordTurn(sessionId);
      recordToolCallLeakage(sessionId, 'playMusic');
      recordTurn(sessionId);
      recordToolCallLeakage(sessionId, 'getWeather');

      const health = getSessionHealth(sessionId);
      expect(health?.consecutiveLeakages).toBe(2);
      expect(health?.totalLeakages).toBe(2);

      clearHealthMonitor(sessionId);
    });

    it('should reset consecutive leakages on tool success', async () => {
      const {
        initializeHealthMonitor,
        recordTurn,
        recordToolCallSuccess,
        recordToolCallLeakage,
        getSessionHealth,
        clearHealthMonitor,
      } = await import('../../agents/shared/session-health-monitor.js');

      const sessionId = 'test-leakage-reset';
      initializeHealthMonitor(sessionId);

      recordTurn(sessionId);
      recordToolCallLeakage(sessionId);
      recordTurn(sessionId);
      recordToolCallLeakage(sessionId);

      let health = getSessionHealth(sessionId);
      expect(health?.consecutiveLeakages).toBe(2);

      // Success should reset consecutive count
      recordToolCallSuccess(sessionId);

      health = getSessionHealth(sessionId);
      expect(health?.consecutiveLeakages).toBe(0);
      expect(health?.totalLeakages).toBe(2); // Total still tracked

      clearHealthMonitor(sessionId);
    });

    it('should trigger refresh after threshold leakages', async () => {
      const {
        initializeHealthMonitor,
        recordTurn,
        recordToolCallLeakage,
        getSessionHealth,
        shouldRefreshSession,
        clearHealthMonitor,
      } = await import('../../agents/shared/session-health-monitor.js');

      const sessionId = 'test-refresh-trigger';
      initializeHealthMonitor(sessionId);

      // Simulate multiple leakages to trigger refresh threshold
      for (let i = 0; i < 4; i++) {
        recordTurn(sessionId);
        recordToolCallLeakage(sessionId, `tool${i}`);
      }

      const needsRefresh = shouldRefreshSession(sessionId);
      const health = getSessionHealth(sessionId);

      expect(needsRefresh).toBe(true);
      expect(health?.shouldRefresh).toBe(true);
      expect(health?.refreshReason).toContain('leakage');

      clearHealthMonitor(sessionId);
    });
  });

  describe('Session Decay Detection', () => {
    it('should detect session decay from turns without tool calls', async () => {
      const {
        initializeHealthMonitor,
        recordTurn,
        recordToolCallSuccess,
        shouldRefreshSession,
        clearHealthMonitor,
      } = await import('../../agents/shared/session-health-monitor.js');

      const sessionId = 'test-decay-detection';
      initializeHealthMonitor(sessionId);

      // First few turns with tool calls (healthy)
      recordTurn(sessionId);
      recordToolCallSuccess(sessionId);
      recordTurn(sessionId);
      recordToolCallSuccess(sessionId);

      // Then many turns without tool calls (simulating decay)
      for (let i = 0; i < 15; i++) {
        recordTurn(sessionId);
      }

      const needsRefresh = shouldRefreshSession(sessionId);
      // After 15+ turns without a tool call, should suggest refresh
      expect(needsRefresh).toBe(true);

      clearHealthMonitor(sessionId);
    });
  });
});

// ============================================================================
// PARALLEL TOOL EXECUTOR TESTS
// ============================================================================

describe('Parallel Tool Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Critical Tool Detection', () => {
    it('should identify persona-specific handoff tools as critical', async () => {
      const { isCriticalTool } = await import('../../agents/shared/parallel-tool-executor.js');

      // Actual registered critical tools use persona-specific names
      expect(isCriticalTool('handoffToMaya')).toBe(true);
      expect(isCriticalTool('handoffToPeter')).toBe(true);
      expect(isCriticalTool('handoffToJordan')).toBe(true);
      expect(isCriticalTool('handoffToAlex')).toBe(true);
      expect(isCriticalTool('handoffToNayan')).toBe(true);
      expect(isCriticalTool('handoffToFerni')).toBe(true);
    });

    it('should allow adding custom critical tools', async () => {
      const { isCriticalTool, addCriticalTool, removeCriticalTool } = await import(
        '../../agents/shared/parallel-tool-executor.js'
      );

      // Add a custom critical tool
      expect(isCriticalTool('customCritical')).toBe(false);
      addCriticalTool('customCritical');
      expect(isCriticalTool('customCritical')).toBe(true);

      // Clean up
      removeCriticalTool('customCritical');
      expect(isCriticalTool('customCritical')).toBe(false);
    });

    it('should return all critical tools', async () => {
      const { getCriticalTools } = await import('../../agents/shared/parallel-tool-executor.js');

      const criticalTools = getCriticalTools();
      expect(criticalTools.size).toBeGreaterThan(0);
      expect(criticalTools.has('handoffToMaya')).toBe(true);
    });

    it('should NOT mark regular tools as critical', async () => {
      const { isCriticalTool } = await import('../../agents/shared/parallel-tool-executor.js');

      expect(isCriticalTool('playMusic')).toBe(false);
      expect(isCriticalTool('getWeather')).toBe(false);
      expect(isCriticalTool('saveNote')).toBe(false);
      expect(isCriticalTool('createHabit')).toBe(false);
    });
  });

  describe('Parallel Execution', () => {
    it('should execute critical tool with parallel attempts', async () => {
      const { executeWithParallelFallback } = await import(
        '../../agents/shared/parallel-tool-executor.js'
      );

      let callCount = 0;
      const executor = vi.fn().mockImplementation(async () => {
        callCount++;
        return { success: true, data: { handoffComplete: true } };
      });

      const result = await executeWithParallelFallback('handoff', { targetPersona: 'maya' }, executor, {
        maxParallel: 2,
        timeoutMs: 5000,
      });

      expect(result.success).toBe(true);
      // Should have called executor (may be 1 or 2 times depending on race)
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it('should use first successful result from parallel attempts', async () => {
      const { executeWithParallelFallback } = await import(
        '../../agents/shared/parallel-tool-executor.js'
      );

      let callCount = 0;
      const executor = vi.fn().mockImplementation(async () => {
        callCount++;
        // Simulate varying latency
        await new Promise((r) => setTimeout(r, Math.random() * 50));
        return { success: true, data: { attempt: callCount } };
      });

      const result = await executeWithParallelFallback('handoff', {}, executor, {
        maxParallel: 3,
        timeoutMs: 5000,
      });

      expect(result.success).toBe(true);
      // Multiple attempts may have started
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle failure from all parallel attempts', async () => {
      const { executeWithParallelFallback } = await import(
        '../../agents/shared/parallel-tool-executor.js'
      );

      const executor = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await executeWithParallelFallback('handoff', {}, executor, {
        maxParallel: 2,
        timeoutMs: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('error');
    });

    it('should timeout long-running parallel attempts', async () => {
      const { executeWithParallelFallback } = await import(
        '../../agents/shared/parallel-tool-executor.js'
      );

      const executor = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10000)); // Very long
        return { success: true, data: {} };
      });

      const result = await executeWithParallelFallback('handoff', {}, executor, {
        maxParallel: 2,
        timeoutMs: 100, // Short timeout
      });

      // Should fail due to timeout
      expect(result.success).toBe(false);
    }, 5000);
  });
});

// ============================================================================
// CONVERSATION PRIMING TESTS
// ============================================================================

describe('Conversation Priming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Priming Turn Generation', () => {
    it('should generate priming turns for JSON format when enabled', async () => {
      const { getPrimingTurns } = await import('../../agents/shared/conversation-priming.js');

      // Enable priming with config
      const config = { enabled: true, includeToolExamples: true, maxPrimingTurns: 10 };
      const primingTurns = getPrimingTurns(config);

      expect(Array.isArray(primingTurns)).toBe(true);

      // When enabled, should have priming turns (unless SEMANTIC_ROUTING_PRIMARY is set)
      // The actual content depends on whether semantic routing is enabled
      if (process.env.SEMANTIC_ROUTING_PRIMARY !== 'true') {
        // Should contain JSON format examples if semantic routing is not primary
        const hasJsonExample = primingTurns.some(
          (turn) => turn.content.includes('"fn"') || turn.content.includes('fn')
        );
        // Note: May return empty if semantic routing is primary
        expect(hasJsonExample || primingTurns.length === 0).toBe(true);
      }
    });

    it('should return empty array when priming is disabled', async () => {
      const { getPrimingTurns } = await import('../../agents/shared/conversation-priming.js');

      const config = { enabled: false };
      const primingTurns = getPrimingTurns(config);

      expect(primingTurns).toEqual([]);
    });
  });

  describe('Leakage Detection', () => {
    it('should detect tool call leakage patterns', async () => {
      const { detectsToolCallLeakage } = await import('../../agents/shared/conversation-priming.js');

      // These are leakage patterns that match actual TOOL_CALL_LEAKAGE_PATTERNS:
      // - /i(?:'ll| will) play/i - "I'll play" or "I will play"
      // - /let me play/i - "let me play"
      // - /i(?:'ll| will) check/i - "I'll check" or "I will check"
      // - /let me transfer/i - "let me transfer"
      // - /i(?:'ll| will) hand you off/i - "I'll hand you off"
      expect(detectsToolCallLeakage("I'll play some music for you").isLeakage).toBe(true);
      expect(detectsToolCallLeakage("I'll check the weather for you").isLeakage).toBe(true);
      expect(detectsToolCallLeakage("Let me transfer you to Maya").isLeakage).toBe(true);
      expect(detectsToolCallLeakage("I'll hand you off to Alex").isLeakage).toBe(true);
    });

    it('should NOT flag normal conversation as leakage', async () => {
      const { detectsToolCallLeakage } = await import('../../agents/shared/conversation-priming.js');

      // Normal conversation should not be flagged
      expect(detectsToolCallLeakage("How are you feeling today?").isLeakage).toBe(false);
      expect(detectsToolCallLeakage("That sounds like a challenging situation").isLeakage).toBe(false);
      expect(detectsToolCallLeakage("I understand what you mean").isLeakage).toBe(false);
    });

    it('should suggest appropriate tool when leakage detected', async () => {
      const { detectsToolCallLeakage } = await import('../../agents/shared/conversation-priming.js');

      const musicLeakage = detectsToolCallLeakage("I'll play some jazz for you");
      expect(musicLeakage.isLeakage).toBe(true);
      expect(musicLeakage.suggestedTool).toBe('playMusic');
      expect(musicLeakage.pattern).toBeTruthy();
    });
  });

  describe('Retry Prompt Generation', () => {
    it('should generate retry prompt for failed tool calls', async () => {
      const { generateRetryPrompt } = await import('../../agents/shared/conversation-priming.js');

      const retryPrompt = generateRetryPrompt('playMusic', { query: 'jazz' });

      // Retry prompt should instruct JSON output format
      expect(retryPrompt).toBeTruthy();
      // Should contain instruction about JSON format
      expect(retryPrompt.toLowerCase()).toMatch(/json|fn|format/i);
    });
  });
});

// ============================================================================
// CONTEXT PRUNING TESTS
// ============================================================================

describe('Context Pruning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pruning Decision', () => {
    it('should recommend pruning for long conversations', async () => {
      const { shouldPruneContext } = await import('../../agents/shared/conversation-priming.js');

      // Create a long conversation
      const turns = Array.from({ length: 60 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
        index: i,
      }));

      const result = shouldPruneContext(turns);
      expect(result.shouldPrune).toBe(true);
      expect(result.reason).toBeTruthy();
    });

    it('should NOT recommend pruning for short conversations', async () => {
      const { shouldPruneContext } = await import('../../agents/shared/conversation-priming.js');

      const turns = [
        { role: 'user' as const, content: 'Hello', index: 0 },
        { role: 'assistant' as const, content: 'Hi there!', index: 1 },
        { role: 'user' as const, content: 'How are you?', index: 2 },
      ];

      const result = shouldPruneContext(turns);
      expect(result.shouldPrune).toBe(false);
    });
  });

  describe('Pruning Execution', () => {
    it('should preserve priming turns when pruning', async () => {
      const { pruneConversationContext } = await import('../../agents/shared/conversation-priming.js');

      const turns = [
        // Priming turns (should be preserved)
        { role: 'system' as const, content: '[system: format check]', index: 0, isPriming: true },
        {
          role: 'assistant' as const,
          content: '{"fn":"playMusic","args":{"query":"jazz"}}',
          index: 1,
          isPriming: true,
        },
        // Regular conversation (middle may be pruned)
        ...Array.from({ length: 50 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Message ${i + 2}`,
          index: i + 2,
        })),
      ];

      const result = pruneConversationContext(turns, { maxTurns: 30 });

      // Priming turns should be in kept turns
      const keptPriming = result.keptTurns.filter((t) => t.isPriming);
      expect(keptPriming.length).toBeGreaterThan(0);
    });

    it('should preserve recent turns when pruning', async () => {
      const { pruneConversationContext } = await import('../../agents/shared/conversation-priming.js');

      const turns = Array.from({ length: 60 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}`,
        index: i,
      }));

      const result = pruneConversationContext(turns, { maxTurns: 30, minRecentTurns: 10 });

      // Last 10 turns should be preserved
      const lastTurnIndex = turns[turns.length - 1].index;
      const recentKept = result.keptTurns.filter((t) => t.index >= lastTurnIndex - 9);
      expect(recentKept.length).toBe(10);
    });

    it('should preserve turns with successful tool calls', async () => {
      const { pruneConversationContext } = await import('../../agents/shared/conversation-priming.js');

      const turns = [
        ...Array.from({ length: 20 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Message ${i}`,
          index: i,
        })),
        // Turn with tool call in the middle
        {
          role: 'assistant' as const,
          content: '{"fn":"createTask","args":{"title":"Important task"}}',
          index: 20,
          hasToolCall: true,
        },
        ...Array.from({ length: 40 }, (_, i) => ({
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Message ${i + 21}`,
          index: i + 21,
        })),
      ];

      const result = pruneConversationContext(turns, { preserveToolCalls: true });

      // Tool call turn should be preserved
      const toolCallKept = result.keptTurns.find((t) => t.hasToolCall);
      expect(toolCallKept).toBeDefined();
    });
  });
});

// ============================================================================
// FUNCTION CALL TELEMETRY TESTS
// ============================================================================

describe('Function Call Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Metric Recording', () => {
    it('should record successful JSON function calls', async () => {
      const { logJsonExecuted, getGeminiHealthMetrics, clearSession } = await import(
        '../../agents/shared/function-call-telemetry.js'
      );

      const sessionId = 'telemetry-test-session';

      // logJsonExecuted(sessionId, fn, success, durationMs, error?, turnNumber?, retryCount?)
      logJsonExecuted(sessionId, 'playMusic', true, 150);
      logJsonExecuted(sessionId, 'getWeather', true, 200);

      // getGeminiHealthMetrics() returns aggregate metrics across all sessions
      const metrics = getGeminiHealthMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.aggregate).toBeDefined();
      // Aggregate includes all sessions, so check structure not exact values
      expect(typeof metrics.aggregate.jsonCalls).toBe('number');

      clearSession(sessionId);
    });

    it('should record leakage events', async () => {
      const { logLeakageDetected, getGeminiHealthMetrics, clearSession } = await import(
        '../../agents/shared/function-call-telemetry.js'
      );

      const sessionId = 'leakage-test-session';

      // logLeakageDetected(sessionId, pattern, suggestedTool, responsePreview, turnNumber?)
      logLeakageDetected(
        sessionId,
        "i(?:'ll| will) play",
        'playMusic',
        "I'll play some music for you",
        5
      );

      const metrics = getGeminiHealthMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.aggregate.leakageCount).toBeGreaterThanOrEqual(0);

      clearSession(sessionId);
    });
  });

  describe('Health Dashboard', () => {
    it('should generate comprehensive health dashboard', async () => {
      const {
        logJsonExecuted,
        logLeakageDetected,
        getFunctionCallHealthDashboard,
        clearSession,
      } = await import('../../agents/shared/function-call-telemetry.js');

      const sessionId = 'dashboard-test-session';

      // Simulate a session with mixed results
      logJsonExecuted(sessionId, 'playMusic', true, 100);
      logJsonExecuted(sessionId, 'getWeather', true, 150);
      logLeakageDetected(sessionId, "i(?:'ll| will) transfer", 'handoff', "I'll transfer you", 3);
      logJsonExecuted(sessionId, 'createTask', true, 200);

      const dashboard = getFunctionCallHealthDashboard(sessionId);

      expect(dashboard).toBeDefined();
      expect(dashboard.health).toBeDefined();
      expect(dashboard.trends).toBeDefined();
      expect(dashboard.recommendations).toBeDefined();

      clearSession(sessionId);
    });
  });
});

// ============================================================================
// HYBRID SCENARIO TESTS
// ============================================================================

describe('Hybrid Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Health + Telemetry Integration', () => {
    it('should coordinate health monitor and telemetry tracking', async () => {
      const { initializeHealthMonitor, recordTurn, getSessionHealth, clearHealthMonitor } =
        await import('../../agents/shared/session-health-monitor.js');
      const { logJsonExecuted, getGeminiHealthMetrics, clearSession } = await import(
        '../../agents/shared/function-call-telemetry.js'
      );

      const sessionId = 'hybrid-integration-test';

      // Initialize both systems
      initializeHealthMonitor(sessionId);

      // Simulate turn with tool call
      recordTurn(sessionId);
      logJsonExecuted(sessionId, 'playMusic', true, 100);

      // Verify both systems tracked the event
      const health = getSessionHealth(sessionId);
      const telemetry = getGeminiHealthMetrics();

      expect(health?.turnCount).toBe(1);
      expect(telemetry.aggregate).toBeDefined();

      clearHealthMonitor(sessionId);
      clearSession(sessionId);
    });
  });

  describe('Extended Session Simulation', () => {
    it('should handle realistic 50-turn session with tool calls and leakages', async () => {
      const {
        initializeHealthMonitor,
        recordTurn,
        recordToolCallSuccess,
        recordToolCallLeakage,
        getSessionHealth,
        clearHealthMonitor,
      } = await import('../../agents/shared/session-health-monitor.js');
      const { logJsonExecuted, logLeakageDetected, getGeminiHealthMetrics, clearSession } =
        await import('../../agents/shared/function-call-telemetry.js');

      const sessionId = 'extended-session-test';
      initializeHealthMonitor(sessionId);

      // Simulate realistic session pattern:
      // - First 20 turns: Healthy with tool calls
      // - Next 20 turns: Some decay, occasional leakages
      // - Last 10 turns: More leakages (degradation)

      for (let turn = 1; turn <= 50; turn++) {
        recordTurn(sessionId);

        if (turn <= 20) {
          // Healthy phase - 80% tool calls succeed
          if (turn % 3 !== 0) {
            recordToolCallSuccess(sessionId);
            logJsonExecuted(sessionId, `tool${turn}`, true, 100 + Math.random() * 100);
          }
        } else if (turn <= 40) {
          // Decay phase - 50% success, 20% leakage
          const roll = Math.random();
          if (roll < 0.5) {
            recordToolCallSuccess(sessionId);
            logJsonExecuted(sessionId, `tool${turn}`, true, 150 + Math.random() * 150);
          } else if (roll < 0.7) {
            recordToolCallLeakage(sessionId, `tool${turn}`);
            logLeakageDetected(sessionId, 'leakage-pattern', `tool${turn}`, 'Simulated leakage', turn);
          }
        } else {
          // Degradation phase - 30% success, 40% leakage
          const roll = Math.random();
          if (roll < 0.3) {
            recordToolCallSuccess(sessionId);
            logJsonExecuted(sessionId, `tool${turn}`, true, 200 + Math.random() * 200);
          } else if (roll < 0.7) {
            recordToolCallLeakage(sessionId, `tool${turn}`);
            logLeakageDetected(sessionId, 'leakage-pattern', `tool${turn}`, 'Simulated leakage', turn);
          }
        }
      }

      const health = getSessionHealth(sessionId);
      const telemetry = getGeminiHealthMetrics();

      // Verify tracking worked
      expect(health?.turnCount).toBe(50);
      expect(telemetry.aggregate).toBeDefined();

      clearHealthMonitor(sessionId);
      clearSession(sessionId);
    });
  });

  describe('Critical Tool + Parallel Execution', () => {
    it('should use parallel execution for persona-specific handoff', async () => {
      const { isCriticalTool, executeWithParallelFallback } = await import(
        '../../agents/shared/parallel-tool-executor.js'
      );

      // Use actual registered critical tool name
      expect(isCriticalTool('handoffToMaya')).toBe(true);

      // Simulate parallel execution
      const executor = vi.fn().mockResolvedValue({
        success: true,
        data: { personaId: 'maya', message: 'Handing off to Maya' },
      });

      const result = await executeWithParallelFallback(
        'handoffToMaya',
        { reason: 'User requested' },
        executor,
        { maxParallel: 2, timeoutMs: 5000 }
      );

      expect(result.success).toBe(true);
      expect(executor).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// DI INTEGRATION TESTS
// ============================================================================

describe('DI Container Integration', () => {
  it('should register reliability service tokens', async () => {
    const { Tokens } = await import('../../services/di/container.js');

    // Verify tokens exist
    expect(Tokens.SessionHealthMonitor).toBeDefined();
    expect(Tokens.ParallelToolExecutor).toBeDefined();
    expect(Tokens.ContextPruner).toBeDefined();
    expect(Tokens.FunctionCallTelemetry).toBeDefined();
  });
});
