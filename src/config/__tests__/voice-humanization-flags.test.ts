/**
 * Voice Humanization Flags Tests
 *
 * Tests for voice humanization feature flags system.
 *
 * @module @ferni/config/__tests__/voice-humanization-flags
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FLAGS,
  DEVELOPMENT_FLAGS,
  getFlags,
  getSessionFlags,
  initializeFlags,
  isEnabledForSession,
  isFeatureEnabled,
  resetFlags,
  STAGING_FLAGS,
  updateFlags,
  voiceHumanizationFlags,
  type VoiceHumanizationFlags,
} from '../voice-humanization-flags.js';

describe('Voice Humanization Flags', () => {
  beforeEach(() => {
    resetFlags();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetFlags();
    vi.unstubAllEnvs();
  });

  describe('DEFAULT_FLAGS', () => {
    it('should have all phase 1 features enabled by default', () => {
      expect(DEFAULT_FLAGS.enableProsodyTurnPrediction).toBe(true);
      expect(DEFAULT_FLAGS.enableMicroInterruptions).toBe(true);
      expect(DEFAULT_FLAGS.enableEmotionalArcTts).toBe(true);
    });

    it('should have 100% rollout by default', () => {
      expect(DEFAULT_FLAGS.rolloutPercentage).toBe(100);
    });

    it('should have metrics enabled by default', () => {
      expect(DEFAULT_FLAGS.enableMetrics).toBe(true);
    });

    it('should have verbose logging disabled by default', () => {
      expect(DEFAULT_FLAGS.enableVerboseLogging).toBe(false);
    });
  });

  describe('STAGING_FLAGS', () => {
    it('should extend DEFAULT_FLAGS', () => {
      expect(STAGING_FLAGS.enableProsodyTurnPrediction).toBe(DEFAULT_FLAGS.enableProsodyTurnPrediction);
    });

    it('should have verbose logging enabled', () => {
      expect(STAGING_FLAGS.enableVerboseLogging).toBe(true);
    });
  });

  describe('DEVELOPMENT_FLAGS', () => {
    it('should have all features enabled', () => {
      expect(DEVELOPMENT_FLAGS.enableEnhancedVoiceFingerprinting).toBe(true);
      expect(DEVELOPMENT_FLAGS.enableVoiceAuthentication).toBe(true);
    });

    it('should have verbose logging enabled', () => {
      expect(DEVELOPMENT_FLAGS.enableVerboseLogging).toBe(true);
    });

    it('should have lower cache confidence threshold', () => {
      expect(DEVELOPMENT_FLAGS.cacheConfidenceThreshold).toBe(0.5);
    });
  });

  describe('initializeFlags', () => {
    it('should use development flags in development environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      initializeFlags();
      const flags = getFlags();
      expect(flags.enableVerboseLogging).toBe(true);
    });

    it('should use staging flags in staging environment', () => {
      vi.stubEnv('NODE_ENV', 'staging');
      resetFlags();
      initializeFlags();
      const flags = getFlags();
      expect(flags.enableVerboseLogging).toBe(true);
    });

    it('should use default flags in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      resetFlags();
      initializeFlags();
      const flags = getFlags();
      expect(flags.enableVerboseLogging).toBe(false);
    });

    it('should only initialize once', () => {
      initializeFlags();
      const flags1 = getFlags();

      // Second call should not change anything
      initializeFlags();
      const flags2 = getFlags();

      expect(flags1).toEqual(flags2);
    });
  });

  describe('getFlags', () => {
    it('should return a copy of current flags', () => {
      const flags1 = getFlags();
      const flags2 = getFlags();

      // Should be equal but not same object (copies)
      expect(flags1).toEqual(flags2);
      expect(flags1).not.toBe(flags2);
    });

    it('should auto-initialize if not initialized', () => {
      const flags = getFlags();
      expect(flags).toBeDefined();
      expect(flags.enableProsodyTurnPrediction).toBeDefined();
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true for enabled features', () => {
      // Default flags should have these enabled
      const flags = getFlags();
      expect(isFeatureEnabled('enableProsodyTurnPrediction')).toBe(
        flags.enableProsodyTurnPrediction
      );
      expect(isFeatureEnabled('enableMicroInterruptions')).toBe(
        flags.enableMicroInterruptions
      );
    });

    it('should return correct value after updateFlags', () => {
      const before = isFeatureEnabled('enableProsodyTurnPrediction');
      updateFlags({ enableProsodyTurnPrediction: !before });
      expect(isFeatureEnabled('enableProsodyTurnPrediction')).toBe(!before);
    });
  });

  describe('isEnabledForSession', () => {
    it('should return true at 100% rollout', () => {
      // With default 100% rollout, all sessions should be enabled
      const flags = getFlags();
      if (flags.rolloutPercentage >= 100) {
        expect(isEnabledForSession('any-session-id')).toBe(true);
      }
    });

    it('should return false at 0% rollout when set', () => {
      // Save current
      const before = getFlags().rolloutPercentage;
      updateFlags({ rolloutPercentage: 0 });

      const result = isEnabledForSession('any-session-id');

      // Restore
      updateFlags({ rolloutPercentage: before });

      expect(result).toBe(false);
    });

    it('should be deterministic for same session ID', () => {
      // Save current
      const before = getFlags().rolloutPercentage;
      updateFlags({ rolloutPercentage: 50 });

      const sessionId = 'test-session-123';
      const result1 = isEnabledForSession(sessionId);
      const result2 = isEnabledForSession(sessionId);

      // Restore
      updateFlags({ rolloutPercentage: before });

      expect(result1).toBe(result2);
    });

    it('should give different results for different session IDs at partial rollout', () => {
      // Save current
      const before = getFlags().rolloutPercentage;
      updateFlags({ rolloutPercentage: 50 });

      // Test with many session IDs to ensure some are included and some excluded
      const results = new Set<boolean>();
      for (let i = 0; i < 100; i++) {
        results.add(isEnabledForSession(`session-${i}`));
      }

      // Restore
      updateFlags({ rolloutPercentage: before });

      // At 50% rollout, we should see both true and false
      expect(results.size).toBe(2);
    });
  });

  describe('getSessionFlags', () => {
    it('should return flags with isEnabled=true at 100% rollout', () => {
      const flags = getFlags();
      if (flags.rolloutPercentage >= 100) {
        const sessionFlags = getSessionFlags('test-session');
        expect(sessionFlags.isEnabled).toBe(true);
      }
    });

    it('should return disabled flags when session not in rollout', () => {
      // Save current
      const before = getFlags().rolloutPercentage;
      updateFlags({ rolloutPercentage: 0 });

      const sessionFlags = getSessionFlags('test-session');

      // Restore
      updateFlags({ rolloutPercentage: before });

      expect(sessionFlags.isEnabled).toBe(false);
      expect(sessionFlags.enableProsodyTurnPrediction).toBe(false);
      expect(sessionFlags.enableMicroInterruptions).toBe(false);
    });
  });

  describe('updateFlags', () => {
    it('should update specific flags', () => {
      // Get baseline
      const beforeFlags = getFlags();
      const baselineEnabled = beforeFlags.enableLaughterDetection;

      updateFlags({ enableLaughterDetection: !baselineEnabled });

      const flags = getFlags();
      expect(flags.enableLaughterDetection).toBe(!baselineEnabled);
    });

    it('should update rollout percentage', () => {
      // Get baseline
      const beforeFlags = getFlags();
      const newPercentage = beforeFlags.rolloutPercentage === 100 ? 25 : 100;

      updateFlags({ rolloutPercentage: newPercentage });

      const flags = getFlags();
      expect(flags.rolloutPercentage).toBe(newPercentage);
    });
  });

  describe('resetFlags', () => {
    it('should reset to default flags', () => {
      updateFlags({
        enableProsodyTurnPrediction: false,
        rolloutPercentage: 0,
      });

      resetFlags();

      const flags = getFlags();
      expect(flags.enableProsodyTurnPrediction).toBe(true);
      expect(flags.rolloutPercentage).toBe(100);
    });
  });

  describe('voiceHumanizationFlags proxy', () => {
    it('should provide direct access to flags', () => {
      // Verify proxy provides access to current flags
      const flags = getFlags();
      expect(voiceHumanizationFlags.enableProsodyTurnPrediction).toBe(
        flags.enableProsodyTurnPrediction
      );
      expect(voiceHumanizationFlags.rolloutPercentage).toBe(flags.rolloutPercentage);
    });

    it('should reflect updates', () => {
      const before = voiceHumanizationFlags.enableLaughterDetection;
      updateFlags({ enableLaughterDetection: !before });
      expect(voiceHumanizationFlags.enableLaughterDetection).toBe(!before);
    });
  });

  describe('Environment Variable Overrides', () => {
    it('should respect kill switch', () => {
      vi.stubEnv('VOICE_HUMANIZATION_DISABLED', 'true');
      resetFlags();
      initializeFlags();

      const flags = getFlags();
      expect(flags.enableProsodyTurnPrediction).toBe(false);
      expect(flags.enableMicroInterruptions).toBe(false);
      expect(flags.rolloutPercentage).toBe(0);
    });

    it('should override individual flags from env vars', () => {
      vi.stubEnv('VOICE_HUMANIZATION_ENABLE_PROSODY_TURN_PREDICTION', 'false');
      resetFlags();
      initializeFlags();

      expect(isFeatureEnabled('enableProsodyTurnPrediction')).toBe(false);
    });

    it('should parse rollout percentage from env var', () => {
      vi.stubEnv('VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE', '75');
      resetFlags();
      initializeFlags();

      const flags = getFlags();
      expect(flags.rolloutPercentage).toBe(75);
    });
  });

  describe('Feature Groups', () => {
    describe('Phase 1: Foundation', () => {
      it('should have prosody turn prediction', () => {
        expect(isFeatureEnabled('enableProsodyTurnPrediction')).toBe(true);
      });

      it('should have micro-interruptions', () => {
        expect(isFeatureEnabled('enableMicroInterruptions')).toBe(true);
      });

      it('should have emotional arc TTS', () => {
        expect(isFeatureEnabled('enableEmotionalArcTts')).toBe(true);
      });
    });

    describe('Phase 2: Audio Intelligence', () => {
      it('should have laughter detection', () => {
        expect(isFeatureEnabled('enableLaughterDetection')).toBe(true);
      });

      it('should have ambient awareness', () => {
        expect(isFeatureEnabled('enableAmbientAwareness')).toBe(true);
      });
    });

    describe('Phase 3: Advanced', () => {
      it('should have rhythm mirroring', () => {
        expect(isFeatureEnabled('enableRhythmMirroring')).toBe(true);
      });

      it('should have emotional contagion', () => {
        expect(isFeatureEnabled('enableEmotionalContagion')).toBe(true);
      });

      it('should have voice fingerprinting', () => {
        expect(isFeatureEnabled('enableEnhancedVoiceFingerprinting')).toBe(true);
      });

      it('should have voice authentication', () => {
        expect(isFeatureEnabled('enableVoiceAuthentication')).toBe(true);
      });
    });

    describe('Phase 5: Preemptive Generation', () => {
      it('should have response anticipation enabled', () => {
        expect(isFeatureEnabled('enableResponseAnticipation')).toBe(true);
      });

      it('should have cached responses enabled', () => {
        expect(isFeatureEnabled('useCachedResponses')).toBe(true);
      });

      it('should have appropriate cache confidence threshold', () => {
        const flags = getFlags();
        expect(flags.cacheConfidenceThreshold).toBeGreaterThan(0);
        expect(flags.cacheConfidenceThreshold).toBeLessThan(1);
      });
    });

    describe('Phase 6: Live Backchanneling', () => {
      it('should have live backchanneling enabled', () => {
        expect(isFeatureEnabled('enableLiveBackchanneling')).toBe(true);
      });
    });
  });
});

