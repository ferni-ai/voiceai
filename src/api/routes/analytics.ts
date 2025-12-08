/**
 * Analytics Routes
 *
 * GET /api/analytics/user - Get user progress analytics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
import type { AnyRecord } from './types.js';

const log = createLogger({ module: 'AnalyticsAPI' });

function getRitualFriendlyName(ritualId: string | null): string | null {
  if (!ritualId) return null;
  const names: Record<string, string> = {
    'ferni-sky-check': 'Morning Sky Check',
    'alex-inbox-pulse': 'Inbox Pulse',
    'maya-habit-heartbeat': 'Habit Heartbeat',
    'jordan-todays-chapter': "Today's Chapter",
    'nayan-morning-stillness': 'Morning Stillness',
    'peter-pattern-pulse': 'Pattern Pulse',
  };
  if (names[ritualId]) return names[ritualId];
  return ritualId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * GET /api/analytics/user - Get user progress analytics
 */
export async function handleGetUserAnalytics(
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
    const streaks = (await store.getAllStreaks(userId)) as unknown as AnyRecord[];
    const weatherHistory = (await store.getWeatherHistory(userId, 30)) as unknown as AnyRecord[];
    const predictions = (await store.getRecentPredictions(userId, 20)) as unknown as AnyRecord[];

    // Calculate analytics
    const completedPredictions = predictions.filter((p) => p.accuracy !== undefined);
    const averageAccuracy =
      completedPredictions.length > 0
        ? Math.round(
            completedPredictions.reduce((sum, p) => sum + ((p.accuracy as number) || 0), 0) /
              completedPredictions.length
          )
        : null;

    // Find best day
    const dayCompletions: Record<string, number> = {};
    streaks.forEach((s) => {
      if (s.lastCompletedAt) {
        const day = new Date(s.lastCompletedAt as string).toLocaleDateString('en-US', {
          weekday: 'long',
        });
        dayCompletions[day] = (dayCompletions[day] || 0) + 1;
      }
    });
    const bestDay = Object.entries(dayCompletions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Mood trends
    const moodTrends = weatherHistory.slice(0, 14).map((w) => {
      const weather =
        typeof w.weather === 'object'
          ? (w.weather as { primary?: string; energy?: string })
          : { primary: w.weather as string, energy: 'medium' };
      return {
        date: w.date,
        mood: weather.primary || 'cloudy',
        energy: weather.energy || 'medium',
      };
    });

    const moodMap: Record<string, number> = {
      sunny: 5,
      'partly-cloudy': 4,
      cloudy: 3,
      rainy: 2,
      stormy: 1,
      foggy: 2,
      rainbow: 5,
    };
    const moodValues = moodTrends.map((m) => moodMap[m.mood] || 3);
    const averageMood =
      moodValues.length > 0 ? moodValues.reduce((sum, v) => sum + v, 0) / moodValues.length : 3;

    const sortedStreaks = [...streaks].sort(
      (a, b) => ((b.longestStreak as number) || 0) - ((a.longestStreak as number) || 0)
    );
    const mostConsistentRitual = (sortedStreaks[0]?.ritualId as string) || null;

    const improvementAreas: string[] = [];
    const inconsistentRituals = streaks.filter(
      (s) => (s.currentStreak as number) === 0 && (s.totalCompletions as number) > 0
    );
    if (inconsistentRituals.length > 0) {
      improvementAreas.push('Some rituals could use more consistency');
    }
    if (moodTrends.filter((m) => m.energy === 'low').length > moodTrends.length / 2) {
      improvementAreas.push(
        'Energy levels have been low - consider reviewing sleep or exercise habits'
      );
    }

    const analytics = {
      totalDays: (profile.totalRitualDays as number) || 0,
      totalRituals: streaks.reduce((sum, s) => sum + ((s.totalCompletions as number) || 0), 0),
      currentLongestStreak: Math.max(...streaks.map((s) => (s.currentStreak as number) || 0), 0),
      averageMood: Math.round(averageMood * 10) / 10,
      predictionAccuracy: averageAccuracy,
      moodTrends,
      bestDay,
      mostConsistentRitual: getRitualFriendlyName(mostConsistentRitual),
      improvementAreas,
    };

    sendJSONCached(res, analytics, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get user analytics');
    sendJSON(
      res,
      {
        error: 'Failed to get analytics',
        totalDays: 0,
        totalRituals: 0,
        currentLongestStreak: 0,
        averageMood: 0,
        predictionAccuracy: null,
        moodTrends: [],
        bestDay: null,
        mostConsistentRitual: null,
        improvementAreas: [],
      },
      500
    );
  }
}

/**
 * Route handler for analytics endpoints
 */
export async function handleAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/analytics/user' && req.method === 'GET') {
    await handleGetUserAnalytics(req, res, parsedUrl);
    return true;
  }
  return false;
}
