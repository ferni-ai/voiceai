/**
 * Unified Flags Facade Tests
 *
 * Tests for the unified feature flags facade.
 *
 * @module @ferni/config/__tests__/unified-flags
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flags, getFlagsSummary, isAnyDebugEnabled } from '../unified-flags.js';
import { resetFeatureFlags, setFeatureFlagsForTesting } from '../feature-flags.js';
import { resetFlags as resetVoiceHumanizationFlags } from '../voice-humanization-flags.js';

describe('Unified Flags Facade', () => {
  beforeEach(() => {
    resetFeatureFlags();
    resetVoiceHumanizationFlags();
  });

  afterEach(() => {
    resetFeatureFlags();
    resetVoiceHumanizationFlags();
    vi.unstubAllEnvs();
  });

  describe('flags.debug', () => {
    it('should provide access to debug flags', () => {
      expect(flags.debug.agent).toBe(false);
      expect(flags.debug.humanizing).toBe(false);
      expect(flags.debug.memory).toBe(false);
      expect(flags.debug.tools).toBe(false);
      expect(flags.debug.handoff).toBe(false);
      expect(flags.debug.audio).toBe(false);
      expect(flags.debug.music).toBe(false);
      expect(flags.debug.itunes).toBe(false);
    });

    it('should reflect changes via setFeatureFlagsForTesting', () => {
      setFeatureFlagsForTesting({
        debug: { agent: true } as any,
      });

      expect(flags.debug.agent).toBe(true);
    });

    it('should provide is() method for any category', () => {
      expect(flags.debug.is('agent')).toBe(false);

      setFeatureFlagsForTesting({
        debug: { memory: true } as any,
      });

      expect(flags.debug.is('memory')).toBe(true);
    });
  });

  describe('flags.experimental', () => {
    it('should provide access to experimental flags', () => {
      // Voice emotion detection is true by default
      expect(flags.experimental.voiceEmotionDetection).toBe(true);
      // Gemini emotion is false by default
      expect(flags.experimental.geminiEmotionAnalysis).toBe(false);
    });

    it('should provide is() method for any feature', () => {
      expect(flags.experimental.is('voiceEmotionDetection')).toBe(true);
      expect(flags.experimental.is('sessionContext')).toBe(false);
    });
  });

  describe('flags.humanization', () => {
    it('should report enabled by default', () => {
      expect(flags.humanization.enabled).toBe(true);
    });

    it('should provide is() method for path-based checks', () => {
      expect(flags.humanization.is('disfluencies')).toBe(true);
      expect(flags.humanization.is('backchannels')).toBe(true);
    });
  });

  describe('flags.evalops', () => {
    it('should report enabled by default', () => {
      expect(flags.evalops.enabled).toBe(true);
    });
  });

  describe('flags.personalJourney', () => {
    it('should report enabled by default', () => {
      expect(flags.personalJourney.enabled).toBe(true);
    });
  });

  describe('flags.lifeCoach', () => {
    it('should always return true for crisis domain', () => {
      expect(flags.lifeCoach.isDomainEnabled('crisis')).toBe(true);
    });

    it('should return true for other enabled domains', () => {
      expect(flags.lifeCoach.isDomainEnabled('health')).toBe(true);
      expect(flags.lifeCoach.isDomainEnabled('career')).toBe(true);
    });
  });

  describe('flags.getAll', () => {
    it('should return full feature flags object', () => {
      const all = flags.getAll();

      expect(all).toBeDefined();
      expect(all.humanization).toBeDefined();
      expect(all.debug).toBeDefined();
      expect(all.experimental).toBeDefined();
    });
  });

  describe('flags.is', () => {
    it('should check any feature by path', () => {
      expect(flags.is('humanization.enabled')).toBe(true);
      expect(flags.is('humanization.disfluencies')).toBe(true);
      expect(flags.is('debug.agent')).toBe(false);
    });
  });

  describe('flags.voiceHumanization', () => {
    it('should provide access to voice humanization flags', () => {
      const vhFlags = flags.voiceHumanization.getFlags();

      expect(vhFlags.enableProsodyTurnPrediction).toBe(true);
      expect(vhFlags.enableMicroInterruptions).toBe(true);
    });

    it('should check session enablement', () => {
      // At 100% rollout, all sessions should be enabled
      expect(flags.voiceHumanization.isSessionEnabled('test-session')).toBe(true);
    });

    it('should provide convenience getters', () => {
      expect(flags.voiceHumanization.prosodyTurnPrediction).toBe(true);
      expect(flags.voiceHumanization.microInterruptions).toBe(true);
      expect(flags.voiceHumanization.laughterDetection).toBe(true);
      expect(flags.voiceHumanization.rhythmMirroring).toBe(true);
      expect(flags.voiceHumanization.emotionalContagion).toBe(true);
      expect(flags.voiceHumanization.liveBackchanneling).toBe(true);
    });

    it('should get session flags with rollout check', () => {
      const sessionFlags = flags.voiceHumanization.getSessionFlags('test-session');

      expect(sessionFlags.isEnabled).toBe(true);
      expect(sessionFlags.enableProsodyTurnPrediction).toBe(true);
    });
  });

  describe('flags.trust', () => {
    // Trust flags require Firestore - skip in unit tests
    // These would be tested in integration tests

    it('should have async isEnabled method', () => {
      expect(typeof flags.trust.isEnabled).toBe('function');
    });

    it('should have getAll method', () => {
      expect(typeof flags.trust.getAll).toBe('function');
    });

    it('should have withFlag method', () => {
      expect(typeof flags.trust.withFlag).toBe('function');
    });
  });

  describe('isAnyDebugEnabled', () => {
    it('should return false when no debug flags are enabled', () => {
      expect(isAnyDebugEnabled()).toBe(false);
    });

    it('should return true when any debug flag is enabled', () => {
      setFeatureFlagsForTesting({
        debug: { agent: true } as any,
      });

      expect(isAnyDebugEnabled()).toBe(true);
    });
  });

  describe('getFlagsSummary', () => {
    it('should return summary object', async () => {
      const summary = await getFlagsSummary();

      expect(summary).toBeDefined();
      expect(Array.isArray(summary.debug)).toBe(true);
      expect(Array.isArray(summary.experimental)).toBe(true);
      expect(typeof summary.voiceHumanizationRollout).toBe('number');
    });

    it('should list enabled debug categories', async () => {
      setFeatureFlagsForTesting({
        debug: { agent: true, memory: true } as any,
      });

      const summary = await getFlagsSummary();

      expect(summary.debug).toContain('agent');
      expect(summary.debug).toContain('memory');
    });

    it('should list enabled experimental features', async () => {
      const summary = await getFlagsSummary();

      // Voice emotion detection is enabled by default
      expect(summary.experimental).toContain('voiceEmotionDetection');
    });
  });
});
