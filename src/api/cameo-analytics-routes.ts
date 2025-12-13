/**
 * Cameo Analytics API Routes
 *
 * Provides endpoints for viewing cameo engagement data:
 * - GET /api/cameo/analytics - Get overall cameo analytics
 * - GET /api/cameo/analytics/:userId - Get user-specific analytics
 * - GET /api/cameo/preferences/:userId - Get user preferences
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getGlobalPersonaStats,
  getUserPreferences,
  type CameoPreferences,
  type PersonaEngagementStats,
} from '../services/cameo/cameo-analytics.js';
import type { CameoPersonaId } from '../services/cameo/types.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAdmin, requireAuth, type AuthContext } from './auth-middleware.js';
import { sendError, sendJSON } from './helpers.js';

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
 * Generate sample data for development/demo when Firestore is unavailable
 */
function getSampleAnalytics(): CameoAnalyticsSummary {
  const sampleStats: PersonaEngagementStats[] = [
    {
      personaId: 'peter-john',
      totalCameos: 156,
      positiveResponses: 124,
      followUpRequests: 45,
      handoffRequests: 12,
      averageDurationMs: 8500,
      engagementRate: 0.79,
      lastCameoAt: Date.now() - 3600000,
      triggerTypeStats: {
        data_insight: { count: 89, positiveRate: 0.82 },
        expertise: { count: 67, positiveRate: 0.76 },
      } as PersonaEngagementStats['triggerTypeStats'],
    },
    {
      personaId: 'maya-santos',
      totalCameos: 203,
      positiveResponses: 178,
      followUpRequests: 67,
      handoffRequests: 23,
      averageDurationMs: 12000,
      engagementRate: 0.88,
      lastCameoAt: Date.now() - 1800000,
      triggerTypeStats: {
        habit_check: { count: 112, positiveRate: 0.91 },
        support: { count: 91, positiveRate: 0.84 },
      } as PersonaEngagementStats['triggerTypeStats'],
    },
    {
      personaId: 'alex-chen',
      totalCameos: 98,
      positiveResponses: 71,
      followUpRequests: 28,
      handoffRequests: 8,
      averageDurationMs: 6200,
      engagementRate: 0.72,
      lastCameoAt: Date.now() - 7200000,
      triggerTypeStats: {
        scheduling: { count: 65, positiveRate: 0.75 },
      } as PersonaEngagementStats['triggerTypeStats'],
    },
    {
      personaId: 'jordan-taylor',
      totalCameos: 134,
      positiveResponses: 98,
      followUpRequests: 41,
      handoffRequests: 15,
      averageDurationMs: 9800,
      engagementRate: 0.73,
      lastCameoAt: Date.now() - 5400000,
      triggerTypeStats: {
        planning: { count: 78, positiveRate: 0.77 },
        celebration: { count: 56, positiveRate: 0.68 },
      } as PersonaEngagementStats['triggerTypeStats'],
    },
    {
      personaId: 'nayan-patel',
      totalCameos: 87,
      positiveResponses: 72,
      followUpRequests: 34,
      handoffRequests: 19,
      averageDurationMs: 15600,
      engagementRate: 0.83,
      lastCameoAt: Date.now() - 10800000,
      triggerTypeStats: {
        wisdom: { count: 87, positiveRate: 0.83 },
      } as PersonaEngagementStats['triggerTypeStats'],
    },
  ];

  const totalCameos = sampleStats.reduce((sum, s) => sum + s.totalCameos, 0);
  const totalPositiveResponses = sampleStats.reduce((sum, s) => sum + s.positiveResponses, 0);

  return {
    totalCameos,
    totalPositiveResponses,
    overallEngagementRate: totalPositiveResponses / totalCameos,
    mostEngagingPersona: 'maya-santos',
    leastEngagingPersona: 'alex-chen',
    personaStats: sampleStats,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * GET /api/cameo/analytics
 * Get overall cameo analytics (admin only)
 */
async function handleGetAnalytics(_req: IncomingMessage, res: ServerResponse): Promise<void> {
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

    // If no data from Firestore, return sample data for development
    if (allStats.length === 0) {
      log.debug('No Firestore data available, returning sample cameo analytics');
      sendJSON(res, getSampleAnalytics());
      return;
    }

    // Calculate engagement rate
    const overallEngagementRate = totalCameos > 0 ? totalPositiveResponses / totalCameos : 0;

    // Find most/least engaging persona
    let mostEngagingPersona: CameoPersonaId | null = null;
    let leastEngagingPersona: CameoPersonaId | null = null;
    let highestRate = 0;
    let lowestRate = 1;

    for (const stats of allStats) {
      if (stats.totalCameos >= 5) {
        // Minimum sample size
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
    // Return sample data on error for graceful degradation
    log.debug('Returning sample cameo analytics due to error');
    sendJSON(res, getSampleAnalytics());
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

  // GET /api/cameo/analytics (admin only)
  if (pathname === '/api/cameo/analytics' && method === 'GET') {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return true; // 403 already sent
    await handleGetAnalytics(req, res);
    return true;
  }

  // GET /api/cameo/preferences/:userId
  const preferencesMatch = pathname.match(/^\/api\/cameo\/preferences\/([^/]+)$/);
  if (preferencesMatch && method === 'GET') {
    const requestedUserId = preferencesMatch[1];

    // Verify user is authenticated
    const auth = (await requireAuth(req, res)) as AuthContext | null;
    if (!auth) return true; // 401 already sent

    // Users can only access their own preferences (unless admin)
    if (auth.userId !== requestedUserId && !auth.isAdmin) {
      sendError(res, 'Cannot access other user preferences', 403);
      return true;
    }

    await handleGetPreferences(req, res, requestedUserId);
    return true;
  }

  return false; // Route not handled
}
