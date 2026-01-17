/**
 * Sky Check Routes
 *
 * Record emotional weather/mood for daily check-ins.
 *
 * POST /api/sky-check - Record a sky check
 * GET /api/sky-check/history - Get weather history
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached, sendError, parseBody } from '../helpers.js';
import { API_ERRORS } from '../error-messages.js';

const log = createLogger({ module: 'SkyCheckAPI' });

/**
 * Weather types for sky check
 */
interface WeatherInput {
  primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
  energy: 'high' | 'medium' | 'low';
  note?: string;
}

/**
 * POST /api/sky-check - Record emotional weather
 */
export async function handleRecordSkyCheck(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await parseBody(req);
    if (!body) {
      sendError(res, 'Request body required', 400);
      return;
    }

    const { weather } = body as { weather?: WeatherInput };

    if (!weather || !weather.primary || !weather.energy) {
      sendError(res, 'Weather object with primary and energy required', 400);
      return;
    }

    // Validate weather values
    const validPrimary = [
      'sunny',
      'partly-cloudy',
      'cloudy',
      'rainy',
      'stormy',
      'foggy',
      'rainbow',
    ];
    const validEnergy = ['high', 'medium', 'low'];

    if (!validPrimary.includes(weather.primary)) {
      sendError(res, `Invalid weather primary: ${weather.primary}`, 400);
      return;
    }

    if (!validEnergy.includes(weather.energy)) {
      sendError(res, `Invalid energy level: ${weather.energy}`, 400);
      return;
    }

    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();

    const now = new Date().toISOString();
    await store.recordWeather(userId, {
      date: now,
      weather: {
        primary: weather.primary,
        energy: weather.energy,
        note: weather.note,
      },
      ritualId: 'ferni-sky-check', // Default sky check ritual
    });

    log.info({ userId, weather: weather.primary, energy: weather.energy }, 'Sky check recorded');

    sendJSON(
      res,
      {
        success: true,
        recordedAt: now,
        weather,
      },
      201
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to record sky check');
    sendError(res, API_ERRORS.INTERNAL_ERROR, 500);
  }
}

/**
 * GET /api/sky-check/history - Get weather history
 */
export async function handleGetSkyCheckHistory(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const daysParam = parsedUrl.searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    if (isNaN(days) || days < 1 || days > 365) {
      sendError(res, 'Days must be between 1 and 365', 400);
      return;
    }

    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    const history = await store.getWeatherHistory(userId, days);

    // Get profile for stats
    const profile = await store.getProfile(userId);

    sendJSONCached(
      res,
      {
        history,
        stats: {
          totalSkyChecks: profile.stats?.totalSkyChecks || 0,
          lastCheckAt: history[0]?.date || null,
        },
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get sky check history');
    sendError(res, API_ERRORS.INTERNAL_ERROR, 500);
  }
}

/**
 * Route handler for sky-check endpoints
 */
export async function handleSkyCheckRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // POST /api/sky-check - Record a check
  if (pathname === '/api/sky-check' && req.method === 'POST') {
    await handleRecordSkyCheck(req, res, parsedUrl);
    return true;
  }

  // GET /api/sky-check/history - Get history
  if (pathname === '/api/sky-check/history' && req.method === 'GET') {
    await handleGetSkyCheckHistory(req, res, parsedUrl);
    return true;
  }

  return false;
}
