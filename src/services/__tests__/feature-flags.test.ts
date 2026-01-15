/**
 * Feature Flags Service Tests
 *
 * Tests for feature flag management, percentage-based rollout,
 * user overrides, and caching behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn().mockResolvedValue(undefined),
      })),
      get: vi.fn().mockResolvedValue({ docs: [], size: 0 }),
    })),
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => new Date()),
  },
}));

import {
  type TrustFlagId,
  type FlagConfig,
  TRUST_FLAGS,
  isEnabled,
  getFlag,
  getAllFlags,
  setFlag,
  setUserOverride,
  removeUserOverride,
  enableFlag,
  disableFlag,
  setRolloutPercentage,
  resetToDefaults,
  withFlag,
  withFlagAsync,
  getSimpleUtilitiesConfig,
  getFeatureFlags,
} from '../deployment/feature-flags.js';

describe('FeatureFlags', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset flags to defaults before each test
    await resetToDefaults();
  });

  describe('TRUST_FLAGS constant', () => {
    it('should define all trust system flags', () => {
      expect(Object.keys(TRUST_FLAGS).length).toBeGreaterThan(20);
    });

    it('should have core trust flags', () => {
      expect(TRUST_FLAGS['trust.reading-between-lines']).toBeDefined();
      expect(TRUST_FLAGS['trust.boundary-memory']).toBeDefined();
      expect(TRUST_FLAGS['trust.growth-reflection']).toBeDefined();
      expect(TRUST_FLAGS['trust.inside-jokes']).toBeDefined();
    });

    it('should have infrastructure flags', () => {
      expect(TRUST_FLAGS['trust.persistence']).toBeDefined();
      expect(TRUST_FLAGS['trust.cross-device-sync']).toBeDefined();
      expect(TRUST_FLAGS['trust.notifications']).toBeDefined();
    });

    it('should have landing page AI flags', () => {
      expect(TRUST_FLAGS['landing-ai-live-chat']).toBeDefined();
      expect(TRUST_FLAGS['landing-ai-persona-previews']).toBeDefined();
      expect(TRUST_FLAGS['landing-ai-smart-faq']).toBeDefined();
    });

    it('should have descriptions for each flag', () => {
      for (const description of Object.values(TRUST_FLAGS)) {
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(5);
      }
    });
  });

  describe('FlagConfig type', () => {
    it('should create valid flag config', () => {
      const config: FlagConfig = {
        enabled: true,
        percentage: 50,
        overrides: { 'user-1': true, 'user-2': false },
      };

      expect(config.enabled).toBe(true);
      expect(config.percentage).toBe(50);
      expect(config.overrides?.['user-1']).toBe(true);
    });

    it('should allow config without overrides', () => {
      const config: FlagConfig = {
        enabled: false,
        percentage: 0,
      };

      expect(config.overrides).toBeUndefined();
    });
  });

  describe('getFlag', () => {
    it('should return default flag config', () => {
      const config = getFlag('trust.reading-between-lines');
      expect(config).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.percentage).toBe('number');
    });

    it('should return disabled config for unknown flag', () => {
      // Cast to bypass type check for testing
      const config = getFlag('unknown-flag' as TrustFlagId);
      expect(config.enabled).toBe(false);
      expect(config.percentage).toBe(0);
    });

    it('should return consistent config for same flag', () => {
      const config1 = getFlag('trust.boundary-memory');
      const config2 = getFlag('trust.boundary-memory');
      expect(config1).toEqual(config2);
    });
  });

  describe('getAllFlags', () => {
    it('should return all flags with descriptions', () => {
      const flags = getAllFlags();

      expect(Object.keys(flags).length).toBe(Object.keys(TRUST_FLAGS).length);
    });

    it('should include flag configuration', () => {
      const flags = getAllFlags();
      const flagEntry = flags['trust.reading-between-lines'];

      expect(flagEntry.enabled).toBeDefined();
      expect(flagEntry.percentage).toBeDefined();
      expect(flagEntry.description).toBeDefined();
    });

    it('should have descriptions for all flags', () => {
      const flags = getAllFlags();

      for (const flag of Object.values(flags)) {
        expect(typeof flag.description).toBe('string');
      }
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled 100% rollout flag', async () => {
      await setFlag('trust.reading-between-lines', { enabled: true, percentage: 100 });
      const result = isEnabled('trust.reading-between-lines', 'user-123');
      expect(result).toBe(true);
    });

    it('should return false for disabled flag', async () => {
      await setFlag('trust.reading-between-lines', { enabled: false, percentage: 100 });
      const result = isEnabled('trust.reading-between-lines', 'user-123');
      expect(result).toBe(false);
    });

    it('should respect user overrides', async () => {
      await setFlag('trust.boundary-memory', {
        enabled: true,
        percentage: 0, // Would be disabled by percentage
        overrides: { 'special-user': true },
      });

      const overrideResult = isEnabled('trust.boundary-memory', 'special-user');
      expect(overrideResult).toBe(true);
    });

    it('should respect false user override', async () => {
      await setFlag('trust.boundary-memory', {
        enabled: true,
        percentage: 100,
        overrides: { 'blocked-user': false },
      });

      const result = isEnabled('trust.boundary-memory', 'blocked-user');
      expect(result).toBe(false);
    });

    it('should use deterministic hash for percentage rollout', async () => {
      await setFlag('trust.voice-prosody', { enabled: true, percentage: 50 });

      // Same user should always get same result (deterministic)
      const result1 = isEnabled('trust.voice-prosody', 'deterministic-user');
      const result2 = isEnabled('trust.voice-prosody', 'deterministic-user');
      expect(result1).toBe(result2);
    });

    it('should handle missing userId for percentage rollout', async () => {
      await setFlag('trust.voice-prosody', { enabled: true, percentage: 50 });

      // Without userId, uses random (non-deterministic)
      // Just verify it doesn't throw
      const result = isEnabled('trust.voice-prosody');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('setFlag', () => {
    it('should update flag config', async () => {
      await setFlag('trust.inside-jokes', { enabled: false, percentage: 25 });
      const config = getFlag('trust.inside-jokes');

      expect(config.enabled).toBe(false);
      expect(config.percentage).toBe(25);
    });

    it('should merge with existing config', async () => {
      // Set initial
      await setFlag('trust.small-wins', { enabled: true, percentage: 50 });

      // Update only percentage
      await setFlag('trust.small-wins', { percentage: 75 });
      const config = getFlag('trust.small-wins');

      expect(config.enabled).toBe(true); // Preserved
      expect(config.percentage).toBe(75); // Updated
    });
  });

  describe('setUserOverride', () => {
    it('should add user override', async () => {
      await setUserOverride('trust.thinking-of-you', 'user-vip', true);
      const config = getFlag('trust.thinking-of-you');

      expect(config.overrides?.['user-vip']).toBe(true);
    });

    it('should override existing user override', async () => {
      await setUserOverride('trust.thinking-of-you', 'user-test', true);
      await setUserOverride('trust.thinking-of-you', 'user-test', false);

      const config = getFlag('trust.thinking-of-you');
      expect(config.overrides?.['user-test']).toBe(false);
    });
  });

  describe('removeUserOverride', () => {
    it('should remove user override', async () => {
      await setUserOverride('trust.relationship-health', 'user-remove', true);
      await removeUserOverride('trust.relationship-health', 'user-remove');

      const config = getFlag('trust.relationship-health');
      expect(config.overrides?.['user-remove']).toBeUndefined();
    });

    it('should not affect other overrides', async () => {
      await setUserOverride('trust.relationship-health', 'user-a', true);
      await setUserOverride('trust.relationship-health', 'user-b', false);
      await removeUserOverride('trust.relationship-health', 'user-a');

      const config = getFlag('trust.relationship-health');
      expect(config.overrides?.['user-a']).toBeUndefined();
      expect(config.overrides?.['user-b']).toBe(false);
    });
  });

  describe('enableFlag', () => {
    it('should enable flag with 100% rollout', async () => {
      await disableFlag('trust.conversation-starters');
      await enableFlag('trust.conversation-starters');

      const config = getFlag('trust.conversation-starters');
      expect(config.enabled).toBe(true);
      expect(config.percentage).toBe(100);
    });
  });

  describe('disableFlag', () => {
    it('should disable flag with 0% rollout', async () => {
      await enableFlag('trust.life-events');
      await disableFlag('trust.life-events');

      const config = getFlag('trust.life-events');
      expect(config.enabled).toBe(false);
      expect(config.percentage).toBe(0);
    });
  });

  describe('setRolloutPercentage', () => {
    it('should set valid percentage', async () => {
      await setRolloutPercentage('trust.response-tuning', 75);
      const config = getFlag('trust.response-tuning');

      expect(config.percentage).toBe(75);
    });

    it('should throw for negative percentage', async () => {
      await expect(setRolloutPercentage('trust.response-tuning', -10)).rejects.toThrow(
        'Percentage must be between 0 and 100'
      );
    });

    it('should throw for percentage over 100', async () => {
      await expect(setRolloutPercentage('trust.response-tuning', 150)).rejects.toThrow(
        'Percentage must be between 0 and 100'
      );
    });

    it('should accept boundary values', async () => {
      await setRolloutPercentage('trust.celebration-momentum', 0);
      expect(getFlag('trust.celebration-momentum').percentage).toBe(0);

      await setRolloutPercentage('trust.celebration-momentum', 100);
      expect(getFlag('trust.celebration-momentum').percentage).toBe(100);
    });
  });

  describe('resetToDefaults', () => {
    it('should reset flags to default values', async () => {
      // Modify a flag
      await setFlag('trust.reading-between-lines', { enabled: false, percentage: 0 });

      // Reset
      await resetToDefaults();

      // Should be back to default (enabled with 100%)
      const config = getFlag('trust.reading-between-lines');
      expect(config.enabled).toBe(true);
      expect(config.percentage).toBe(100);
    });
  });

  describe('withFlag', () => {
    it('should execute callback when flag is enabled', async () => {
      await setFlag('trust.sentiment-timeline', { enabled: true, percentage: 100 });

      const result = withFlag('trust.sentiment-timeline', 'user-123', () => 'executed', 'fallback');

      expect(result).toBe('executed');
    });

    it('should return fallback when flag is disabled', async () => {
      await setFlag('trust.sentiment-timeline', { enabled: false, percentage: 0 });

      const result = withFlag('trust.sentiment-timeline', 'user-123', () => 'executed', 'fallback');

      expect(result).toBe('fallback');
    });

    it('should return undefined when no fallback provided', async () => {
      await setFlag('trust.sentiment-timeline', { enabled: false, percentage: 0 });

      const result = withFlag('trust.sentiment-timeline', 'user-123', () => 'executed');

      expect(result).toBeUndefined();
    });
  });

  describe('withFlagAsync', () => {
    it('should execute async callback when flag is enabled', async () => {
      await setFlag('trust.voice-prosody', { enabled: true, percentage: 100 });

      const result = await withFlagAsync(
        'trust.voice-prosody',
        'user-123',
        async () => 'async-executed',
        'fallback'
      );

      expect(result).toBe('async-executed');
    });

    it('should return fallback when flag is disabled', async () => {
      await setFlag('trust.voice-prosody', { enabled: false, percentage: 0 });

      const result = await withFlagAsync(
        'trust.voice-prosody',
        'user-123',
        async () => 'async-executed',
        'fallback'
      );

      expect(result).toBe('fallback');
    });
  });

  describe('getSimpleUtilitiesConfig', () => {
    it('should return default utilities config', () => {
      const config = getSimpleUtilitiesConfig();

      expect(config.timers).toBe(true);
      expect(config.tips).toBe(true);
      expect(config.timezone).toBe(true);
      expect(config.reminders).toBe(true);
    });

    it('should return all four utilities', () => {
      const config = getSimpleUtilitiesConfig();
      expect(Object.keys(config)).toHaveLength(4);
    });
  });

  describe('getFeatureFlags', () => {
    it('should return service object', () => {
      const service = getFeatureFlags();

      expect(typeof service.getAllFlags).toBe('function');
      expect(typeof service.getCategories).toBe('function');
      expect(typeof service.getFlag).toBe('function');
      expect(typeof service.createFlag).toBe('function');
      expect(typeof service.updateFlag).toBe('function');
      expect(typeof service.deleteFlag).toBe('function');
      expect(typeof service.reload).toBe('function');
      expect(typeof service.isEnabled).toBe('function');
    });

    it('should getAllFlags return array', () => {
      const service = getFeatureFlags();
      const flags = service.getAllFlags();

      expect(Array.isArray(flags)).toBe(true);
      expect(flags.length).toBeGreaterThan(0);
    });

    it('should getCategories return categories', () => {
      const service = getFeatureFlags();
      const categories = service.getCategories();

      expect(categories).toContain('trust');
      expect(categories).toContain('features');
      expect(categories).toContain('experimental');
    });

    it('should getFlag return config for flag', () => {
      const service = getFeatureFlags();
      const config = service.getFlag('trust.reading-between-lines');

      expect(config).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
    });

    it('should deleteFlag return true (flags cannot be deleted)', async () => {
      const service = getFeatureFlags();
      const result = await service.deleteFlag('trust.reading-between-lines');

      expect(result).toBe(true);
    });
  });

  describe('Deterministic rollout', () => {
    it('should give consistent results for same user across calls', async () => {
      await setFlag('trust.learning-style', { enabled: true, percentage: 50 });

      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(isEnabled('trust.learning-style', 'consistent-user'));
      }

      // All results should be the same
      expect(new Set(results).size).toBe(1);
    });

    it('should give different results for different users', async () => {
      await setFlag('trust.media-suggestions', { enabled: true, percentage: 50 });

      // With 50% rollout, different users should get different results
      // (statistically, not guaranteed for any specific set)
      const results = new Set<boolean>();
      for (let i = 0; i < 100; i++) {
        results.add(isEnabled('trust.media-suggestions', `user-${i}`));
      }

      // Should have both true and false with 100 different users
      expect(results.size).toBe(2);
    });
  });

  describe('Flag categories', () => {
    it('should have core trust flags at 100% rollout', () => {
      const coreFlags: TrustFlagId[] = [
        'trust.reading-between-lines',
        'trust.boundary-memory',
        'trust.growth-reflection',
        'trust.inside-jokes',
        'trust.small-wins',
        'trust.thinking-of-you',
      ];

      for (const flagId of coreFlags) {
        const config = getFlag(flagId);
        expect(config.enabled).toBe(true);
        expect(config.percentage).toBe(100);
      }
    });

    it('should have infrastructure flags at 100% rollout', () => {
      const infraFlags: TrustFlagId[] = [
        'trust.persistence',
        'trust.cross-device-sync',
        'trust.notifications',
      ];

      for (const flagId of infraFlags) {
        const config = getFlag(flagId);
        expect(config.enabled).toBe(true);
        expect(config.percentage).toBe(100);
      }
    });
  });
});
