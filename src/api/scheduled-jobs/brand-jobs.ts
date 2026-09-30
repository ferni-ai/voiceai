/**
 * Brand Automation Job Handlers
 *
 * Handles: brand-award-deadline-check, brand-story-review-reminder,
 * brand-workstream-progress, brand-milestone-check,
 * brand-ambassador-engagement, brand-metrics-collection,
 * brand-weekly-report, brand-publish-stories
 *
 * Brand automation jobs use Firestore for data storage on the server.
 * The CLI commands (ferni brand *) use local JSON files (~/.ferni/*.json).
 *
 * @module api/scheduled-jobs/brand-jobs
 */

import type { ServerResponse } from 'http';
import type { BrandAward, BrandWorkstream, BrandMilestone, UserStory } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson, sendSlackMessage } from './helpers.js';
import { sendFirestoreUnavailable } from './brand-job-helpers.js';

// Re-exports: moved to brand-report-jobs.ts, kept here for backward-compatible imports
export {
  handleBrandAmbassadorEngagement,
  handleBrandMetricsCollection,
  handleBrandWeeklyReport,
  handleBrandPublishStories,
} from './brand-report-jobs.js';

const log = createLogger({ module: 'BrandJobs' });

export async function handleBrandAwardDeadlineCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand award deadline check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      sendFirestoreUnavailable(res, 'brand-award-deadline-check');
      return;
    }

    let awards: BrandAward[] = [];
    if (db) {
      const snapshot = await db.collection('brand_awards').get();
      awards = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandAward);
    }

    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const upcomingAwards = awards.filter((award) => {
      if (!award.deadline || award.status === 'submitted' || award.status === 'won') {
        return false;
      }
      const deadline = new Date(award.deadline);
      return deadline <= fourteenDaysFromNow && deadline >= now;
    });

    let alertsSent = 0;
    for (const award of upcomingAwards) {
      const deadline = new Date(award.deadline);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const emoji = daysUntil <= 3 ? '🚨' : daysUntil <= 7 ? '⚠️' : '⏰';
      const message = `${emoji} *${award.name}* deadline in *${daysUntil} days* (${award.deadline})\nStatus: ${award.status || 'researching'}\nFee: ${award.fee || 'TBD'}`;

      if (await sendSlackMessage(message, ':trophy:')) {
        alertsSent++;
      }
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-award-deadline-check',
      stats: { totalAwards: awards.length, upcomingDeadlines: upcomingAwards.length, alertsSent },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand award deadline check failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleBrandStoryReviewReminder(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand story review reminder (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      sendFirestoreUnavailable(res, 'brand-story-review-reminder');
      return;
    }

    let stories: UserStory[] = [];
    if (db) {
      const snapshot = await db.collection('brand_user_stories').get();
      stories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserStory);
    }

    const pendingStories = stories.filter((story) => !story.approved);

    let alertSent = false;
    if (pendingStories.length > 0) {
      const message = `*${pendingStories.length} stories* pending review\n\nRun \`ferni community stories\` to review.`;
      alertSent = await sendSlackMessage(message, ':book:');
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-story-review-reminder',
      stats: { totalStories: stories.length, pendingReview: pendingStories.length, alertSent },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand story review reminder failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleBrandWorkstreamProgress(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand workstream progress report (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      sendFirestoreUnavailable(res, 'brand-workstream-progress');
      return;
    }

    let workstreams: BrandWorkstream[] = [];
    if (db) {
      const snapshot = await db.collection('brand_workstreams').get();
      workstreams = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandWorkstream);
    }

    const stats = {
      total: workstreams.length,
      notStarted: workstreams.filter((w) => w.status === 'not_started').length,
      inProgress: workstreams.filter((w) => w.status === 'in_progress').length,
      completed: workstreams.filter((w) => w.status === 'completed').length,
    };

    const now = new Date();
    const staleWorkstreams = workstreams.filter((w) => {
      if (w.status !== 'in_progress' || !w.updatedAt) return false;
      const lastUpdate = new Date(w.updatedAt);
      const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 14;
    });

    let message = `*Weekly Workstream Progress*\n\n`;
    message += `• Total: ${stats.total}\n`;
    message += `• Not Started: ${stats.notStarted}\n`;
    message += `• In Progress: ${stats.inProgress}\n`;
    message += `• Completed: ${stats.completed}\n`;

    if (staleWorkstreams.length > 0) {
      message += `\n*${staleWorkstreams.length} workstreams stale* (no update in 14+ days):\n`;
      for (const ws of staleWorkstreams.slice(0, 5)) {
        message += `  • ${ws.name}\n`;
      }
    }

    const alertSent = await sendSlackMessage(message, ':bar_chart:');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-workstream-progress',
      stats: { ...stats, staleCount: staleWorkstreams.length, alertSent },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand workstream progress report failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleBrandMilestoneCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand milestone check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      sendFirestoreUnavailable(res, 'brand-milestone-check');
      return;
    }

    let milestones: BrandMilestone[] = [];
    if (db) {
      const snapshot = await db.collection('brand_milestones').get();
      milestones = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandMilestone);
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const todayMilestones = milestones.filter((m) => {
      const milestoneDate = new Date(m.date).toISOString().split('T')[0];
      return milestoneDate === todayStr && !m.celebrated;
    });

    let celebrationsSent = 0;
    let socialPostsSent = 0;
    for (const milestone of todayMilestones) {
      const message = `*Today's Milestone: ${milestone.name}*\n\n${milestone.description || 'Time to celebrate!'}`;
      if (await sendSlackMessage(message, ':tada:')) {
        celebrationsSent++;
      }

      try {
        const { postMilestoneCelebration } =
          await import('../../services/social/social-service.js');
        const socialResult = await postMilestoneCelebration({
          name: milestone.name,
          description: milestone.description,
          date: milestone.date,
        });
        socialPostsSent += socialResult.successCount;
        log.info('Milestone posted to social', {
          milestone: milestone.name,
          platforms: socialResult.results.map((r) => r.platform),
          success: socialResult.successCount,
        });
      } catch (socialError) {
        log.warn('Social posting failed for milestone', { error: String(socialError) });
      }

      if (db) {
        await db.collection('brand_milestones').doc(milestone.id).update({ celebrated: true });
      }
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-milestone-check',
      stats: {
        totalMilestones: milestones.length,
        todayMilestones: todayMilestones.length,
        celebrationsSent,
        socialPostsSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand milestone check failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
