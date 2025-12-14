/**
 * Games API Routes
 *
 * Endpoints for game insights and analytics.
 * These power the "Musical You" dashboard and agent conversational insights.
 *
 * Endpoints:
 * - GET /api/games/insights - Get music insights (dashboard data)
 * - GET /api/games/suggestion - Get a game suggestion
 * - GET /api/games/conversational - Get a conversational insight for agent
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  generateMusicInsights,
  getConversationalInsight,
  getGameSuggestion,
} from '../../services/games/game-insights.js';
import type { GameMemory } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON } from '../helpers.js';

const log = createLogger({ module: 'GamesAPI' });

// ============================================================================
// RATE LIMITING (User + IP based)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// User-based rate limiting
const userRateLimits = new Map<string, RateLimitEntry>();
// IP-based rate limiting (fallback for unauthenticated requests)
const ipRateLimits = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS_USER = 30; // 30 requests per minute for authenticated users
const RATE_LIMIT_MAX_REQUESTS_IP = 10; // 10 requests per minute per IP (stricter for anonymous)

/**
 * Get client IP from request
 */
function getClientIP(req: IncomingMessage): string {
  // Check for forwarded IP (from proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }

  // Check for Cloud Run forwarded IP
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback to direct connection
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Check if request is rate limited (user-based)
 */
function isUserRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = userRateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    // Reset or create entry
    userRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS_USER) {
    log.warn({ userId, count: entry.count }, 'User rate limit exceeded for games API');
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Check if request is rate limited (IP-based)
 */
function isIPRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    // Reset or create entry
    ipRateLimits.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS_IP) {
    log.warn({ ip, count: entry.count }, 'IP rate limit exceeded for games API');
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Check if request is rate limited (combined user + IP)
 */
function isRateLimited(req: IncomingMessage, userId?: string): boolean {
  const ip = getClientIP(req);

  // Always check IP-based limiting
  if (isIPRateLimited(ip)) {
    return true;
  }

  // If user is authenticated, also check user-based limiting
  if (userId && isUserRateLimited(userId)) {
    return true;
  }

  return false;
}

/**
 * Send rate limit response
 */
function sendRateLimitResponse(res: ServerResponse): void {
  res.statusCode = 429;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Retry-After', '60');
  res.end(
    JSON.stringify({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: 60,
    })
  );
}

/**
 * Get user profile from engagement store
 */
async function getUserProfileFromStore(
  userId: string
): Promise<{ gameMemory?: GameMemory } | null> {
  try {
    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = await store.getProfile(userId);
    return profile as { gameMemory?: GameMemory } | null;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to get profile from store');
    return null;
  }
}

/**
 * Handle games routes
 * @returns true if route was handled
 */
export async function handleGamesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/games/insights - Dashboard data
  if (pathname === '/api/games/insights' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check (user + IP based)
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      log.info({ userId }, 'Getting game insights');

      // Get user profile with game memory
      const profile = await getUserProfileFromStore(userId);
      const gameMemory = profile?.gameMemory;

      // Generate insights
      const insights = generateMusicInsights(gameMemory);

      sendJSON(res, {
        success: true,
        insights,
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to get game insights');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to generate insights',
        },
        500
      );
      return true;
    }
  }

  // GET /api/games/suggestion - Get a game suggestion
  if (pathname === '/api/games/suggestion' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      const profile = await getUserProfileFromStore(userId);
      const suggestion = getGameSuggestion(profile?.gameMemory);

      sendJSON(res, {
        success: true,
        suggestion,
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to get game suggestion');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to generate suggestion',
        },
        500
      );
      return true;
    }
  }

  // GET /api/games/conversational - Get conversational insight for agent
  if (pathname === '/api/games/conversational' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      const profile = await getUserProfileFromStore(userId);
      const insight = getConversationalInsight(profile?.gameMemory);

      sendJSON(res, {
        success: true,
        insight,
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to get conversational insight');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to generate insight',
        },
        500
      );
      return true;
    }
  }

  return false;
}
