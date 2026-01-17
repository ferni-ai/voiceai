/**
 * Insights API Routes - "What I'm Noticing"
 *
 * Provides superhuman insights to the frontend for the relationship-focused
 * Insights View. Surfaces patterns, life chapters, commitments, and growth
 * evidence that no human friend could consistently provide.
 *
 * @module api/insights-routes
 */

import type http from 'http';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'insights-routes' });

// ============================================================================
// TYPES (matches frontend InsightData)
// ============================================================================

interface InsightsResponse {
  presence?: {
    weather: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
    energy: 'high' | 'medium' | 'low';
    note?: string;
  };

  noticing?: Array<{
    type: 'pattern' | 'growth' | 'concern' | 'celebration' | 'memory';
    insight: string;
    evidence?: string;
    personaId?: string;
  }>;

  chapter?: {
    title: string;
    type: 'struggle' | 'growth' | 'triumph' | 'transition' | 'discovery';
    duration?: string;
    arcSummary?: string;
  };

  holding?: {
    commitments?: Array<{ text: string; daysAgo: number }>;
    dreams?: Array<{ dream: string; status: 'active' | 'dormant' }>;
    upcomingDates?: Array<{ name: string; daysUntil: number }>;
  };

  growth?: {
    message: string;
    details?: string;
  };

  relationship?: {
    daysTogether: number;
    conversations: number;
    milestone?: string;
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleInsightsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  _parsedUrl?: URL
): Promise<boolean> {
  // Reserved paths for predictive insights - don't handle here
  // These are handled by handlePredictiveInsightsRequest in the server
  const predictiveInsightsPaths = [
    '/api/insights/predictions',
    '/api/insights/dismiss',
    '/api/insights/feedback',
    '/api/insights/summary',
  ];
  if (predictiveInsightsPaths.includes(pathname)) {
    return false; // Let predictive insights handler take care of these
  }

  // GET /api/insights/:userId - Fetch insights for a user
  const userIdMatch = pathname.match(/^\/api\/insights\/([^/]+)$/);
  if (userIdMatch && req.method === 'GET') {
    const userId = decodeURIComponent(userIdMatch[1]);
    return handleGetInsights(req, res, userId);
  }

  return false;
}

// ============================================================================
// GET /api/insights/:userId
// ============================================================================

async function handleGetInsights(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  userId: string
): Promise<boolean> {
  try {
    log.debug({ userId }, 'Fetching insights');

    // Lazy import superhuman services to avoid circular deps
    const {
      loadUserCommitments,
      loadUserChapters,
      loadUserDreams,
      findUpcomingDates,
      loadEnergyHistory,
    } = await import('../services/superhuman/index.js');

    // Lazy import engagement store for weather
    const { getEngagementStore } = await import('../services/engagement/engagement-store.js');

    // Parallel fetch all data with graceful degradation + logging
    const [commitments, chapters, dreams, upcomingDates, energyHistory, store] = await Promise.all([
      loadUserCommitments(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to load commitments - returning empty');
        return [];
      }),
      loadUserChapters(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to load chapters - returning empty');
        return [];
      }),
      loadUserDreams(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to load dreams - returning empty');
        return [];
      }),
      findUpcomingDates(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to load upcoming dates - returning empty');
        return [];
      }),
      loadEnergyHistory(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to load energy history - returning empty');
        return [];
      }),
      getEngagementStore().catch((err) => {
        log.warn({ error: String(err) }, 'Failed to get engagement store - returning null');
        return null;
      }),
    ]);

    // Get latest weather from engagement store
    let latestWeather: InsightsResponse['presence'] = undefined;
    if (store) {
      const weatherHistory = await store.getWeatherHistory(userId, 1);
      if (weatherHistory.length > 0) {
        const w = weatherHistory[0];
        latestWeather = {
          weather: w.weather.primary as InsightsResponse['presence'] extends undefined
            ? never
            : NonNullable<InsightsResponse['presence']>['weather'],
          energy: w.weather.energy as 'high' | 'medium' | 'low',
          note: w.weather.note,
        };
      }
    }

    // Build insights from patterns
    const noticing: InsightsResponse['noticing'] = [];

    // Energy patterns
    if (energyHistory.length >= 3) {
      const recentEnergy = energyHistory.slice(0, 3);
      const lowCount = recentEnergy.filter(
        (e) => e.energyLevel === 'low' || e.energyLevel === 'depleted'
      ).length;
      if (lowCount >= 2) {
        noticing.push({
          type: 'concern',
          insight:
            "Your energy has been running low lately. I'm here if you need to talk about it.",
          evidence: `${lowCount} of last 3 check-ins showed low energy`,
        });
      }
    }

    // Commitment patterns
    if (commitments.length > 0) {
      const activeCommitments = commitments.filter((c) => c.status === 'active');
      if (activeCommitments.length > 3) {
        noticing.push({
          type: 'pattern',
          insight:
            "You've taken on quite a bit. Want to talk about what's most important right now?",
          evidence: `${activeCommitments.length} active commitments`,
        });
      }

      // Look for completed commitments to celebrate
      const recentCompleted = commitments.filter(
        (c) =>
          c.status === 'completed' &&
          c.lastMentioned &&
          Date.now() - c.lastMentioned < 7 * 24 * 60 * 60 * 1000
      );
      if (recentCompleted.length > 0) {
        noticing.push({
          type: 'celebration',
          insight: `You followed through on what you said you'd do. That takes real commitment.`,
          evidence: `Completed: ${recentCompleted[0].summary || recentCompleted[0].statement}`,
        });
      }
    }

    // Growth from chapters
    if (chapters.length > 0) {
      const growthChapters = chapters.filter((c) => c.type === 'growth' || c.type === 'discovery');
      if (growthChapters.length > 0) {
        const latestGrowth = growthChapters[0];
        if (latestGrowth.insightsGained && latestGrowth.insightsGained.length > 0) {
          noticing.push({
            type: 'growth',
            insight: latestGrowth.insightsGained[0],
            evidence: `From "${latestGrowth.title}"`,
          });
        }
      }
    }

    // Current chapter
    let chapter: InsightsResponse['chapter'] = undefined;
    const currentChapter = chapters.find((c) => !c.endDate);
    if (currentChapter) {
      const daysInChapter = Math.floor(
        (Date.now() - currentChapter.startDate) / (1000 * 60 * 60 * 24)
      );
      chapter = {
        title: currentChapter.title,
        type: currentChapter.type as InsightsResponse['chapter'] extends undefined
          ? never
          : NonNullable<InsightsResponse['chapter']>['type'],
        duration: daysInChapter > 0 ? `${daysInChapter} days` : 'Just started',
        arcSummary:
          currentChapter.keyQuotes && currentChapter.keyQuotes.length > 0
            ? `"${currentChapter.keyQuotes[0].slice(0, 100)}..."`
            : undefined,
      };
    }

    // Things I'm holding
    const holding: InsightsResponse['holding'] = {};

    if (commitments.length > 0) {
      const activeCommitments = commitments.filter((c) => c.status === 'active').slice(0, 3);
      if (activeCommitments.length > 0) {
        holding.commitments = activeCommitments.map((c) => ({
          text: c.summary || c.statement,
          daysAgo: Math.floor((Date.now() - c.createdAt) / (1000 * 60 * 60 * 24)),
        }));
      }
    }

    if (dreams.length > 0) {
      holding.dreams = dreams.slice(0, 2).map((d) => ({
        dream: d.title || d.statement,
        status: d.status === 'dormant' ? 'dormant' : 'active',
      }));
    }

    if (upcomingDates.length > 0) {
      holding.upcomingDates = upcomingDates.slice(0, 2).map((d) => ({
        name: d.date.name,
        daysUntil: d.daysUntil,
      }));
    }

    // Growth message from streaks or rituals
    let growth: InsightsResponse['growth'] = undefined;
    if (store) {
      const streaks = await store.getAllStreaks(userId);
      if (streaks && streaks.length > 0) {
        const bestStreak = streaks.reduce((best: (typeof streaks)[0], s: (typeof streaks)[0]) =>
          s.currentStreak > best.currentStreak ? s : best
        );
        if (bestStreak.currentStreak >= 3) {
          growth = {
            message: `${bestStreak.currentStreak} days of showing up. You're building something real.`,
            details:
              bestStreak.currentStreak >= 7
                ? 'A full week! This is becoming part of you.'
                : undefined,
          };
        }
      }
    }

    // Relationship milestone
    let relationship: InsightsResponse['relationship'] = undefined;
    if (store) {
      const profile = await store.getProfile(userId);
      if (profile) {
        // Calculate days together from lastEngagementAt (approximate)
        const daysTogether = profile.lastEngagementAt
          ? Math.floor(
              (Date.now() - new Date(profile.lastEngagementAt).getTime()) / (1000 * 60 * 60 * 24)
            ) + profile.totalRitualDays
          : profile.totalRitualDays;
        const conversations = profile.stats.totalSkyChecks + profile.stats.totalPredictions;

        if (daysTogether >= 7 || conversations >= 10) {
          let milestone: string | undefined;
          if (conversations >= 100) {
            milestone = "100+ check-ins! We've built something meaningful.";
          } else if (daysTogether >= 30) {
            milestone = 'A month of growth. Thank you for trusting me.';
          } else if (conversations >= 50) {
            milestone = "50+ conversations. I see how far you've come.";
          } else if (daysTogether >= 7) {
            milestone = 'A week of showing up. That matters.';
          }

          if (milestone) {
            relationship = {
              daysTogether,
              conversations,
              milestone,
            };
          }
        }
      }
    }

    // Build response
    const response: InsightsResponse = {
      presence: latestWeather,
      noticing: noticing.length > 0 ? noticing.slice(0, 3) : undefined,
      chapter,
      holding: Object.keys(holding).length > 0 ? holding : undefined,
      growth,
      relationship,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));

    log.debug({ userId, insightCount: noticing.length }, 'Insights fetched');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to fetch insights');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch insights' }));
    return true;
  }
}
