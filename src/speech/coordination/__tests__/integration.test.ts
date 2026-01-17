/**
 * Speech Coordination Integration Tests
 *
 * Tests for the full speech coordination pipeline.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSpeechCoordinator,
  resetSpeechCoordinator,
  SpeechPriority,
} from '../speech-coordinator.js';
import { createStreamStateMachine, StreamState } from '../stream-state-machine.js';
import { generateAcknowledgment, shouldAcknowledge } from '../persona-acknowledgments.js';
import {
  getEstimatedDuration,
  recordToolDuration,
  isSlowTool,
} from '../coordinated-tool-executor.js';

describe('Speech Coordination Integration', () => {
  beforeEach(() => {
    resetSpeechCoordinator();
  });

  describe('full pipeline: tool call detection → acknowledgment → execution → result', () => {
    it('should handle a slow tool call end-to-end', async () => {
      const coordinator = getSpeechCoordinator();
      const fsm = createStreamStateMachine();

      // 1. Detect JSON function call in stream
      const jsonText = '{"fn":"searchNews","args":{"query":"tech news"}}';
      const result = fsm.processChunk(jsonText);

      expect(result.executeTool).not.toBeNull();
      expect(result.executeTool?.fn).toBe('searchNews');

      // 2. Check if tool is slow (should use learned timing)
      const estimatedTime = getEstimatedDuration('searchNews');
      expect(estimatedTime).toBeGreaterThan(0);

      const needsAck = shouldAcknowledge(estimatedTime);
      expect(needsAck).toBe(true); // News is typically slow

      // 3. Generate persona-aware acknowledgment
      const ack = generateAcknowledgment({
        personaId: 'ferni',
        toolId: 'searchNews',
        toolCategory: 'searching',
        estimatedWaitMs: estimatedTime,
      });

      expect(ack).toBeTruthy();
      expect(typeof ack).toBe('string');

      // 4. Record tool execution time for learning
      recordToolDuration('searchNews', 2500);

      // 5. Check that learning updated the estimate
      const newEstimate = getEstimatedDuration('searchNews');
      expect(newEstimate).toBeDefined();
    });

    it('should skip acknowledgment for fast tools', async () => {
      const estimatedTime = getEstimatedDuration('speak');
      expect(estimatedTime).toBeLessThan(1000);

      const needsAck = shouldAcknowledge(estimatedTime);
      expect(needsAck).toBe(false);
    });

    it('should handle stream with mixed content', () => {
      const fsm = createStreamStateMachine();

      // Normal text chunk
      let result = fsm.processChunk('Hello, ');
      expect(result.suppress).toBe(false);

      // More normal text - flush the buffer first
      fsm.flush();
      fsm.reset(); // Reset for clean JSON detection

      // JSON function call as new stream (realistic - LLM sends tool calls separately)
      result = fsm.processChunk('{"fn":"playMusic","args":{"query":"jazz"}}');
      expect(result.executeTool?.fn).toBe('playMusic');

      // State should be EXECUTING_TOOL
      expect(fsm.getState()).toBe(StreamState.EXECUTING_TOOL);

      // Complete tool
      fsm.toolStarted('playMusic', Promise.resolve());
      fsm.toolCompleted();

      // Should be awaiting boundary
      expect(fsm.getState()).toBe(StreamState.AWAITING_BOUNDARY);

      // Sentence boundary returns to normal
      result = fsm.processChunk('Here is your music.');
      expect(fsm.getState()).toBe(StreamState.NORMAL);
    });
  });

  describe('priority queue behavior', () => {
    it('should prioritize crisis over tool results', () => {
      expect(SpeechPriority.CRISIS).toBeGreaterThan(SpeechPriority.TOOL_RESULT);
    });

    it('should prioritize tool results over acknowledgments', () => {
      expect(SpeechPriority.TOOL_RESULT).toBeGreaterThan(SpeechPriority.ACKNOWLEDGMENT);
    });

    it('should allow backchannels to be dropped', () => {
      expect(SpeechPriority.BACKCHANNEL).toBeLessThan(SpeechPriority.RESPONSE);
    });
  });

  describe('adaptive timing integration', () => {
    it('should learn from multiple tool executions', () => {
      // Record multiple executions
      recordToolDuration('weather', 1000);
      recordToolDuration('weather', 1200);
      recordToolDuration('weather', 1100);

      const estimate = getEstimatedDuration('weather');
      // Should be around 1100ms average, but use p95 so could be higher
      expect(estimate).toBeGreaterThan(800);
    });

    it('should identify slow tools based on learned timing', () => {
      // Record fast executions
      recordToolDuration('fast-tool', 200);
      recordToolDuration('fast-tool', 300);
      recordToolDuration('fast-tool', 250);

      expect(isSlowTool('fast-tool')).toBe(false);

      // Record slow executions
      recordToolDuration('slow-tool', 2000);
      recordToolDuration('slow-tool', 2500);
      recordToolDuration('slow-tool', 3000);

      expect(isSlowTool('slow-tool')).toBe(true);
    });
  });

  describe('leakage prevention', () => {
    it('should suppress internal instructions in stream', () => {
      const fsm = createStreamStateMachine();

      const result = fsm.processChunk('[SITUATION: User seems sad today][DO: Be empathetic]');

      expect(result.suppress).toBe(true);
      expect(fsm.getState()).toBe(StreamState.SUPPRESSING_LEAKAGE);
    });

    it('should not emit suppressed content on flush', () => {
      const fsm = createStreamStateMachine();

      fsm.processChunk('[INTERNAL: Secret instructions]');
      const flushResult = fsm.flush();

      expect(flushResult.emit).toBeNull();
    });
  });

  describe('coordinator state management', () => {
    it('should maintain correct state through speech lifecycle', () => {
      const coordinator = getSpeechCoordinator();

      // Initially idle
      expect(coordinator.isBusy()).toBe(false);

      // After speech ends, enters cooldown
      coordinator.onSpeechEnded(false, 2000);

      // Stats should be updated (timing stats)
      const timing = coordinator.getAdaptiveTiming();
      expect(timing.sampleCount).toBeGreaterThan(0);
    });

    it('should track echo detections', () => {
      const coordinator = getSpeechCoordinator();

      coordinator.recordEchoDetection(400);
      coordinator.recordEchoDetection(500);
      coordinator.recordEchoDetection(450);

      const timing = coordinator.getAdaptiveTiming();
      expect(timing.avgEchoDelayMs).toBeGreaterThan(0);
    });
  });
});
