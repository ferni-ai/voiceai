/**
 * Operations, observability, trust, calendar and memory routes.
 *
 * DORA, voice presence, observability, FTIS, FinOps, chat, tools analytics,
 * dashboard metrics, GDPR, trust, relationship arc, calendars, practices,
 * semantic intelligence, memory, actions and relationship health.
 *
 * Part of the core API chain: dispatched inside the shared "API route error"
 * boundary in core-routes.ts.
 */

import { handleDashboardMetricsRoutes } from '../../../api/dashboard-metrics-routes.js';
import { handleDORARoutes } from '../../../api/dora-routes.js';
import { handleObservabilityRoutes } from '../../../api/observability-routes.js';
import { handleFTISRoutes } from '../../../services/observability/routing-metrics.js';
import { handleToolsAnalyticsRoutes } from '../../../api/tools-analytics-routes.js';
import { handleChatRoutes } from '../../../api/chat-routes.js';
import { handleVoicePresenceRoutes } from '../../../api/voice-presence-routes.js';
import { handleGDPRRoutes } from '../../../api/gdpr-routes.js';
import { handleTrustExportRoutes } from '../../../api/trust-export-routes.js';
import { handleTrustJourneyRoutes } from '../../../api/trust-journey-routes.js';
import { handleCalendarRoutes } from '../../../api/calendar-routes.js';
import { handleTrustSystemsRoutes } from '../../../api/trust-systems-routes.js';
import { handleRelationshipArcRoutes } from '../../../api/relationship-arc-routes.js';
import { relationshipHealthRoutes } from '../../../api/routes/relationship-health-routes.js';
import { handleRelationshipRoutes } from '../../../api/routes/relationship.js';
import { handleCalendarWebhookRoutes } from '../../../api/calendar-webhook-routes.js';
import { handlePracticeCalendarRoutes } from '../../../api/routes/practice-calendar.js';
import { handlePracticeViewRoutes } from '../../../api/routes/practice-view.js';
import { handleFinOpsRoutes } from '../../../api/finops-routes.js';
import { handleConversationCostRoutes } from '../../../api/conversation-cost-routes.js';
import { handleMemoryRoutes } from '../../../api/memory-routes.js';
import { handleUserPreferenceRoutes } from '../../../api/user-preferences-routes.js';
import { handleActionRoutes } from '../../../api/action-routes.js';
import { handleSemanticIntelligenceRoutes } from '../routes/semantic-intelligence.js';
import type { RouteContext } from './route-context.js';

/**
 * Returns true when the request is finished.
 */
export async function dispatchOperationsRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // DORA routes
  if (pathname.startsWith('/api/dora')) {
    const handled = await handleDORARoutes(req, res);
    if (handled) return true;
  }

  // Voice presence routes
  if (pathname.startsWith('/api/voice-presence')) {
    const handled = await handleVoicePresenceRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Observability routes
  if (pathname.startsWith('/api/observability')) {
    const handled = await handleObservabilityRoutes(req, res, pathname);
    if (handled) return true;
  }

  // FTIS (Tool Intelligence) dedicated routes - health, metrics, stats
  if (pathname.startsWith('/api/ftis')) {
    const handled = await handleFTISRoutes(req, res, pathname);
    if (handled) return true;
  }

  // FinOps routes (admin)
  if (pathname.startsWith('/api/finops')) {
    const handled = await handleFinOpsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Conversation cost routes (user-facing cost transparency)
  if (pathname.startsWith('/api/conversation/cost')) {
    const handled = await handleConversationCostRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Chat API routes (natural language interface)
  if (pathname.startsWith('/api/chat')) {
    const handled = await handleChatRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Tools analytics routes
  if (pathname.startsWith('/api/tools')) {
    const handled = await handleToolsAnalyticsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Dashboard metrics routes
  if (pathname.startsWith('/api/metrics') || pathname.startsWith('/api/cognitive')) {
    const handled = await handleDashboardMetricsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // GDPR routes
  if (pathname.startsWith('/api/gdpr')) {
    const handled = await handleGDPRRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Trust journey routes
  if (pathname.startsWith('/api/trust-journey')) {
    const handled = await handleTrustJourneyRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Relationship arc routes (Better Than Human system)
  if (pathname.startsWith('/api/relationship')) {
    const handled = await handleRelationshipArcRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Trust export routes
  if (pathname.startsWith('/api/trust-export')) {
    const handled = await handleTrustExportRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Calendar routes
  if (pathname.startsWith('/api/calendar') || pathname.startsWith('/calendar')) {
    const handled = await handleCalendarRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Calendar webhooks (real-time sync from providers)
  if (pathname.startsWith('/webhooks/calendar')) {
    const handled = await handleCalendarWebhookRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Practice-Calendar routes (calendar-integrated practices)
  if (pathname.startsWith('/api/practices')) {
    const handled = await handlePracticeCalendarRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Practice View routes (What's Ahead - rich calendar + insights)
  if (pathname.startsWith('/api/practice-view')) {
    const handled = await handlePracticeViewRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Trust systems routes
  if (pathname.startsWith('/api/trust/')) {
    const handled = await handleTrustSystemsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Semantic Intelligence routes (Better Than Human V3)
  if (pathname.startsWith('/api/semantic-intelligence')) {
    const handled = await handleSemanticIntelligenceRoutes(req, res, pathname);
    if (handled) return true;
  }

  // User preference profile (memory control: /api/memory/me/preferences)
  if (pathname.startsWith('/api/memory/me/preferences')) {
    const handled = await handleUserPreferenceRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Memory routes (Superhuman Memory - feedback, metrics, health)
  if (pathname.startsWith('/api/memory')) {
    const handled = await handleMemoryRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Action routes (Activity Dashboard - calls, texts, emails, calendar)
  if (pathname.startsWith('/api/actions')) {
    const handled = await handleActionRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Relationship routes (progress & team-unlocks before health routes)
  if (pathname === '/api/relationship/progress' || pathname === '/api/relationship/team-unlocks') {
    const handled = await handleRelationshipRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  if (pathname.startsWith('/api/relationship/')) {
    const handled = await relationshipHealthRoutes(req, res);
    if (handled) return true;
  }

  return false;
}
