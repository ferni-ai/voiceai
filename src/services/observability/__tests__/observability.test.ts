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

  describe('Memory Recall Metrics', () => {
    it('should calculate recall rate from sessions with memory data', async () => {
      const { memoryMetrics } = await import('../memory-health.js');

      memoryMetrics.resetMemoryRecallStats();
      memoryMetrics.recordMemoryRecallOpportunity({ sessionId: 'session-a', memoryCount: 2 });
      memoryMetrics.recordMemoryRecallOpportunity({ sessionId: 'session-b', memoryCount: 1 });
      memoryMetrics.recordMemoryRecallSurfaced({ sessionId: 'session-a', surfacedCount: 1 });

      const snapshot = memoryMetrics.getSnapshot();

      expect(snapshot.sessionsWithMemoryData).toBe(2);
      expect(snapshot.sessionsWithMemoryRecalls).toBe(1);
      expect(snapshot.memoryRecallsPerSession).toBe(0.5);
      expect(snapshot.memoryRecallRate).toBe(0.5);

      memoryMetrics.resetMemoryRecallStats();
    });
  });
});
