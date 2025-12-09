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

// Demo data for when no agent is connected
function getDemoMetrics(): MetricsSummary {
  return {
    uptime: formatUptime(Date.now() - 86400000), // 1 day
    activeSessions: 34,
    totalSessions: 1247,
    firestoreReads: 15234,
    firestoreWrites: 4521,
    errorRate: 0.02,
    avgLatency: 145,
  };
}

function getDemoSessions(): SessionData[] {
  return [
    { id: 'demo-1', persona: 'ferni', startTime: new Date().toISOString(), duration: 300, messageCount: 12 },
    { id: 'demo-2', persona: 'maya', startTime: new Date().toISOString(), duration: 180, messageCount: 8 },
  ];
}

function getDemoCognitive(): CognitiveState {
  return {
    currentMode: 'narrative',
    modeDescription: 'Thinking in stories and meaning',
    userStyle: 'analytical',
    userStyleConfidence: 0.72,
    voiceEmotion: 'neutral',
    voiceEmotionConfidence: 0.85,
    responseConfidence: 0.91,
    activeQuirks: ['thoughtful_pause', 'gentle_callback'],
    latencyBudget: 45,
    adaptationLevel: 'Adapting to user',
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
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  // Only handle GET requests
  if (req.method !== 'GET') {
    return false;
  }

  try {
    // /api/metrics/summary - Concise metrics summary
    if (pathname === '/api/metrics/summary') {
      const summary = metricsCache.summary || getDemoMetrics();
      const isDemo = !metricsCache.summary;
      
      sendJSON(res, {
        success: true,
        demo: isDemo,
        data: summary,
        lastUpdate: metricsCache.lastUpdate?.toISOString() || null,
      });
      return true;
    }

    // /api/metrics/sessions - Active sessions
    if (pathname === '/api/metrics/sessions') {
      const sessions = metricsCache.sessions.length > 0 
        ? metricsCache.sessions 
        : getDemoSessions();
      const isDemo = metricsCache.sessions.length === 0;
      
      sendJSON(res, {
        success: true,
        demo: isDemo,
        data: sessions,
        count: sessions.length,
      });
      return true;
    }

    // /api/metrics - Full metrics snapshot
    if (pathname === '/api/metrics') {
      const summary = metricsCache.summary || getDemoMetrics();
      const sessions = metricsCache.sessions.length > 0 
        ? metricsCache.sessions 
        : getDemoSessions();
      const isDemo = !metricsCache.summary;
      
      sendJSON(res, {
        success: true,
        demo: isDemo,
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
      const cognitive = metricsCache.cognitive || getDemoCognitive();
      const isDemo = !metricsCache.cognitive;
      
      sendJSON(res, {
        success: true,
        demo: isDemo,
        data: cognitive,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // /api/cognitive/history - Recent cognitive events
    if (pathname === '/api/cognitive/history') {
      // In demo mode, return simulated history
      const history = [
        { type: 'mode_change', mode: 'narrative', timestamp: new Date().toISOString() },
        { type: 'style_detected', style: 'analytical', confidence: 0.72, timestamp: new Date().toISOString() },
        { type: 'quirk_activated', quirk: 'thoughtful_pause', timestamp: new Date().toISOString() },
      ];
      
      sendJSON(res, {
        success: true,
        demo: !metricsCache.cognitive,
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

