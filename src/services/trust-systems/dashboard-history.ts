/**
 * The Trust dashboard's history: sentiment timeline and life events.
 *
 * The voice agent records both per turn, in its own process. They persist at
 * session end with the other trust profiles (persistence.ts) so the API server
 * can show them, and load at session start so history accumulates across
 * calls instead of each session overwriting the last.
 *
 * Session start loads in the background, so a turn can be recorded before the
 * load lands: loading merges what's already in memory instead of dropping it.
 * If the load fails, saving this user's history is skipped - writing a
 * timeline that never saw the stored one would erase it.
 *
 * @module services/trust-systems/dashboard-history
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getUserEvents, setUserEvents, type LifeEvent } from './life-events.js';
import { getTimeline, setTimeline, type SentimentTimeline } from './sentiment-timeline.js';
import { readTrustDoc, writeTrustDoc } from './trust-doc.js';

const log = createLogger({ module: 'TrustDashboardHistory' });

export const TIMELINE_DOC = 'sentiment_timeline';
export const LIFE_EVENTS_DOC = 'life_events';

/** Users whose stored history couldn't be read in this process. */
const unreadable = new Set<string>();

/** The stored timeline plus snapshots recorded here that it doesn't have yet. */
export function mergeTimeline(
  stored: SentimentTimeline,
  live: SentimentTimeline | null
): SentimentTimeline {
  const known = new Set(stored.snapshots.map((s) => s.id));
  const extra = (live?.snapshots ?? []).filter((s) => !known.has(s.id));
  if (extra.length === 0) return stored;
  const latest = extra[extra.length - 1];
  return {
    ...stored,
    snapshots: [...stored.snapshots, ...extra],
    currentMood: latest,
    lastUpdated: latest.timestamp,
  };
}

function eventKey(e: LifeEvent): string {
  return `${e.date.toDateString()}|${e.description.trim().toLowerCase()}`;
}

/** Stored events plus events recorded here that aren't stored yet. */
export function mergeLifeEvents(stored: LifeEvent[], live: LifeEvent[]): LifeEvent[] {
  const known = new Set(stored.map(eventKey));
  return [...stored, ...live.filter((e) => !known.has(eventKey(e)))];
}

/** Load a user's stored history into memory. Returns the systems loaded. */
export async function loadDashboardHistory(userId: string): Promise<string[]> {
  const [timeline, events] = await Promise.all([
    readTrustDoc<SentimentTimeline>(userId, TIMELINE_DOC),
    readTrustDoc<LifeEvent[]>(userId, LIFE_EVENTS_DOC),
  ]);
  if (timeline.status === 'error' || events.status === 'error') {
    unreadable.add(userId);
  } else {
    unreadable.delete(userId);
  }

  const loaded: string[] = [];
  if (timeline.status === 'found') {
    setTimeline(userId, mergeTimeline(timeline.data, getTimeline(userId)));
    loaded.push('sentimentTimeline');
  }
  if (events.status === 'found') {
    setUserEvents(userId, mergeLifeEvents(events.data, getUserEvents(userId)));
    loaded.push('lifeEvents');
  }
  return loaded;
}

/** Save a user's history (only what exists). Returns the systems saved and failed. */
export async function saveDashboardHistory(
  userId: string
): Promise<{ saved: string[]; failed: string[] }> {
  const saved: string[] = [];
  const failed: string[] = [];
  if (unreadable.has(userId)) {
    log.warn({ userId }, 'Stored trust history was unreadable this session; not overwriting it');
    return { saved, failed: ['sentimentTimeline', 'lifeEvents'] };
  }

  const timeline = getTimeline(userId);
  if (timeline) {
    ((await writeTrustDoc(userId, TIMELINE_DOC, timeline)) ? saved : failed).push(
      'sentimentTimeline'
    );
  }
  const events = getUserEvents(userId);
  if (events.length > 0) {
    ((await writeTrustDoc(userId, LIFE_EVENTS_DOC, events)) ? saved : failed).push('lifeEvents');
  }
  return { saved, failed };
}
