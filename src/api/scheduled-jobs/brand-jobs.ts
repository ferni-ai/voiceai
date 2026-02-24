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
import type {
  BrandAward,
  BrandWorkstream,
  BrandMilestone,
  BrandAmbassador,
  UserStory,
  UserStoryDoc,
} from './types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson, sendSlackMessage } from './helpers.js';

const log = createLogger({ module: 'BrandJobs' });

export async function handleBrandAwardDeadlineCheck(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand award deadline check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

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
        const { postMilestoneCelebration } = await import('../../services/social/social-service.js');
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

export async function handleBrandAmbassadorEngagement(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand ambassador engagement check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let ambassadors: BrandAmbassador[] = [];
    if (db) {
      const snapshot = await db.collection('brand_ambassadors').get();
      ambassadors = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandAmbassador);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const inactiveAmbassadors = ambassadors.filter((a) => {
      if (!a.lastActivityAt) return true;
      const lastActive = new Date(a.lastActivityAt);
      return lastActive < thirtyDaysAgo;
    });

    const activeAmbassadors = ambassadors.filter((a) => {
      if (!a.lastActivityAt) return false;
      const lastActive = new Date(a.lastActivityAt);
      return lastActive >= thirtyDaysAgo;
    });

    let message = `*Ambassador Engagement Report*\n\n`;
    message += `• Total Ambassadors: ${ambassadors.length}\n`;
    message += `• Active (last 30d): ${activeAmbassadors.length}\n`;
    message += `• Inactive: ${inactiveAmbassadors.length}\n`;

    if (inactiveAmbassadors.length > 0) {
      message += `\n*Consider re-engagement outreach for:*\n`;
      for (const amb of inactiveAmbassadors.slice(0, 5)) {
        message += `  • ${amb.name}${amb.email ? ` (${amb.email})` : ''}\n`;
      }
    }

    const alertSent = await sendSlackMessage(message, ':star:');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-ambassador-engagement',
      stats: {
        totalAmbassadors: ambassadors.length,
        activeCount: activeAmbassadors.length,
        inactiveCount: inactiveAmbassadors.length,
        alertSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand ambassador engagement check failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleBrandMetricsCollection(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand metrics collection (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      sendJson(res, 200, {
        success: true,
        job: 'brand-metrics-collection',
        message: 'Firestore not available - metrics collection skipped',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const [awardsSnap, workstreamsSnap, storiesSnap, ambassadorsSnap] = await Promise.all([
      db.collection('brand_awards').get(),
      db.collection('brand_workstreams').get(),
      db.collection('brand_user_stories').get(),
      db.collection('brand_ambassadors').get(),
    ]);

    const awards = awardsSnap.docs.map((doc) => doc.data() as BrandAward);
    const workstreams = workstreamsSnap.docs.map((doc) => doc.data() as BrandWorkstream);
    const stories = storiesSnap.docs.map((doc) => doc.data() as UserStory);

    const metrics = {
      timestamp: new Date().toISOString(),
      awards: {
        tracked: awards.length,
        submitted: awards.filter((a) => a.status === 'submitted').length,
        shortlisted: awards.filter((a) => a.status === 'shortlisted').length,
        won: awards.filter((a) => a.status === 'won').length,
      },
      community: {
        storiesCollected: stories.length,
        storiesApproved: stories.filter((s) => s.approved).length,
        ambassadorsTotal: ambassadorsSnap.size,
      },
      workstreams: {
        total: workstreams.length,
        notStarted: workstreams.filter((w) => w.status === 'not_started').length,
        inProgress: workstreams.filter((w) => w.status === 'in_progress').length,
        completed: workstreams.filter((w) => w.status === 'completed').length,
      },
    };

    await db.collection('brand_metrics').add(metrics);
    log.info('Brand metrics persisted to Firestore');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-metrics-collection',
      metrics,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand metrics collection failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleBrandWeeklyReport(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand weekly report (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let awards: BrandAward[] = [];
    let workstreams: BrandWorkstream[] = [];
    let stories: UserStory[] = [];
    let ambassadorsCount = 0;

    if (db) {
      const [awardsSnap, workstreamsSnap, storiesSnap, ambassadorsSnap] = await Promise.all([
        db.collection('brand_awards').get(),
        db.collection('brand_workstreams').get(),
        db.collection('brand_user_stories').get(),
        db.collection('brand_ambassadors').get(),
      ]);

      awards = awardsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BrandAward);
      workstreams = workstreamsSnap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as BrandWorkstream
      );
      stories = storiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserStory);
      ambassadorsCount = ambassadorsSnap.size;
    }

    const now = new Date();

    let report = `*Brand Evolution Weekly Report*\n`;
    report += `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n\n`;

    report += `*Awards*\n`;
    report += `• Tracked: ${awards.length}\n`;
    report += `• Submitted: ${awards.filter((a) => a.status === 'submitted').length}\n`;
    report += `• Won: ${awards.filter((a) => a.status === 'won').length}\n`;

    const upcomingAwards = awards.filter((a) => {
      if (!a.deadline) return false;
      const deadline = new Date(a.deadline);
      return deadline >= now && deadline <= new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    });
    if (upcomingAwards.length > 0) {
      report += `• Upcoming: ${upcomingAwards.map((a) => a.name).join(', ')}\n`;
    }

    report += `\n*Community*\n`;
    report += `• Stories: ${stories.filter((s) => s.approved).length} approved\n`;
    report += `• Ambassadors: ${ambassadorsCount} total\n`;

    report += `\n*Workstreams*\n`;
    report += `• Total: ${workstreams.length}\n`;
    report += `• In Progress: ${workstreams.filter((w) => w.status === 'in_progress').length}\n`;
    report += `• Completed: ${workstreams.filter((w) => w.status === 'completed').length}\n`;

    const staleWorkstreams = workstreams.filter((w) => {
      if (w.status !== 'in_progress' || !w.updatedAt) return false;
      const lastUpdate = new Date(w.updatedAt);
      const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 14;
    });
    if (staleWorkstreams.length > 0) {
      report += `• Stale: ${staleWorkstreams.length} (no update in 14+ days)\n`;
    }

    const reportSent = await sendSlackMessage(report, ':seedling:');

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-weekly-report',
      stats: {
        awardsTracked: awards.length,
        storiesCount: stories.length,
        workstreamsCount: workstreams.length,
        ambassadorsCount,
        reportSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand weekly report failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleBrandPublishStories(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand story publishing (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    let stories: UserStoryDoc[] = [];
    if (db) {
      const snapshot = await db.collection('brand_user_stories').get();
      stories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as UserStoryDoc);
    }

    const unpublishedStories = stories.filter((s) => s.approved && !s.publishedToSocial);

    let storiesPublished = 0;
    let socialPostsSent = 0;

    const storiesToPublish = unpublishedStories.slice(0, 3);

    for (const story of storiesToPublish) {
      try {
        const { postUserStory } = await import('../../services/social/social-service.js');

        const quote =
          story.quote || story.story.substring(0, 200) + (story.story.length > 200 ? '...' : '');

        const socialResult = await postUserStory({
          userName: story.userName,
          quote,
        });

        if (socialResult.successCount > 0) {
          storiesPublished++;
          socialPostsSent += socialResult.successCount;

          if (db) {
            await db
              .collection('brand_user_stories')
              .doc(story.id)
              .update({
                publishedToSocial: true,
                publishedAt: new Date().toISOString(),
                socialPlatforms: socialResult.results
                  .filter((r) => r.success)
                  .map((r) => r.platform),
              });
          }

          log.info('Story published to social', {
            storyId: story.id,
            userName: story.userName,
            platforms: socialResult.results.map((r) => r.platform),
            success: socialResult.successCount,
          });
        }
      } catch (storyError) {
        log.warn('Failed to publish story to social', {
          storyId: story.id,
          error: String(storyError),
        });
      }
    }

    if (storiesPublished > 0) {
      await sendSlackMessage(
        `Published ${storiesPublished} user stories to social media (${socialPostsSent} total posts)`,
        ':mega:'
      );
    }

    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      success: true,
      job: 'brand-publish-stories',
      stats: {
        totalStories: stories.length,
        approvedUnpublished: unpublishedStories.length,
        storiesPublished,
        socialPostsSent,
      },
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error({ error: String(error), durationMs }, 'Brand story publishing failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
