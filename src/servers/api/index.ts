/**
 * UI/API Server
 *
 * Serves the frontend UI, provides API routes, and handles integrations.
 */

import 'dotenv/config';
import http from 'http';
import type { UrlWithParsedQuery } from 'url';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'APIServer' });

// Shared utilities
import { setCorsHeaders, handleCorsPreflightRequest } from '../shared/cors.js';
import { setSecurityHeaders } from '../shared/security-headers.js';
import {
  addRequestId,
  handleHealthEndpoint,
  handleSecurityMonitoring,
  hardenServer,
  registerDDoSAlertCallback,
  startDDoSMonitoring,
} from '../../utils/ddos-protection.js';
import { notifyDDoSAlert } from '../../services/slack-notifications.js';
import { rateLimit, optionalAuthAsync } from '../../api/auth-middleware.js';
import { parseRawBody } from '../../api/helpers.js';

// Local routes
import {
  handlePlaidRoutes,
  handleSpotifyRoutes,
  handleHealthRoutes,
  handleTokenRoutes,
  handleGoogleCalendarRoutes,
  handleMicrosoftCalendarRoutes,
  handleMusicRoutes,
  handleAgentRoutes,
  handlePushRoutes,
  handleWebhookRoutes,
  handleSpotifyRoomsRoutes,
  handleEcobeeRoutes,
  handleSmartHomeRoutes,
  handleVibeRoutes,
  handleEightSleepRoutes,
  handleOuraRoutes,
  handleAppleHealthRoutes,
  handleAppleNotification,
  handleIntelligentRoutingRoutes,
  // "Better Than Human" routes
  handleVisualMemoryRoutes,
  handleAmbientModeRoutes,
  handleBTHIntelligenceRoutes,
} from './routes/index.js';
import { handleStaticRoutes, serveStaticFile } from './static.js';

// Spotify auto-refresh
import {
  startAutoRefresh as startSpotifyAutoRefresh,
  shutdown as shutdownSpotify,
} from './services/spotify.js';
import { shutdown as shutdownPlaid } from './services/plaid.js';
import { shutdown as shutdownDemoSessions } from './services/demo-sessions.js';
import { shutdown as shutdownTokenRoutes } from './routes/token.js';
import { shutdown as shutdownGoogleCalendar } from '../token/oauth/google-calendar.js';
import { shutdown as shutdownSpotifyOAuth } from '../token/oauth/spotify.js';
import { shutdownPersistence } from '../../services/persistence/index.js';

// Calendar real-time sync services
import {
  startPolling as startApplePolling,
  loadRegisteredUsers as loadApplePollingUsers,
  stopPolling as shutdownApplePolling,
} from '../../services/calendar/polling/apple-polling.js';

// Proactive outreach scheduler ("Better Than Human" - thinking of you moments)
import {
  startScheduler as startProactiveScheduler,
  stopScheduler as stopProactiveScheduler,
  loadPendingOutreach,
} from '../../services/outreach/proactive-scheduler.js';
import { renewExpiringChannels as startGoogleWebhookRenewal } from '../../services/calendar/webhooks/google-webhook.js';
import { renewExpiringSubscriptions as startOutlookSubscriptionRenewal } from '../../services/calendar/webhooks/outlook-webhook.js';

// Existing API route handlers (from dist/)
import { handleEngagementRoutes } from '../../api/engagement-routes.js';
import { handleDiagnosticsRoutes } from '../../api/handoff-diagnostics.js';
import { handleDashboardMetricsRoutes } from '../../api/dashboard-metrics-routes.js';
import { handleDORARoutes } from '../../api/dora-routes.js';
import { handleObservabilityRoutes } from '../../api/observability-routes.js';
import { handleToolsAnalyticsRoutes } from '../../api/tools-analytics-routes.js';
import { handleVoicePresenceRoutes } from '../../api/voice-presence-routes.js';
import { handleOutreachRoutes } from '../../api/outreach.routes.js';
import { handleBackgroundResultsRoutes } from '../../api/background-results-routes.js';
import { handleGDPRRoutes } from '../../api/gdpr-routes.js';
import { handleTrustExportRoutes } from '../../api/trust-export-routes.js';
import { handleTrustJourneyRoutes } from '../../api/trust-journey-routes.js';
import { handleCalendarRoutes } from '../../api/calendar-routes.js';
import { handleTrustSystemsRoutes } from '../../api/trust-systems-routes.js';
import { handleRelationshipArcRoutes } from '../../api/relationship-arc-routes.js';
import { handleFeatureFlagsRoutes } from '../../api/feature-flags-routes.js';
import { handleBrandRoutes } from '../../api/brand-routes.js';
import { handleCommandsRoutes } from '../../api/commands-routes.js';
import { handleWidgetRoutes } from '../../api/widget-routes.js';
import { handleMonitoringRoutes } from '../../api/monitoring-routes.js';
import { handlePerformanceRoutes } from '../../api/performance-routes.js';
import { handleConciergeRoutes } from '../../api/concierge-routes.js';
import { handleProactiveRoutes } from '../../api/proactive-routes.js';
import { handlePredictionsRoutes } from '../../api/routes/predictions.js';
import { handleLLMContentRoutes } from '../../api/llm-content-routes.js';
import { relationshipHealthRoutes } from '../../api/routes/relationship-health-routes.js';
import { handleYearInReviewRoutes } from '../../api/year-in-review-routes.js';
import { handleRelationshipRoutes } from '../../api/routes/relationship.js';
import { handleVoiceHumanizationRoutes } from '../../api/voice-humanization-routes.js';
import { handleLifeContextRoutes } from '../../api/life-context-routes.js';
import { handleSpeechMetricsRoutes } from '../../api/speech-metrics-routes.js';
import { handleVoiceAuthRoutes } from '../../api/voice-auth.routes.js';
import { handleUserRoutes } from '../../api/user-routes.js';
import { handleWaitlistRoutes } from '../../api/waitlist-routes.js';
import { handleHabitRoutes } from '../../api/habit-routes.js';
import { handleWellbeingRoutes } from '../../api/wellbeing.routes.js';
import { handleYourStoryRoutes } from '../../api/your-story-routes.js';
import { handlePredictiveInsightsRequest } from '../../api/predictive-insights-routes.js';
import { handleIntelligenceRoutes } from '../../api/routes/intelligence-routes.js';
import { handleScheduledJobsRoutes } from '../../api/scheduled-jobs.routes.js';
import { handleEvalOpsRoutes } from '../../api/evalops.routes.js';
import { handleHouseholdRoutes } from '../../api/household-routes.js';
import { handleContactsRoutes } from '../../api/contacts-routes.js';
import { handleGiftRoutes } from '../../api/gift-routes.js';
import { handleStoryJourneyRoutes } from '../../api/story-journey-routes.js';
import { handleSubscriptionRequest, isSubscriptionRoute } from '../../api/subscription-routes.js';
import { handleAnalyticsRoutes } from '../../api/user-analytics-routes.js';
import { handleBuilderMetricsRoutes } from '../../api/routes/builder-metrics.js';
import { handleMusicAnalyticsRoutes } from '../../api/music-analytics-routes.js';
import { handleMonetizationRequest, isMonetizationRoute } from '../../api/monetization-routes.js';
import { handleAppleRoutes, isAppleRoute } from '../../api/apple-iap-routes.js';
import { handleV1Routes } from '../../api/v1/index.js';
import handleMigrationRoutes from '../../api/migration-routes.js';
import handleAccountRoutes from '../../api/account-routes.js';
import handleAuthMonitoringRoutes from '../../api/auth-monitoring-routes.js';
import handleSessionAccentRoutes from '../../api/session-accent-routes.js';
import { handleLandingIntelligenceRoutes } from '../../api/landing-intelligence.routes.js';
import { handleLandingOptimizationRoutes } from '../../api/landing-optimization.routes.js';
import { handleCameoAnalyticsRoutes } from '../../api/cameo-analytics-routes.js';
import { handleGardenRoutes } from '../../api/garden-routes.js';
import { handleRoadmapRoutes } from '../../api/roadmap-routes.js';
import { handleCrashReportRoutes } from '../../api/crash-report-routes.js';
import { handleMarketingRoutes } from '../../api/marketing-routes.js';
import { handleLinkedInRoutes } from '../../api/linkedin-routes.js';
import { handleSitesRoutes } from '../../api/sites-routes.js';
import { handleSeedsRoutes } from '../../api/seeds-routes.js';
import { handleCalendarWebhookRoutes } from '../../api/calendar-webhook-routes.js';
import { handlePracticeCalendarRoutes } from '../../api/routes/practice-calendar.js';
import { handlePracticeViewRoutes } from '../../api/routes/practice-view.js';
import { handleFinOpsRoutes } from '../../api/finops-routes.js';
import { handleConversationCostRoutes } from '../../api/conversation-cost-routes.js';
import { handleJournalRoutes } from '../../api/journal-routes.js';
import { handleDebugRoutes } from '../../api/debug-routes.js';
import { handleCustomAgentFeaturesRoutes } from '../../api/custom-agent-features.routes.js';
import { handleCacheRoutes } from '../../api/cache-routes.js';
import { handleSessionAnalyticsRoutes } from '../../api/session-analytics-routes.js';
import { handleBatchOperationsRoutes } from '../../api/batch-operations-routes.js';
import { handleWebhookManagementRoutes } from '../../api/webhook-management-routes.js';
import { handleDesignTokensRoutes } from '../../api/design-tokens-routes.js';
import { handleInsightsRoutes } from '../../api/insights-routes.js';
import { handleMemoryRoutes } from '../../api/memory-routes.js';
import { handleActionRoutes } from '../../api/action-routes.js';
import { handleSemanticIntelligenceRoutes } from './routes/semantic-intelligence.js';
import {
  handleTwilioRoutes,
  initializeTwilioStreamBridge,
  attachTwilioStreamBridgeToServer,
} from '../../api/twilio-routes.js';
import { handleOutboundCallRoutes } from '../../api/outbound-call-handler.js';

// WebSocket for real-time insights
import {
  initInsightsWebSocket,
  shutdownInsightsWebSocket,
} from '../../services/insights-websocket.js';

// WebSocket for life context (Phase 6)
import {
  initLifeContextWebSocket,
  shutdownLifeContextWebSocket,
} from '../../services/life-context-websocket.js';
import { handleMarketplaceRoutes } from '../../api/marketplace-routes.js';
// SECURITY: Uses new modular version with Firebase auth (no x-user-id)
import { handleCustomAgentRoutes } from '../../api/custom-agent/index.js';
import { handleShareRoutes } from '../../api/routes/share-routes.js';
import { handleChallengeRoutes } from '../../api/routes/challenge-routes.js';
import { handleCreativeYouRoutes } from '../../api/routes/creative-you-routes.js';
import { handleMusicalYouRoutes } from '../../api/routes/musical-you-routes.js';
import { handleGamesRoutes } from '../../api/routes/games.js';
import { handleSocialRoutes } from '../../api/routes/social-routes.js';
import { handlePremiumRoutes } from '../../api/routes/premium-routes.js';
import { groupConversationRoutes } from '../../api/group-conversation-routes.js';

// Orphaned routes (previously not registered but frontend calls them)
import { handleRitualsRoutes } from '../../api/routes/rituals.js';
import { handleSkyCheckRoutes } from '../../api/routes/sky-check.js';
import { handleTwinProfileRoutes } from './routes/twin-profile.js';

const PORT = parseInt(process.env.PORT || '3002', 10);

// Validate configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  log.error(
    'Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET'
  );
  process.exit(1);
}

/**
 * Create the HTTP server
 */
const server = http.createServer(async (req, res) => {
  // Add request ID for tracing
  addRequestId(req, res);

  // Set security headers (HSTS, CSP, X-Frame-Options, etc.)
  setSecurityHeaders(res);

  // Handle CORS
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    handleCorsPreflightRequest(req, res);
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // ============================================================================
  // SUBDOMAIN ROUTING for *.ferni.ai custom agent sites
  // ============================================================================
  const host = req.headers.host || '';
  const subdomainMatch = host.match(/^([a-z0-9-]+)\.ferni\.ai$/i);
  if (subdomainMatch) {
    const subdomain = subdomainMatch[1].toLowerCase();
    // Skip reserved subdomains (these should go to main app)
    const reserved = ['www', 'app', 'api', 'admin', 'mail', 'staging', 'dev', 'test'];
    if (!reserved.includes(subdomain)) {
      // Rewrite pathname to serve the deployed site
      // e.g., joel-dickson.ferni.ai -> /sites/joel-dickson
      pathname = `/sites/${subdomain}${pathname === '/' ? '' : pathname}`;
      log.debug({ host, subdomain, rewrittenPath: pathname }, 'Subdomain routing');
    }
  }

  // Health endpoint with rate limiting (DDoS Protection)
  if (handleHealthEndpoint(req, res, pathname, 'bogle-ui')) {
    return;
  }

  // Security monitoring endpoint (Admin Only)
  if (handleSecurityMonitoring(req, res, pathname)) {
    return;
  }

  // Global rate limiting for API routes
  if (pathname.startsWith('/api/') && pathname !== '/api/health') {
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return;
    }
  }

  // ============================================================================
  // LOCAL ROUTES (TypeScript modules)
  // ============================================================================

  // Health routes
  if (await handleHealthRoutes(req, res, pathname)) return;

  // Token routes (LiveKit tokens, demo sessions)
  if (await handleTokenRoutes(req, res, pathname, parsedUrl)) return;

  // Plaid routes
  if (pathname.startsWith('/plaid')) {
    if (await handlePlaidRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Spotify routes
  if (pathname.startsWith('/spotify')) {
    if (await handleSpotifyRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Google Calendar OAuth routes
  if (pathname.startsWith('/auth/google')) {
    if (await handleGoogleCalendarRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Microsoft Calendar OAuth routes
  if (pathname.startsWith('/auth/microsoft')) {
    if (await handleMicrosoftCalendarRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Music status routes
  if (pathname.startsWith('/api/music')) {
    if (await handleMusicRoutes(req, res, pathname)) return;
  }

  // Agent discovery routes
  if (pathname.startsWith('/api/agents') || pathname === '/api/team/order') {
    if (await handleAgentRoutes(req, res, pathname)) return;
  }

  // Push notification routes
  if (pathname.startsWith('/api/push')) {
    if (await handlePushRoutes(req, res, pathname)) return;
  }

  // Eight Sleep routes
  if (pathname.startsWith('/api/eight-sleep')) {
    if (await handleEightSleepRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Oura Ring routes
  if (pathname.startsWith('/api/oura')) {
    if (await handleOuraRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Apple Health routes
  if (pathname.startsWith('/api/apple-health')) {
    if (await handleAppleHealthRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Apple Sign In notifications (server-to-server)
  if (pathname === '/api/apple/notifications') {
    await handleAppleNotification(req, res);
    return;
  }

  // Webhooks routes (IFTTT, Zapier, Home Assistant, Siri Shortcuts)
  if (pathname.startsWith('/api/webhooks')) {
    if (await handleWebhookRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Spotify Rooms routes (multi-room audio)
  if (pathname.startsWith('/api/spotify/rooms') || pathname.startsWith('/api/spotify/devices')) {
    if (await handleSpotifyRoomsRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Ecobee thermostat routes
  if (pathname.startsWith('/api/ecobee')) {
    if (await handleEcobeeRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Smart home routes (Hue, LIFX)
  if (pathname.startsWith('/api/smart-home')) {
    if (await handleSmartHomeRoutes(req, res, pathname, parsedUrl)) return;
  }

  // Vibe routes (unified environment control)
  if (pathname.startsWith('/api/vibe')) {
    if (await handleVibeRoutes(req, res, pathname)) return;
  }

  // 🧠 Intelligent routing dashboard & control routes
  if (pathname.startsWith('/api/intelligent-routing')) {
    // Cast URL to expected type - the handler doesn't use parsed query features
    if (
      await handleIntelligentRoutingRoutes(
        req,
        res,
        pathname,
        parsedUrl as unknown as UrlWithParsedQuery
      )
    )
      return;
  }

  // ============================================================================
  // "BETTER THAN HUMAN" ROUTES
  // Visual Memory, Ambient Mode - superhuman awareness & recall
  // ============================================================================

  // 📸 Visual Memory routes (photo/image recall)
  if (pathname.startsWith('/api/visual-memory')) {
    if (await handleVisualMemoryRoutes(req, res, pathname, parsedUrl)) return;
  }

  // 🌙 Ambient Mode routes (continuous background presence)
  if (pathname.startsWith('/api/ambient-mode')) {
    if (await handleAmbientModeRoutes(req, res, pathname, parsedUrl)) return;
  }

  // 🧠 BTH Intelligence Debug routes (user knowledge aggregation)
  if (pathname.startsWith('/api/bth')) {
    if (await handleBTHIntelligenceRoutes(req, res)) return;
  }

  // ============================================================================
  // EXISTING API ROUTES (from src/api/)
  // ============================================================================

  try {
    // Engagement routes
    const engagementHandled = await handleEngagementRoutes(req, res, pathname, parsedUrl);
    if (engagementHandled) return;
  } catch (err) {
    log.error({ error: String(err) }, 'Engagement route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Insights routes - "What I'm Noticing" superhuman insights
    if (pathname.startsWith('/api/insights/')) {
      const handled = await handleInsightsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Insights route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Share routes (Musical You / Creative You cards)
    if (pathname.startsWith('/api/share/') || pathname.startsWith('/share/')) {
      const handled = await handleShareRoutes(req, res, pathname);
      if (handled) return;
    }

    // Challenge routes (Daily Challenges)
    if (pathname.startsWith('/api/challenges')) {
      const query = new URLSearchParams(parsedUrl.search || '');
      const handled = await handleChallengeRoutes(req, res, pathname, query);
      if (handled) return;
    }

    // Creative You routes (Videos, Podcasts, DNA)
    if (pathname.startsWith('/api/creative')) {
      const query = new URLSearchParams(parsedUrl.search || '');
      const handled = await handleCreativeYouRoutes(req, res, pathname, query);
      if (handled) return;
    }

    // Musical You routes (DNA, Challenges, Leaderboards, Cards, Spotify)
    if (pathname.startsWith('/api/musical')) {
      const query = new URLSearchParams(parsedUrl.search || '');
      const handled = await handleMusicalYouRoutes(req, res, pathname, query);
      if (handled) return;
    }

    // Games routes (Music games catalog, stats, insights - powers Musical You dashboard)
    if (pathname.startsWith('/api/games')) {
      const handled = await handleGamesRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Social routes (Challenges, Leaderboards, Taste Match)
    if (pathname.startsWith('/api/social')) {
      const query = new URLSearchParams(parsedUrl.search || '');
      const handled = await handleSocialRoutes(req, res, pathname, query);
      if (handled) return;
    }

    // Premium routes (Our Song, Premium Content)
    if (pathname.startsWith('/api/premium/')) {
      const query = new URLSearchParams(parsedUrl.search || '');
      log.debug({
        path: pathname,
        params: Object.fromEntries(query.entries()),
      });
      const handled = await handlePremiumRoutes(req, res, pathname, query);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Share route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Group conversation routes (Team Roundtable, Conference Calls)
    // TODO: TECHNICAL DEBT - This uses an Express Router pattern while everything else
    // uses raw Node.js HTTP handlers. This creates unnecessary overhead (dynamic import,
    // mock app creation) on every /api/group/ request. Should refactor
    // group-conversation-routes.ts to use the standard handleXxxRoutes() pattern.
    // See: src/api/CLAUDE.md for the standard pattern.
    if (pathname.startsWith('/api/group/')) {
      const express = await import('express');
      const mockApp = express.default();
      mockApp.use('/api/group', groupConversationRoutes);

      // Forward request to express router
      await new Promise<void>((resolve, reject) => {
        mockApp(req as any, res as any, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      if (res.writableEnded) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Group conversation route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Marketplace routes
    if (pathname.startsWith('/api/marketplace/')) {
      const handled = await handleMarketplaceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Marketplace route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Custom agent routes (user-created agents)
    if (pathname.startsWith('/api/custom-agents')) {
      const handled = await handleCustomAgentRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Custom agent route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Marketplace admin routes
    if (pathname.startsWith('/api/admin/marketplace')) {
      const { handleMarketplaceAdminRoutes } =
        await import('../../api/routes/marketplace-admin.js');
      const handled = await handleMarketplaceAdminRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Marketplace admin route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Diagnostics routes
    const diagnosticsHandled = await handleDiagnosticsRoutes(req, res, pathname, parsedUrl);
    if (diagnosticsHandled) return;
  } catch (err) {
    log.error({ error: String(err) }, 'Diagnostics route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // API v1 routes
    if (pathname.startsWith('/api/v1/')) {
      const handled = await handleV1Routes(req, res, pathname, parsedUrl);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'API v1 route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Migration routes
    if (pathname.startsWith('/api/auth/migrat')) {
      const handled = await handleMigrationRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Migration route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Account routes
    if (pathname.startsWith('/api/account')) {
      const handled = await handleAccountRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Account route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Session accent routes
    if (pathname.startsWith('/api/session/accent')) {
      const handled = await handleSessionAccentRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Session accent route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // Auth monitoring routes
    if (pathname.startsWith('/api/auth/')) {
      const handled = await handleAuthMonitoringRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    log.error({ error: String(err) }, 'Auth monitoring route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  try {
    // DORA routes
    if (pathname.startsWith('/api/dora')) {
      const handled = await handleDORARoutes(req, res);
      if (handled) return;
    }

    // Voice presence routes
    if (pathname.startsWith('/api/voice-presence')) {
      const handled = await handleVoicePresenceRoutes(req, res, pathname);
      if (handled) return;
    }

    // Observability routes
    if (pathname.startsWith('/api/observability')) {
      const handled = await handleObservabilityRoutes(req, res, pathname);
      if (handled) return;
    }

    // FinOps routes (admin)
    if (pathname.startsWith('/api/finops')) {
      const handled = await handleFinOpsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Conversation cost routes (user-facing cost transparency)
    if (pathname.startsWith('/api/conversation/cost')) {
      const handled = await handleConversationCostRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Tools analytics routes
    if (pathname.startsWith('/api/tools')) {
      const handled = await handleToolsAnalyticsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Dashboard metrics routes
    if (pathname.startsWith('/api/metrics') || pathname.startsWith('/api/cognitive')) {
      const handled = await handleDashboardMetricsRoutes(req, res, pathname);
      if (handled) return;
    }

    // GDPR routes
    if (pathname.startsWith('/api/gdpr')) {
      const handled = await handleGDPRRoutes(req, res, pathname);
      if (handled) return;
    }

    // Trust journey routes
    if (pathname.startsWith('/api/trust-journey')) {
      const handled = await handleTrustJourneyRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Relationship arc routes (Better Than Human system)
    if (pathname.startsWith('/api/relationship')) {
      const handled = await handleRelationshipArcRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Trust export routes
    if (pathname.startsWith('/api/trust-export')) {
      const handled = await handleTrustExportRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Calendar routes
    if (pathname.startsWith('/api/calendar') || pathname.startsWith('/calendar')) {
      const handled = await handleCalendarRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Calendar webhooks (real-time sync from providers)
    if (pathname.startsWith('/webhooks/calendar')) {
      const handled = await handleCalendarWebhookRoutes(req, res, pathname);
      if (handled) return;
    }

    // Practice-Calendar routes (calendar-integrated practices)
    if (pathname.startsWith('/api/practices')) {
      const handled = await handlePracticeCalendarRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Practice View routes (What's Ahead - rich calendar + insights)
    if (pathname.startsWith('/api/practice-view')) {
      const handled = await handlePracticeViewRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Trust systems routes
    if (pathname.startsWith('/api/trust/')) {
      const handled = await handleTrustSystemsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Semantic Intelligence routes (Better Than Human V3)
    if (pathname.startsWith('/api/semantic-intelligence')) {
      const handled = await handleSemanticIntelligenceRoutes(req, res, pathname);
      if (handled) return;
    }

    // Memory routes (Superhuman Memory - feedback, metrics, health)
    if (pathname.startsWith('/api/memory')) {
      const handled = await handleMemoryRoutes(req, res, pathname);
      if (handled) return;
    }

    // Action routes (Activity Dashboard - calls, texts, emails, calendar)
    if (pathname.startsWith('/api/actions')) {
      const handled = await handleActionRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Relationship routes (progress & team-unlocks before health routes)
    if (
      pathname === '/api/relationship/progress' ||
      pathname === '/api/relationship/team-unlocks'
    ) {
      const handled = await handleRelationshipRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    if (pathname.startsWith('/api/relationship/')) {
      const handled = await relationshipHealthRoutes(req, res);
      if (handled) return;
    }

    // Outreach routes
    if (pathname.startsWith('/api/outreach')) {
      const handled = await handleOutreachRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Background results routes (While You Were Away)
    if (pathname.startsWith('/api/background-results')) {
      const handled = await handleBackgroundResultsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Feature flags routes
    if (pathname.startsWith('/api/flags')) {
      const handled = await handleFeatureFlagsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Brand routes
    if (pathname.startsWith('/api/brand')) {
      const handled = await handleBrandRoutes(req, res, pathname);
      if (handled) return;
    }

    // Design tokens routes (public - for dynamic theming)
    if (pathname.startsWith('/api/design-tokens')) {
      const handled = await handleDesignTokensRoutes(req, res, pathname);
      if (handled) return;
    }

    // Landing routes
    if (pathname.startsWith('/api/landing')) {
      if (pathname.startsWith('/api/landing/optimization')) {
        const handled = await handleLandingOptimizationRoutes(req, res, pathname);
        if (handled) return;
      }
      const handled = await handleLandingIntelligenceRoutes(req, res, pathname);
      if (handled) return;
    }

    // Commands routes
    if (pathname.startsWith('/api/commands')) {
      const handled = await handleCommandsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Widget routes
    if (pathname.startsWith('/api/widget')) {
      const handled = await handleWidgetRoutes(req, res, pathname);
      if (handled) return;
    }

    // Monitoring routes
    if (pathname.startsWith('/api/monitoring')) {
      const handled = await handleMonitoringRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Performance routes
    if (pathname.startsWith('/api/performance')) {
      const handled = await handlePerformanceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Concierge routes (AI-powered outreach)
    if (pathname.startsWith('/api/concierge')) {
      const handled = await handleConciergeRoutes(req, res, pathname);
      if (handled) return;
    }

    // Twilio routes (two-way conversational calls)
    if (pathname.startsWith('/api/twilio')) {
      const handled = await handleTwilioRoutes(req, res, pathname);
      if (handled) return;
    }

    // Outbound call routes (conversational calls initiated via API)
    if (pathname.startsWith('/api/outbound-call')) {
      const handled = await handleOutboundCallRoutes(req, res, pathname);
      if (handled) return;
    }

    // Proactive tool suggestions routes
    if (pathname.startsWith('/api/proactive')) {
      const handled = await handleProactiveRoutes(req, res, pathname);
      if (handled) return;
    }

    // Predictions routes (Better Than Human - predictive coaching)
    if (pathname.startsWith('/api/predictions')) {
      const handled = await handlePredictionsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Year in review ("Your Year with Ferni") routes
    if (pathname.startsWith('/api/year-in-review')) {
      const handled = await handleYearInReviewRoutes(req, res, {
        pathname,
        query: Object.fromEntries(new URLSearchParams(parsedUrl.search || '')),
      });
      if (handled) return;
    }

    // LLM content routes (metrics, cache stats, prewarm)
    if (pathname.startsWith('/api/llm-content')) {
      const handled = await handleLLMContentRoutes(req, res, pathname);
      if (handled) return;
    }

    // Voice humanization routes
    if (pathname.startsWith('/api/voice-humanization')) {
      const handled = await handleVoiceHumanizationRoutes(req, res, pathname);
      if (handled) return;
    }

    // Life context routes (Phase 6)
    if (pathname.startsWith('/api/life-context')) {
      const handled = await handleLifeContextRoutes(req, res, pathname);
      if (handled) return;
    }

    // Speech metrics routes
    if (pathname.startsWith('/api/speech-metrics')) {
      const handled = await handleSpeechMetricsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Voice auth routes
    if (pathname.startsWith('/api/voice/')) {
      const handled = await handleVoiceAuthRoutes(req, res, pathname);
      if (handled) return;
    }

    // User routes
    if (pathname.startsWith('/api/user')) {
      const handled = await handleUserRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Waitlist routes
    if (pathname.startsWith('/api/waitlist')) {
      const handled = await handleWaitlistRoutes(req, res);
      if (handled) return;
    }

    // Habit routes
    if (pathname.startsWith('/api/habits')) {
      const handled = await handleHabitRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Garden routes
    if (pathname.startsWith('/api/garden')) {
      const handled = await handleGardenRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Roadmap routes (What's Growing - feature voting, suggestions, seed economy)
    if (pathname.startsWith('/api/roadmap')) {
      const handled = await handleRoadmapRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Crash report routes (frontend crash analytics)
    // Also handles /api/disconnect-diagnostic for client-side disconnect diagnostics
    if (
      pathname.startsWith('/api/crash-report') ||
      pathname.startsWith('/api/disconnect-diagnostic')
    ) {
      const handled = await handleCrashReportRoutes(req, res);
      if (handled) return;
    }

    // Journal routes (Voice Journal / Digital Twin)
    if (pathname.startsWith('/api/journal')) {
      const handled = await handleJournalRoutes(req, res, pathname);
      if (handled) return;
    }

    // Custom agent features routes (share, coaching, tasks, roleplay)
    if (pathname.startsWith('/api/custom-agent-features')) {
      const handled = await handleCustomAgentFeaturesRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Cache management routes (admin only, before general debug routes)
    if (pathname.startsWith('/api/debug/cache')) {
      const handled = await handleCacheRoutes(req, res, pathname);
      if (handled) return;
    }

    // Debug routes (dev mode only)
    if (pathname.startsWith('/api/debug')) {
      const handled = await handleDebugRoutes(req, res, pathname);
      if (handled) return;
    }

    // Marketing routes (Alex's social media management - dogfooding)
    if (pathname.startsWith('/api/marketing')) {
      const handled = await handleMarketingRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // LinkedIn personal profile routes (career awareness, milestones)
    if (pathname.startsWith('/api/linkedin')) {
      const handled = await handleLinkedInRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Seeds routes (Network Effect - referrals, gifts, garden)
    if (pathname.startsWith('/api/seeds')) {
      const handled = await handleSeedsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Sites routes (Agent Page Builder - generate and deploy landing pages)
    if (pathname.startsWith('/api/sites') || pathname.startsWith('/sites/')) {
      const handled = await handleSitesRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Cameo analytics routes
    if (pathname.startsWith('/api/cameo')) {
      const handled = await handleCameoAnalyticsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Wellbeing routes
    if (pathname.startsWith('/api/wellbeing')) {
      const handled = await handleWellbeingRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Rituals routes (daily rituals & streaks)
    if (pathname.startsWith('/api/rituals')) {
      const handled = await handleRitualsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Sky check routes (emotional weather tracking)
    if (pathname.startsWith('/api/sky-check')) {
      const handled = await handleSkyCheckRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Digital Twin profile routes
    if (pathname.startsWith('/api/twin')) {
      const handled = await handleTwinProfileRoutes(req, res, pathname);
      if (handled) return;
    }

    // Your Story dashboard routes (unified immersive data)
    if (pathname.startsWith('/api/your-story')) {
      const handled = await handleYourStoryRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Predictive insights routes
    if (pathname.startsWith('/api/insights')) {
      const userId = (req.headers['x-user-id'] as string) || 'anonymous';
      const handled = await handlePredictiveInsightsRequest(req, res, parsedUrl, userId);
      if (handled) return;
    }

    // Intelligence routes (Better Than Human)
    if (pathname.startsWith('/api/intelligence')) {
      const handled = await handleIntelligenceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Session context routes (Voice ↔ App sync - Better Than Human)
    if (pathname.startsWith('/api/context')) {
      const { handleSessionContextRoute } = await import('../../api/routes/session-context.js');
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
      if (handled) return;
    }

    // Scheduled jobs routes
    if (pathname.startsWith('/api/jobs')) {
      const handled = await handleScheduledJobsRoutes(req, res, pathname);
      if (handled) return;
    }

    // EvalOps routes
    if (pathname.startsWith('/api/evalops')) {
      const handled = await handleEvalOpsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Household routes
    if (pathname.startsWith('/api/household')) {
      const handled = await handleHouseholdRoutes(req, res, pathname);
      if (handled) return;
    }

    // Contacts routes (contact management, groups, nudges)
    if (pathname.startsWith('/api/contacts')) {
      const handled = await handleContactsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Gift tracking routes (gifts given/received, suggestions, analytics)
    if (pathname.startsWith('/api/gifts')) {
      const handled = await handleGiftRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Story journey routes
    if (pathname.startsWith('/api/story-journey')) {
      const handled = await handleStoryJourneyRoutes(req, res, pathname);
      if (handled) return;
    }

    // Analytics routes
    if (pathname.startsWith('/api/analytics')) {
      const handled = await handleAnalyticsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Builder metrics routes
    if (pathname.startsWith('/api/admin/builder-metrics')) {
      const handled = await handleBuilderMetricsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Session analytics routes (admin - sessions, quality, persona bonds, intents)
    if (pathname.startsWith('/api/admin/analytics')) {
      const handled = await handleSessionAnalyticsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Batch operations routes (admin - bulk indexing, cleanup)
    if (pathname.startsWith('/api/admin/batch')) {
      const handled = await handleBatchOperationsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Webhook management routes (admin - create, update, test webhooks)
    if (pathname.startsWith('/api/admin/webhooks')) {
      const handled = await handleWebhookManagementRoutes(req, res, pathname);
      if (handled) return;
    }

    // Music analytics admin routes
    if (pathname.startsWith('/api/admin/music-analytics')) {
      const handled = await handleMusicAnalyticsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Subscription routes
    if (isSubscriptionRoute(pathname)) {
      try {
        // Skip auth for webhooks (they use signature verification)
        const isWebhook = pathname.endsWith('/webhook');

        // SECURITY: Get authenticated user for IDOR protection
        // Webhooks don't need auth (they use Stripe signature verification)
        let authUserId: string | undefined;
        let isAdmin = false;
        if (!isWebhook) {
          const auth = await optionalAuthAsync(req);
          if (auth) {
            authUserId = auth.userId;
            isAdmin = auth.isAdmin;
          }
        }

        let body: unknown = undefined;

        if (req.method === 'POST' || req.method === 'PUT') {
          // Use parseRawBody to avoid race condition with async auth check
          // Also adds timeout, max size limit, and proper error handling
          const rawBody = await parseRawBody(req, { timeoutMs: 30000, maxBytes: 1024 * 1024 });

          if (isWebhook) {
            // Webhooks need raw body for signature verification
            body = rawBody;
          } else {
            try {
              body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              body = rawBody;
            }
          }
        }

        const ctx = {
          method: req.method || 'GET',
          pathname,
          query: Object.fromEntries(parsedUrl.searchParams),
          body,
          headers: req.headers,
          // SECURITY: Pass authenticated user to prevent IDOR attacks
          authUserId,
          isAdmin,
        };

        const response = await handleSubscriptionRequest(ctx);
        res.writeHead(response.status, response.headers);
        res.end(JSON.stringify(response.body));
        return;
      } catch (err) {
        log.error({ error: String(err) }, 'Subscription route error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }
    }

    // Monetization routes
    if (isMonetizationRoute(pathname)) {
      try {
        // SECURITY: Get authenticated user for IDOR protection
        let authUserId: string | undefined;
        let isAdmin = false;
        const auth = await optionalAuthAsync(req);
        if (auth) {
          authUserId = auth.userId;
          isAdmin = auth.isAdmin;
        }

        let body: unknown = undefined;

        if (req.method === 'POST' || req.method === 'PUT') {
          // Use parseRawBody to avoid race condition with async auth check
          // Also adds timeout, max size limit, and proper error handling
          const rawBody = await parseRawBody(req, { timeoutMs: 30000, maxBytes: 1024 * 1024 });
          try {
            body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            body = {};
          }
        }

        const ctx = {
          method: req.method || 'GET',
          pathname,
          query: Object.fromEntries(parsedUrl.searchParams),
          body,
          headers: req.headers,
          // SECURITY: Pass authenticated user to prevent IDOR attacks
          authUserId,
          isAdmin,
        };

        const response = await handleMonetizationRequest(ctx);
        res.writeHead(response.status, response.headers);
        res.end(JSON.stringify(response.body));
        return;
      } catch (err) {
        log.error({ error: String(err) }, 'Monetization route error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }
    }

    // Apple IAP routes
    if (isAppleRoute(pathname)) {
      try {
        const handled = await handleAppleRoutes(req, res);
        if (handled) return;
      } catch (err) {
        log.error({ error: String(err) }, 'Apple IAP route error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }
    }
  } catch (err) {
    log.error({ error: String(err) }, 'API route error');
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // ============================================================================
  // STATIC FILES (fallback)
  // ============================================================================
  handleStaticRoutes(req, res, pathname);
});

// Harden server with DDoS protection
hardenServer(server);

// Initialize WebSocket servers for real-time streaming
// Both use noServer:true pattern with manual upgrade routing to avoid conflicts
initInsightsWebSocket(server);
log.info('Insights WebSocket server initialized on /ws/insights');

// Initialize WebSocket server for life context (Phase 6)
// Now enabled: Uses noServer:true pattern with path-based upgrade routing
initLifeContextWebSocket(server);
log.info('Life Context WebSocket server initialized on /ws/life-context');

// Register DDoS alerting to Slack
registerDDoSAlertCallback(async (details) => {
  await notifyDDoSAlert(details);
});

// Start automatic DDoS monitoring
const stopDDoSMonitoring = startDDoSMonitoring('ui-server', 30_000);

// Start the server
server.listen(PORT, '0.0.0.0', async () => {
  log.info(
    {
      port: PORT,
      livekitUrl: LIVEKIT_URL,
      ddosProtection: true,
    },
    'UI Server started'
  );

  // Start Spotify token auto-refresh
  startSpotifyAutoRefresh();

  // Start Calendar real-time sync services
  try {
    // Apple Calendar polling (CalDAV doesn't support webhooks)
    await loadApplePollingUsers();
    startApplePolling();
    log.info('🍎 Apple Calendar polling service started');

    // Google Calendar webhook renewal (watches expire after 7 days)
    startGoogleWebhookRenewal();
    log.info('📅 Google Calendar webhook renewal service started');

    // Outlook subscription renewal (subscriptions expire after hours)
    startOutlookSubscriptionRenewal();
    log.info('📧 Outlook Calendar subscription renewal service started');
  } catch (error) {
    log.warn({ error: String(error) }, 'Calendar sync services failed to start (non-blocking)');
  }

  // Start proactive outreach scheduler ("Better Than Human" - thinking of you moments)
  try {
    await loadPendingOutreach();
    startProactiveScheduler();
    log.info('💭 Proactive outreach scheduler started');
  } catch (error) {
    log.warn({ error: String(error) }, 'Proactive scheduler failed to start (non-blocking)');
  }

  // Initialize Twilio Stream Bridge for two-way conversational calls
  // In production (Cloud Run), attach to the main HTTP server on /stream path
  // In development, use a separate port if TWILIO_STREAM_PORT is set
  try {
    const twilioStreamPort = process.env.TWILIO_STREAM_PORT;

    if (twilioStreamPort) {
      // Development mode: Use separate port
      initializeTwilioStreamBridge(parseInt(twilioStreamPort, 10));
      log.info({ port: twilioStreamPort }, '📞 Twilio Stream Bridge initialized (standalone)');
    } else {
      // Production mode: Attach to main HTTP server
      attachTwilioStreamBridgeToServer(server, '/stream');
      log.info({ path: '/stream' }, '📞 Twilio Stream Bridge initialized (attached)');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Twilio Stream Bridge failed to start (non-blocking)');
  }
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Gracefully shutdown all services
 */
async function gracefulShutdown(): Promise<void> {
  log.info('Initiating graceful shutdown...');

  // Stop accepting new connections
  server.close();

  // Stop DDoS monitoring
  stopDDoSMonitoring();

  // Shutdown WebSocket servers first
  shutdownInsightsWebSocket();
  shutdownLifeContextWebSocket();

  // Stop proactive scheduler
  stopProactiveScheduler();

  // Shutdown all services in parallel (except persistence)
  try {
    await Promise.all([
      shutdownSpotify(),
      shutdownPlaid(),
      shutdownDemoSessions(),
      shutdownTokenRoutes(),
      shutdownGoogleCalendar(),
      shutdownSpotifyOAuth(),
      shutdownApplePolling(),
    ]);
    log.info('Services shutdown complete');

    // Shutdown persistence LAST - allows other services to persist final state
    await shutdownPersistence();
    log.info('Persistence shutdown complete');
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Error during shutdown');
  }

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => {
  log.info('Received SIGTERM, shutting down gracefully...');
  gracefulShutdown().catch((err) => {
    log.error({ error: (err as Error).message }, 'Shutdown error');
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  log.info('Received SIGINT, shutting down gracefully...');
  gracefulShutdown().catch((err) => {
    log.error({ error: (err as Error).message }, 'Shutdown error');
    process.exit(1);
  });
});

// Export for gateway
export { server, gracefulShutdown };
export { stopDDoSMonitoring };
