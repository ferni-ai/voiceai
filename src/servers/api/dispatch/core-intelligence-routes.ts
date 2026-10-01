/**
 * Intelligence, relationships, automation and admin routes.
 *
 * Intelligence, team insights, commitments, conversations, group coaching,
 * growth, video, wearables, cognitive memories, marketplace reviews, landing AI,
 * sanctuary, session context, jobs, automation, EvalOps, household, contacts,
 * gifts, stories, user events, analytics, admin and CEO routes.
 *
 * Part of the core API chain: dispatched inside the shared "API route error"
 * boundary in core-routes.ts.
 */

import { handleIntelligenceRoutes } from '../../../api/routes/intelligence-routes.js';
import { handleTeamInsightsRoutes } from '../../../api/routes/team-insights.js';
import { handleCommitmentsRoutes } from '../../../api/routes/commitments.js';
import { handleConversationThreadsRoutes } from '../../../api/routes/conversation-threads.js';
import { handleConversationsRoutes } from '../../../api/routes/conversations.js';
import { handleGroupCoachingRoutes } from '../../../api/routes/group-coaching.js';
import { handleGrowthRoutes } from '../../../api/routes/growth.js';
import { handleVideoSessionRoutes } from '../../../api/routes/video-sessions.js';
import { handleWearableRoutes } from '../../../api/routes/wearable.js';
import { handleMemoriesRoutes } from '../../../api/routes/memories.js';
import { handleReviewsRoutes as handleMarketplaceReviewsRoutes } from '../../../api/routes/marketplace-reviews.js';
import { handleLandingAIRoutes } from '../../../api/routes/landing-ai.js';
import { handleSanctuaryRoutes } from '../../../api/sanctuary-routes.js';
import { handleScheduledJobsRoutes } from '../../../api/scheduled-jobs.routes.js';
import { handleEvalOpsRoutes } from '../../../api/evalops.routes.js';
import { handleHouseholdRoutes } from '../../../api/household-routes.js';
import { handleContactsRoutes } from '../../../api/contacts-routes.js';
import { handleGiftRoutes } from '../../../api/gift-routes.js';
import { handleStoryJourneyRoutes } from '../../../api/story-journey-routes.js';
import { handleStoryRoutes } from '../../../api/story-routes.js';
import { handleUserEventsRoutes } from '../../../api/user-events-routes.js';
import { handleAnalyticsRoutes } from '../../../api/user-analytics-routes.js';
import { handleBuilderMetricsRoutes } from '../../../api/routes/builder-metrics.js';
import { handleMusicAnalyticsRoutes } from '../../../api/music-analytics-routes.js';
import { handleAdminRoutes } from '../../../api/admin-routes.js';
import { handleCEORoutes } from '../../../api/ceo/index.js';
import { handleSessionAnalyticsRoutes } from '../../../api/session-analytics-routes.js';
import { handleBatchOperationsRoutes } from '../../../api/batch-operations-routes.js';
import { handleWebhookManagementRoutes } from '../../../api/webhook-management-routes.js';
import { handleAutomationRoutes } from '../../../api/automation-routes.js';
import { handleLifeAutomationRoutes } from '../../../api/life-automation-routes.js';
import type { RouteContext } from './route-context.js';

/**
 * Returns true when the request is finished.
 */
export async function dispatchIntelligenceRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // Intelligence routes (Better Than Human)
  if (pathname.startsWith('/api/intelligence')) {
    const handled = await handleIntelligenceRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Team insights routes (What We Notice - cross-persona intelligence)
  if (pathname.startsWith('/api/team-insights')) {
    const handled = await handleTeamInsightsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Commitments routes (Better Than Human - never forget promises)
  if (pathname.startsWith('/api/commitments')) {
    const handled = await handleCommitmentsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Conversation threads routes (Better Than Human - track topics)
  if (pathname.startsWith('/api/conversations/threads')) {
    const handled = await handleConversationThreadsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Conversations routes
  if (pathname.startsWith('/api/conversations')) {
    const handled = await handleConversationsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Group coaching routes (multi-participant sessions)
  if (pathname.startsWith('/api/group')) {
    const handled = await handleGroupCoachingRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Growth visibility routes
  if (pathname.startsWith('/api/growth')) {
    const handled = await handleGrowthRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Video session routes
  if (pathname.startsWith('/api/video')) {
    const handled = await handleVideoSessionRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Wearable integration routes
  if (pathname.startsWith('/api/wearable')) {
    const handled = await handleWearableRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Cognitive memories routes
  if (pathname.startsWith('/api/cognitive')) {
    const handled = await handleMemoriesRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Marketplace reviews routes
  if (pathname.startsWith('/api/marketplace/reviews')) {
    const handled = await handleMarketplaceReviewsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Landing AI routes
  if (pathname.startsWith('/api/landing/ai')) {
    const handled = await handleLandingAIRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Sanctuary routes (mindfulness, practices)
  if (pathname.startsWith('/api/sanctuary')) {
    const handled = await handleSanctuaryRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Session context routes (Voice ↔ App sync - Better Than Human)
  if (pathname.startsWith('/api/context')) {
    const { handleSessionContextRoute } = await import('../../../api/routes/session-context.js');
    // Parse body for POST requests
    let contextBody: unknown;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      try {
        contextBody = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        contextBody = undefined;
      }
    }
    const handled = await handleSessionContextRoute(req, res, contextBody);
    if (handled) return true;
  }

  // Scheduled jobs routes
  if (pathname.startsWith('/api/jobs')) {
    const handled = await handleScheduledJobsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Life Automation routes (workflows, templates, integrations)
  if (pathname.startsWith('/api/life-automation')) {
    const handled = await handleLifeAutomationRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Automation routes (send-message, create-event, audit-log)
  if (pathname.startsWith('/api/automation')) {
    const handled = await handleAutomationRoutes(req, res, pathname);
    if (handled) return true;
  }

  // EvalOps routes
  if (pathname.startsWith('/api/evalops')) {
    const handled = await handleEvalOpsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Household routes
  if (pathname.startsWith('/api/household')) {
    const handled = await handleHouseholdRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Contacts routes (contact management, groups, nudges)
  if (pathname.startsWith('/api/contacts')) {
    const handled = await handleContactsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Gift tracking routes (gifts given/received, suggestions, analytics)
  if (pathname.startsWith('/api/gifts')) {
    const handled = await handleGiftRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Story journey routes
  if (pathname.startsWith('/api/story-journey')) {
    const handled = await handleStoryJourneyRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Story routes (Your Story dashboard - actions, summary, stream)
  if (pathname.startsWith('/api/story')) {
    const handled = await handleStoryRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Voice → UI user events (poll + SSE for Firebase Hosting)
  if (pathname.startsWith('/api/user-events')) {
    const handled = await handleUserEventsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Analytics routes
  if (pathname.startsWith('/api/analytics')) {
    const handled = await handleAnalyticsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Builder metrics routes
  if (pathname.startsWith('/api/admin/builder-metrics')) {
    const handled = await handleBuilderMetricsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Session analytics routes (admin - sessions, quality, persona bonds, intents)
  if (pathname.startsWith('/api/admin/analytics')) {
    const handled = await handleSessionAnalyticsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Batch operations routes (admin - bulk indexing, cleanup)
  if (pathname.startsWith('/api/admin/batch')) {
    const handled = await handleBatchOperationsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Webhook management routes (admin - create, update, test webhooks)
  if (pathname.startsWith('/api/admin/webhooks')) {
    const handled = await handleWebhookManagementRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Music analytics admin routes
  if (pathname.startsWith('/api/admin/music-analytics')) {
    const handled = await handleMusicAnalyticsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Admin routes (daily stats, callers, visitors, trigger report)
  if (pathname.startsWith('/api/admin/')) {
    const handled = await handleAdminRoutes(req, res, pathname);
    if (handled) return true;
  }

  // CEO routes (goals, brain, briefing, habits, wins, etc.)
  if (pathname.startsWith('/api/ceo')) {
    const handled = await handleCEORoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  return false;
}
