/**
 * Superhuman Voice Enhancements Tests
 *
 * Tests for the "Better Than Human" voice features:
 * - Prosodic mirroring
 * - Vulnerability voice softening
 * - Silence presence phrases
 * - Anticipatory comfort sounds
 * - Memory-informed baseline
 * - Emotional transition bridges
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySuperhmanVoice,
  calculateProsodicMirroring,
  detectHeavyContentType,
  getAnticipatoryComfortSound,
  getEmotionalTransitionBridge,
  getLastEmotion,
  getMemoryInformedBaseline,
  getSilencePresencePhrase,
  getVulnerabilityVoiceAdjustments,
  resetSuperhmanVoiceSession,
  updateSuperhmanVoiceSession,
  type SuperhumanVoiceContext,
} from '../adaptive-ssml/superhuman-voice.js';

describe('Superhuman Voice Enhancements', () => {
  beforeEach(() => {
    resetSuperhmanVoiceSession('test-session');
  });

  describe('Prosodic Mirroring', () => {
    it('should return neutral speed for missing WPM', () => {
      const result = calculateProsodicMirroring(undefined);
      expect(result.speedMultiplier).toBe(1.0);
      expect(result.reason).toBe('no WPM data');
    });

    it('should slow down for slow speakers', () => {
      const result = calculateProsodicMirroring(100);
      expect(result.speedMultiplier).toBeLessThan(1.0);
      expect(result.reason).toContain('slow');
    });

    it('should speed up for fast speakers', () => {
      const result = calculateProsodicMirroring(200);
      expect(result.speedMultiplier).toBeGreaterThan(1.0);
      expect(result.reason).toContain('quick');
    });

    it('should stay neutral for normal pace', () => {
      const result = calculateProsodicMirroring(150);
      expect(result.speedMultiplier).toBeCloseTo(1.0, 1);
      expect(result.reason).toBe('natural pace');
    });

    it('should clamp to safe speed range', () => {
      const veryFast = calculateProsodicMirroring(300);
      expect(veryFast.speedMultiplier).toBeLessThanOrEqual(1.15);

      const verySlow = calculateProsodicMirroring(50);
      expect(verySlow.speedMultiplier).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Vulnerability Voice Softening', () => {
    it('should return neutral adjustments for surface depth', () => {
      const result = getVulnerabilityVoiceAdjustments('surface');
      expect(result.speedMultiplier).toBe(1.0);
      expect(result.volumeMultiplier).toBe(1.0);
      expect(result.pauseMultiplier).toBe(1.0);
    });

    it('should soften for personal depth', () => {
      const result = getVulnerabilityVoiceAdjustments('personal');
      expect(result.speedMultiplier).toBeLessThan(1.0);
      expect(result.volumeMultiplier).toBeLessThan(1.0);
      expect(result.pauseMultiplier).toBeGreaterThan(1.0);
      expect(result.emotion).toBe('affectionate');
    });

    it('should soften more for vulnerable depth', () => {
      const result = getVulnerabilityVoiceAdjustments('vulnerable');
      expect(result.speedMultiplier).toBe(0.85);
      expect(result.volumeMultiplier).toBe(0.85);
      expect(result.openingPauseMs).toBe(250);
      expect(result.emotion).toBe('sympathetic');
    });

    it('should be most gentle for raw depth', () => {
      const result = getVulnerabilityVoiceAdjustments('raw');
      expect(result.speedMultiplier).toBe(0.78);
      expect(result.volumeMultiplier).toBe(0.75);
      expect(result.pauseMultiplier).toBe(1.6);
      expect(result.openingPauseMs).toBe(400);
    });

    it('should handle undefined depth', () => {
      const result = getVulnerabilityVoiceAdjustments(undefined);
      expect(result.speedMultiplier).toBe(1.0);
    });
  });

  describe('Silence Presence Phrases', () => {
    it('should return null for normal presence level', () => {
      const result = getSilencePresencePhrase('normal');
      expect(result).toBeNull();
    });

    it('should return a phrase for gentle presence level', () => {
      const result = getSilencePresencePhrase('gentle');
      expect(result).toBeTruthy();
      expect(result).toContain('<break');
    });

    it('should return a phrase for holding presence level', () => {
      const result = getSilencePresencePhrase('holding');
      expect(result).toBeTruthy();
    });

    it('should return a phrase for silent presence level', () => {
      const result = getSilencePresencePhrase('silent');
      expect(result).toBeTruthy();
    });
  });

  describe('Anticipatory Comfort Sounds', () => {
    it('should detect grief content', () => {
      expect(detectHeavyContentType('My grandmother passed away')).toBe('grief');
      expect(detectHeavyContentType('I miss her so much')).toBe('grief');
      expect(detectHeavyContentType("They're gone")).toBe('grief');
    });

    it('should detect fear content', () => {
      expect(detectHeavyContentType("I'm terrified of what might happen")).toBe('fear');
      expect(detectHeavyContentType("I'm so anxious about this")).toBe('fear');
    });

    it('should detect frustration content', () => {
      expect(detectHeavyContentType("I'm so frustrated with this")).toBe('frustration');
      expect(detectHeavyContentType("I'm fed up with everything")).toBe('frustration');
    });

    it('should detect general heavy content', () => {
      expect(detectHeavyContentType("I've been struggling with this")).toBe('heavyContent');
    });

    it('should return null for light content', () => {
      expect(detectHeavyContentType('I had a great day!')).toBeNull();
    });

    it('should return comfort sounds with SSML', () => {
      const grief = getAnticipatoryComfortSound('grief');
      expect(grief).toContain('<');

      const fear = getAnticipatoryComfortSound('fear');
      expect(fear).toContain('<');
    });
  });

  describe('Memory-Informed Baseline', () => {
    it('should return null for unknown context', () => {
      expect(getMemoryInformedBaseline(null)).toBeNull();
      expect(getMemoryInformedBaseline(undefined)).toBeNull();
    });

    it('should slow down for grieving users', () => {
      const result = getMemoryInformedBaseline('grieving');
      expect(result).toBeTruthy();
      expect(result!.baseSpeedAdjust).toBeLessThan(0);
      expect(result!.defaultEmotion).toBe('sympathetic');
    });

    it('should be more energetic for celebrating users', () => {
      const result = getMemoryInformedBaseline('celebrating');
      expect(result).toBeTruthy();
      expect(result!.baseSpeedAdjust).toBeGreaterThan(0);
      expect(result!.defaultEmotion).toBe('happy');
    });

    it('should be supportive for stressed users', () => {
      const result = getMemoryInformedBaseline('stressed');
      expect(result).toBeTruthy();
      expect(result!.openingStyle).toBe('supportive');
    });
  });

  describe('Emotional Transition Bridges', () => {
    it('should return null for same emotion', () => {
      expect(getEmotionalTransitionBridge('happy', 'happy')).toBeNull();
    });

    it('should return null for undefined emotions', () => {
      expect(getEmotionalTransitionBridge(undefined, 'happy')).toBeNull();
      expect(getEmotionalTransitionBridge('happy', undefined)).toBeNull();
    });

    it('should provide bridge from sympathetic to curious', () => {
      const bridge = getEmotionalTransitionBridge('sympathetic', 'curious');
      expect(bridge).toBeTruthy();
      expect(bridge).toContain('<break');
    });

    it('should provide bridge from happy to sympathetic', () => {
      const bridge = getEmotionalTransitionBridge('happy', 'sympathetic');
      expect(bridge).toBeTruthy();
    });
  });

  describe('applySuperhmanVoice', () => {
    it('should return original text for empty input', () => {
      const result = applySuperhmanVoice('', { sessionId: 'test' });
      expect(result.text).toBe('');
      expect(result.appliedEnhancements).toHaveLength(0);
    });

    it('should apply prosodic mirroring for fast speaker', () => {
      const context: SuperhumanVoiceContext = {
        sessionId: 'test',
        userWPM: 200,
      };
      const result = applySuperhmanVoice('Hello there!', context);
      expect(result.speedMultiplier).toBeGreaterThan(1.0);
      expect(result.appliedEnhancements.some((e) => e.includes('prosodic_mirroring'))).toBe(true);
    });

    it('should apply vulnerability softening', () => {
      const context: SuperhumanVoiceContext = {
        sessionId: 'test',
        vulnerabilityDepth: 'vulnerable',
      };
      const result = applySuperhmanVoice('I understand.', context);
      expect(result.speedMultiplier).toBeLessThan(1.0);
      expect(result.volumeMultiplier).toBeLessThan(1.0);
      expect(result.appliedEnhancements.some((e) => e.includes('vulnerability_softening'))).toBe(
        true
      );
      expect(result.text).toContain('<emotion value="sympathetic"');
    });

    it('should apply memory baseline for grieving user', () => {
      const context: SuperhumanVoiceContext = {
        sessionId: 'test',
        knownUserContext: 'grieving',
      };
      const result = applySuperhmanVoice('I hear you.', context);
      expect(result.appliedEnhancements.some((e) => e.includes('memory_baseline'))).toBe(true);
      expect(result.text).toContain('<emotion');
    });

    it('should combine multiple enhancements', () => {
      const context: SuperhumanVoiceContext = {
        sessionId: 'test',
        userWPM: 100,
        vulnerabilityDepth: 'personal',
        knownUserContext: 'struggling',
      };
      const result = applySuperhmanVoice('Take your time.', context);
      expect(result.appliedEnhancements.length).toBeGreaterThanOrEqual(2);
    });

    it('should clamp multipliers to safe ranges', () => {
      const context: SuperhumanVoiceContext = {
        sessionId: 'test',
        userWPM: 50, // Very slow
        vulnerabilityDepth: 'raw',
        knownUserContext: 'grieving',
      };
      const result = applySuperhmanVoice('I am here.', context);
      expect(result.speedMultiplier).toBeGreaterThanOrEqual(0.7);
      expect(result.volumeMultiplier).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe('Session Tracking', () => {
    it('should track last emotion across turns', () => {
      const result1 = applySuperhmanVoice('Great news!', {
        sessionId: 'test-session',
        currentEmotion: 'happy',
      });

      updateSuperhmanVoiceSession('test-session', result1, 'happy');
      expect(getLastEmotion('test-session')).toBe('happy');
    });

    it('should reset session state', () => {
      updateSuperhmanVoiceSession(
        'test-session',
        {
          text: '',
          appliedEnhancements: [],
          speedMultiplier: 1,
          volumeMultiplier: 1,
          pauseMultiplier: 1,
        },
        'happy'
      );
      expect(getLastEmotion('test-session')).toBe('happy');

      resetSuperhmanVoiceSession('test-session');
      expect(getLastEmotion('test-session')).toBeNull();
    });
  });
});
