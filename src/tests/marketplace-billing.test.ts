/**
 * Marketplace Billing Tests
 *
 * Tests for the billing system:
 * - Usage recording and aggregation
 * - Quota enforcement across tiers
 * - Revenue share calculations
 * - Usage history retrieval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordUsage,
  getUsageSummary,
  checkQuota,
  calculateBilling,
  calculateRevenueShare,
  getUsageHistory,
  getPendingPayouts,
  clearBillingData,
} from '../marketplace/billing/index.js';

describe('Marketplace Billing System', () => {
  beforeEach(() => {
    // Clear all billing data between tests
    clearBillingData();
  });

  describe('Usage Recording', () => {
    it('should record usage with generated ID', () => {
      const record = recordUsage({
        userId: 'user-123',
        itemId: 'tool-abc',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: {
          executions: 1,
          executionTimeMs: 150,
          dataTransferBytes: 1024,
        },
      });

      expect(record.id).toBeTruthy();
      expect(record.id).toMatch(/^usage_/);
      expect(record.userId).toBe('user-123');
      expect(record.itemId).toBe('tool-abc');
      expect(record.metrics.executions).toBe(1);
    });

    it('should aggregate monthly usage', () => {
      // Record multiple usages
      recordUsage({
        userId: 'user-123',
        itemId: 'tool-abc',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: {
          executions: 1,
          executionTimeMs: 100,
          dataTransferBytes: 500,
        },
      });

      recordUsage({
        userId: 'user-123',
        itemId: 'tool-abc',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: {
          executions: 2,
          executionTimeMs: 200,
          dataTransferBytes: 1000,
        },
      });

      const summary = getUsageSummary('user-123', 'tool-abc', 'free');

      expect(summary.totals.executions).toBe(3);
      expect(summary.totals.executionTimeMs).toBe(300);
      expect(summary.totals.dataTransferBytes).toBe(1500);
    });

    it('should record token counts for LLM tools', () => {
      const record = recordUsage({
        userId: 'user-123',
        itemId: 'llm-tool',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: {
          executions: 1,
          executionTimeMs: 500,
          dataTransferBytes: 0,
          tokens: 1500,
        },
      });

      expect(record.metrics.tokens).toBe(1500);
    });
  });

  describe('Quota Enforcement', () => {
    it('should allow execution within free tier quota', () => {
      // Free tier: 100 executions
      for (let i = 0; i < 50; i++) {
        recordUsage({
          userId: 'user-123',
          itemId: 'tool-abc',
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 0 },
        });
      }

      const result = checkQuota('user-123', 'tool-abc', 'free');
      expect(result.allowed).toBe(true);
    });

    it('should block execution when free tier quota exceeded', () => {
      // Free tier: 100 executions
      for (let i = 0; i < 100; i++) {
        recordUsage({
          userId: 'user-123',
          itemId: 'tool-abc',
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 0 },
        });
      }

      const result = checkQuota('user-123', 'tool-abc', 'free');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('quota exceeded');
      expect(result.upgradeRequired).toBe(true);
    });

    it('should allow more executions for friend tier', () => {
      // Friend tier: 1000 executions
      for (let i = 0; i < 500; i++) {
        recordUsage({
          userId: 'user-123',
          itemId: 'tool-abc',
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 0 },
        });
      }

      const result = checkQuota('user-123', 'tool-abc', 'friend');
      expect(result.allowed).toBe(true);
    });

    it('should allow unlimited executions for partner tier', () => {
      // Partner tier: unlimited
      for (let i = 0; i < 200; i++) {
        recordUsage({
          userId: 'user-123',
          itemId: 'tool-abc',
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 100, dataTransferBytes: 0 },
        });
      }

      const result = checkQuota('user-123', 'tool-abc', 'partner');
      expect(result.allowed).toBe(true);
    });

    it('should track quota per user and item', () => {
      // User 1 uses tool A
      for (let i = 0; i < 100; i++) {
        recordUsage({
          userId: 'user-1',
          itemId: 'tool-a',
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 0 },
        });
      }

      // User 2 should still have quota for tool A
      const user2Result = checkQuota('user-2', 'tool-a', 'free');
      expect(user2Result.allowed).toBe(true);

      // User 1 should still have quota for tool B
      const user1ToolBResult = checkQuota('user-1', 'tool-b', 'free');
      expect(user1ToolBResult.allowed).toBe(true);
    });
  });

  describe('Usage Summary', () => {
    it('should return usage summary with quota info', () => {
      recordUsage({
        userId: 'user-123',
        itemId: 'tool-abc',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: { executions: 50, executionTimeMs: 5000, dataTransferBytes: 10000 },
      });

      const summary = getUsageSummary('user-123', 'tool-abc', 'free');

      expect(summary.period).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM format
      expect(summary.userId).toBe('user-123');
      expect(summary.itemId).toBe('tool-abc');
      expect(summary.totals.executions).toBe(50);
      expect(summary.quota.maxExecutions).toBe(100);
      expect(summary.quota.currentExecutions).toBe(50);
      expect(summary.quota.usagePercentage).toBe(50);
      expect(summary.quota.exceeded).toBe(false);
      expect(summary.quota.resetsAt).toBeTruthy();
    });

    it('should return empty summary for unused item', () => {
      const summary = getUsageSummary('user-new', 'tool-new', 'free');

      expect(summary.totals.executions).toBe(0);
      expect(summary.totals.executionTimeMs).toBe(0);
      expect(summary.quota.usagePercentage).toBe(0);
    });
  });

  describe('Billing Calculation', () => {
    it('should return zero for free pricing model', () => {
      const result = calculateBilling(
        { executions: 100, executionTimeMs: 10000, dataTransferBytes: 50000 },
        { model: 'free' }
      );

      expect(result.amountCents).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });

    it('should calculate per-execution pricing', () => {
      const result = calculateBilling(
        { executions: 50, executionTimeMs: 5000, dataTransferBytes: 10000 },
        { model: 'usage-based', priceInCents: 10 } // 10 cents per execution
      );

      expect(result.amountCents).toBe(500); // 50 * 10 = 500 cents
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].component).toBe('executions');
      expect(result.breakdown[0].quantity).toBe(50);
      expect(result.breakdown[0].unitPriceCents).toBe(10);
    });

    it('should return zero for one-time purchases', () => {
      const result = calculateBilling(
        { executions: 100, executionTimeMs: 10000, dataTransferBytes: 50000 },
        { model: 'one-time', priceInCents: 999 }
      );

      expect(result.amountCents).toBe(0); // One-time purchase, no per-use charge
    });

    it('should return zero for subscription model', () => {
      const result = calculateBilling(
        { executions: 100, executionTimeMs: 10000, dataTransferBytes: 50000 },
        { model: 'subscription', priceInCents: 499 }
      );

      expect(result.amountCents).toBe(0); // Subscription handled separately
    });
  });

  describe('Revenue Share', () => {
    it('should calculate 80/20 revenue split', () => {
      const share = calculateRevenueShare(
        'tool-abc',
        'publisher-123',
        '2024-01',
        10000 // $100 gross revenue
      );

      expect(share.grossRevenueCents).toBe(10000);
      expect(share.platformFeeCents).toBe(2000); // 20%
      expect(share.publisherShareCents).toBe(8000); // 80%
      expect(share.status).toBe('scheduled');
      expect(share.payoutDate).toBeTruthy();
    });

    it('should handle zero revenue', () => {
      const share = calculateRevenueShare(
        'tool-abc',
        'publisher-123',
        '2024-01',
        0
      );

      expect(share.grossRevenueCents).toBe(0);
      expect(share.platformFeeCents).toBe(0);
      expect(share.publisherShareCents).toBe(0);
    });

    it('should round revenue share correctly', () => {
      const share = calculateRevenueShare(
        'tool-abc',
        'publisher-123',
        '2024-01',
        333 // $3.33 - tests rounding
      );

      expect(share.platformFeeCents).toBe(67); // Rounded from 66.6
      expect(share.publisherShareCents).toBe(266); // 333 - 67
    });
  });

  describe('Pending Payouts', () => {
    it('should return pending payouts for publisher', () => {
      calculateRevenueShare('tool-a', 'publisher-123', '2024-01', 5000);
      calculateRevenueShare('tool-b', 'publisher-123', '2024-01', 3000);
      calculateRevenueShare('tool-c', 'publisher-456', '2024-01', 2000);

      const payouts = getPendingPayouts('publisher-123');

      expect(payouts).toHaveLength(2);
      expect(payouts.every(p => p.publisherId === 'publisher-123')).toBe(true);
    });

    it('should return empty array for publisher with no payouts', () => {
      const payouts = getPendingPayouts('publisher-new');
      expect(payouts).toHaveLength(0);
    });
  });

  describe('Usage History', () => {
    it('should return usage records for user', () => {
      recordUsage({
        userId: 'user-123',
        itemId: 'tool-a',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: { executions: 1, executionTimeMs: 100, dataTransferBytes: 500 },
      });

      recordUsage({
        userId: 'user-123',
        itemId: 'tool-b',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: { executions: 1, executionTimeMs: 200, dataTransferBytes: 1000 },
      });

      const history = getUsageHistory('user-123');

      expect(history).toHaveLength(2);
      expect(history.every(r => r.userId === 'user-123')).toBe(true);
    });

    it('should filter by item ID', () => {
      recordUsage({
        userId: 'user-123',
        itemId: 'tool-a',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: { executions: 1, executionTimeMs: 100, dataTransferBytes: 500 },
      });

      recordUsage({
        userId: 'user-123',
        itemId: 'tool-b',
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: { executions: 1, executionTimeMs: 200, dataTransferBytes: 1000 },
      });

      const history = getUsageHistory('user-123', { itemId: 'tool-a' });

      expect(history).toHaveLength(1);
      expect(history[0].itemId).toBe('tool-a');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        recordUsage({
          userId: 'user-123',
          itemId: 'tool-a',
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 100, dataTransferBytes: 500 },
        });
      }

      const history = getUsageHistory('user-123', { limit: 5 });

      expect(history).toHaveLength(5);
    });

    it('should sort by timestamp descending', () => {
      const now = Date.now();

      recordUsage({
        userId: 'user-123',
        itemId: 'tool-a',
        itemType: 'tool',
        timestamp: new Date(now - 2000).toISOString(),
        metrics: { executions: 1, executionTimeMs: 100, dataTransferBytes: 500 },
      });

      recordUsage({
        userId: 'user-123',
        itemId: 'tool-b',
        itemType: 'tool',
        timestamp: new Date(now).toISOString(),
        metrics: { executions: 1, executionTimeMs: 200, dataTransferBytes: 1000 },
      });

      const history = getUsageHistory('user-123');

      expect(history[0].itemId).toBe('tool-b'); // Most recent first
      expect(history[1].itemId).toBe('tool-a');
    });
  });
});
