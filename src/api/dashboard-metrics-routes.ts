/**
 * Dashboard Metrics API Routes
 *
 * Provides /api/metrics/* and /api/cognitive/* endpoints for HTML dashboards.
 * These were previously served by health-server.ts in the voice agent,
 * but need to be available from ui-server for production dashboards.
 *
 * In production: Returns cached/aggregated data from the system
 * When agent connected: Proxies to actual agent health endpoints
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded } from './helpers.js';

const log = createLogger({ module: 'DashboardMetricsAPI' });

// Cache for metrics data (updated by agent heartbeats)
interface MetricsCache {
  summary: MetricsSummary | null;
  sessions: SessionData[];
  cognitive: CognitiveState | null;
  lastUpdate: Date | null;
}

interface MetricsSummary {
  uptime: string;
  activeSessions: number;
  totalSessions: number;
  firestoreReads: number;
  firestoreWrites: number;
  errorRate: number;
  avgLatency: number;
}

interface SessionData {
  id: string;
  persona: string;
  startTime: string;
  duration: number;
  messageCount: number;
}

interface CognitiveState {
  currentMode: string;
  modeDescription: string;
  userStyle: string;
  userStyleConfidence: number;
  voiceEmotion: string;
  voiceEmotionConfidence: number;
  responseConfidence: number;
  activeQuirks: string[];
  latencyBudget: number;
  adaptationLevel: string;
}

const metricsCache: MetricsCache = {
  summary: null,
  sessions: [],
  cognitive: null,
  lastUpdate: null,
};

// Empty data for when no agent is connected
// NOTE: No longer returning fake demo data - dashboard should show zeros/empty
function getEmptyMetrics(): MetricsSummary {
  return {
    uptime: '00:00:00',
    activeSessions: 0,
    totalSessions: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
    errorRate: 0,
    avgLatency: 0,
  };
}

function getEmptySessions(): SessionData[] {
  return [];
}

function getEmptyCognitive(): CognitiveState {
  return {
    currentMode: 'unknown',
    modeDescription: 'No active session',
    userStyle: 'unknown',
    userStyleConfidence: 0,
    voiceEmotion: 'unknown',
    voiceEmotionConfidence: 0,
    responseConfidence: 0,
    activeQuirks: [],
    latencyBudget: 0,
    adaptationLevel: 'Not connected',
  };
}

function formatUptime(startTimestamp: number): string {
  const ms = Date.now() - startTimestamp;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  // CORS headers are set by handleCorsPreflightIfNeeded() in the main handler
  res.writeHead(status, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}

/**
 * Update metrics cache (called by agent heartbeats)
 */
export function updateMetricsCache(data: Partial<MetricsCache>): void {
  if (data.summary) metricsCache.summary = data.summary;
  if (data.sessions) metricsCache.sessions = data.sessions;
  if (data.cognitive) metricsCache.cognitive = data.cognitive;
  metricsCache.lastUpdate = new Date();
}

/**
 * Handle dashboard metrics API routes
 */
export async function handleDashboardMetricsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle GET requests
  if (req.method !== 'GET') {
    return false;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  try {
    // /api/metrics/summary - Concise metrics summary
    if (pathname === '/api/metrics/summary') {
      const summary = metricsCache.summary || getEmptyMetrics();
      const hasRealData = !!metricsCache.summary;

      sendJSON(res, {
        success: true,
        hasRealData,
        data: summary,
        lastUpdate: metricsCache.lastUpdate?.toISOString() || null,
      });
      return true;
    }

    // /api/metrics/sessions - Active sessions
    if (pathname === '/api/metrics/sessions') {
      const sessions =
        metricsCache.sessions.length > 0 ? metricsCache.sessions : getEmptySessions();
      const hasRealData = metricsCache.sessions.length > 0;

      sendJSON(res, {
        success: true,
        hasRealData,
        data: sessions,
        count: sessions.length,
      });
      return true;
    }

    // /api/metrics - Full metrics snapshot
    if (pathname === '/api/metrics') {
      const summary = metricsCache.summary || getEmptyMetrics();
      const sessions =
        metricsCache.sessions.length > 0 ? metricsCache.sessions : getEmptySessions();
      const hasRealData = !!metricsCache.summary;

      sendJSON(res, {
        success: true,
        hasRealData,
        data: {
          summary,
          sessions,
          sessionCount: sessions.length,
        },
        lastUpdate: metricsCache.lastUpdate?.toISOString() || null,
      });
      return true;
    }

    // /api/cognitive/state or /api/cognitive - Current cognitive state
    if (pathname === '/api/cognitive' || pathname === '/api/cognitive/state') {
      const cognitive = metricsCache.cognitive || getEmptyCognitive();
      const hasRealData = !!metricsCache.cognitive;

      sendJSON(res, {
        success: true,
        hasRealData,
        data: cognitive,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // /api/cognitive/history - Recent cognitive events
    if (pathname === '/api/cognitive/history') {
      // Return empty history when no real data
      const hasRealData = !!metricsCache.cognitive;
      const history: Array<{ type: string; timestamp: string; [key: string]: unknown }> = [];

      sendJSON(res, {
        success: true,
        hasRealData,
        data: history,
        count: history.length,
      });
      return true;
    }

    return false;
  } catch (err) {
    log.error({ error: err }, 'Dashboard metrics API error');
    sendJSON(res, { success: false, error: 'Internal server error' }, 500);
    return true;
  }
}
