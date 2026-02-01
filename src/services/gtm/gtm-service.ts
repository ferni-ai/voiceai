/**
 * GTM (Go-To-Market) Orchestration Service
 *
 * The main service that orchestrates content generation,
 * scheduling, and publishing across all platforms.
 *
 * @module services/gtm/gtm-service
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  generateContent,
  generateDailyContent,
  generateMilestoneContent,
} from './content-generator.js';
import {
  generateWeeklyCalendar,
  getPublishQueue,
  updateEntryStatus,
  linkContentToEntry,
  getCalendarStats,
  storeContent,
  getContent,
  updateContentStatus,
  suggestNextContent,
  getPendingEntries,
  DEFAULT_GTM_CONFIG,
  initializeGTMCache,
} from './content-calendar.js';
import {
  postToSocial,
  getSocialStatus,
  postMilestoneCelebration,
} from '../social/social-service.js';
import { getBlogUrl, verifyBrandAccountConfig } from './gtm-config.js';
import type { ContentBrief, GeneratedContent, GTMConfig, GTMDashboard } from './types.js';

// Re-export getCalendarStats for convenient access
export { getCalendarStats } from './content-calendar.js';

// Re-export brand verification for CLI
export { verifyBrandAccountConfig } from './gtm-config.js';

const log = createLogger({ module: 'gtm-service' });

// ============================================================================
// AUTONOMOUS PUBLISHING
// ============================================================================

/**
 * Run the daily autonomous publishing job.
 * This is called by Cloud Scheduler daily.
 */
export async function runDailyPublishing(config: GTMConfig = DEFAULT_GTM_CONFIG): Promise<{
  success: boolean;
  generated: number;
  published: number;
  errors: string[];
}> {
  log.info('Starting daily GTM publishing run');

  // Ensure cache is hydrated from Firestore
  await initializeGTMCache();

  const result = {
    success: true,
    generated: 0,
    published: 0,
    errors: [] as string[],
  };

  try {
    // 1. Generate content for today
    const dayOfWeek = new Date().getDay();
    const content = await generateDailyContent(dayOfWeek);

    if (content) {
      storeContent(content);
      result.generated++;
      log.info('Generated daily content', {
        title: content.title,
        category: content.brief.category,
      });
    }

    // 2. Process publish queue
    const queue = getPublishQueue(config);
    log.info('Processing publish queue', { items: queue.length });

    for (const item of queue) {
      try {
        const contentToPublish = getContent(item.contentId);
        if (!contentToPublish) {
          log.warn('Content not found for queue item', { contentId: item.contentId });
          continue;
        }

        // Check if auto-publish is enabled or content is approved
        if (!config.autoPublish && contentToPublish.status !== 'approved') {
          log.info('Skipping unapproved content', {
            id: item.contentId,
            status: contentToPublish.status,
          });
          continue;
        }

        // Publish to social platforms
        const socialResult = await postToSocial({
          content: contentToPublish.excerpt,
          title: contentToPublish.title,
          hashtags: contentToPublish.hashtags,
          link: getBlogUrl(contentToPublish.id),
        });

        if (socialResult.results.some((r) => r.success)) {
          updateContentStatus(item.contentId, 'published', new Date());
          updateEntryStatus(item.entryId, 'published', item.contentId);
          result.published++;
          log.info('Published content', { id: item.contentId, title: contentToPublish.title });
        } else {
          result.errors.push(
            `Failed to publish ${item.contentId}: ${socialResult.results.map((r) => r.error).join(', ')}`
          );
        }
      } catch (e) {
        const error = `Failed to process queue item ${item.contentId}: ${String(e)}`;
        result.errors.push(error);
        log.error('Queue item processing failed', { error });
      }
    }

    result.success = result.errors.length === 0;
  } catch (e) {
    result.success = false;
    result.errors.push(`Daily publishing failed: ${String(e)}`);
    log.error('Daily publishing failed', { error: String(e) });
  }

  log.info('Daily GTM publishing complete', result);
  return result;
}

// ============================================================================
// CONTENT GENERATION ORCHESTRATION
// ============================================================================

/**
 * Generate content for the next week and add to calendar.
 */
export async function generateWeeklyContent(startDate: Date = new Date()): Promise<{
  success: boolean;
  entries: number;
  content: GeneratedContent[];
}> {
  log.info('Generating weekly content', { startDate });

  // Ensure cache is hydrated from Firestore
  await initializeGTMCache();

  const entries = generateWeeklyCalendar(startDate);
  const generatedContent: GeneratedContent[] = [];

  for (const entry of entries) {
    try {
      const brief: ContentBrief = {
        pillar: entry.pillar,
        category: entry.category,
        topic: entry.topic || `${entry.category} for ${entry.date.toLocaleDateString()}`,
        targetAudience: entry.category === 'case-study' ? 'executives' : 'developers',
        tone: 'warm',
      };

      const content = await generateContent(brief);
      linkContentToEntry(entry.id, content);
      generatedContent.push(content);

      log.info('Generated content for entry', { entryId: entry.id, contentId: content.id });
    } catch (e) {
      log.error('Failed to generate content for entry', { entryId: entry.id, error: String(e) });
    }
  }

  return {
    success: generatedContent.length > 0,
    entries: entries.length,
    content: generatedContent,
  };
}

/**
 * Generate content from a custom brief.
 */
export async function createContent(brief: ContentBrief): Promise<GeneratedContent> {
  const content = await generateContent(brief);
  storeContent(content);
  return content;
}

// ============================================================================
// MILESTONE CELEBRATIONS
// ============================================================================

/**
 * Generate and optionally publish a milestone celebration.
 */
export async function celebrateMilestone(
  milestone: {
    name: string;
    description: string;
    metric?: string;
    value?: number;
  },
  publishImmediately: boolean = false
): Promise<{
  content: GeneratedContent;
  published: boolean;
  socialResults?: Awaited<ReturnType<typeof postToSocial>>;
}> {
  log.info('Celebrating milestone', milestone);

  const content = await generateMilestoneContent(milestone);
  storeContent(content);

  let published = false;
  let socialResults;

  if (publishImmediately) {
    socialResults = await postMilestoneCelebration({
      name: milestone.name,
      description: milestone.description,
      date: new Date().toISOString(),
    });
    published = socialResults.results.some((r) => r.success);

    if (published) {
      updateContentStatus(content.id, 'published', new Date());
    }
  }

  return { content, published, socialResults };
}

// ============================================================================
// GTM DASHBOARD
// ============================================================================

/**
 * Get the current GTM dashboard data.
 */
export async function getGTMDashboard(): Promise<GTMDashboard> {
  // Ensure cache is hydrated from Firestore
  await initializeGTMCache();

  const calendarStats = getCalendarStats();
  const socialStatus = getSocialStatus();

  // Calculate posts this week
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  // Helper to check if platform is configured
  const isPlatformConfigured = (platform: string) =>
    socialStatus.platforms.find((p) => p.platform === platform)?.configured ?? false;

  const dashboard: GTMDashboard = {
    totalPosts: calendarStats.byStatus.published,
    postsThisWeek: 0, // TODO: Calculate from actual published dates
    scheduledPosts: calendarStats.byStatus.ready + calendarStats.byStatus['in-progress'],
    topPerformingContent: [], // TODO: Integrate with analytics
    platformBreakdown: {
      twitter: isPlatformConfigured('twitter') ? 1 : 0,
      linkedin: isPlatformConfigured('linkedin') ? 1 : 0,
      discord: isPlatformConfigured('discord') ? 1 : 0,
    },
    pillarBreakdown: calendarStats.byPillar,
    engagementTrend: [], // TODO: Integrate with analytics
  };

  return dashboard;
}

/**
 * Get GTM status summary for CLI.
 */
export async function getGTMStatus(): Promise<{
  calendarStats: ReturnType<typeof getCalendarStats>;
  socialStatus: ReturnType<typeof getSocialStatus>;
  pendingEntries: number;
  suggestion: ReturnType<typeof suggestNextContent>;
  config: GTMConfig;
}> {
  // Ensure cache is hydrated from Firestore
  await initializeGTMCache();

  return {
    calendarStats: getCalendarStats(),
    socialStatus: getSocialStatus(),
    pendingEntries: getPendingEntries().length,
    suggestion: suggestNextContent(),
    config: DEFAULT_GTM_CONFIG,
  };
}

// ============================================================================
// CONTENT APPROVAL WORKFLOW
// ============================================================================

/**
 * Approve content for publishing.
 */
export function approveContent(contentId: string): boolean {
  const content = getContent(contentId);
  if (!content) {
    log.warn('Content not found for approval', { contentId });
    return false;
  }

  updateContentStatus(contentId, 'approved');
  log.info('Content approved', { contentId, title: content.title });
  return true;
}

/**
 * Reject content and mark for revision.
 */
export function rejectContent(contentId: string, reason: string): boolean {
  const content = getContent(contentId);
  if (!content) {
    log.warn('Content not found for rejection', { contentId });
    return false;
  }

  updateContentStatus(contentId, 'review');
  log.info('Content rejected', { contentId, title: content.title, reason });
  return true;
}

// ============================================================================
// IMMEDIATE PUBLISHING
// ============================================================================

/**
 * Publish content immediately (bypasses queue).
 */
export async function publishNow(contentId: string): Promise<{
  success: boolean;
  results: Awaited<ReturnType<typeof postToSocial>>;
}> {
  const content = getContent(contentId);
  if (!content) {
    return {
      success: false,
      results: {
        post: { content: '', title: '' },
        results: [
          {
            platform: 'twitter' as const,
            success: false,
            error: 'Content not found',
            timestamp: new Date().toISOString(),
          },
        ],
        successCount: 0,
        failureCount: 1,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const results = await postToSocial({
    content: content.excerpt,
    title: content.title,
    hashtags: content.hashtags,
    link: getBlogUrl(content.id),
  });

  const success = results.results.some((r) => r.success);
  if (success) {
    updateContentStatus(contentId, 'published', new Date());
  }

  return { success, results };
}
