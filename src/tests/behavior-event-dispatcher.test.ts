/**
 * Behavior Event Dispatcher Tests
 *
 * Tests the bidirectional behavior system that:
 * - Detects system events and dispatches to LLM
 * - Formats events for LLM consumption
 * - Creates behavior signals for frontend
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock safe-logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  dispatchBehaviorEvents,
  injectBehaviorEvents,
  emitBehaviorSignal,
  createModeShiftSignal,
  createPacingChangeSignal,
  createHoldSpaceSignal,
  createProcessingSignal,
  DETECTION_THRESHOLDS,
  type BehaviorDetectionContext,
} from '../agents/realtime/behavior-event-dispatcher.js';
import type { BehaviorEvent, BehaviorSignal } from '../types/behavior-types.js';

describe('BehaviorEventDispatcher', () => {
  let mockInjectMessage: ReturnType<typeof vi.fn>;
  let mockSendDataMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockInjectMessage = vi.fn();
    mockSendDataMessage = vi.fn().mockResolvedValue(undefined);
  });

  describe('dispatchBehaviorEvents', () => {
    it('should return empty array when no events detected', () => {
      const ctx: BehaviorDetectionContext = {};
      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events).toEqual([]);
      expect(mockInjectMessage).not.toHaveBeenCalled();
    });

    it('should detect voice tremor', () => {
      const ctx: BehaviorDetectionContext = {
        voiceAnalysis: {
          tremorDetected: true,
          tremorIntensity: 0.6,
        },
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.event === 'voice_tremor_detected')).toBe(true);
    });

    it('should NOT detect weak voice tremor', () => {
      const ctx: BehaviorDetectionContext = {
        voiceAnalysis: {
          tremorDetected: true,
          tremorIntensity: 0.2, // Below threshold
        },
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'voice_tremor_detected')).toBe(false);
    });

    it('should detect extended silence', () => {
      const ctx: BehaviorDetectionContext = {
        silenceDuration: 15000, // 15 seconds
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'extended_silence')).toBe(true);
    });

    it('should detect long silence with different context', () => {
      const ctx: BehaviorDetectionContext = {
        silenceDuration: 25000, // 25 seconds (long)
        emotionalState: {
          primary: 'sad',
          intensity: 0.7,
          distressLevel: 0.4,
        },
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);
      const silenceEvent = events.find((e) => e.event === 'extended_silence');

      expect(silenceEvent).toBeDefined();
      expect(silenceEvent?.data.isLongSilence).toBe(true);
    });

    it('should detect emotional shift', () => {
      const ctx: BehaviorDetectionContext = {
        emotionalState: {
          primary: 'sad',
          intensity: 0.8,
          distressLevel: 0.5,
        },
        previousEmotionalState: {
          primary: 'neutral',
          intensity: 0.3,
        },
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'emotional_shift')).toBe(true);
    });

    it('should detect late night', () => {
      const ctx: BehaviorDetectionContext = {
        hourOfDay: 2, // 2 AM
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'late_night_detected')).toBe(true);
    });

    it('should NOT detect late night during day', () => {
      const ctx: BehaviorDetectionContext = {
        hourOfDay: 14, // 2 PM
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'late_night_detected')).toBe(false);
    });

    it('should detect energy drop', () => {
      const ctx: BehaviorDetectionContext = {
        voiceAnalysis: {
          energyLevel: 0.2, // Low energy
        },
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'energy_drop')).toBe(true);
    });

    it('should detect heavy topic weight', () => {
      const ctx: BehaviorDetectionContext = {
        topicWeight: 'heavy',
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'topic_weight_heavy')).toBe(true);
    });

    it('should detect vulnerability shared', () => {
      const ctx: BehaviorDetectionContext = {
        emotionalState: {
          primary: 'sad',
          intensity: 0.8,
          distressLevel: 0.7, // High distress
        },
        topicWeight: 'heavy',
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'vulnerability_shared')).toBe(true);
    });

    it('should detect user interrupted', () => {
      const ctx: BehaviorDetectionContext = {
        userInterrupted: true,
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'user_interrupted')).toBe(true);
    });

    it('should detect tool started', () => {
      const ctx: BehaviorDetectionContext = {
        toolStatus: {
          inProgress: true,
          toolName: 'rememberAboutUser',
          startTime: Date.now(),
        },
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(events.some((e) => e.event === 'tool_started')).toBe(true);
    });

    it('should inject events into LLM context when events detected', () => {
      const ctx: BehaviorDetectionContext = {
        hourOfDay: 2, // Late night
      };

      dispatchBehaviorEvents(ctx, mockInjectMessage);

      expect(mockInjectMessage).toHaveBeenCalled();
      expect(mockInjectMessage).toHaveBeenCalledWith(
        'system',
        expect.stringContaining('[SYSTEM_EVENT]')
      );
    });

    it('should include suggested responses in events', () => {
      const ctx: BehaviorDetectionContext = {
        voiceAnalysis: {
          tremorDetected: true,
          tremorIntensity: 0.6,
        },
      };

      const events = dispatchBehaviorEvents(ctx, mockInjectMessage);
      const tremorEvent = events.find((e) => e.event === 'voice_tremor_detected');

      expect(tremorEvent?.suggestedResponse).toBeDefined();
      expect(tremorEvent?.suggestedResponse?.mode).toBe('presence');
    });
  });

  describe('injectBehaviorEvents', () => {
    it('should not call inject for empty events', () => {
      injectBehaviorEvents([], mockInjectMessage);
      expect(mockInjectMessage).not.toHaveBeenCalled();
    });

    it('should format events as JSON for LLM', () => {
      const events: BehaviorEvent[] = [
        {
          event: 'late_night_detected',
          data: { hour: 2 },
          timestamp: Date.now(),
          suggestedResponse: { pacing: 'slower' },
        },
      ];

      injectBehaviorEvents(events, mockInjectMessage);

      expect(mockInjectMessage).toHaveBeenCalledWith(
        'system',
        expect.stringContaining('"late_night_detected"')
      );
    });
  });

  describe('Signal Creation Functions', () => {
    describe('createModeShiftSignal', () => {
      it('should create valid mode shift signal', () => {
        const signal = createModeShiftSignal('deep_listening', 'User sharing something heavy');

        expect(signal.type).toBe('mode_shift');
        expect(signal.mode).toBe('deep_listening');
        expect(signal.reason).toBe('User sharing something heavy');
        expect(signal.timestamp).toBeDefined();
      });
    });

    describe('createPacingChangeSignal', () => {
      it('should create valid pacing change signal', () => {
        const signal = createPacingChangeSignal('slower', 'Late night');

        expect(signal.type).toBe('pacing_change');
        expect(signal.pacing).toBe('slower');
        expect(signal.reason).toBe('Late night');
      });
    });

    describe('createHoldSpaceSignal', () => {
      it('should create valid hold space signal', () => {
        const signal = createHoldSpaceSignal(5000, 'After heavy share');

        expect(signal.type).toBe('hold_space');
        expect(signal.duration).toBe(5000);
        expect(signal.reason).toBe('After heavy share');
      });
    });

    describe('createProcessingSignal', () => {
      it('should create processing start signal', () => {
        const signal = createProcessingSignal(true, 'thinking');

        expect(signal.type).toBe('processing_start');
        expect(signal.expression).toBe('thinking');
      });

      it('should create processing end signal', () => {
        const signal = createProcessingSignal(false);

        expect(signal.type).toBe('processing_end');
      });
    });
  });

  describe('emitBehaviorSignal', () => {
    it('should call sendDataMessage with signal', async () => {
      const signal: BehaviorSignal = {
        type: 'mode_shift',
        mode: 'presence',
        timestamp: Date.now(),
      };

      await emitBehaviorSignal(signal, mockSendDataMessage);

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'behavior_signal',
        expect.objectContaining({
          type: 'mode_shift',
          mode: 'presence',
        })
      );
    });

    it('should handle sendDataMessage errors gracefully', async () => {
      mockSendDataMessage.mockRejectedValueOnce(new Error('Connection failed'));

      const signal: BehaviorSignal = {
        type: 'mode_shift',
        mode: 'presence',
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(emitBehaviorSignal(signal, mockSendDataMessage)).resolves.not.toThrow();
    });
  });

  describe('DETECTION_THRESHOLDS', () => {
    it('should have all required thresholds', () => {
      expect(DETECTION_THRESHOLDS.voiceTremor.minIntensity).toBeDefined();
      expect(DETECTION_THRESHOLDS.extendedSilence.minDuration).toBeDefined();
      expect(DETECTION_THRESHOLDS.emotionalShift.minIntensityChange).toBeDefined();
      expect(DETECTION_THRESHOLDS.lateNight.startHour).toBeDefined();
      expect(DETECTION_THRESHOLDS.energyDrop.threshold).toBeDefined();
    });

    it('should have sensible threshold values', () => {
      expect(DETECTION_THRESHOLDS.voiceTremor.minIntensity).toBeGreaterThan(0);
      expect(DETECTION_THRESHOLDS.voiceTremor.minIntensity).toBeLessThanOrEqual(1);
      expect(DETECTION_THRESHOLDS.extendedSilence.minDuration).toBeGreaterThan(5000);
      expect(DETECTION_THRESHOLDS.lateNight.startHour).toBeGreaterThanOrEqual(20);
    });
  });
});
