/**
 * Marketplace Billing Scheduled Jobs
 *
 * Cloud Scheduler-triggered jobs for marketplace billing operations:
 * - Daily: Usage aggregation, quota warnings
 * - Weekly: Usage reports for users
 * - Monthly: Publisher revenue share calculation, payout processing
 *
 * @module MarketplaceBillingJobs
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getStore } from '../../memory/store-factory.js';
import {
  getUsageSummary,
  getUsageHistory,
  getPendingPayouts,
  calculateRevenueShare,
  markPayoutComplete,
} from '../../marketplace/billing/index.js';
import { listTools, listAgents, listInstallations } from '../../marketplace/index.js';
import { createPublisherPayout, isStripeConfigured } from '../../marketplace/billing/stripe-webhooks.js';
import type { UserId, MarketplaceId } from '../../marketplace/schema/types.js';

const log = getLogger().child({ module: 'marketplace-billing-jobs' });

// ============================================================================
// TYPES
// ============================================================================

interface DailyAggregationResult {
  processedUsers: number;
  totalUsageRecords: number;
  quotaWarningsSent: number;
  errors: string[];
}

interface WeeklyReportResult {
  reportsGenerated: number;
  usersNotified: number;
  errors: string[];
}

interface MonthlyPayoutResult {
  publishersProcessed: number;
  totalPayoutsCents: number;
  payoutsInitiated: number;
  payoutsSkipped: number;
  errors: string[];
}

interface QuotaWarning {
  userId: string;
  itemId: string;
  usagePercentage: number;
  tier: string;
}

// ============================================================================
// DAILY: USAGE AGGREGATION & QUOTA WARNINGS
// ============================================================================

/**
 * Aggregate daily usage and send quota warnings
 * Runs daily at 6am
 */
export async function runDailyUsageAggregation(): Promise<DailyAggregationResult> {
  log.info('Starting daily usage aggregation');
  const result: DailyAggregationResult = {
    processedUsers: 0,
    totalUsageRecords: 0,
    quotaWarningsSent: 0,
    errors: [],
  };

  try {
    const store = await getStore();

    // Get all active users with marketplace installations
    // In production, this would query Firestore for users with installations
    const userIds = await getActiveMarketplaceUsers();

    for (const userId of userIds) {
      try {
        const installations = listInstallations(userId as UserId);

        for (const installation of installations) {
          // Get usage summary for each installation
          const summary = getUsageSummary(userId as UserId, installation.itemId, 'free');
          result.totalUsageRecords++;

          // Check for quota warnings (80% threshold)
          if (summary.quota.usagePercentage >= 80 && !summary.quota.exceeded) {
            const warning: QuotaWarning = {
              userId,
              itemId: installation.itemId,
              usagePercentage: summary.quota.usagePercentage,
              tier: 'free',
            };

            await sendQuotaWarning(warning);
            result.quotaWarningsSent++;
          }
        }

        result.processedUsers++;
      } catch (error) {
        result.errors.push(`User ${userId}: ${String(error)}`);
      }
    }

    log.info({ result }, 'Daily usage aggregation completed');
    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Daily usage aggregation failed');
    result.errors.push(String(error));
    return result;
  }
}

// ============================================================================
// WEEKLY: USAGE REPORTS
// ============================================================================

/**
 * Generate weekly usage reports for users
 * Runs every Monday at 9am
 */
export async function runWeeklyUsageReports(): Promise<WeeklyReportResult> {
  log.info('Starting weekly usage report generation');
  const result: WeeklyReportResult = {
    reportsGenerated: 0,
    usersNotified: 0,
    errors: [],
  };

  try {
    const userIds = await getActiveMarketplaceUsers();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const userId of userIds) {
      try {
        const installations = listInstallations(userId as UserId);

        if (installations.length === 0) continue;

        // Generate usage report
        const usageItems = installations.map((inst) => ({
          itemId: inst.itemId,
          itemType: inst.itemType,
          summary: getUsageSummary(userId as UserId, inst.itemId, 'free'),
          history: getUsageHistory(userId as UserId, {
            itemId: inst.itemId,
            startDate: weekAgo.toISOString(),
            endDate: now.toISOString(),
          }),
        }));

        const totalExecutions = usageItems.reduce(
          (sum, item) => sum + item.summary.totals.executions,
          0
        );

        if (totalExecutions > 0) {
          // Save report
          const report = {
            userId,
            period: `${weekAgo.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`,
            generatedAt: now.toISOString(),
            totalExecutions,
            items: usageItems.map((item) => ({
              itemId: item.itemId,
              itemType: item.itemType,
              executions: item.summary.totals.executions,
              quotaPercentage: item.summary.quota.usagePercentage,
            })),
          };

          // In production, save to Firestore and send notification
          log.debug({ userId, totalExecutions }, 'Weekly report generated');
          result.reportsGenerated++;
          result.usersNotified++;
        }
      } catch (error) {
        result.errors.push(`User ${userId}: ${String(error)}`);
      }
    }

    log.info({ result }, 'Weekly usage reports completed');
    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Weekly usage reports failed');
    result.errors.push(String(error));
    return result;
  }
}

// ============================================================================
// MONTHLY: REVENUE SHARE & PAYOUTS
// ============================================================================

/**
 * Process monthly revenue share and publisher payouts
 * Runs on the 1st of each month
 */
export async function runMonthlyRevenueCalculation(): Promise<MonthlyPayoutResult> {
  log.info('Starting monthly revenue calculation');
  const result: MonthlyPayoutResult = {
    publishersProcessed: 0,
    totalPayoutsCents: 0,
    payoutsInitiated: 0,
    payoutsSkipped: 0,
    errors: [],
  };

  try {
    // Get previous month period
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    // Get all publishers with tools/agents
    const tools = listTools();
    const agents = listAgents();
    const publisherIds = new Set([
      ...tools.map((t) => t.publisher.id),
      ...agents.map((a) => a.publisher.id),
    ]);

    for (const publisherId of publisherIds) {
      try {
        // Get pending payouts for this publisher
        const pendingPayouts = getPendingPayouts(publisherId);
        const periodPayouts = pendingPayouts.filter((p) => p.period === period);

        if (periodPayouts.length === 0) {
          result.payoutsSkipped++;
          continue;
        }

        // Calculate total payout
        const totalPayoutCents = periodPayouts.reduce(
          (sum, p) => sum + p.publisherShareCents,
          0
        );

        // Minimum payout threshold: $10
        const MIN_PAYOUT_CENTS = 1000;

        if (totalPayoutCents < MIN_PAYOUT_CENTS) {
          log.debug(
            { publisherId, totalPayoutCents, threshold: MIN_PAYOUT_CENTS },
            'Payout below threshold, rolling over'
          );
          result.payoutsSkipped++;
          continue;
        }

        // Process payout via Stripe Connect (if configured)
        if (isStripeConfigured()) {
          // In production, look up publisher's Stripe Connect account
          const publisherStripeId = await getPublisherStripeAccount(publisherId);

          if (publisherStripeId) {
            try {
              await createPublisherPayout({
                publisherId,
                stripeConnectAccountId: publisherStripeId,
                amountCents: totalPayoutCents,
                period,
                description: `Marketplace revenue share for ${period}`,
              });

              // Mark payouts as processing
              for (const payout of periodPayouts) {
                markPayoutComplete(`${payout.itemId}:${payout.period}`);
              }

              result.payoutsInitiated++;
            } catch (error) {
              result.errors.push(`Stripe payout failed for ${publisherId}: ${String(error)}`);
            }
          } else {
            log.warn({ publisherId }, 'No Stripe Connect account, skipping payout');
            result.payoutsSkipped++;
          }
        } else {
          log.debug({ publisherId, totalPayoutCents }, 'Stripe not configured, logging payout');
          result.payoutsSkipped++;
        }

        result.totalPayoutsCents += totalPayoutCents;
        result.publishersProcessed++;
      } catch (error) {
        result.errors.push(`Publisher ${publisherId}: ${String(error)}`);
      }
    }

    log.info({ result }, 'Monthly revenue calculation completed');
    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Monthly revenue calculation failed');
    result.errors.push(String(error));
    return result;
  }
}

/**
 * Process publisher payouts (runs on 15th of each month)
 */
export async function runPublisherPayouts(): Promise<MonthlyPayoutResult> {
  log.info('Starting publisher payout processing');
  // This uses the same logic as monthly revenue but on a different schedule
  return runMonthlyRevenueCalculation();
}

// ============================================================================
// QUARTERLY: CLEANUP & ARCHIVAL
// ============================================================================

/**
 * Clean up old usage records and archive historical data
 * Runs quarterly
 */
export async function runQuarterlyCleanup(): Promise<{
  recordsArchived: number;
  recordsDeleted: number;
  errors: string[];
}> {
  log.info('Starting quarterly cleanup');
  const result = {
    recordsArchived: 0,
    recordsDeleted: 0,
    errors: [],
  };

  try {
    // In production, this would:
    // 1. Archive usage records older than 1 year to cold storage
    // 2. Delete execution logs older than 90 days (keep aggregates)
    // 3. Clean up orphaned installation records

    log.info({ result }, 'Quarterly cleanup completed');
    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Quarterly cleanup failed');
    result.errors.push(String(error));
    return result;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get active marketplace users (users with installations)
 */
async function getActiveMarketplaceUsers(): Promise<string[]> {
  // In production, query Firestore for users with marketplace_installations
  // For now, return empty array (no-op in development)
  try {
    const store = await getStore();
    // This would query the engagement store or installations collection
    return [];
  } catch {
    return [];
  }
}

/**
 * Send quota warning notification to user
 */
async function sendQuotaWarning(warning: QuotaWarning): Promise<void> {
  log.info(
    { userId: warning.userId, itemId: warning.itemId, usage: warning.usagePercentage },
    'Sending quota warning'
  );

  // In production, this would:
  // 1. Send push notification
  // 2. Send email
  // 3. Show in-app notification
}

/**
 * Get publisher's Stripe Connect account ID
 */
async function getPublisherStripeAccount(publisherId: string): Promise<string | null> {
  // In production, look up from marketplace_publishers collection
  try {
    const store = await getStore();
    const publisher = await store.getSetting(`marketplace_publisher:${publisherId}`) as {
      stripeConnectAccountId?: string;
    } | null;
    return publisher?.stripeConnectAccountId || null;
  } catch {
    return null;
  }
}

// ============================================================================
// JOB CONFIGURATIONS
// ============================================================================

export const marketplaceBillingJobConfigs = [
  {
    id: 'marketplace-daily-aggregation',
    name: 'Daily Usage Aggregation',
    schedule: '0 6 * * *', // 6am daily
    description: 'Aggregate usage metrics and send quota warnings',
  },
  {
    id: 'marketplace-weekly-reports',
    name: 'Weekly Usage Reports',
    schedule: '0 9 * * 1', // 9am every Monday
    description: 'Generate and send weekly usage reports to users',
  },
  {
    id: 'marketplace-monthly-revenue',
    name: 'Monthly Revenue Calculation',
    schedule: '0 0 1 * *', // Midnight on 1st of month
    description: 'Calculate publisher revenue shares for previous month',
  },
  {
    id: 'marketplace-publisher-payouts',
    name: 'Publisher Payouts',
    schedule: '0 12 15 * *', // Noon on 15th of month
    description: 'Process pending publisher payouts via Stripe',
  },
  {
    id: 'marketplace-quarterly-cleanup',
    name: 'Quarterly Cleanup',
    schedule: '0 2 1 1,4,7,10 *', // 2am on 1st of Jan, Apr, Jul, Oct
    description: 'Archive old records and clean up data',
  },
];

export const marketplaceBillingJobs = {
  runDailyUsageAggregation,
  runWeeklyUsageReports,
  runMonthlyRevenueCalculation,
  runPublisherPayouts,
  runQuarterlyCleanup,
  getJobConfigs: () => marketplaceBillingJobConfigs,
};
