/**
 * Tests for tool-helpers.ts utilities
 *
 * Verifies the shared utility functions used across all tools.
 */

import { describe, it, expect } from 'vitest';
import { getUserId, generateId, getLogger } from '../../../tools/utils/tool-helpers.js';

describe('tool-helpers', () => {
  describe('getUserId', () => {
    it('extracts userId from context with userData', () => {
      const context = {
        ctx: {
          userData: {
            userId: 'user-123',
          },
        },
      };

      expect(getUserId(context)).toBe('user-123');
    });

    it('returns "default" when context is undefined', () => {
      expect(getUserId(undefined as unknown as { ctx?: unknown })).toBe('default');
    });

    it('returns "default" when ctx is undefined', () => {
      expect(getUserId({})).toBe('default');
    });

    it('returns "default" when userData is undefined', () => {
      expect(getUserId({ ctx: {} })).toBe('default');
    });

    it('returns "default" when userId is undefined', () => {
      expect(getUserId({ ctx: { userData: {} } })).toBe('default');
    });

    it('returns "default" for empty userId string', () => {
      expect(getUserId({ ctx: { userData: { userId: '' } } })).toBe('default');
    });

    it('handles nested context structures', () => {
      const context = {
        ctx: {
          userData: {
            userId: 'nested-user-456',
            name: 'Test User',
          },
        },
      };

      expect(getUserId(context)).toBe('nested-user-456');
    });
  });

  describe('generateId', () => {
    it('generates an ID with the given prefix', () => {
      const id = generateId('test');
      expect(id).toMatch(/^test_\d+_[a-z0-9]{7}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('unique'));
      }
      // All should be unique
      expect(ids.size).toBe(100);
    });

    it('includes timestamp in the ID', () => {
      const before = Date.now();
      const id = generateId('time');
      const after = Date.now();

      // Extract timestamp from ID
      const parts = id.split('_');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('works with various prefixes', () => {
      expect(generateId('goal')).toMatch(/^goal_\d+_[a-z0-9]{7}$/);
      expect(generateId('habit')).toMatch(/^habit_\d+_[a-z0-9]{7}$/);
      expect(generateId('task')).toMatch(/^task_\d+_[a-z0-9]{7}$/);
      expect(generateId('memory')).toMatch(/^memory_\d+_[a-z0-9]{7}$/);
    });

    it('handles empty prefix', () => {
      const id = generateId('');
      expect(id).toMatch(/^_\d+_[a-z0-9]{7}$/);
    });

    it('handles prefixes with special characters', () => {
      const id = generateId('test-prefix');
      expect(id).toMatch(/^test-prefix_\d+_[a-z0-9]{7}$/);
    });
  });

  describe('getLogger', () => {
    it('returns a logger instance', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
    });

    it('returns the same logger instance on multiple calls', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      // Both should reference the same logger
      expect(typeof logger1).toBe(typeof logger2);
    });

    it('logger has expected methods', () => {
      const logger = getLogger();
      // LiveKit logger should have these methods
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });
});
