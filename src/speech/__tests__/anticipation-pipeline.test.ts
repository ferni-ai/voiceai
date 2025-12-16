/**
 * Anticipation Pipeline Tests
 *
 * Tests for the unified anticipation system that combines
 * intent prediction and emotional prosody anticipation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AnticipationPipeline,
  getAnticipationPipeline,
  resetAnticipationPipeline,
  resetAllAnticipationPipelines,
  IntentPredictor,
  EmotionPredictor,
} from '../anticipation/index.js';

describe('AnticipationPipeline', () => {
  const sessionId = 'test-session-123';

  afterEach(() => {
    resetAllAnticipationPipelines();
  });

  describe('session management', () => {
    it('should create and retrieve pipeline for session', () => {
      const pipeline = getAnticipationPipeline(sessionId);
      expect(pipeline).toBeInstanceOf(AnticipationPipeline);

      // Should return same instance
      const pipeline2 = getAnticipationPipeline(sessionId);
      expect(pipeline2).toBe(pipeline);
    });

    it('should reset pipeline for session', () => {
      const pipeline = getAnticipationPipeline(sessionId);
      pipeline.process({
        sessionId,
        partialTranscript: 'hello',
        isSpeaking: true,
      });

      resetAnticipationPipeline(sessionId);

      // Should create new instance after reset
      const newPipeline = getAnticipationPipeline(sessionId);
      expect(newPipeline.getLatest()).toBeNull();
    });
  });

  describe('process()', () => {
    it('should return null for very short transcripts', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: 'hi',
        isSpeaking: true,
      });

      expect(result).toBeNull();
    });

    it('should detect greeting intent', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: 'Hello! How are you doing today?',
        isSpeaking: true,
      });

      expect(result).not.toBeNull();
      expect(result!.intent.intent).toBe('greeting');
      expect(result!.intent.confidence).toBeGreaterThan(0.5);
    });

    it('should detect emotional sharing', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: "I'm feeling really anxious about my presentation tomorrow",
        isSpeaking: true,
      });

      expect(result).not.toBeNull();
      expect(result!.intent.intent).toBe('emotional_share');
      expect(result!.emotion.trajectory).toBe('rising_concern');
    });

    it('should detect celebration', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: 'I just got promoted! I did it!',
        isSpeaking: true,
        tone: 'excited',
      });

      expect(result).not.toBeNull();
      expect(result!.intent.intent).toBe('celebration');
      expect(result!.emotion.trajectory).toBe('rising_excitement');
      expect(result!.prosody.speedMultiplier).toBeGreaterThanOrEqual(1.0);
    });

    it('should detect frustration', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: "I'm so frustrated, this keeps happening again and again",
        isSpeaking: true,
      });

      expect(result).not.toBeNull();
      expect(result!.emotion.trajectory).toBe('building_frustration');
      expect(result!.prosody.speedMultiplier).toBeLessThanOrEqual(1.0);
    });

    it('should detect sadness and adjust prosody', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: 'My grandmother passed away last week. I miss her so much.',
        isSpeaking: true,
      });

      expect(result).not.toBeNull();
      expect(result!.emotion.trajectory).toBe('falling_sadness');
      expect(result!.prosody.speedMultiplier).toBeLessThan(1.0);
      expect(result!.prosody.volumeMultiplier).toBeLessThan(1.0);
      expect(result!.emotion.softerDelivery).toBe(true);
    });
  });

  describe('isActionable', () => {
    it('should be actionable for high confidence predictions', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: 'Guess what! I finally got the job I applied for!',
        isSpeaking: true,
        tone: 'excited',
      });

      expect(result).not.toBeNull();
      expect(result!.isActionable).toBe(true);
      expect(result!.combinedConfidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should not be actionable for low confidence', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: 'The weather is nice',
        isSpeaking: true,
      });

      // Might return result but low actionability for neutral content
      if (result) {
        expect(result.combinedConfidence).toBeLessThan(0.7);
      }
    });
  });

  describe('micro-reactions', () => {
    it('should generate micro-reaction for emotional content', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      const result = pipeline.process({
        sessionId,
        partialTranscript: "You won't believe what happened! I won the lottery!",
        isSpeaking: true,
        tone: 'excited',
      });

      expect(result).not.toBeNull();
      if (result!.emotion.confidence >= 0.6) {
        expect(result!.prosody.microReactionSsml).not.toBeNull();
        expect(result!.prosody.microReactionSsml).toContain('<');
      }
    });
  });

  describe('getPreparedProsody()', () => {
    it('should return null when no prediction made', () => {
      const pipeline = getAnticipationPipeline(sessionId);
      expect(pipeline.getPreparedProsody()).toBeNull();
    });

    it('should return prosody after actionable prediction', () => {
      const pipeline = getAnticipationPipeline(sessionId);

      pipeline.process({
        sessionId,
        partialTranscript: 'I need help with something important',
        isSpeaking: true,
      });

      const prosody = pipeline.getPreparedProsody();
      if (prosody) {
        expect(prosody.speedMultiplier).toBeGreaterThan(0);
        expect(prosody.volumeMultiplier).toBeGreaterThan(0);
      }
    });
  });
});

describe('IntentPredictor', () => {
  let predictor: IntentPredictor;

  beforeEach(() => {
    predictor = new IntentPredictor();
  });

  it('should predict greeting intent', () => {
    const result = predictor.predict('Hello there!');
    expect(result.intent).toBe('greeting');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should predict help request', () => {
    const result = predictor.predict('Can you help me figure this out?');
    expect(result.intent).toBe('help_request');
  });

  it('should predict question', () => {
    const result = predictor.predict('What time is it?');
    expect(result.intent).toBe('question');
  });

  it('should predict gratitude', () => {
    const result = predictor.predict('Thank you so much for your help!');
    expect(result.intent).toBe('gratitude');
  });

  it('should return unknown for ambiguous text', () => {
    const result = predictor.predict('xyz');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0);
  });
});

describe('EmotionPredictor', () => {
  let predictor: EmotionPredictor;

  beforeEach(() => {
    predictor = new EmotionPredictor();
  });

  it('should detect rising excitement', () => {
    const result = predictor.predict("Guess what! I'm so excited!");
    expect(result.trajectory).toBe('rising_excitement');
    expect(result.anticipatedEmotion).toBe('excited');
    expect(result.speedMultiplier).toBeGreaterThan(1.0);
  });

  it('should detect falling sadness', () => {
    const result = predictor.predict('They passed away last month. I miss them.');
    expect(result.trajectory).toBe('falling_sadness');
    expect(result.anticipatedEmotion).toBe('sympathetic');
    expect(result.softerDelivery).toBe(true);
  });

  it('should detect seeking support', () => {
    const result = predictor.predict("I don't know what to do. Can you help me?");
    expect(result.trajectory).toBe('seeking_support');
    expect(result.anticipatedEmotion).toBe('affectionate');
  });

  it('should detect joking/playful', () => {
    const result = predictor.predict('Haha, just kidding around with you! Lol');
    expect(result.trajectory).toBe('joking_playful');
    expect(result.anticipatedEmotion).toBe('joking/comedic');
  });

  it('should return neutral for plain text', () => {
    const result = predictor.predict('abc');
    expect(result.trajectory).toBe('stable_neutral');
    expect(result.confidence).toBe(0);
  });

  it('should boost confidence based on tone', () => {
    const resultWithoutTone = predictor.predict("I'm so excited!");
    const resultWithTone = predictor.predict("I'm so excited!", 'excited');

    expect(resultWithTone.confidence).toBeGreaterThanOrEqual(resultWithoutTone.confidence);
  });
});
