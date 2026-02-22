/**
 * Generate Reply Gateway Tests
 *
 * Tests for the centralized generateReply gateway that handles:
 * - Session readiness tracking
 * - Debouncing rapid calls
 * - Fallback TTS on errors
 * - Priority-based handling
 *
 * Run with: pnpm vitest run src/agents/shared/__tests__/generate-reply-gateway.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock the logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock speech coordination
const mockCoordinatedSay = vi.fn();
vi.mock('../../../speech/coordination/index.js', () => ({
  coordinatedSay: (...args: unknown[]) => mockCoordinatedSay(...args),
}));

// Mock Higgs pipeline provider (for Higgs full-loop raw-audio tests)
vi.mock('../../../speech/tts-gateway/providers/higgs-pipeline.js', () => ({
  getHiggsPipelineProvider: vi.fn(),
}));

// ============================================================================
// IMPORT AFTER MOCKS
// ============================================================================

import {
  generateReply,
  prewarmSessionAsync,
  isSessionReady,
  markSessionReady,
  resetSessionState,
  getGatewayStats,
  registerSessionForReconnection,
  type GenerateReplyOptions,
  type GenerateReplyResult,
} from '../generate-reply-gateway.js';
import { getHiggsPipelineProvider } from '../../../speech/tts-gateway/providers/higgs-pipeline.js';

// ============================================================================
// MOCK SESSION FACTORY
// ============================================================================

interface MockGenerateReplyHandle {
  waitForPlayout: () => Promise<void>;
}

interface MockSession {
  generateReply: Mock;
  say: Mock;
  on: Mock;
  off: Mock;
}

function createMockSession(options?: {
  generateReplyDelay?: number;
  generateReplyError?: Error;
  waitForPlayoutError?: Error;
}): MockSession {
  const { generateReplyDelay = 10, generateReplyError, waitForPlayoutError } = options || {};

  return {
    generateReply: vi.fn().mockImplementation(() => {
      if (generateReplyError) {
        throw generateReplyError;
      }
      return {
        waitForPlayout: vi.fn().mockImplementation(async () => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, generateReplyDelay);
          });
          if (waitForPlayoutError) {
            throw waitForPlayoutError;
          }
        }),
      };
    }),
    say: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Generate Reply Gateway', () => {
  let mockSession: MockSession;
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = createMockSession();
    // Reset gateway state between tests
    resetSessionState(testSessionId);
  });

  // ==========================================================================
  // BASIC FUNCTIONALITY
  // ==========================================================================

  describe('Basic Functionality', () => {
    it('should call session.generateReply with correct parameters', async () => {
      // Mark session as ready first
      markSessionReady(testSessionId);

      const options: GenerateReplyOptions = {
        instructions: 'Say hello',
        context: 'test',
      };

      const result = await generateReply(mockSession as any, testSessionId, options);

      expect(mockSession.generateReply).toHaveBeenCalledWith({
        instructions: 'Say hello',
        allowInterruptions: true,
      });
      expect(result.success).toBe(true);
    });

    it('should return success when generateReply succeeds', async () => {
      markSessionReady(testSessionId);

      const result = await generateReply(mockSession as any, testSessionId, {
        instructions: 'Test instruction',
        context: 'test',
      });

      expect(result.success).toBe(true);
      expect(result.usedFallback).toBe(false);
      expect(result.error).toBeUndefined();
    });
  });

  // ==========================================================================
  // SESSION READINESS
  // ==========================================================================

  describe('Session Readiness', () => {
    it('should initially report session as not ready', () => {
      expect(isSessionReady(testSessionId)).toBe(false);
    });

    it('should report session as ready after markSessionReady', () => {
      markSessionReady(testSessionId);
      expect(isSessionReady(testSessionId)).toBe(true);
    });

    it('should skip low priority calls when session is not ready', async () => {
      // Session not ready (no markSessionReady call)

      const result = await generateReply(mockSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
        priority: 'low',
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.error).toContain('not ready');
      expect(mockSession.generateReply).not.toHaveBeenCalled();
    });

    it('should allow normal priority calls when session is ready', async () => {
      markSessionReady(testSessionId);

      const result = await generateReply(mockSession as any, testSessionId, {
        instructions: 'Normal message',
        context: 'test',
        priority: 'normal',
      });

      expect(mockSession.generateReply).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // DEBOUNCING
  // ==========================================================================

  describe('Debouncing', () => {
    it('should debounce second call within 500ms', async () => {
      markSessionReady(testSessionId);

      // First call
      const result1 = await generateReply(mockSession as any, testSessionId, {
        instructions: 'First',
        context: 'test',
      });

      // Immediate second call (within debounce window)
      const result2 = await generateReply(mockSession as any, testSessionId, {
        instructions: 'Second',
        context: 'test',
      });

      expect(result1.success).toBe(true);
      expect(result2.debounced).toBe(true);
      expect(result2.success).toBe(false);
      expect(mockSession.generateReply).toHaveBeenCalledTimes(1);
    });

    it('should not debounce high priority calls', async () => {
      markSessionReady(testSessionId);

      // First call
      const result1 = await generateReply(mockSession as any, testSessionId, {
        instructions: 'First',
        context: 'test',
      });

      // Immediate high priority call
      const result2 = await generateReply(mockSession as any, testSessionId, {
        instructions: 'High priority',
        context: 'test',
        priority: 'high',
      });

      expect(result1.success).toBe(true);
      expect(result2.debounced).toBeFalsy();
      expect(mockSession.generateReply).toHaveBeenCalledTimes(2);
    });

    it('should allow calls after debounce window', async () => {
      markSessionReady(testSessionId);

      // First call
      const result1 = await generateReply(mockSession as any, testSessionId, {
        instructions: 'First',
        context: 'test',
      });

      // Wait for debounce window
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 600);
      });

      // Second call
      const result2 = await generateReply(mockSession as any, testSessionId, {
        instructions: 'Second',
        context: 'test',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockSession.generateReply).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  // ==========================================================================
  // ERROR HANDLING & FALLBACK
  // ==========================================================================

  describe('Error Handling & Fallback', () => {
    it('should use fallback TTS when generateReply throws', async () => {
      markSessionReady(testSessionId);
      const errorSession = createMockSession({
        generateReplyError: new Error('Gemini timeout'),
      });

      const result = await generateReply(errorSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
        fallbackMessage: 'Fallback message',
      });

      expect(result.success).toBe(false);
      expect(result.usedFallback).toBe(true);
      expect(mockCoordinatedSay).toHaveBeenCalledWith(testSessionId, 'Fallback message', {
        allowInterruptions: true,
      });
    });

    it('should use fallback TTS when waitForPlayout fails', async () => {
      markSessionReady(testSessionId);
      const errorSession = createMockSession({
        waitForPlayoutError: new Error('Playout failed'),
      });

      const result = await generateReply(errorSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
        fallbackMessage: 'Fallback after playout error',
      });

      expect(result.success).toBe(false);
      expect(result.usedFallback).toBe(true);
      expect(mockCoordinatedSay).toHaveBeenCalledWith(
        testSessionId,
        'Fallback after playout error',
        { allowInterruptions: true }
      );
    });

    it('should not use fallback when none provided', async () => {
      markSessionReady(testSessionId);
      const errorSession = createMockSession({
        generateReplyError: new Error('Gemini timeout'),
      });

      const result = await generateReply(errorSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
        // No fallbackMessage
      });

      expect(result.success).toBe(false);
      expect(result.usedFallback).toBe(false);
      expect(mockCoordinatedSay).not.toHaveBeenCalled();
    });

    it('should include error message in result', async () => {
      markSessionReady(testSessionId);
      const errorSession = createMockSession({
        generateReplyError: new Error('Specific error message'),
      });

      const result = await generateReply(errorSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
      });

      expect(result.error).toContain('Specific error message');
    });
  });

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  describe('Gateway Statistics', () => {
    it('should track successful calls', async () => {
      markSessionReady(testSessionId);

      await generateReply(mockSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
      });

      const stats = getGatewayStats(testSessionId);
      expect(stats.totalCalls).toBe(1);
      expect(stats.successfulCalls).toBe(1);
    });

    it('should track failed calls', async () => {
      markSessionReady(testSessionId);
      const errorSession = createMockSession({
        generateReplyError: new Error('Test error'),
      });

      await generateReply(errorSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
      });

      const stats = getGatewayStats(testSessionId);
      expect(stats.failedCalls).toBe(1);
    });

    it('should track debounced calls', async () => {
      markSessionReady(testSessionId);

      // Make two rapid calls
      await generateReply(mockSession as any, testSessionId, {
        instructions: '1',
        context: 'test',
      });
      await generateReply(mockSession as any, testSessionId, {
        instructions: '2',
        context: 'test',
      });

      const stats = getGatewayStats(testSessionId);
      expect(stats.debouncedCalls).toBe(1);
    });

    it('should track skipped calls', async () => {
      // Session not ready

      await generateReply(mockSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
        priority: 'low',
      });

      const stats = getGatewayStats(testSessionId);
      expect(stats.skippedCalls).toBe(1);
    });
  });

  // ==========================================================================
  // STATE RESET
  // ==========================================================================

  describe('State Reset', () => {
    it('should reset session state completely', async () => {
      markSessionReady(testSessionId);
      expect(isSessionReady(testSessionId)).toBe(true);

      resetSessionState(testSessionId);

      expect(isSessionReady(testSessionId)).toBe(false);
    });

    it('should reset statistics', async () => {
      markSessionReady(testSessionId);

      // Make some calls
      await generateReply(mockSession as any, testSessionId, {
        instructions: 'Test',
        context: 'test',
      });

      const statsBefore = getGatewayStats(testSessionId);
      expect(statsBefore.totalCalls).toBeGreaterThan(0);

      resetSessionState(testSessionId);

      const statsAfter = getGatewayStats(testSessionId);
      expect(statsAfter.totalCalls).toBe(0);
    });
  });

  // ==========================================================================
  // CIRCUIT BREAKER
  // ==========================================================================

  describe('Circuit Breaker', () => {
    it('should open circuit after 3 failures', async () => {
      markSessionReady(testSessionId);
      const errorSession = createMockSession({
        generateReplyError: new Error('Fail'),
      });

      // Fail 3 times with high priority to avoid debounce
      for (let i = 0; i < 3; i++) {
        await generateReply(errorSession as any, testSessionId, {
          instructions: `Fail ${i + 1}`,
          context: 'test',
          priority: 'high', // High priority bypasses debounce
        });
      }

      // Circuit should now be open
      const result = await generateReply(errorSession as any, testSessionId, {
        instructions: 'Should be blocked',
        context: 'test',
        priority: 'high', // High priority to bypass debounce
      });

      expect(result.error).toContain('Circuit breaker open');
    });
  });
});

// ============================================================================
// INTEGRATION-STYLE TESTS
// ============================================================================

describe('Gateway Integration Scenarios', () => {
  let mockSession: MockSession;
  const testSessionId = 'integration-test-session';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = createMockSession();
    resetSessionState(testSessionId);
  });

  it('should handle full lifecycle: not ready -> ready -> calls', async () => {
    // 1. Session starts not ready
    expect(isSessionReady(testSessionId)).toBe(false);

    // 2. Low priority call is skipped (doesn't update lastCallAt because it's skipped)
    const earlyResult = await generateReply(mockSession as any, testSessionId, {
      instructions: 'Early call',
      context: 'test',
      priority: 'low',
    });
    expect(earlyResult.skipped).toBe(true);

    // 3. Mark session ready
    markSessionReady(testSessionId);
    expect(isSessionReady(testSessionId)).toBe(true);

    // 4. Normal calls now work (use high priority to bypass any debounce)
    const normalResult = await generateReply(mockSession as any, testSessionId, {
      instructions: 'Normal call',
      context: 'test',
      priority: 'high', // Use high priority to bypass debounce
    });
    expect(normalResult.success).toBe(true);
  });

  it('should handle error recovery with fallback', async () => {
    markSessionReady(testSessionId);

    // Create session that fails
    const failingSession = createMockSession({
      generateReplyError: new Error('First call fails'),
    });

    // Call fails, uses fallback
    const result = await generateReply(failingSession as any, testSessionId, {
      instructions: 'Test 1',
      context: 'test',
      fallbackMessage: 'Fallback 1',
    });

    expect(result.success).toBe(false);
    expect(result.usedFallback).toBe(true);
    expect(mockCoordinatedSay).toHaveBeenCalledWith(testSessionId, 'Fallback 1', {
      allowInterruptions: true,
    });
  });

  it('should prevent timeout flood by debouncing silence handler calls', async () => {
    markSessionReady(testSessionId);

    // Simulate rapid fire calls from silence handler
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        await generateReply(mockSession as any, testSessionId, {
          instructions: `Silence response ${i}`,
          context: 'silence-handler',
          priority: 'low',
        })
      );
    }

    // First should succeed, rest should be debounced
    expect(results[0].success).toBe(true);
    expect(results.slice(1).every((r) => r.debounced)).toBe(true);

    // Should only have called generateReply once
    expect(mockSession.generateReply).toHaveBeenCalledTimes(1);

    const stats = getGatewayStats(testSessionId);
    expect(stats.debouncedCalls).toBe(4);
  });

  // ==========================================================================
  // HIGGS FULL LOOP: raw-audio play handler
  // ==========================================================================

  describe('Higgs full loop (raw-audio path)', () => {
    const originalTtsProvider = process.env.TTS_PROVIDER;

    afterEach(() => {
      process.env.TTS_PROVIDER = originalTtsProvider;
      vi.mocked(getHiggsPipelineProvider).mockReset();
    });

    it('plays Higgs reply audio via raw-audio handler and calls captureFrame', async () => {
      process.env.TTS_PROVIDER = 'higgs-pipeline';

      const captureFrame = vi.fn().mockResolvedValue(undefined);
      const flush = vi.fn();

      const sessionWithAudio = {
        ...createMockSession(),
        output: {
          audio: {
            captureFrame,
            flush,
          },
        },
      };

      registerSessionForReconnection(testSessionId, sessionWithAudio as any);

      vi.mocked(getHiggsPipelineProvider).mockReturnValue({
        isGenerateReplyAvailable: vi.fn().mockResolvedValue(true),
        generateReply: vi.fn().mockResolvedValue({
          buffer: new ArrayBuffer(320),
          sampleRate: 24000,
        }),
      } as any);

      markSessionReady(testSessionId);

      const result = await generateReply(
        sessionWithAudio as any,
        testSessionId,
        {
          instructions: 'Say hi',
          context: 'test',
          transcript: 'User said hello',
        }
      );

      expect(result.success).toBe(true);
      expect(result.usedFallback).toBe(false);
      expect(captureFrame).toHaveBeenCalled();
      expect(captureFrame.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(flush).toHaveBeenCalled();
    });
  });
});
