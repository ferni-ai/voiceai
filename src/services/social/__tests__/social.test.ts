/**
 * Social Service Tests
 *
 * Tests for social media integration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Social Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Module Existence', () => {
    it('should have an index file with exports', async () => {
      const module = await import('../index.js');
      expect(module).toBeDefined();
    });
  });
});
