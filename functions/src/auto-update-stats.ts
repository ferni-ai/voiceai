/**
 * Cloud Function: Auto-Update Founder Stats
 *
 * Triggered by Firestore writes to subscription documents.
 * Automatically updates founder stats when subscriptions change.
 *
 * Deploy with:
 *   firebase deploy --only functions:autoUpdateFounderStats
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface FounderStats {
  totalFounders: number;
  foundersByTier: Record<string, number>;
  thisMonthSignups: number;
  thisWeekSignups: number;
  totalRevenue: number;
  avgSubscriptionValue: number;
  lastUpdated: admin.firestore.FieldValue | Date;
}

/**
 * Triggered when a subscription document is created or updated
 */
export const autoUpdateFounderStats = functions.firestore
  .document('subscriptions/{subscriptionId}')
  .onWrite(async (change, context) => {
    const subscriptionId = context.params.subscriptionId;

    try {
      // Get the before and after data
      const before = change.before.exists ? change.before.data() : null;
      const after = change.after.exists ? change.after.data() : null;

      // Determine what changed
      const wasCreated = !before && after;
      const wasDeleted = before && !after;
      const tierChanged = before && after && before.tier !== after.tier;

      if (!wasCreated && !wasDeleted && !tierChanged) {
        // No relevant change
        return null;
      }

      // Update founder stats atomically
      const statsRef = db.collection('founder_stats').doc('current');

      await db.runTransaction(async (transaction) => {
        const statsDoc = await transaction.get(statsRef);
        const currentStats = statsDoc.exists
          ? (statsDoc.data() as FounderStats)
          : {
              totalFounders: 0,
              foundersByTier: {},
              thisMonthSignups: 0,
              thisWeekSignups: 0,
              totalRevenue: 0,
              avgSubscriptionValue: 0,
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            };

        // Clone for updates
        const newStats: FounderStats = {
          ...currentStats,
          foundersByTier: { ...currentStats.foundersByTier },
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (wasCreated && after) {
          // New subscription
          newStats.totalFounders += 1;
          const tier = after.tier || 'free';
          newStats.foundersByTier[tier] = (newStats.foundersByTier[tier] || 0) + 1;

          // Check if this month/week
          const createdAt = after.createdAt?.toDate?.() || new Date();
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());

          if (createdAt >= startOfMonth) {
            newStats.thisMonthSignups += 1;
          }
          if (createdAt >= startOfWeek) {
            newStats.thisWeekSignups += 1;
          }

          // Update revenue if applicable
          if (after.amount) {
            newStats.totalRevenue += after.amount;
            newStats.avgSubscriptionValue =
              newStats.totalFounders > 0
                ? newStats.totalRevenue / newStats.totalFounders
                : 0;
          }

          functions.logger.info('New founder subscription', {
            subscriptionId,
            tier,
            totalFounders: newStats.totalFounders,
          });
        } else if (wasDeleted && before) {
          // Subscription deleted
          newStats.totalFounders = Math.max(0, newStats.totalFounders - 1);
          const tier = before.tier || 'free';
          newStats.foundersByTier[tier] = Math.max(
            0,
            (newStats.foundersByTier[tier] || 0) - 1
          );

          functions.logger.info('Founder subscription deleted', {
            subscriptionId,
            tier,
            totalFounders: newStats.totalFounders,
          });
        } else if (tierChanged && before && after) {
          // Tier changed
          const oldTier = before.tier || 'free';
          const newTier = after.tier || 'free';

          newStats.foundersByTier[oldTier] = Math.max(
            0,
            (newStats.foundersByTier[oldTier] || 0) - 1
          );
          newStats.foundersByTier[newTier] = (newStats.foundersByTier[newTier] || 0) + 1;

          functions.logger.info('Founder tier changed', {
            subscriptionId,
            oldTier,
            newTier,
          });
        }

        transaction.set(statsRef, newStats, { merge: true });
      });

      return null;
    } catch (error) {
      functions.logger.error('Failed to update founder stats', {
        subscriptionId,
        error: String(error),
      });
      throw error;
    }
  });

/**
 * Scheduled function to reset weekly counters every Sunday at midnight
 */
export const resetWeeklyFounderCounters = functions.pubsub
  .schedule('0 0 * * 0') // Every Sunday at midnight
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      await db.collection('founder_stats').doc('current').update({
        thisWeekSignups: 0,
        lastWeeklyReset: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info('Weekly founder counters reset');
      return null;
    } catch (error) {
      functions.logger.error('Failed to reset weekly counters', { error: String(error) });
      throw error;
    }
  });

/**
 * Scheduled function to reset monthly counters on the 1st of each month
 */
export const resetMonthlyFounderCounters = functions.pubsub
  .schedule('0 0 1 * *') // 1st of every month at midnight
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      await db.collection('founder_stats').doc('current').update({
        thisMonthSignups: 0,
        lastMonthlyReset: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info('Monthly founder counters reset');
      return null;
    } catch (error) {
      functions.logger.error('Failed to reset monthly counters', { error: String(error) });
      throw error;
    }
  });

/**
 * HTTP trigger to manually recalculate all stats
 * Useful for initial setup or fixing drift
 */
export const recalculateFounderStats = functions.https.onRequest(async (req, res) => {
  // Require admin key for manual trigger
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY && process.env.NODE_ENV !== 'development') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Query all subscriptions
    const subscriptionsSnapshot = await db.collection('subscriptions').get();

    const stats: FounderStats = {
      totalFounders: 0,
      foundersByTier: {},
      thisMonthSignups: 0,
      thisWeekSignups: 0,
      totalRevenue: 0,
      avgSubscriptionValue: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    for (const doc of subscriptionsSnapshot.docs) {
      const sub = doc.data();

      stats.totalFounders += 1;

      const tier = sub.tier || 'free';
      stats.foundersByTier[tier] = (stats.foundersByTier[tier] || 0) + 1;

      const createdAt = sub.createdAt?.toDate?.() || new Date(0);
      if (createdAt >= startOfMonth) {
        stats.thisMonthSignups += 1;
      }
      if (createdAt >= startOfWeek) {
        stats.thisWeekSignups += 1;
      }

      if (sub.amount) {
        stats.totalRevenue += sub.amount;
      }
    }

    stats.avgSubscriptionValue =
      stats.totalFounders > 0 ? stats.totalRevenue / stats.totalFounders : 0;

    // Save recalculated stats
    await db.collection('founder_stats').doc('current').set(stats);

    functions.logger.info('Founder stats recalculated', stats);

    res.json({
      success: true,
      stats: {
        ...stats,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    functions.logger.error('Failed to recalculate stats', { error: String(error) });
    res.status(500).json({ error: 'Failed to recalculate stats' });
  }
});
