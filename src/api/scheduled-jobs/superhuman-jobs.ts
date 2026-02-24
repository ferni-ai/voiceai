/**
 * Superhuman Outreach & Insight Action Job Handlers
 *
 * Handles: better-than-human-outreach, process-insight-actions
 *
 * These are the core "Better Than Human" scheduled capabilities:
 * proactive care and autonomous insight-to-action processing.
 *
 * @module api/scheduled-jobs/superhuman-jobs
 */

import type { ServerResponse } from 'http';
import type { SuperhumanInsight } from '../../services/automation/insight-action-bridge.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'SuperhumanJobs' });

/**
 * Consolidated Better Than Human outreach job.
 * Runs all proactive outreach systems in one go:
 * - Thinking of you moments
 * - Commitment follow-ups
 * - Growth reflections
 * - Life rhythm predictions
 * - Celebration deliveries
 */
export async function handleBetterThanHumanOutreach(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  const stats = {
    usersProcessed: 0,
    thinkingOfYouSent: 0,
    commitmentFollowUpsSent: 0,
    growthReflectionsSent: 0,
    celebrationsSent: 0,
    errors: 0,
  };

  try {
    log.info('Starting BETTER THAN HUMAN outreach job');

    // 1. Run the thinking-of-you job
    const { runThinkingOfYouOutreach } = await import('../../tasks/scheduled/wellbeing-jobs.js');
    const toyResult = await runThinkingOfYouOutreach();
    stats.usersProcessed += toyResult.usersProcessed;
    stats.thinkingOfYouSent += toyResult.outreachSent;
    stats.errors += toyResult.errors;

    // 2. Run commitment follow-ups
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (db) {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const commitmentsSnap = await db
        .collectionGroup('commitments')
        .where('status', '==', 'active')
        .where('dueDate', '<=', tomorrow.toISOString())
        .limit(100)
        .get();

      for (const doc of commitmentsSnap.docs) {
        try {
          const commitment = doc.data();
          const userId = doc.ref.parent.parent?.id;
          if (!userId) continue;

          const { getOutreachOrchestrator } =
            await import('../../services/outreach/outreach-orchestrator.js');
          const orchestrator = getOutreachOrchestrator();

          const sent = await orchestrator.sendPushNotification(
            userId,
            `Hey! Just thinking about your commitment: "${commitment.description}". How's it going?`,
            {
              trigger: 'commitment_followup',
              personaId: 'ferni',
              metadata: { commitmentId: doc.id },
            }
          );

          if (sent) {
            stats.commitmentFollowUpsSent++;
          }
        } catch (err) {
          stats.errors++;
          log.warn({ error: String(err), docId: doc.id }, 'Failed to process commitment follow-up');
        }
      }

      // 3. Growth reflections (for users who haven't had one in 7+ days)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const usersForGrowth = await db
        .collection('bogle_users')
        .where('lastGrowthReflection', '<', sevenDaysAgo.toISOString())
        .limit(50)
        .get();

      for (const userDoc of usersForGrowth.docs) {
        try {
          const userId = userDoc.id;

          const { getOutreachOrchestrator } =
            await import('../../services/outreach/outreach-orchestrator.js');
          const orchestrator = getOutreachOrchestrator();
          const sent = await orchestrator.triggerGrowthReflection(userId, 'ferni');

          if (sent) {
            stats.growthReflectionsSent++;
            await userDoc.ref.update({
              lastGrowthReflection: now.toISOString(),
            });
          }
        } catch (err) {
          stats.errors++;
          log.warn(
            { error: String(err), userId: userDoc.id },
            'Failed to trigger growth reflection'
          );
        }
      }

      // 4. Celebrations (recent milestones/achievements not yet celebrated)
      const { getMilestonesToCelebrate, acknowledgeMilestone } =
        await import('../../services/superhuman/proactive-milestone-detector.js');

      const recentUsers = await db
        .collection('bogle_users')
        .where('lastActiveAt', '>=', sevenDaysAgo.toISOString())
        .limit(200)
        .get();

      for (const userDoc of recentUsers.docs) {
        try {
          const milestones = await getMilestonesToCelebrate(userDoc.id);

          for (const milestone of milestones.slice(0, 1)) {
            const { getOutreachOrchestrator } =
              await import('../../services/outreach/outreach-orchestrator.js');
            const orchestrator = getOutreachOrchestrator();

            const sent = await orchestrator.sendPushNotification(
              userDoc.id,
              `${milestone.label}! ${milestone.celebrationSuggestion}`,
              {
                trigger: 'celebration',
                personaId: 'ferni',
                metadata: { milestoneType: milestone.type, significance: milestone.significance },
              }
            );

            if (sent) {
              stats.celebrationsSent++;
              await acknowledgeMilestone(userDoc.id, milestone.label, now.toISOString());
            }
          }
        } catch {
          log.debug({ userId: userDoc.id }, 'No milestones to celebrate');
        }
      }
    }

    const durationMs = Date.now() - startTime;

    log.info({ ...stats, durationMs }, 'Better Than Human outreach job completed');

    sendJson(res, 200, {
      success: true,
      job: 'better-than-human-outreach',
      stats,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Better Than Human outreach job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      partialStats: stats,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Process superhuman insights and trigger automated actions.
 * Bridges the insight-action system for AGI-like autonomous behavior.
 */
export async function handleProcessInsightActions(res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  const stats = {
    insightsGathered: 0,
    rulesEvaluated: 0,
    actionsExecuted: 0,
    actionsSkipped: 0,
    errors: 0,
  };

  try {
    log.info('Starting insight action processor (Cloud Scheduler)');

    const { processInsights, INSIGHT_ACTION_RULES } =
      await import('../../services/automation/insight-action-bridge.js');
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      throw new Error('Firestore not available');
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersSnap = await db
      .collection('bogle_users')
      .where('lastActiveAt', '>=', sevenDaysAgo.toISOString())
      .limit(500)
      .get();

    const insights: SuperhumanInsight[] = [];

    for (const userDoc of usersSnap.docs) {
      try {
        const userId = userDoc.id;

        // Check capacity guardian for burnout risk
        const capacitySnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('capacity')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (!capacitySnap.empty) {
          const capacity = capacitySnap.docs[0].data();
          if (capacity.level && capacity.level <= 4) {
            insights.push({
              id: `capacity_${userId}_${Date.now()}`,
              userId,
              capability: 'capacity_guardian',
              timestamp: new Date().toISOString(),
              data: { burnoutRisk: 1 - capacity.level / 10 },
            });
          }
        }

        // Check commitments for overdue items
        const commitmentsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('commitments')
          .where('status', '==', 'active')
          .where('dueDate', '<', new Date().toISOString())
          .limit(5)
          .get();

        if (!commitmentsSnap.empty) {
          insights.push({
            id: `commitment_${userId}_${Date.now()}`,
            userId,
            capability: 'commitment_keeper',
            timestamp: new Date().toISOString(),
            data: {
              commitmentOverdue: true,
              overdueCommitments: commitmentsSnap.docs.map((d) => d.data().description),
            },
          });
        }

        // Check relationship network for drift
        const relationshipsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('relationships')
          .orderBy('lastMentioned', 'asc')
          .limit(5)
          .get();

        for (const relDoc of relationshipsSnap.docs) {
          const rel = relDoc.data();
          const lastMentioned = new Date(rel.lastMentioned);
          const daysSince = (Date.now() - lastMentioned.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSince > 30 && (rel.importance === 'high' || rel.relationship === 'family')) {
            insights.push({
              id: `relationship_${userId}_${relDoc.id}_${Date.now()}`,
              userId,
              capability: 'relationship_network',
              timestamp: new Date().toISOString(),
              data: {
                driftScore: Math.min(daysSince / 60, 1),
                relationshipImportance: rel.importance === 'high' ? 0.9 : 0.7,
                relationshipName: rel.name,
              },
            });
          }
        }

        // Check dreams for dormant items
        const dreamsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('dreams')
          .where('dormant', '==', false)
          .limit(5)
          .get();

        for (const dreamDoc of dreamsSnap.docs) {
          const dream = dreamDoc.data();
          const lastMentionedDate = new Date(dream.lastMentioned || dream.createdAt);
          const daysSince = (Date.now() - lastMentionedDate.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSince > 30) {
            insights.push({
              id: `dream_${userId}_${dreamDoc.id}_${Date.now()}`,
              userId,
              capability: 'dream_keeper',
              timestamp: new Date().toISOString(),
              data: {
                dormantDays: daysSince,
                dreamImportance: dream.importance || 0.5,
                dreamDescription: dream.dream,
              },
            });
          }
        }

        stats.insightsGathered += insights.length;
      } catch (err) {
        stats.errors++;
        log.warn({ userId: userDoc.id, error: String(err) }, 'Failed to gather insights for user');
      }
    }

    const executions = await processInsights(insights);

    stats.rulesEvaluated = insights.length * INSIGHT_ACTION_RULES.length;
    stats.actionsExecuted = executions.filter((e) => e.status === 'completed').length;
    stats.actionsSkipped = executions.filter((e) => e.status !== 'completed').length;

    const durationMs = Date.now() - startTime;

    log.info({ ...stats, durationMs }, 'Insight action processor completed');

    sendJson(res, 200, {
      success: true,
      job: 'process-insight-actions',
      stats,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Insight action processor failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      partialStats: stats,
      timestamp: new Date().toISOString(),
    });
  }
}
