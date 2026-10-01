/**
 * Feature routes from src/api/, each wrapped in its own error boundary.
 *
 * Practice chat, family approvals, group call webhooks, engagement,
 * insights, superhuman metrics, visual storytelling, the
 * share / challenges / Musical You family, group conversations, marketplace
 * and custom agents.
 */

import type { Request, Response } from 'express';
import { createLogger } from '../../../utils/safe-logger.js';
import { handleEngagementRoutes } from '../../../api/engagement-routes.js';
import { handleGroupCallWebhooks } from '../../../api/group-call-webhooks.js';
import { handlePracticeRoutes } from '../../../api/practice-routes.js';
import { familyRouter } from '../../../api/routes/family.js';
import { handleFamilyCheckinControl } from '../../../api/routes/family-checkin-control.js';
import { handleInsightsRoutes } from '../../../api/insights-routes.js';
import { handleSuperhumanMetricsRoutes } from '../../../api/superhuman-metrics-routes.js';
import { handleVisualStorytellingRoutes } from '../../../api/visual-storytelling-routes.js';
import { handleMarketplaceRoutes } from '../../../api/marketplace-routes.js';
// SECURITY: Uses new modular version with Firebase auth (no x-user-id)
import { handleCustomAgentRoutes } from '../../../api/custom-agent/index.js';
import { handleShareRoutes } from '../../../api/routes/share-routes.js';
import { handleChallengeRoutes } from '../../../api/routes/challenge-routes.js';
import { handleCreativeYouRoutes } from '../../../api/routes/creative-you-routes.js';
import { handleMusicalYouRoutes } from '../../../api/routes/musical-you-routes.js';
import { handleGamesRoutes } from '../../../api/routes/games.js';
import { handleSocialRoutes } from '../../../api/routes/social-routes.js';
import { handlePremiumRoutes } from '../../../api/routes/premium-routes.js';
import { groupConversationRoutes } from '../../../api/group-conversation-routes.js';
import { withRouteErrorBoundary, type RouteContext } from './route-context.js';

const log = createLogger({ module: 'APIServer' });

/** Share / challenges / Creative You / Musical You / games / social / premium. */
async function dispatchShareFamilyRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // Share routes (Musical You / Creative You cards)
  if (pathname.startsWith('/api/share/') || pathname.startsWith('/share/')) {
    const handled = await handleShareRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Challenge routes (Daily Challenges)
  if (pathname.startsWith('/api/challenges')) {
    const query = new URLSearchParams(parsedUrl.search || '');
    const handled = await handleChallengeRoutes(req, res, pathname, query);
    if (handled) return true;
  }

  // Creative You routes (Videos, Podcasts, DNA)
  if (pathname.startsWith('/api/creative')) {
    const query = new URLSearchParams(parsedUrl.search || '');
    const handled = await handleCreativeYouRoutes(req, res, pathname, query);
    if (handled) return true;
  }

  // Musical You routes (DNA, Challenges, Leaderboards, Cards, Spotify)
  if (pathname.startsWith('/api/musical')) {
    const query = new URLSearchParams(parsedUrl.search || '');
    const handled = await handleMusicalYouRoutes(req, res, pathname, query);
    if (handled) return true;
  }

  // Games routes (Music games catalog, stats, insights - powers Musical You dashboard)
  if (pathname.startsWith('/api/games')) {
    const handled = await handleGamesRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Social routes (Challenges, Leaderboards, Taste Match)
  if (pathname.startsWith('/api/social')) {
    const query = new URLSearchParams(parsedUrl.search || '');
    const handled = await handleSocialRoutes(req, res, pathname, query);
    if (handled) return true;
  }

  // Premium routes (Our Song, Premium Content)
  if (pathname.startsWith('/api/premium/')) {
    const query = new URLSearchParams(parsedUrl.search || '');
    log.debug({
      path: pathname,
      params: Object.fromEntries(query.entries()),
    });
    const handled = await handlePremiumRoutes(req, res, pathname, query);
    if (handled) return true;
  }

  return false;
}

/**
 * Group conversation routes (Team Roundtable, Conference Calls)
 *
 * TODO: TECHNICAL DEBT - This uses an Express Router pattern while everything else
 * uses raw Node.js HTTP handlers. This creates unnecessary overhead (dynamic import,
 * mock app creation) on every /api/group/ request. Should refactor
 * group-conversation-routes.ts to use the standard handleXxxRoutes() pattern.
 * See: src/api/CLAUDE.md for the standard pattern.
 */
async function dispatchGroupConversationRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname } = ctx;
  if (pathname.startsWith('/api/group/')) {
    const express = await import('express');
    const mockApp = express.default();
    mockApp.use('/api/group', groupConversationRoutes);

    // Forward request to express router
    await new Promise<void>((resolve, reject) => {
      // Raw Node request/response objects; Express decorates them as it runs.
      mockApp(req as unknown as Request, res as unknown as Response, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
    if (res.writableEnded) return true;
  }
  return false;
}

/**
 * Dispatch feature routes. Returns true when the request is finished.
 */
export async function dispatchFeatureRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // Practice, family, group call webhooks and engagement share one boundary
  const engagementDone = await withRouteErrorBoundary(
    res,
    'Engagement route error',
    'json',
    async () => {
      // Sanctuary practice chat (was never mounted; the web app fell back to canned text)
      if (await handlePracticeRoutes(req, res, pathname)) return true;

      // Family member approvals (web app family identities; was never mounted)
      if (pathname.startsWith('/api/family/')) {
        if (await handleFamilyCheckinControl(req, res, pathname)) return true;
        if (await familyRouter(req, res, pathname, parsedUrl)) return true;
      }

      // Group call Twilio webhooks: signature-checked, must run before the
      // engagement routes (which own /api/group and 401 unauthenticated callers)
      if (await handleGroupCallWebhooks(req, res, pathname)) return true;

      // Engagement routes
      const engagementHandled = await handleEngagementRoutes(req, res, pathname, parsedUrl);
      return Boolean(engagementHandled);
    }
  );
  if (engagementDone) return true;

  // Insights routes - "What I'm Noticing" superhuman insights
  const insightsDone = await withRouteErrorBoundary(
    res,
    'Insights route error',
    'text',
    async () => {
      if (pathname.startsWith('/api/insights/')) {
        const handled = await handleInsightsRoutes(req, res, pathname, parsedUrl);
        if (handled) return true;
      }
      return false;
    }
  );
  if (insightsDone) return true;

  // Superhuman metrics routes - "Better Than Human" dashboard metrics
  const superhumanDone = await withRouteErrorBoundary(
    res,
    'Superhuman metrics route error',
    'text',
    async () => {
      if (pathname.startsWith('/api/superhuman/')) {
        const handled = await handleSuperhumanMetricsRoutes(req, res, pathname, parsedUrl);
        if (handled) return true;
      }
      return false;
    }
  );
  if (superhumanDone) return true;

  // Visual Storytelling routes - circadian sync, relationship warmth, milestones
  const storytellingDone = await withRouteErrorBoundary(
    res,
    'Visual storytelling route error',
    'json',
    async () => {
      if (pathname.startsWith('/api/visual-storytelling/')) {
        const handled = await handleVisualStorytellingRoutes(req, res, pathname);
        if (handled) return true;
      }
      return false;
    }
  );
  if (storytellingDone) return true;

  if (
    await withRouteErrorBoundary(res, 'Share route error', 'json', async () =>
      dispatchShareFamilyRoutes(ctx)
    )
  ) {
    return true;
  }

  if (
    await withRouteErrorBoundary(res, 'Group conversation route error', 'json', async () =>
      dispatchGroupConversationRoutes(ctx)
    )
  ) {
    return true;
  }

  // Marketplace routes
  const marketplaceDone = await withRouteErrorBoundary(
    res,
    'Marketplace route error',
    'json',
    async () => {
      if (pathname.startsWith('/api/marketplace/')) {
        const handled = await handleMarketplaceRoutes(req, res, pathname, parsedUrl);
        if (handled) return true;
      }
      return false;
    }
  );
  if (marketplaceDone) return true;

  // Custom agent routes (user-created agents)
  const customAgentDone = await withRouteErrorBoundary(
    res,
    'Custom agent route error',
    'json',
    async () => {
      if (pathname.startsWith('/api/custom-agents')) {
        const handled = await handleCustomAgentRoutes(req, res, pathname, parsedUrl);
        if (handled) return true;
      }
      return false;
    }
  );
  if (customAgentDone) return true;

  // Marketplace admin routes
  return withRouteErrorBoundary(res, 'Marketplace admin route error', 'json', async () => {
    if (pathname.startsWith('/api/admin/marketplace')) {
      const { handleMarketplaceAdminRoutes } =
        await import('../../../api/routes/marketplace-admin.js');
      const handled = await handleMarketplaceAdminRoutes(req, res, pathname);
      if (handled) return true;
    }
    return false;
  });
}
