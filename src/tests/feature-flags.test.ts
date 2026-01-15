/**
 * Feature Flag Service Tests
 *
 * Tests for the feature flag system that controls trust systems rollout.
 * Tests use mocked Firestore to avoid external dependencies.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Firebase Admin
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => new Date()),
    delete: vi.fn(),
  },
}));

// Mock logger
vi.mock('../utils/safe-logger.js', () => {
  const mockLogger = {
    child: vi.fn(() => mockLogger),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
  };
});

// Import after mocks are set up
import {
  getAllFlags,
  getFeatureFlags,
  getFlag,
  getSimpleUtilitiesConfig,
  isEnabled,
  TRUST_FLAGS,
  withFlag,
  withFlagAsync,
  type TrustFlagId,
} from '../services/feature-flags.js';

describe('Feature Flags Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('TRUST_FLAGS constant', () => {
    it('should define all core trust flags', () => {
      expect(TRUST_FLAGS['trust.reading-between-lines']).toBeDefined();
      expect(TRUST_FLAGS['trust.boundary-memory']).toBeDefined();
      expect(TRUST_FLAGS['trust.growth-reflection']).toBeDefined();
      expect(TRUST_FLAGS['trust.inside-jokes']).toBeDefined();
      expect(TRUST_FLAGS['trust.small-wins']).toBeDefined();
      expect(TRUST_FLAGS['trust.thinking-of-you']).toBeDefined();
    });

    it('should have descriptions for each flag', () => {
      for (const [_key, value] of Object.entries(TRUST_FLAGS)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isEnabled', () => {
    it('should return boolean for valid flag', () => {
      const result = isEnabled('trust.reading-between-lines');
      expect(typeof result).toBe('boolean');
    });

    it('should handle user-specific checks', () => {
      const result = isEnabled('trust.boundary-memory', 'user-123');
      expect(typeof result).toBe('boolean');
    });

    it('should return false for unknown flags', () => {
      // @ts-expect-error Testing invalid flag
      const result = isEnabled('unknown-flag');
      expect(result).toBe(false);
    });
  });

  describe('getFlag', () => {
    it('should return flag config for valid flag', () => {
      const config = getFlag('trust.reading-between-lines');
      expect(config).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.percentage).toBe('number');
    });

    it('should return default disabled config for unknown flag', () => {
      // @ts-expect-error Testing invalid flag
      const config = getFlag('unknown-flag');
      expect(config.enabled).toBe(false);
    });
  });

  describe('getAllFlags', () => {
    it('should return all configured flags', () => {
      const flags = getAllFlags();
      expect(Object.keys(flags).length).toBeGreaterThan(0);
    });

    it('should include descriptions for each flag', () => {
      const flags = getAllFlags();
      for (const [_key, value] of Object.entries(flags)) {
        expect(value.description).toBeDefined();
        expect(typeof value.description).toBe('string');
      }
    });

    it('should have default values for all trust flags', () => {
      const flags = getAllFlags();
      for (const flagId of Object.keys(TRUST_FLAGS) as TrustFlagId[]) {
        expect(flags[flagId]).toBeDefined();
        expect(typeof flags[flagId].enabled).toBe('boolean');
        expect(typeof flags[flagId].percentage).toBe('number');
      }
    });
  });

  describe('Percentage rollout', () => {
    it('should respect percentage-based rollout', () => {
      // With 100% rollout, should always be enabled
      const flag = getFlag('trust.reading-between-lines');
      if (flag.percentage === 100) {
        expect(isEnabled('trust.reading-between-lines')).toBe(true);
      }
    });

    it('should be consistent for same userId', () => {
      // Same user should get same result
      const result1 = isEnabled('trust.relationship-health', 'user-abc');
      const result2 = isEnabled('trust.relationship-health', 'user-abc');
      expect(result1).toBe(result2);
    });
  });
});

describe('Trust System Flag Categories', () => {
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
      expect(config.percentage).toBe(100);
    }
  });

  it('should have persistence flag defined', () => {
    const config = getFlag('trust.persistence');
    expect(config).toBeDefined();
    expect(typeof config.enabled).toBe('boolean');
  });
});

describe('withFlag guard function', () => {
  it('should execute callback when flag is enabled at 100%', () => {
    const callback = vi.fn(() => 'result');
    const result = withFlag('trust.reading-between-lines', 'user-123', callback);

    expect(callback).toHaveBeenCalled();
    expect(result).toBe('result');
  });

  it('should return fallback when flag is disabled', () => {
    // @ts-expect-error Testing with unknown flag (disabled by default)
    const result = withFlag('unknown-disabled-flag', 'user-123', () => 'result', 'fallback');

    expect(result).toBe('fallback');
  });

  it('should return undefined when flag disabled and no fallback', () => {
    // @ts-expect-error Testing with unknown flag (disabled by default)
    const result = withFlag('unknown-disabled-flag', 'user-123', () => 'result');

    expect(result).toBeUndefined();
  });

  it('should work without userId', () => {
    const callback = vi.fn(() => 'executed');
    const result = withFlag('trust.persistence', undefined, callback);

    // With 100% rollout, should execute
    expect(callback).toHaveBeenCalled();
    expect(result).toBe('executed');
  });
});

describe('withFlagAsync guard function', () => {
  it('should execute async callback when flag is enabled', async () => {
    const callback = vi.fn().mockResolvedValue('async-result');
    const result = await withFlagAsync('trust.reading-between-lines', 'user-123', callback);

    expect(callback).toHaveBeenCalled();
    expect(result).toBe('async-result');
  });

  it('should return fallback when flag is disabled', async () => {
    // @ts-expect-error Testing with unknown flag
    const result = await withFlagAsync(
      'unknown-flag',
      'user-123',
      async () => 'result',
      'async-fallback'
    );

    expect(result).toBe('async-fallback');
  });

  it('should return undefined when flag disabled and no fallback', async () => {
    // @ts-expect-error Testing with unknown flag
    const result = await withFlagAsync('unknown-flag', 'user-123', async () => 'result');

    expect(result).toBeUndefined();
  });

  it('should handle async callback that returns complex data', async () => {
    const complexData = { success: true, items: [1, 2, 3] };
    const callback = vi.fn().mockResolvedValue(complexData);
    const result = await withFlagAsync('trust.persistence', 'user-456', callback);

    expect(result).toEqual(complexData);
  });
});

describe('getSimpleUtilitiesConfig', () => {
  it('should return config object with expected keys', () => {
    const config = getSimpleUtilitiesConfig();

    expect(config).toHaveProperty('timers');
    expect(config).toHaveProperty('tips');
    expect(config).toHaveProperty('timezone');
    expect(config).toHaveProperty('reminders');
  });

  it('should have all utilities enabled by default', () => {
    const config = getSimpleUtilitiesConfig();

    expect(config.timers).toBe(true);
    expect(config.tips).toBe(true);
    expect(config.timezone).toBe(true);
    expect(config.reminders).toBe(true);
  });

  it('should return boolean values', () => {
    const config = getSimpleUtilitiesConfig();

    for (const value of Object.values(config)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

describe('getFeatureFlags service object', () => {
  it('should return object with all required methods', () => {
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

  it('getAllFlags should return array of flags', () => {
    const service = getFeatureFlags();
    const flags = service.getAllFlags();

    expect(Array.isArray(flags)).toBe(true);
    expect(flags.length).toBeGreaterThan(0);
  });

  it('getCategories should return array of category names', () => {
    const service = getFeatureFlags();
    const categories = service.getCategories();

    expect(Array.isArray(categories)).toBe(true);
    expect(categories).toContain('trust');
    expect(categories).toContain('features');
    expect(categories).toContain('experimental');
  });

  it('getFlag should return flag config', () => {
    const service = getFeatureFlags();
    const flag = service.getFlag('trust.reading-between-lines');

    expect(flag).toBeDefined();
    expect(typeof flag.enabled).toBe('boolean');
    expect(typeof flag.percentage).toBe('number');
  });

  it('isEnabled should check flag status', () => {
    const service = getFeatureFlags();
    const result = service.isEnabled('trust.persistence', 'user-123');

    expect(typeof result).toBe('boolean');
  });

  it('deleteFlag should return true (flags cannot be deleted)', async () => {
    const service = getFeatureFlags();
    const result = await service.deleteFlag('trust.reading-between-lines');

    expect(result).toBe(true);
  });
});

describe('Deterministic user rollout', () => {
  it('should give same result for same user and flag combination', () => {
    // Test that the hash is deterministic
    const userId = 'test-user-deterministic-123';
    const flagId = 'trust.relationship-health' as TrustFlagId;

    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(isEnabled(flagId, userId));
    }

    // All results should be identical
    const firstResult = results[0];
    expect(results.every((r) => r === firstResult)).toBe(true);
  });

  it('should give different results for different users', () => {
    // With 75% rollout, different users should eventually get different results
    const flagId = 'trust.voice-prosody' as TrustFlagId;
    const results = new Set<boolean>();

    // Use many users to ensure statistical significance
    for (let i = 0; i < 1000; i++) {
      results.add(isEnabled(flagId, `user-deterministic-${i}`));
    }

    // Should have both true and false in results (statistically extremely likely with 75% and 1000 users)
    // With 75% rollout and 1000 users, probability of all same result is < 0.75^1000 ≈ 0
    expect(results.size).toBe(2);
  });
});

describe('Flag rollout percentages', () => {
  it('should have 100% rollout for core flags', () => {
    const coreFlags: TrustFlagId[] = [
      'trust.reading-between-lines',
      'trust.boundary-memory',
      'trust.growth-reflection',
      'trust.inside-jokes',
      'trust.small-wins',
      'trust.thinking-of-you',
      'trust.persistence',
    ];

    for (const flagId of coreFlags) {
      const config = getFlag(flagId);
      expect(config.percentage).toBe(100);
      expect(config.enabled).toBe(true);
    }
  });

  it('should have lower rollout for experimental flags', () => {
    // These flags are in gradual rollout phase (75%) - not yet at 100%
    const experimentalFlags: TrustFlagId[] = [
      'trust.voice-prosody',
      'trust.learning-style',
      'trust.media-suggestions',
    ];

    for (const flagId of experimentalFlags) {
      const config = getFlag(flagId);
      // Experimental flags should not be at 100% rollout
      expect(config.percentage).toBeLessThan(100);
    }
  });

  it('should have gradual rollout for phase 12-17 flags', () => {
    const phase12Flags: TrustFlagId[] = [
      'trust.relationship-health',
      'trust.conversation-starters',
      'trust.life-events',
      'trust.celebration-momentum',
      'trust.sentiment-timeline',
    ];

    for (const flagId of phase12Flags) {
      const config = getFlag(flagId);
      expect(config.percentage).toBeGreaterThanOrEqual(25);
      expect(config.percentage).toBeLessThanOrEqual(100);
    }
  });
});
