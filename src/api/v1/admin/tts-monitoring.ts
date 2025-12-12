/**
 * Admin TTS Monitoring API Routes (v1)
 *
 * Monitors text-to-speech sanitization effectiveness.
 * Tracks stage directions and suspicious patterns that slip through.
 *
 * Routes:
 * - GET /api/v1/admin/tts-monitoring/stats - TTS sanitization statistics
 * - POST /api/v1/admin/tts-monitoring/reset - Reset statistics (dev only)
 *
 * @module AdminTTSMonitoringAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../../auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from '../../helpers.js';
import { getTTSStats, resetTTSStats } from '../../../speech/tts-monitoring.js';

const log = createLogger({ module: 'AdminTTSMonitoringAPI' });

// Base path for these routes
const BASE_PATH = '/api/v1/admin/tts-monitoring';

/**
 * Handle all TTS monitoring admin routes
 * @returns true if the request was handled
 */
export async function handleAdminTTSMonitoringRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/v1/admin/tts-monitoring routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // All routes require auth (allow dev mode)
  const auth = requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  // Get the path after the base path
  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // ========================================================================
    // GET STATS
    // ========================================================================
    if ((subPath === '/' || subPath === '/stats') && method === 'GET') {
      const stats = getTTSStats();

      sendJSON(res, {
        totalChecks: stats.totalChecks,
        issuesFound: stats.issuesFound,
        issueRate: stats.issueRate,
        issueRatePercent: (stats.issueRate * 100).toFixed(2) + '%',
        topPatterns: stats.topPatterns,
        lastIssue: stats.lastIssue
          ? {
              time: stats.lastIssue.time.toISOString(),
              timeAgo: formatTimeAgo(stats.lastIssue.time),
              textPreview: stats.lastIssue.textPreview,
            }
          : null,
        status: getHealthStatus(stats.issueRate),
      });
      return true;
    }

    // ========================================================================
    // RESET STATS (dev only)
    // ========================================================================
    if (subPath === '/reset' && method === 'POST') {
      // Only allow in development
      if (process.env.NODE_ENV === 'production') {
        sendError(res, 'Reset not allowed in production', 403);
        return true;
      }

      resetTTSStats();
      log.info('TTS monitoring stats reset by admin');

      sendJSON(res, { success: true, message: 'TTS stats reset' });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Admin TTS monitoring API error');
    sendError(res, 'Internal server error');
    return true;
  }
}

/**
 * Format time ago for display
 */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60000) return `${Math.round(diff / 1000)} sec ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} hours ago`;
  return date.toISOString();
}

/**
 * Get health status based on issue rate
 */
function getHealthStatus(issueRate: number): 'healthy' | 'warning' | 'critical' {
  if (issueRate < 0.01) return 'healthy'; // < 1% issues
  if (issueRate < 0.05) return 'warning'; // 1-5% issues
  return 'critical'; // > 5% issues
}

export default { handleAdminTTSMonitoringRoutes };
