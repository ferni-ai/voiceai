/**
 * Speech Modules Test Suite
 *
 * Comprehensive tests for all speech module exports:
 * - emotion-matching.ts
 * - backchanneling.ts
 * - speech-context.ts
 * - music-reactions.ts
 * - response-naturalness.ts
 * - authentic-thinking.ts
 * - audio-prosody.ts
 * - adaptive-ssml.ts
 * - cognitive-speech-integration.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// EMOTION MATCHING TESTS
// ============================================================================

describe('emotion-matching', () => {
  // Mock dependencies
  vi.mock('../utils/safe-logger.js', () => {
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: () => mockLogger,
    };
    return {
      getLogger: () => mockLogger,
      createLogger: () => mockLogger,
      safeLog: () => mockLogger,
    };
  });

  let emotionMatching: typeof import('../speech/emotion-matching.js');

  beforeEach(async () => {
    emotionMatching = await import('../speech/emotion-matching.js');
  });

  describe('getEmotionModulation', () => {
    it('should return neutral modulation for null emotion', () => {
      const result = emotionMatching.getEmotionModulation(null);

      expect(result.matchedEmotion).toBe('neutral');
      expect(result.confidence).toBe(0);
      expect(result.speedAdjust).toBe(0);
      expect(result.volumeAdjust).toBe(1.0);
    });

    it('should return neutral for low confidence emotion', () => {
      const voiceEmotion = {
        primary: 'happy',
        confidence: 0.2,
        valence: 0.5,
        arousal: 0.3,
        dominance: 0,
        stressLevel: 0,
        anxietyMarkers: false,
        prosody: {} as any,
        sampleCount: 100,
        processingTimeMs: 50,
      };

      const result = emotionMatching.getEmotionModulation(voiceEmotion);
      expect(result.matchedEmotion).toBe('neutral');
    });

    it('should modulate for happy emotion with high confidence', () => {
      const voiceEmotion = {
        primary: 'happy',
        confidence: 0.8,
        valence: 0.7,
        arousal: 0.5,
        dominance: 0,
        stressLevel: 0,
        anxietyMarkers: false,
        prosody: {} as any,
        sampleCount: 100,
        processingTimeMs: 50,
      };

      const result = emotionMatching.getEmotionModulation(voiceEmotion);
      expect(result.matchedEmotion).toBe('happy');
      expect(result.confidence).toBe(0.8);
      expect(result.speedAdjust).toBeGreaterThan(0); // Faster for happy
      expect(result.volumeAdjust).toBeGreaterThan(1.0); // Louder for happy
    });

    it('should modulate for sad emotion', () => {
      const voiceEmotion = {
        primary: 'sad',
        confidence: 0.7,
        valence: -0.6,
        arousal: -0.3,
        dominance: -0.2,
        stressLevel: 0.3,
        anxietyMarkers: false,
        prosody: {} as any,
        sampleCount: 100,
        processingTimeMs: 50,
      };

      const result = emotionMatching.getEmotionModulation(voiceEmotion);
      expect(result.matchedEmotion).toBe('sad');
      expect(result.speedAdjust).toBeLessThan(0); // Slower for sad
      expect(result.volumeAdjust).toBeLessThan(1.0); // Softer for sad
    });

    it('should scale adjustments by confidence', () => {
      const lowConfidence = {
        primary: 'excited',
        confidence: 0.4,
        valence: 0.5,
        arousal: 0.6,
        dominance: 0.2,
        stressLevel: 0,
        anxietyMarkers: false,
        prosody: {} as any,
        sampleCount: 100,
        processingTimeMs: 50,
      };

      const highConfidence = { ...lowConfidence, confidence: 0.9 };

      const lowResult = emotionMatching.getEmotionModulation(lowConfidence);
      const highResult = emotionMatching.getEmotionModulation(highConfidence);

      expect(Math.abs(highResult.speedAdjust)).toBeGreaterThan(Math.abs(lowResult.speedAdjust));
    });
  });

  describe('wrapWithEmotionProsody', () => {
    it('should not wrap text for low confidence', () => {
      const text = 'Hello there';
      const modulation = {
        speedAdjust: 0.1,
        volumeAdjust: 1.1,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: {
          warmth: 'medium' as const,
          energy: 'medium' as const,
          pause: 'normal' as const,
        },
        matchedEmotion: 'happy',
        confidence: 0.3,
      };

      const result = emotionMatching.wrapWithEmotionProsody(text, modulation);
      expect(result).toBe(text);
    });

    it('should wrap with speed tag for slow rate', () => {
      const text = 'Slow down';
      const modulation = {
        speedAdjust: -0.2,
        volumeAdjust: 0.9,
        ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' },
        responseStyle: { warmth: 'high' as const, energy: 'low' as const, pause: 'more' as const },
        matchedEmotion: 'sad',
        confidence: 0.7,
      };

      const result = emotionMatching.wrapWithEmotionProsody(text, modulation);
      expect(result).toContain('<speed ratio="0.85">');
      expect(result).toContain('</speed>');
    });

    it('should wrap with volume tag for soft volume', () => {
      const text = 'Speak softly';
      const modulation = {
        speedAdjust: 0,
        volumeAdjust: 0.85,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'soft' },
        responseStyle: {
          warmth: 'high' as const,
          energy: 'medium' as const,
          pause: 'normal' as const,
        },
        matchedEmotion: 'anxious',
        confidence: 0.6,
      };

      const result = emotionMatching.wrapWithEmotionProsody(text, modulation);
      expect(result).toContain('<volume ratio="0.85">');
    });

    it('should wrap with emotion tag for high warmth', () => {
      const text = 'I care about you';
      const modulation = {
        speedAdjust: 0,
        volumeAdjust: 1.0,
        ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
        responseStyle: {
          warmth: 'high' as const,
          energy: 'medium' as const,
          pause: 'normal' as const,
        },
        matchedEmotion: 'empathetic',
        confidence: 0.8,
      };

      const result = emotionMatching.wrapWithEmotionProsody(text, modulation);
      expect(result).toContain('<emotion value="affectionate">');
    });
  });

  describe('getEmotionGuidance', () => {
    it('should return null for low confidence', () => {
      const modulation = {
        speedAdjust: 0,
        volumeAdjust: 1.0,
        ssmlHints: {},
        responseStyle: {
          warmth: 'medium' as const,
          energy: 'medium' as const,
          pause: 'normal' as const,
        },
        matchedEmotion: 'happy',
        confidence: 0.4,
      };

      const result = emotionMatching.getEmotionGuidance(modulation);
      expect(result).toBeNull();
    });

    it('should return guidance for sad user', () => {
      const modulation = {
        speedAdjust: -0.2,
        volumeAdjust: 0.9,
        ssmlHints: {},
        responseStyle: { warmth: 'high' as const, energy: 'low' as const, pause: 'more' as const },
        matchedEmotion: 'sad',
        confidence: 0.8,
      };

      const result = emotionMatching.getEmotionGuidance(modulation);
      expect(result).toContain('sad');
      expect(result).toContain('warmth');
    });

    it('should return guidance for anxious user', () => {
      const modulation = {
        speedAdjust: -0.15,
        volumeAdjust: 0.95,
        ssmlHints: {},
        responseStyle: {
          warmth: 'high' as const,
          energy: 'medium' as const,
          pause: 'more' as const,
        },
        matchedEmotion: 'anxious',
        confidence: 0.7,
      };

      const result = emotionMatching.getEmotionGuidance(modulation);
      expect(result).toContain('anxious');
      expect(result).toContain('calm');
    });
  });

  describe('adjustTTSSpeed', () => {
    it('should adjust speed within valid range', () => {
      const result = emotionMatching.adjustTTSSpeed(0, { speedAdjust: 0.5 } as any);
      expect(result).toBe(0.5);
    });

    it('should clamp to -1.0 minimum', () => {
      const result = emotionMatching.adjustTTSSpeed(-0.8, { speedAdjust: -0.5 } as any);
      expect(result).toBe(-1.0);
    });

    it('should clamp to 1.0 maximum', () => {
      const result = emotionMatching.adjustTTSSpeed(0.8, { speedAdjust: 0.5 } as any);
      expect(result).toBe(1.0);
    });
  });

  describe('registerEmotionResponse', () => {
    it('should register custom emotion response', () => {
      const customEmotion = 'custom-emotion';
      const response = {
        speedAdjust: 0.3,
        volumeAdjust: 1.2,
        ssmlHints: { prosodyRate: 'fast', prosodyPitch: 'high', prosodyVolume: 'loud' },
        responseStyle: { warmth: 'high' as const, energy: 'high' as const, pause: 'less' as const },
      };

      emotionMatching.registerEmotionResponse(customEmotion, response);

      expect(emotionMatching.isEmotionRegistered(customEmotion)).toBe(true);
      expect(emotionMatching.getRegisteredEmotions()).toContain(customEmotion);
    });
  });
});

// ============================================================================
// BACKCHANNELING TESTS
// ============================================================================

describe('backchanneling', () => {
  let backchanneling: typeof import('../speech/backchanneling.js');

  beforeEach(async () => {
    backchanneling = await import('../speech/backchanneling.js');
  });

  describe('BackchannelingSystem', () => {
    let system: any;

    beforeEach(() => {
      system = new backchanneling.BackchannelingSystem();
    });

    it('should not backchannel if minimum interval not met', () => {
      const context = {
        userHasBeenSpeaking: 10000,
        userPausedBriefly: true,
        userEmotion: {
          distressLevel: 0,
          confidence: 0.5,
          primary: 'neutral',
          intensity: 0.3,
          valence: 'neutral' as const,
        },
        topicWeight: 'medium' as const,
        lastBackchannelTime: Date.now() - 2000, // Only 2 seconds ago
      };

      const result = system.shouldBackchannel(context);
      expect(result.shouldBackchannel).toBe(false);
      expect(result.timing).toBe('never');
    });

    it('should backchannel after extended speaking time', () => {
      const context = {
        userHasBeenSpeaking: 9000, // > 8000ms threshold
        userPausedBriefly: true,
        userEmotion: {
          distressLevel: 0,
          confidence: 0.5,
          primary: 'neutral',
          intensity: 0.3,
          valence: 'neutral' as const,
        },
        topicWeight: 'medium' as const,
        lastBackchannelTime: Date.now() - 10000,
      };

      const result = system.shouldBackchannel(context);
      expect(result.shouldBackchannel).toBe(true);
      expect(result.phrase).toBeTruthy();
      expect(result.timing).toBe('after_pause');
    });

    it('should backchannel for heavy topics sooner', () => {
      const context = {
        userHasBeenSpeaking: 6000, // > 5000ms threshold for heavy
        userPausedBriefly: true,
        userEmotion: {
          distressLevel: 0.3,
          confidence: 0.5,
          primary: 'sad',
          intensity: 0.6,
          valence: 'negative' as const,
        },
        topicWeight: 'heavy' as const,
        lastBackchannelTime: Date.now() - 10000,
      };

      const result = system.shouldBackchannel(context);
      expect(result.shouldBackchannel).toBe(true);
    });

    it('should backchannel for distressed user', () => {
      const context = {
        userHasBeenSpeaking: 7000,
        userPausedBriefly: false,
        userEmotion: {
          distressLevel: 0.7,
          confidence: 0.8,
          primary: 'anxious',
          intensity: 0.8,
          valence: 'negative' as const,
        },
        topicWeight: 'medium' as const,
        lastBackchannelTime: Date.now() - 10000,
      };

      const result = system.shouldBackchannel(context);
      expect(result.shouldBackchannel).toBe(true);
    });

    it('should return empathetic backchannels for heavy topics', () => {
      const emotion = {
        distressLevel: 0.6,
        confidence: 0.7,
        primary: 'sad',
        intensity: 0.7,
        valence: 'negative' as const,
      };
      const phrase = system.getBackchannel(emotion, 'heavy' as const);

      expect(phrase).toBeTruthy();
      // Empathetic backchannels can be either volume-wrapped or a simple pause
      // '<break time="300ms"/>' is valid - sometimes silence is the most empathetic response
      expect(phrase.includes('<volume ratio') || phrase.includes('<break time')).toBe(true);
    });

    it('should track backchannel usage', () => {
      system.recordBackchannel();
      system.recordBackchannel();

      const stats = system.getStats();
      expect(stats.count).toBe(2);
      expect(stats.lastTime).toBeGreaterThan(0);
    });

    it('should reset state', () => {
      system.recordBackchannel();
      system.reset();

      const stats = system.getStats();
      expect(stats.count).toBe(0);
      expect(stats.lastTime).toBe(0);
    });
  });

  describe('session-scoped backchanneling', () => {
    it('should create separate systems per session', () => {
      const system1 = backchanneling.getSessionBackchannelingSystem('session-1');
      const system2 = backchanneling.getSessionBackchannelingSystem('session-2');

      expect(system1).toBeTruthy();
      expect(system2).toBeTruthy();
      expect(system1).not.toBe(system2);
    });

    it('should reuse same system for same session', () => {
      const system1 = backchanneling.getSessionBackchannelingSystem('session-1');
      const system2 = backchanneling.getSessionBackchannelingSystem('session-1');

      expect(system1).toBe(system2);
    });

    it('should remove session system', () => {
      const system = backchanneling.getSessionBackchannelingSystem('session-test');
      backchanneling.removeSessionBackchannelingSystem('session-test');

      // Should create new instance
      const newSystem = backchanneling.getSessionBackchannelingSystem('session-test');
      expect(newSystem).not.toBe(system);
    });
  });
});

// ============================================================================
// SPEECH CONTEXT TESTS
// ============================================================================

describe('speech-context', () => {
  let speechContext: typeof import('../speech/speech-context.js');

  beforeEach(async () => {
    speechContext = await import('../speech/speech-context.js');
  });

  describe('WPMTracker', () => {
    let tracker: any;

    beforeEach(() => {
      tracker = new speechContext.WPMTracker();
    });

    it('should start with default WPM', () => {
      expect(tracker.getAverageWPM()).toBe(150);
    });

    it('should track speaking samples', () => {
      tracker.addSample('hello world test sample', 2000); // 4 words in 2 seconds
      const wpm = tracker.getAverageWPM();
      expect(wpm).toBeGreaterThan(0);
      expect(wpm).toBeLessThan(200);
    });

    it('should calculate speed category', () => {
      tracker.addSample('word '.repeat(50), 10000); // 50 words in 10 sec = 300 WPM
      expect(tracker.getSpeedCategory()).toBe('fast');
    });

    it('should limit samples to max size', () => {
      for (let i = 0; i < 15; i++) {
        tracker.addSample('test sample', 1000);
      }
      // Should still work (max 10 samples)
      const wpm = tracker.getAverageWPM();
      expect(wpm).toBeGreaterThan(0);
    });

    it('should clear samples', () => {
      tracker.addSample('test', 1000);
      tracker.clear();
      expect(tracker.getAverageWPM()).toBe(150); // Back to default
    });

    it('should ignore zero-duration samples', () => {
      tracker.addSample('test', 0);
      expect(tracker.getAverageWPM()).toBe(150);
    });
  });

  describe('detectEnergyLevel', () => {
    it('should detect high energy', () => {
      const text = 'This is AMAZING!! I am so excited!!!';
      const energy = speechContext.detectEnergyLevel(text);
      expect(energy).toBe('high');
    });

    it('should detect low energy', () => {
      const text = 'tired... exhausted... can barely...';
      const energy = speechContext.detectEnergyLevel(text);
      expect(energy).toBe('low');
    });

    it('should detect medium energy', () => {
      const text = 'This is a normal statement.';
      const energy = speechContext.detectEnergyLevel(text);
      expect(energy).toBe('medium');
    });

    it('should consider message length', () => {
      const short = 'okay';
      const energy = speechContext.detectEnergyLevel(short);
      expect(energy).toBe('low'); // Short messages suggest low energy
    });
  });

  describe('determineTopicWeight', () => {
    it('should detect heavy topics from keywords', () => {
      const weight = speechContext.determineTopicWeight(undefined, ['grief', 'loss']);
      expect(weight).toBe('heavy');
    });

    it('should detect light topics from keywords', () => {
      const weight = speechContext.determineTopicWeight(undefined, ['vacation', 'celebration']);
      expect(weight).toBe('light');
    });

    it('should use emotion for weight', () => {
      const emotion = {
        distressLevel: 0.8,
        valence: 'negative' as const,
        intensity: 0.9,
        primary: 'sad',
        confidence: 0.7,
      };
      const weight = speechContext.determineTopicWeight(emotion);
      expect(weight).toBe('heavy');
    });

    it('should default to medium', () => {
      const weight = speechContext.determineTopicWeight();
      expect(weight).toBe('medium');
    });
  });

  describe('buildSpeechContext', () => {
    it('should build context with defaults', () => {
      const context = speechContext.buildSpeechContext({});

      expect(context.userWPM).toBe(150);
      expect(context.userEnergy).toBe('medium');
      expect(context.baseSpeed).toBeGreaterThan(0);
      expect(context.energyMultiplier).toBeGreaterThan(0);
    });

    it('should adjust for slow user', () => {
      const context = speechContext.buildSpeechContext({ userWPM: 100 });
      expect(context.baseSpeed).toBeLessThan(0.9);
    });

    it('should adjust for fast user', () => {
      const context = speechContext.buildSpeechContext({ userWPM: 200 });
      expect(context.baseSpeed).toBeGreaterThan(0.8);
    });

    it('should use persona speech characteristics', () => {
      const personaSpeech = {
        baseSpeedMultiplier: 0.72,
        pauseMultiplier: 1.4,
        speedVariation: 0.08,
        thinkingSoundFrequency: 0.6,
        emphasisStyle: 'subtle' as const,
        sentenceEndingStyle: 'falling' as const,
        minimumEnergy: 0.75,
        maximumEnergy: 1.05,
      };

      const context = speechContext.buildSpeechContext({ personaSpeech });
      expect(context.baseSpeed).toBeLessThan(0.85); // Should reflect slow persona
    });

    it('should disable laughter for heavy topics', () => {
      const emotion = {
        distressLevel: 0.7,
        valence: 'negative' as const,
        intensity: 0.8,
        primary: 'sad',
        confidence: 0.7,
      };

      const context = speechContext.buildSpeechContext({ emotion, topics: ['grief'] });
      expect(context.allowLaughter).toBe(false);
    });

    it('should bound energy multiplier', () => {
      const context = speechContext.buildSpeechContext({ userText: 'okay' }); // Low energy
      expect(context.energyMultiplier).toBeGreaterThanOrEqual(0.8);
      expect(context.energyMultiplier).toBeLessThanOrEqual(1.3);
    });
  });

  describe('session-scoped WPM tracking', () => {
    it('should create separate trackers per session', () => {
      const tracker1 = speechContext.getSessionWPMTracker('session-1');
      const tracker2 = speechContext.getSessionWPMTracker('session-2');

      expect(tracker1).toBeTruthy();
      expect(tracker2).toBeTruthy();
      expect(tracker1).not.toBe(tracker2);
    });

    it('should remove session tracker', () => {
      const tracker = speechContext.getSessionWPMTracker('session-test');
      speechContext.removeSessionWPMTracker('session-test');

      const newTracker = speechContext.getSessionWPMTracker('session-test');
      expect(newTracker).not.toBe(tracker);
    });
  });
});

// ============================================================================
// MUSIC REACTIONS TESTS
// ============================================================================

describe('music-reactions', () => {
  let musicReactions: typeof import('../speech/music-reactions.js');

  beforeEach(async () => {
    musicReactions = await import('../speech/music-reactions.js');
  });

  describe('getMusicReaction', () => {
    it('should return intro reactions', () => {
      const reaction = musicReactions.getMusicReaction('intro');
      expect(reaction).toBeTruthy();
      expect(typeof reaction).toBe('string');
    });

    it('should return appreciation reactions', () => {
      const reaction = musicReactions.getMusicReaction('appreciation');
      expect(reaction).toBeTruthy();
    });

    it('should return mood reactions', () => {
      const reaction = musicReactions.getMusicReaction('mood');
      expect(reaction).toBeTruthy();
    });

    it('should return transition reactions', () => {
      const reaction = musicReactions.getMusicReaction('transition');
      expect(reaction).toBeTruthy();
    });

    it('should return physical reactions', () => {
      const reaction = musicReactions.getMusicReaction('physical');
      expect(reaction).toBeTruthy();
    });

    it('should be random', () => {
      const reactions = new Set();
      for (let i = 0; i < 20; i++) {
        reactions.add(musicReactions.getMusicReaction('intro'));
      }
      expect(reactions.size).toBeGreaterThan(1);
    });
  });

  describe('shouldReactToMusic', () => {
    it('should return boolean', () => {
      const result = musicReactions.shouldReactToMusic();
      expect(typeof result).toBe('boolean');
    });

    it('should be probabilistic', () => {
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(musicReactions.shouldReactToMusic());
      }
      const trueCount = results.filter((r) => r).length;
      expect(trueCount).toBeGreaterThan(10); // Should react sometimes
      expect(trueCount).toBeLessThan(70); // But not always
    });
  });

  describe('getPlayfulMusicIntro', () => {
    it('should return an intro phrase', () => {
      const intro = musicReactions.getPlayfulMusicIntro();
      expect(intro).toBeTruthy();
      expect(typeof intro).toBe('string');
    });
  });

  describe('getGenreReaction', () => {
    it('should return reaction for jazz', () => {
      const reaction = musicReactions.getGenreReaction('play some jazz music');
      expect(reaction).toBeTruthy();
    });

    it('should return reaction for rock', () => {
      const reaction = musicReactions.getGenreReaction('I love rock music');
      expect(reaction).toBeTruthy();
    });

    it('should return null for unknown genre', () => {
      const reaction = musicReactions.getGenreReaction('play some music');
      expect(reaction).toBeNull();
    });

    it('should be case insensitive', () => {
      const reaction = musicReactions.getGenreReaction('PLAY JAZZ');
      expect(reaction).toBeTruthy();
    });
  });

  describe('getMoodMusicReaction', () => {
    it('should return reaction for relaxing mood', () => {
      const reaction = musicReactions.getMoodMusicReaction('relaxing');
      expect(reaction).toBeTruthy();
      expect(reaction).not.toBe("Here's something for you.");
    });

    it('should return reaction for focus mood', () => {
      const reaction = musicReactions.getMoodMusicReaction('focus');
      expect(reaction).toBeTruthy();
    });

    it('should return default for unknown mood', () => {
      const reaction = musicReactions.getMoodMusicReaction('unknown-mood');
      expect(reaction).toBe("Here's something for you.");
    });
  });

  describe('getPlayfulMusicComment', () => {
    it('should return a comment', () => {
      const comment = musicReactions.getPlayfulMusicComment();
      expect(comment).toBeTruthy();
      expect(typeof comment).toBe('string');
    });
  });
});

// ============================================================================
// RESPONSE NATURALNESS TESTS
// ============================================================================

describe('response-naturalness', () => {
  let responseNaturalness: typeof import('../speech/response-naturalness.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    responseNaturalness = await import('../speech/response-naturalness.js');
    responseNaturalness.resetCatchphraseTracking();
  });

  describe('determineAcknowledgmentMood', () => {
    it('should return empathetic for heavy topics', () => {
      const mood = responseNaturalness.determineAcknowledgmentMood(undefined, 'heavy');
      expect(mood).toBe('empathetic');
    });

    it('should return empathetic for distressed emotions', () => {
      const mood = responseNaturalness.determineAcknowledgmentMood('sad', 'medium');
      expect(mood).toBe('empathetic');
    });

    it('should return excited for positive emotions', () => {
      const mood = responseNaturalness.determineAcknowledgmentMood('joy', 'light', false, true);
      expect(mood).toBe('excited');
    });

    it('should return thoughtful for questions', () => {
      const mood = responseNaturalness.determineAcknowledgmentMood(undefined, undefined, true);
      expect(mood).toBe('thoughtful');
    });

    it('should return neutral as default', () => {
      const mood = responseNaturalness.determineAcknowledgmentMood();
      expect(mood).toBe('neutral');
    });
  });

  describe('getAcknowledgmentPrefix', () => {
    it('should return prefix for known persona', () => {
      const prefix = responseNaturalness.getAcknowledgmentPrefix('ferni', 'neutral');
      expect(prefix).toBeTruthy();
      expect(typeof prefix).toBe('string');
    });

    it('should return default for unknown persona', () => {
      const prefix = responseNaturalness.getAcknowledgmentPrefix('unknown-persona', 'neutral');
      expect(prefix).toBeTruthy();
    });

    it('should return different moods', () => {
      const neutral = responseNaturalness.getAcknowledgmentPrefix('ferni', 'neutral');
      const empathetic = responseNaturalness.getAcknowledgmentPrefix('ferni', 'empathetic');

      expect(neutral).toBeTruthy();
      expect(empathetic).toBeTruthy();
    });
  });

  describe('getContextAwareThinkingFiller', () => {
    it('should return filler for known persona', () => {
      const filler = responseNaturalness.getContextAwareThinkingFiller('ferni');
      expect(filler).toBeTruthy();
      expect(typeof filler).toBe('string');
    });

    it('should return default for unknown persona', () => {
      const filler = responseNaturalness.getContextAwareThinkingFiller('unknown-persona');
      expect(filler).toBeTruthy();
    });

    it('should accept context options', () => {
      const filler = responseNaturalness.getContextAwareThinkingFiller('ferni', {
        type: 'thinking',
        weight: 'medium',
        hourOfDay: 14,
      });
      expect(filler).toBeTruthy();
    });
  });

  describe('catchphrase tracking', () => {
    it('should not inject too frequently', () => {
      let injected = 0;
      for (let turn = 0; turn < 10; turn++) {
        if (responseNaturalness.shouldInjectCatchphrase('ferni', turn, false)) {
          injected++;
        }
      }
      expect(injected).toBeLessThan(4); // Max 3 per session
    });

    it('should respect minimum turns between', () => {
      const turn1 = responseNaturalness.shouldInjectCatchphrase('ferni', 5, true);
      const turn2 = responseNaturalness.shouldInjectCatchphrase('ferni', 6, true);

      // Can't inject on consecutive turns
      if (turn1) {
        expect(turn2).toBe(false);
      }
    });

    it('should inject more for positive moments', () => {
      // Test with many iterations to see probability difference
      let positiveCount = 0;
      let normalCount = 0;

      for (let i = 0; i < 100; i++) {
        responseNaturalness.resetCatchphraseTracking();
        if (responseNaturalness.shouldInjectCatchphrase('ferni', i * 10, true)) {
          positiveCount++;
        }
      }

      for (let i = 0; i < 100; i++) {
        responseNaturalness.resetCatchphraseTracking();
        if (responseNaturalness.shouldInjectCatchphrase('ferni', i * 10, false)) {
          normalCount++;
        }
      }

      expect(positiveCount).toBeGreaterThan(normalCount);
    });

    it('should reset tracking', () => {
      responseNaturalness.shouldInjectCatchphrase('ferni', 0, true);
      responseNaturalness.resetCatchphraseTracking();

      // After reset, should be able to inject again
      const result = responseNaturalness.shouldInjectCatchphrase('ferni', 10, true);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getCatchphraseWithSsml', () => {
    it('should return SSML-wrapped catchphrase', () => {
      const phrase = responseNaturalness.getCatchphraseWithSsml('ferni');
      expect(phrase).toBeTruthy();
      expect(phrase).toContain('<');
    });

    it('should return null for unknown persona', () => {
      const phrase = responseNaturalness.getCatchphraseWithSsml('unknown-persona');
      expect(phrase).toBeNull();
    });

    it('should handle legacy persona ID', () => {
      const phrase = responseNaturalness.getCatchphraseWithSsml('jack-b');
      expect(phrase).toBeTruthy();
    });
  });

  describe('getResponseEnhancements', () => {
    it('should not add prefix for greetings', () => {
      const enhancements = responseNaturalness.getResponseEnhancements({
        personaId: 'ferni',
        turnCount: 0,
        isGreeting: true,
      });

      expect(enhancements.prefix).toBeNull();
    });

    it('should sometimes add prefix for follow-ups (probabilistic)', () => {
      // shouldAddPrefix is probabilistic (50% for follow-ups)
      // Run multiple times to verify it CAN add prefixes
      let gotPrefix = false;
      for (let i = 0; i < 20; i++) {
        const enhancements = responseNaturalness.getResponseEnhancements({
          personaId: 'ferni',
          turnCount: 5,
          isFollowUp: true,
        });
        if (enhancements.prefix) {
          gotPrefix = true;
          break;
        }
      }
      // With 50% chance over 20 iterations, probability of never getting prefix is 0.5^20 ≈ 0.0001%
      expect(gotPrefix).toBe(true);
    });

    it('should suggest thinking filler for questions', () => {
      const enhancements = responseNaturalness.getResponseEnhancements({
        personaId: 'ferni',
        turnCount: 3,
        isQuestion: true,
      });

      expect(enhancements.shouldAddThinkingFiller).toBe(true);
    });
  });

  describe('CatchphraseTracker', () => {
    it('should track per-session catchphrase usage', () => {
      const tracker = new responseNaturalness.CatchphraseTracker();

      let injected = 0;
      for (let turn = 0; turn < 20; turn += 5) {
        if (tracker.shouldInject('ferni', turn, false)) {
          injected++;
        }
      }

      expect(injected).toBeLessThanOrEqual(3);
    });

    it('should reset tracking', () => {
      const tracker = new responseNaturalness.CatchphraseTracker();
      tracker.shouldInject('ferni', 0, true);
      tracker.reset();

      // After reset, usage should be cleared
      expect(tracker.shouldInject('ferni', 5, true)).toBeDefined();
    });

    it('should accept custom config', () => {
      const tracker = new responseNaturalness.CatchphraseTracker({
        maxPerSession: 1,
        minTurnsBetween: 10,
        positiveChance: 1.0, // Ensure deterministic injection
      });

      // First call at turn 0 should inject (100% chance)
      const firstResult = tracker.shouldInject('ferni', 0, true);
      expect(firstResult).toBe(true);

      // Second call at turn 5 should be blocked by minTurnsBetween (5 < 10)
      expect(tracker.shouldInject('ferni', 5, true)).toBe(false);

      // Third call at turn 15 should be blocked by maxPerSession (already used 1)
      expect(tracker.shouldInject('ferni', 15, true)).toBe(false);
    });
  });
});

// ============================================================================
// AUTHENTIC THINKING TESTS
// ============================================================================

describe('authentic-thinking', () => {
  let authenticThinking: typeof import('../speech/authentic-thinking.js');

  beforeEach(async () => {
    authenticThinking = await import('../speech/authentic-thinking.js');
  });

  describe('analyzeQuestionComplexity', () => {
    it('should detect simple questions as low complexity', () => {
      const complexity = authenticThinking.analyzeQuestionComplexity('What is your name?');
      expect(complexity).toBeLessThan(0.5);
    });

    it('should detect deep questions as high complexity', () => {
      const complexity = authenticThinking.analyzeQuestionComplexity(
        "What's the meaning of life and how should I approach it?"
      );
      expect(complexity).toBeGreaterThan(0.5);
    });

    it('should detect multi-part questions', () => {
      const complexity = authenticThinking.analyzeQuestionComplexity(
        'What should I do? And how should I handle this?'
      );
      expect(complexity).toBeGreaterThan(0.4);
    });

    it('should consider message length', () => {
      const long = `${'x '.repeat(60)}?`;
      const short = 'What?';

      const longComplexity = authenticThinking.analyzeQuestionComplexity(long);
      const shortComplexity = authenticThinking.analyzeQuestionComplexity(short);

      expect(longComplexity).toBeGreaterThan(shortComplexity);
    });

    it('should detect advice-seeking questions', () => {
      const complexity = authenticThinking.analyzeQuestionComplexity(
        'What should I do about my career?'
      );
      expect(complexity).toBeGreaterThan(0.5);
    });

    it('should bound complexity between 0 and 1', () => {
      const complexity1 = authenticThinking.analyzeQuestionComplexity('?');
      const complexity2 = authenticThinking.analyzeQuestionComplexity(`${'x '.repeat(200)}?`);

      expect(complexity1).toBeGreaterThanOrEqual(0);
      expect(complexity1).toBeLessThanOrEqual(1);
      expect(complexity2).toBeGreaterThanOrEqual(0);
      expect(complexity2).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateThinkingPause', () => {
    it('should calculate longer pause for complex questions', () => {
      const simple = {
        userText: 'What time is it?',
        questionComplexity: 0.2,
        isEmotional: false,
        requiresLookup: false,
        turnCount: 5,
      };

      const complex = {
        userText: "What's the meaning of life?",
        questionComplexity: 0.8,
        isEmotional: false,
        requiresLookup: false,
        turnCount: 5,
      };

      const simplePause = authenticThinking.calculateThinkingPause(simple);
      const complexPause = authenticThinking.calculateThinkingPause(complex);

      expect(complexPause.pauseDurationMs).toBeGreaterThan(simplePause.pauseDurationMs);
    });

    it('should add pause for emotional content', () => {
      const neutral = {
        userText: 'Tell me about stocks',
        questionComplexity: 0.5,
        isEmotional: false,
        requiresLookup: false,
        turnCount: 5,
      };

      const emotional = {
        ...neutral,
        isEmotional: true,
      };

      const neutralPause = authenticThinking.calculateThinkingPause(neutral);
      const emotionalPause = authenticThinking.calculateThinkingPause(emotional);

      expect(emotionalPause.pauseDurationMs).toBeGreaterThan(neutralPause.pauseDurationMs);
    });

    it('should add pause for lookup requirement', () => {
      const context = {
        userText: 'What is the stock price of AAPL?',
        questionComplexity: 0.3,
        isEmotional: false,
        requiresLookup: true,
        turnCount: 5,
      };

      const pause = authenticThinking.calculateThinkingPause(context);
      expect(pause.pauseDurationMs).toBeGreaterThan(300);
    });

    it('should cap pause duration at 800ms', () => {
      const context = {
        userText: 'Complex question',
        questionComplexity: 1.0,
        isEmotional: true,
        requiresLookup: true,
        turnCount: 1,
      };

      const pause = authenticThinking.calculateThinkingPause(context);
      expect(pause.pauseDurationMs).toBeLessThanOrEqual(800);
    });

    it('should include thinking phrase for complex questions', () => {
      const context = {
        userText: "What's the best investment strategy?",
        questionComplexity: 0.7,
        isEmotional: false,
        requiresLookup: false,
        turnCount: 5,
        personaId: 'ferni',
      };

      const pause = authenticThinking.calculateThinkingPause(context);
      // High complexity should sometimes include thinking phrase
      expect(pause).toHaveProperty('thinkingPhrase');
    });
  });

  describe('generateThinkingSSML', () => {
    it('should generate SSML with thinking phrase', () => {
      const pause = {
        thinkingPhrase: 'Hmm...',
        pauseDurationMs: 400,
        softEntry: false,
        speedAdjustment: 1.0,
      };

      const ssml = authenticThinking.generateThinkingSSML(pause);
      expect(ssml).toContain('Hmm...');
      expect(ssml).toContain('<break');
    });

    it('should generate SSML with soft entry', () => {
      const pause = {
        thinkingPhrase: '',
        pauseDurationMs: 300,
        softEntry: true,
        speedAdjustment: 1.0,
      };

      const ssml = authenticThinking.generateThinkingSSML(pause);
      // Soft entry now uses a break tag instead of "Well..." which sounded like AI inner monologue
      expect(ssml).toContain('<break time="200ms"/>');
    });

    it('should skip short pauses without phrase', () => {
      const pause = {
        thinkingPhrase: '',
        pauseDurationMs: 100,
        softEntry: false,
        speedAdjustment: 1.0,
      };

      const ssml = authenticThinking.generateThinkingSSML(pause);
      expect(ssml).toBe('');
    });
  });

  describe('wrapWithThinkingPause', () => {
    it('should add thinking pause to response', () => {
      const context = {
        userText: "What's the best approach?",
        questionComplexity: 0.6,
        isEmotional: false,
        requiresLookup: false,
        turnCount: 5,
      };

      const result = authenticThinking.wrapWithThinkingPause('Here is my answer', context);
      // Should potentially add pause or thinking phrase
      expect(result).toBeTruthy();
    });

    it('should skip minimal pauses', () => {
      const context = {
        userText: 'Hi',
        questionComplexity: 0.1,
        isEmotional: false,
        requiresLookup: false,
        turnCount: 5,
      };

      const original = 'Hello there';
      const result = authenticThinking.wrapWithThinkingPause(original, context);
      expect(result).toBe(original);
    });

    it('should not double-add thinking phrases', () => {
      const context = {
        userText: 'Question?',
        questionComplexity: 0.7,
        isEmotional: false,
        requiresLookup: false,
        turnCount: 5,
      };

      const alreadyHasThinking = 'Hmm... here is my answer';
      const result = authenticThinking.wrapWithThinkingPause(alreadyHasThinking, context);

      // Should not add duplicate
      expect(result).toBe(alreadyHasThinking);
    });
  });

  describe('createThinkingContext', () => {
    it('should create context from conversation state', () => {
      const context = authenticThinking.createThinkingContext(
        'What should I do?',
        0.7,
        true,
        5,
        'ferni'
      );

      expect(context.userText).toBe('What should I do?');
      expect(context.isEmotional).toBe(true);
      expect(context.turnCount).toBe(5);
      expect(context.personaId).toBe('ferni');
      expect(context.questionComplexity).toBeGreaterThan(0);
    });

    it('should detect lookup requirement', () => {
      const context = authenticThinking.createThinkingContext(
        "What's the stock price of AAPL?",
        0.3,
        false,
        2
      );

      expect(context.requiresLookup).toBe(true);
    });

    it('should set low complexity for non-questions', () => {
      const context = authenticThinking.createThinkingContext('I agree with that.', 0.3, false, 2);

      expect(context.questionComplexity).toBeLessThan(0.5);
    });
  });
});

// ============================================================================
// AUDIO PROSODY TESTS
// ============================================================================

describe('audio-prosody', () => {
  let audioProsody: typeof import('../speech/audio-prosody.js');

  beforeEach(async () => {
    audioProsody = await import('../speech/audio-prosody.js');
  });

  describe('AudioProsodyAnalyzer', () => {
    let analyzer: any;

    beforeEach(() => {
      analyzer = new audioProsody.AudioProsodyAnalyzer('test-session');
    });

    afterEach(() => {
      analyzer.reset();
      audioProsody.clearProsodyMetrics('test-session');
    });

    it('should initialize', () => {
      expect(analyzer).toBeTruthy();
    });

    it('should process audio samples', () => {
      const samples = new Float32Array(1000).fill(0.1);
      analyzer.processSamples(samples, 44100);

      // Should have buffered samples
      expect(analyzer).toBeTruthy();
    });

    it('should return null for insufficient samples', () => {
      const samples = new Float32Array(100).fill(0.1);
      analyzer.processSamples(samples, 44100);

      const result = analyzer.analyze();
      expect(result).toBeNull();
    });

    it('should analyze with sufficient samples', () => {
      const samples = new Float32Array(50000);
      // Generate simple sine wave
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
      }

      analyzer.processSamples(samples, 44100);
      const result = analyzer.analyze();

      expect(result).toBeTruthy();
      if (result) {
        expect(result.primary).toBeTruthy();
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.valence).toBeGreaterThanOrEqual(-1);
        expect(result.valence).toBeLessThanOrEqual(1);
        expect(result.arousal).toBeGreaterThanOrEqual(-1);
        expect(result.arousal).toBeLessThanOrEqual(1);
      }
    });

    it('should clear buffers', () => {
      const samples = new Float32Array(1000).fill(0.1);
      analyzer.processSamples(samples, 44100);
      analyzer.clearBuffers();

      const result = analyzer.analyze();
      expect(result).toBeNull();
    });

    it('should reset state', () => {
      const samples = new Float32Array(1000).fill(0.1);
      analyzer.processSamples(samples, 44100);
      analyzer.reset();

      const result = analyzer.analyze();
      expect(result).toBeNull();
    });

    it('should track metrics', () => {
      const samples = new Float32Array(50000).fill(0.1);
      analyzer.processSamples(samples, 44100);
      analyzer.analyze();

      const metrics = audioProsody.getProsodyMetrics('test-session');
      expect(metrics.totalAnalyses).toBeGreaterThan(0);
    });
  });

  describe('session-scoped analyzers', () => {
    afterEach(() => {
      audioProsody.removeSessionAudioProsodyAnalyzer('session-1');
      audioProsody.removeSessionAudioProsodyAnalyzer('session-2');
    });

    it('should create separate analyzers per session', () => {
      const analyzer1 = audioProsody.getSessionAudioProsodyAnalyzer('session-1');
      const analyzer2 = audioProsody.getSessionAudioProsodyAnalyzer('session-2');

      expect(analyzer1).toBeTruthy();
      expect(analyzer2).toBeTruthy();
      expect(analyzer1).not.toBe(analyzer2);
    });

    it('should reuse same analyzer for same session', () => {
      const analyzer1 = audioProsody.getSessionAudioProsodyAnalyzer('session-1');
      const analyzer2 = audioProsody.getSessionAudioProsodyAnalyzer('session-1');

      expect(analyzer1).toBe(analyzer2);
    });

    it('should remove session analyzer', () => {
      const analyzer = audioProsody.getSessionAudioProsodyAnalyzer('session-test');
      audioProsody.removeSessionAudioProsodyAnalyzer('session-test');

      const newAnalyzer = audioProsody.getSessionAudioProsodyAnalyzer('session-test');
      expect(newAnalyzer).not.toBe(analyzer);
    });
  });

  describe('prosody metrics', () => {
    afterEach(() => {
      audioProsody.clearProsodyMetrics('metrics-test');
    });

    it('should track analysis counts', () => {
      const analyzer = audioProsody.getSessionAudioProsodyAnalyzer('metrics-test');

      const samples = new Float32Array(50000).fill(0.1);
      analyzer.processSamples(samples, 44100);
      analyzer.analyze();

      const metrics = audioProsody.getProsodyMetrics('metrics-test');
      expect(metrics.totalAnalyses).toBeGreaterThan(0);
    });

    it('should calculate detection rate', () => {
      const metrics = audioProsody.getProsodyMetrics('new-session');
      expect(metrics.detectionRate).toBe(0);
    });

    it('should clear metrics', () => {
      const analyzer = audioProsody.getSessionAudioProsodyAnalyzer('clear-test');
      const samples = new Float32Array(50000).fill(0.1);
      analyzer.processSamples(samples, 44100);
      analyzer.analyze();

      audioProsody.clearProsodyMetrics('clear-test');

      const metrics = audioProsody.getProsodyMetrics('clear-test');
      expect(metrics.totalAnalyses).toBe(0);
    });
  });
});

// ============================================================================
// ADAPTIVE SSML TESTS
// ============================================================================

describe('adaptive-ssml', () => {
  let adaptiveSsml: typeof import('../speech/adaptive-ssml.js');
  let speechContext: typeof import('../speech/speech-context.js');

  beforeEach(async () => {
    adaptiveSsml = await import('../speech/adaptive-ssml.js');
    speechContext = await import('../speech/speech-context.js');
  });

  describe('tagTextWithSsmlAdaptive', () => {
    it('should return empty text unchanged', () => {
      const context = speechContext.buildSpeechContext({});
      const result = adaptiveSsml.tagTextWithSsmlAdaptive('', context);
      expect(result).toBe('');
    });

    it('should tag plain text', () => {
      const context = speechContext.buildSpeechContext({});
      const result = adaptiveSsml.tagTextWithSsmlAdaptive('Hello world', context);
      expect(result).toBeTruthy();
    });

    it('should adjust existing SSML', () => {
      const context = speechContext.buildSpeechContext({ userWPM: 100 }); // Slow user
      const text = '<speed ratio="1.0"/>Hello<break time="200ms"/>';
      const result = adaptiveSsml.tagTextWithSsmlAdaptive(text, context);

      expect(result).toContain('<speed');
      expect(result).toContain('<break');
    });

    it('should use persona-aware tagging when personaId provided', () => {
      const context = speechContext.buildSpeechContext({});
      const result = adaptiveSsml.tagTextWithSsmlAdaptive('Hello', context, 'ferni');
      expect(result).toBeTruthy();
    });

    it('should handle malformed SSML gracefully', () => {
      const context = speechContext.buildSpeechContext({});
      const malformed = '<<broken SSML>>';
      const result = adaptiveSsml.tagTextWithSsmlAdaptive(malformed, context);
      expect(result).toBeTruthy();
      expect(result).not.toContain('<<');
    });
  });

  describe('specialized taggers', () => {
    let context: any;

    beforeEach(() => {
      context = speechContext.buildSpeechContext({});
    });

    it('should tag greetings slower', () => {
      const result = adaptiveSsml.tagGreeting('Hello there', context);
      expect(result).toBeTruthy();
    });

    it('should tag support responses gently', () => {
      const result = adaptiveSsml.tagSupportResponse("I'm here for you", context);
      expect(result).toBeTruthy();
    });

    it('should tag advice thoughtfully', () => {
      const result = adaptiveSsml.tagAdvice('Here is what I recommend', context);
      expect(result).toBeTruthy();
    });

    it('should tag stories dynamically', () => {
      const result = adaptiveSsml.tagStory('Let me tell you a story', context);
      expect(result).toBeTruthy();
    });

    it('should tag wrap-ups warmly', () => {
      const result = adaptiveSsml.tagWrapUp('Take care', context);
      expect(result).toBeTruthy();
    });
  });

  describe('phase-specific personality', () => {
    let context: any;

    beforeEach(() => {
      context = speechContext.buildSpeechContext({});
    });

    it('should apply greeting personality', () => {
      const result = adaptiveSsml.applyPhasePersonality('Hello', 'greeting', context);
      expect(result).toContain('<emotion');
    });

    it('should apply supporting personality', () => {
      const result = adaptiveSsml.applyPhasePersonality('I understand', 'supporting', context);
      expect(result).toContain('<speed');
    });

    it('should apply advising personality', () => {
      const result = adaptiveSsml.applyPhasePersonality('My advice is', 'advising', context);
      expect(result).toBeTruthy();
    });

    it('should handle unknown phase', () => {
      const result = adaptiveSsml.applyPhasePersonality('Text', 'unknown' as any, context);
      expect(result).toBe('Text');
    });
  });
});

// ============================================================================
// COGNITIVE SPEECH INTEGRATION TESTS
// ============================================================================

describe('cognitive-speech-integration', () => {
  let cognitiveIntegration: typeof import('../speech/cognitive-speech-integration.js');

  beforeEach(async () => {
    cognitiveIntegration = await import('../speech/cognitive-speech-integration.js');
    cognitiveIntegration.clearCognitiveSpeechState('test-session');
  });

  afterEach(() => {
    cognitiveIntegration.clearCognitiveSpeechState('test-session');
  });

  describe('applyCognitiveSpeechAdjustments', () => {
    it('should apply cognitive adjustments', () => {
      const input = {
        speechContext: {
          userWPM: 150,
          userEnergy: 'medium' as const,
          userEmotion: 'neutral',
          conversationPhase: 'exploring' as const,
          topicWeight: 'medium' as const,
          turnCount: 5,
          baseSpeed: 0.88,
          energyMultiplier: 1.0,
          allowLaughter: false,
          pauseMultiplier: 1.0,
          emotionIntensity: 0.75,
        },
        baseCharacteristics: {
          baseSpeedMultiplier: 0.88,
          pauseMultiplier: 1.0,
          speedVariation: 0.15,
          thinkingSoundFrequency: 0.3,
          emphasisStyle: 'moderate' as const,
          sentenceEndingStyle: 'natural' as const,
          minimumEnergy: 0.85,
          maximumEnergy: 1.15,
        },
        cognitiveGuidance: {
          recommendedApproach: 'analytical' as const,
          showReasoning: true,
          confidenceLevel: 0.8,
          cognitiveLoad: 0.5,
        },
        emotionalWeight: 0.3,
      };

      const result = cognitiveIntegration.applyCognitiveSpeechAdjustments(input, 'test-session');

      expect(result.characteristics).toBeTruthy();
      expect(result.debug.cognitiveMode).toBe('analytical');
      expect(result.debug.confidence).toBe(0.8);
    });

    it('should add thinking sound for show reasoning', () => {
      const input = {
        speechContext: {
          userWPM: 150,
          userEnergy: 'medium' as const,
          userEmotion: 'neutral',
          conversationPhase: 'exploring' as const,
          topicWeight: 'medium' as const,
          turnCount: 1,
          baseSpeed: 0.88,
          energyMultiplier: 1.0,
          allowLaughter: false,
          pauseMultiplier: 1.0,
          emotionIntensity: 0.75,
        },
        baseCharacteristics: {
          baseSpeedMultiplier: 0.88,
          pauseMultiplier: 1.0,
          speedVariation: 0.15,
          thinkingSoundFrequency: 0.8,
          emphasisStyle: 'moderate' as const,
          sentenceEndingStyle: 'natural' as const,
          minimumEnergy: 0.85,
          maximumEnergy: 1.15,
        },
        cognitiveGuidance: {
          recommendedApproach: 'analytical' as const,
          showReasoning: true,
          confidenceLevel: 0.6,
          cognitiveLoad: 0.7,
        },
        emotionalWeight: 0.3,
      };

      const result = cognitiveIntegration.applyCognitiveSpeechAdjustments(input, 'test-session');

      // Thinking sound might be added (probabilistic)
      expect(result).toHaveProperty('thinkingSound');
    });
  });

  describe('buildCognitiveSSML', () => {
    it('should wrap text with cognitive SSML', () => {
      const result = {
        characteristics: {} as any,
        ssmlPrefix: '<break time="200ms"/>',
        ssmlSuffix: '<break time="300ms"/>',
        thinkingSound: 'Hmm',
        debug: {
          cognitiveMode: 'analytical' as const,
          confidence: 0.7,
          adjustments: {} as any,
        },
      };

      const ssml = cognitiveIntegration.buildCognitiveSSML('Here is my answer', result);

      expect(ssml).toContain('Hmm');
      expect(ssml).toContain('Here is my answer');
      expect(ssml).toContain('<break');
    });

    it('should handle minimal result', () => {
      const result = {
        characteristics: {} as any,
        ssmlPrefix: '',
        ssmlSuffix: '',
        debug: {
          cognitiveMode: 'narrative' as const,
          confidence: 0.9,
          adjustments: {} as any,
        },
      };

      const ssml = cognitiveIntegration.buildCognitiveSSML('Simple text', result);
      expect(ssml).toBe('Simple text');
    });
  });

  describe('getCognitiveSpeechStats', () => {
    it('should return empty stats for new session', () => {
      const stats = cognitiveIntegration.getCognitiveSpeechStats('new-session');

      expect(stats.totalTurns).toBe(0);
      expect(stats.thinkingSoundsUsed).toBe(0);
      expect(stats.thinkingSoundRate).toBe(0);
      expect(stats.showReasoningRate).toBe(0);
    });

    it('should track stats across calls', () => {
      const input = {
        speechContext: {} as any,
        baseCharacteristics: {
          baseSpeedMultiplier: 0.88,
          pauseMultiplier: 1.0,
          speedVariation: 0.15,
          thinkingSoundFrequency: 0.3,
          emphasisStyle: 'moderate' as const,
          sentenceEndingStyle: 'natural' as const,
          minimumEnergy: 0.85,
          maximumEnergy: 1.15,
        },
        cognitiveGuidance: {
          recommendedApproach: 'analytical' as const,
          showReasoning: false,
          confidenceLevel: 0.7,
          cognitiveLoad: 0.5,
        },
        emotionalWeight: 0.3,
      };

      cognitiveIntegration.applyCognitiveSpeechAdjustments(input, 'stats-test');
      cognitiveIntegration.applyCognitiveSpeechAdjustments(input, 'stats-test');

      const stats = cognitiveIntegration.getCognitiveSpeechStats('stats-test');
      expect(stats.totalTurns).toBe(2);

      cognitiveIntegration.clearCognitiveSpeechState('stats-test');
    });
  });

  describe('getReasoningStyleSpeechPreset', () => {
    it('should return analytical preset', () => {
      const preset = cognitiveIntegration.getReasoningStyleSpeechPreset('analytical');

      expect(preset.baseSpeedMultiplier).toBeDefined();
      expect(preset.pauseMultiplier).toBeDefined();
      expect(preset.emphasisStyle).toBe('moderate');
    });

    it('should return empathetic preset', () => {
      const preset = cognitiveIntegration.getReasoningStyleSpeechPreset('empathetic');

      expect(preset.baseSpeedMultiplier).toBeLessThan(0.9); // Slower for empathy
      expect(preset.emphasisStyle).toBe('subtle');
    });

    it('should return pragmatic preset', () => {
      const preset = cognitiveIntegration.getReasoningStyleSpeechPreset('pragmatic');

      expect(preset.baseSpeedMultiplier).toBeGreaterThan(0.9); // Faster for pragmatic
    });

    it('should handle unknown style', () => {
      const preset = cognitiveIntegration.getReasoningStyleSpeechPreset('unknown' as any);
      expect(preset).toEqual({});
    });
  });
});
