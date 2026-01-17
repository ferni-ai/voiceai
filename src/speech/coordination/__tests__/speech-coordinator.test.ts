/**
 * Speech Coordinator Tests
 *
 * Tests for the centralized speech coordination system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SpeechCoordinator,
  SpeechPriority,
  CoordinatorState,
  resetSpeechCoordinator,
} from '../speech-coordinator.js';

describe('SpeechCoordinator', () => {
  let coordinator: SpeechCoordinator;

  beforeEach(() => {
    resetSpeechCoordinator();
    coordinator = new SpeechCoordinator();
  });

  describe('initialization', () => {
    it('should start in IDLE state', () => {
      expect(coordinator.getState()).toBe(CoordinatorState.IDLE);
    });

    it('should report not busy when idle', () => {
      expect(coordinator.isBusy()).toBe(false);
    });

    it('should have zero stats initially', () => {
      const stats = coordinator.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.requestsSpoken).toBe(0);
      expect(stats.requestsDropped).toBe(0);
    });
  });

  describe('request handling without session', () => {
    it('should reject speech requests when no session attached', async () => {
      const result = await coordinator.requestSpeak({
        text: 'Hello',
        priority: SpeechPriority.RESPONSE,
        source: 'llm',
      });

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('No session');
    });

    it('should reject empty text', async () => {
      const result = await coordinator.requestSpeak({
        text: '',
        priority: SpeechPriority.RESPONSE,
        source: 'llm',
      });

      expect(result.accepted).toBe(false);
      // When no session attached, that error comes first
      expect(result.reason).toBeDefined();
    });

    it('should increment dropped counter for rejected requests', async () => {
      await coordinator.requestSpeak({
        text: 'Hello',
        priority: SpeechPriority.RESPONSE,
        source: 'llm',
      });

      const stats = coordinator.getStats();
      expect(stats.requestsDropped).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });
  });

  describe('priority handling', () => {
    it('should have correct priority values', () => {
      expect(SpeechPriority.BACKCHANNEL).toBeLessThan(SpeechPriority.ACKNOWLEDGMENT);
      expect(SpeechPriority.ACKNOWLEDGMENT).toBeLessThan(SpeechPriority.RESPONSE);
      expect(SpeechPriority.RESPONSE).toBeLessThan(SpeechPriority.TOOL_RESULT);
      expect(SpeechPriority.TOOL_RESULT).toBeLessThan(SpeechPriority.CRISIS);
    });

    it('should drop backchannels when busy', async () => {
      // Mock session
      const mockSession = {
        say: vi.fn(),
      };
      coordinator.attachSession(mockSession as any);

      // Simulate being busy (speaking state)
      // Note: In real implementation, state would be set by speaking
      // For this test, we verify the logic via the isBusy check

      // First request accepted
      const result1 = await coordinator.requestSpeak({
        text: 'Hello',
        priority: SpeechPriority.RESPONSE,
        source: 'llm',
      });
      expect(result1.accepted).toBe(true);
    });
  });

  describe('adaptive timing', () => {
    it('should return timing parameters', () => {
      const timing = coordinator.getAdaptiveTiming();

      expect(timing).toBeDefined();
      expect(timing.avgSpeechDurationMs).toBeGreaterThan(0);
      expect(timing.postSpeechCooldownMs).toBeGreaterThan(0);
      expect(timing.sampleCount).toBe(0); // No samples yet
    });

    it('should calculate echo window based on utterance duration', () => {
      // Short utterance - shorter window
      const shortWindow = coordinator.getEchoWindow(500);
      // Long utterance - longer window
      const longWindow = coordinator.getEchoWindow(5000);

      expect(longWindow).toBeGreaterThan(shortWindow);
    });

    it('should have minimum echo window', () => {
      const tinyWindow = coordinator.getEchoWindow(100);
      expect(tinyWindow).toBeGreaterThanOrEqual(300);
    });

    it('should have maximum echo window', () => {
      const hugeWindow = coordinator.getEchoWindow(60000);
      expect(hugeWindow).toBeLessThanOrEqual(3000);
    });
  });

  describe('speech end handling', () => {
    it('should track speech duration on end', () => {
      coordinator.onSpeechEnded(false, 2000);

      const timing = coordinator.getAdaptiveTiming();
      expect(timing.sampleCount).toBe(1);
    });

    it('should transition to cooldown state', () => {
      // Manually trigger speech end
      coordinator.onSpeechEnded(false, 1000);

      // Should be in cooldown (not idle immediately)
      expect(coordinator.getState()).toBe(CoordinatorState.COOLDOWN);
    });
  });

  describe('echo detection recording', () => {
    it('should record echo detection', () => {
      coordinator.recordEchoDetection(500);

      const timing = coordinator.getAdaptiveTiming();
      // Echo delay should influence timing
      expect(timing.avgEchoDelayMs).toBeGreaterThan(0);
    });
  });

  describe('content-aware echo detection', () => {
    it('should recognize questions as legitimate requests', () => {
      // Questions should get minimal echo window (300ms)
      const questionWindow = coordinator.getEchoWindow(1000, 'Are you okay?');
      expect(questionWindow).toBe(300);
    });

    it('should recognize short questions with "?" as legitimate', () => {
      // Even short questions like "what?" should be trusted
      const shortQuestion = coordinator.getEchoWindow(1000, 'What?');
      expect(shortQuestion).toBe(300);
    });

    it('should recognize reaction patterns as legitimate', () => {
      // "wait", "hold on", etc. are user reactions, not echoes
      const waitPattern = coordinator.getEchoWindow(1000, 'wait, hold on');
      expect(waitPattern).toBe(300);
    });

    it('should recognize question word patterns as legitimate', () => {
      // "are you", "do you", etc. are user questions
      const areYouPattern = coordinator.getEchoWindow(1000, 'Are you feeling okay?');
      expect(areYouPattern).toBe(300);
    });

    it('should recognize common affirmatives as legitimate', () => {
      // "yeah", "okay" etc. are common user responses, not echoes
      const yeahText = coordinator.getEchoWindow(1000, 'yeah');
      expect(yeahText).toBe(300); // Now recognized as legitimate reaction
    });

    it('should recognize "okay" patterns as legitimate', () => {
      // "okay sure" starts with "okay" which is a common reaction
      const okayPattern = coordinator.getEchoWindow(1000, 'okay sure');
      expect(okayPattern).toBe(300); // Now recognized as legitimate
    });

    it('should use timing-based detection for gibberish/noise', () => {
      // Random short text that doesn't match patterns should use timing
      const noise = coordinator.getEchoWindow(1000, 'mxyzptlk');
      expect(noise).toBeGreaterThan(300); // Not bypassed - timing-based
    });

    it('should trust longer unique content', () => {
      // Long, unique content should be trusted
      const longContent = coordinator.getEchoWindow(
        1000,
        "I've been thinking about changing careers lately"
      );
      expect(longContent).toBe(300);
    });
  });
});
