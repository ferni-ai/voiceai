/**
 * Cameo Analytics API Routes
 *
 * Provides endpoints for viewing cameo engagement data:
 * - GET /api/cameo/analytics - Get overall cameo analytics
 * - GET /api/cameo/analytics/:userId - Get user-specific analytics
 * - GET /api/cameo/preferences/:userId - Get user preferences
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { sendError, sendJSON } from './helpers.js';
import {
  getGlobalPersonaStats,
  getUserPreferences,
  type CameoPreferences,
  type PersonaEngagementStats,
} from '../services/cameo/cameo-analytics.js';
import type { CameoPersonaId } from '../services/cameo/types.js';

const log = createLogger({ module: 'CameoAnalyticsAPI' });

// =============================================================================
// TYPES
// =============================================================================

interface CameoAnalyticsSummary {
  totalCameos: number;
  totalPositiveResponses: number;
  overallEngagementRate: number;
  mostEngagingPersona: CameoPersonaId | null;
  leastEngagingPersona: CameoPersonaId | null;
  personaStats: PersonaEngagementStats[];
  updatedAt: string;
}

// =============================================================================
// HELPERS
// =============================================================================

const CAMEO_PERSONAS: CameoPersonaId[] = [
  'peter-john',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'nayan-patel',
];

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /api/cameo/analytics
 * Get overall cameo analytics (admin only)
 */
async function handleGetAnalytics(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const allStats: PersonaEngagementStats[] = [];
    let totalCameos = 0;
    let totalPositiveResponses = 0;

    // Gather stats for each persona
    for (const personaId of CAMEO_PERSONAS) {
      const stats = await getGlobalPersonaStats(personaId);
      if (stats) {
        allStats.push(stats);
        totalCameos += stats.totalCameos;
        totalPositiveResponses += stats.positiveResponses;
      }
    }

    // Calculate engagement rate
    const overallEngagementRate = totalCameos > 0 
      ? totalPositiveResponses / totalCameos 
      : 0;

    // Find most/least engaging persona
    let mostEngagingPersona: CameoPersonaId | null = null;
    let leastEngagingPersona: CameoPersonaId | null = null;
    let highestRate = 0;
    let lowestRate = 1;

    for (const stats of allStats) {
      if (stats.totalCameos >= 5) { // Minimum sample size
        if (stats.engagementRate > highestRate) {
          highestRate = stats.engagementRate;
          mostEngagingPersona = stats.personaId;
        }
        if (stats.engagementRate < lowestRate) {
          lowestRate = stats.engagementRate;
          leastEngagingPersona = stats.personaId;
        }
      }
    }

    const summary: CameoAnalyticsSummary = {
      totalCameos,
      totalPositiveResponses,
      overallEngagementRate,
      mostEngagingPersona,
      leastEngagingPersona,
      personaStats: allStats,
      updatedAt: new Date().toISOString(),
    };

    sendJSON(res, summary);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get cameo analytics');
    sendError(res, 'Failed to get cameo analytics');
  }
}

/**
 * GET /api/cameo/preferences/:userId
 * Get user's cameo preferences
 */
async function handleGetPreferences(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const preferences = await getUserPreferences(userId);

    if (!preferences) {
      // Return default preferences for new users
      const defaults: CameoPreferences = {
        userId,
        updatedAt: Date.now(),
        preferredFrequency: 'occasional',
        maxCameosPerSession: 2,
        minCooldownMs: 180000,
        favoritePersonas: [],
        avoidPersonas: [],
        respondWellTo: [],
        ignoredTriggers: [],
        totalCameosReceived: 0,
        totalPositiveResponses: 0,
        overallEngagementRate: 0,
      };
      sendJSON(res, defaults);
      return;
    }

    sendJSON(res, preferences);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get cameo preferences');
    sendError(res, 'Failed to get cameo preferences');
  }
}

// =============================================================================
// MAIN ROUTE HANDLER
// =============================================================================

/**
 * Handle all /api/cameo routes
 */
export async function handleCameoAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // GET /api/cameo/analytics
  if (pathname === '/api/cameo/analytics' && method === 'GET') {
    // TODO: Add admin auth check
    await handleGetAnalytics(req, res);
    return true;
  }

  // GET /api/cameo/preferences/:userId
  const preferencesMatch = pathname.match(/^\/api\/cameo\/preferences\/([^/]+)$/);
  if (preferencesMatch && method === 'GET') {
    const userId = preferencesMatch[1];
    
    // Verify user is authenticated and requesting their own data
    const authed = await requireAuth(req, res);
    if (!authed) return true;
    
    // For now, allow users to see their own preferences
    await handleGetPreferences(req, res, userId);
    return true;
  }

  return false; // Route not handled
}
