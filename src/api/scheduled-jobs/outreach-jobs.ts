/**
 * Outreach Job Handlers
 *
 * Handles: daily-outreach, evaluate-thinking-of-you, run-predictive-analysis,
 * rollup-outreach-analytics, reset-weekly-counters, family-checkin-calls
 *
 * @module api/scheduled-jobs/outreach-jobs
 */

import type { ServerResponse } from 'http';
import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'OutreachJobs' });

export async function handleDailyOutreach(res: ServerResponse): Promise<void> {
  try {
    log.info('Running daily outreach job (Cloud Scheduler)');

    const { runDailyOutreachJob } = await import('../../services/outreach/daily-outreach-job.js');
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');

    const getUserProfiles = async (): Promise<UserProfile[]> => {
      const db = getFirestoreDb();
      if (!db) return [];
      const snapshot = await db.collection('bogle_users').limit(1000).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserProfile);
    };

    const result = await runDailyOutreachJob({
      getUserProfiles,
      dryRun: false,
      maxUsersPerRun: 1000,
      delayBetweenUsersMs: 100,
    });

    sendJson(res, 200, {
      success: true,
      job: 'daily-outreach',
      stats: {
        usersEvaluated: result.usersEvaluated,
        outreachSent: result.outreachSent,
        byType: result.byType,
        durationMs: result.durationMs,
        errorCount: result.errors.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Daily outreach job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleEvaluateThinkingOfYou(res: ServerResponse): Promise<void> {
  try {
    log.info('Evaluating thinking-of-you outreach (Cloud Scheduler)');

    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    const usersSnap = await db
      .collection('bogle_users')
      .where('preferences.proactiveOutreach', '==', true)
      .limit(500)
      .get();

    let evaluated = 0;
    let triggered = 0;

    const { evaluateLifeRhythmOutreach, triggerLifeRhythmOutreach } =
      await import('../../services/outreach/life-rhythm-outreach.js');

    for (const doc of usersSnap.docs) {
      try {
        evaluated++;
        const result = evaluateLifeRhythmOutreach(doc.id, { enabled: true });

        if (result.triggered && result.prediction) {
          await triggerLifeRhythmOutreach(doc.id, result.prediction);
          triggered++;
        }
      } catch (err) {
        log.warn({ userId: doc.id, error: String(err) }, 'Failed to evaluate user');
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'evaluate-thinking-of-you',
      stats: { evaluated, triggered },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Thinking-of-you evaluation failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleRunPredictiveAnalysis(res: ServerResponse): Promise<void> {
  try {
    log.info('Running predictive analysis (Cloud Scheduler)');

    const { runPredictiveAnalysis } = await import('../../services/predictive-insights/index.js');

    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersSnap = await db
      .collection('bogle_users')
      .where('lastActiveAt', '>=', sevenDaysAgo)
      .limit(200)
      .get();

    let analyzed = 0;
    let insightsGenerated = 0;

    for (const doc of usersSnap.docs) {
      try {
        const insights = await runPredictiveAnalysis(doc.id);
        analyzed++;
        insightsGenerated += insights.length;
      } catch (err) {
        log.warn({ userId: doc.id, error: String(err) }, 'Failed to analyze user');
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'run-predictive-analysis',
      stats: { usersAnalyzed: analyzed, insightsGenerated },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Predictive analysis failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleRollupOutreachAnalytics(res: ServerResponse): Promise<void> {
  try {
    log.info('Rolling up outreach analytics (Cloud Scheduler)');

    const { pruneOldAnalyticsData } = await import('../../services/outreach/analytics.js');
    const prunedCount = pruneOldAnalyticsData(90);

    sendJson(res, 200, {
      success: true,
      job: 'rollup-outreach-analytics',
      prunedRecords: prunedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Outreach analytics rollup failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleResetWeeklyCounters(res: ServerResponse): Promise<void> {
  try {
    log.info('Resetting weekly outreach counters (Cloud Scheduler)');

    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    const statesSnap = await db.collectionGroup('outreach_state').get();

    const batch = db.batch();
    let resetCount = 0;

    for (const doc of statesSnap.docs) {
      batch.update(doc.ref, {
        weeklyOutreachCount: 0,
        weekStartedAt: new Date().toISOString(),
      });
      resetCount++;

      if (resetCount % 450 === 0) {
        await batch.commit();
      }
    }

    if (resetCount % 450 !== 0) {
      await batch.commit();
    }

    sendJson(res, 200, {
      success: true,
      job: 'reset-weekly-counters',
      stats: { usersReset: resetCount },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Weekly counter reset failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Family Check-in Calls Job
 *
 * Proactive outbound calling for family members' wellbeing.
 * Triggered by Cloud Scheduler to check for due family check-in
 * schedules and initiate calls.
 */
export async function handleFamilyCheckinCalls(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Starting family check-in calls job (Cloud Scheduler)');

    const { runFamilyCheckinJob } = await import('../../services/family/family-checkin-caller.js');
    const result = await runFamilyCheckinJob();
    const durationMs = Date.now() - startTime;

    log.info({ ...result, durationMs }, 'Family check-in calls job completed');

    sendJson(res, 200, {
      success: true,
      job: 'family-checkin-calls',
      stats: {
        totalDue: result.totalDue,
        callsInitiated: result.callsInitiated,
        callsSucceeded: result.callsSucceeded,
        callsFailed: result.callsFailed,
        callsSkipped: result.callsSkipped,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Family check-in calls job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
