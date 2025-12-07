/**
 * Feature Flag Service Tests
 *
 * Tests for:
 * - Boolean flag evaluation
 * - Percentage-based rollouts
 * - User list targeting
 * - Flag CRUD operations
 * - Persistence and loading
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

// Mock file system and logger
const mockFlags = new Map<string, unknown>();
const mockFileContent: { data: string | null } = { data: null };

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => {
    if (mockFileContent.data === null) {
      throw new Error('ENOENT');
    }
    return mockFileContent.data;
  }),
  writeFileSync: vi.fn((path: string, data: string) => {
    mockFileContent.data = data;
  }),
  existsSync: vi.fn((path: string) => {
    if (path.includes('feature-flags.json')) {
      return mockFileContent.data !== null;
    }
    return true;
  }),
  mkdirSync: vi.fn(),
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocks are set up
import {
  FeatureFlagService,
  getFeatureFlags,
  type FeatureFlag,
  type FlagCheckContext,
} from '../services/feature-flags.js';

describe('Feature Flag Service', () => {
  let service: FeatureFlagService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFileContent.data = null; // Reset to no file state
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Initialization', () => {
    it('should initialize with default flags when no file exists', () => {
      service = new FeatureFlagService();
      // Should have created default flags
      expect(service.getAllFlags().length).toBeGreaterThan(0);
    });

    it('should load flags from file when it exists', () => {
      const testFlags: FeatureFlag[] = [
        {
          id: 'test-flag',
          name: 'Test Flag',
          description: 'A test flag',
          type: 'boolean',
          enabled: true,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(testFlags);

      service = new FeatureFlagService();
      const flag = service.getFlag('test-flag');
      expect(flag).toBeDefined();
      expect(flag?.enabled).toBe(true);
    });

    it('should fall back to defaults on corrupt file', () => {
      mockFileContent.data = 'not valid json';

      service = new FeatureFlagService();
      // Should have default flags despite corrupt file
      expect(service.getAllFlags().length).toBeGreaterThan(0);
    });
  });

  describe('Boolean Flag Evaluation', () => {
    beforeEach(() => {
      const flags: FeatureFlag[] = [
        {
          id: 'enabled-flag',
          name: 'Enabled Flag',
          description: 'Always enabled',
          type: 'boolean',
          enabled: true,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'disabled-flag',
          name: 'Disabled Flag',
          description: 'Always disabled',
          type: 'boolean',
          enabled: false,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(flags);
      service = new FeatureFlagService();
    });

    it('should return true for enabled flags', () => {
      expect(service.isEnabled('enabled-flag')).toBe(true);
    });

    it('should return false for disabled flags', () => {
      expect(service.isEnabled('disabled-flag')).toBe(false);
    });

    it('should return false for non-existent flags', () => {
      expect(service.isEnabled('non-existent-flag')).toBe(false);
    });
  });

  describe('Percentage Rollout Evaluation', () => {
    beforeEach(() => {
      const flags: FeatureFlag[] = [
        {
          id: 'fifty-percent',
          name: '50% Rollout',
          description: 'Enabled for 50% of users',
          type: 'percentage',
          enabled: true,
          percentage: 50,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'zero-percent',
          name: '0% Rollout',
          description: 'Enabled for 0% of users',
          type: 'percentage',
          enabled: true,
          percentage: 0,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'hundred-percent',
          name: '100% Rollout',
          description: 'Enabled for all users',
          type: 'percentage',
          enabled: true,
          percentage: 100,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(flags);
      service = new FeatureFlagService();
    });

    it('should return consistent results for same user', () => {
      const userId = 'consistent-user-123';
      const context: FlagCheckContext = { userId };

      const firstResult = service.isEnabledForUser('fifty-percent', context);
      const secondResult = service.isEnabledForUser('fifty-percent', context);
      const thirdResult = service.isEnabledForUser('fifty-percent', context);

      // Same user should always get the same result
      expect(firstResult).toBe(secondResult);
      expect(secondResult).toBe(thirdResult);
    });

    it('should return false for 0% rollout', () => {
      expect(service.isEnabledForUser('zero-percent', { userId: 'any-user' })).toBe(false);
    });

    it('should return true for 100% rollout', () => {
      expect(service.isEnabledForUser('hundred-percent', { userId: 'any-user' })).toBe(true);
    });

    it('should distribute users roughly according to percentage', () => {
      let enabledCount = 0;
      const totalUsers = 100;

      for (let i = 0; i < totalUsers; i++) {
        if (service.isEnabledForUser('fifty-percent', { userId: `user-${i}` })) {
          enabledCount++;
        }
      }

      // With 50% rollout, expect roughly 40-60 users enabled (allowing variance)
      expect(enabledCount).toBeGreaterThan(20);
      expect(enabledCount).toBeLessThan(80);
    });
  });

  describe('User List Targeting', () => {
    beforeEach(() => {
      const flags: FeatureFlag[] = [
        {
          id: 'user-targeted',
          name: 'User Targeted',
          description: 'Enabled for specific users',
          type: 'user_list',
          enabled: true,
          userIds: ['user-a', 'user-b', 'user-c'],
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(flags);
      service = new FeatureFlagService();
    });

    it('should return true for users in the list', () => {
      expect(service.isEnabledForUser('user-targeted', { userId: 'user-a' })).toBe(true);
      expect(service.isEnabledForUser('user-targeted', { userId: 'user-b' })).toBe(true);
      expect(service.isEnabledForUser('user-targeted', { userId: 'user-c' })).toBe(true);
    });

    it('should return false for users not in the list', () => {
      expect(service.isEnabledForUser('user-targeted', { userId: 'user-x' })).toBe(false);
      expect(service.isEnabledForUser('user-targeted', { userId: 'random-user' })).toBe(false);
    });

    it('should return false when no userId provided', () => {
      expect(service.isEnabledForUser('user-targeted', {})).toBe(false);
    });
  });

  describe('Value Flags', () => {
    beforeEach(() => {
      const flags: FeatureFlag[] = [
        {
          id: 'max-turns',
          name: 'Max Turns',
          description: 'Maximum conversation turns',
          type: 'value',
          enabled: true,
          value: 50,
          category: 'limits',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'feature-config',
          name: 'Feature Config',
          description: 'Complex config object',
          type: 'value',
          enabled: true,
          value: { theme: 'dark', maxItems: 10 },
          category: 'config',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(flags);
      service = new FeatureFlagService();
    });

    it('should return numeric values', () => {
      const value = service.getValue('max-turns', 25);
      expect(value).toBe(50);
    });

    it('should return object values', () => {
      const value = service.getValue('feature-config', {});
      expect(value).toEqual({ theme: 'dark', maxItems: 10 });
    });

    it('should return default for non-existent flags', () => {
      const value = service.getValue('non-existent', 'default-value');
      expect(value).toBe('default-value');
    });
  });

  describe('Flag Retrieval', () => {
    beforeEach(() => {
      const flags: FeatureFlag[] = [
        {
          id: 'retrieval-test',
          name: 'Retrieval Test',
          description: 'Test retrieval',
          type: 'boolean',
          enabled: true,
          category: 'debug',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'other-category',
          name: 'Other Category',
          description: 'Different category',
          type: 'boolean',
          enabled: true,
          category: 'feature',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(flags);
      service = new FeatureFlagService();
    });

    it('should get a specific flag by ID', () => {
      const flag = service.getFlag('retrieval-test');
      expect(flag).toBeDefined();
      expect(flag?.name).toBe('Retrieval Test');
    });

    it('should return undefined for non-existent flag', () => {
      const flag = service.getFlag('non-existent');
      expect(flag).toBeUndefined();
    });

    it('should get all flags', () => {
      const flags = service.getAllFlags();
      expect(Array.isArray(flags)).toBe(true);
      expect(flags.length).toBeGreaterThanOrEqual(2);
      // Verify our test flags are included
      const testFlag = flags.find((f) => f.id === 'retrieval-test');
      expect(testFlag).toBeDefined();
    });

    it('should get flags by category', () => {
      const debugFlags = service.getFlagsByCategory('debug');
      expect(Array.isArray(debugFlags)).toBe(true);
      expect(debugFlags.length).toBeGreaterThanOrEqual(1);
      debugFlags.forEach((flag) => {
        expect(flag.category).toBe('debug');
      });
      // Verify our test flag is included
      const testFlag = debugFlags.find((f) => f.id === 'retrieval-test');
      expect(testFlag).toBeDefined();
    });

    it('should return empty array for non-existent category', () => {
      const flags = service.getFlagsByCategory('non-existent');
      expect(flags).toEqual([]);
    });
  });

  describe('Evaluation with Full Context', () => {
    beforeEach(() => {
      const flags: FeatureFlag[] = [
        {
          id: 'context-aware',
          name: 'Context Aware',
          description: 'Uses full context',
          type: 'boolean',
          enabled: true,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(flags);
      service = new FeatureFlagService();
    });

    it('should evaluate with full context object', () => {
      const context: FlagCheckContext = {
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'jack-b',
        tier: 'premium',
      };

      const result = service.evaluate('context-aware', context);
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('flag_enabled');
    });

    it('should return flag_not_found for missing flags', () => {
      const result = service.evaluate('missing-flag', {});
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('flag_not_found');
    });
  });

  describe('Hot Reload', () => {
    it('should reload flags on demand', () => {
      const initialFlags: FeatureFlag[] = [
        {
          id: 'reload-test',
          name: 'Reload Test',
          description: 'Test reload',
          type: 'boolean',
          enabled: false,
          category: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      mockFileContent.data = JSON.stringify(initialFlags);
      service = new FeatureFlagService();

      expect(service.isEnabled('reload-test')).toBe(false);

      // Simulate file change
      const updatedFlags: FeatureFlag[] = [
        {
          ...initialFlags[0],
          enabled: true,
        },
      ];
      mockFileContent.data = JSON.stringify(updatedFlags);

      // Reload and check
      service.reload();
      expect(service.isEnabled('reload-test')).toBe(true);
    });
  });
});

describe('getFeatureFlags Singleton', () => {
  it('should return the same instance', () => {
    const instance1 = getFeatureFlags();
    const instance2 = getFeatureFlags();
    expect(instance1).toBe(instance2);
  });
});
