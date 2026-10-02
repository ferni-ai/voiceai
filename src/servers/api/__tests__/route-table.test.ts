/**
 * UI Server Route Table Snapshot
 *
 * The UI server (`src/servers/api/index.ts`) dispatches requests through an
 * ordered chain of `if (pathname...)` guards rather than a router object, so
 * there is no route list to introspect. This test reconstructs the route table
 * behaviourally instead:
 *
 * 1. Every module the server wires in is mocked. Each mocked handler records
 *    its call (name + argument shapes) and reports "not handled", so a request
 *    walks the whole chain and the trace shows exactly which guards matched,
 *    in which order, and with which arguments.
 * 2. A probe request is sent for every path prefix the server knows about
 *    (plus preflight, subdomain, body-parsing and early-exit cases).
 * 3. Each route handler is then made to throw, to pin down which error
 *    boundary (log message + 500 response shape) wraps it.
 * 4. Module-load wiring, the listen callback and graceful shutdown are traced.
 *
 * The output is compared byte-for-byte with `__snapshots__/route-table.snap.txt`.
 * Any change to route order, guards, middleware order, error handling or
 * startup/shutdown wiring shows up as a snapshot diff. If a change is
 * intentional, re-run with `-u` and review the diff.
 *
 * When a new module is wired into the server, add a `vi.mock` for it below.
 */

import { Readable } from 'stream';
import { setImmediate as nextMacrotask } from 'timers/promises';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

const h = vi.hoisted(() => {
  const events: string[] = [];
  const state: {
    req: unknown;
    res: unknown;
    throwTarget: string | null;
    stopAt: string | null;
    requestHandler: ((req: unknown, res: unknown) => unknown) | null;
    listenCallback: (() => unknown) | null;
  } = {
    req: null,
    res: null,
    throwTarget: null,
    stopAt: null,
    requestHandler: null,
    listenCallback: null,
  };

  const PREDICATES: Record<string, (p: string) => boolean> = {
    isFeedbackRoute: (p) => p.startsWith('/api/feedback'),
    isSubscriptionRoute: (p) => p.startsWith('/api/subscription') || p.startsWith('/subscription'),
    isMonetizationRoute: (p) => p.startsWith('/api/monetization'),
    isAppleRoute: (p) => p.startsWith('/api/apple/iap'),
    isSensitiveMemoryRoute: (p) =>
      ['/api/memory/me/consent', '/api/memory/me/health', '/api/memory/me/mood'].some(
        (x) => p === x || p.startsWith(`${x}/`)
      ),
    isImportantDatesRoute: (p) =>
      p === '/api/memory/me/dates' ||
      p.startsWith('/api/memory/me/dates/') ||
      p === '/api/memory/me/reminder-settings',
  };

  function shape(value: unknown, depth = 0): string {
    if (state.req !== null && value === state.req) return 'req';
    if (state.res !== null && value === state.res) return 'res';
    if (
      state.req !== null &&
      value === (state.req as { headers?: unknown }).headers &&
      value !== undefined
    ) {
      return 'req.headers';
    }
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (value instanceof URL) return `URL(${value.pathname}${value.search})`;
    if (value instanceof URLSearchParams) return `Query(${value.toString()})`;
    if (typeof value === 'function') return 'fn';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (depth > 2) return '{...}';
    if (Array.isArray(value)) return `[${value.map((v) => shape(v, depth + 1)).join(', ')}]`;
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${shape(v, depth + 1)}`
    );
    return `{ ${entries.join(', ')} }`;
  }

  function record(kind: string, label: string, args: unknown[]): void {
    events.push(`${kind} ${label}(${args.map((a) => shape(a)).join(', ')})`);
  }

  function auto(label: string): unknown {
    const name = label.split('#')[1] ?? label;

    if (name in PREDICATES) {
      return (pathname: string) => {
        const result = PREDICATES[name](pathname);
        events.push(`pred ${label}(${JSON.stringify(pathname)}) -> ${String(result)}`);
        return result;
      };
    }

    if (name === 'handleSubscriptionRequest' || name === 'handleMonetizationRequest') {
      return async (...args: unknown[]) => {
        record('route', label, args);
        if (state.throwTarget === label) throw new Error(`probe failure in ${label}`);
        return {
          status: 299,
          headers: { 'Content-Type': 'application/json', 'X-Probe': label },
          body: { probe: label },
        };
      };
    }

    if (name === 'groupConversationRoutes') {
      return { router: label };
    }

    if (name === 'handleStaticRoutes') {
      return (...args: unknown[]) => {
        record('static', label, args);
      };
    }

    if (
      name.startsWith('handle') ||
      name === 'relationshipHealthRoutes' ||
      name === 'familyRouter' ||
      name === 'default'
    ) {
      return async (...args: unknown[]) => {
        record('route', label, args);
        if (state.throwTarget === label) throw new Error(`probe failure in ${label}`);
        return false;
      };
    }

    // Lifecycle function (start/stop/init/shutdown/...)
    return (...args: unknown[]) => {
      record('life', label, args);
      return undefined;
    };
  }

  function middleware(label: string, result?: (args: unknown[]) => unknown): unknown {
    return (...args: unknown[]) => {
      record('mw', label, args);
      if (state.stopAt === label) return true;
      return result ? result(args) : undefined;
    };
  }

  function logger(module: string): Record<string, (...args: unknown[]) => void> {
    const make =
      (level: string) =>
      (...args: unknown[]): void => {
        events.push(`log.${level}[${module}] ${args.map((a) => shape(a)).join(' ')}`);
      };
    const log: Record<string, (...args: unknown[]) => void> = {
      trace: make('trace'),
      debug: make('debug'),
      info: make('info'),
      warn: make('warn'),
      error: make('error'),
      fatal: make('fatal'),
    };
    return log;
  }

  return { events, state, shape, record, auto, middleware, logger };
});

// ============================================================================
// INFRASTRUCTURE MOCKS
// ============================================================================

vi.mock('dotenv/config', () => ({}));

vi.mock('http', () => {
  const createServer = (handler: (req: unknown, res: unknown) => unknown) => {
    h.state.requestHandler = handler;
    h.events.push('life http.createServer(fn)');
    return {
      probeServer: true,
      listen: (...args: unknown[]) => {
        const cb = args.find((a) => typeof a === 'function') as (() => unknown) | undefined;
        h.state.listenCallback = cb ?? null;
        h.record(
          'life',
          'server.listen',
          args.filter((a) => typeof a !== 'function')
        );
      },
      close: (...args: unknown[]) => {
        h.record('life', 'server.close', args);
      },
    };
  };
  return { default: { createServer }, createServer };
});

vi.mock('express', () => {
  const factory = () => {
    const app = (...args: unknown[]) => {
      h.record('route', 'express#app', args.slice(0, 2));
      const next = args[2];
      if (typeof next === 'function') next();
    };
    app.use = (...args: unknown[]) => {
      h.record('route', 'express#app.use', args);
    };
    return app;
  };
  return { default: factory };
});

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: (opts: unknown) => {
    const module =
      typeof opts === 'string' ? opts : String((opts as { module?: string })?.module ?? '');
    return h.logger(module);
  },
}));

vi.mock('../../shared/cors.js', () => ({
  setCorsHeaders: h.middleware('cors#setCorsHeaders'),
  handleCorsPreflightRequest: h.middleware('cors#handleCorsPreflightRequest', (args) => {
    const res = args[1] as { writeHead: (s: number) => void; end: () => void };
    res.writeHead(204);
    res.end();
  }),
}));

vi.mock('../../shared/security-headers.js', () => ({
  setSecurityHeaders: h.middleware('security-headers#setSecurityHeaders'),
}));

vi.mock('../../../utils/ddos-protection.js', () => ({
  addRequestId: h.middleware('ddos-protection#addRequestId'),
  handleHealthEndpoint: h.middleware('ddos-protection#handleHealthEndpoint', () => false),
  handleSecurityMonitoring: h.middleware('ddos-protection#handleSecurityMonitoring', () => false),
  hardenServer: h.auto('ddos-protection#hardenServer'),
  registerDDoSAlertCallback: h.auto('ddos-protection#registerDDoSAlertCallback'),
  startDDoSMonitoring: (...args: unknown[]) => {
    h.record('life', 'ddos-protection#startDDoSMonitoring', args);
    return () => {
      h.events.push('life ddos-protection#stopDDoSMonitoring()');
    };
  },
}));

vi.mock('../../../api/auth-middleware.js', () => ({
  rateLimit: h.middleware('auth-middleware#rateLimit', () => false),
  optionalAuthAsync: h.middleware('auth-middleware#optionalAuthAsync', () =>
    Promise.resolve({ userId: 'probe-user', isAdmin: true })
  ),
}));

vi.mock('../../../api/identity-guard.js', () => ({
  enforceVerifiedIdentity: h.middleware('identity-guard#enforceVerifiedIdentity', () =>
    Promise.resolve()
  ),
}));

vi.mock('../../../api/helpers.js', () => ({
  parseRawBody: h.middleware('helpers#parseRawBody', () => Promise.resolve('{"probe":true}')),
}));

// Dynamically imported inside the request handler
vi.mock('../../../api/routes/marketplace-admin.js', () => ({
  handleMarketplaceAdminRoutes: h.auto('marketplace-admin#handleMarketplaceAdminRoutes'),
}));
vi.mock('../../../api/routes/session-context.js', () => ({
  handleSessionContextRoute: h.auto('session-context#handleSessionContextRoute'),
}));

// ============================================================================
// ROUTE / SERVICE MOCKS (one per module wired into the server)
// ============================================================================

vi.mock('../../../services/slack-notifications.js', () => ({
  notifyDDoSAlert: h.auto('services/slack-notifications#notifyDDoSAlert'),
}));
vi.mock('../routes/index.js', () => ({
  handlePlaidRoutes: h.auto('routes/index#handlePlaidRoutes'),
  handleSpotifyRoutes: h.auto('routes/index#handleSpotifyRoutes'),
  handleHealthRoutes: h.auto('routes/index#handleHealthRoutes'),
  handleTokenRoutes: h.auto('routes/index#handleTokenRoutes'),
  handleGoogleCalendarRoutes: h.auto('routes/index#handleGoogleCalendarRoutes'),
  handleAppleCalendarRoutes: h.auto('routes/index#handleAppleCalendarRoutes'),
  handleMicrosoftCalendarRoutes: h.auto('routes/index#handleMicrosoftCalendarRoutes'),
  handleMusicRoutes: h.auto('routes/index#handleMusicRoutes'),
  handleAgentRoutes: h.auto('routes/index#handleAgentRoutes'),
  handlePushRoutes: h.auto('routes/index#handlePushRoutes'),
  handleWebhookRoutes: h.auto('routes/index#handleWebhookRoutes'),
  handleSpotifyRoomsRoutes: h.auto('routes/index#handleSpotifyRoomsRoutes'),
  handleSpotifyPlaybackRoutes: h.auto('routes/index#handleSpotifyPlaybackRoutes'),
  handleEcobeeRoutes: h.auto('routes/index#handleEcobeeRoutes'),
  handleSmartHomeRoutes: h.auto('routes/index#handleSmartHomeRoutes'),
  handleVibeRoutes: h.auto('routes/index#handleVibeRoutes'),
  handleEightSleepRoutes: h.auto('routes/index#handleEightSleepRoutes'),
  handleOuraRoutes: h.auto('routes/index#handleOuraRoutes'),
  handleAppleHealthRoutes: h.auto('routes/index#handleAppleHealthRoutes'),
  handleAppleNotification: h.auto('routes/index#handleAppleNotification'),
  handleIntelligentRoutingRoutes: h.auto('routes/index#handleIntelligentRoutingRoutes'),
  handleVisualMemoryRoutes: h.auto('routes/index#handleVisualMemoryRoutes'),
  handleAmbientModeRoutes: h.auto('routes/index#handleAmbientModeRoutes'),
  handleBTHIntelligenceRoutes: h.auto('routes/index#handleBTHIntelligenceRoutes'),
  handleWearablesRoutes: h.auto('routes/index#handleWearablesRoutes'),
  shutdownWearablesRoutes: h.auto('routes/index#shutdownWearablesRoutes'),
}));
vi.mock('../static.js', () => ({
  handleStaticRoutes: h.auto('./static#handleStaticRoutes'),
  serveStaticFile: h.auto('./static#serveStaticFile'),
}));
vi.mock('../services/spotify.js', () => ({
  startAutoRefresh: h.auto('services/spotify#startAutoRefresh'),
  shutdown: h.auto('services/spotify#shutdown'),
}));
vi.mock('../services/plaid.js', () => ({
  shutdown: h.auto('services/plaid#shutdown'),
}));
vi.mock('../services/demo-sessions.js', () => ({
  shutdown: h.auto('services/demo-sessions#shutdown'),
}));
vi.mock('../routes/token.js', () => ({
  shutdown: h.auto('routes/token#shutdown'),
}));
vi.mock('../../token/oauth/google-calendar.js', () => ({
  shutdown: h.auto('oauth/google-calendar#shutdown'),
}));
vi.mock('../../token/oauth/spotify.js', () => ({
  shutdown: h.auto('oauth/spotify#shutdown'),
}));
vi.mock('../../../services/persistence/index.js', () => ({
  shutdownPersistence: h.auto('persistence/index#shutdownPersistence'),
}));
vi.mock('../../../services/calendar/polling/apple-polling.js', () => ({
  startPolling: h.auto('polling/apple-polling#startPolling'),
  loadRegisteredUsers: h.auto('polling/apple-polling#loadRegisteredUsers'),
  stopPolling: h.auto('polling/apple-polling#stopPolling'),
}));
vi.mock('../../../services/outreach/proactive-scheduler.js', () => ({
  startScheduler: h.auto('outreach/proactive-scheduler#startScheduler'),
  stopScheduler: h.auto('outreach/proactive-scheduler#stopScheduler'),
  loadPendingOutreach: h.auto('outreach/proactive-scheduler#loadPendingOutreach'),
}));
vi.mock('../../../services/calendar/webhooks/google-webhook.js', () => ({
  renewExpiringChannels: h.auto('webhooks/google-webhook#renewExpiringChannels'),
}));
vi.mock('../../../services/calendar/webhooks/outlook-webhook.js', () => ({
  renewExpiringSubscriptions: h.auto('webhooks/outlook-webhook#renewExpiringSubscriptions'),
}));
vi.mock('../../../api/engagement-routes.js', () => ({
  handleEngagementRoutes: h.auto('api/engagement-routes#handleEngagementRoutes'),
}));
vi.mock('../../../api/group-call-webhooks.js', () => ({
  handleGroupCallWebhooks: h.auto('api/group-call-webhooks#handleGroupCallWebhooks'),
}));
vi.mock('../../../api/practice-routes.js', () => ({
  handlePracticeRoutes: h.auto('api/practice-routes#handlePracticeRoutes'),
}));
vi.mock('../../../api/routes/family.js', () => ({
  familyRouter: h.auto('routes/family#familyRouter'),
}));
vi.mock('../../../api/routes/family-checkin-control.js', () => ({
  handleFamilyCheckinControl: h.auto('routes/family-checkin-control#handleFamilyCheckinControl'),
}));
vi.mock('../routes/health-sync.js', () => ({
  handleHealthSyncRoutes: h.auto('routes/health-sync#handleHealthSyncRoutes'),
}));
vi.mock('../../../api/handoff-diagnostics.js', () => ({
  handleDiagnosticsRoutes: h.auto('api/handoff-diagnostics#handleDiagnosticsRoutes'),
}));
vi.mock('../../../api/dashboard-metrics-routes.js', () => ({
  handleDashboardMetricsRoutes: h.auto('api/dashboard-metrics-routes#handleDashboardMetricsRoutes'),
}));
vi.mock('../../../api/dora-routes.js', () => ({
  handleDORARoutes: h.auto('api/dora-routes#handleDORARoutes'),
}));
vi.mock('../../../api/observability-routes.js', () => ({
  handleObservabilityRoutes: h.auto('api/observability-routes#handleObservabilityRoutes'),
}));
vi.mock('../../../services/observability/routing-metrics.js', () => ({
  handleFTISRoutes: h.auto('observability/routing-metrics#handleFTISRoutes'),
}));
vi.mock('../../../api/tools-analytics-routes.js', () => ({
  handleToolsAnalyticsRoutes: h.auto('api/tools-analytics-routes#handleToolsAnalyticsRoutes'),
}));
vi.mock('../../../api/chat-routes.js', () => ({
  handleChatRoutes: h.auto('api/chat-routes#handleChatRoutes'),
}));
vi.mock('../../../api/voice-presence-routes.js', () => ({
  handleVoicePresenceRoutes: h.auto('api/voice-presence-routes#handleVoicePresenceRoutes'),
}));
vi.mock('../../../api/outreach.routes.js', () => ({
  handleOutreachRoutes: h.auto('api/outreach.routes#handleOutreachRoutes'),
}));
vi.mock('../../../api/background-results-routes.js', () => ({
  handleBackgroundResultsRoutes: h.auto(
    'api/background-results-routes#handleBackgroundResultsRoutes'
  ),
}));
vi.mock('../../../api/gdpr-routes.js', () => ({
  handleGDPRRoutes: h.auto('api/gdpr-routes#handleGDPRRoutes'),
}));
vi.mock('../../../api/trust-export-routes.js', () => ({
  handleTrustExportRoutes: h.auto('api/trust-export-routes#handleTrustExportRoutes'),
}));
vi.mock('../../../api/trust-journey-routes.js', () => ({
  handleTrustJourneyRoutes: h.auto('api/trust-journey-routes#handleTrustJourneyRoutes'),
}));
vi.mock('../../../api/calendar-routes.js', () => ({
  handleCalendarRoutes: h.auto('api/calendar-routes#handleCalendarRoutes'),
}));
vi.mock('../../../api/trust-systems-routes.js', () => ({
  handleTrustSystemsRoutes: h.auto('api/trust-systems-routes#handleTrustSystemsRoutes'),
}));
vi.mock('../../../api/relationship-arc-routes.js', () => ({
  handleRelationshipArcRoutes: h.auto('api/relationship-arc-routes#handleRelationshipArcRoutes'),
}));
vi.mock('../../../api/feature-flags-routes.js', () => ({
  handleFeatureFlagsRoutes: h.auto('api/feature-flags-routes#handleFeatureFlagsRoutes'),
}));
vi.mock('../../../api/feedback-routes.js', () => ({
  handleFeedbackRoutes: h.auto('api/feedback-routes#handleFeedbackRoutes'),
  isFeedbackRoute: h.auto('api/feedback-routes#isFeedbackRoute'),
}));
vi.mock('../../../api/brand-routes.js', () => ({
  handleBrandRoutes: h.auto('api/brand-routes#handleBrandRoutes'),
}));
vi.mock('../../../api/commands-routes.js', () => ({
  handleCommandsRoutes: h.auto('api/commands-routes#handleCommandsRoutes'),
}));
vi.mock('../../../api/widget-routes.js', () => ({
  handleWidgetRoutes: h.auto('api/widget-routes#handleWidgetRoutes'),
}));
vi.mock('../../../api/monitoring-routes.js', () => ({
  handleMonitoringRoutes: h.auto('api/monitoring-routes#handleMonitoringRoutes'),
}));
vi.mock('../../../api/performance-routes.js', () => ({
  handlePerformanceRoutes: h.auto('api/performance-routes#handlePerformanceRoutes'),
}));
vi.mock('../../../api/concierge-routes.js', () => ({
  handleConciergeRoutes: h.auto('api/concierge-routes#handleConciergeRoutes'),
}));
vi.mock('../../../api/proactive-routes.js', () => ({
  handleProactiveRoutes: h.auto('api/proactive-routes#handleProactiveRoutes'),
}));
vi.mock('../../../api/routes/predictions.js', () => ({
  handlePredictionsRoutes: h.auto('routes/predictions#handlePredictionsRoutes'),
}));
vi.mock('../../../api/llm-content-routes.js', () => ({
  handleLLMContentRoutes: h.auto('api/llm-content-routes#handleLLMContentRoutes'),
}));
vi.mock('../../../api/routes/relationship-health-routes.js', () => ({
  relationshipHealthRoutes: h.auto('routes/relationship-health-routes#relationshipHealthRoutes'),
}));
vi.mock('../../../api/year-in-review-routes.js', () => ({
  handleYearInReviewRoutes: h.auto('api/year-in-review-routes#handleYearInReviewRoutes'),
}));
vi.mock('../../../api/routes/relationship.js', () => ({
  handleRelationshipRoutes: h.auto('routes/relationship#handleRelationshipRoutes'),
}));
vi.mock('../../../api/voice-humanization-routes.js', () => ({
  handleVoiceHumanizationRoutes: h.auto(
    'api/voice-humanization-routes#handleVoiceHumanizationRoutes'
  ),
}));
vi.mock('../../../api/life-context-routes.js', () => ({
  handleLifeContextRoutes: h.auto('api/life-context-routes#handleLifeContextRoutes'),
}));
vi.mock('../../../api/speech-metrics-routes.js', () => ({
  handleSpeechMetricsRoutes: h.auto('api/speech-metrics-routes#handleSpeechMetricsRoutes'),
}));
vi.mock('../../../api/voice-auth.routes.js', () => ({
  handleVoiceAuthRoutes: h.auto('api/voice-auth.routes#handleVoiceAuthRoutes'),
}));
vi.mock('../../../api/sponsored-identity-routes.js', () => ({
  handleSponsoredIdentityRoutes: h.auto(
    'api/sponsored-identity-routes#handleSponsoredIdentityRoutes'
  ),
}));
vi.mock('../../../api/user-routes.js', () => ({
  handleUserRoutes: h.auto('api/user-routes#handleUserRoutes'),
}));
vi.mock('../../../api/waitlist-routes.js', () => ({
  handleWaitlistRoutes: h.auto('api/waitlist-routes#handleWaitlistRoutes'),
}));
vi.mock('../../../api/habit-routes.js', () => ({
  handleHabitRoutes: h.auto('api/habit-routes#handleHabitRoutes'),
}));
vi.mock('../../../api/wellbeing.routes.js', () => ({
  handleWellbeingRoutes: h.auto('api/wellbeing.routes#handleWellbeingRoutes'),
}));
vi.mock('../../../api/your-story-routes.js', () => ({
  handleYourStoryRoutes: h.auto('api/your-story-routes#handleYourStoryRoutes'),
}));
vi.mock('../../../api/predictive-insights-routes.js', () => ({
  handlePredictiveInsightsRequest: h.auto(
    'api/predictive-insights-routes#handlePredictiveInsightsRequest'
  ),
}));
vi.mock('../../../api/routes/intelligence-routes.js', () => ({
  handleIntelligenceRoutes: h.auto('routes/intelligence-routes#handleIntelligenceRoutes'),
}));
vi.mock('../../../api/routes/team-insights.js', () => ({
  handleTeamInsightsRoutes: h.auto('routes/team-insights#handleTeamInsightsRoutes'),
}));
vi.mock('../../../api/routes/commitments.js', () => ({
  handleCommitmentsRoutes: h.auto('routes/commitments#handleCommitmentsRoutes'),
}));
vi.mock('../../../api/routes/conversation-threads.js', () => ({
  handleConversationThreadsRoutes: h.auto(
    'routes/conversation-threads#handleConversationThreadsRoutes'
  ),
}));
vi.mock('../../../api/routes/conversations.js', () => ({
  handleConversationsRoutes: h.auto('routes/conversations#handleConversationsRoutes'),
}));
vi.mock('../../../api/routes/group-coaching.js', () => ({
  handleGroupCoachingRoutes: h.auto('routes/group-coaching#handleGroupCoachingRoutes'),
}));
vi.mock('../../../api/routes/growth.js', () => ({
  handleGrowthRoutes: h.auto('routes/growth#handleGrowthRoutes'),
}));
vi.mock('../../../api/routes/video-sessions.js', () => ({
  handleVideoSessionRoutes: h.auto('routes/video-sessions#handleVideoSessionRoutes'),
}));
vi.mock('../../../api/routes/wearable.js', () => ({
  handleWearableRoutes: h.auto('routes/wearable#handleWearableRoutes'),
}));
vi.mock('../../../api/routes/memories.js', () => ({
  handleMemoriesRoutes: h.auto('routes/memories#handleMemoriesRoutes'),
}));
vi.mock('../../../api/routes/marketplace-reviews.js', () => ({
  handleReviewsRoutes: h.auto('routes/marketplace-reviews#handleReviewsRoutes'),
}));
vi.mock('../../../api/routes/landing-ai.js', () => ({
  handleLandingAIRoutes: h.auto('routes/landing-ai#handleLandingAIRoutes'),
}));
vi.mock('../../../api/sanctuary-routes.js', () => ({
  handleSanctuaryRoutes: h.auto('api/sanctuary-routes#handleSanctuaryRoutes'),
}));
vi.mock('../../../api/scheduled-jobs.routes.js', () => ({
  handleScheduledJobsRoutes: h.auto('api/scheduled-jobs.routes#handleScheduledJobsRoutes'),
}));
vi.mock('../../../api/evalops.routes.js', () => ({
  handleEvalOpsRoutes: h.auto('api/evalops.routes#handleEvalOpsRoutes'),
}));
vi.mock('../../../api/household-routes.js', () => ({
  handleHouseholdRoutes: h.auto('api/household-routes#handleHouseholdRoutes'),
}));
vi.mock('../../../api/contacts-routes.js', () => ({
  handleContactsRoutes: h.auto('api/contacts-routes#handleContactsRoutes'),
}));
vi.mock('../../../api/gift-routes.js', () => ({
  handleGiftRoutes: h.auto('api/gift-routes#handleGiftRoutes'),
}));
vi.mock('../../../api/story-journey-routes.js', () => ({
  handleStoryJourneyRoutes: h.auto('api/story-journey-routes#handleStoryJourneyRoutes'),
}));
vi.mock('../../../api/story-routes.js', () => ({
  handleStoryRoutes: h.auto('api/story-routes#handleStoryRoutes'),
}));
vi.mock('../../../api/user-events-routes.js', () => ({
  handleUserEventsRoutes: h.auto('api/user-events-routes#handleUserEventsRoutes'),
}));
vi.mock('../../../api/subscription-routes.js', () => ({
  handleSubscriptionRequest: h.auto('api/subscription-routes#handleSubscriptionRequest'),
  isSubscriptionRoute: h.auto('api/subscription-routes#isSubscriptionRoute'),
}));
vi.mock('../../../api/user-analytics-routes.js', () => ({
  handleAnalyticsRoutes: h.auto('api/user-analytics-routes#handleAnalyticsRoutes'),
}));
vi.mock('../../../api/routes/builder-metrics.js', () => ({
  handleBuilderMetricsRoutes: h.auto('routes/builder-metrics#handleBuilderMetricsRoutes'),
}));
vi.mock('../../../api/music-analytics-routes.js', () => ({
  handleMusicAnalyticsRoutes: h.auto('api/music-analytics-routes#handleMusicAnalyticsRoutes'),
}));
vi.mock('../../../api/admin-routes.js', () => ({
  handleAdminRoutes: h.auto('api/admin-routes#handleAdminRoutes'),
}));
vi.mock('../../../api/monetization-routes.js', () => ({
  handleMonetizationRequest: h.auto('api/monetization-routes#handleMonetizationRequest'),
  isMonetizationRoute: h.auto('api/monetization-routes#isMonetizationRoute'),
}));
vi.mock('../../../api/apple-iap-routes.js', () => ({
  handleAppleRoutes: h.auto('api/apple-iap-routes#handleAppleRoutes'),
  isAppleRoute: h.auto('api/apple-iap-routes#isAppleRoute'),
}));
vi.mock('../../../api/v1/index.js', () => ({
  handleV1Routes: h.auto('v1/index#handleV1Routes'),
}));
vi.mock('../../../api/v2/index.js', () => ({
  handleV2Routes: h.auto('v2/index#handleV2Routes'),
}));
vi.mock('../../../api/migration-routes.js', () => ({
  default: h.auto('api/migration-routes#default'),
}));
vi.mock('../../../api/identity-link-routes.js', () => ({
  default: h.auto('api/identity-link-routes#default'),
}));
vi.mock('../../../api/account-routes.js', () => ({
  default: h.auto('api/account-routes#default'),
}));
vi.mock('../../../api/auth-monitoring-routes.js', () => ({
  default: h.auto('api/auth-monitoring-routes#default'),
}));
vi.mock('../../../api/session-accent-routes.js', () => ({
  default: h.auto('api/session-accent-routes#default'),
}));
vi.mock('../../../api/landing-intelligence.routes.js', () => ({
  handleLandingIntelligenceRoutes: h.auto(
    'api/landing-intelligence.routes#handleLandingIntelligenceRoutes'
  ),
}));
vi.mock('../../../api/landing-optimization.routes.js', () => ({
  handleLandingOptimizationRoutes: h.auto(
    'api/landing-optimization.routes#handleLandingOptimizationRoutes'
  ),
}));
vi.mock('../../../api/cameo-analytics-routes.js', () => ({
  handleCameoAnalyticsRoutes: h.auto('api/cameo-analytics-routes#handleCameoAnalyticsRoutes'),
}));
vi.mock('../../../api/garden-routes.js', () => ({
  handleGardenRoutes: h.auto('api/garden-routes#handleGardenRoutes'),
}));
vi.mock('../../../api/roadmap-routes.js', () => ({
  handleRoadmapRoutes: h.auto('api/roadmap-routes#handleRoadmapRoutes'),
}));
vi.mock('../../../api/crash-report-routes.js', () => ({
  handleCrashReportRoutes: h.auto('api/crash-report-routes#handleCrashReportRoutes'),
}));
vi.mock('../../../api/marketing-routes.js', () => ({
  handleMarketingRoutes: h.auto('api/marketing-routes#handleMarketingRoutes'),
}));
vi.mock('../../../api/linkedin-routes.js', () => ({
  handleLinkedInRoutes: h.auto('api/linkedin-routes#handleLinkedInRoutes'),
}));
vi.mock('../../../api/sites-routes.js', () => ({
  handleSitesRoutes: h.auto('api/sites-routes#handleSitesRoutes'),
}));
vi.mock('../../../api/seeds-routes.js', () => ({
  handleSeedsRoutes: h.auto('api/seeds-routes#handleSeedsRoutes'),
}));
vi.mock('../../../api/ceo/index.js', () => ({
  handleCEORoutes: h.auto('ceo/index#handleCEORoutes'),
}));
vi.mock('../../../api/calendar-webhook-routes.js', () => ({
  handleCalendarWebhookRoutes: h.auto('api/calendar-webhook-routes#handleCalendarWebhookRoutes'),
}));
vi.mock('../../../api/routes/practice-calendar.js', () => ({
  handlePracticeCalendarRoutes: h.auto('routes/practice-calendar#handlePracticeCalendarRoutes'),
}));
vi.mock('../../../api/routes/practice-view.js', () => ({
  handlePracticeViewRoutes: h.auto('routes/practice-view#handlePracticeViewRoutes'),
}));
vi.mock('../../../api/finops-routes.js', () => ({
  handleFinOpsRoutes: h.auto('api/finops-routes#handleFinOpsRoutes'),
}));
vi.mock('../../../api/conversation-cost-routes.js', () => ({
  handleConversationCostRoutes: h.auto('api/conversation-cost-routes#handleConversationCostRoutes'),
}));
vi.mock('../../../api/journal-routes.js', () => ({
  handleJournalRoutes: h.auto('api/journal-routes#handleJournalRoutes'),
}));
vi.mock('../../../api/debug-routes.js', () => ({
  handleDebugRoutes: h.auto('api/debug-routes#handleDebugRoutes'),
}));
vi.mock('../../../api/custom-agent-features.routes.js', () => ({
  handleCustomAgentFeaturesRoutes: h.auto(
    'api/custom-agent-features.routes#handleCustomAgentFeaturesRoutes'
  ),
}));
vi.mock('../../../api/cache-routes.js', () => ({
  handleCacheRoutes: h.auto('api/cache-routes#handleCacheRoutes'),
}));
vi.mock('../../../api/session-analytics-routes.js', () => ({
  handleSessionAnalyticsRoutes: h.auto('api/session-analytics-routes#handleSessionAnalyticsRoutes'),
}));
vi.mock('../../../api/batch-operations-routes.js', () => ({
  handleBatchOperationsRoutes: h.auto('api/batch-operations-routes#handleBatchOperationsRoutes'),
}));
vi.mock('../../../api/webhook-management-routes.js', () => ({
  handleWebhookManagementRoutes: h.auto(
    'api/webhook-management-routes#handleWebhookManagementRoutes'
  ),
}));
vi.mock('../../../api/design-tokens-routes.js', () => ({
  handleDesignTokensRoutes: h.auto('api/design-tokens-routes#handleDesignTokensRoutes'),
}));
vi.mock('../../../api/insights-routes.js', () => ({
  handleInsightsRoutes: h.auto('api/insights-routes#handleInsightsRoutes'),
}));
vi.mock('../../../api/superhuman-metrics-routes.js', () => ({
  handleSuperhumanMetricsRoutes: h.auto(
    'api/superhuman-metrics-routes#handleSuperhumanMetricsRoutes'
  ),
}));
vi.mock('../../../api/visual-storytelling-routes.js', () => ({
  handleVisualStorytellingRoutes: h.auto(
    'api/visual-storytelling-routes#handleVisualStorytellingRoutes'
  ),
}));
vi.mock('../../../api/important-dates-routes.js', () => ({
  isImportantDatesRoute: h.auto('api/important-dates-routes#isImportantDatesRoute'),
  handleImportantDatesRoutes: h.auto('api/important-dates-routes#handleImportantDatesRoutes'),
}));
vi.mock('../../../api/sensitive-memory-routes.js', () => ({
  isSensitiveMemoryRoute: h.auto('api/sensitive-memory-routes#isSensitiveMemoryRoute'),
  handleSensitiveMemoryRoutes: h.auto('api/sensitive-memory-routes#handleSensitiveMemoryRoutes'),
}));
vi.mock('../../../api/memory-control-routes.js', () => ({
  handleMemoryControlRoutes: h.auto('api/memory-control-routes#handleMemoryControlRoutes'),
}));
vi.mock('../../../api/memory-routes.js', () => ({
  handleMemoryRoutes: h.auto('api/memory-routes#handleMemoryRoutes'),
}));
vi.mock('../../../api/user-preferences-routes.js', () => ({
  handleUserPreferenceRoutes: h.auto('api/user-preferences-routes#handleUserPreferenceRoutes'),
}));
vi.mock('../../../api/action-routes.js', () => ({
  handleActionRoutes: h.auto('api/action-routes#handleActionRoutes'),
}));
vi.mock('../../../api/automation-routes.js', () => ({
  handleAutomationRoutes: h.auto('api/automation-routes#handleAutomationRoutes'),
}));
vi.mock('../../../api/worker-routes.js', () => ({
  handleWorkerRoutes: h.auto('api/worker-routes#handleWorkerRoutes'),
}));
vi.mock('../routes/semantic-intelligence.js', () => ({
  handleSemanticIntelligenceRoutes: h.auto(
    'routes/semantic-intelligence#handleSemanticIntelligenceRoutes'
  ),
}));
vi.mock('../../../api/twilio-routes.js', () => ({
  handleTwilioRoutes: h.auto('api/twilio-routes#handleTwilioRoutes'),
  initializeTwilioStreamBridge: h.auto('api/twilio-routes#initializeTwilioStreamBridge'),
  attachTwilioStreamBridgeToServer: h.auto('api/twilio-routes#attachTwilioStreamBridgeToServer'),
}));
vi.mock('../../../api/family-checkin-webhook-routes.js', () => ({
  handleFamilyCheckinWebhookRoutes: h.auto(
    'api/family-checkin-webhook-routes#handleFamilyCheckinWebhookRoutes'
  ),
}));
vi.mock('../../../api/outbound-call-handler.js', () => ({
  handleOutboundCallRoutes: h.auto('api/outbound-call-handler#handleOutboundCallRoutes'),
}));
vi.mock('../../../services/insights-websocket.js', () => ({
  initInsightsWebSocket: h.auto('services/insights-websocket#initInsightsWebSocket'),
  shutdownInsightsWebSocket: h.auto('services/insights-websocket#shutdownInsightsWebSocket'),
}));
vi.mock('../../../services/life-context-websocket.js', () => ({
  initLifeContextWebSocket: h.auto('services/life-context-websocket#initLifeContextWebSocket'),
  shutdownLifeContextWebSocket: h.auto(
    'services/life-context-websocket#shutdownLifeContextWebSocket'
  ),
}));
vi.mock('../../../services/user-events-websocket.js', () => ({
  initUserEventsWebSocket: h.auto('services/user-events-websocket#initUserEventsWebSocket'),
  shutdownUserEventsWebSocket: h.auto('services/user-events-websocket#shutdownUserEventsWebSocket'),
}));
vi.mock('../../../api/director-routes.js', () => ({
  initDirectorWebSocket: h.auto('api/director-routes#initDirectorWebSocket'),
  shutdownDirectorWebSocket: h.auto('api/director-routes#shutdownDirectorWebSocket'),
}));
vi.mock('../../../api/marketplace-routes.js', () => ({
  handleMarketplaceRoutes: h.auto('api/marketplace-routes#handleMarketplaceRoutes'),
}));
vi.mock('../../../api/custom-agent/index.js', () => ({
  handleCustomAgentRoutes: h.auto('custom-agent/index#handleCustomAgentRoutes'),
}));
vi.mock('../../../api/routes/share-routes.js', () => ({
  handleShareRoutes: h.auto('routes/share-routes#handleShareRoutes'),
}));
vi.mock('../../../api/routes/challenge-routes.js', () => ({
  handleChallengeRoutes: h.auto('routes/challenge-routes#handleChallengeRoutes'),
}));
vi.mock('../../../api/routes/creative-you-routes.js', () => ({
  handleCreativeYouRoutes: h.auto('routes/creative-you-routes#handleCreativeYouRoutes'),
}));
vi.mock('../../../api/routes/musical-you-routes.js', () => ({
  handleMusicalYouRoutes: h.auto('routes/musical-you-routes#handleMusicalYouRoutes'),
}));
vi.mock('../../../api/routes/games.js', () => ({
  handleGamesRoutes: h.auto('routes/games#handleGamesRoutes'),
}));
vi.mock('../../../api/routes/social-routes.js', () => ({
  handleSocialRoutes: h.auto('routes/social-routes#handleSocialRoutes'),
}));
vi.mock('../../../api/routes/premium-routes.js', () => ({
  handlePremiumRoutes: h.auto('routes/premium-routes#handlePremiumRoutes'),
}));
vi.mock('../../../api/group-conversation-routes.js', () => ({
  groupConversationRoutes: h.auto('api/group-conversation-routes#groupConversationRoutes'),
}));
vi.mock('../../../api/life-automation-routes.js', () => ({
  handleLifeAutomationRoutes: h.auto('api/life-automation-routes#handleLifeAutomationRoutes'),
  initWorkflowExecutionHandler: h.auto('api/life-automation-routes#initWorkflowExecutionHandler'),
}));
vi.mock('../../../api/routes/rituals.js', () => ({
  handleRitualsRoutes: h.auto('routes/rituals#handleRitualsRoutes'),
}));
vi.mock('../../../api/routes/sky-check.js', () => ({
  handleSkyCheckRoutes: h.auto('routes/sky-check#handleSkyCheckRoutes'),
}));
vi.mock('../routes/twin-profile.js', () => ({
  handleTwinProfileRoutes: h.auto('routes/twin-profile#handleTwinProfileRoutes'),
}));

// ============================================================================
// PROBES
// ============================================================================

/** Every path prefix / exact path the server dispatches on, in source order. */
const ROUTE_PREFIXES = [
  '/health',
  '/api/health',
  '/plaid',
  '/spotify',
  '/wearables',
  '/auth/google',
  '/auth/apple',
  '/auth/microsoft',
  '/api/music',
  '/api/agents',
  '/api/team/order',
  '/api/push',
  '/api/eight-sleep',
  '/api/oura',
  '/api/apple-health',
  '/api/apple/notifications',
  '/api/webhooks',
  '/api/spotify/rooms',
  '/api/spotify/devices',
  '/api/spotify/',
  '/api/ecobee',
  '/api/smart-home',
  '/api/vibe',
  '/api/intelligent-routing',
  '/api/visual-memory',
  '/api/ambient-mode',
  '/api/bth',
  '/api/family/',
  '/api/insights/',
  '/api/superhuman/',
  '/api/visual-storytelling/',
  '/api/share/',
  '/share/',
  '/api/challenges',
  '/api/creative',
  '/api/musical',
  '/api/games',
  '/api/social',
  '/api/premium/',
  '/api/group/',
  '/api/marketplace/',
  '/api/custom-agents',
  '/api/admin/marketplace',
  '/api/v1/',
  '/api/v2/',
  '/api/auth/migrat',
  '/api/identity/',
  '/api/account',
  '/api/session/accent',
  '/api/auth/',
  '/api/dora',
  '/api/voice-presence',
  '/api/observability',
  '/api/ftis',
  '/api/finops',
  '/api/conversation/cost',
  '/api/chat',
  '/api/tools',
  '/api/metrics',
  '/api/cognitive',
  '/api/gdpr',
  '/api/trust-journey',
  '/api/relationship',
  '/api/trust-export',
  '/api/calendar',
  '/calendar',
  '/webhooks/calendar',
  '/api/practices',
  '/api/practice-view',
  '/api/trust/',
  '/api/semantic-intelligence',
  '/api/memory/me/preferences',
  '/api/memory/me/dates',
  '/api/memory/me/dates/',
  '/api/memory/me/reminder-settings',
  '/api/memory/me/consent',
  '/api/memory/me/health',
  '/api/memory/me/health/',
  '/api/memory/me/mood',
  '/api/memory/me',
  '/api/memory/me/',
  '/api/memory',
  '/api/actions',
  '/api/relationship/progress',
  '/api/relationship/team-unlocks',
  '/api/relationship/',
  '/api/outreach',
  '/api/background-results',
  '/api/flags',
  '/api/feedback',
  '/api/brand',
  '/api/design-tokens',
  '/api/landing',
  '/api/landing/optimization',
  '/api/commands',
  '/api/widget',
  '/api/monitoring',
  '/api/workers',
  '/api/performance',
  '/api/concierge',
  '/api/twilio',
  '/api/family-checkin/',
  '/api/outbound-call',
  '/api/proactive',
  '/api/predictions',
  '/api/year-in-review',
  '/api/llm-content',
  '/api/voice-humanization',
  '/api/life-context',
  '/api/speech-metrics',
  '/api/voice/',
  '/api/sponsored-identities',
  '/api/user',
  '/api/waitlist',
  '/api/habits',
  '/api/garden',
  '/api/roadmap',
  '/api/crash-report',
  '/api/disconnect-diagnostic',
  '/api/journal',
  '/api/custom-agent-features',
  '/api/debug/cache',
  '/api/debug',
  '/api/marketing',
  '/api/linkedin',
  '/api/seeds',
  '/api/sites',
  '/sites/',
  '/api/cameo',
  '/api/wellbeing',
  '/api/rituals',
  '/api/sky-check',
  '/api/twin',
  '/api/your-story',
  '/api/insights',
  '/api/intelligence',
  '/api/team-insights',
  '/api/commitments',
  '/api/conversations/threads',
  '/api/conversations',
  '/api/group',
  '/api/growth',
  '/api/video',
  '/api/wearable',
  '/api/marketplace/reviews',
  '/api/landing/ai',
  '/api/sanctuary',
  '/api/context',
  '/api/jobs',
  '/api/life-automation',
  '/api/automation',
  '/api/evalops',
  '/api/household',
  '/api/contacts',
  '/api/gifts',
  '/api/story-journey',
  '/api/story',
  '/api/user-events',
  '/api/analytics',
  '/api/admin/builder-metrics',
  '/api/admin/analytics',
  '/api/admin/batch',
  '/api/admin/webhooks',
  '/api/admin/music-analytics',
  '/api/admin/',
  '/api/ceo',
  '/api/subscription/status',
  '/api/subscription/webhook',
  '/api/monetization/tiers',
  '/api/apple/iap/verify',
  '/api/not-a-route',
  '/',
  '/assets/app.js',
];

interface Probe {
  method: string;
  path: string;
  host?: string;
  stopAt?: string;
  throwTarget?: string;
}

function toUrl(prefix: string): string {
  const path = prefix.endsWith('/') && prefix !== '/' ? `${prefix}probe` : prefix;
  return `${path}?q=1&r=two`;
}

const BASE_PROBES: Probe[] = [
  ...ROUTE_PREFIXES.map((p) => ({ method: 'GET', path: toUrl(p) })),
  // Body-parsing branches
  { method: 'POST', path: '/api/context' },
  { method: 'POST', path: '/api/subscription/status' },
  { method: 'PUT', path: '/api/subscription/status' },
  { method: 'POST', path: '/api/subscription/webhook' },
  { method: 'POST', path: '/api/monetization/tiers' },
  { method: 'PUT', path: '/api/monetization/tiers' },
  // CORS preflight
  { method: 'OPTIONS', path: '/api/agents' },
  // Subdomain rewriting
  { method: 'GET', path: '/', host: 'joel-dickson.ferni.ai' },
  { method: 'GET', path: '/about', host: 'Joel-Dickson.FERNI.ai' },
  { method: 'GET', path: '/api/agents', host: 'joel-dickson.ferni.ai' },
  { method: 'GET', path: '/', host: 'www.ferni.ai' },
  { method: 'GET', path: '/', host: 'api.ferni.ai' },
  // Early exits
  { method: 'GET', path: '/health', stopAt: 'ddos-protection#handleHealthEndpoint' },
  { method: 'GET', path: '/api/security', stopAt: 'ddos-protection#handleSecurityMonitoring' },
  { method: 'GET', path: '/api/agents', stopAt: 'auth-middleware#rateLimit' },
];

interface FakeRes {
  writableEnded: boolean;
  headersSent: boolean;
  writeHead: (status: number, headers?: unknown) => FakeRes;
  setHeader: (name: string, value: unknown) => void;
  getHeader: (name: string) => unknown;
  end: (body?: unknown) => void;
  write: (chunk: unknown) => boolean;
}

async function runProbe(probe: Probe): Promise<string[]> {
  const handler = h.state.requestHandler as Handler;
  const req = Object.assign(Readable.from([Buffer.from('{"probe":1}')]), {
    method: probe.method,
    url: probe.path,
    headers: {
      host: probe.host ?? 'localhost:3002',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const responses: string[] = [];
  const res: FakeRes = {
    writableEnded: false,
    headersSent: false,
    writeHead(status, headers) {
      res.headersSent = true;
      responses.push(`writeHead ${status} ${headers === undefined ? '' : JSON.stringify(headers)}`);
      return res;
    },
    setHeader(name, value) {
      responses.push(`setHeader ${name}=${String(value)}`);
    },
    getHeader() {
      return undefined;
    },
    write() {
      return true;
    },
    end(body) {
      res.writableEnded = true;
      responses.push(`end ${body === undefined ? '' : String(body)}`);
    },
  };

  h.events.length = 0;
  h.state.req = req;
  h.state.res = res;
  h.state.throwTarget = probe.throwTarget ?? null;
  h.state.stopAt = probe.stopAt ?? null;
  try {
    await handler(req, res);
  } catch (err) {
    h.events.push(`UNCAUGHT ${String(err)}`);
  }
  const lines = [...h.events, ...responses.map((r) => `=> ${r}`)];
  if (responses.length === 0) lines.push('=> (no response written)');
  h.state.req = null;
  h.state.res = null;
  h.state.throwTarget = null;
  h.state.stopAt = null;
  return lines;
}

function describeProbe(probe: Probe): string {
  const extras = [
    probe.host ? `host=${probe.host}` : '',
    probe.stopAt ? `stopAt=${probe.stopAt}` : '',
    probe.throwTarget ? `throw=${probe.throwTarget}` : '',
  ].filter(Boolean);
  return `### ${probe.method} ${probe.path}${extras.length ? `  [${extras.join(' ')}]` : ''}`;
}

// ============================================================================
// TEST
// ============================================================================

const savedEnv = { ...process.env };
const signalHandlers: Array<[string, (...args: unknown[]) => void]> = [];

describe('UI server route table', () => {
  let serverModule: Record<string, unknown>;
  const lifecycle: string[] = [];

  beforeAll(async () => {
    process.env.PORT = '3999';
    process.env.LIVEKIT_URL = 'wss://probe.livekit.invalid';
    process.env.LIVEKIT_API_KEY = 'probe-key';
    process.env.LIVEKIT_API_SECRET = 'probe-secret';
    process.env.DIRECTOR_AUTHORIZED_IDS = ' alpha, beta ,,';
    delete process.env.TWILIO_STREAM_PORT;

    const realOn = process.on.bind(process);
    vi.spyOn(process, 'on').mockImplementation(((event: string, listener: () => void) => {
      if (event === 'SIGTERM' || event === 'SIGINT') {
        signalHandlers.push([event, listener]);
        return process;
      }
      return realOn(event, listener);
    }) as typeof process.on);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      h.events.push(`life process.exit(${String(code)})`);
      return undefined as never;
    }) as typeof process.exit);

    h.events.length = 0;
    serverModule = (await import('../index.js')) as Record<string, unknown>;
    lifecycle.push('## module load', ...h.events);
    lifecycle.push(`signal handlers: ${signalHandlers.map(([e]) => e).join(', ')}`);
    lifecycle.push(`exports: ${Object.keys(serverModule).sort().join(', ')}`);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    process.env = savedEnv;
  });

  it('matches the recorded route table snapshot', async () => {
    expect(h.state.requestHandler).toBeTypeOf('function');
    const sections: string[] = [
      '# UI server route table (generated by route-table.test.ts - do not edit by hand)',
      '',
    ];

    // 1. Lifecycle: module load, listen callback, graceful shutdown
    h.events.length = 0;
    expect(h.state.listenCallback).toBeTypeOf('function');
    await (h.state.listenCallback as () => unknown)();
    // The callback may start async work without returning its promise; every
    // mocked service settles in microtasks, so one macrotask drains it all.
    await nextMacrotask();
    lifecycle.push('## listen callback', ...h.events);

    h.events.length = 0;
    await (serverModule.gracefulShutdown as () => Promise<void>)();
    lifecycle.push('## gracefulShutdown', ...h.events);

    sections.push('# LIFECYCLE', ...lifecycle, '');

    // 2. Route table: every probe walks the full chain
    sections.push('# ROUTES');
    const handlerFirstProbe = new Map<string, Probe>();
    for (const probe of BASE_PROBES) {
      const lines = await runProbe(probe);
      sections.push(describeProbe(probe), ...lines, '');
      if (probe.stopAt || probe.host) continue;
      for (const line of lines) {
        const match = /^route ([^(]+)\(/.exec(line);
        if (match && !match[1].startsWith('express#') && !handlerFirstProbe.has(match[1])) {
          handlerFirstProbe.set(match[1], probe);
        }
      }
    }

    // 3. Error boundaries: make each route handler throw on its first probe
    sections.push('# ERROR BOUNDARIES');
    for (const [label, probe] of handlerFirstProbe) {
      const throwingProbe: Probe = { ...probe, throwTarget: label };
      const lines = await runProbe(throwingProbe);
      sections.push(describeProbe(throwingProbe), ...lines, '');
    }

    const output = `${sections.join('\n')}\n`;
    await expect(output).toMatchFileSnapshot('./__snapshots__/route-table.snap.txt');
  });
});
