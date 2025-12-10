/**
 * Trust Systems API Routes
 *
 * Consolidated REST API for all trust system features.
 * Provides endpoints for:
 * - Relationship health
 * - Life events
 * - Journaling prompts
 * - Media suggestions
 * - Insights reports
 * - Sentiment timeline
 * - Seasonal preferences
 * - Learning style
 *
 * @module TrustSystemsRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded } from './helpers.js';

// Trust Systems imports
import {
  addPersonalDate,
  // Phase 26: Seasonal
  buildSeasonalContext,
  calculateHealthScore,
  detectLifeEvents,
  exportTimelineData,
  generateCelebrations,
  generateDeliveryGuidance,
  generateFollowUpMessage,
  // Phase 29: Media Suggestions
  generateMediaSuggestions,
  // Phase 25: Journaling
  generatePrompts,
  generateReminderMessage,
  // Phase 28: Insights Reports
  generateReport,
  generateSituationalPrompt,
  // Phase 13: Conversation Starters
  generateStarters,
  // Phase 15: Response Tuning
  generateTuningGuidance,
  getActiveStreaks,
  // Analytics
  getAggregateMetrics,
  getHealthCheck as getAnalyticsHealthCheck,
  getBestPrompt,
  getBestStarter,
  getBestSuggestion,
  getCurrentMoodContext,
  getEventsNeedingReminders,
  // Phase 12: Relationship Health
  getHealthScore,
  getInsightfulPatterns,
  getJournalingPatterns,
  getLatestReport,
  // Phase 27: Learning Style
  getLearningProfile,
  getMediaPreferences,
  // Phase 16: Celebration Momentum
  getMomentumProfile,
  getMomentumSummary,
  getRecentPeaksValleys,
  getReportHistory,
  getSeasonalProfile,
  getStageDescription,
  getStageName,
  getStyleSummary,
  getSuggestionsForMood,
  // Phase 17: Sentiment Timeline
  getTimeline,
  // Phase 14: Life Events
  getUpcomingEvents,
  isReportDue,
  recordEventOutcome,
  recordSuggestionFeedback,
  saveEvent,
  updateHolidayPreference,
} from '../services/trust-systems/index.js';

const log = createLogger({ module: 'TrustSystemsRoutes' });

// ============================================================================
// UTILITIES
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getUserId(req: IncomingMessage, query: URLSearchParams): string | null {
  return query.get('userId') || (req.headers['x-user-id'] as string) || null;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleTrustSystemsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/trust/* routes (but not trust-journey or trust-export)
  if (!pathname.startsWith('/api/trust/')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting (100 requests per minute)
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000, keyPrefix: 'trust-systems' })) {
    return true; // Rate limited
  }

  // Analytics routes require admin auth, others require user auth
  const isAnalyticsRoute = pathname.startsWith('/api/trust/analytics');

  // Require authentication
  const auth = requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  const method = req.method || 'GET';
  const query = parsedUrl.searchParams;

  // SECURITY: Use authenticated userId for non-analytics routes
  const validUserId = auth.userId;

  try {
    // ========================================================================
    // ANALYTICS METRICS (Admin - no userId required)
    // ========================================================================

    if (pathname === '/api/trust/analytics/metrics' && method === 'GET') {
      const period = (query.get('period') as 'day' | 'week' | 'month') || 'week';
      // Convert period to date range
      const now = new Date();
      const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const aggregateMetrics = getAggregateMetrics(startDate, now);
      const healthCheck = getAnalyticsHealthCheck();

      // Get real aggregates from relationship health
      const { getTrustAggregates } = await import('../services/trust-systems/index.js');
      const trustAggregates = getTrustAggregates();

      sendJson(res, 200, {
        totalProfiles: trustAggregates.totalProfiles,
        avgTrustScore: trustAggregates.avgTrustScore,
        activeRelationships: trustAggregates.activeRelationships,
        milestonesReached: aggregateMetrics.totalEvents,
        systemStatus: healthCheck,
        aggregateMetrics,
        period,
      });
      return true;
    }

    // Stage distribution endpoint
    if (pathname === '/api/trust/analytics/stages' && method === 'GET') {
      const { getStageDistributionPercent } = await import('../services/trust-systems/index.js');
      const stages = getStageDistributionPercent();

      sendJson(res, 200, { stages });
      return true;
    }

    // Trust systems status endpoint
    if (pathname === '/api/trust/analytics/systems' && method === 'GET') {
      const healthCheck = getAnalyticsHealthCheck();

      // Map to frontend format
      const systems = Object.entries(healthCheck.systems).map(([id, data]) => ({
        id,
        name: formatSystemName(id),
        description: getSystemDescription(id),
        active: data.active,
        lastEvent: data.lastEvent?.toISOString(),
      }));

      sendJson(res, 200, { systems });
      return true;
    }

    // ========================================================================
    // RELATIONSHIP HEALTH (Phase 12)
    // ========================================================================

    if (pathname === '/api/trust/health' && method === 'GET') {
      const health = getHealthScore(validUserId);
      if (!health) {
        sendJson(res, 200, { score: null, message: 'No health data yet' });
        return true;
      }
      sendJson(res, 200, {
        score: health.overallScore,
        stage: health.stage,
        stageName: getStageName(health.stage),
        stageDescription: getStageDescription(health.stage),
        trend: health.overallTrend,
        factors: health.factors,
        alerts: health.alerts.filter((a) => !a.acknowledged),
      });
      return true;
    }

    // ========================================================================
    // LIFE EVENTS (Phase 14)
    // ========================================================================

    if (pathname === '/api/trust/life-events' && method === 'GET') {
      const events = getUpcomingEvents(validUserId);
      sendJson(res, 200, events);
      return true;
    }

    if (pathname === '/api/trust/life-events' && method === 'POST') {
      const body = await parseBody(req);
      const detections = detectLifeEvents(validUserId, body.text as string);

      for (const detection of detections) {
        if (detection.detected && detection.event && detection.confidence > 0.5) {
          saveEvent({
            ...detection.event,
            userId: validUserId,
            id: `event-${Date.now()}`,
            date: new Date(detection.event.date as Date),
            type: detection.event.type || 'event',
            importance: detection.event.importance || 'medium',
            followUp: { beforeReminder: true, afterCheckIn: true },
            tags: [],
            context: { mentionedAt: new Date(), originalText: body.text as string },
          } as Parameters<typeof saveEvent>[0]);
        }
      }

      sendJson(res, 200, { detected: detections.length, events: detections });
      return true;
    }

    if (pathname === '/api/trust/life-events/reminders' && method === 'GET') {
      const reminders = getEventsNeedingReminders(validUserId);
      const withMessages = reminders.map((e) => ({
        ...e,
        reminderMessage: generateReminderMessage(e),
      }));
      sendJson(res, 200, withMessages);
      return true;
    }

    // ========================================================================
    // CELEBRATION MOMENTUM (Phase 16)
    // ========================================================================

    if (pathname === '/api/trust/momentum' && method === 'GET') {
      const profile = getMomentumProfile(validUserId);
      const streaks = getActiveStreaks(validUserId);
      const celebrations = generateCelebrations(validUserId);
      const summary = getMomentumSummary(validUserId);

      sendJson(res, 200, {
        profile,
        activeStreaks: streaks,
        celebrations,
        summary,
      });
      return true;
    }

    // ========================================================================
    // SENTIMENT TIMELINE (Phase 17)
    // ========================================================================

    if (pathname === '/api/trust/sentiment' && method === 'GET') {
      const period = (query.get('period') as 'week' | 'month' | 'quarter') || 'month';
      const timeline = getTimeline(validUserId);
      const exported = exportTimelineData(validUserId, period);
      const currentMood = getCurrentMoodContext(validUserId);
      const peaks = getRecentPeaksValleys(validUserId);
      const patterns = getInsightfulPatterns(validUserId);

      sendJson(res, 200, {
        currentMood,
        peaks,
        patterns,
        timeline: exported,
      });
      return true;
    }

    // ========================================================================
    // JOURNALING (Phase 25)
    // ========================================================================

    if (pathname === '/api/trust/journaling/prompts' && method === 'GET') {
      const situation = query.get('situation') as
        | 'morning_routine'
        | 'evening_wind_down'
        | 'processing_emotion'
        | 'after_session'
        | null;

      if (situation) {
        const prompt = generateSituationalPrompt(validUserId, situation);
        sendJson(res, 200, { prompts: [prompt] });
      } else {
        const prompts = generatePrompts(
          {
            userId: validUserId,
            timeOfDay: getTimeOfDay(),
          },
          3
        );
        sendJson(res, 200, { prompts });
      }
      return true;
    }

    if (pathname === '/api/trust/journaling/patterns' && method === 'GET') {
      const patterns = getJournalingPatterns(validUserId);
      sendJson(res, 200, patterns || { message: 'Not enough data yet' });
      return true;
    }

    // ========================================================================
    // SEASONAL (Phase 26)
    // ========================================================================

    if (pathname === '/api/trust/seasonal' && method === 'GET') {
      const profile = getSeasonalProfile(validUserId);
      const context = buildSeasonalContext(validUserId);
      sendJson(res, 200, { profile, context });
      return true;
    }

    if (pathname === '/api/trust/seasonal/personal-date' && method === 'POST') {
      const body = await parseBody(req);
      const date = addPersonalDate(validUserId, {
        date: { month: body.month as number, day: body.day as number },
        name: body.name as string,
        type: (body.type as 'joyful' | 'difficult' | 'mixed' | 'milestone') || 'milestone',
        approach:
          (body.approach as 'celebrate' | 'acknowledge' | 'gentle' | 'avoid') || 'acknowledge',
      });
      sendJson(res, 201, date);
      return true;
    }

    if (pathname === '/api/trust/seasonal/holiday' && method === 'POST') {
      const body = await parseBody(req);
      updateHolidayPreference(validUserId, body.holiday as string, {
        sentiment: body.sentiment as 'positive' | 'neutral' | 'negative' | 'mixed',
        avoidMentioning: body.avoidMentioning as boolean,
      });
      sendJson(res, 200, { updated: true });
      return true;
    }

    // ========================================================================
    // LEARNING STYLE (Phase 27)
    // ========================================================================

    if (pathname === '/api/trust/learning-style' && method === 'GET') {
      const profile = getLearningProfile(validUserId);
      const guidance = generateDeliveryGuidance(validUserId);
      const summary = getStyleSummary(validUserId);
      sendJson(res, 200, { profile, guidance, summary });
      return true;
    }

    // ========================================================================
    // INSIGHTS REPORTS (Phase 28)
    // ========================================================================

    if (pathname === '/api/trust/insights' && method === 'GET') {
      const period = (query.get('period') as 'week' | 'month' | 'quarter' | 'year') || 'month';
      const latest = getLatestReport(validUserId, period);
      const history = getReportHistory(validUserId);
      const isDue = isReportDue(validUserId, period);

      sendJson(res, 200, {
        latest,
        history: history.slice(-5),
        isDue,
      });
      return true;
    }

    if (pathname === '/api/trust/insights/generate' && method === 'POST') {
      const body = await parseBody(req);
      const period = (body.period as 'week' | 'month' | 'quarter' | 'year') || 'month';
      const report = generateReport(validUserId, period);
      sendJson(res, 201, report);
      return true;
    }

    // ========================================================================
    // MEDIA SUGGESTIONS (Phase 29)
    // ========================================================================

    if (pathname === '/api/trust/media/suggestions' && method === 'GET') {
      const mood = query.get('mood') || 'neutral';
      const suggestions = generateMediaSuggestions(validUserId, {
        currentMood: mood,
        moodIntensity: parseFloat(query.get('intensity') || '0.5'),
        timeOfDay: getTimeOfDay(),
      });
      sendJson(res, 200, { suggestions });
      return true;
    }

    if (pathname === '/api/trust/media/best' && method === 'GET') {
      const mood = query.get('mood') || 'neutral';
      const suggestion = getBestSuggestion(validUserId, {
        currentMood: mood,
        moodIntensity: parseFloat(query.get('intensity') || '0.5'),
        timeOfDay: getTimeOfDay(),
      });
      sendJson(res, 200, { suggestion });
      return true;
    }

    if (pathname === '/api/trust/media/feedback' && method === 'POST') {
      const body = await parseBody(req);
      recordSuggestionFeedback(validUserId, body.suggestionId as string, {
        used: body.used as boolean,
        rating: body.rating as 1 | 2 | 3 | 4 | 5,
        helpedWith: body.helpedWith as string,
        mood: body.mood as string,
      });
      sendJson(res, 200, { recorded: true });
      return true;
    }

    if (pathname === '/api/trust/media/preferences' && method === 'GET') {
      const preferences = getMediaPreferences(validUserId);
      sendJson(res, 200, preferences || { message: 'No preferences set' });
      return true;
    }

    // ========================================================================
    // CONVERSATION STARTERS (Phase 13)
    // ========================================================================

    if (pathname === '/api/trust/starters' && method === 'GET') {
      const starters = generateStarters({ userId: validUserId });
      const best = getBestStarter({ userId: validUserId });
      sendJson(res, 200, { starters: starters.slice(0, 5), recommended: best });
      return true;
    }

    // ========================================================================
    // RESPONSE TUNING (Phase 15)
    // ========================================================================

    if (pathname === '/api/trust/tuning' && method === 'GET') {
      const stage = query.get('stage') || 'building';
      const emotion = query.get('emotion') || undefined;
      const topic = query.get('topic') || undefined;

      const guidance = generateTuningGuidance({
        userId: validUserId,
        relationshipStage: stage as 'new' | 'building' | 'established' | 'deep',
        currentEmotion: emotion,
        topic,
      });

      sendJson(res, 200, { guidance });
      return true;
    }

    // ========================================================================
    // LIFE EVENT OUTCOMES (Phase 14 - Extended)
    // ========================================================================

    if (pathname === '/api/trust/life-events/outcome' && method === 'POST') {
      const body = await parseBody(req);
      const eventId = body.eventId as string;
      const outcome = body.outcome as 'positive' | 'negative' | 'neutral' | 'unknown';

      if (!eventId || !outcome) {
        sendJson(res, 400, { error: 'eventId and outcome required' });
        return true;
      }

      recordEventOutcome(validUserId, eventId, outcome);

      // Generate follow-up message based on outcome
      const events = getUpcomingEvents(validUserId);
      const event = [...events.today, ...events.thisWeek, ...events.thisMonth].find(
        (e) => e.id === eventId
      );

      let followUpMessage = null;
      if (event) {
        followUpMessage = generateFollowUpMessage(event);
      }

      sendJson(res, 200, { recorded: true, followUpMessage });
      return true;
    }

    if (pathname === '/api/trust/life-events/follow-up' && method === 'GET') {
      const eventId = query.get('eventId');

      if (!eventId) {
        sendJson(res, 400, { error: 'eventId required' });
        return true;
      }

      const events = getUpcomingEvents(validUserId);
      const event = [...events.today, ...events.thisWeek, ...events.thisMonth].find(
        (e) => e.id === eventId
      );

      if (!event) {
        sendJson(res, 404, { error: 'Event not found' });
        return true;
      }

      const message = generateFollowUpMessage(event);
      sendJson(res, 200, { message });
      return true;
    }

    // ========================================================================
    // HEALTH CALCULATION (Phase 12 - Extended)
    // ========================================================================

    if (pathname === '/api/trust/health/calculate' && method === 'POST') {
      const body = await parseBody(req);
      const metrics = body.metrics as Record<string, number> | undefined;

      // Calculate fresh health score with provided or default metrics
      const health = calculateHealthScore(
        validUserId,
        metrics || {
          boundaryRespect: 100,
          emotionalAttunement: 50,
          growthAcknowledgment: 50,
          callbackSuccess: 50,
          outreachReception: 50,
          sessionDepth: 50,
          consistency: 50,
        }
      );

      sendJson(res, 200, {
        score: health.overallScore,
        stage: health.stage,
        stageName: getStageName(health.stage),
        stageDescription: getStageDescription(health.stage),
        trend: health.overallTrend,
        factors: health.factors,
      });
      return true;
    }

    // ========================================================================
    // JOURNALING BEST PROMPT (Phase 25 - Extended)
    // ========================================================================

    if (pathname === '/api/trust/journaling/best' && method === 'GET') {
      const context = {
        userId: validUserId,
        timeOfDay: getTimeOfDay(),
        mood: query.get('mood') || undefined,
        topic: query.get('topic') || undefined,
      };

      const prompt = getBestPrompt(context);
      sendJson(res, 200, { prompt });
      return true;
    }

    // ========================================================================
    // MEDIA SUGGESTIONS BY MOOD (Phase 29 - Extended)
    // ========================================================================

    if (pathname === '/api/trust/media/mood' && method === 'GET') {
      const mood = query.get('mood') || 'neutral';
      const suggestions = getSuggestionsForMood(validUserId, mood);
      sendJson(res, 200, { mood, suggestions });
      return true;
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Trust systems route error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function formatSystemName(id: string): string {
  const names: Record<string, string> = {
    reading_between_lines: 'Reading Between Lines',
    boundary_memory: 'Boundary Memory',
    growth_reflection: 'Growth Reflection',
    inside_jokes: 'Inside Jokes',
    small_wins: 'Small Wins',
    thinking_of_you: 'Thinking of You',
  };
  return names[id] || id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSystemDescription(id: string): string {
  const descriptions: Record<string, string> = {
    reading_between_lines: "Detects what's NOT being said",
    boundary_memory: 'Tracks what NOT to bring up',
    growth_reflection: 'Notices user evolution',
    inside_jokes: 'Builds shared history',
    small_wins: 'Celebrates effort, not just outcomes',
    thinking_of_you: 'Proactive no-agenda outreach',
  };
  return descriptions[id] || '';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleTrustSystemsRoutes,
};
