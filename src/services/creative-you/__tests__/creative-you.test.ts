/**
 * Creative You Service Tests
 *
 * Tests for creative profile and preference management.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
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
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Creative You Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Module Existence', () => {
    it('should have an index file with exports', async () => {
      const module = await import('../index.js');
      expect(module).toBeDefined();
    });
  });

  describe('Types', () => {
    it('should export type definitions', async () => {
      const typesModule = await import('../types.js');
      expect(typesModule).toBeDefined();
    });
  });
});
