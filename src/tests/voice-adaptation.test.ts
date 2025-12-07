/**
 * Voice Adaptation Service Tests
 *
 * Tests for:
 * - Persona voice profiles
 * - Voice modifiers for emotions
 * - SSML helpers (rate, pause, emphasis)
 * - Thinking sounds and fillers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
}));

vi.mock('./persona-behavior-manager.js', () => ({
  loadPersonaBehaviors: vi.fn().mockResolvedValue({
    microExpressions: {},
    speechPatterns: {},
  }),
}));

import {
  getPersonaVoiceProfile,
  adjustForUserEmotion,
  applyRate,
  applyPauseMultiplier,
  addEmphasis,
  insertThinkingSound,
  insertFiller,
  type VoiceModifiers,
} from '../services/voice-adaptation.js';
import type { EmotionResult } from '../services/emotion-detection.js';

describe('Voice Adaptation Service', () => {
  describe('getPersonaVoiceProfile', () => {
    it('should return ferni profile by default', () => {
      const profile = getPersonaVoiceProfile('ferni');

      expect(profile).toBeDefined();
      expect(profile.rate).toBe(1.0);
      expect(profile.pitch).toBe(0);
      expect(profile.pauseMultiplier).toBe(1.0);
      expect(profile.emphasis).toBe('moderate');
    });

    it('should return jordan-taylor profile with faster rate', () => {
      const profile = getPersonaVoiceProfile('jordan-taylor');

      expect(profile.rate).toBe(1.1);
      expect(profile.pitch).toBe(2);
      expect(profile.pauseMultiplier).toBe(0.85);
      expect(profile.emphasis).toBe('strong');
    });

    it('should return nayan-patel profile with slower rate', () => {
      const profile = getPersonaVoiceProfile('nayan-patel');

      expect(profile.rate).toBe(0.85);
      expect(profile.pitch).toBe(-3);
      expect(profile.pauseMultiplier).toBe(1.4);
    });

    it('should return peter-john profile', () => {
      const profile = getPersonaVoiceProfile('peter-john');

      expect(profile.rate).toBe(1.15);
      expect(profile.emphasis).toBe('strong');
    });

    it('should return alex-chen profile', () => {
      const profile = getPersonaVoiceProfile('alex-chen');

      expect(profile.rate).toBe(1.05);
    });

    it('should return maya-santos profile', () => {
      const profile = getPersonaVoiceProfile('maya-santos');

      expect(profile.rate).toBe(0.95);
    });

    it('should fallback to ferni for unknown persona', () => {
      const profile = getPersonaVoiceProfile('unknown-persona');

      expect(profile).toEqual(getPersonaVoiceProfile('ferni'));
    });
  });

  describe('adjustForUserEmotion', () => {
    const baseModifiers: VoiceModifiers = {
      rate: 1.0,
      pitch: 0,
      pauseMultiplier: 1.0,
      emphasis: 'moderate',
    };

    it('should slow down for distressed users', () => {
      const emotion: EmotionResult = {
        primary: 'distressed',
        secondary: null,
        confidence: 0.8,
        energy: 'low',
        valence: 'negative',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBeLessThan(baseModifiers.rate);
      expect(adjusted.pauseMultiplier).toBeGreaterThan(baseModifiers.pauseMultiplier);
      expect(adjusted.emphasis).toBe('reduced');
    });

    it('should slow down for anxious users', () => {
      const emotion: EmotionResult = {
        primary: 'anxious',
        secondary: null,
        confidence: 0.8,
        energy: 'medium',
        valence: 'negative',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBeLessThan(1.0);
      expect(adjusted.emphasis).toBe('reduced');
    });

    it('should slow down for sad users', () => {
      const emotion: EmotionResult = {
        primary: 'sad',
        secondary: null,
        confidence: 0.8,
        energy: 'low',
        valence: 'negative',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(baseModifiers.rate * 0.85);
    });

    it('should match energy for excited high-energy users', () => {
      const emotion: EmotionResult = {
        primary: 'excited',
        secondary: null,
        confidence: 0.9,
        energy: 'high',
        valence: 'positive',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBeGreaterThan(baseModifiers.rate);
      expect(adjusted.pauseMultiplier).toBeLessThan(baseModifiers.pauseMultiplier);
      expect(adjusted.emphasis).toBe('strong');
    });

    it('should match energy for happy high-energy users', () => {
      const emotion: EmotionResult = {
        primary: 'happy',
        secondary: null,
        confidence: 0.9,
        energy: 'high',
        valence: 'positive',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(baseModifiers.rate * 1.1);
    });

    it('should not change much for happy low-energy users', () => {
      const emotion: EmotionResult = {
        primary: 'happy',
        secondary: null,
        confidence: 0.9,
        energy: 'low',
        valence: 'positive',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      // Should not trigger high-energy changes
      expect(adjusted.rate).toBe(baseModifiers.rate);
    });

    it('should stay calm for angry users', () => {
      const emotion: EmotionResult = {
        primary: 'angry',
        secondary: null,
        confidence: 0.8,
        energy: 'high',
        valence: 'negative',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBeLessThan(baseModifiers.rate);
      expect(adjusted.pauseMultiplier).toBeGreaterThan(baseModifiers.pauseMultiplier);
    });

    it('should stay calm for frustrated users', () => {
      const emotion: EmotionResult = {
        primary: 'frustrated',
        secondary: null,
        confidence: 0.8,
        energy: 'medium',
        valence: 'negative',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(baseModifiers.rate * 0.95);
    });

    it('should slow down for clarity with confused users', () => {
      const emotion: EmotionResult = {
        primary: 'confused',
        secondary: null,
        confidence: 0.7,
        energy: 'medium',
        valence: 'negative',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(baseModifiers.rate * 0.9);
      expect(adjusted.pauseMultiplier).toBe(baseModifiers.pauseMultiplier * 1.2);
    });

    it('should not modify for neutral emotion', () => {
      const emotion: EmotionResult = {
        primary: 'neutral',
        secondary: null,
        confidence: 0.9,
        energy: 'medium',
        valence: 'neutral',
      };

      const adjusted = adjustForUserEmotion(baseModifiers, emotion);

      expect(adjusted.rate).toBe(baseModifiers.rate);
      expect(adjusted.pauseMultiplier).toBe(baseModifiers.pauseMultiplier);
      expect(adjusted.emphasis).toBe(baseModifiers.emphasis);
    });
  });

  describe('applyRate', () => {
    it('should wrap content with prosody rate tag', () => {
      const result = applyRate('Hello world', 1.2);

      expect(result).toBe('<prosody rate="120%">Hello world</prosody>');
    });

    it('should not wrap content when rate is close to 1.0', () => {
      const result = applyRate('Hello world', 1.0);

      expect(result).toBe('Hello world');
    });

    it('should not wrap content when rate is within 0.05 of 1.0', () => {
      expect(applyRate('test', 1.02)).toBe('test');
      expect(applyRate('test', 0.98)).toBe('test');
    });

    it('should apply rate when difference is significant', () => {
      expect(applyRate('test', 1.1)).toContain('<prosody rate="110%">');
      expect(applyRate('test', 0.9)).toContain('<prosody rate="90%">');
    });

    it('should round rate percentage', () => {
      const result = applyRate('test', 0.857);

      expect(result).toBe('<prosody rate="86%">test</prosody>');
    });
  });

  describe('applyPauseMultiplier', () => {
    it('should multiply pause times', () => {
      const content = '<break time="200ms"/>';
      const result = applyPauseMultiplier(content, 1.5);

      expect(result).toBe('<break time="300ms"/>');
    });

    it('should handle multiple breaks', () => {
      const content = 'Hello <break time="100ms"/> world <break time="200ms"/> test';
      const result = applyPauseMultiplier(content, 2.0);

      expect(result).toContain('time="200ms"');
      expect(result).toContain('time="400ms"');
    });

    it('should round resulting times', () => {
      const content = '<break time="100ms"/>';
      const result = applyPauseMultiplier(content, 1.33);

      expect(result).toBe('<break time="133ms"/>');
    });

    it('should handle content with no breaks', () => {
      const content = 'Hello world with no breaks';
      const result = applyPauseMultiplier(content, 2.0);

      expect(result).toBe(content);
    });
  });

  describe('addEmphasis', () => {
    it('should add emphasis tags to specified words', () => {
      const content = 'This is important information';
      const result = addEmphasis(content, ['important'], 'strong');

      expect(result).toBe('This is <emphasis level="strong">important</emphasis> information');
    });

    it('should handle multiple words', () => {
      const content = 'This is very important and critical';
      const result = addEmphasis(content, ['important', 'critical'], 'moderate');

      expect(result).toContain('<emphasis level="moderate">important</emphasis>');
      expect(result).toContain('<emphasis level="moderate">critical</emphasis>');
    });

    it('should be case insensitive', () => {
      const content = 'IMPORTANT and Important and important';
      const result = addEmphasis(content, ['important'], 'strong');

      expect(result.match(/<emphasis/g)?.length).toBe(3);
    });

    it('should match whole words only', () => {
      const content = 'importantly is not the same as important';
      const result = addEmphasis(content, ['important'], 'strong');

      // Should only match "important", not "importantly"
      expect(result.match(/<emphasis/g)?.length).toBe(1);
      expect(result).toContain('importantly is not');
    });

    it('should handle empty words array', () => {
      const content = 'Hello world';
      const result = addEmphasis(content, [], 'strong');

      expect(result).toBe(content);
    });
  });

  describe('insertThinkingSound', () => {
    it('should return a thinking sound for ferni', () => {
      const sound = insertThinkingSound('ferni');

      expect(sound).toContain('<break');
      expect(sound.match(/Hmm|Let me think/)).toBeTruthy();
    });

    it('should return a thinking sound for jordan-taylor', () => {
      const sound = insertThinkingSound('jordan-taylor');

      expect(sound).toContain('<break');
      expect(sound.match(/Ooh|So/)).toBeTruthy();
    });

    it('should return a thinking sound for nayan-patel', () => {
      const sound = insertThinkingSound('nayan-patel');

      expect(sound).toContain('<break');
      expect(sound.match(/Hmm|Well/)).toBeTruthy();
    });

    it('should return a thinking sound for peter-john', () => {
      const sound = insertThinkingSound('peter-john');

      expect(sound).toContain('<break');
    });

    it('should return a thinking sound for alex-chen', () => {
      const sound = insertThinkingSound('alex-chen');

      expect(sound).toContain('<break');
    });

    it('should return a thinking sound for maya-santos', () => {
      const sound = insertThinkingSound('maya-santos');

      expect(sound).toContain('<break');
    });

    it('should fallback to ferni for unknown persona', () => {
      const sound = insertThinkingSound('unknown');

      expect(sound).toContain('<break');
    });
  });

  describe('insertFiller', () => {
    it('should return a filler for ferni', () => {
      const filler = insertFiller('ferni');

      expect(['you know', 'I mean', 'so', 'like']).toContain(filler);
    });

    it('should return a filler for jordan-taylor', () => {
      const filler = insertFiller('jordan-taylor');

      expect(['so like', 'okay so', 'and then']).toContain(filler);
    });

    it('should return a filler for nayan-patel', () => {
      const filler = insertFiller('nayan-patel');

      expect(['well', 'now', 'you see']).toContain(filler);
    });

    it('should return a filler for peter-john', () => {
      const filler = insertFiller('peter-john');

      expect(['look', "here's the thing", 'so']).toContain(filler);
    });

    it('should return a filler for alex-chen', () => {
      const filler = insertFiller('alex-chen');

      expect(['so', 'basically', 'right']).toContain(filler);
    });

    it('should return a filler for maya-santos', () => {
      const filler = insertFiller('maya-santos');

      expect(['you know', 'so', 'and']).toContain(filler);
    });

    it('should fallback to ferni for unknown persona', () => {
      const filler = insertFiller('unknown');

      expect(['you know', 'I mean', 'so', 'like']).toContain(filler);
    });
  });
});
