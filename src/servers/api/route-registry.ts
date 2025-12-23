/**
 * Route Registry - Declarative route definitions
 *
 * Replaces 70+ sequential if-statements with a structured registry.
 * Routes are matched in order, first match wins.
 *
 * @example
 * ```typescript
 * const route = matchRoute('/api/calendar/sync');
 * if (route) {
 *   await route.handler(req, res, pathname);
 * }
 * ```
 */

import type { IncomingMessage, ServerResponse } from 'http';

// =============================================================================
// Types
// =============================================================================

/**
 * Route handler function signature.
 * Note: Handlers may have varying signatures due to legacy patterns.
 * Some take (req, res, pathname, parsedUrl), others take (ctx).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteHandler = (...args: any[]) => Promise<boolean> | Promise<any>;

export type RoutePredicate = (pathname: string) => boolean;

export interface RouteDefinition {
  /** Route prefix to match (e.g., '/api/calendar') */
  prefix: string;
  /** Handler function */
  handler: RouteHandler;
  /** Optional predicate for complex matching (used instead of prefix) */
  predicate?: RoutePredicate;
  /** Route category for logging/debugging */
  category?: 'auth' | 'api' | 'webhook' | 'admin' | 'static';
  /** Description for documentation */
  description?: string;
}

// =============================================================================
// Route Imports
// =============================================================================

// Local routes (from src/servers/api/routes/)
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
} from './routes/index.js';

// API routes (from src/api/)
import { handleEngagementRoutes } from '../../api/engagement-routes.js';
import { handleDiagnosticsRoutes } from '../../api/handoff-diagnostics.js';
import { handleDashboardMetricsRoutes } from '../../api/dashboard-metrics-routes.js';
import { handleDORARoutes } from '../../api/dora-routes.js';
import { handleObservabilityRoutes } from '../../api/observability-routes.js';
import { handleToolsAnalyticsRoutes } from '../../api/tools-analytics-routes.js';
import { handleVoicePresenceRoutes } from '../../api/voice-presence-routes.js';
import { handleOutreachRoutes } from '../../api/outreach.routes.js';
import { handleGDPRRoutes } from '../../api/gdpr-routes.js';
import { handleTrustExportRoutes } from '../../api/trust-export-routes.js';
import { handleTrustJourneyRoutes } from '../../api/trust-journey-routes.js';
import { handleCalendarRoutes } from '../../api/calendar-routes.js';
import { handleTrustSystemsRoutes } from '../../api/trust-systems-routes.js';
import { handleFeatureFlagsRoutes } from '../../api/feature-flags-routes.js';
import { handleBrandRoutes } from '../../api/brand-routes.js';
import { handleCommandsRoutes } from '../../api/commands-routes.js';
import { handleWidgetRoutes } from '../../api/widget-routes.js';
import { handleMonitoringRoutes } from '../../api/monitoring-routes.js';
import { handlePerformanceRoutes } from '../../api/performance-routes.js';
import { handleLLMContentRoutes } from '../../api/llm-content-routes.js';
import { relationshipHealthRoutes } from '../../api/routes/relationship-health-routes.js';
import { handleRelationshipRoutes } from '../../api/routes/relationship.js';
import { handleVoiceHumanizationRoutes } from '../../api/voice-humanization-routes.js';
import { handleSpeechMetricsRoutes } from '../../api/speech-metrics-routes.js';
import { handleVoiceAuthRoutes } from '../../api/voice-auth.routes.js';
import { handleUserRoutes } from '../../api/user-routes.js';
import { handleWaitlistRoutes } from '../../api/waitlist-routes.js';
import { handleHabitRoutes } from '../../api/habit-routes.js';
import { handleWellbeingRoutes } from '../../api/wellbeing.routes.js';
import { handlePredictiveInsightsRequest } from '../../api/predictive-insights-routes.js';
import { handleScheduledJobsRoutes } from '../../api/scheduled-jobs.routes.js';
import { handleEvalOpsRoutes } from '../../api/evalops.routes.js';
import { handleHouseholdRoutes } from '../../api/household-routes.js';
import { handleContactsRoutes } from '../../api/contacts-routes.js';
import { handleGiftRoutes } from '../../api/gift-routes.js';
import { handleJournalRoutes } from '../../api/journal-routes.js';
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
import { handleMarketingRoutes } from '../../api/marketing-routes.js';
import { handleSeedsRoutes } from '../../api/seeds-routes.js';
import { handleCalendarWebhookRoutes } from '../../api/calendar-webhook-routes.js';
import { handlePracticeCalendarRoutes } from '../../api/routes/practice-calendar.js';
import { handleDebugRoutes } from '../../api/debug-routes.js';
import { handleFinOpsRoutes } from '../../api/finops-routes.js';
import { handleConversationCostRoutes } from '../../api/conversation-cost-routes.js';
import { handleMarketplaceRoutes } from '../../api/marketplace-routes.js';
import { handleCustomAgentRoutes } from '../../api/custom-agent.routes.js';
import { handleShareRoutes } from '../../api/routes/share-routes.js';
import { handleChallengeRoutes } from '../../api/routes/challenge-routes.js';
import { handleCreativeYouRoutes } from '../../api/routes/creative-you-routes.js';
import { handleMusicalYouRoutes } from '../../api/routes/musical-you-routes.js';
import { handleSocialRoutes } from '../../api/routes/social-routes.js';
import { handlePremiumRoutes } from '../../api/routes/premium-routes.js';
import { handleCustomAgentFeaturesRoutes } from '../../api/custom-agent-features.routes.js';

// =============================================================================
// Route Registry
// =============================================================================

/**
 * All routes in matching order.
 *
 * IMPORTANT: Order matters! More specific routes should come before general ones.
 * E.g., '/api/landing/optimization' before '/api/landing'
 */
export const routes: RouteDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Health & Internal (no prefix guard - checked first)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '',
    handler: handleHealthRoutes,
    category: 'api',
    description: 'Health check endpoints',
  },
  {
    prefix: '',
    handler: handleTokenRoutes,
    category: 'auth',
    description: 'Token generation',
  },
  {
    prefix: '',
    handler: handleEngagementRoutes,
    category: 'api',
    description: 'Engagement tracking (no prefix guard)',
  },
  {
    prefix: '',
    handler: handleDiagnosticsRoutes,
    category: 'api',
    description: 'Handoff diagnostics (no prefix guard)',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth & External Auth
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/plaid',
    handler: handlePlaidRoutes,
    category: 'auth',
    description: 'Plaid financial integration',
  },
  {
    prefix: '/spotify',
    handler: handleSpotifyRoutes,
    category: 'auth',
    description: 'Spotify OAuth',
  },
  {
    prefix: '/auth/google',
    handler: handleGoogleCalendarRoutes,
    category: 'auth',
    description: 'Google Calendar OAuth',
  },
  {
    prefix: '/auth/microsoft',
    handler: handleMicrosoftCalendarRoutes,
    category: 'auth',
    description: 'Microsoft Calendar OAuth',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Webhooks
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/webhooks/calendar',
    handler: handleCalendarWebhookRoutes,
    category: 'webhook',
    description: 'Calendar webhook callbacks',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // API v1 (versioned routes)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/api/v1/',
    handler: handleV1Routes,
    category: 'api',
    description: 'Versioned API v1 routes',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Admin Routes (check before general API routes)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/api/admin/builder-metrics',
    handler: handleBuilderMetricsRoutes,
    category: 'admin',
    description: 'Builder metrics dashboard',
  },
  {
    prefix: '/api/admin/music-analytics',
    handler: handleMusicAnalyticsRoutes,
    category: 'admin',
    description: 'Music analytics dashboard',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Landing (specific before general)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/api/landing/optimization',
    handler: handleLandingOptimizationRoutes,
    category: 'api',
    description: 'Landing page optimization',
  },
  {
    prefix: '/api/landing',
    handler: handleLandingIntelligenceRoutes,
    category: 'api',
    description: 'Landing page intelligence',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Conversation Cost (specific before general /api/conversation)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/api/conversation/cost',
    handler: handleConversationCostRoutes,
    category: 'api',
    description: 'Conversation cost tracking',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Session Accent (specific before general /api/session)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/api/session/accent',
    handler: handleSessionAccentRoutes,
    category: 'api',
    description: 'Session accent preferences',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Relationship (exact match before prefix)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/api/relationship/progress',
    handler: handleRelationshipRoutes,
    predicate: (p) => p === '/api/relationship/progress' || p === '/api/relationship/team-unlocks',
    category: 'api',
    description: 'Relationship progress & team unlocks',
  },
  {
    prefix: '/api/relationship/',
    handler: relationshipHealthRoutes,
    category: 'api',
    description: 'Relationship health',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Core API Routes (alphabetical for easy lookup)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '/api/account',
    handler: handleAccountRoutes,
    category: 'api',
    description: 'Account management',
  },
  {
    prefix: '/api/agents',
    handler: handleAgentRoutes,
    category: 'api',
    description: 'Agent management',
  },
  {
    prefix: '/api/analytics',
    handler: handleAnalyticsRoutes,
    category: 'api',
    description: 'User analytics',
  },
  {
    prefix: '/api/auth/',
    handler: handleAuthMonitoringRoutes,
    category: 'auth',
    description: 'Auth monitoring',
  },
  {
    prefix: '/api/auth/migrat',
    handler: handleMigrationRoutes,
    category: 'auth',
    description: 'Auth migration',
  },
  {
    prefix: '/api/brand',
    handler: handleBrandRoutes,
    category: 'api',
    description: 'Brand management',
  },
  {
    prefix: '/api/calendar',
    handler: handleCalendarRoutes,
    category: 'api',
    description: 'Calendar integration',
  },
  {
    prefix: '/calendar',
    handler: handleCalendarRoutes,
    category: 'api',
    description: 'Calendar integration (legacy)',
  },
  {
    prefix: '/api/cameo',
    handler: handleCameoAnalyticsRoutes,
    category: 'api',
    description: 'Cameo analytics',
  },
  {
    prefix: '/api/challenges',
    handler: handleChallengeRoutes,
    category: 'api',
    description: 'Challenges',
  },
  {
    prefix: '/api/commands',
    handler: handleCommandsRoutes,
    category: 'api',
    description: 'Commands',
  },
  {
    prefix: '/api/contacts',
    handler: handleContactsRoutes,
    category: 'api',
    description: 'Contacts management',
  },
  {
    prefix: '/api/cognitive',
    handler: handleDashboardMetricsRoutes,
    category: 'api',
    description: 'Cognitive metrics (alias)',
  },
  {
    prefix: '/api/creative',
    handler: handleCreativeYouRoutes,
    category: 'api',
    description: 'Creative You features',
  },
  {
    prefix: '/api/custom-agents',
    handler: handleCustomAgentRoutes,
    category: 'api',
    description: 'Custom agent management',
  },
  {
    prefix: '/api/custom-agent-features',
    handler: handleCustomAgentFeaturesRoutes,
    category: 'api',
    description: 'Custom agent features (share, coaching, tasks, roleplay)',
  },
  {
    prefix: '/api/dora',
    handler: handleDORARoutes,
    category: 'api',
    description: 'DORA metrics',
  },
  {
    prefix: '/api/evalops',
    handler: handleEvalOpsRoutes,
    category: 'api',
    description: 'Evaluation operations',
  },
  {
    prefix: '/api/finops',
    handler: handleFinOpsRoutes,
    category: 'api',
    description: 'Financial operations',
  },
  {
    prefix: '/api/flags',
    handler: handleFeatureFlagsRoutes,
    category: 'api',
    description: 'Feature flags',
  },
  {
    prefix: '/api/garden',
    handler: handleGardenRoutes,
    category: 'api',
    description: 'Garden features',
  },
  {
    prefix: '/api/gdpr',
    handler: handleGDPRRoutes,
    category: 'api',
    description: 'GDPR compliance',
  },
  {
    prefix: '/api/gifts',
    handler: handleGiftRoutes,
    category: 'api',
    description: 'Gift management',
  },
  {
    prefix: '/api/habits',
    handler: handleHabitRoutes,
    category: 'api',
    description: 'Habit tracking',
  },
  {
    prefix: '/api/household',
    handler: handleHouseholdRoutes,
    category: 'api',
    description: 'Household management',
  },
  {
    prefix: '/api/journal',
    handler: handleJournalRoutes,
    category: 'api',
    description: 'Voice journal prompts',
  },
  {
    prefix: '/api/insights',
    handler: handlePredictiveInsightsRequest,
    category: 'api',
    description: 'Predictive insights',
  },
  {
    prefix: '/api/jobs',
    handler: handleScheduledJobsRoutes,
    category: 'api',
    description: 'Scheduled jobs',
  },
  {
    prefix: '/api/marketing',
    handler: handleMarketingRoutes,
    category: 'api',
    description: 'Marketing',
  },
  {
    prefix: '/api/marketplace/',
    handler: handleMarketplaceRoutes,
    category: 'api',
    description: 'Marketplace',
  },
  {
    prefix: '/api/metrics',
    handler: handleDashboardMetricsRoutes,
    category: 'api',
    description: 'Dashboard metrics',
  },
  {
    prefix: '/api/monitoring',
    handler: handleMonitoringRoutes,
    category: 'api',
    description: 'System monitoring',
  },
  {
    prefix: '/api/music',
    handler: handleMusicRoutes,
    category: 'api',
    description: 'Music features',
  },
  {
    prefix: '/api/musical',
    handler: handleMusicalYouRoutes,
    category: 'api',
    description: 'Musical You features',
  },
  {
    prefix: '/api/observability',
    handler: handleObservabilityRoutes,
    category: 'api',
    description: 'Observability',
  },
  {
    prefix: '/api/debug',
    handler: handleDebugRoutes,
    category: 'admin',
    description: 'Debug tools (dev mode only)',
  },
  {
    prefix: '/api/outreach',
    handler: handleOutreachRoutes,
    category: 'api',
    description: 'Outreach messaging',
  },
  {
    prefix: '/api/performance',
    handler: handlePerformanceRoutes,
    category: 'api',
    description: 'Performance metrics',
  },
  {
    prefix: '/api/llm-content',
    handler: handleLLMContentRoutes,
    category: 'api',
    description: 'LLM dynamic content metrics and stats',
  },
  {
    prefix: '/api/practices',
    handler: handlePracticeCalendarRoutes,
    category: 'api',
    description: 'Practice calendar',
  },
  {
    prefix: '/api/premium/',
    handler: handlePremiumRoutes,
    category: 'api',
    description: 'Premium features',
  },
  {
    prefix: '/api/push',
    handler: handlePushRoutes,
    category: 'api',
    description: 'Push notifications',
  },
  {
    prefix: '/api/roadmap',
    handler: handleRoadmapRoutes,
    category: 'api',
    description: 'Roadmap features',
  },
  {
    prefix: '/api/seeds',
    handler: handleSeedsRoutes,
    category: 'api',
    description: 'Seeds economy',
  },
  {
    prefix: '/api/share/',
    handler: handleShareRoutes,
    category: 'api',
    description: 'Content sharing',
  },
  {
    prefix: '/share/',
    handler: handleShareRoutes,
    category: 'api',
    description: 'Content sharing (legacy)',
  },
  {
    prefix: '/api/social',
    handler: handleSocialRoutes,
    category: 'api',
    description: 'Social features',
  },
  {
    prefix: '/api/speech-metrics',
    handler: handleSpeechMetricsRoutes,
    category: 'api',
    description: 'Speech metrics',
  },
  {
    prefix: '/api/story-journey',
    handler: handleStoryJourneyRoutes,
    category: 'api',
    description: 'Story journey',
  },
  {
    prefix: '/api/tools',
    handler: handleToolsAnalyticsRoutes,
    category: 'api',
    description: 'Tools analytics',
  },
  {
    prefix: '/api/trust-export',
    handler: handleTrustExportRoutes,
    category: 'api',
    description: 'Trust data export',
  },
  {
    prefix: '/api/trust-journey',
    handler: handleTrustJourneyRoutes,
    category: 'api',
    description: 'Trust journey',
  },
  {
    prefix: '/api/trust/',
    handler: handleTrustSystemsRoutes,
    category: 'api',
    description: 'Trust systems',
  },
  {
    prefix: '/api/user',
    handler: handleUserRoutes,
    category: 'api',
    description: 'User management',
  },
  {
    prefix: '/api/voice-humanization',
    handler: handleVoiceHumanizationRoutes,
    category: 'api',
    description: 'Voice humanization',
  },
  {
    prefix: '/api/voice-presence',
    handler: handleVoicePresenceRoutes,
    category: 'api',
    description: 'Voice presence',
  },
  {
    prefix: '/api/voice/',
    handler: handleVoiceAuthRoutes,
    category: 'api',
    description: 'Voice authentication',
  },
  {
    prefix: '/api/waitlist',
    handler: handleWaitlistRoutes,
    category: 'api',
    description: 'Waitlist management',
  },
  {
    prefix: '/api/wellbeing',
    handler: handleWellbeingRoutes,
    category: 'api',
    description: 'Wellbeing tracking',
  },
  {
    prefix: '/api/widget',
    handler: handleWidgetRoutes,
    category: 'api',
    description: 'Embeddable widgets',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Predicate-based routes (use predicate function instead of prefix)
  // ─────────────────────────────────────────────────────────────────────────
  {
    prefix: '',
    handler: handleSubscriptionRequest,
    predicate: isSubscriptionRoute,
    category: 'api',
    description: 'Subscription management',
  },
  {
    prefix: '',
    handler: handleMonetizationRequest,
    predicate: isMonetizationRoute,
    category: 'api',
    description: 'Monetization',
  },
  {
    prefix: '',
    handler: handleAppleRoutes,
    predicate: isAppleRoute,
    category: 'api',
    description: 'Apple IAP',
  },
];

// Special route: /api/team/order is handled by handleAgentRoutes
// This is captured by the /api/agents route above

// =============================================================================
// Route Matching
// =============================================================================

/**
 * Find the first matching route for a pathname.
 *
 * @param pathname - The request pathname
 * @returns The matching route definition, or undefined if no match
 */
export function matchRoute(pathname: string): RouteDefinition | undefined {
  for (const route of routes) {
    // Predicate-based matching (for complex patterns)
    if (route.predicate) {
      if (route.predicate(pathname)) {
        return route;
      }
      continue;
    }

    // Prefix-based matching
    if (route.prefix === '') {
      // Empty prefix routes are always considered (handler decides)
      return route;
    }

    if (pathname.startsWith(route.prefix)) {
      return route;
    }
  }

  return undefined;
}

/**
 * Get all routes in a category.
 *
 * @param category - The route category
 * @returns All routes in the category
 */
export function getRoutesByCategory(category: RouteDefinition['category']): RouteDefinition[] {
  return routes.filter((r) => r.category === category);
}

/**
 * Get route statistics for debugging.
 */
export function getRouteStats(): {
  total: number;
  byCategory: Record<string, number>;
  predicateBased: number;
  prefixBased: number;
} {
  const byCategory: Record<string, number> = {};

  for (const route of routes) {
    const cat = route.category ?? 'uncategorized';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  return {
    total: routes.length,
    byCategory,
    predicateBased: routes.filter((r) => r.predicate).length,
    prefixBased: routes.filter((r) => !r.predicate && r.prefix !== '').length,
  };
}

// =============================================================================
// Debug Helpers
// =============================================================================

/**
 * Log all routes (for debugging).
 */
export function logRoutes(): void {
  console.log('\n=== Route Registry ===');
  console.log(`Total routes: ${routes.length}`);

  const stats = getRouteStats();
  console.log('\nBy category:');
  for (const [cat, count] of Object.entries(stats.byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('\nRoutes:');
  for (const route of routes) {
    const prefix = route.prefix || '(predicate)';
    const cat = route.category ?? 'uncategorized';
    console.log(`  [${cat}] ${prefix} - ${route.description}`);
  }
}
