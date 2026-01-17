/**
 * Ferni TTS Core Tests
 *
 * Tests for the Ferni TTS TypeScript client.
 * Note: Integration tests require the Ferni TTS service to be running.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFerniTTS,
  FerniTTS,
  buildFerniSuperhumanContext,
  getFerniTTSVoiceIdForPersona,
  cartesiaVoiceToFerniTTS,
  FERNI_TTS_VOICE_IDS,
  type FerniSuperhumanContext,
} from '../ferni-tts-core.js';

describe('FerniTTS', () => {
  describe('createFerniTTS', () => {
    it('should create a FerniTTS instance with default options', () => {
      const tts = createFerniTTS('ferni');

      expect(tts).toBeInstanceOf(FerniTTS);
      expect(tts.voiceId).toBe('ferni');
      expect(tts.sampleRate).toBe(24000);
      expect(tts.numChannels).toBe(1);
    });

    it('should create a FerniTTS instance with custom options', () => {
      const tts = createFerniTTS('peter', {
        endpoint: 'http://custom:9000',
        sampleRate: 48000,
      });

      expect(tts.voiceId).toBe('peter');
      expect(tts.sampleRate).toBe(48000);
      expect(tts.endpoint).toBe('http://custom:9000');
    });
  });

  describe('stream()', () => {
    it('should create a streaming synthesis session', () => {
      const tts = createFerniTTS('ferni');
      const stream = tts.stream();

      expect(stream).toBeDefined();
      expect(typeof stream.pushText).toBe('function');
      expect(typeof stream.endInput).toBe('function');
      expect(typeof stream.updateInputStream).toBe('function');
      expect(typeof stream.close).toBe('function');
    });
  });

  describe('setSuperhumanContext', () => {
    it('should set superhuman context', () => {
      const tts = createFerniTTS('ferni');
      const context: FerniSuperhumanContext = {
        userLocalHour: 14,
        relationshipStage: 0.7,
        userEnergy: 0.6,
      };

      // Should not throw
      expect(() => tts.setSuperhumanContext(context)).not.toThrow();
    });
  });
});

describe('buildFerniSuperhumanContext', () => {
  it('should return empty context when no options provided', () => {
    const context = buildFerniSuperhumanContext();

    expect(context).toEqual({
      userLocalHour: undefined,
      relationshipStage: undefined,
      userEnergy: undefined,
      userEmotion: undefined,
      topicSensitivity: undefined,
      emotionalTrajectory: undefined,
      turnNumber: undefined,
      userSpeakingRate: undefined,
      rememberedEntities: undefined,
    });
  });

  it('should calculate user local hour from timezone', () => {
    // Use a fixed timezone for testing
    const context = buildFerniSuperhumanContext({
      userTimezone: 'America/New_York',
    });

    // Should be a number between 0-23
    expect(typeof context.userLocalHour).toBe('number');
    expect(context.userLocalHour).toBeGreaterThanOrEqual(0);
    expect(context.userLocalHour).toBeLessThan(24);
  });

  it('should handle invalid timezone gracefully', () => {
    const context = buildFerniSuperhumanContext({
      userTimezone: 'Invalid/Timezone',
    });

    expect(context.userLocalHour).toBeUndefined();
  });

  it('should calculate relationship stage from days and interactions', () => {
    // No interactions = 0 relationship stage
    const context1 = buildFerniSuperhumanContext({
      relationshipDays: 0,
      totalInteractions: 0,
    });
    expect(context1.relationshipStage).toBe(0);

    // Max values (1 year, 100 interactions) = 1.0 stage
    const context2 = buildFerniSuperhumanContext({
      relationshipDays: 365,
      totalInteractions: 100,
    });
    expect(context2.relationshipStage).toBe(1.0);

    // Partial values
    const context3 = buildFerniSuperhumanContext({
      relationshipDays: 183, // ~half year = 0.5 * 0.4 = 0.2
      totalInteractions: 50, // half of 100 = 0.5 * 0.6 = 0.3
    });
    // Expected: 0.2 + 0.3 = 0.5
    expect(context3.relationshipStage).toBeCloseTo(0.5, 1);
  });

  it('should build emotion tuple correctly', () => {
    const context = buildFerniSuperhumanContext({
      userEmotion: 'joy',
      userEmotionIntensity: 0.8,
    });

    expect(context.userEmotion).toEqual(['joy', 0.8]);
  });

  it('should not include emotion if intensity missing', () => {
    const context = buildFerniSuperhumanContext({
      userEmotion: 'joy',
      // userEmotionIntensity not provided
    });

    expect(context.userEmotion).toBeUndefined();
  });

  it('should map remembered entities correctly', () => {
    const context = buildFerniSuperhumanContext({
      rememberedEntities: [
        { name: 'Sarah', type: 'person', familiarity: 0.9, sentiment: 0.7 },
        { name: 'Project X', type: 'project', familiarity: 0.5, sentiment: 0.3 },
      ],
    });

    expect(context.rememberedEntities).toHaveLength(2);
    expect(context.rememberedEntities?.[0]).toEqual({
      name: 'Sarah',
      entityType: 'person',
      familiarity: 0.9,
      emotionalValence: 0.7,
    });
  });
});

describe('Voice ID Mapping', () => {
  describe('getFerniTTSVoiceIdForPersona', () => {
    it('should map persona IDs to Ferni voice IDs', () => {
      expect(getFerniTTSVoiceIdForPersona('ferni')).toBe('ferni');
      expect(getFerniTTSVoiceIdForPersona('Ferni')).toBe('ferni');
      expect(getFerniTTSVoiceIdForPersona('peter-john')).toBe('peter');
      expect(getFerniTTSVoiceIdForPersona('maya-santos')).toBe('maya');
      expect(getFerniTTSVoiceIdForPersona('alex-chen')).toBe('alex');
      expect(getFerniTTSVoiceIdForPersona('jordan-taylor')).toBe('jordan');
      expect(getFerniTTSVoiceIdForPersona('nayan-patel')).toBe('nayan');
    });

    it('should default to ferni for unknown personas', () => {
      expect(getFerniTTSVoiceIdForPersona('unknown')).toBe('ferni');
      expect(getFerniTTSVoiceIdForPersona('')).toBe('ferni');
    });
  });

  describe('cartesiaVoiceToFerniTTS', () => {
    it('should map Cartesia UUIDs to Ferni voice IDs', () => {
      expect(cartesiaVoiceToFerniTTS('fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc')).toBe('ferni');
      expect(cartesiaVoiceToFerniTTS('3f04e815-3260-4f50-8fd9-af9c657be4c2')).toBe('peter');
    });

    it('should default to ferni for unknown UUIDs', () => {
      expect(cartesiaVoiceToFerniTTS('unknown-uuid')).toBe('ferni');
    });
  });

  describe('FERNI_TTS_VOICE_IDS', () => {
    it('should have all persona voices', () => {
      expect(FERNI_TTS_VOICE_IDS.FERNI).toBe('ferni');
      expect(FERNI_TTS_VOICE_IDS.PETER_JOHN).toBe('peter');
      expect(FERNI_TTS_VOICE_IDS.ALEX_CHEN).toBe('alex');
      expect(FERNI_TTS_VOICE_IDS.MAYA_SANTOS).toBe('maya');
      expect(FERNI_TTS_VOICE_IDS.JORDAN_TAYLOR).toBe('jordan');
      expect(FERNI_TTS_VOICE_IDS.NAYAN_PATEL).toBe('nayan');
    });
  });
});

describe('FerniTTSSynthesizeStream', () => {
  it('should validate text before pushing', () => {
    const tts = createFerniTTS('ferni');
    const stream = tts.stream();

    // These should not throw but should be no-ops (logged as warnings)
    expect(() => stream.pushText('')).not.toThrow();
    expect(() => stream.pushText('   ')).not.toThrow();
  });

  it('should throw when pushing text after endInput', () => {
    const tts = createFerniTTS('ferni');
    const stream = tts.stream();

    stream.endInput();

    expect(() => stream.pushText('Hello')).toThrow('Cannot push text after endInput()');
  });
});
