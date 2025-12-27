/**
 * Human Listening Admin API Routes
 *
 * API endpoints for the Human Listening admin dashboard.
 * Provides metrics, signals, and live session data for
 * monitoring "Better than Human" listening capabilities.
 *
 * Routes:
 * - GET /api/v1/admin/human-listening/metrics   - Aggregate metrics
 * - GET /api/v1/admin/human-listening/signals   - Recent listening signals
 * - GET /api/v1/admin/human-listening/live      - Live session data
 *
 * @module HumanListeningAdminAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'HumanListeningAPI' });

// In-memory storage for listening events (would be Firestore in production)
interface ListeningEvent {
  sessionId: string;
  userId?: string;
  timestamp: number;
  signalType:
    | 'distress'
    | 'cognitive_load'
    | 'self_soothing'
    | 'hedging'
    | 'disengagement'
    | 'tremor'
    | 'energy_fade';
  severity: 'low' | 'medium' | 'high';
  details: string;
  actionTaken?: string;
}

interface LiveSessionData {
  sessionId: string;
  userId?: string;
  startTime: number;
  lastUpdate: number;
  cognitiveLoad: 'low' | 'medium' | 'high' | 'overloaded';
  engagement: 'high' | 'medium' | 'low' | 'distracted';
  emotionalUndercurrent?: string;
  lastSignal?: string;
}

// Storage
const recentEvents: ListeningEvent[] = [];
const liveSessions = new Map<string, LiveSessionData>();
const MAX_EVENTS = 1000;

/**
 * Record a listening event (called from voice-agent)
 */
export function recordListeningEvent(event: Omit<ListeningEvent, 'timestamp'>): void {
  const fullEvent: ListeningEvent = {
    ...event,
    timestamp: Date.now(),
  };

  recentEvents.unshift(fullEvent);

  // Keep only recent events
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.pop();
  }

  log.debug(
    {
      sessionId: event.sessionId,
      signalType: event.signalType,
      severity: event.severity,
    },
    '🎧 Listening event recorded'
  );
}

/**
 * Update live session data (called from voice-agent)
 */
export function updateLiveSession(data: Omit<LiveSessionData, 'lastUpdate'>): void {
  liveSessions.set(data.sessionId, {
    ...data,
    lastUpdate: Date.now(),
  });
}

/**
 * Remove session when it ends
 */
export function endLiveSession(sessionId: string): void {
  liveSessions.delete(sessionId);
}

/**
 * Clean up stale sessions (call periodically)
 */
export function cleanupStaleSessions(): void {
  const staleThreshold = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  for (const [sessionId, data] of liveSessions.entries()) {
    if (now - data.lastUpdate > staleThreshold) {
      liveSessions.delete(sessionId);
      log.debug({ sessionId }, 'Removed stale listening session');
    }
  }
}

// Run cleanup every minute
setInterval(cleanupStaleSessions, 60 * 1000);

/**
 * Handle human listening admin routes
 */
export async function handleHumanListeningRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const basePath = '/api/v1/admin/human-listening';

  // Only handle our routes
  if (!pathname.startsWith(basePath)) {
    return false;
  }

  // Set JSON content type
  res.setHeader('Content-Type', 'application/json');

  try {
    // GET /api/v1/admin/human-listening/metrics
    if (pathname === `${basePath}/metrics` && req.method === 'GET') {
      const metrics = calculateMetrics();
      res.writeHead(200);
      res.end(JSON.stringify(metrics));
      return true;
    }

    // GET /api/v1/admin/human-listening/signals
    if (pathname === `${basePath}/signals` && req.method === 'GET') {
      const signals = getRecentSignals(50);
      res.writeHead(200);
      res.end(JSON.stringify(signals));
      return true;
    }

    // GET /api/v1/admin/human-listening/live
    if (pathname === `${basePath}/live` && req.method === 'GET') {
      const sessions = getLiveSessions();
      res.writeHead(200);
      res.end(JSON.stringify(sessions));
      return true;
    }

    // Route not found
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return true;
  } catch (error) {
    log.error({ error }, 'Human listening API error');
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return true;
  }
}

/**
 * Calculate aggregate metrics
 */
function calculateMetrics() {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  // Filter events from last 24 hours
  const dayEvents = recentEvents.filter((e) => e.timestamp > oneDayAgo);

  // Count unique sessions
  const sessionIds = new Set(dayEvents.map((e) => e.sessionId));

  // Count by type
  const distressDetections = dayEvents.filter((e) => e.signalType === 'distress').length;
  const selfSoothingDetections = dayEvents.filter((e) => e.signalType === 'self_soothing').length;
  const hedgingDetections = dayEvents.filter((e) => e.signalType === 'hedging').length;
  const tremorDetections = dayEvents.filter((e) => e.signalType === 'tremor').length;
  const energyFadeDetections = dayEvents.filter((e) => e.signalType === 'energy_fade').length;

  // Calculate average cognitive load from recent sessions
  const cognitiveLoadEvents = dayEvents.filter((e) => e.signalType === 'cognitive_load');
  const avgCognitiveLoad =
    cognitiveLoadEvents.length > 0
      ? cognitiveLoadEvents.reduce((sum, e) => {
          const severityScore = e.severity === 'low' ? 0.3 : e.severity === 'medium' ? 0.6 : 0.9;
          return sum + severityScore;
        }, 0) / cognitiveLoadEvents.length
      : 0.35; // Default

  // Calculate engagement from disengagement events (inverse)
  const disengagementEvents = dayEvents.filter((e) => e.signalType === 'disengagement');
  const avgEngagement =
    sessionIds.size > 0 ? 1 - disengagementEvents.length / sessionIds.size : 0.78;

  return {
    totalSessions: sessionIds.size,
    distressDetections,
    avgCognitiveLoad: sessionIds.size > 0 ? avgCognitiveLoad : 0,
    avgEngagement: sessionIds.size > 0 ? Math.max(0, Math.min(1, avgEngagement)) : 0,
    selfSoothingDetections,
    hedgingDetections,
    tremorDetections,
    energyFadeDetections,
  };
}

/**
 * Get recent signals formatted for API
 */
function getRecentSignals(limit: number) {
  return recentEvents.slice(0, limit).map((e) => ({
    sessionId: e.sessionId,
    timestamp: new Date(e.timestamp).toISOString(),
    signalType: e.signalType,
    severity: e.severity,
    details: e.details,
    actionTaken: e.actionTaken,
  }));
}

/**
 * Get live sessions formatted for API
 */
function getLiveSessions() {
  const now = Date.now();
  return Array.from(liveSessions.values()).map((s) => ({
    sessionId: s.sessionId,
    userId: s.userId,
    cognitiveLoad: s.cognitiveLoad,
    engagement: s.engagement,
    emotionalUndercurrent: s.emotionalUndercurrent,
    lastSignal: s.lastSignal,
    duration: now - s.startTime,
  }));
}

export default {
  handleHumanListeningRoutes,
  recordListeningEvent,
  updateLiveSession,
  endLiveSession,
};
