/**
 * Vocal Humanization Tests
 *
 * Tests for "Better Than Human" voice processing:
 * - Energy matching
 * - Pitch variation
 * - Contraction enforcement
 * - Intake breath
 * - Emotion bleeding
 * - Mid-sentence reactions
 */

import { describe, expect, it, vi } from 'vitest';
import {
  addIntakeBreath,
  addPitchVariation,
  applyEmotionBleeding,
  detectEmotionalContent,
  detectHeavyContent,
  detectUserEnergy,
  enforceContractions,
  generateVocalProfile,
  humanizeVocals,
} from '../conversation/vocal-humanization.js';

describe('Vocal Humanization', () => {
  describe('detectUserEnergy', () => {
    it('should detect high energy from exclamation marks', () => {
      expect(detectUserEnergy('This is amazing!!')).toBe('high');
      expect(detectUserEnergy("I can't wait!!")).toBe('high');
    });

    it('should detect high energy from excited words', () => {
      // Needs excited words + exclamation for high energy
      expect(detectUserEnergy("I'm so excited about this!")).toBe('high');
      expect(detectUserEnergy('This is incredible!')).toBe('high');
    });

    it('should detect low energy from subdued language', () => {
      expect(detectUserEnergy("I'm tired and overwhelmed")).toBe('low');
      expect(detectUserEnergy("I've been struggling lately")).toBe('low');
    });

    it('should detect subdued energy from heavy content', () => {
      // Heavy content alone may not trigger subdued - needs explicit low energy signals too
      // These examples show low/subdued patterns combined with heavy topics
      expect(detectUserEnergy("I'm struggling... my father passed away")).toBe('subdued');
      expect(detectUserEnergy("I'm overwhelmed with the divorce...")).toBe('subdued');
    });

    it('should detect medium energy for neutral messages', () => {
      expect(detectUserEnergy('I wanted to ask you about something')).toBe('medium');
      expect(detectUserEnergy('What do you think about this?')).toBe('medium');
    });

    it('should handle empty/undefined input', () => {
      expect(detectUserEnergy('')).toBe('medium');
    });
  });

  describe('enforceContractions', () => {
    it('should convert formal negations to contractions', () => {
      expect(enforceContractions('I do not know')).toBe("I don't know");
      expect(enforceContractions('You should not worry')).toBe("You shouldn't worry");
      expect(enforceContractions('It is not a problem')).toBe("It isn't a problem");
    });

    it('should convert pronoun + verb to contractions', () => {
      expect(enforceContractions('I am here for you')).toBe("I'm here for you");
      expect(enforceContractions('You are doing great')).toBe("You're doing great");
      expect(enforceContractions('It is going well')).toBe("It's going well");
    });

    it('should convert casual speech patterns', () => {
      expect(enforceContractions('I am going to help you')).toBe("I'm gonna help you");
      expect(enforceContractions('Do you want to talk about it?')).toBe(
        'Do you wanna talk about it?'
      );
    });

    it('should preserve sentence capitalization', () => {
      expect(enforceContractions('I am happy to help')).toBe("I'm happy to help");
      expect(enforceContractions('Do not worry about it')).toBe("Don't worry about it");
    });

    it('should handle multiple contractions in one sentence', () => {
      expect(enforceContractions('I am not going to do that')).toBe("I'm not gonna do that");
    });

    it('should not over-contract already contracted text', () => {
      const alreadyContracted = "I don't know what you're talking about";
      expect(enforceContractions(alreadyContracted)).toBe(alreadyContracted);
    });
  });

  describe('generateVocalProfile', () => {
    it('should generate faster profile for high energy', () => {
      const profile = generateVocalProfile({ userEnergy: 'high' });
      expect(profile.speed).toBeGreaterThan(1.0);
      expect(profile.pauseMultiplier).toBeLessThan(1.0);
    });

    it('should generate slower profile for low energy', () => {
      const profile = generateVocalProfile({ userEnergy: 'low' });
      expect(profile.speed).toBeLessThan(1.0);
      expect(profile.volume).toBe('soft');
      expect(profile.addIntakeBreath).toBe(true);
    });

    it('should generate very slow profile for subdued energy', () => {
      const profile = generateVocalProfile({ userEnergy: 'subdued' });
      expect(profile.speed).toBeLessThan(0.9);
      expect(profile.pauseMultiplier).toBeGreaterThan(1.3);
    });

    it('should override energy matching for heavy content', () => {
      const profile = generateVocalProfile({
        userEnergy: 'high',
        isHeavyContent: true,
      });
      expect(profile.speed).toBeLessThanOrEqual(0.9);
      expect(profile.addIntakeBreath).toBe(true);
    });

    it('should add breath for meaningful moments', () => {
      const profile = generateVocalProfile({
        userEnergy: 'medium',
        isMeaningfulMoment: true,
      });
      expect(profile.addIntakeBreath).toBe(true);
    });
  });

  describe('addPitchVariation', () => {
    it('should add rising pitch to questions', () => {
      const result = addPitchVariation('How are you feeling today?', {});
      expect(result).toContain('pitch="+8%"');
    });

    it('should add pitch boost to exclamations', () => {
      const result = addPitchVariation('That is amazing!', {});
      expect(result).toContain('pitch="+3%"');
    });

    it('should add falling pitch to statements', () => {
      const result = addPitchVariation('This is a statement with multiple words here.', {});
      expect(result).toContain('pitch="-2%"');
    });

    it('should add emphasis to important words', () => {
      const result = addPitchVariation('I really appreciate that', {});
      expect(result).toContain('really');
      expect(result).toContain('prosody');
    });

    it('should not modify text that already has prosody', () => {
      const text = '<prosody rate="90%">Already tagged</prosody>';
      expect(addPitchVariation(text, {})).toBe(text);
    });
  });

  describe('addIntakeBreath', () => {
    it('should add breath for meaningful moments', () => {
      const result = addIntakeBreath('Thank you for sharing that.', {
        isMeaningfulMoment: true,
      });
      expect(result).toContain('<break time=');
    });

    it('should add longer breath for heavy content', () => {
      const result = addIntakeBreath("I'm so sorry to hear that.", {
        isHeavyContent: true,
      });
      expect(result).toContain('<break time=');
      // Heavy content should have longer pauses (500ms+)
      expect(result).toMatch(/<break time="[56]\d\dms"\/>/);
    });

    it('should not add breath for normal responses', () => {
      const text = 'Sure, I can help with that.';
      const result = addIntakeBreath(text, { userEnergy: 'medium' });
      // Medium energy without meaningful moment shouldn't add breath
      expect(result).toBe(text);
    });
  });

  describe('applyEmotionBleeding', () => {
    it('should apply sympathetic tone to sorry phrases', () => {
      const result = applyEmotionBleeding("I'm so sorry to hear that.", {});
      expect(result).toContain('prosody');
      expect(result).toContain('soft');
    });

    it('should apply warm tone to proud phrases', () => {
      const result = applyEmotionBleeding("I'm proud of you for doing that.", {});
      expect(result).toContain('prosody');
    });

    it('should apply surprised tone to wait/what phrases', () => {
      const result = applyEmotionBleeding('Wait, really? That happened?', {});
      expect(result).toContain('prosody');
      expect(result).toContain('108%'); // faster rate for surprise
    });

    it('should not modify neutral text', () => {
      const text = 'The weather is nice today.';
      expect(applyEmotionBleeding(text, {})).toBe(text);
    });
  });

  describe('detectEmotionalContent', () => {
    it('should detect sympathetic content', () => {
      expect(detectEmotionalContent("I'm sorry to hear that")).toBe(true);
      // Pattern matches "that sounds hard" not "that's really hard"
      expect(detectEmotionalContent('That sounds really hard')).toBe(true);
    });

    it('should detect encouraging content', () => {
      expect(detectEmotionalContent("I'm proud of you")).toBe(true);
      expect(detectEmotionalContent('I believe in you')).toBe(true);
    });

    it('should not flag neutral content', () => {
      expect(detectEmotionalContent('The meeting is at 3pm')).toBe(false);
    });
  });

  describe('detectHeavyContent', () => {
    it('should detect death/loss content', () => {
      expect(detectHeavyContent('My father passed away')).toBe(true);
      expect(detectHeavyContent('She died last year')).toBe(true);
    });

    it('should detect crisis content', () => {
      expect(detectHeavyContent('I got fired yesterday')).toBe(true);
      expect(detectHeavyContent("We're going through a divorce")).toBe(true);
    });

    it('should not flag normal content', () => {
      expect(detectHeavyContent('I had a good day at work')).toBe(false);
    });
  });

  describe('humanizeVocals (integration)', () => {
    it('should apply all humanization features', () => {
      const result = humanizeVocals('I am going to help you with that. Do not worry about it.', {
        userMessage: "I'm feeling overwhelmed!!",
      });

      // Should apply contractions
      expect(result.ssml).toContain("I'm");
      expect(result.ssml).toContain('gonna');
      expect(result.ssml).toContain("Don't");

      // Should detect energy
      expect(result.energyLevel).toBeDefined();

      // Should have applied features
      expect(result.appliedFeatures).toContain('contractions');
    });

    it('should match high user energy', () => {
      const result = humanizeVocals('That sounds great!', {
        userMessage: 'This is amazing!! I love it!!',
      });

      expect(result.energyLevel).toBe('high');
      expect(result.profile.speed).toBeGreaterThan(1.0);
    });

    it('should match low user energy', () => {
      const result = humanizeVocals("I'm here for you.", {
        userMessage: "I'm so tired and overwhelmed...",
      });

      expect(result.energyLevel).toBe('low');
      expect(result.profile.speed).toBeLessThan(1.0);
      expect(result.profile.volume).toBe('soft');
    });

    it('should add intake breath for meaningful moments', () => {
      const result = humanizeVocals('Thank you for trusting me with that.', {
        isMeaningfulMoment: true,
        userMessage: 'I need to tell you something important...',
      });

      expect(result.appliedFeatures).toContain('intake_breath');
    });

    it('should apply emotion bleeding for emotional content', () => {
      const result = humanizeVocals("I'm so sorry you're going through this.", {
        userMessage: 'My dog died yesterday',
      });

      expect(result.appliedFeatures).toContain('emotion_bleeding');
    });

    it('should handle empty context gracefully', () => {
      const result = humanizeVocals('Hello, how are you?', {});

      expect(result.ssml).toBeDefined();
      expect(result.energyLevel).toBe('medium');
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', () => {
      const longText = 'This is a sentence. '.repeat(50);
      const result = humanizeVocals(longText, {});

      expect(result.ssml).toBeDefined();
      expect(result.ssml.length).toBeGreaterThan(0);
    });

    it('should handle text with existing SSML', () => {
      const textWithSsml = '<break time="200ms"/>Hello there.';
      const result = humanizeVocals(textWithSsml, {});

      // Should still process without breaking
      expect(result.ssml).toBeDefined();
    });

    it('should handle mixed case contractions', () => {
      // Preserves first letter case, rest follows contraction pattern
      expect(enforceContractions('I DO NOT want that')).toBe("I Don't want that");
      expect(enforceContractions('Do Not Worry')).toBe("Don't Worry");
    });

    it('should preserve meaning while enforcing contractions', () => {
      const original = 'I am not sure if you are going to be able to do that.';
      const contracted = enforceContractions(original);

      // Should be shorter (contractions)
      expect(contracted.length).toBeLessThan(original.length);
      // Should still be readable
      expect(contracted).toContain("I'm");
      expect(contracted).toContain("you're");
      expect(contracted).toContain('gonna');
    });
  });

  describe('Deterministic Randomness (seeded)', () => {
    it('should be deterministic when randomSeed is provided', () => {
      const context = {
        userEnergy: 'low' as const,
        isMeaningfulMoment: true,
        turnNumber: 7,
        userMessage: 'I have been feeling overwhelmed lately.',
        randomSeed: 'session-1:turn-7',
      };

      const a = humanizeVocals('I am here with you.', { ...context });
      const b = humanizeVocals('I am here with you.', { ...context });

      expect(a.ssml).toBe(b.ssml);
      expect(a.appliedFeatures).toEqual(b.appliedFeatures);
    });

    it('should not call Math.random when randomSeed is provided', () => {
      const spy = vi.spyOn(Math, 'random');
      try {
        humanizeVocals('I am here with you.', {
          userEnergy: 'low',
          isMeaningfulMoment: true,
          turnNumber: 7,
          userMessage: 'I have been feeling overwhelmed lately.',
          randomSeed: 'session-2:turn-7',
        });

        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
