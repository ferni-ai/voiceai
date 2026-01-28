/**
 * LLM Deep Analysis Scheduled Job
 *
 * Runs Gemini-powered deep analysis on user conversation history:
 * - Cross-conversation pattern detection
 * - Hypothesis generation for proactive coaching
 * - Long-term behavioral arc understanding
 *
 * This is TIER 3 intelligence - designed to run in batch mode
 * during off-peak hours (not real-time).
 *
 * "Better Than Human" - We see patterns humans can't see
 * because we remember EVERYTHING and can connect dots across months.
 */

import { toSafeDate } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { ScheduledJob, type BaseJobConfig, type JobContext, type BaseJobResult } from './base-job.js';
import {
  runDeepAnalysis,
  getLatestDeepAnalysis,
  type DeepAnalysisInput,
  type DeepAnalysisResult,
} from '../../intelligence/predictive/llm-deep-analysis.js';
import {
  getAllPredictions,
  type FusedPrediction,
  type PredictionTarget,
} from '../../intelligence/predictive/index.js';

const log = createLogger({ module: 'DeepAnalysisJob' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface DeepAnalysisJobConfig extends BaseJobConfig {
  /** Maximum users to process per run */
  maxUsers: number;
  /** Minimum conversations since last analysis */
  minConversationsSinceLastAnalysis: number;
  /** Days between analyses for the same user */
  minDaysBetweenAnalyses: number;
}

// ============================================================================
// JOB RESULT TYPE
// ============================================================================

interface DeepAnalysisJobResult extends Record<string, unknown> {
  usersProcessed: number;
  usersSkipped: number;
  insightsGenerated: number;
  hypothesesGenerated: number;
  errors: number;
}

// ============================================================================
// USER DISCOVERY
// ============================================================================

/**
 * Get users eligible for deep analysis
 */
async function getEligibleUsers(
  config: DeepAnalysisJobConfig
): Promise<Array<{ userId: string; conversationCount: number }>> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const eligible: Array<{ userId: string; conversationCount: number }> = [];

    // Query users who have had recent activity but haven't been analyzed recently
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.minDaysBetweenAnalyses);

    const usersSnapshot = await db
      .collection('bogle_users')
      .where('sessionCount', '>=', config.minConversationsSinceLastAnalysis)
      .limit(config.maxUsers * 2) // Get more than needed to filter
      .get();

    for (const doc of usersSnapshot.docs) {
      const userId = doc.id;

      // Check if user has been analyzed recently
      const lastAnalysis = await getLatestDeepAnalysis(userId);
      if (lastAnalysis && lastAnalysis.timestamp) {
        const lastAnalysisDate = lastAnalysis.timestamp instanceof Date
          ? lastAnalysis.timestamp
          : new Date(lastAnalysis.timestamp);
        if (lastAnalysisDate > cutoffDate) {
          continue; // Skip - analyzed too recently
        }
      }

      // Check conversation count since last analysis
      const lastAnalysisDate = lastAnalysis?.timestamp
        ? (lastAnalysis.timestamp instanceof Date
            ? lastAnalysis.timestamp
            : new Date(lastAnalysis.timestamp))
        : new Date(0);

      const recentSessions = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('session_summaries')
        .where('createdAt', '>', lastAnalysisDate)
        .count()
        .get();

      const conversationCount = recentSessions.data().count;

      if (conversationCount >= config.minConversationsSinceLastAnalysis) {
        eligible.push({ userId, conversationCount });
      }

      if (eligible.length >= config.maxUsers) break;
    }

    return eligible;
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not get eligible users for deep analysis');
    return [];
  }
}

/**
 * Build analysis input for a user
 */
async function buildAnalysisInput(userId: string): Promise<DeepAnalysisInput | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Get user profile
    const userDoc = await db.collection('bogle_users').doc(userId).get();
    if (!userDoc.exists) return null;
    const userData = userDoc.data() || {};

    // Get recent conversation summaries
    const summariesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('session_summaries')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const conversationSummaries = summariesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        sessionId: doc.id,
        date: toSafeDate(data.createdAt),
        topics: data.topics || [],
        emotionalArc: data.emotionalArc || 'neutral',
        keyMoments: data.keyMoments || [],
        unresolvedThreads: data.unresolvedThreads || [],
      };
    });

    // Get statistical patterns from ML predictions
    const predictions = await getAllPredictions(userId, {});
    const statisticalPatterns = Array.from(predictions.entries()).map(
      ([target, pred]: [PredictionTarget, FusedPrediction]) => ({
        type: 'fusion' as const,
        description: pred.explanation,
        confidence: pred.confidence,
        rawData: { target, signals: pred.signals },
      })
    );

    return {
      userId,
      conversationSummaries,
      statisticalPatterns,
      userProfile: {
        name: userData.name,
        relationshipStage: userData.relationshipStage || 'building',
        knownConcerns: userData.knownConcerns || [],
        knownGoals: userData.goals || [],
        communicationStyle: userData.communicationStyle || 'conversational',
      },
      analysisGoals: ['identify_unspoken_concerns', 'predict_upcoming_challenge', 'detect_emotional_trajectory'],
    };
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not build analysis input');
    return null;
  }
}

// ============================================================================
// JOB CLASS
// ============================================================================

export class DeepAnalysisJob extends ScheduledJob<DeepAnalysisJobConfig, DeepAnalysisJobResult> {
  readonly name = 'DeepAnalysisJob';

  readonly defaultConfig: DeepAnalysisJobConfig = {
    dryRun: false,
    maxUsers: 100,
    minConversationsSinceLastAnalysis: 3,
    minDaysBetweenAnalyses: 7,
  };

  protected async execute(
    config: DeepAnalysisJobConfig,
    ctx: JobContext
  ): Promise<DeepAnalysisJobResult> {
    const result: DeepAnalysisJobResult = {
      usersProcessed: 0,
      usersSkipped: 0,
      insightsGenerated: 0,
      hypothesesGenerated: 0,
      errors: 0,
    };

    ctx.log.info({ config }, '🧠 Starting LLM deep analysis job');

    // Get eligible users
    const eligibleUsers = await getEligibleUsers(config);
    ctx.log.info({ count: eligibleUsers.length }, '📋 Found eligible users for deep analysis');

    // Process each user
    for (const { userId, conversationCount } of eligibleUsers) {
      ctx.counters.processed++;

      if (config.dryRun) {
        ctx.log.info({ userId, conversationCount }, 'DRY RUN: Would analyze user');
        ctx.counters.skipped++;
        result.usersSkipped++;
        continue;
      }

      try {
        const input = await buildAnalysisInput(userId);
        if (!input) {
          result.usersSkipped++;
          ctx.counters.skipped++;
          continue;
        }

        ctx.log.debug(
          { userId, conversationCount },
          '🔬 Running deep analysis for user'
        );

        const analysisResult: DeepAnalysisResult = await runDeepAnalysis(input);

        result.usersProcessed++;
        result.insightsGenerated += analysisResult.insights.length;
        result.hypothesesGenerated += analysisResult.hypotheses.length;
        ctx.counters.success++;

        ctx.log.debug(
          {
            userId,
            insights: analysisResult.insights.length,
            hypotheses: analysisResult.hypotheses.length,
          },
          '✅ Deep analysis complete for user'
        );
      } catch (error) {
        ctx.log.warn({ userId, error: String(error) }, '❌ Deep analysis failed for user');
        result.errors++;
        ctx.counters.errors++;
      }
    }

    ctx.log.info(
      {
        usersProcessed: result.usersProcessed,
        insightsGenerated: result.insightsGenerated,
        hypothesesGenerated: result.hypothesesGenerated,
        errors: result.errors,
      },
      '🧠 LLM deep analysis job complete'
    );

    return result;
  }
}

// ============================================================================
// STANDALONE RUNNER
// ============================================================================

/**
 * Run deep analysis as standalone function (for API routes)
 */
export async function runDeepAnalysisJob(
  options: Partial<DeepAnalysisJobConfig> = {}
): Promise<BaseJobResult & DeepAnalysisJobResult> {
  const job = new DeepAnalysisJob();
  return job.run(options);
}

// Export for Cloud Scheduler
export default DeepAnalysisJob;
