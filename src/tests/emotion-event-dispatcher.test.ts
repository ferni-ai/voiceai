/**
 * Tests for Emotion Event Dispatcher
 *
 * Validates the backend→frontend EQ bridge that dispatches
 * humanization signals based on emotional state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchEmotionEvents,
  type EmotionDispatchOptions,
  type SendDataMessageFn,
} from '../agents/realtime/emotion-event-dispatcher.js';

describe('emotion-event-dispatcher', () => {
  let mockSendDataMessage: SendDataMessageFn;
  let sentMessages: Array<{ type: string; payload: Record<string, unknown> }>;

  beforeEach(() => {
    sentMessages = [];
    // The function takes (type: string, payload: Record<string, unknown>)
    mockSendDataMessage = vi.fn().mockImplementation((type, payload) => {
      sentMessages.push({ type, payload });
      return Promise.resolve();
    });
  });

  const createOptions = (overrides: Partial<EmotionDispatchOptions> = {}): EmotionDispatchOptions => ({
    emotionalState: {
      primary: 'neutral',
      secondary: undefined,
      intensity: 0.5,
      distressLevel: 0,
      trajectory: 'stable',
      mismatch: undefined,
      confidence: 0.8,
    },
    userId: 'test-user-123',
    personaId: 'ferni',
    sessionId: 'session-456',
    ...overrides,
  });

  describe('concern detection', () => {
    it('should dispatch concern_detected when distressLevel > 0.5', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'sad',
          intensity: 0.7,
          distressLevel: 0.7,
          trajectory: 'declining',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const concernSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'concern_detected'
      );
      expect(concernSignal).toBeDefined();
      expect(concernSignal?.payload.concernLevel).toBe('elevated');
    });

    it('should not dispatch concern when distressLevel is low', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'happy',
          intensity: 0.8,
          distressLevel: 0.1,
          trajectory: 'improving',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const concernSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'concern_detected'
      );
      expect(concernSignal).toBeUndefined();
    });

    it('should classify concern levels correctly', async () => {
      // Mild concern (0.3-0.5)
      const mildOptions = createOptions({
        emotionalState: {
          primary: 'anxious',
          intensity: 0.5,
          distressLevel: 0.4,
          trajectory: 'stable',
          confidence: 0.8,
        },
      });

      await dispatchEmotionEvents(mildOptions, mockSendDataMessage);

      const mildSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'concern_detected'
      );
      expect(mildSignal?.payload.concernLevel).toBe('mild');
    });
  });

  describe('voice state detection', () => {
    it('should dispatch voice_state_detected when mismatch exists', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'happy',
          intensity: 0.6,
          distressLevel: 0,
          trajectory: 'stable',
          mismatch: {
            hasMismatch: true,
            type: 'masking_negative',
            confidence: 0.85,
            voiceEmotion: 'sad',
            textEmotion: 'happy',
          },
          confidence: 0.8,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const voiceSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'voice_state_detected'
      );
      expect(voiceSignal).toBeDefined();
      expect(voiceSignal?.payload.voiceState).toBe('masking_negative');
      expect(voiceSignal?.payload.mismatchType).toBe('masking_negative');
    });

    it('should not dispatch voice state without mismatch', async () => {
      const options = createOptions();

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const voiceSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'voice_state_detected'
      );
      expect(voiceSignal).toBeUndefined();
    });

    it('should not dispatch voice state when confidence is low', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'happy',
          intensity: 0.6,
          distressLevel: 0,
          trajectory: 'stable',
          mismatch: {
            hasMismatch: true,
            type: 'masking_negative',
            confidence: 0.3, // Below 0.5 threshold
            voiceEmotion: 'sad',
            textEmotion: 'happy',
          },
          confidence: 0.8,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const voiceSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'voice_state_detected'
      );
      expect(voiceSignal).toBeUndefined();
    });
  });

  describe('emotional trajectory', () => {
    it('should dispatch emotional_trajectory when declining with high intensity', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'sad',
          intensity: 0.7, // Above 0.5 threshold
          distressLevel: 0.2,
          trajectory: 'declining',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const trajectorySignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'emotional_trajectory'
      );
      expect(trajectorySignal).toBeDefined();
      // Declining maps to 'escalating' in the implementation
      expect(trajectorySignal?.payload.emotionalTrajectory).toBe('escalating');
    });

    it('should dispatch emotional_trajectory when improving with high intensity', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'happy',
          intensity: 0.8, // Above 0.6 threshold for improving
          distressLevel: 0,
          trajectory: 'improving',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const trajectorySignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'emotional_trajectory'
      );
      expect(trajectorySignal).toBeDefined();
      // Improving maps to 'de_escalating' in the implementation
      expect(trajectorySignal?.payload.emotionalTrajectory).toBe('de_escalating');
    });

    it('should dispatch volatile trajectory', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          trajectory: 'volatile',
          confidence: 0.8,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const trajectorySignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'emotional_trajectory'
      );
      expect(trajectorySignal).toBeDefined();
      expect(trajectorySignal?.payload.emotionalTrajectory).toBe('volatile');
    });

    it('should not dispatch trajectory when stable', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          trajectory: 'stable',
          confidence: 0.8,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const trajectorySignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'emotional_trajectory'
      );
      expect(trajectorySignal).toBeUndefined();
    });
  });

  describe('high engagement', () => {
    it('should dispatch high_engagement when excited with high intensity', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'excited', // Must be 'excited' specifically
          intensity: 0.9, // Above 0.7 threshold
          distressLevel: 0,
          trajectory: 'stable',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const engagementSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'high_engagement'
      );
      expect(engagementSignal).toBeDefined();
      expect(engagementSignal?.payload.intensity).toBe(0.9);
    });

    it('should not dispatch high_engagement for happy (not excited)', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'happy', // Not 'excited'
          intensity: 0.9,
          distressLevel: 0,
          trajectory: 'stable',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const engagementSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'high_engagement'
      );
      expect(engagementSignal).toBeUndefined();
    });

    it('should not dispatch high_engagement when intensity is low', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'excited',
          intensity: 0.5, // Below 0.7 threshold
          distressLevel: 0,
          trajectory: 'stable',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      const engagementSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'high_engagement'
      );
      expect(engagementSignal).toBeUndefined();
    });
  });

  describe('message format', () => {
    it('should include required metadata in all messages', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'anxious',
          intensity: 0.6,
          distressLevel: 0.6,
          trajectory: 'declining',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      // Should have at least concern and trajectory signals
      expect(sentMessages.length).toBeGreaterThan(0);

      sentMessages.forEach((msg) => {
        if (msg.type === 'humanization_signal') {
          expect(msg.payload).toHaveProperty('signalType');
          expect(msg.payload).toHaveProperty('timestamp');
          expect(typeof msg.payload.timestamp).toBe('number');
        }
      });
    });

    it('should dispatch multiple signals when conditions are met', async () => {
      const options = createOptions({
        emotionalState: {
          primary: 'anxious',
          intensity: 0.8,
          distressLevel: 0.6,
          trajectory: 'declining',
          confidence: 0.9,
        },
      });

      await dispatchEmotionEvents(options, mockSendDataMessage);

      // Should have both concern and trajectory signals
      const signalTypes = sentMessages.map((m) => m.payload.signalType);
      expect(signalTypes).toContain('concern_detected');
      expect(signalTypes).toContain('emotional_trajectory');
    });
  });

  describe('error handling', () => {
    it('should not throw on sendDataMessage failure', async () => {
      const failingSend = vi.fn().mockRejectedValue(new Error('Network error'));

      const options = createOptions({
        emotionalState: {
          primary: 'sad',
          intensity: 0.8,
          distressLevel: 0.7,
          trajectory: 'declining',
          confidence: 0.9,
        },
      });

      // Should not throw
      await expect(dispatchEmotionEvents(options, failingSend)).resolves.not.toThrow();
    });
  });
});
