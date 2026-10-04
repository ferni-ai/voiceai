/**
 * The Trust dashboard's six read routes (apps/web trust-dashboard.ui.ts).
 *
 * The voice agent records sentiment and life events in its own process and
 * persists them, with the other trust profiles, to
 * bogle_users/{uid}/trust_profiles/* at session end. This API server is a
 * different process, so its in-memory trust Maps never see that data: these
 * routes read what the agent persisted. Every response carries `hasData`; with
 * nothing recorded, values are null or empty - never neutral defaults - and an
 * unreadable store is a 503, not "no data".
 *
 * Callers pass the verified uid (requireAuth); nothing here reads a userId
 * from the request.
 *
 * @module api/trust-dashboard-routes
 */

import type { ServerResponse } from 'http';
import {
  getUserEvents,
  getUpcomingEvents,
  setUserEvents,
  type LifeEvent,
} from '../services/trust-systems/life-events.js';
import {
  generatePrompts,
  generateSituationalPrompt,
  type JournalingPrompt,
} from '../services/trust-systems/journaling-prompts.js';
import { generateSuggestions } from '../services/trust-systems/media-suggestions.js';
import {
  getStageDescription,
  getStageName,
  type RelationshipHealthScore,
} from '../services/trust-systems/relationship-health.js';
import type { InsightsReport } from '../services/trust-systems/relationship-insights.js';
import {
  exportTimelineData,
  getCurrentMoodContext,
  getInsightfulPatterns,
  getRecentPeaksValleys,
  setTimeline,
  type SentimentTimeline,
} from '../services/trust-systems/sentiment-timeline.js';
import { LIFE_EVENTS_DOC, TIMELINE_DOC } from '../services/trust-systems/dashboard-history.js';
import { readTrustDoc } from '../services/trust-systems/trust-doc.js';
import { sendJSON } from './helpers.js';

type Respond = (status: number, body: unknown) => void;

class StoreUnavailable extends Error {}

/** A persisted trust doc, or null when the user has none. Throws when unreadable. */
async function stored<T>(userId: string, doc: string): Promise<T | null> {
  const read = await readTrustDoc<T>(userId, doc);
  if (read.status === 'error') throw new StoreUnavailable(doc);
  return read.status === 'found' ? read.data : null;
}

/** Load the user's persisted timeline into this process (null forgets a stale one). */
async function loadTimeline(userId: string): Promise<SentimentTimeline | null> {
  const timeline = await stored<SentimentTimeline>(userId, TIMELINE_DOC);
  const usable = timeline && timeline.snapshots.length > 0 ? timeline : null;
  setTimeline(userId, usable);
  return usable;
}

function timeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

async function health(userId: string): Promise<Record<string, unknown>> {
  const h = await stored<RelationshipHealthScore>(userId, 'relationship_health');
  if (!h) {
    return {
      hasData: false,
      score: null,
      stage: null,
      stageName: null,
      stageDescription: null,
      trend: null,
      factors: [],
      alerts: [],
    };
  }
  return {
    hasData: true,
    score: h.overallScore,
    stage: h.stage,
    stageName: getStageName(h.stage),
    stageDescription: getStageDescription(h.stage),
    trend: h.overallTrend,
    factors: h.factors.map((f) => ({ name: f.name, score: f.score, trend: f.trend })),
    alerts: h.alerts
      .filter((a) => !a.acknowledged)
      .map((a) => ({ message: a.message, severity: a.severity })),
  };
}

async function sentiment(userId: string, period: string | null): Promise<Record<string, unknown>> {
  const timeline = await loadTimeline(userId);
  if (!timeline)
    return { hasData: false, currentMood: null, peaks: [], patterns: [], timeline: null };
  const range = period === 'week' || period === 'quarter' ? period : 'month';
  return {
    hasData: true,
    currentMood: getCurrentMoodContext(userId),
    peaks: getRecentPeaksValleys(userId),
    patterns: getInsightfulPatterns(userId).map((p) => ({
      description: p.description,
      confidence: p.confidence,
    })),
    timeline: exportTimelineData(userId, range),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function slimEvent(e: LifeEvent, now: number): Record<string, unknown> {
  return {
    id: e.id,
    description: e.description,
    type: e.type,
    date: e.date.toISOString(),
    daysUntil: Math.max(0, Math.ceil((e.date.getTime() - now) / DAY_MS)),
  };
}

async function lifeEvents(userId: string): Promise<Record<string, unknown>> {
  setUserEvents(userId, (await stored<LifeEvent[]>(userId, LIFE_EVENTS_DOC)) ?? []);
  const upcoming = getUpcomingEvents(userId);
  const now = Date.now();
  const slim = (list: LifeEvent[]): Array<Record<string, unknown>> =>
    list.map((e) => slimEvent(e, now));
  return {
    hasData: getUserEvents(userId).length > 0,
    today: slim(upcoming.today),
    thisWeek: slim(upcoming.thisWeek),
    nextWeek: slim(upcoming.nextWeek),
    thisMonth: slim(upcoming.thisMonth),
  };
}

const SITUATIONS = ['morning_routine', 'evening_wind_down', 'processing_emotion', 'after_session'];

async function journaling(
  userId: string,
  situation: string | null
): Promise<Record<string, unknown>> {
  const mood = (await loadTimeline(userId))?.currentMood ?? null;
  if (!mood) return { hasData: false, prompts: [] };
  const prompts: JournalingPrompt[] =
    situation && SITUATIONS.includes(situation)
      ? [
          generateSituationalPrompt(
            userId,
            situation as Parameters<typeof generateSituationalPrompt>[1]
          ),
        ]
      : generatePrompts({ userId, currentEmotion: mood.primaryEmotion, timeOfDay: timeOfDay() }, 3);
  return {
    hasData: true,
    prompts: prompts.map((p) => ({
      id: p.id,
      prompt: p.prompt,
      category: p.category,
      difficulty: p.difficulty,
    })),
  };
}

async function media(userId: string, query: URLSearchParams): Promise<Record<string, unknown>> {
  const asked = query.get('mood');
  const recent = asked ? null : ((await loadTimeline(userId))?.currentMood ?? null);
  const mood = asked ?? recent?.primaryEmotion ?? null;
  if (!mood) return { hasData: false, mood: null, suggestions: [] };
  const intensity = Number.parseFloat(query.get('intensity') ?? '');
  const suggestions = generateSuggestions(userId, {
    currentMood: mood,
    moodIntensity: Number.isFinite(intensity) ? intensity : (recent?.intensity ?? 0.5),
    timeOfDay: timeOfDay(),
  });
  return { hasData: true, mood, suggestions };
}

async function insights(userId: string, period: string | null): Promise<Record<string, unknown>> {
  const reports = (await stored<InsightsReport[]>(userId, 'insights_reports')) ?? [];
  const wanted = period ?? 'month';
  const latest = reports.filter((r) => r.period === wanted).pop() ?? null;
  return { hasData: reports.length > 0, latest, history: reports.slice(-5) };
}

/**
 * Serve a Trust dashboard GET route for the verified `userId`.
 * Returns false when the path isn't one of the six.
 */
export async function handleTrustDashboardRoute(
  pathname: string,
  method: string,
  userId: string,
  query: URLSearchParams,
  res: ServerResponse
): Promise<boolean> {
  if (method !== 'GET') return false;
  const routes = new Map<string, () => Promise<Record<string, unknown>>>([
    ['/api/trust/health', async () => health(userId)],
    ['/api/trust/sentiment', async () => sentiment(userId, query.get('period'))],
    ['/api/trust/life-events', async () => lifeEvents(userId)],
    ['/api/trust/journaling/prompts', async () => journaling(userId, query.get('situation'))],
    ['/api/trust/media/suggestions', async () => media(userId, query)],
    ['/api/trust/insights', async () => insights(userId, query.get('period'))],
  ]);
  const route = routes.get(pathname);
  if (route === undefined) return false;

  const respond: Respond = (status, body) => sendJSON(res, body, status);
  try {
    respond(200, await route());
  } catch (error) {
    if (!(error instanceof StoreUnavailable)) throw error;
    respond(503, { error: "Couldn't load your trust data. Try again?" });
  }
  return true;
}
