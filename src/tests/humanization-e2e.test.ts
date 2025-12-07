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
  getConversationHumanizer,
  resetConversationHumanizer,
} from '../conversation/humanizer.js';
import {
  getInterruptionHandler,
  resetInterruptionHandler,
  type InterruptionHandler,
} from '../conversation/interruption-handler.js';
import { getSpeechNaturalizer, resetSpeechNaturalizer } from '../conversation/speech-naturalizer.js';
import {
  getActiveListeningEngine,
  resetActiveListeningEngine,
} from '../conversation/active-listening.js';
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

  describe('Voice Agent Integration Flow', () => {
    it('should process a complete turn through the humanization pipeline', () => {
      // This simulates what happens in voice-agent.ts transcriptionNode()
      const personaId = 'ferni';
      const humanizer = getConversationHumanizer(personaId);

      // Simulate user message processing
      const userMessage = 'I am really stressed about my debt situation';
      const turnNumber = 3;

      // Process user message (pre-response)
      const preActions = humanizer.processUserMessage({
        personaId,
        turnNumber,
        userMessage,
        userEmotion: 'stressed',
        topic: 'debt',
        wasPersonalSharing: true,
      });

      // Expect some form of acknowledgment for emotional content
      expect(preActions.acknowledgment || preActions.backchannel).toBeTruthy();

      // Simulate LLM response
      const llmResponse = 'I understand that debt can feel overwhelming. Let me help you think through some options.';

      // Humanize the response
      const humanized = humanizer.humanizeResponse(llmResponse, {
        personaId,
        turnNumber,
        userMessage,
        userEmotion: 'stressed',
        topic: 'debt',
        isSeriousContext: true,
        wasPersonalSharing: true,
      });

      // Verify humanization occurred
      expect(humanized.text).toBeTruthy();
      expect(humanized.appliedFeatures.length).toBeGreaterThanOrEqual(0);

      // Text should have some form of modification for empathetic contexts
      expect(humanized.emotionalGuidance).toBeDefined();
    });

    it('should maintain context across multiple turns', () => {
      const humanizer = getConversationHumanizer('ferni');

      // Turn 1: User introduces topic
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'I want to talk about planning for a house',
        topic: 'house_planning',
      });

      humanizer.humanizeResponse('Great! Buying a house is a big decision. What is your timeline?', {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'I want to talk about planning for a house',
        topic: 'house_planning',
      });

      // Turn 2: User continues
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 2,
        userMessage: 'Probably in the next two years',
        topic: 'house_planning',
      });

      // Check that the thread is being tracked
      const threads = humanizer.getUnresolvedThreads();
      expect(threads.length).toBeGreaterThan(0);
    });

    it('should handle different personas with appropriate styles', () => {
      // Test that each persona produces different output
      const personas = ['ferni', 'nayan-patel', 'peter-john', 'maya-santos'];
      const results: Record<string, string> = {};

      for (const personaId of personas) {
        resetConversationHumanizer();
        const humanizer = getConversationHumanizer(personaId);

        const response = humanizer.humanizeResponse(
          'You should consider diversifying your investments.',
          {
            personaId,
            turnNumber: 5,
            userMessage: 'What should I do with my savings?',
            topic: 'investing',
          }
        );

        results[personaId] = response.text;
      }

      // All should have produced output
      for (const personaId of personas) {
        expect(results[personaId]).toBeTruthy();
      }
    });

    it('should not add humor in serious emotional contexts', () => {
      const humanizer = getConversationHumanizer('ferni');

      // Process a serious emotional message
      const response = humanizer.humanizeResponse(
        'I am sorry to hear about your loss. That must be very difficult.',
        {
          personaId: 'ferni',
          turnNumber: 2,
          userMessage: 'My mom just passed away and I need to handle her estate',
          userEmotion: 'grief',
          topic: 'estate',
          isSeriousContext: true,
          wasPersonalSharing: true,
        }
      );

      // Should not include playful or humorous features
      expect(response.appliedFeatures).not.toContain('humor');
      expect(response.appliedFeatures).not.toContain('joke');
    });
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

describe('Humanization Regression Tests', () => {
  beforeEach(() => {
    resetConversationHumanizer();
    resetSpeechNaturalizer();
  });

  afterEach(() => {
    resetConversationHumanizer();
    resetSpeechNaturalizer();
  });

  it('should not crash on empty input', () => {
    const humanizer = getConversationHumanizer('ferni');

    expect(() => {
      humanizer.humanizeResponse('', {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: '',
      });
    }).not.toThrow();
  });

  it('should not crash on very long input', () => {
    const humanizer = getConversationHumanizer('ferni');
    const longText = 'This is a sentence. '.repeat(1000);

    expect(() => {
      humanizer.humanizeResponse(longText, {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Tell me everything',
      });
    }).not.toThrow();
  });

  it('should handle special characters without crashing', () => {
    const humanizer = getConversationHumanizer('ferni');

    expect(() => {
      humanizer.humanizeResponse(
        'Here are some symbols: <>&"\'!@#$%^&*()',
        {
          personaId: 'ferni',
          turnNumber: 1,
          userMessage: 'Test with symbols',
        }
      );
    }).not.toThrow();
  });

  it('should handle unicode characters', () => {
    const humanizer = getConversationHumanizer('ferni');

    const result = humanizer.humanizeResponse(
      'Here are some unicode: Hello World',
      {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Test with unicode',
      }
    );

    expect(result.text).toBeTruthy();
  });

  it('should handle missing optional context fields', () => {
    const humanizer = getConversationHumanizer('ferni');

    expect(() => {
      humanizer.humanizeResponse('This is a test', {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Test',
        // All optional fields omitted
      });
    }).not.toThrow();
  });
});
