/**
 * Trust Journey API Routes
 *
 * Serves trust system data for the frontend visualization.
 * Powers the "Your Journey" feature showing:
 * - Growth reflections
 * - Boundary summary
 * - Inside jokes & callbacks
 * - Small wins celebrated
 * - Proactive outreach history
 *
 * PRIVACY: All data is user-scoped and requires authentication.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import {
  getActiveBoundaries,
  getGrowthPatterns,
  getSharedMoments,
  getUncelebratedWins,
  getPendingIntentions,
  getDueMoments,
  loadTrustProfiles,
  calculateUserMetrics,
} from '../services/trust-systems/index.js';

const log = createLogger({ module: 'TrustJourney' });

// ============================================================================
// TYPES
// ============================================================================

interface TrustJourneyData {
  userId: string;
  generatedAt: string;

  summary: {
    relationshipStrength: number;
    trustSignalsDetected: number;
    boundariesRespected: number;
    growthMomentsNoticed: number;
    sharedMomentsCount: number;
    winsCelebrated: number;
    proactiveOutreach: number;
  };

  growth: {
    patterns: Array<{
      type: string;
      count: number;
      significance: string;
    }>;
  };

  boundaries: {
    totalBoundaries: number;
    typeCounts: Record<string, number>;
    message: string;
  };

  sharedHistory: {
    insideJokes: Array<{
      id: string;
      type: string;
      hint: string;
      callbackCount: number;
    }>;
    runningGags: number;
  };

  celebrations: {
    wins: Array<{
      id: string;
      type: string;
      description: string;
      celebrated: boolean;
    }>;
    intentionsTracked: number;
  };

  timeline: Array<{
    date: string;
    type: 'growth' | 'boundary' | 'win' | 'callback' | 'outreach';
    title: string;
    description: string;
  }>;
}

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function getUserIdFromRequest(req: IncomingMessage, parsedUrl: URL): string | null {
  const headerUserId = req.headers['x-user-id'] as string;
  if (headerUserId) return headerUserId;

  const queryUserId = parsedUrl.searchParams.get('userId');
  if (queryUserId) return queryUserId;

  return null;
}

function calculateRelationshipStrength(metrics: {
  trustSignals: number;
  boundariesRespected: number;
  growthMoments: number;
  sharedMoments: number;
  wins: number;
  outreach: number;
}): number {
  const weights = {
    trustSignals: 0.15,
    boundaries: 0.25,
    growth: 0.2,
    sharedMoments: 0.15,
    wins: 0.15,
    outreach: 0.1,
  };

  const normalized = {
    trustSignals: Math.min(metrics.trustSignals / 50, 1),
    boundaries: Math.min(metrics.boundariesRespected / 10, 1),
    growth: Math.min(metrics.growthMoments / 20, 1),
    sharedMoments: Math.min(metrics.sharedMoments / 15, 1),
    wins: Math.min(metrics.wins / 30, 1),
    outreach: Math.min(metrics.outreach / 10, 1),
  };

  const score =
    normalized.trustSignals * weights.trustSignals * 100 +
    normalized.boundaries * weights.boundaries * 100 +
    normalized.growth * weights.growth * 100 +
    normalized.sharedMoments * weights.sharedMoments * 100 +
    normalized.wins * weights.wins * 100 +
    normalized.outreach * weights.outreach * 100;

  return Math.round(score);
}

function truncateForPrivacy(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.substring(0, maxLen - 3)}...`;
}

function formatGrowthType(type: string): string {
  const labels: Record<string, string> = {
    emotional_regulation: 'Emotional growth',
    perspective_shift: 'New perspective',
    boundary_setting: 'Boundary setting',
    behavior_change: 'Behavior change',
    self_awareness: 'Self-awareness',
    coping_upgrade: 'Better coping',
    goal_progress: 'Goal progress',
  };
  return labels[type] || 'Personal growth';
}

function formatWinType(type: string): string {
  const labels: Record<string, string> = {
    followed_through: 'Followed through',
    courage_moment: 'Brave moment',
    self_care: 'Self-care',
    boundary_held: 'Held boundary',
    hard_conversation: 'Difficult talk',
    showed_up: 'Showed up',
    tried_new_thing: 'Tried something new',
    asked_for_help: 'Asked for help',
    let_it_go: 'Let it go',
    effort_made: 'Made effort',
  };
  return labels[type] || 'Small win';
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleTrustJourneyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith('/api/trust-journey')) {
    return false;
  }

  // Apply rate limiting (60 requests per minute)
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000, keyPrefix: 'trust-journey' })) {
    return true; // Rate limited
  }

  const userId = getUserIdFromRequest(req, parsedUrl);
  if (!userId) {
    sendError(res, 'User ID required', 401);
    return true;
  }

  if (pathname === '/api/trust-journey' && req.method === 'GET') {
    try {
      const journey = await buildTrustJourney(userId);
      sendJson(res, journey);
      return true;
    } catch (err) {
      log.error({ error: err }, 'Error building journey');
      sendError(res, 'Failed to build trust journey', 500);
      return true;
    }
  }

  if (pathname === '/api/trust-journey/summary' && req.method === 'GET') {
    try {
      const journey = await buildTrustJourney(userId);
      sendJson(res, {
        userId,
        summary: journey.summary,
        generatedAt: journey.generatedAt,
      });
      return true;
    } catch (err) {
      log.error({ error: err }, 'Error building summary');
      sendError(res, 'Failed to build trust summary', 500);
      return true;
    }
  }

  if (pathname === '/api/trust-journey/timeline' && req.method === 'GET') {
    try {
      const journey = await buildTrustJourney(userId);
      sendJson(res, {
        userId,
        timeline: journey.timeline,
        generatedAt: journey.generatedAt,
      });
      return true;
    } catch (err) {
      log.error({ error: err }, 'Error building timeline');
      sendError(res, 'Failed to build timeline', 500);
      return true;
    }
  }

  if (pathname === '/api/trust-journey/metrics' && req.method === 'GET') {
    try {
      const daysBack = parseInt(parsedUrl.searchParams.get('days') || '30', 10);
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

      const metrics = calculateUserMetrics(userId, startDate, endDate);
      sendJson(res, {
        userId,
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        metrics,
      });
      return true;
    } catch (err) {
      log.error({ error: err }, 'Error calculating metrics');
      sendError(res, 'Failed to calculate metrics', 500);
      return true;
    }
  }

  return false;
}

// ============================================================================
// JOURNEY BUILDER
// ============================================================================

async function buildTrustJourney(userId: string): Promise<TrustJourneyData> {
  // Ensure trust profiles are loaded
  await loadTrustProfiles(userId);

  // Gather data from each system (these return actual data structures)
  const boundaries = getActiveBoundaries(userId);
  const growthPatterns = getGrowthPatterns(userId);
  const sharedMoments = getSharedMoments(userId);
  const uncelebratedWins = getUncelebratedWins(userId);
  const pendingIntentions = getPendingIntentions(userId);
  const dueMoments = getDueMoments(userId);

  // Calculate summary metrics
  const summary = {
    relationshipStrength: calculateRelationshipStrength({
      trustSignals: growthPatterns.length + boundaries.length,
      boundariesRespected: boundaries.length,
      growthMoments: growthPatterns.length,
      sharedMoments: sharedMoments.length,
      wins: uncelebratedWins.length,
      outreach: dueMoments.length,
    }),
    trustSignalsDetected: growthPatterns.length + boundaries.length,
    boundariesRespected: boundaries.length,
    growthMomentsNoticed: growthPatterns.length,
    sharedMomentsCount: sharedMoments.length,
    winsCelebrated: uncelebratedWins.filter((w) => w.celebrated).length,
    proactiveOutreach: dueMoments.length,
  };

  // Build boundary summary (privacy-preserving)
  const boundaryTypeCounts: Record<string, number> = {};
  for (const boundary of boundaries) {
    boundaryTypeCounts[boundary.type] = (boundaryTypeCounts[boundary.type] || 0) + 1;
  }

  // Build timeline
  const timeline: TrustJourneyData['timeline'] = [];

  // Add growth patterns to timeline
  for (const pattern of growthPatterns.slice(0, 10)) {
    const afterDate = pattern.after?.firstSeen;
    timeline.push({
      date: afterDate ? afterDate.toISOString() : new Date().toISOString(),
      type: 'growth',
      title: formatGrowthType(pattern.type),
      description: pattern.after?.pattern || 'Growth observed',
    });
  }

  // Add wins to timeline
  for (const win of uncelebratedWins.slice(0, 10)) {
    timeline.push({
      date: win.timestamp.toISOString(),
      type: 'win',
      title: formatWinType(win.type),
      description: win.description,
    });
  }

  // Add shared moments to timeline
  for (const moment of sharedMoments.filter((m) => m.callbackCount > 0).slice(0, 5)) {
    const originDate = moment.origin?.timestamp;
    timeline.push({
      date: originDate ? originDate.toISOString() : new Date().toISOString(),
      type: 'callback',
      title: 'Shared moment',
      description: `Referenced ${moment.callbackCount} times`,
    });
  }

  // Sort timeline by date (most recent first)
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    userId,
    generatedAt: new Date().toISOString(),
    summary,
    growth: {
      patterns: growthPatterns.slice(0, 20).map((p) => ({
        type: p.type,
        count: p.timesObserved,
        significance: p.significance,
      })),
    },
    boundaries: {
      totalBoundaries: boundaries.length,
      typeCounts: boundaryTypeCounts,
      message:
        boundaries.length > 0
          ? `We've honored ${boundaries.length} thing${boundaries.length > 1 ? 's' : ''} you'd rather not discuss.`
          : "No boundaries set yet. I'll always respect your space.",
    },
    sharedHistory: {
      insideJokes: sharedMoments.slice(0, 15).map((m) => ({
        id: m.id,
        type: m.type,
        hint: truncateForPrivacy(m.content, 50),
        callbackCount: m.callbackCount,
      })),
      runningGags: sharedMoments.filter((m) => m.type === 'running_gag').length,
    },
    celebrations: {
      wins: uncelebratedWins.slice(0, 20).map((w) => ({
        id: w.id,
        type: w.type,
        description: w.description,
        celebrated: w.celebrated,
      })),
      intentionsTracked: pendingIntentions.length,
    },
    timeline: timeline.slice(0, 50),
  };
}
