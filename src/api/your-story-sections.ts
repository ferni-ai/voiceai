/**
 * Your Story sections built only from the user's persisted data.
 *
 * Each fetcher returns null (or []) when there is nothing real, so the web
 * leaves the section out instead of drawing a default. Methods for anything
 * derived are stated next to the code that does it.
 *
 * @module api/your-story-sections
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'YourStorySections' });
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (t: number): string => new Date(t).toISOString().slice(0, 10);

// ============================================================================
// MOOD CALENDAR (superhuman/mood-calendar: bogle_users/{uid}/mood_calendar)
// ============================================================================

export interface MoodCalendarData {
  /** One entry per day that has a mood (the day's latest), oldest first */
  days: Array<{ date: string; mood: string; intensity: number }>;
  summary: {
    /** Days whose mood was calm or content */
    calmDays: number;
    /** The most frequent mood across entries */
    dominantMood: string;
    /**
     * Share of good-mood days (joyful, content, calm, hopeful) in the later
     * half of the days vs the earlier half: +15 points or more = improving,
     * -15 or more = declining, else stable. Null with fewer than 6 days.
     */
    trend: 'improving' | 'stable' | 'declining' | null;
  };
}

const GOOD_MOODS = new Set(['joyful', 'content', 'calm', 'hopeful']);
const CALM_MOODS = new Set(['calm', 'content']);

export async function fetchMoodCalendar(userId: string): Promise<MoodCalendarData | null> {
  try {
    const { loadMoodEntries } = await import('../services/superhuman/mood-calendar.js');
    const entries = (await loadMoodEntries(userId, 30)).filter((e) => e.mood);
    if (entries.length === 0) return null;

    const byDay = new Map<string, { mood: string; intensity: number; t: number }>();
    for (const e of entries) {
      const date = isoDate(e.timestamp);
      const seen = byDay.get(date);
      if (!seen || e.timestamp > seen.t) {
        byDay.set(date, { mood: e.mood, intensity: e.intensity, t: e.timestamp });
      }
    }
    const days = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, mood: d.mood, intensity: d.intensity }));

    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.mood, (counts.get(e.mood) ?? 0) + 1);
    const dominantMood = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

    let trend: MoodCalendarData['summary']['trend'] = null;
    if (days.length >= 6) {
      const half = Math.floor(days.length / 2);
      const share = (ds: typeof days) =>
        ds.filter((d) => GOOD_MOODS.has(d.mood)).length / ds.length;
      const delta = share(days.slice(days.length - half)) - share(days.slice(0, half));
      trend = delta >= 0.15 ? 'improving' : delta <= -0.15 ? 'declining' : 'stable';
    }

    return {
      days,
      summary: {
        calmDays: days.filter((d) => CALM_MOODS.has(d.mood)).length,
        dominantMood,
        trend,
      },
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch mood calendar');
    return null;
  }
}

// ============================================================================
// LIFE CHAPTERS (superhuman/life-narrative: bogle_users/{uid}/life_chapters)
// ============================================================================

export interface LifeChapter {
  id: string;
  title: string;
  summary: string;
  /** life-narrative ChapterType: struggle, growth, triumph, transition, ... */
  type: string;
  startDate: string;
  endDate?: string;
  /** Ongoing: no end date */
  isActive: boolean;
}

/** The user's chapters, oldest first; [] when there are none. */
export async function fetchLifeChapters(userId: string): Promise<LifeChapter[]> {
  try {
    const { loadUserChapters } = await import('../services/superhuman/life-narrative.js');
    const chapters = await loadUserChapters(userId);
    return chapters
      .filter((c) => c.title && Number.isFinite(c.startDate))
      .sort((a, b) => a.startDate - b.startDate)
      .map((c) => ({
        id: c.id,
        title: c.title,
        summary: c.summary ?? '',
        type: c.type,
        startDate: new Date(c.startDate).toISOString(),
        ...(c.endDate ? { endDate: new Date(c.endDate).toISOString() } : {}),
        isActive: !c.endDate,
      }));
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch life chapters');
    return [];
  }
}

// ============================================================================
// EMOTIONAL ARC (semantic-intelligence/emotional-trajectories)
// ============================================================================

export interface EmotionalArcSummary {
  theme: string;
  /** emerging | building | peak | resolving | recurring */
  phase: string;
  trend: string;
  narrative: string;
  /** The arc's waypoints, oldest first */
  waypoints: Array<{ timestamp: string; emotion: string; intensity: number }>;
}

/** The most recently updated active arc with at least one waypoint, or null. */
export async function fetchEmotionalArc(userId: string): Promise<EmotionalArcSummary | null> {
  try {
    const { getActiveArcs } =
      await import('../services/superhuman/semantic-intelligence/emotional-trajectories.js');
    const arc = (await getActiveArcs(userId))
      .filter((a) => a.theme && (a.waypoints?.length ?? 0) > 0)
      .sort((a, b) => b.lastUpdated - a.lastUpdated)[0];
    if (!arc) return null;
    return {
      theme: arc.theme,
      phase: arc.phase,
      trend: arc.trend,
      narrative: arc.narrative ?? '',
      waypoints: [...arc.waypoints]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((w) => ({
          timestamp: new Date(w.timestamp).toISOString(),
          emotion: w.emotion,
          intensity: w.intensity,
        })),
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch emotional arc');
    return null;
  }
}

// ============================================================================
// YOUR WORLD (superhuman/relationship-network)
// ============================================================================

export interface YourWorld {
  totalConnections: number;
  /** Mentioned in the last 30 days */
  activeConnections: number;
  /** Names the network service flags as worth reaching out to */
  needsAttention: string[];
  people: Array<{
    name: string;
    /** relationship-network type: family, partner, friend, colleague, mentor, ... */
    type: string;
    /** 0-1, how much they come up (relationship-network importance) */
    strength: number;
    lastMentioned: string;
    /** Days since last mentioned */
    daysSinceMention: number;
  }>;
}

export async function fetchYourWorld(userId: string, now = Date.now()): Promise<YourWorld | null> {
  try {
    const { loadNetwork, findConnectionOpportunities } =
      await import('../services/superhuman/relationship-network.js');
    const network = await loadNetwork(userId);
    if (network.length === 0) return null;
    const opportunities = await findConnectionOpportunities(userId);

    const people = [...network]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 8)
      .map((p) => ({
        name: p.name,
        type: p.type,
        strength: Math.max(0, Math.min(1, p.importance)),
        lastMentioned: new Date(p.lastMentioned).toISOString(),
        daysSinceMention: Math.floor((now - p.lastMentioned) / DAY_MS),
      }));
    const byId = new Map(network.map((p) => [p.id, p.name]));
    return {
      totalConnections: network.length,
      activeConnections: network.filter((p) => now - p.lastMentioned < 30 * DAY_MS).length,
      needsAttention: [
        ...new Set(opportunities.map((o) => byId.get(o.personId) ?? o.personName).filter(Boolean)),
      ],
      people,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch your world');
    return null;
  }
}

// ============================================================================
// OPEN LOOPS (semantic-intelligence/open-loops: status open)
// ============================================================================

export interface OpenLoopsData {
  total: number;
  items: Array<{
    id: string;
    /** open-loops type: intention, commitment, question, concern, ... */
    type: string;
    content: string;
    createdAt: string;
    priority: 'high' | 'medium' | 'low';
    relatedPerson?: string;
  }>;
}

/** Every open loop, newest first (up to 10 listed), or null when there are none. */
export async function fetchOpenLoops(userId: string): Promise<OpenLoopsData | null> {
  try {
    const { getAllOpenLoops } =
      await import('../services/superhuman/semantic-intelligence/open-loops.js');
    const loops = await getAllOpenLoops(userId);
    if (loops.length === 0) return null;
    const items = [...loops]
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        type: l.type,
        content: l.description || l.content,
        createdAt: new Date(l.created).toISOString(),
        priority: (l.priority >= 7 ? 'high' : l.priority >= 4 ? 'medium' : 'low') as
          | 'high'
          | 'medium'
          | 'low',
        ...(l.relatedPerson ? { relatedPerson: l.relatedPerson } : {}),
      }));
    return { total: loops.length, items };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch open loops');
    return null;
  }
}
