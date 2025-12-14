/**
 * Marketplace Billing System
 *
 * Handles usage tracking, quota enforcement, and revenue share for
 * marketplace tools and agents.
 *
 * Features:
 * - Usage metering (executions, time, data transfer)
 * - Quota enforcement (free tier limits)
 * - Revenue share calculation
 * - Stripe integration (planned)
 *
 * Pricing models:
 * - Free: Limited executions, basic features
 * - Pay-per-use: Per execution pricing
 * - Subscription: Monthly/yearly plans
 * - Revenue share: Platform takes 20% of publisher revenue
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { MarketplaceId, Pricing, TenantId, UserId } from '../schema/types.js';

const log = getLogger().child({ module: 'marketplace-billing' });

// ============================================================================
// TYPES
// ============================================================================

export interface UsageRecord {
  id: string;
  userId: UserId;
  tenantId?: TenantId;
  itemId: MarketplaceId;
  itemType: 'tool' | 'agent';
  timestamp: string;
  metrics: UsageMetrics;
}

export interface UsageMetrics {
  /** Number of executions */
  executions: number;
  /** Total execution time in milliseconds */
  executionTimeMs: number;
  /** Data transferred in bytes */
  dataTransferBytes: number;
  /** Token count (for LLM-based tools) */
  tokens?: number;
}

export interface UsageSummary {
  period: string; // e.g., "2024-01"
  userId: UserId;
  itemId: MarketplaceId;
  totals: UsageMetrics;
  quota: Quota;
  billedAmount: BilledAmount;
}

export interface Quota {
  /** Max executions per period */
  maxExecutions: number;
  /** Max execution time per period (ms) */
  maxExecutionTimeMs: number;
  /** Current usage against quota */
  currentExecutions: number;
  currentExecutionTimeMs: number;
  /** Percentage of quota used */
  usagePercentage: number;
  /** Whether quota is exceeded */
  exceeded: boolean;
  /** Reset date for quota */
  resetsAt: string;
}

export interface BilledAmount {
  /** Amount in cents */
  amountCents: number;
  /** Currency code */
  currency: string;
  /** Breakdown by pricing component */
  breakdown: Array<{
    component: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
}

export interface RevenueShare {
  itemId: MarketplaceId;
  publisherId: string;
  period: string;
  grossRevenueCents: number;
  platformFeeCents: number; // 20%
  publisherShareCents: number; // 80%
  status: 'pending' | 'paid' | 'scheduled';
  payoutDate?: string;
}

// Quota limits by subscription tier
const TIER_QUOTAS: Record<string, { executions: number; timeMs: number }> = {
  free: { executions: 100, timeMs: 60_000 }, // 100 executions, 1 min total time
  friend: { executions: 1000, timeMs: 600_000 }, // 1000 executions, 10 min
  partner: { executions: -1, timeMs: -1 }, // Unlimited
};

// Platform fee percentage
const PLATFORM_FEE_PERCENT = 20;

// ============================================================================
// IN-MEMORY STORAGE (Firestore in production)
// ============================================================================

interface BillingState {
  usageRecords: UsageRecord[];
  monthlyUsage: Map<string, UsageMetrics>; // key: `${userId}:${itemId}:${period}`
  revenueShares: RevenueShare[];
}

const state: BillingState = {
  usageRecords: [],
  monthlyUsage: new Map(),
  revenueShares: [],
};

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Record usage for billing
 */
export function recordUsage(record: Omit<UsageRecord, 'id'>): UsageRecord {
  const fullRecord: UsageRecord = {
    ...record,
    id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  state.usageRecords.push(fullRecord);

  // Update monthly aggregates
  const period = fullRecord.timestamp.slice(0, 7); // YYYY-MM
  const key = `${fullRecord.userId}:${fullRecord.itemId}:${period}`;

  const existing = state.monthlyUsage.get(key) || {
    executions: 0,
    executionTimeMs: 0,
    dataTransferBytes: 0,
    tokens: 0,
  };

  existing.executions += fullRecord.metrics.executions;
  existing.executionTimeMs += fullRecord.metrics.executionTimeMs;
  existing.dataTransferBytes += fullRecord.metrics.dataTransferBytes;
  if (fullRecord.metrics.tokens) {
    existing.tokens = (existing.tokens || 0) + fullRecord.metrics.tokens;
  }

  state.monthlyUsage.set(key, existing);

  log.debug(
    {
      userId: fullRecord.userId,
      itemId: fullRecord.itemId,
      executions: fullRecord.metrics.executions,
    },
    'Usage recorded'
  );

  return fullRecord;
}

/**
 * Get usage summary for a user and item
 */
export function getUsageSummary(
  userId: UserId,
  itemId: MarketplaceId,
  subscriptionTier = 'free'
): UsageSummary {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const key = `${userId}:${itemId}:${period}`;

  const usage = state.monthlyUsage.get(key) || {
    executions: 0,
    executionTimeMs: 0,
    dataTransferBytes: 0,
  };

  // Get quota limits
  const tierQuota = TIER_QUOTAS[subscriptionTier] || TIER_QUOTAS.free;
  const quotaExceeded =
    (tierQuota.executions > 0 && usage.executions >= tierQuota.executions) ||
    (tierQuota.timeMs > 0 && usage.executionTimeMs >= tierQuota.timeMs);

  const usagePercentage =
    tierQuota.executions > 0 ? Math.round((usage.executions / tierQuota.executions) * 100) : 0;

  // Calculate next reset (first of next month)
  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    period,
    userId,
    itemId,
    totals: usage,
    quota: {
      maxExecutions: tierQuota.executions,
      maxExecutionTimeMs: tierQuota.timeMs,
      currentExecutions: usage.executions,
      currentExecutionTimeMs: usage.executionTimeMs,
      usagePercentage,
      exceeded: quotaExceeded,
      resetsAt: resetDate.toISOString(),
    },
    billedAmount: {
      amountCents: 0, // Free tier
      currency: 'USD',
      breakdown: [],
    },
  };
}

/**
 * Check if user can execute (quota check)
 */
export function checkQuota(
  userId: UserId,
  itemId: MarketplaceId,
  subscriptionTier = 'free'
): { allowed: boolean; reason?: string; upgradeRequired?: boolean } {
  const summary = getUsageSummary(userId, itemId, subscriptionTier);

  if (summary.quota.exceeded) {
    return {
      allowed: false,
      reason: `Monthly quota exceeded (${summary.quota.currentExecutions}/${summary.quota.maxExecutions} executions)`,
      upgradeRequired: subscriptionTier === 'free',
    };
  }

  return { allowed: true };
}

// ============================================================================
// BILLING CALCULATION
// ============================================================================

/**
 * Calculate billing for a tool based on pricing model
 */
export function calculateBilling(usage: UsageMetrics, pricing: Pricing): BilledAmount {
  const breakdown: BilledAmount['breakdown'] = [];
  let totalCents = 0;

  switch (pricing.model) {
    case 'free':
      // No charge
      break;

    case 'one-time':
      // One-time purchase, no per-use charge
      break;

    case 'usage-based':
      // Per-execution pricing
      if (pricing.priceInCents && usage.executions > 0) {
        const executionCost = pricing.priceInCents * usage.executions;
        breakdown.push({
          component: 'executions',
          quantity: usage.executions,
          unitPriceCents: pricing.priceInCents,
          totalCents: executionCost,
        });
        totalCents += executionCost;
      }
      break;

    case 'subscription':
      // Subscription handled separately
      break;

    case 'custom':
      // Custom pricing logic
      break;
  }

  return {
    amountCents: totalCents,
    currency: 'USD',
    breakdown,
  };
}

// ============================================================================
// REVENUE SHARE
// ============================================================================

/**
 * Calculate revenue share for a publisher
 */
export function calculateRevenueShare(
  itemId: MarketplaceId,
  publisherId: string,
  period: string,
  grossRevenueCents: number
): RevenueShare {
  const platformFeeCents = Math.round(grossRevenueCents * (PLATFORM_FEE_PERCENT / 100));
  const publisherShareCents = grossRevenueCents - platformFeeCents;

  // Schedule payout for 15th of next month
  const [year, month] = period.split('-').map(Number);
  const payoutDate = new Date(year, month, 15); // Month is 0-indexed, so this is next month

  const share: RevenueShare = {
    itemId,
    publisherId,
    period,
    grossRevenueCents,
    platformFeeCents,
    publisherShareCents,
    status: 'scheduled',
    payoutDate: payoutDate.toISOString(),
  };

  state.revenueShares.push(share);

  log.info(
    { itemId, publisherId, period, grossRevenueCents, publisherShareCents },
    'Revenue share calculated'
  );

  return share;
}

/**
 * Get pending payouts for a publisher
 */
export function getPendingPayouts(publisherId: string): RevenueShare[] {
  return state.revenueShares.filter((s) => s.publisherId === publisherId && s.status !== 'paid');
}

/**
 * Mark payout as completed
 */
export function markPayoutComplete(shareId: string): void {
  const share = state.revenueShares.find((s) => `${s.itemId}:${s.period}` === shareId);
  if (share) {
    share.status = 'paid';
    log.info({ shareId }, 'Payout marked complete');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get usage history for reporting
 */
export function getUsageHistory(
  userId: UserId,
  options?: {
    itemId?: MarketplaceId;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): UsageRecord[] {
  let records = state.usageRecords.filter((r) => r.userId === userId);

  if (options?.itemId) {
    records = records.filter((r) => r.itemId === options.itemId);
  }

  if (options?.startDate) {
    records = records.filter((r) => r.timestamp >= options.startDate!);
  }

  if (options?.endDate) {
    records = records.filter((r) => r.timestamp <= options.endDate!);
  }

  // Sort by timestamp descending
  records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (options?.limit) {
    records = records.slice(0, options.limit);
  }

  return records;
}

/**
 * Clear billing data (for testing)
 */
export function clearBillingData(): void {
  state.usageRecords = [];
  state.monthlyUsage.clear();
  state.revenueShares = [];
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize billing system
 */
export async function initializeBilling(): Promise<void> {
  log.info('Billing system initialized');

  // In production, this would:
  // 1. Connect to Stripe
  // 2. Load existing usage data from Firestore
  // 3. Set up webhook handlers for payment events
}
