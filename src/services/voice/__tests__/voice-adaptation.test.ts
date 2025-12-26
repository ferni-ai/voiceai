/**
 * Voice Adaptation Service Tests
 *
 * Tests for persona voice profiles and SSML transformations.
 */

import { describe, it, expect } from 'vitest';
import {
  getPersonaVoiceProfile,
  adjustForUserEmotion,
  applyRate,
  applyPauseMultiplier,
  addEmphasis,
  insertThinkingSound,
  insertFiller,
  getConversationBreak,
  type VoiceModifiers,
} from '../voice-adaptation.js';
import type { EmotionResult } from '../../emotion-detection.js';

describe('VoiceAdaptation', () => {
  // ===========================================================================
  // getPersonaVoiceProfile
  // ===========================================================================
  describe('getPersonaVoiceProfile', () => {
    it('should return profile for ferni', () => {
      const profile = getPersonaVoiceProfile('ferni');

      expect(profile.rate).toBe(1.0);
      expect(profile.pitch).toBe(0);
      expect(profile.pauseMultiplier).toBe(1.0);
      expect(profile.emphasis).toBe('moderate');
    });

    it('should return faster profile for jordan-taylor', () => {
      const profile = getPersonaVoiceProfile('jordan-taylor');

      expect(profile.rate).toBe(1.1);
      expect(profile.pitch).toBe(2);
      expect(profile.pauseMultiplier).toBe(0.85);
      expect(profile.emphasis).toBe('strong');
    });

    it('should return slower profile for nayan-patel', () => {
      const profile = getPersonaVoiceProfile('nayan-patel');

      expect(profile.rate).toBe(0.85);
      expect(profile.pitch).toBe(-3);
      expect(profile.pauseMultiplier).toBe(1.4);
    });

    it('should return excited profile for peter-john', () => {
      const profile = getPersonaVoiceProfile('peter-john');

      expect(profile.rate).toBe(1.15);
      expect(profile.emphasis).toBe('strong');
    });

    it('should return efficient profile for alex-chen', () => {
      const profile = getPersonaVoiceProfile('alex-chen');

      expect(profile.rate).toBe(1.05);
      expect(profile.pauseMultiplier).toBe(0.9);
    });

    it('should return warm profile for maya-santos', () => {
      const profile = getPersonaVoiceProfile('maya-santos');

      expect(profile.rate).toBe(0.95);
      expect(profile.pitch).toBe(1);
      expect(profile.pauseMultiplier).toBe(1.1);
    });

    it('should fall back to ferni for unknown persona', () => {
      const profile = getPersonaVoiceProfile('unknown-persona');
      const ferniProfile = getPersonaVoiceProfile('ferni');

      expect(profile).toEqual(ferniProfile);
    });
  });

  // ===========================================================================
  // adjustForUserEmotion
  // ===========================================================================
  describe('adjustForUserEmotion', () => {
    const baseModifiers: VoiceModifiers = {
      rate: 1.0,
      pitch: 0,
      pauseMultiplier: 1.0,
      emphasis: 'moderate',
    };

    it('should slow down for distressed user', () => {
      const emotion: EmotionResult = {
        primary: 'distressed',
        energy: 'low',
        confidence: 0.8,
        keywords: ['overwhelmed'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBeLessThan(baseModifiers.rate);
      expect(adjusted.pauseMultiplier).toBeGreaterThan(baseModifiers.pauseMultiplier);
      expect(adjusted.emphasis).toBe('reduced');
    });

    it('should slow down for anxious user', () => {
      const emotion: EmotionResult = {
        primary: 'anxious',
        energy: 'high',
        confidence: 0.75,
        keywords: ['worried'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(0.85);
      expect(adjusted.emphasis).toBe('reduced');
    });

    it('should slow down for sad user', () => {
      const emotion: EmotionResult = {
        primary: 'sad',
        energy: 'low',
        confidence: 0.8,
        keywords: ['lonely'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(0.85);
      expect(adjusted.pauseMultiplier).toBe(1.3);
    });

    it('should speed up for excited user with high energy', () => {
      const emotion: EmotionResult = {
        primary: 'excited',
        energy: 'high',
        confidence: 0.9,
        keywords: ['amazing'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(1.1);
      expect(adjusted.pauseMultiplier).toBe(0.85);
      expect(adjusted.emphasis).toBe('strong');
    });

    it('should speed up for happy user with high energy', () => {
      const emotion: EmotionResult = {
        primary: 'happy',
        energy: 'high',
        confidence: 0.85,
        keywords: ['great'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBeGreaterThan(1.0);
      expect(adjusted.emphasis).toBe('strong');
    });

    it('should not change for happy user with low energy', () => {
      const emotion: EmotionResult = {
        primary: 'happy',
        energy: 'low',
        confidence: 0.8,
        keywords: ['content'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(baseModifiers.rate);
    });

    it('should stay calm for angry user', () => {
      const emotion: EmotionResult = {
        primary: 'angry',
        energy: 'high',
        confidence: 0.9,
        keywords: ['furious'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(0.95);
      expect(adjusted.pauseMultiplier).toBe(1.1);
    });

    it('should stay calm for frustrated user', () => {
      const emotion: EmotionResult = {
        primary: 'frustrated',
        energy: 'medium',
        confidence: 0.85,
        keywords: ['annoyed'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(0.95);
    });

    it('should slow down for confused user', () => {
      const emotion: EmotionResult = {
        primary: 'confused',
        energy: 'low',
        confidence: 0.7,
        keywords: ['lost'],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(0.9);
      expect(adjusted.pauseMultiplier).toBe(1.2);
    });

    it('should not change for neutral emotion', () => {
      const emotion: EmotionResult = {
        primary: 'neutral',
        energy: 'medium',
        confidence: 0.6,
        keywords: [],
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(baseModifiers.rate);
      expect(adjusted.pauseMultiplier).toBe(baseModifiers.pauseMultiplier);
    });
  });

  // ===========================================================================
  // applyRate
  // ===========================================================================
  describe('applyRate', () => {
    it('should not wrap content for rate close to 1.0', () => {
      const content = 'Hello world';
      const result = applyRate(content, 1.0);

      expect(result).toBe(content);
    });

    it('should not wrap content for rate within 0.05 of 1.0', () => {
      const content = 'Hello world';
      const result = applyRate(content, 1.03);

      expect(result).toBe(content);
    });

    it('should wrap content with prosody rate tag for slow rate', () => {
      const content = 'Hello world';
      const result = applyRate(content, 0.8);

      expect(result).toBe('<prosody rate="80%">Hello world</prosody>');
    });

    it('should wrap content with prosody rate tag for fast rate', () => {
      const content = 'Hello world';
      const result = applyRate(content, 1.2);

      expect(result).toBe('<prosody rate="120%">Hello world</prosody>');
    });

    it('should round rate to integer percentage', () => {
      const content = 'Hello world';
      const result = applyRate(content, 0.876);

      expect(result).toContain('rate="88%"');
    });
  });

  // ===========================================================================
  // applyPauseMultiplier
  // ===========================================================================
  describe('applyPauseMultiplier', () => {
    it('should multiply pause durations', () => {
      const content = 'Hello<break time="200ms"/> world';
      const result = applyPauseMultiplier(content, 1.5);

      expect(result).toBe('Hello<break time="300ms"/> world');
    });

    it('should handle multiple breaks', () => {
      const content = 'Hello<break time="100ms"/> beautiful<break time="200ms"/> world';
      const result = applyPauseMultiplier(content, 2.0);

      expect(result).toBe('Hello<break time="200ms"/> beautiful<break time="400ms"/> world');
    });

    it('should round to nearest millisecond', () => {
      const content = 'Hello<break time="100ms"/> world';
      const result = applyPauseMultiplier(content, 1.3);

      expect(result).toBe('Hello<break time="130ms"/> world');
    });

    it('should handle no breaks', () => {
      const content = 'Hello world';
      const result = applyPauseMultiplier(content, 1.5);

      expect(result).toBe('Hello world');
    });

    it('should reduce pauses for multiplier < 1', () => {
      const content = 'Hello<break time="200ms"/> world';
      const result = applyPauseMultiplier(content, 0.5);

      expect(result).toBe('Hello<break time="100ms"/> world');
    });
  });

  // ===========================================================================
  // addEmphasis
  // ===========================================================================
  describe('addEmphasis', () => {
    it('should wrap specified words with emphasis', () => {
      const content = 'This is really important';
      const result = addEmphasis(content, ['really'], 'moderate');

      expect(result).toBe('This is <emphasis level="moderate">really</emphasis> important');
    });

    it('should handle multiple words', () => {
      const content = 'This is really very important';
      const result = addEmphasis(content, ['really', 'very'], 'strong');

      expect(result).toContain('<emphasis level="strong">really</emphasis>');
      expect(result).toContain('<emphasis level="strong">very</emphasis>');
    });

    it('should be case insensitive', () => {
      const content = 'This is REALLY important';
      const result = addEmphasis(content, ['really'], 'moderate');

      expect(result).toContain('<emphasis level="moderate">REALLY</emphasis>');
    });

    it('should match word boundaries', () => {
      const content = 'This is virtually important, but not really virtual';
      const result = addEmphasis(content, ['virtual'], 'moderate');

      // Should NOT match "virtually", only "virtual"
      expect(result).not.toContain('<emphasis level="moderate">virtually</emphasis>');
      expect(result).toContain('<emphasis level="moderate">virtual</emphasis>');
    });

    it('should not modify if word not present', () => {
      const content = 'Hello world';
      const result = addEmphasis(content, ['really'], 'moderate');

      expect(result).toBe(content);
    });
  });

  // ===========================================================================
  // insertThinkingSound
  // ===========================================================================
  describe('insertThinkingSound', () => {
    it('should return thinking sound for ferni', () => {
      const sound = insertThinkingSound('ferni');

      expect(sound).toContain('<break');
      expect(sound).toMatch(/Hmm|Let me think/);
    });

    it('should return thinking sound for jordan-taylor', () => {
      const sound = insertThinkingSound('jordan-taylor');

      expect(sound).toMatch(/Ooh|So/);
    });

    it('should return thinking sound for nayan-patel', () => {
      const sound = insertThinkingSound('nayan-patel');

      expect(sound).toMatch(/Hmm|Well/);
      // Nayan has longer pauses (350-400ms range)
      expect(sound).toMatch(/3\d\dms|4\d\dms/);
    });

    it('should return thinking sound for peter-john', () => {
      const sound = insertThinkingSound('peter-john');

      expect(sound).toMatch(/Interesting|So/);
    });

    it('should return thinking sound for alex-chen', () => {
      const sound = insertThinkingSound('alex-chen');

      expect(sound).toMatch(/Let me think|Okay/);
    });

    it('should return thinking sound for maya-santos', () => {
      const sound = insertThinkingSound('maya-santos');

      expect(sound).toMatch(/Hmm|Let me see/);
    });

    it('should fall back to ferni for unknown persona', () => {
      const sound = insertThinkingSound('unknown');

      expect(sound).toMatch(/Hmm|Let me think/);
    });
  });

  // ===========================================================================
  // insertFiller
  // ===========================================================================
  describe('insertFiller', () => {
    it('should return filler for ferni', () => {
      const filler = insertFiller('ferni');
      const validFillers = ['you know', 'I mean', 'so', 'like'];

      expect(validFillers).toContain(filler);
    });

    it('should return filler for jordan-taylor', () => {
      const filler = insertFiller('jordan-taylor');
      const validFillers = ['so like', 'okay so', 'and then'];

      expect(validFillers).toContain(filler);
    });

    it('should return filler for nayan-patel', () => {
      const filler = insertFiller('nayan-patel');
      const validFillers = ['well', 'now', 'you see'];

      expect(validFillers).toContain(filler);
    });

    it('should return filler for peter-john', () => {
      const filler = insertFiller('peter-john');
      const validFillers = ['look', "here's the thing", 'so'];

      expect(validFillers).toContain(filler);
    });

    it('should fall back to ferni for unknown persona', () => {
      const filler = insertFiller('unknown');
      const ferniFillers = ['you know', 'I mean', 'so', 'like'];

      expect(ferniFillers).toContain(filler);
    });
  });

  // ===========================================================================
  // getConversationBreak
  // ===========================================================================
  describe('getConversationBreak', () => {
    it('should return conversation break for ferni', () => {
      const breakStr = getConversationBreak('ferni');

      expect(breakStr).toContain('<break');
      expect(breakStr).toMatch(/Does that make sense|You with me|Okay/);
    });

    it('should return conversation break for jordan-taylor', () => {
      const breakStr = getConversationBreak('jordan-taylor');

      expect(breakStr).toMatch(/Still with me|Okay so|And then/);
    });

    it('should return conversation break for nayan-patel', () => {
      const breakStr = getConversationBreak('nayan-patel');

      expect(breakStr).toMatch(/Now|Here's the thing|Bear with me/);
      // Nayan has longer pauses
      expect(breakStr).toMatch(/4\d\dms|5\d\dms/);
    });

    it('should return conversation break for maya-santos', () => {
      const breakStr = getConversationBreak('maya-santos');

      expect(breakStr).toMatch(/How are you feeling|Take a breath|And/);
    });

    it('should fall back to ferni for unknown persona', () => {
      const breakStr = getConversationBreak('unknown');
      const ferniBreaks = ['Does that make sense', 'You with me', 'Okay'];

      const containsAny = ferniBreaks.some((b) => breakStr.includes(b));
      expect(containsAny).toBe(true);
    });
  });
});
