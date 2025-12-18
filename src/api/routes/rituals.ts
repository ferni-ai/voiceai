/**
 * Rituals Routes
 *
 * GET /api/rituals - Get user rituals
 * POST /api/rituals - Create a ritual
 * DELETE /api/rituals/:id - Delete a ritual
 * POST /api/rituals/:id/complete - Complete a ritual
 *
 * NOTE: Streak logic is consolidated in DailyRitualsService.
 * This routes file delegates to the service to avoid duplicate implementations.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached, sendError } from '../helpers.js';
import { validateBody, CreateRitualSchema, CompleteRitualSchema } from '../validators.js';
import { API_ERRORS } from '../error-messages.js';
import { type AnyRecord, MILESTONES, getMilestoneMessage } from './types.js';
import { getDailyRitualsService, PERSONA_RITUALS } from '../../services/daily-rituals.js';

const log = createLogger({ module: 'RitualsAPI' });

/**
 * GET /api/rituals - Get user rituals
 */
export async function handleGetRituals(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;
    const streaks = await store.getAllStreaks(userId);
    const weatherHistory = await store.getWeatherHistory(userId, 30);

    sendJSONCached(
      res,
      {
        activeRituals: (profile.activeRituals as string[]) || [],
        streaks,
        weatherHistory,
        preferences: profile.preferences,
        stats: {
          totalRitualDays: profile.totalRitualDays,
          longestOverallStreak: profile.longestOverallStreak,
          totalSkyChecks: ((profile.stats as AnyRecord)?.totalSkyChecks as number) || 0,
        },
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get rituals');
    sendError(res, API_ERRORS.RITUALS_FETCH_FAILED, 500);
  }
}

/**
 * POST /api/rituals - Create a ritual
 */
export async function handleCreateRitual(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  try {
    const body = await validateBody(req, res, CreateRitualSchema);
    if (!body) return;

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;

    const ritualId = `ritual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const activeRituals = ((profile.activeRituals as string[]) || []).slice();
    activeRituals.push(ritualId);
    profile.activeRituals = activeRituals;

    await store.saveProfile(profile as Parameters<typeof store.saveProfile>[0]);
    await store.saveRitualStreak(userId, {
      ritualId,
      personaId: body.ritual?.personaId || 'ferni',
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedAt: '',
      totalCompletions: 0,
      streakHistory: [],
    });

    log.info({ ritualId, userId }, 'Ritual created');
    sendJSON(res, { success: true, ritualId }, 201);
  } catch (err) {
    log.error({ error: err }, 'Failed to create ritual');
    sendError(res, API_ERRORS.RITUAL_CREATE_FAILED, 500);
  }
}

/**
 * DELETE /api/rituals/:id - Delete a ritual
 */
export async function handleDeleteRitual(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  ritualId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;

    if (profile.activeRituals) {
      profile.activeRituals = (profile.activeRituals as string[]).filter((id) => id !== ritualId);
      await store.saveProfile(profile as Parameters<typeof store.saveProfile>[0]);
    }

    log.info({ ritualId, userId }, 'Ritual deleted');
    sendJSON(res, { success: true, ritualId });
  } catch (err) {
    log.error({ error: err, ritualId, userId }, 'Failed to delete ritual');
    sendError(res, API_ERRORS.RITUAL_DELETE_FAILED, 500);
  }
}

/**
 * POST /api/rituals/:id/complete - Complete a ritual
 *
 * CONSOLIDATED: Uses DailyRitualsService for streak logic.
 * This ensures consistent streak calculation across voice and API flows.
 */
export async function handleCompleteRitual(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  ritualId: string
): Promise<void> {
  try {
    const body = await validateBody(req, res, CompleteRitualSchema);
    if (!body) return;

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();

    // Check if ritual exists
    const streak = await store.getRitualStreak(userId, ritualId);

    // For known persona rituals, auto-activate if not exists
    const isKnownRitual = ritualId in PERSONA_RITUALS;
    if (!streak && !isKnownRitual) {
      sendError(res, API_ERRORS.RITUAL_NOT_FOUND, 404);
      return;
    }

    // Check if already completed today
    if (streak) {
      const today = new Date().toISOString().split('T')[0];
      const lastCompleted = streak.lastCompletedAt?.split('T')[0];

      if (lastCompleted === today) {
        sendJSON(res, {
          success: true,
          message: 'Already completed today',
          streak: streak.currentStreak,
        });
        return;
      }
    }

    // Use DailyRitualsService for consolidated streak logic
    const service = getDailyRitualsService();

    // Build emotional weather data if provided
    const emotionalWeather = body.weather
      ? {
          primary: body.weather.primary as
            | 'sunny'
            | 'partly-cloudy'
            | 'cloudy'
            | 'rainy'
            | 'stormy'
            | 'foggy'
            | 'rainbow',
          energy: body.weather.energy as 'high' | 'medium' | 'low',
          note: body.weather.note,
        }
      : undefined;

    // Record completion using the service (handles all streak logic)
    const result = await service.recordCompletionAsync(userId, ritualId, {
      emotionalWeather,
    });

    // Also record weather to engagement store if provided
    if (body.weather) {
      await store.recordWeather(userId, {
        date: new Date().toISOString(),
        weather: body.weather as Parameters<typeof store.recordWeather>[1]['weather'],
        ritualId,
      });
    }

    log.info({ ritualId, streak: result.newStreak, userId }, 'Ritual completed');

    const isMilestone = MILESTONES.includes(result.newStreak);
    const isPersonalBest = result.isNewRecord && result.newStreak > 1;

    sendJSON(res, {
      success: true,
      streak: result.newStreak,
      isNewRecord: result.isNewRecord,
      celebration:
        isMilestone || isPersonalBest
          ? {
              type: isMilestone ? 'milestone' : 'personal_best',
              milestone: result.newStreak,
              message:
                result.celebration ||
                (isMilestone
                  ? getMilestoneMessage(result.newStreak)
                  : `New personal best: ${result.newStreak} days!`),
            }
          : null,
    });
  } catch (err) {
    log.error({ error: err, ritualId }, 'Failed to complete ritual');
    sendError(res, API_ERRORS.RITUAL_COMPLETE_FAILED, 500);
  }
}

/**
 * Route handler for rituals endpoints
 */
export async function handleRitualsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/rituals' && req.method === 'GET') {
    await handleGetRituals(req, res, parsedUrl);
    return true;
  }

  if (pathname === '/api/rituals' && req.method === 'POST') {
    await handleCreateRitual(req, res, parsedUrl);
    return true;
  }

  const deleteMatch = pathname.match(/^\/api\/rituals\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    await handleDeleteRitual(req, res, parsedUrl, deleteMatch[1]);
    return true;
  }

  const completeMatch = pathname.match(/^\/api\/rituals\/([^/]+)\/complete$/);
  if (completeMatch && req.method === 'POST') {
    await handleCompleteRitual(req, res, parsedUrl, completeMatch[1]);
    return true;
  }

  return false;
}
