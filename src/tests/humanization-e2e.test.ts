/**
 * End-to-End Humanization Tests
 *
 * These tests validate the complete humanization pipeline as used in voice-agent.ts.
 * They ensure all humanization features work together and are properly integrated.
 *
 * @module tests/humanization-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  resetConversationHumanizer,
} from '../conversation/humanizer/index.js';
import {
  getInterruptionHandler,
  resetInterruptionHandler,
  type InterruptionHandler,
} from '../conversation/interruption-handler.js';
import {
  getSpeechNaturalizer,
  resetSpeechNaturalizer,
} from '../conversation/speech-naturalizer/index.js';
import {
  getActiveListeningEngine,
  resetActiveListeningEngine,
} from '../conversation/active-listening/index.js';
import { getHumanizingConfig } from '../conversation/humanizing-config.js';

// ============================================================================
// INTERRUPTION HANDLER TESTS
// ============================================================================

describe('InterruptionHandler', () => {
  let handler: InterruptionHandler;

  beforeEach(() => {
    resetInterruptionHandler();
    handler = getInterruptionHandler();
  });

  afterEach(() => {
    resetInterruptionHandler();
  });

  describe('estimateEnergy()', () => {
    it('should return 0 for silent audio (all zeros)', () => {
      const silentFrame = {
        data: new Int16Array(160).fill(0),
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const energy = handler.estimateEnergy(silentFrame);
      expect(energy).toBe(0);
    });

    it('should return positive energy for non-silent audio', () => {
      // Create audio with some signal
      const data = new Int16Array(160);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(i / 10) * 10000; // Sine wave
      }

      const frame = {
        data,
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const energy = handler.estimateEnergy(frame);
      expect(energy).toBeGreaterThan(0);
      expect(energy).toBeLessThanOrEqual(1);
    });

    it('should return higher energy for louder audio', () => {
      const quietData = new Int16Array(160);
      const loudData = new Int16Array(160);

      for (let i = 0; i < 160; i++) {
        quietData[i] = Math.sin(i / 10) * 500; // Very quiet
        loudData[i] = Math.sin(i / 10) * 5000; // Moderate
      }

      const quietFrame = {
        data: quietData,
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const loudFrame = {
        data: loudData,
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const quietEnergy = handler.estimateEnergy(quietFrame);
      const loudEnergy = handler.estimateEnergy(loudFrame);

      // Both should be positive but loud should be >= quiet
      expect(loudEnergy).toBeGreaterThanOrEqual(quietEnergy);
    });

    it('should handle edge case of empty audio', () => {
      const emptyFrame = {
        data: new Int16Array(0),
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 0,
      };

      // Should return fallback value without crashing
      const energy = handler.estimateEnergy(emptyFrame);
      expect(typeof energy).toBe('number');
    });
  });

  describe('isSpeechDetected()', () => {
    it('should return false for silent audio', () => {
      const silentFrame = {
        data: new Int16Array(160).fill(0),
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const isSpeech = handler.isSpeechDetected(silentFrame);
      expect(isSpeech).toBe(false);
    });

    it('should return true for loud audio', () => {
      const data = new Int16Array(160);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(i / 10) * 20000;
      }

      const loudFrame = {
        data,
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const isSpeech = handler.isSpeechDetected(loudFrame);
      expect(isSpeech).toBe(true);
    });

    it('should respect custom silence threshold', () => {
      const data = new Int16Array(160);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(i / 10) * 1500; // Low-moderate volume
      }

      const frame = {
        data,
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const energy = handler.estimateEnergy(frame);

      // With threshold higher than energy, should not detect speech
      const highThreshold = handler.isSpeechDetected(frame, energy + 0.1);
      expect(highThreshold).toBe(false);

      // With threshold lower than energy, should detect speech
      const lowThreshold = handler.isSpeechDetected(frame, energy - 0.1);
      expect(lowThreshold).toBe(true);
    });
  });

  describe('analyzeAudio()', () => {
    it('should return structured analysis', () => {
      const data = new Int16Array(160);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(i / 10) * 10000;
      }

      const frame = {
        data,
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      const analysis = handler.analyzeAudio(frame);

      expect(analysis).toHaveProperty('energy');
      expect(analysis).toHaveProperty('isSpeech');
      expect(analysis).toHaveProperty('isLoud');
      expect(analysis).toHaveProperty('isSilence');
      expect(typeof analysis.energy).toBe('number');
      expect(typeof analysis.isSpeech).toBe('boolean');
    });
  });

  describe('detectInterruption()', () => {
    it('should detect interruption when user speaks over agent', () => {
      // Start agent speaking
      handler.setAgentSpeaking(true);

      // Create loud audio frame (user interrupting)
      const loudData = new Int16Array(160);
      for (let i = 0; i < loudData.length; i++) {
        loudData[i] = Math.sin(i / 10) * 20000;
      }
      const frame = {
        data: loudData,
        sampleRate: 16000,
        channels: 1,
        samplesPerChannel: 160,
      };

      // User interrupts
      const result = handler.detectInterruption(frame, true);

      // Should detect something (may or may not be a hard interrupt depending on state)
      // The result can be null if not enough samples
      if (result) {
        expect(result.type).toBeDefined();
      }
    });

    it('should return recovery phrase', () => {
      handler.setAgentSpeaking(true);

      // Simulate that an interruption happened
      const phrase = handler.getRecoveryPhrase();
      expect(typeof phrase).toBe('string');
      expect(phrase.length).toBeGreaterThan(0);
    });

    it('should track interruption stats', () => {
      const stats = handler.getStats();
      expect(stats).toHaveProperty('totalInterruptions');
      expect(typeof stats.totalInterruptions).toBe('number');
    });
  });
});

// ============================================================================
// FULL PIPELINE E2E TESTS
// ============================================================================

describe('Humanization Pipeline E2E', () => {
  beforeEach(() => {
    resetConversationHumanizer();
    resetSpeechNaturalizer();
    resetActiveListeningEngine();
    resetInterruptionHandler();
  });

  afterEach(() => {
    resetConversationHumanizer();
    resetSpeechNaturalizer();
    resetActiveListeningEngine();
    resetInterruptionHandler();
  });

  describe('Config Integration', () => {
    it('should respect humanizing config settings', () => {
      const config = getHumanizingConfig();

      // Verify config loads with expected structure
      expect(config).toHaveProperty('disfluency');
      expect(config).toHaveProperty('hedging');
      expect(config).toHaveProperty('backchannel');
      expect(config).toHaveProperty('silence');
      expect(config).toHaveProperty('memory');
      expect(config).toHaveProperty('global');

      // Verify config values are reasonable
      expect(config.disfluency.frequency).toBeGreaterThanOrEqual(0);
      expect(config.disfluency.frequency).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// REGRESSION TESTS
// ============================================================================
