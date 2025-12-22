/**
 * Crash Report API Routes
 *
 * Receives crash reports from frontend clients and logs them for analysis.
 * This enables tracking client-side errors and connection issues.
 *
 * @module api/crash-report-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'CrashReportAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface FrontendCrashReport {
  // Error details
  errorName: string;
  errorMessage: string;
  errorStack?: string;

  // Context
  sessionId?: string;
  roomName?: string;
  userId?: string;
  personaId?: string;

  // Client state
  connectionState?: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  lastActivity?: string;
  turnCount?: number;
  lastUserMessage?: string;

  // Browser info
  userAgent?: string;
  url?: string;
  timestamp?: string;

  // Network info
  connectionType?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;

  // Custom data
  customData?: Record<string, unknown>;
}

interface CrashReportResponse {
  received: boolean;
  crashId: string;
  timestamp: string;
}

// ============================================================================
// STORAGE (In-memory for now, could be persisted)
// ============================================================================

const recentClientCrashes: Array<FrontendCrashReport & { crashId: string; receivedAt: string }> =
  [];
const MAX_STORED_CRASHES = 100;

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Handle crash report submission from frontend
 */
async function handleCrashReport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Parse body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const report: FrontendCrashReport = JSON.parse(body);

    // Generate crash ID
    const crashId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const receivedAt = new Date().toISOString();

    // Store crash report
    const storedReport = { ...report, crashId, receivedAt };
    recentClientCrashes.unshift(storedReport);
    if (recentClientCrashes.length > MAX_STORED_CRASHES) {
      recentClientCrashes.pop();
    }

    // Log with high visibility
    log.error(
      {
        crashId,
        errorName: report.errorName,
        errorMessage: report.errorMessage,
        sessionId: report.sessionId,
        roomName: report.roomName,
        userId: report.userId,
        personaId: report.personaId,
        connectionState: report.connectionState,
        turnCount: report.turnCount,
        lastUserMessage: report.lastUserMessage?.slice(0, 100),
        userAgent: report.userAgent?.slice(0, 100),
        connectionType: report.connectionType,
        effectiveType: report.effectiveType,
        rtt: report.rtt,
        stack: report.errorStack?.split('\n').slice(0, 8).join('\n'),
      },
      `🚨 [CLIENT-CRASH] ${report.errorName}: ${report.errorMessage}`
    );

    // Categorize crash for alerting
    const severity = categorizeCrash(report);
    if (severity === 'critical') {
      log.error({ crashId, severity }, '🔴 CRITICAL CLIENT CRASH - Requires immediate attention!');
    }

    // Send response
    const response: CrashReportResponse = {
      received: true,
      crashId,
      timestamp: receivedAt,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to process crash report');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid crash report format' }));
  }
}

/**
 * Get recent crash reports (for admin/debugging)
 */
async function handleGetCrashes(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const summary = {
    totalCrashes: recentClientCrashes.length,
    last24h: recentClientCrashes.filter(
      (c) => Date.now() - new Date(c.receivedAt).getTime() < 24 * 60 * 60 * 1000
    ).length,
    crashesByType: getCrashesByType(),
    crashesByConnectionState: getCrashesByConnectionState(),
    recentCrashes: recentClientCrashes.slice(0, 20).map((c) => ({
      crashId: c.crashId,
      receivedAt: c.receivedAt,
      errorName: c.errorName,
      errorMessage: c.errorMessage.slice(0, 100),
      sessionId: c.sessionId,
      connectionState: c.connectionState,
    })),
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(summary));
}

// ============================================================================
// HELPERS
// ============================================================================

function categorizeCrash(report: FrontendCrashReport): 'critical' | 'high' | 'medium' | 'low' {
  const msg = report.errorMessage.toLowerCase();

  // Critical: Connection lost during active conversation
  if (
    report.connectionState === 'connected' &&
    report.turnCount &&
    report.turnCount > 0 &&
    (msg.includes('disconnect') || msg.includes('connection'))
  ) {
    return 'critical';
  }

  // High: Any crash during connected state
  if (report.connectionState === 'connected') {
    return 'high';
  }

  // Medium: Connection errors
  if (msg.includes('connection') || msg.includes('websocket') || msg.includes('network')) {
    return 'medium';
  }

  return 'low';
}

function getCrashesByType(): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const crash of recentClientCrashes) {
    const type = crash.errorName || 'Unknown';
    byType[type] = (byType[type] || 0) + 1;
  }
  return byType;
}

function getCrashesByConnectionState(): Record<string, number> {
  const byState: Record<string, number> = {};
  for (const crash of recentClientCrashes) {
    const state = crash.connectionState || 'unknown';
    byState[state] = (byState[state] || 0) + 1;
  }
  return byState;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle crash report routes
 *
 * POST /api/crash-report - Submit a crash report
 * GET /api/crash-report - Get recent crash reports (admin)
 */
export async function handleCrashReportRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';

  if (!url.startsWith('/api/crash-report')) {
    return false;
  }

  // CORS headers for frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method === 'POST') {
    await handleCrashReport(req, res);
    return true;
  }

  if (req.method === 'GET') {
    await handleGetCrashes(req, res);
    return true;
  }

  return false;
}
