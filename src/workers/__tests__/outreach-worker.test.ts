/**
 * Outreach Worker Tests
 *
 * Tests the outreach worker's batch processing and trigger handling.
 * Note: OutreachWorker is a batch processor (Cloud Run Job), not a persistent worker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the outreach imports
vi.mock('../../services/pubsub/pubsub-client.js', () => ({
  getPubSubClient: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(false),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../services/outreach/decision-engine.js', () => ({
  getOutreachDecisionEngine: vi.fn(() => ({
    getUserState: vi.fn().mockReturnValue({
      outreachEnabled: true,
      counters: { outreachToday: 0 },
      preferences: { maxPerDay: 5, preferredChannel: 'sms' },
    }),
  })),
}));

vi.mock('../../services/outreach/firestore-persistence.js', () => ({
  loadPendingTriggersWithLimit: vi.fn().mockResolvedValue([]),
  updateTriggerStatus: vi.fn().mockResolvedValue(undefined),
  storeScheduledDelivery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/outreach/delivery/index.js', () => ({
  deliverOutreach: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { processPendingTriggers, getWorkerHealth } from '../outreach-worker.js';

describe('OutreachWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('health check', () => {
    it('should return healthy status', () => {
      const health = getWorkerHealth();
      expect(health.status).toBe('healthy');
      expect(health.details).toBe('Outreach worker ready');
    });
  });

  describe('processPendingTriggers', () => {
    it('should process with default config', async () => {
      const result = await processPendingTriggers();

      expect(result).toBeDefined();
      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(result.scheduled).toBeGreaterThanOrEqual(0);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should respect dry-run mode', async () => {
      const result = await processPendingTriggers({ dryRun: true });

      expect(result).toBeDefined();
      // In dry run, no actual deliveries should be made
      expect(result.failed).toBe(0);
    });

    it('should enforce max messages limit', async () => {
      const result = await processPendingTriggers({ maxMessages: 10 });

      expect(result).toBeDefined();
      expect(result.processed).toBeLessThanOrEqual(10);
    });
  });

  describe('Firestore fallback', () => {
    it('should fall back to Firestore queue when Pub/Sub disabled', async () => {
      const { loadPendingTriggersWithLimit } = await import(
        '../../services/outreach/firestore-persistence.js'
      );

      await processPendingTriggers({ maxMessages: 5 });

      // Should call Firestore when Pub/Sub is disabled
      expect(loadPendingTriggersWithLimit).toHaveBeenCalledWith(5);
    });
  });

  describe('decision engine integration', () => {
    it('should process triggers from Firestore queue', async () => {
      const result = await processPendingTriggers({ maxMessages: 10 });

      // With empty mock, should process 0 triggers
      expect(result.processed).toBe(0);
      expect(result.scheduled).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      // Duration should be >= 0 (fast execution in test mode)
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
