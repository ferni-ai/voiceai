/**
 * Feature Flags Tests
 *
 * Tests for the centralized feature flag system.
 *
 * @module @ferni/config/__tests__/feature-flags
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emergencyDisableLifeCoachDomain,
  emergencyDisablePersonalJourney,
  getEnabledDebugCategories,
  getEnabledLifeCoachDomains,
  getEvalOpsSampleRate,
  getFeatureFlags,
  getPersonalJourneyRolloutPercent,
  isDebugEnabled,
  isEvalOpsEnabled,
  isEvalOpsFeatureEnabled,
  isExperimentalEnabled,
  isFeatureEnabled,
  isHumanizationEnabled,
  isLifeCoachAnalyticsEnabled,
  isLifeCoachDomainEnabled,
  isPersonalJourneyEnabled,
  isPersonalJourneyFeatureEnabled,
  isUserInPersonalJourneyRollout,
  reloadFeatureFlags,
  resetFeatureFlags,
  setFeatureFlagsForTesting,
  type FeatureFlags,
  type LifeCoachDomain,
} from '../feature-flags.js';

describe('Feature Flags', () => {
  beforeEach(() => {
    resetFeatureFlags();
  });

  afterEach(() => {
    resetFeatureFlags();
    vi.unstubAllEnvs();
  });

  describe('getFeatureFlags', () => {
    it('should return default flags', () => {
      const flags = getFeatureFlags();
      expect(flags).toBeDefined();
      expect(flags.humanization).toBeDefined();
      expect(flags.debug).toBeDefined();
      expect(flags.experimental).toBeDefined();
    });

    it('should cache flags on subsequent calls', () => {
      const flags1 = getFeatureFlags();
      const flags2 = getFeatureFlags();
      expect(flags1).toBe(flags2);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should check nested feature by path', () => {
      expect(isFeatureEnabled('humanization.enabled')).toBe(true);
      expect(isFeatureEnabled('humanization.disfluencies')).toBe(true);
    });

    it('should return false for non-existent paths', () => {
      expect(isFeatureEnabled('nonexistent.path')).toBe(false);
    });
  });

  describe('isHumanizationEnabled', () => {
    it('should return true by default', () => {
      expect(isHumanizationEnabled()).toBe(true);
    });

    it('should return false when disabled via override', () => {
      setFeatureFlagsForTesting({
        humanization: { enabled: false } as FeatureFlags['humanization'],
      });
      expect(isHumanizationEnabled()).toBe(false);
    });
  });

  describe('isDebugEnabled', () => {
    it('should return false for all debug categories by default', () => {
      expect(isDebugEnabled('agent')).toBe(false);
      expect(isDebugEnabled('humanizing')).toBe(false);
      expect(isDebugEnabled('memory')).toBe(false);
      expect(isDebugEnabled('tools')).toBe(false);
    });

    it('should return true when enabled via override', () => {
      setFeatureFlagsForTesting({ debug: { agent: true } as FeatureFlags['debug'] });
      expect(isDebugEnabled('agent')).toBe(true);
    });
  });

  describe('getEnabledDebugCategories', () => {
    it('should return empty array by default', () => {
      expect(getEnabledDebugCategories()).toEqual([]);
    });

    it('should return enabled categories', () => {
      setFeatureFlagsForTesting({
        debug: { agent: true, memory: true, humanizing: false } as FeatureFlags['debug'],
      });
      const enabled = getEnabledDebugCategories();
      expect(enabled).toContain('agent');
      expect(enabled).toContain('memory');
      expect(enabled).not.toContain('humanizing');
    });
  });

  describe('isExperimentalEnabled', () => {
    it('should check experimental features', () => {
      expect(isExperimentalEnabled('voiceEmotionDetection')).toBe(true);
      expect(isExperimentalEnabled('sessionContext')).toBe(false);
    });
  });

  describe('reloadFeatureFlags', () => {
    it('should clear cache and reload flags', () => {
      const flags1 = getFeatureFlags();
      const flags2 = reloadFeatureFlags();
      // Should be different objects after reload
      expect(flags1).not.toBe(flags2);
    });
  });

  describe('setFeatureFlagsForTesting', () => {
    it('should override specific flags', () => {
      expect(isHumanizationEnabled()).toBe(true);

      setFeatureFlagsForTesting({
        humanization: { enabled: false } as FeatureFlags['humanization'],
      });

      expect(isHumanizationEnabled()).toBe(false);
    });

    it('should deep merge overrides', () => {
      setFeatureFlagsForTesting({
        humanization: { disfluencies: false } as FeatureFlags['humanization'],
      });

      const flags = getFeatureFlags();
      expect(flags.humanization.disfluencies).toBe(false);
      expect(flags.humanization.backchannels).toBe(true); // Other fields preserved
    });
  });

  describe('EvalOps Helpers', () => {
    it('isEvalOpsEnabled should return true by default', () => {
      expect(isEvalOpsEnabled()).toBe(true);
    });

    it('isEvalOpsFeatureEnabled should check master switch first', () => {
      setFeatureFlagsForTesting({
        evalops: { enabled: false } as FeatureFlags['evalops'],
      });
      expect(isEvalOpsFeatureEnabled('autoSampling')).toBe(false);
    });

    it('getEvalOpsSampleRate should return sample rate', () => {
      expect(getEvalOpsSampleRate()).toBe(5); // Default
    });

    it('getEvalOpsSampleRate should return 0 when disabled', () => {
      setFeatureFlagsForTesting({
        evalops: { enabled: false } as FeatureFlags['evalops'],
      });
      expect(getEvalOpsSampleRate()).toBe(0);
    });
  });

  describe('Life Coach Domain Helpers', () => {
    it('isLifeCoachDomainEnabled should always return true for crisis', () => {
      // Crisis is ALWAYS enabled for safety
      expect(isLifeCoachDomainEnabled('crisis')).toBe(true);

      // Even when master switch is off
      setFeatureFlagsForTesting({
        lifeCoachDomains: { enabled: false } as FeatureFlags['lifeCoachDomains'],
      });
      expect(isLifeCoachDomainEnabled('crisis')).toBe(true);
    });

    it('isLifeCoachDomainEnabled should respect master switch for other domains', () => {
      expect(isLifeCoachDomainEnabled('health')).toBe(true);

      setFeatureFlagsForTesting({
        lifeCoachDomains: { enabled: false } as FeatureFlags['lifeCoachDomains'],
      });
      expect(isLifeCoachDomainEnabled('health')).toBe(false);
    });

    it('getEnabledLifeCoachDomains should return all enabled domains', () => {
      const domains = getEnabledLifeCoachDomains();
      expect(domains).toContain('crisis');
      expect(domains).toContain('health');
      expect(domains).toContain('career');
    });

    it('getEnabledLifeCoachDomains should only return crisis when disabled', () => {
      setFeatureFlagsForTesting({
        lifeCoachDomains: { enabled: false } as FeatureFlags['lifeCoachDomains'],
      });
      const domains = getEnabledLifeCoachDomains();
      expect(domains).toEqual(['crisis']);
    });

    it('isLifeCoachAnalyticsEnabled should check both flags', () => {
      expect(isLifeCoachAnalyticsEnabled()).toBe(true);

      setFeatureFlagsForTesting({
        lifeCoachDomains: { enabled: true, analytics: false } as FeatureFlags['lifeCoachDomains'],
      });
      expect(isLifeCoachAnalyticsEnabled()).toBe(false);
    });

    it('emergencyDisableLifeCoachDomain should disable domain', () => {
      expect(isLifeCoachDomainEnabled('health')).toBe(true);

      const result = emergencyDisableLifeCoachDomain('health', 'test reason');
      expect(result).toBe(true);
      expect(isLifeCoachDomainEnabled('health')).toBe(false);
    });

    it('emergencyDisableLifeCoachDomain should NOT disable crisis', () => {
      const result = emergencyDisableLifeCoachDomain('crisis', 'test reason');
      expect(result).toBe(false);
      expect(isLifeCoachDomainEnabled('crisis')).toBe(true);
    });
  });

  describe('Personal Journey Helpers', () => {
    it('isPersonalJourneyEnabled should return true by default', () => {
      expect(isPersonalJourneyEnabled()).toBe(true);
    });

    it('isPersonalJourneyFeatureEnabled should check master switch first', () => {
      setFeatureFlagsForTesting({
        personalJourney: { enabled: false } as FeatureFlags['personalJourney'],
      });
      expect(isPersonalJourneyFeatureEnabled('rhythmAwareness')).toBe(false);
    });

    it('isUserInPersonalJourneyRollout should return true at 100% rollout', () => {
      expect(isUserInPersonalJourneyRollout('any-user-id')).toBe(true);
    });

    it('isUserInPersonalJourneyRollout should return false when disabled', () => {
      setFeatureFlagsForTesting({
        personalJourney: { enabled: false } as FeatureFlags['personalJourney'],
      });
      expect(isUserInPersonalJourneyRollout('any-user-id')).toBe(false);
    });

    it('isUserInPersonalJourneyRollout should be deterministic for same user', () => {
      setFeatureFlagsForTesting({
        personalJourney: { enabled: true, rolloutPercent: 50 } as FeatureFlags['personalJourney'],
      });

      const userId = 'test-user-123';
      const result1 = isUserInPersonalJourneyRollout(userId);
      const result2 = isUserInPersonalJourneyRollout(userId);
      expect(result1).toBe(result2); // Same user, same result
    });

    it('getPersonalJourneyRolloutPercent should return rollout percentage', () => {
      expect(getPersonalJourneyRolloutPercent()).toBe(100);
    });

    it('getPersonalJourneyRolloutPercent should return 0 when disabled', () => {
      setFeatureFlagsForTesting({
        personalJourney: { enabled: false } as FeatureFlags['personalJourney'],
      });
      expect(getPersonalJourneyRolloutPercent()).toBe(0);
    });

    it('emergencyDisablePersonalJourney should disable feature', () => {
      expect(isPersonalJourneyEnabled()).toBe(true);

      emergencyDisablePersonalJourney('test reason');

      expect(isPersonalJourneyEnabled()).toBe(false);
    });
  });

  describe('Environment Variable Overrides', () => {
    it('should override flags from environment variables', () => {
      vi.stubEnv('DEBUG_AGENT', 'true');

      reloadFeatureFlags();

      expect(isDebugEnabled('agent')).toBe(true);
    });

    it('should parse boolean env vars correctly', () => {
      vi.stubEnv('DEBUG_MEMORY', '1');
      vi.stubEnv('DEBUG_TOOLS', 'yes');

      reloadFeatureFlags();

      expect(isDebugEnabled('memory')).toBe(true);
      expect(isDebugEnabled('tools')).toBe(true);
    });

    it('should handle false values', () => {
      vi.stubEnv('HUMANIZATION_ENABLED', 'false');

      reloadFeatureFlags();

      expect(isHumanizationEnabled()).toBe(false);
    });
  });
});
