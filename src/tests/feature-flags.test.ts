/**
 * Feature Flag Service Tests
 *
 * Tests for the feature flag system that controls trust systems rollout.
 * Tests use mocked Firestore to avoid external dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  isEnabled,
  getFlag,
  getAllFlags,
  TRUST_FLAGS,
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
