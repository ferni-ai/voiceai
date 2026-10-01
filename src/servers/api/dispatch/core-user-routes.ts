/**
 * User, wellbeing and personal data routes.
 *
 * LLM content, voice humanization, life context, speech metrics, voice auth,
 * sponsored identities, user, waitlist, habits, garden, roadmap, crash reports,
 * journal, custom agent features, cache/debug, marketing, LinkedIn, seeds, sites,
 * cameo, wellbeing, rituals, sky check, twin, Your Story and predictive insights.
 *
 * Part of the core API chain: dispatched inside the shared "API route error"
 * boundary in core-routes.ts.
 */

import { handleLLMContentRoutes } from '../../../api/llm-content-routes.js';
import { handleVoiceHumanizationRoutes } from '../../../api/voice-humanization-routes.js';
import { handleLifeContextRoutes } from '../../../api/life-context-routes.js';
import { handleSpeechMetricsRoutes } from '../../../api/speech-metrics-routes.js';
import { handleVoiceAuthRoutes } from '../../../api/voice-auth.routes.js';
import { handleSponsoredIdentityRoutes } from '../../../api/sponsored-identity-routes.js';
import { handleUserRoutes } from '../../../api/user-routes.js';
import { handleWaitlistRoutes } from '../../../api/waitlist-routes.js';
import { handleHabitRoutes } from '../../../api/habit-routes.js';
import { handleWellbeingRoutes } from '../../../api/wellbeing.routes.js';
import { handleYourStoryRoutes } from '../../../api/your-story-routes.js';
import { handlePredictiveInsightsRequest } from '../../../api/predictive-insights-routes.js';
import { handleCameoAnalyticsRoutes } from '../../../api/cameo-analytics-routes.js';
import { handleGardenRoutes } from '../../../api/garden-routes.js';
import { handleRoadmapRoutes } from '../../../api/roadmap-routes.js';
import { handleCrashReportRoutes } from '../../../api/crash-report-routes.js';
import { handleMarketingRoutes } from '../../../api/marketing-routes.js';
import { handleLinkedInRoutes } from '../../../api/linkedin-routes.js';
import { handleSitesRoutes } from '../../../api/sites-routes.js';
import { handleSeedsRoutes } from '../../../api/seeds-routes.js';
import { handleJournalRoutes } from '../../../api/journal-routes.js';
import { handleDebugRoutes } from '../../../api/debug-routes.js';
import { handleCustomAgentFeaturesRoutes } from '../../../api/custom-agent-features.routes.js';
import { handleCacheRoutes } from '../../../api/cache-routes.js';
import { handleRitualsRoutes } from '../../../api/routes/rituals.js';
import { handleSkyCheckRoutes } from '../../../api/routes/sky-check.js';
import { handleTwinProfileRoutes } from '../routes/twin-profile.js';
import type { RouteContext } from './route-context.js';

/**
 * Returns true when the request is finished.
 */
export async function dispatchUserRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // LLM content routes (metrics, cache stats, prewarm)
  if (pathname.startsWith('/api/llm-content')) {
    const handled = await handleLLMContentRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Voice humanization routes
  if (pathname.startsWith('/api/voice-humanization')) {
    const handled = await handleVoiceHumanizationRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Life context routes (Phase 6)
  if (pathname.startsWith('/api/life-context')) {
    const handled = await handleLifeContextRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Speech metrics routes
  if (pathname.startsWith('/api/speech-metrics')) {
    const handled = await handleSpeechMetricsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Voice auth routes
  if (pathname.startsWith('/api/voice/')) {
    const handled = await handleVoiceAuthRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Sponsored identity routes (phone-based family member management)
  if (pathname.startsWith('/api/sponsored-identities')) {
    const handled = await handleSponsoredIdentityRoutes(req, res, pathname);
    if (handled) return true;
  }

  // User routes
  if (pathname.startsWith('/api/user')) {
    const handled = await handleUserRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Waitlist routes
  if (pathname.startsWith('/api/waitlist')) {
    const handled = await handleWaitlistRoutes(req, res);
    if (handled) return true;
  }

  // Habit routes
  if (pathname.startsWith('/api/habits')) {
    const handled = await handleHabitRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Garden routes
  if (pathname.startsWith('/api/garden')) {
    const handled = await handleGardenRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Roadmap routes (What's Growing - feature voting, suggestions, seed economy)
  if (pathname.startsWith('/api/roadmap')) {
    const handled = await handleRoadmapRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Crash report routes (frontend crash analytics)
  // Also handles /api/disconnect-diagnostic for client-side disconnect diagnostics
  if (
    pathname.startsWith('/api/crash-report') ||
    pathname.startsWith('/api/disconnect-diagnostic')
  ) {
    const handled = await handleCrashReportRoutes(req, res);
    if (handled) return true;
  }

  // Journal routes (Voice Journal / Digital Twin)
  if (pathname.startsWith('/api/journal')) {
    const handled = await handleJournalRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Custom agent features routes (share, coaching, tasks, roleplay)
  if (pathname.startsWith('/api/custom-agent-features')) {
    const handled = await handleCustomAgentFeaturesRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Cache management routes (admin only, before general debug routes)
  if (pathname.startsWith('/api/debug/cache')) {
    const handled = await handleCacheRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Debug routes (dev mode only)
  if (pathname.startsWith('/api/debug')) {
    const handled = await handleDebugRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Marketing routes (Alex's social media management - dogfooding)
  if (pathname.startsWith('/api/marketing')) {
    const handled = await handleMarketingRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // LinkedIn personal profile routes (career awareness, milestones)
  if (pathname.startsWith('/api/linkedin')) {
    const handled = await handleLinkedInRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Seeds routes (Network Effect - referrals, gifts, garden)
  if (pathname.startsWith('/api/seeds')) {
    const handled = await handleSeedsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Sites routes (Agent Page Builder - generate and deploy landing pages)
  if (pathname.startsWith('/api/sites') || pathname.startsWith('/sites/')) {
    const handled = await handleSitesRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Cameo analytics routes
  if (pathname.startsWith('/api/cameo')) {
    const handled = await handleCameoAnalyticsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Wellbeing routes
  if (pathname.startsWith('/api/wellbeing')) {
    const handled = await handleWellbeingRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Rituals routes (daily rituals & streaks)
  if (pathname.startsWith('/api/rituals')) {
    const handled = await handleRitualsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Sky check routes (emotional weather tracking)
  if (pathname.startsWith('/api/sky-check')) {
    const handled = await handleSkyCheckRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Digital Twin profile routes
  if (pathname.startsWith('/api/twin')) {
    const handled = await handleTwinProfileRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Your Story dashboard routes (unified immersive data)
  if (pathname.startsWith('/api/your-story')) {
    const handled = await handleYourStoryRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Predictive insights routes
  if (pathname.startsWith('/api/insights')) {
    const userId = (req.headers['x-user-id'] as string) || 'anonymous';
    const handled = await handlePredictiveInsightsRequest(req, res, parsedUrl, userId);
    if (handled) return true;
  }

  return false;
}
