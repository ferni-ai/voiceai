/**
 * Brand Automation Job Handlers (ambassadors, metrics, reports, publishing)
 *
 * Handles: brand-ambassador-engagement, brand-metrics-collection,
 * brand-weekly-report, brand-publish-stories
 *
 * Extracted from brand-jobs.ts (which re-exports these handlers).
 */

import type { ServerResponse } from 'http';
import type {
  BrandAward,
  BrandWorkstream,
  BrandAmbassador,
  UserStory,
  UserStoryDoc,
} from './types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson, sendSlackMessage } from './helpers.js';
import { sendFirestoreUnavailable } from './brand-job-helpers.js';

const log = createLogger({ module: 'BrandJobs' });

export async function handleBrandAmbassadorEngagement(res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    log.info('Running brand ambassador engagement check (Cloud Scheduler)');

    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      sendFirestoreUnavailable(res, 'brand-ambassador-engagement');
      return;
    }

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
      sendFirestoreUnavailable(res, 'brand-metrics-collection');
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
    if (!db) {
      sendFirestoreUnavailable(res, 'brand-weekly-report');
      return;
    }

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
    if (!db) {
      sendFirestoreUnavailable(res, 'brand-publish-stories');
      return;
    }

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
