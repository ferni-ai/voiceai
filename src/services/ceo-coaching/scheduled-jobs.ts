/**
 * CEO Coaching Scheduled Jobs
 *
 * Handlers for Cloud Scheduler jobs:
 * - Daily trigger analysis (9 AM)
 * - Weekly digest generation (Sunday 8 AM)
 *
 * These are called via HTTP endpoints from Cloud Scheduler.
 *
 * @module services/ceo-coaching/scheduled-jobs
 */

import { createLogger } from '../../utils/safe-logger.js';
import { generateWeeklyDigest, renderDigestEmail, renderDigestText } from './weekly-digest.js';
import { processCEOTriggersBatch } from './proactive-triggers.js';
import { sendEmail } from '../communication-service.js';

const log = createLogger({ module: 'ceo-scheduled-jobs' });

// ============================================================================
// DAILY TRIGGER ANALYSIS JOB
// ============================================================================

/**
 * Run daily trigger analysis for all CEO coaching users.
 * Called by Cloud Scheduler at 9 AM daily.
 *
 * @returns Job results with stats
 */
export async function runDailyTriggerAnalysis(): Promise<{
  success: boolean;
  stats: { processed: number; triggered: number; errors: number };
  error?: string;
}> {
  log.info('Starting daily CEO trigger analysis job');

  try {
    // Get all users with CEO coaching activity
    const getUserIds = async (): Promise<string[]> => {
      const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return [];

      // Query users who have used CEO coaching features
      // Look for users with recent ceo_energy, ceo_wins, or ceo_priorities
      const usersRef = db.collection('bogle_users');

      // Get users who logged energy in the last 30 days (active CEO users)
      const activeUsers = new Set<string>();

      // Check energy logs
      const energySnapshot = await usersRef
        .where('ceoCoachingActive', '==', true)
        .select() // Just get IDs
        .limit(1000)
        .get();

      energySnapshot.docs.forEach((doc) => activeUsers.add(doc.id));

      // If no users with the flag, try a broader search
      if (activeUsers.size === 0) {
        // Fallback: get users with any CEO coaching activity
        const allUsersSnapshot = await usersRef.limit(100).get();

        for (const userDoc of allUsersSnapshot.docs) {
          // Check if they have any CEO coaching subcollections
          const energyCol = await userDoc.ref.collection('ceo_energy').limit(1).get();
          if (!energyCol.empty) {
            activeUsers.add(userDoc.id);
          }
        }
      }

      return Array.from(activeUsers);
    };

    // Get user's phone number from profile
    const getUserPhone = async (userId: string): Promise<string | null> => {
      const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return null;

      const userDoc = await db.collection('bogle_users').doc(userId).get();
      if (!userDoc.exists) return null;

      const data = userDoc.data();
      return data?.phoneNumber || data?.phone || null;
    };

    // Get user's name
    const getUserName = async (userId: string): Promise<string | undefined> => {
      const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return undefined;

      const userDoc = await db.collection('bogle_users').doc(userId).get();
      if (!userDoc.exists) return undefined;

      const data = userDoc.data();
      return data?.preferredName || data?.name || data?.firstName;
    };

    // Run the batch processing
    const stats = await processCEOTriggersBatch(getUserIds, getUserPhone, getUserName);

    log.info(stats, 'Daily CEO trigger analysis job completed');

    return { success: true, stats };
  } catch (error) {
    log.error({ error: String(error) }, 'Daily CEO trigger analysis job failed');
    return {
      success: false,
      stats: { processed: 0, triggered: 0, errors: 1 },
      error: String(error),
    };
  }
}

// ============================================================================
// WEEKLY DIGEST JOB
// ============================================================================

/**
 * Generate and send weekly digests for all CEO coaching users.
 * Called by Cloud Scheduler on Sunday at 8 AM.
 *
 * @returns Job results with stats
 */
export async function runWeeklyDigestJob(): Promise<{
  success: boolean;
  stats: { processed: number; sent: number; errors: number };
  error?: string;
}> {
  log.info('Starting weekly digest job');

  const stats = { processed: 0, sent: 0, errors: 0 };

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      return { success: false, stats, error: 'Firestore not available' };
    }

    // Get users with CEO coaching activity
    const usersSnapshot = await db
      .collection('bogle_users')
      .where('ceoCoachingActive', '==', true)
      .limit(1000)
      .get();

    for (const userDoc of usersSnapshot.docs) {
      try {
        stats.processed++;
        const userId = userDoc.id;
        const userData = userDoc.data();

        // Generate digest
        const digest = await generateWeeklyDigest(userId);

        // Get user's email
        const email = userData?.email;
        if (!email) {
          log.debug({ userId }, 'No email for user, skipping digest');
          continue;
        }

        // Check if user has opted into weekly digests
        const preferences = userData?.ceoCoachingPreferences;
        if (preferences?.weeklyDigest === false) {
          log.debug({ userId }, 'User opted out of weekly digests');
          continue;
        }

        // Render email
        const htmlEmail = renderDigestEmail(digest);
        const textEmail = renderDigestText(digest);

        // Send email (using existing email service)
        try {
          await sendEmail(
            email,
            `Your Weekly Reflection (${digest.weekStart} - ${digest.weekEnd})`,
            htmlEmail,
            true // isHtml
          );

          stats.sent++;
          log.debug({ userId, email }, 'Weekly digest sent');
        } catch (emailError) {
          log.warn({ error: String(emailError), userId }, 'Failed to send digest email');
          stats.errors++;
        }
      } catch (userError) {
        log.error({ error: String(userError) }, 'Error processing user for digest');
        stats.errors++;
      }
    }

    log.info(stats, 'Weekly digest job completed');

    return { success: true, stats };
  } catch (error) {
    log.error({ error: String(error) }, 'Weekly digest job failed');
    return { success: false, stats, error: String(error) };
  }
}

// ============================================================================
// API HANDLERS (for Cloud Scheduler HTTP triggers)
// ============================================================================

/**
 * Handle the daily trigger analysis HTTP request from Cloud Scheduler.
 */
export async function handleDailyTriggerAnalysisRequest(
  _req: unknown,
  res: { status: (code: number) => { json: (data: unknown) => void } }
): Promise<void> {
  const result = await runDailyTriggerAnalysis();

  if (result.success) {
    res.status(200).json({
      message: 'Daily trigger analysis completed',
      ...result,
    });
  } else {
    res.status(500).json({
      message: 'Daily trigger analysis failed',
      ...result,
    });
  }
}

/**
 * Handle the weekly digest HTTP request from Cloud Scheduler.
 */
export async function handleWeeklyDigestRequest(
  _req: unknown,
  res: { status: (code: number) => { json: (data: unknown) => void } }
): Promise<void> {
  const result = await runWeeklyDigestJob();

  if (result.success) {
    res.status(200).json({
      message: 'Weekly digest completed',
      ...result,
    });
  } else {
    res.status(500).json({
      message: 'Weekly digest failed',
      ...result,
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runDailyTriggerAnalysis,
  runWeeklyDigestJob,
  handleDailyTriggerAnalysisRequest,
  handleWeeklyDigestRequest,
};
