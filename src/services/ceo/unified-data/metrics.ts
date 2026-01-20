/**
 * Metrics data fetchers for Unified Data Service
 *
 * @module services/ceo/unified-data/metrics
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, recordDegradation } from '../../../utils/firestore-utils.js';
import { dataCache, CACHE_TTL } from './cache.js';
import { getPeriodStartDate } from './helpers.js';
import type { Period, CallMetrics, RevenueMetrics, CostMetrics } from './types.js';

const log = createLogger({ module: 'ceo-unified-data-metrics' });

// ============================================================================
// ACTIVE USERS
// ============================================================================

export async function getActiveUsers(period: Period): Promise<number> {
  const cacheKey = `active_users_${period}`;
  const cached = dataCache.get<number>(cacheKey);
  if (cached !== null) return cached;

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('unified-data', 'db_unavailable');
    return 0;
  }

  try {
    const startDate = getPeriodStartDate(period);
    const snapshot = await db
      .collection('user_sessions')
      .where('lastActiveAt', '>=', startDate.toISOString())
      .get();

    const uniqueUsers = new Set(snapshot.docs.map((doc) => doc.data().userId));
    const count = uniqueUsers.size;

    dataCache.set(cacheKey, count, CACHE_TTL.METRICS);
    log.debug({ period, count }, 'Active users fetched');
    return count;
  } catch (error) {
    log.error({ error: String(error), period }, 'Failed to get active users');
    return 0;
  }
}

// ============================================================================
// CALL VOLUME
// ============================================================================

export async function getCallVolume(period: Period): Promise<CallMetrics> {
  const cacheKey = `call_volume_${period}`;
  const cached = dataCache.get<CallMetrics>(cacheKey);
  if (cached !== null) return cached;

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('unified-data', 'db_unavailable');
    return createEmptyCallMetrics();
  }

  try {
    const startDate = getPeriodStartDate(period);
    const snapshot = await db
      .collection('call_logs')
      .where('startedAt', '>=', startDate.toISOString())
      .get();

    if (snapshot.empty) {
      const emptyMetrics = createEmptyCallMetrics();
      dataCache.set(cacheKey, emptyMetrics, CACHE_TTL.METRICS);
      return emptyMetrics;
    }

    const calls = snapshot.docs.map((doc) => doc.data());
    const metrics = calculateCallMetrics(calls);

    dataCache.set(cacheKey, metrics, CACHE_TTL.METRICS);
    log.debug({ period, totalCalls: metrics.totalCalls }, 'Call volume fetched');
    return metrics;
  } catch (error) {
    log.error({ error: String(error), period }, 'Failed to get call volume');
    return createEmptyCallMetrics();
  }
}

function createEmptyCallMetrics(): CallMetrics {
  return {
    totalCalls: 0,
    averageDuration: 0,
    successRate: 0,
    peakHour: 0,
    uniqueUsers: 0,
  };
}

function calculateCallMetrics(calls: FirebaseFirestore.DocumentData[]): CallMetrics {
  const totalCalls = calls.length;
  const totalDuration = calls.reduce((sum, c) => sum + (Number(c.duration) || 0), 0);
  const successfulCalls = calls.filter((c) => c.status === 'completed').length;
  const uniqueUsers = new Set(calls.map((c) => c.userId)).size;

  // Calculate peak hour
  const hourCounts = new Array(24).fill(0);
  for (const call of calls) {
    const hour = new Date(String(call.startedAt)).getHours();
    hourCounts[hour]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  return {
    totalCalls,
    averageDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
    successRate: totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0,
    peakHour,
    uniqueUsers,
  };
}

// ============================================================================
// REVENUE
// ============================================================================

export async function getRevenue(period: Period): Promise<RevenueMetrics> {
  const cacheKey = `revenue_${period}`;
  const cached = dataCache.get<RevenueMetrics>(cacheKey);
  if (cached !== null) return cached;

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('unified-data', 'db_unavailable');
    return createEmptyRevenueMetrics();
  }

  try {
    const startDate = getPeriodStartDate(period);
    const metrics = await calculateRevenueMetrics(db, startDate);

    dataCache.set(cacheKey, metrics, CACHE_TTL.METRICS);
    log.debug({ period, totalRevenue: metrics.totalRevenue, mrr: metrics.mrr }, 'Revenue fetched');
    return metrics;
  } catch (error) {
    log.error({ error: String(error), period }, 'Failed to get revenue');
    return createEmptyRevenueMetrics();
  }
}

function createEmptyRevenueMetrics(): RevenueMetrics {
  return {
    totalRevenue: 0,
    mrr: 0,
    newSubscriptions: 0,
    churnedSubscriptions: 0,
    arpu: 0,
  };
}

async function calculateRevenueMetrics(
  db: FirebaseFirestore.Firestore,
  startDate: Date
): Promise<RevenueMetrics> {
  // Get transactions for the period
  const transactionsSnapshot = await db
    .collection('transactions')
    .where('createdAt', '>=', startDate.toISOString())
    .get();

  const transactions = transactionsSnapshot.docs.map((doc) => doc.data());
  const totalRevenue = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Get subscription changes
  const subscriptionsSnapshot = await db
    .collection('subscriptions')
    .where('updatedAt', '>=', startDate.toISOString())
    .get();

  const subscriptions = subscriptionsSnapshot.docs.map((doc) => doc.data());
  const newSubscriptions = subscriptions.filter(
    (s) => s.status === 'active' && s.createdAt >= startDate.toISOString()
  ).length;
  const churnedSubscriptions = subscriptions.filter((s) => s.status === 'cancelled').length;

  // Calculate MRR from active subscriptions
  const activeSubsSnapshot = await db
    .collection('subscriptions')
    .where('status', '==', 'active')
    .get();

  const activeSubs = activeSubsSnapshot.docs.map((doc) => doc.data());
  const mrr = activeSubs.reduce((sum, s) => sum + (Number(s.monthlyAmount) || 0), 0);

  return {
    totalRevenue,
    mrr,
    newSubscriptions,
    churnedSubscriptions,
    arpu: activeSubs.length > 0 ? Math.round(mrr / activeSubs.length) : 0,
  };
}

// ============================================================================
// CLOUD COSTS
// ============================================================================

export async function getCloudCosts(period: Period): Promise<CostMetrics> {
  const cacheKey = `cloud_costs_${period}`;
  const cached = dataCache.get<CostMetrics>(cacheKey);
  if (cached !== null) return cached;

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('unified-data', 'db_unavailable');
    return createEmptyCostMetrics();
  }

  try {
    const startDate = getPeriodStartDate(period);
    const snapshot = await db
      .collection('cloud_costs')
      .where('date', '>=', startDate.toISOString())
      .get();

    if (snapshot.empty) {
      const emptyCosts = createEmptyCostMetrics();
      dataCache.set(cacheKey, emptyCosts, CACHE_TTL.METRICS);
      return emptyCosts;
    }

    const costs = snapshot.docs.map((doc) => doc.data());
    const metrics = calculateCostMetrics(costs);

    dataCache.set(cacheKey, metrics, CACHE_TTL.METRICS);
    log.debug({ period, totalCost: metrics.totalCost }, 'Cloud costs fetched');
    return metrics;
  } catch (error) {
    log.error({ error: String(error), period }, 'Failed to get cloud costs');
    return createEmptyCostMetrics();
  }
}

function createEmptyCostMetrics(): CostMetrics {
  return {
    totalCost: 0,
    computeCost: 0,
    storageCost: 0,
    networkCost: 0,
    aiApiCost: 0,
    breakdown: {},
  };
}

function calculateCostMetrics(costs: FirebaseFirestore.DocumentData[]): CostMetrics {
  const breakdown: Record<string, number> = {};
  let computeCost = 0;
  let storageCost = 0;
  let networkCost = 0;
  let aiApiCost = 0;

  for (const cost of costs) {
    const category = String(cost.category || 'other');
    const amount = Number(cost.amount) || 0;
    breakdown[category] = (breakdown[category] || 0) + amount;

    switch (category) {
      case 'compute':
      case 'gce':
      case 'cloud-run':
        computeCost += amount;
        break;
      case 'storage':
      case 'firestore':
      case 'gcs':
        storageCost += amount;
        break;
      case 'network':
      case 'egress':
        networkCost += amount;
        break;
      case 'ai':
      case 'openai':
      case 'gemini':
      case 'cartesia':
        aiApiCost += amount;
        break;
    }
  }

  const totalCost = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return {
    totalCost,
    computeCost,
    storageCost,
    networkCost,
    aiApiCost,
    breakdown,
  };
}
