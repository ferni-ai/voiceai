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

import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';

// Trust Systems imports
import {
  // Phase 12: Relationship Health
  getHealthScore,
  calculateHealthScore,
  getStageName,
  getStageDescription,
  // Phase 13: Conversation Starters
  generateStarters,
  getBestStarter,
  // Phase 14: Life Events
  getUpcomingEvents,
  getEventsNeedingReminders,
  detectLifeEvents,
  saveEvent,
  recordEventOutcome,
  generateReminderMessage,
  generateFollowUpMessage,
  // Phase 15: Response Tuning
  generateTuningGuidance,
  // Phase 16: Celebration Momentum
  getMomentumProfile,
  getActiveStreaks,
  generateCelebrations,
  getMomentumSummary,
  // Phase 17: Sentiment Timeline
  getTimeline,
  getCurrentMoodContext,
  getRecentPeaksValleys,
  getInsightfulPatterns,
  exportTimelineData,
  // Phase 25: Journaling
  generatePrompts,
  getBestPrompt,
  getJournalingPatterns,
  generateSituationalPrompt,
  // Phase 26: Seasonal
  buildSeasonalContext,
  getSeasonalProfile,
  addPersonalDate,
  updateHolidayPreference,
  // Phase 27: Learning Style
  getLearningProfile,
  generateDeliveryGuidance,
  getStyleSummary,
  // Phase 28: Insights Reports
  generateReport,
  getReportHistory,
  getLatestReport,
  isReportDue,
  // Phase 29: Media Suggestions
  generateMediaSuggestions,
  getBestSuggestion,
  getSuggestionsForMood,
  recordSuggestionFeedback,
  getMediaPreferences,
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
  const method = req.method || 'GET';
  const query = parsedUrl.searchParams;
  const userId = getUserId(req, query);

  // Require userId for all routes
  if (!userId) {
    sendJson(res, 400, { error: 'userId required' });
    return true;
  }

  try {
    // ========================================================================
    // RELATIONSHIP HEALTH (Phase 12)
    // ========================================================================

    if (pathname === '/api/trust/health' && method === 'GET') {
      const health = getHealthScore(userId);
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
      const events = getUpcomingEvents(userId);
      sendJson(res, 200, events);
      return true;
    }

    if (pathname === '/api/trust/life-events' && method === 'POST') {
      const body = await parseBody(req);
      const detections = detectLifeEvents(userId, body.text as string);
      
      for (const detection of detections) {
        if (detection.detected && detection.event && detection.confidence > 0.5) {
          saveEvent({
            ...detection.event,
            userId,
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
      const reminders = getEventsNeedingReminders(userId);
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
      const profile = getMomentumProfile(userId);
      const streaks = getActiveStreaks(userId);
      const celebrations = generateCelebrations(userId);
      const summary = getMomentumSummary(userId);
      
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
      const timeline = getTimeline(userId);
      const exported = exportTimelineData(userId, period);
      const currentMood = getCurrentMoodContext(userId);
      const peaks = getRecentPeaksValleys(userId);
      const patterns = getInsightfulPatterns(userId);
      
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
      const situation = query.get('situation') as 'morning_routine' | 'evening_wind_down' | 'processing_emotion' | 'after_session' | null;
      
      if (situation) {
        const prompt = generateSituationalPrompt(userId, situation);
        sendJson(res, 200, { prompts: [prompt] });
      } else {
        const prompts = generatePrompts({
          userId,
          timeOfDay: getTimeOfDay(),
        }, 3);
        sendJson(res, 200, { prompts });
      }
      return true;
    }

    if (pathname === '/api/trust/journaling/patterns' && method === 'GET') {
      const patterns = getJournalingPatterns(userId);
      sendJson(res, 200, patterns || { message: 'Not enough data yet' });
      return true;
    }

    // ========================================================================
    // SEASONAL (Phase 26)
    // ========================================================================

    if (pathname === '/api/trust/seasonal' && method === 'GET') {
      const profile = getSeasonalProfile(userId);
      const context = buildSeasonalContext(userId);
      sendJson(res, 200, { profile, context });
      return true;
    }

    if (pathname === '/api/trust/seasonal/personal-date' && method === 'POST') {
      const body = await parseBody(req);
      const date = addPersonalDate(userId, {
        date: { month: body.month as number, day: body.day as number },
        name: body.name as string,
        type: (body.type as 'joyful' | 'difficult' | 'mixed' | 'milestone') || 'milestone',
        approach: (body.approach as 'celebrate' | 'acknowledge' | 'gentle' | 'avoid') || 'acknowledge',
      });
      sendJson(res, 201, date);
      return true;
    }

    if (pathname === '/api/trust/seasonal/holiday' && method === 'POST') {
      const body = await parseBody(req);
      updateHolidayPreference(userId, body.holiday as string, {
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
      const profile = getLearningProfile(userId);
      const guidance = generateDeliveryGuidance(userId);
      const summary = getStyleSummary(userId);
      sendJson(res, 200, { profile, guidance, summary });
      return true;
    }

    // ========================================================================
    // INSIGHTS REPORTS (Phase 28)
    // ========================================================================

    if (pathname === '/api/trust/insights' && method === 'GET') {
      const period = (query.get('period') as 'week' | 'month' | 'quarter' | 'year') || 'month';
      const latest = getLatestReport(userId, period);
      const history = getReportHistory(userId);
      const isDue = isReportDue(userId, period);
      
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
      const report = generateReport(userId, period);
      sendJson(res, 201, report);
      return true;
    }

    // ========================================================================
    // MEDIA SUGGESTIONS (Phase 29)
    // ========================================================================

    if (pathname === '/api/trust/media/suggestions' && method === 'GET') {
      const mood = query.get('mood') || 'neutral';
      const suggestions = generateMediaSuggestions(userId, {
        currentMood: mood,
        moodIntensity: parseFloat(query.get('intensity') || '0.5'),
        timeOfDay: getTimeOfDay(),
      });
      sendJson(res, 200, { suggestions });
      return true;
    }

    if (pathname === '/api/trust/media/best' && method === 'GET') {
      const mood = query.get('mood') || 'neutral';
      const suggestion = getBestSuggestion(userId, {
        currentMood: mood,
        moodIntensity: parseFloat(query.get('intensity') || '0.5'),
        timeOfDay: getTimeOfDay(),
      });
      sendJson(res, 200, { suggestion });
      return true;
    }

    if (pathname === '/api/trust/media/feedback' && method === 'POST') {
      const body = await parseBody(req);
      recordSuggestionFeedback(userId, body.suggestionId as string, {
        used: body.used as boolean,
        rating: body.rating as 1 | 2 | 3 | 4 | 5,
        helpedWith: body.helpedWith as string,
        mood: body.mood as string,
      });
      sendJson(res, 200, { recorded: true });
      return true;
    }

    if (pathname === '/api/trust/media/preferences' && method === 'GET') {
      const preferences = getMediaPreferences(userId);
      sendJson(res, 200, preferences || { message: 'No preferences set' });
      return true;
    }

    // ========================================================================
    // CONVERSATION STARTERS (Phase 13)
    // ========================================================================

    if (pathname === '/api/trust/starters' && method === 'GET') {
      const starters = generateStarters({ userId });
      const best = getBestStarter({ userId });
      sendJson(res, 200, { starters: starters.slice(0, 5), recommended: best });
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

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleTrustSystemsRoutes,
};

