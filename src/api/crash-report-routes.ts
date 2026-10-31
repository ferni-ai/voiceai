/**
 * Crash Report API Routes
 *
 * Receives crash reports from frontend clients and logs them for analysis.
 * This enables tracking client-side errors and connection issues.
 *
 * Posts need no sign-in (a crash can come first); they are rate limited per
 * caller and validated (crash-report-input.ts). Reads are admin-only.
 *
 * @module api/crash-report-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { setCorsHeaders } from '../servers/shared/cors.js';
import { rateLimit, requireAdmin } from './auth-middleware.js';
import { sendError } from './helpers.js';
import {
  crashReportBodySchema,
  disconnectDiagnosticBodySchema,
  readValidatedBody,
  type DisconnectDiagnostic,
  type FrontendCrashReport,
} from './crash-report-input.js';

const log = createLogger({ module: 'CrashReportAPI' });

/** Posts allowed per caller (signed-in person, else IP) per minute, per route. */
export const CRASH_REPORT_POSTS_PER_MINUTE = 20;

// ============================================================================
// STORAGE (In-memory for now, could be persisted)
// ============================================================================

const recentClientCrashes: Array<FrontendCrashReport & { crashId: string; receivedAt: string }> =
  [];
const MAX_STORED_CRASHES = 100;

// Disconnect diagnostics storage
const recentDisconnectDiagnostics: Array<
  DisconnectDiagnostic & { id: string; receivedAt: string }
> = [];
const MAX_STORED_DIAGNOSTICS = 100;

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

  const report = await readValidatedBody(req, res, crashReportBodySchema);
  if (!report) return;

  try {
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
        lastUserMessageLen: report.lastUserMessage?.length,
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

    // The reply carries only the new id, never stored data
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, crashId, timestamp: receivedAt }));
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to process crash report');
    sendError(res, 'Could not process the crash report', 500);
  }
}

/**
 * Handle disconnect diagnostic submission from frontend
 */
async function handleDisconnectDiagnostic(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const diagnostic = await readValidatedBody(req, res, disconnectDiagnosticBodySchema);
  if (!diagnostic) return;

  try {
    // Generate ID
    const id = `disconnect_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const receivedAt = new Date().toISOString();

    // Store diagnostic
    const stored = { ...diagnostic, id, receivedAt };
    recentDisconnectDiagnostics.unshift(stored);
    if (recentDisconnectDiagnostics.length > MAX_STORED_DIAGNOSTICS) {
      recentDisconnectDiagnostics.pop();
    }

    // Determine severity
    const isUnexpected = !diagnostic.wasGraceful;
    const hadActiveSession = diagnostic.sessionDurationMs > 5000 && diagnostic.turnCount > 0;
    const wasBackgrounded = diagnostic.wasBackgroundedRecently;
    const wasOffline = diagnostic.wasOfflineRecently;
    const iceWasBad =
      diagnostic.iceConnectionState === 'failed' ||
      diagnostic.iceConnectionState === 'disconnected';

    // Log with appropriate severity
    const logData = {
      id,
      reason: diagnostic.livekitReason,
      wasGraceful: diagnostic.wasGraceful,
      sessionDurationMs: diagnostic.sessionDurationMs,
      turnCount: diagnostic.turnCount,
      iceState: diagnostic.iceConnectionState,
      networkType: diagnostic.effectiveType,
      isOnline: diagnostic.isOnline,
      wasBackgrounded,
      wasOffline,
      visibilityState: diagnostic.visibilityState,
      rttMs: diagnostic.rttMs,
      sessionId: diagnostic.sessionId,
      roomName: diagnostic.roomName,
      userId: diagnostic.userId,
      platform: diagnostic.platform,
      rtcStats: diagnostic.rtcStats,
      lastError: diagnostic.lastError,
    };

    if (isUnexpected && hadActiveSession) {
      log.error(
        logData,
        `🚨 [DISCONNECT-DIAGNOSTIC] UNEXPECTED DISCONNECT during active session - reason: ${diagnostic.livekitReason || 'unknown'}`
      );
    } else if (isUnexpected) {
      log.warn(
        logData,
        `⚠️ [DISCONNECT-DIAGNOSTIC] Unexpected disconnect - reason: ${diagnostic.livekitReason || 'unknown'}`
      );
    } else {
      log.info(logData, `📊 [DISCONNECT-DIAGNOSTIC] Graceful disconnect recorded`);
    }

    // Add analysis hints
    if (wasBackgrounded) {
      log.info(
        { id },
        '💡 Hint: User had app backgrounded recently - possible iOS/Android audio suspension'
      );
    }
    if (wasOffline) {
      log.info({ id }, '💡 Hint: User went offline recently - network connectivity issue');
    }
    if (iceWasBad) {
      log.info({ id }, '💡 Hint: ICE connection was in bad state - WebRTC connectivity issue');
    }
    if (diagnostic.rtcStats?.packetsLost && diagnostic.rtcStats.packetsReceived) {
      const lossRate =
        diagnostic.rtcStats.packetsLost /
        (diagnostic.rtcStats.packetsLost + diagnostic.rtcStats.packetsReceived);
      if (lossRate > 0.05) {
        log.info(
          { id, lossRate: `${(lossRate * 100).toFixed(1)}%` },
          '💡 Hint: High packet loss detected - poor network quality'
        );
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, id, timestamp: receivedAt }));
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to process disconnect diagnostic');
    sendError(res, 'Could not process the diagnostic', 500);
  }
}

/**
 * Get recent disconnect diagnostics (for admin/debugging)
 */
async function handleGetDiagnostics(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const unexpectedCount = recentDisconnectDiagnostics.filter((d) => !d.wasGraceful).length;
  const last24h = recentDisconnectDiagnostics.filter(
    (d) => Date.now() - new Date(d.receivedAt).getTime() < 24 * 60 * 60 * 1000
  );
  const unexpectedLast24h = last24h.filter((d) => !d.wasGraceful);

  // Analyze patterns
  const byReason: Record<string, number> = {};
  const byIceState: Record<string, number> = {};
  const byVisibility: Record<string, number> = {};

  for (const d of recentDisconnectDiagnostics) {
    const reason = d.livekitReason || 'unknown';
    byReason[reason] = (byReason[reason] || 0) + 1;

    const ice = d.iceConnectionState || 'unknown';
    byIceState[ice] = (byIceState[ice] || 0) + 1;

    byVisibility[d.visibilityState] = (byVisibility[d.visibilityState] || 0) + 1;
  }

  const summary = {
    total: recentDisconnectDiagnostics.length,
    unexpected: unexpectedCount,
    last24hTotal: last24h.length,
    last24hUnexpected: unexpectedLast24h.length,
    patterns: {
      byReason,
      byIceState,
      byVisibility,
    },
    recentDiagnostics: recentDisconnectDiagnostics.slice(0, 20).map((d) => ({
      id: d.id,
      receivedAt: d.receivedAt,
      reason: d.livekitReason,
      wasGraceful: d.wasGraceful,
      sessionDurationMs: d.sessionDurationMs,
      turnCount: d.turnCount,
      iceState: d.iceConnectionState,
      networkType: d.effectiveType,
      isOnline: d.isOnline,
      visibilityState: d.visibilityState,
      wasBackgrounded: d.wasBackgroundedRecently,
      wasOffline: d.wasOfflineRecently,
      sessionId: d.sessionId,
    })),
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(summary));
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
 * POST /api/disconnect-diagnostic - Submit a disconnect diagnostic
 * GET /api/disconnect-diagnostic - Get recent disconnect diagnostics (admin)
 */
export async function handleCrashReportRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';
  const isDiagnostic = url.startsWith('/api/disconnect-diagnostic');
  if (!isDiagnostic && !url.startsWith('/api/crash-report')) {
    return false;
  }

  // CORS headers (uses validated origin, not wildcard)
  setCorsHeaders(req, res, { methods: ['GET', 'POST', 'OPTIONS'] });

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method === 'POST') {
    const keyPrefix = isDiagnostic ? 'disconnect-diagnostic' : 'crash-report';
    const perMinute = { maxRequests: CRASH_REPORT_POSTS_PER_MINUTE, windowMs: 60_000 };
    if (rateLimit(req, res, { ...perMinute, keyPrefix })) return true;
    await (isDiagnostic ? handleDisconnectDiagnostic : handleCrashReport)(req, res);
    return true;
  }

  if (req.method === 'GET') {
    if (!(await requireAdmin(req, res))) return true;
    await (isDiagnostic ? handleGetDiagnostics : handleGetCrashes)(req, res);
    return true;
  }

  sendError(res, 'Method not allowed', 405);
  return true;
}
