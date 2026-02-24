/**
 * Deep Intelligence & Analysis Job Handlers
 *
 * Handles: run-deep-analysis (legacy), flush-ml-state,
 * semantic-router-learning, deep-analysis (Gemini-powered)
 *
 * @module api/scheduled-jobs/intelligence-jobs
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'IntelligenceJobs' });

export async function handleRunDeepAnalysis(res: ServerResponse): Promise<void> {
  try {
    log.info('Running LLM deep analysis (Cloud Scheduler)');

    const { runDeepAnalysis, getLatestDeepAnalysis } =
      await import('../../intelligence/predictive/llm-deep-analysis.js');

    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersSnap = await db
      .collection('bogle_users')
      .where('lastActiveAt', '>=', sevenDaysAgo)
      .limit(50)
      .get();

    let processed = 0;
    let skipped = 0;
    let totalTokens = 0;

    for (const doc of usersSnap.docs) {
      try {
        const userId = doc.id;

        const existingAnalysis = await getLatestDeepAnalysis(userId);
        if (existingAnalysis) {
          const analysisAge = Date.now() - existingAnalysis.timestamp.getTime();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

          if (analysisAge < sevenDaysMs) {
            skipped++;
            continue;
          }
        }

        const summariesSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('conversation_summaries')
          .orderBy('timestamp', 'desc')
          .limit(10)
          .get();

        if (summariesSnap.docs.length < 3) {
          skipped++;
          continue;
        }

        const conversationSummaries = summariesSnap.docs.map((d) => {
          const data = d.data();
          return {
            sessionId: d.id,
            date: data.timestamp?.toDate?.() || new Date(),
            topics: data.topics || [],
            emotionalArc: data.emotionalArc || 'neutral',
            keyMoments: data.keyMoments || [],
            unresolvedThreads: data.unresolvedThreads || [],
          };
        });

        const result = await runDeepAnalysis({
          userId,
          conversationSummaries,
          statisticalPatterns: [],
          userProfile: {
            name: doc.data().displayName,
            relationshipStage: doc.data().relationshipStage || 'acquaintance',
            knownConcerns: doc.data().knownConcerns || [],
            knownGoals: doc.data().knownGoals || [],
            communicationStyle: doc.data().communicationStyle || 'balanced',
          },
          analysisGoals: [
            'identify_unspoken_concerns',
            'predict_upcoming_challenge',
            'find_breakthrough_opportunity',
          ],
        });

        processed++;
        totalTokens += result.tokenUsage.input + result.tokenUsage.output;
      } catch (err) {
        log.warn({ userId: doc.id, error: String(err) }, 'Deep analysis failed for user');
        skipped++;
      }
    }

    sendJson(res, 200, {
      success: true,
      job: 'run-deep-analysis',
      stats: {
        processed,
        skipped,
        totalTokens,
        estimatedCost: `$${((totalTokens / 1000000) * 0.15).toFixed(4)}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Deep analysis job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleFlushMLState(res: ServerResponse): Promise<void> {
  try {
    log.info('Flushing ML model state to Firestore (Cloud Scheduler)');

    const { flushDirtyUsers } = await import('../../intelligence/predictive/persistence.js');
    const { getMarkovDataForPersistence } =
      await import('../../intelligence/predictive/markov-sequence-predictor.js');
    const { getTimeSeriesDataForPersistence } =
      await import('../../intelligence/predictive/time-series-forecaster.js');
    const { getReinforcementDataForPersistence } =
      await import('../../intelligence/predictive/reinforcement-learner.js');

    const result = await flushDirtyUsers(
      getMarkovDataForPersistence,
      getTimeSeriesDataForPersistence,
      getReinforcementDataForPersistence
    );

    sendJson(res, 200, {
      success: true,
      job: 'flush-ml-state',
      stats: {
        usersFlushed: result.flushed,
        errors: result.errors,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'ML state flush failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleSemanticRouterLearning(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running semantic router learning job (Cloud Scheduler)');

    const { runBatchLearning, getFeedbackStats } =
      await import('../../tools/semantic-router/advanced/learning-loop.js');

    const result = await runBatchLearning();
    const stats = getFeedbackStats();
    const durationMs = Date.now() - startTime;

    log.info(
      {
        calibrationUpdated: result.calibrationUpdated,
        patternsConsolidated: result.patternsConsolidated,
        vocabularyPruned: result.vocabularyPruned,
        feedbackStats: stats,
        durationMs,
      },
      'Semantic router learning completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'semantic-router-learning',
      stats: {
        calibrationUpdated: result.calibrationUpdated,
        patternsConsolidated: result.patternsConsolidated,
        vocabularyPruned: result.vocabularyPruned,
        totalFeedback: stats.totalFeedback,
        correctionRate: `${(stats.correctionRate * 100).toFixed(1)}%`,
        successRate: `${(stats.successRate * 100).toFixed(1)}%`,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Semantic router learning failed');
    sendJson(res, 500, {
      success: false,
      job: 'semantic-router-learning',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * LLM Deep Analysis Job Handler (Gemini-powered)
 *
 * TIER 3 intelligence - batch mode during off-peak hours.
 * "Better Than Human" - sees patterns humans can't because we
 * remember EVERYTHING and connect dots across months.
 */
export async function handleDeepAnalysis(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running LLM deep analysis job (Cloud Scheduler)');

    const { runDeepAnalysisJob } = await import('../../tasks/scheduled/deep-analysis-job.js');

    const result = await runDeepAnalysisJob({
      dryRun: false,
    });

    const durationMs = Date.now() - startTime;

    log.info(
      {
        usersProcessed: result.usersProcessed,
        insightsGenerated: result.insightsGenerated,
        hypothesesGenerated: result.hypothesesGenerated,
        errors: result.errors,
        durationMs,
      },
      'LLM deep analysis completed'
    );

    sendJson(res, 200, {
      success: true,
      job: 'deep-analysis',
      stats: {
        usersProcessed: result.usersProcessed,
        usersSkipped: result.usersSkipped,
        insightsGenerated: result.insightsGenerated,
        hypothesesGenerated: result.hypothesesGenerated,
        errors: result.errors,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'LLM deep analysis job failed');
    sendJson(res, 500, {
      success: false,
      job: 'deep-analysis',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
