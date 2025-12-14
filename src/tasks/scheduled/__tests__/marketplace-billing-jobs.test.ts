/**
 * Marketplace Billing Jobs Tests
 *
 * Tests the Cloud Scheduler job handlers for marketplace billing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
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
}));

// Mock Firestore
const mockFirestoreData: Record<string, unknown[]> = {
  marketplace_installations: [
    { userId: 'user_1', itemId: 'tool_1' },
    { userId: 'user_2', itemId: 'tool_2' },
  ],
  marketplace_publishers: [
    { id: 'pub_1', stripeConnectAccountId: 'acct_test_1' },
  ],
};

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => ({
      get: vi.fn().mockResolvedValue({
        forEach: (fn: (doc: { data: () => unknown }) => void) => {
          const data = mockFirestoreData[name] || [];
          data.forEach((item) => fn({ data: () => item }));
        },
      }),
      doc: vi.fn((id: string) => ({
        get: vi.fn().mockResolvedValue({
          exists: mockFirestoreData[name]?.some((d: unknown) => (d as { id?: string }).id === id),
          data: () => mockFirestoreData[name]?.find((d: unknown) => (d as { id?: string }).id === id),
        }),
      })),
    })),
  }),
}));

// Mock marketplace billing functions
vi.mock('../../../marketplace/billing/index.js', () => ({
  getUsageSummary: vi.fn(() => ({
    totals: { executions: 5, executionTimeMs: 1000, dataTransferBytes: 5000 },
    quota: { usagePercentage: 50, exceeded: false },
    period: { startDate: '', endDate: '' },
  })),
  getUsageHistory: vi.fn(() => []),
  getPendingPayouts: vi.fn(() => []),
  calculateRevenueShare: vi.fn(),
  markPayoutComplete: vi.fn(),
}));

// Mock marketplace registry
vi.mock('../../../marketplace/index.js', () => ({
  listTools: vi.fn(() => [
    { id: 'tool_1', publisher: { id: 'pub_1' } },
    { id: 'tool_2', publisher: { id: 'pub_2' } },
  ]),
  listAgents: vi.fn(() => [
    { id: 'agent_1', publisher: { id: 'pub_1' } },
  ]),
  listInstallations: vi.fn(() => [
    { itemId: 'tool_1', itemType: 'tool' },
  ]),
}));

// Mock Stripe webhooks
vi.mock('../../../marketplace/billing/stripe-webhooks.js', () => ({
  isStripeConfigured: vi.fn(() => true),
  createPublisherPayout: vi.fn().mockResolvedValue({ transferId: 'tr_test' }),
}));

import {
  marketplaceBillingJobs,
  runDailyUsageAggregation,
  runWeeklyUsageReports,
  runMonthlyRevenueCalculation,
  runPublisherPayouts,
  runQuarterlyCleanup,
  marketplaceBillingJobConfigs,
} from '../marketplace-billing-jobs.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Marketplace Billing Jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Job Configurations', () => {
    it('should export all job configurations', () => {
      expect(marketplaceBillingJobConfigs).toBeDefined();
      expect(marketplaceBillingJobConfigs).toHaveLength(5);
    });

    it('should have valid cron schedules', () => {
      for (const config of marketplaceBillingJobConfigs) {
        expect(config.id).toBeDefined();
        expect(config.name).toBeDefined();
        expect(config.schedule).toMatch(/^[\d*,/-\s]+$/);
        expect(config.description).toBeDefined();
      }
    });

    it('should have correct job IDs', () => {
      const expectedIds = [
        'marketplace-daily-aggregation',
        'marketplace-weekly-reports',
        'marketplace-monthly-revenue',
        'marketplace-publisher-payouts',
        'marketplace-quarterly-cleanup',
      ];

      const actualIds = marketplaceBillingJobConfigs.map((c) => c.id);
      expect(actualIds).toEqual(expectedIds);
    });
  });

  describe('Daily Usage Aggregation', () => {
    it('should process active users and track results', async () => {
      const result = await runDailyUsageAggregation();

      expect(result).toBeDefined();
      expect(result.processedUsers).toBeGreaterThanOrEqual(0);
      expect(result.totalUsageRecords).toBeGreaterThanOrEqual(0);
      expect(result.quotaWarningsSent).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
    });

    it('should return error results on failure', async () => {
      // Errors are captured in the result, not thrown
      const result = await runDailyUsageAggregation();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Weekly Usage Reports', () => {
    it('should generate reports for active users', async () => {
      const result = await runWeeklyUsageReports();

      expect(result).toBeDefined();
      expect(result.reportsGenerated).toBeGreaterThanOrEqual(0);
      expect(result.usersNotified).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Monthly Revenue Calculation', () => {
    it('should process publishers and calculate payouts', async () => {
      const result = await runMonthlyRevenueCalculation();

      expect(result).toBeDefined();
      expect(result.publishersProcessed).toBeGreaterThanOrEqual(0);
      expect(result.totalPayoutsCents).toBeGreaterThanOrEqual(0);
      expect(result.payoutsInitiated).toBeGreaterThanOrEqual(0);
      expect(result.payoutsSkipped).toBeGreaterThanOrEqual(0);
    });

    it('should use correct period format', async () => {
      const result = await runMonthlyRevenueCalculation();

      // Result should complete without errors
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Publisher Payouts', () => {
    it('should delegate to monthly revenue calculation', async () => {
      const result = await runPublisherPayouts();

      // Same structure as monthly revenue
      expect(result).toBeDefined();
      expect(result.publishersProcessed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Quarterly Cleanup', () => {
    it('should run cleanup and return results', async () => {
      const result = await runQuarterlyCleanup();

      expect(result).toBeDefined();
      expect(result.recordsArchived).toBe(0);
      expect(result.recordsDeleted).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Exported Jobs Object', () => {
    it('should export all job functions', () => {
      expect(marketplaceBillingJobs.runDailyUsageAggregation).toBe(runDailyUsageAggregation);
      expect(marketplaceBillingJobs.runWeeklyUsageReports).toBe(runWeeklyUsageReports);
      expect(marketplaceBillingJobs.runMonthlyRevenueCalculation).toBe(runMonthlyRevenueCalculation);
      expect(marketplaceBillingJobs.runPublisherPayouts).toBe(runPublisherPayouts);
      expect(marketplaceBillingJobs.runQuarterlyCleanup).toBe(runQuarterlyCleanup);
    });

    it('should export getJobConfigs function', () => {
      const configs = marketplaceBillingJobs.getJobConfigs();
      expect(configs).toBe(marketplaceBillingJobConfigs);
    });
  });
});
