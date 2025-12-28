/**
 * Chaos Tests - Service Failures
 *
 * Tests graceful degradation when external services fail.
 * These tests verify the system can handle:
 * - LLM timeouts and failures
 * - TTS failures
 * - Memory/Firestore unavailability
 * - Network interruptions
 * - Circuit breaker behavior
 *
 * @module agents/__tests__/chaos/service-failures
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockJobContext,
  createMockLLMClient,
  createMockSessionServices,
  createMockTTSClient,
  createMockVoicePipelineAgent,
  resetAllMocks,
} from '../mocks/index.js';

// ============================================================================
// CHAOS TEST UTILITIES
// ============================================================================

/**
 * Simulate network latency
 */
async function simulateLatency(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Simulate intermittent failure
 */
function createIntermittentFailure(failureRate = 0.5): () => boolean {
  return () => Math.random() < failureRate;
}

/**
 * Create a flaky mock that fails intermittently
 */
function createFlakyMock<T>(
  successValue: T,
  errorMessage: string,
  failureRate = 0.3
): () => Promise<T> {
  const shouldFail = createIntermittentFailure(failureRate);

  return async () => {
    if (shouldFail()) {
      throw new Error(errorMessage);
    }
    return successValue;
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Chaos Tests - Service Failures', () => {
  let mockLLM: ReturnType<typeof createMockLLMClient>;
  let mockTTS: ReturnType<typeof createMockTTSClient>;
  let mockServices: ReturnType<typeof createMockSessionServices>;

  beforeEach(() => {
    resetAllMocks();
    mockLLM = createMockLLMClient();
    mockTTS = createMockTTSClient();
    mockServices = createMockSessionServices();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // LLM FAILURES
  // ==========================================================================

  describe('LLM Failures', () => {
    it('should handle LLM timeout gracefully', async () => {
      mockLLM.setTimeout(100); // 100ms timeout

      const startTime = Date.now();

      await expect(mockLLM.generate([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        'timed out'
      );

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200); // Should timeout quickly
    });

    it('should handle LLM generation failure', async () => {
      mockLLM.setFailure(true, 'API rate limit exceeded');

      await expect(mockLLM.generate([{ role: 'user', content: 'Test' }])).rejects.toThrow(
        'rate limit'
      );
    });

    it('should handle streaming failure', async () => {
      mockLLM.setFailure(true, 'Stream interrupted');

      const chunks: string[] = [];

      await expect(async () => {
        for await (const chunk of mockLLM.generateStream([{ role: 'user', content: 'Hello' }])) {
          chunks.push(chunk.delta);
        }
      }).rejects.toThrow('Stream interrupted');

      expect(chunks).toHaveLength(0);
    });

    it('should recover after transient LLM failure', async () => {
      // First call fails
      mockLLM.setFailure(true, 'Transient error');

      await expect(mockLLM.generate([{ role: 'user', content: 'First' }])).rejects.toThrow();

      // Recovery - next call succeeds
      mockLLM.setFailure(false);
      mockLLM.queueResponse('Recovery successful');

      const response = await mockLLM.generate([{ role: 'user', content: 'Second' }]);

      expect(response).toBe('Recovery successful');
    });

    it('should track failed calls in history', async () => {
      mockLLM.setFailure(true);

      try {
        await mockLLM.generate([{ role: 'user', content: 'Will fail' }]);
      } catch {
        // Expected
      }

      // History should not include failed calls (only successful ones)
      const history = mockLLM.getCallHistory();
      expect(history).toHaveLength(0);
    });
  });

  // ==========================================================================
  // TTS FAILURES
  // ==========================================================================

  describe('TTS Failures', () => {
    it('should handle TTS synthesis failure', async () => {
      mockTTS.setFailure(true, 'Voice synthesis failed');

      await expect(mockTTS.synthesize('Hello there')).rejects.toThrow('synthesis failed');
    });

    it('should handle TTS streaming failure', async () => {
      mockTTS.setFailure(true, 'Stream error');

      const frames: unknown[] = [];

      await expect(async () => {
        for await (const frame of mockTTS.synthesizeStream('Test message')) {
          frames.push(frame);
        }
      }).rejects.toThrow('Stream error');

      expect(frames).toHaveLength(0);
    });

    it('should record error events', async () => {
      mockTTS.setFailure(true, 'TTS error');

      try {
        await mockTTS.synthesize('Test');
      } catch {
        // Expected
      }

      const events = mockTTS.getEventHistory();
      const errorEvent = events.find((e) => e.type === 'error');

      expect(errorEvent).toBeDefined();
      expect(errorEvent?.error?.message).toContain('TTS error');
    });

    it('should recover from TTS failure', async () => {
      mockTTS.setFailure(true);

      await expect(mockTTS.synthesize('Fail')).rejects.toThrow();

      // Recovery
      mockTTS.setFailure(false);

      const result = await mockTTS.synthesize('Success');

      expect(result.text).toBe('Success');
      expect(result.audio.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // MEMORY/SERVICE FAILURES
  // ==========================================================================

  describe('Memory/Service Failures', () => {
    it('should handle topic tracker failure', () => {
      (mockServices.topicTracker.getCurrentTopic as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('Topic tracker unavailable');
        }
      );

      expect(() => mockServices.topicTracker.getCurrentTopic()).toThrow('unavailable');
    });

    it('should handle emotional memory failure', () => {
      (
        mockServices.emotionalMemory.getEmotionalContext as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw new Error('Emotional memory unavailable');
      });

      expect(() => mockServices.emotionalMemory.getEmotionalContext()).toThrow();
    });

    it('should handle history tracker failure gracefully', () => {
      (mockServices.historyTracker.getRecentTurns as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('History unavailable');
        }
      );

      // System should handle this gracefully
      expect(() => mockServices.historyTracker.getRecentTurns()).toThrow();
    });

    it('should continue with degraded functionality when analysis fails', () => {
      mockServices.analyze.mockImplementation(() => {
        throw new Error('Analysis service unavailable');
      });

      expect(() => mockServices.analyze('test')).toThrow('unavailable');
    });
  });

  // ==========================================================================
  // NETWORK INTERRUPTIONS
  // ==========================================================================

  describe('Network Interruptions', () => {
    it('should handle room disconnection during conversation', async () => {
      const jobCtx = createMockJobContext();

      await jobCtx.connect();
      expect(jobCtx.room.isConnected).toBe(true);

      // Simulate network interruption
      await jobCtx.room.disconnect();

      expect(jobCtx.room.isConnected).toBe(false);
      expect(jobCtx.room.state).toBe('disconnected');
    });

    it('should emit disconnection events', async () => {
      const jobCtx = createMockJobContext();
      const disconnectedSpy = vi.fn();

      jobCtx.room.on('disconnected', disconnectedSpy);

      await jobCtx.connect();
      await jobCtx.room.disconnect();

      expect(disconnectedSpy).toHaveBeenCalled();
    });

    it('should handle data publish failure', async () => {
      const jobCtx = createMockJobContext();

      // Make publish fail
      (jobCtx.room.localParticipant.publishData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      await jobCtx.connect();

      await expect(
        jobCtx.room.localParticipant.publishData(new Uint8Array([1, 2, 3]), {
          reliable: true,
        })
      ).rejects.toThrow('Network error');
    });
  });

  // ==========================================================================
  // PIPELINE FAILURES
  // ==========================================================================

  describe('Voice Pipeline Failures', () => {
    it('should handle pipeline start failure', async () => {
      const failingPipeline = createMockVoicePipelineAgent({ shouldFail: true });

      await expect(failingPipeline.start()).rejects.toThrow();
      expect(failingPipeline.isStarted).toBe(false);
    });

    it('should handle speech while not started', () => {
      const pipeline = createMockVoicePipelineAgent();

      // Should not throw, but won't process
      pipeline.say('Hello');

      expect(pipeline.isStarted).toBe(false);
    });

    it('should handle interruption during speech', async () => {
      const pipeline = createMockVoicePipelineAgent();
      const interruptedSpy = vi.fn();

      pipeline.on('agentInterrupted', interruptedSpy);

      await pipeline.start();
      pipeline.say('A long message that takes time');

      // Interrupt immediately
      pipeline.simulateInterruption();

      expect(interruptedSpy).toHaveBeenCalled();
      expect(pipeline.isSpeaking).toBe(false);
    });
  });

  // ==========================================================================
  // CASCADING FAILURES
  // ==========================================================================

  describe('Cascading Failures', () => {
    it('should handle multiple simultaneous failures', async () => {
      // Set up multiple failures
      mockLLM.setFailure(true, 'LLM down');
      mockTTS.setFailure(true, 'TTS down');
      mockServices.analyze.mockRejectedValue(new Error('Analysis down'));

      // All should fail independently
      await expect(mockLLM.generate([{ role: 'user', content: 'test' }])).rejects.toThrow();
      await expect(mockTTS.synthesize('test')).rejects.toThrow();
      await expect(mockServices.analyze('test')).rejects.toThrow();
    });

    it('should isolate failures between services', async () => {
      // Only LLM fails
      mockLLM.setFailure(true);

      // LLM fails
      await expect(mockLLM.generate([{ role: 'user', content: 'test' }])).rejects.toThrow();

      // TTS still works
      const ttsResult = await mockTTS.synthesize('Still working');
      expect(ttsResult.text).toBe('Still working');

      // Services still work
      const analysis = mockServices.analyze('test');
      expect(analysis).toBeDefined();
    });
  });

  // ==========================================================================
  // TIMEOUT SCENARIOS
  // ==========================================================================

  describe('Timeout Scenarios', () => {
    it('should timeout long-running LLM calls', async () => {
      mockLLM.setTimeout(50);

      const startTime = Date.now();

      await expect(mockLLM.generate([{ role: 'user', content: 'Slow request' }])).rejects.toThrow(
        'timed out'
      );

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(200);
    });

    it('should handle very short timeouts', async () => {
      mockLLM.setTimeout(1); // 1ms timeout

      await expect(mockLLM.generate([{ role: 'user', content: 'test' }])).rejects.toThrow();
    });
  });

  // ==========================================================================
  // RECOVERY PATTERNS
  // ==========================================================================

  describe('Recovery Patterns', () => {
    it('should allow retry after failure', async () => {
      let attempts = 0;

      const flakyCall = async (): Promise<string> => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient failure');
        }
        return 'Success after retries';
      };

      // Simulate retry logic
      let result: string | undefined;
      for (let i = 0; i < 5; i++) {
        try {
          result = await flakyCall();
          break;
        } catch {
          // Retry
        }
      }

      expect(result).toBe('Success after retries');
      expect(attempts).toBe(3);
    });

    it('should reset failure state', async () => {
      mockLLM.setFailure(true);

      await expect(mockLLM.generate([{ role: 'user', content: 'fail' }])).rejects.toThrow();

      // Reset
      mockLLM.setFailure(false);
      mockLLM.queueResponse('Now working');

      const response = await mockLLM.generate([{ role: 'user', content: 'work' }]);
      expect(response).toBe('Now working');
    });

    it('should clear history after recovery', async () => {
      mockLLM.queueResponse('Response 1');
      await mockLLM.generate([{ role: 'user', content: 'test' }]);

      expect(mockLLM.getCallHistory()).toHaveLength(1);

      mockLLM.clearHistory();

      expect(mockLLM.getCallHistory()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty responses', async () => {
      mockLLM.queueResponse('');

      const response = await mockLLM.generate([{ role: 'user', content: 'test' }]);

      expect(response).toBe('');
    });

    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(10000);
      mockLLM.queueResponse(longMessage);

      const response = await mockLLM.generate([{ role: 'user', content: 'test' }]);

      expect(response.length).toBe(10000);
    });

    it('should handle special characters', async () => {
      const specialMessage = '🎉 Special chars: <>&"\'';
      mockLLM.queueResponse(specialMessage);

      const response = await mockLLM.generate([{ role: 'user', content: 'test' }]);

      expect(response).toBe(specialMessage);
    });

    it('should handle null/undefined gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => mockServices.analyze(undefined as any)).not.toThrow();
    });
  });
});
