/**
 * Subscription Metrics Service
 *
 * Tracks subscription events and calculates business metrics:
 * - MRR (Monthly Recurring Revenue)
 * - Churn rate
 * - Conversion rate
 * - Recent subscription events
 *
 * Persists to Firestore for durability.
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'subscription-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionEvent {
  id: string;
  type: 'subscribe' | 'cancel' | 'upgrade' | 'downgrade' | 'payment_failed' | 'payment_success';
  userId: string;
  amount?: number; // In cents
  tier?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SubscriptionMetrics {
  activeSubscribers: number;
  mrr: number; // Monthly Recurring Revenue in dollars
  churnRate: number; // Percentage
  conversionRate: number; // Percentage
  recentEvents: SubscriptionEvent[];
  lastUpdated: Date;
}

export interface DailySubscriptionStats {
  date: string; // YYYY-MM-DD
  newSubscribers: number;
  cancellations: number;
  upgrades: number;
  downgrades: number;
  revenue: number; // In dollars
  activeAtEndOfDay: number;
}

// ============================================================================
// STATE
// ============================================================================

let firestoreClient: FirebaseFirestore.Firestore | null = null;
let firestoreAvailable = false;

// In-memory state (fallback and cache)
let activeSubscribers = 0;
let monthlyRevenue = 0; // In cents
let totalSignups = 0;
let totalCancellations = 0;
const recentEvents: SubscriptionEvent[] = [];
const MAX_RECENT_EVENTS = 100;

// Price mapping for MRR calculation
const TIER_PRICES: Record<string, number> = {
  monthly: 999, // $9.99/month
  yearly: 8325, // $99.90/year = $8.33/month
  free: 0,
};

const COLLECTIONS = {
  METRICS: 'subscription_metrics',
  EVENTS: 'subscription_events',
  DAILY: 'subscription_daily',
} as const;

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function initializeSubscriptionMetrics(): Promise<boolean> {
  try {
    const admin = await import('firebase-admin');

    if (admin.apps.length === 0) {
      try {
        admin.initializeApp({
          projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        });
      } catch {
        log.warn('Firebase not configured - using in-memory subscription metrics');
        return false;
      }
    }

    firestoreClient = admin.firestore();
    firestoreAvailable = true;

    // Load current state from Firestore
    await loadCurrentState();

    log.info('✅ Subscription metrics initialized with Firestore');
    return true;
  } catch (error) {
    log.warn({ error }, 'Firestore not available - using in-memory subscription metrics');
    firestoreAvailable = false;
    return false;
  }
}

async function loadCurrentState(): Promise<void> {
  if (!firestoreAvailable || !firestoreClient) return;

  try {
    const metricsDoc = await firestoreClient.collection(COLLECTIONS.METRICS).doc('current').get();

    if (metricsDoc.exists) {
      const data = metricsDoc.data();
      if (data) {
        activeSubscribers = data.activeSubscribers || 0;
        monthlyRevenue = data.monthlyRevenue || 0;
        totalSignups = data.totalSignups || 0;
        totalCancellations = data.totalCancellations || 0;
      }
    }

    // Load recent events
    const eventsSnapshot = await firestoreClient
      .collection(COLLECTIONS.EVENTS)
      .orderBy('timestamp', 'desc')
      .limit(MAX_RECENT_EVENTS)
      .get();

    recentEvents.length = 0;
    eventsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      recentEvents.push({
        id: doc.id,
        type: data.type,
        userId: data.userId,
        amount: data.amount,
        tier: data.tier,
        timestamp: data.timestamp?.toDate() || new Date(),
        metadata: data.metadata,
      });
    });

    log.info(
      { activeSubscribers, mrr: monthlyRevenue / 100 },
      'Loaded subscription metrics from Firestore'
    );
  } catch (error) {
    log.error({ error }, 'Failed to load subscription metrics');
  }
}

async function saveCurrentState(): Promise<void> {
  if (!firestoreAvailable || !firestoreClient) return;

  try {
    await firestoreClient.collection(COLLECTIONS.METRICS).doc('current').set({
      activeSubscribers,
      monthlyRevenue,
      totalSignups,
      totalCancellations,
      lastUpdated: new Date(),
    });
  } catch (error) {
    log.error({ error }, 'Failed to save subscription metrics');
  }
}

// ============================================================================
// EVENT TRACKING
// ============================================================================

export async function recordSubscriptionEvent(
  type: SubscriptionEvent['type'],
  userId: string,
  options: {
    amount?: number;
    tier?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  const event: SubscriptionEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    userId,
    amount: options.amount,
    tier: options.tier,
    timestamp: new Date(),
    metadata: options.metadata,
  };

  // Update counters
  switch (type) {
    case 'subscribe':
      activeSubscribers++;
      totalSignups++;
      if (options.tier && TIER_PRICES[options.tier]) {
        monthlyRevenue += TIER_PRICES[options.tier];
      }
      break;
    case 'cancel':
      activeSubscribers = Math.max(0, activeSubscribers - 1);
      totalCancellations++;
      if (options.tier && TIER_PRICES[options.tier]) {
        monthlyRevenue = Math.max(0, monthlyRevenue - TIER_PRICES[options.tier]);
      }
      break;
    case 'upgrade':
      // Revenue change handled by tier difference
      break;
    case 'downgrade':
      // Revenue change handled by tier difference
      break;
  }

  // Add to recent events
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.pop();
  }

  // Persist
  if (firestoreAvailable && firestoreClient) {
    try {
      await firestoreClient
        .collection(COLLECTIONS.EVENTS)
        .doc(event.id)
        .set({
          ...event,
          timestamp: event.timestamp,
        });
      await saveCurrentState();
    } catch (error) {
      log.error({ error }, 'Failed to persist subscription event');
    }
  }

  log.info({ type, userId, tier: options.tier }, 'Subscription event recorded');
}

// ============================================================================
// METRICS QUERIES
// ============================================================================

export async function getSubscriptionMetrics(): Promise<SubscriptionMetrics> {
  const mrr = monthlyRevenue / 100; // Convert cents to dollars

  // Calculate churn rate (cancellations / total signups * 100)
  const churnRate = totalSignups > 0 ? (totalCancellations / totalSignups) * 100 : 0;

  // Calculate conversion rate from actual user analytics
  // Conversion = paid subscribers / total unique users this month
  let conversionRate = 0;
  try {
    const { getAnalyticsSummary } = await import('./user-analytics.js');
    const analytics = await getAnalyticsSummary();
    const totalUniqueUsersThisMonth = analytics.thisMonth.uniqueUsers;

    if (totalUniqueUsersThisMonth > 0 && activeSubscribers > 0) {
      conversionRate = Math.round((activeSubscribers / totalUniqueUsersThisMonth) * 100 * 10) / 10;
    }
  } catch (error) {
    log.warn({ error }, 'Could not calculate conversion rate from analytics');
    // Fallback to estimate based on signups vs active
    conversionRate = totalSignups > 0 ? Math.round((activeSubscribers / totalSignups) * 100) : 0;
  }

  return {
    activeSubscribers,
    mrr,
    churnRate,
    conversionRate,
    recentEvents: recentEvents.slice(0, 20).map((e) => ({
      ...e,
      timestamp: e.timestamp,
    })),
    lastUpdated: new Date(),
  };
}

export async function getDailyStats(date: string): Promise<DailySubscriptionStats | null> {
  if (!firestoreAvailable || !firestoreClient) return null;

  try {
    const doc = await firestoreClient.collection(COLLECTIONS.DAILY).doc(date).get();

    if (doc.exists) {
      return doc.data() as DailySubscriptionStats;
    }
  } catch (error) {
    log.error({ error }, 'Failed to get daily subscription stats');
  }

  return null;
}

// ============================================================================
// STRIPE WEBHOOK INTEGRATION
// ============================================================================

/**
 * Called from stripe-subscription.ts handleWebhookEvent
 */
export async function trackStripeEvent(
  eventType: string,
  data: {
    userId?: string;
    subscriptionId?: string;
    tier?: string;
    amount?: number;
  }
): Promise<void> {
  const userId = data.userId || 'unknown';

  switch (eventType) {
    case 'checkout.session.completed':
      await recordSubscriptionEvent('subscribe', userId, {
        tier: data.tier,
        amount: data.amount,
        metadata: { subscriptionId: data.subscriptionId },
      });
      break;

    case 'customer.subscription.deleted':
      await recordSubscriptionEvent('cancel', userId, {
        tier: data.tier,
        metadata: { subscriptionId: data.subscriptionId },
      });
      break;

    case 'customer.subscription.updated':
      // Check if it's an upgrade or downgrade
      // For now, just log it
      log.info({ userId, tier: data.tier }, 'Subscription updated');
      break;

    case 'invoice.payment_failed':
      await recordSubscriptionEvent('payment_failed', userId, {
        metadata: { subscriptionId: data.subscriptionId },
      });
      break;

    case 'invoice.paid':
      await recordSubscriptionEvent('payment_success', userId, {
        amount: data.amount,
        metadata: { subscriptionId: data.subscriptionId },
      });
      break;
  }
}

/**
 * Get metrics formatted for API response
 */
export async function getMetricsForApi(): Promise<{
  activeSubscribers: number;
  mrr: number;
  churnRate: number;
  conversionRate: number;
  recentEvents: Array<{ type: string; timestamp: string; amount?: number }>;
}> {
  const metrics = await getSubscriptionMetrics();
  return {
    activeSubscribers: metrics.activeSubscribers,
    mrr: metrics.mrr,
    churnRate: metrics.churnRate,
    conversionRate: metrics.conversionRate,
    recentEvents: metrics.recentEvents.map((e: SubscriptionEvent) => ({
      type: e.type,
      timestamp: e.timestamp.toISOString(),
      amount: e.amount ? e.amount / 100 : undefined,
    })),
  };
}
