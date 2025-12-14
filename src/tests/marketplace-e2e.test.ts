/**
 * Marketplace E2E Tests
 *
 * End-to-end tests for the complete marketplace flow:
 * - Usage recording → Billing → Quota enforcement
 * - Revenue share calculations
 * - Tier-based quota limits
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordUsage,
  getUsageSummary,
  checkQuota,
  calculateRevenueShare,
  clearBillingData,
} from '../marketplace/billing/index.js';

describe('Marketplace E2E Flow', () => {
  beforeEach(() => {
    clearBillingData();
  });

  describe('Execute → Bill → Quota Flow', () => {
    it('should track usage and enforce quota', () => {
      const userId = 'user-123';
      const toolId = 'test-tool';

      // Record usage
      recordUsage({
        userId,
        itemId: toolId,
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: {
          executions: 1,
          executionTimeMs: 150,
          dataTransferBytes: 1024,
        },
      });

      // Verify usage was recorded
      const summary = getUsageSummary(userId, toolId, 'free');
      expect(summary.totals.executions).toBe(1);
      expect(summary.totals.executionTimeMs).toBe(150);

      // Verify quota is checked correctly
      const quotaCheck = checkQuota(userId, toolId, 'free');
      expect(quotaCheck.allowed).toBe(true);
    });

    it('should enforce quota after exceeding free tier limit', () => {
      const userId = 'heavy-user';
      const toolId = 'quota-test-tool';

      // Simulate 100 executions (free tier limit)
      for (let i = 0; i < 100; i++) {
        recordUsage({
          userId,
          itemId: toolId,
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 100 },
        });
      }

      // Quota should now be exceeded
      const quotaCheck = checkQuota(userId, toolId, 'free');
      expect(quotaCheck.allowed).toBe(false);
      expect(quotaCheck.upgradeRequired).toBe(true);
    });

    it('should allow continued usage with higher tier', () => {
      const userId = 'premium-user';
      const toolId = 'tier-test-tool';

      // Simulate exceeding free tier (100 executions)
      for (let i = 0; i < 150; i++) {
        recordUsage({
          userId,
          itemId: toolId,
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 100 },
        });
      }

      // Free tier should be blocked
      const freeCheck = checkQuota(userId, toolId, 'free');
      expect(freeCheck.allowed).toBe(false);

      // Friend tier (1000 limit) should still work
      const friendCheck = checkQuota(userId, toolId, 'friend');
      expect(friendCheck.allowed).toBe(true);

      // Partner tier (unlimited) should always work
      const partnerCheck = checkQuota(userId, toolId, 'partner');
      expect(partnerCheck.allowed).toBe(true);
    });
  });

  describe('Multi-User Quota Isolation', () => {
    it('should track quota independently per user', () => {
      const toolId = 'shared-tool';

      // Three users each do 50 executions
      for (const userId of ['user-a', 'user-b', 'user-c']) {
        for (let i = 0; i < 50; i++) {
          recordUsage({
            userId,
            itemId: toolId,
            itemType: 'tool',
            timestamp: new Date().toISOString(),
            metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 100 },
          });
        }
      }

      // All three should still have quota remaining
      expect(checkQuota('user-a', toolId, 'free').allowed).toBe(true);
      expect(checkQuota('user-b', toolId, 'free').allowed).toBe(true);
      expect(checkQuota('user-c', toolId, 'free').allowed).toBe(true);

      // Each at 50% of their individual quota
      expect(getUsageSummary('user-a', toolId, 'free').quota.usagePercentage).toBe(50);
    });

    it('should track quota independently per tool', () => {
      const userId = 'multi-tool-user';

      // User maxes out quota on tool-a
      for (let i = 0; i < 100; i++) {
        recordUsage({
          userId,
          itemId: 'tool-a',
          itemType: 'tool',
          timestamp: new Date().toISOString(),
          metrics: { executions: 1, executionTimeMs: 10, dataTransferBytes: 100 },
        });
      }

      // tool-a should be blocked
      expect(checkQuota(userId, 'tool-a', 'free').allowed).toBe(false);

      // tool-b should still work
      expect(checkQuota(userId, 'tool-b', 'free').allowed).toBe(true);
    });
  });

  describe('Revenue Share Flow', () => {
    it('should calculate 80/20 revenue split for publisher', () => {
      const share = calculateRevenueShare(
        'premium-tool',
        'publisher-123',
        '2024-01',
        10000 // $100 gross revenue
      );

      expect(share.grossRevenueCents).toBe(10000);
      expect(share.platformFeeCents).toBe(2000); // 20%
      expect(share.publisherShareCents).toBe(8000); // 80%
      expect(share.status).toBe('scheduled');
    });

    it('should calculate revenue for multiple tools', () => {
      calculateRevenueShare('tool-a', 'publisher-123', '2024-01', 5000);
      calculateRevenueShare('tool-b', 'publisher-123', '2024-01', 3000);

      // Total publisher share: (5000 + 3000) * 0.8 = 6400
    });
  });

  describe('Usage Summary', () => {
    it('should aggregate multiple usage records', () => {
      const userId = 'aggregation-user';
      const toolId = 'aggregation-tool';

      // Multiple executions
      recordUsage({
        userId,
        itemId: toolId,
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: { executions: 5, executionTimeMs: 500, dataTransferBytes: 5000 },
      });

      recordUsage({
        userId,
        itemId: toolId,
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: { executions: 3, executionTimeMs: 300, dataTransferBytes: 3000 },
      });

      const summary = getUsageSummary(userId, toolId, 'free');
      expect(summary.totals.executions).toBe(8);
      expect(summary.totals.executionTimeMs).toBe(800);
      expect(summary.totals.dataTransferBytes).toBe(8000);
    });

    it('should return empty summary for unused tool', () => {
      const summary = getUsageSummary('new-user', 'unused-tool', 'free');

      expect(summary.totals.executions).toBe(0);
      expect(summary.totals.executionTimeMs).toBe(0);
      expect(summary.quota.usagePercentage).toBe(0);
    });
  });
});
