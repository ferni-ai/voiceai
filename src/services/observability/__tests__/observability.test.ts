/**
 * Observability Service Tests
 *
 * Tests for metrics, logging, and monitoring infrastructure.
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

describe('Observability Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Module Existence', () => {
    it('should have an index file with exports', async () => {
      const module = await import('../index.js');
      expect(module).toBeDefined();
    });
  });

  describe('FinOps', () => {
    it('should export finops utilities', async () => {
      // FinOps tracks cost metrics for voice sessions
      const finopsModule = await import('../finops.js');
      expect(finopsModule).toBeDefined();
    });
  });
});
