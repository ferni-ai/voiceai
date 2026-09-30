/**
 * Session recall: what Ferni remembers about the caller, ready on every turn.
 *
 * The live pipeline writes what the user shares to bogle_users/{id}/
 * dynamic_facts (e.g. "Biscuit | breed = golden retriever") and session
 * summaries with follow-up items. Per-turn retrieval read entity_store and
 * the vector store instead, which nothing fills any more, so recall returned
 * nothing (measured 2026-09-27: 0 results for a user with 56 facts, 32 of
 * them about their dog).
 *
 * A user's memory is small (tens to low hundreds of facts), so it is loaded
 * once when the call starts and each turn is matched in memory: no network
 * on the turn path, and the reply is never interrupted to add a memory.
 *
 * @module memory/recall/session-recall
 */

import { followUpsFromSummaries, formatFollowUps, toMillis, type FollowUp } from './follow-ups.js';
import type { SharedLaugh } from './shared-laughs.js';
import type { ToldStory } from './told-stories.js';
import { contentWords, mentions } from './words.js';

export { contentWords, mentions };

export interface RecallFact {
  entity: string;
  key: string;
  value: string;
  confidence: number;
}

export interface RecallSnapshot {
  facts: RecallFact[];
  /** Open threads from recent sessions ("ask how the vet visit went"), with when. */
  followUps: FollowUp[];
  /** Moments they laughed at, for callbacks (see shared-laughs.ts). */
  laughs: SharedLaugh[];
  /** How the most recent call felt, from its summary ("started anxious, ended calmer"). */
  lastCall?: { at: number; arc: string };
  /** Stories the personas have already told them (see told-stories.ts). */
  toldStories?: ToldStory[];
  /** How recent calls felt, oldest first, for noticing change over time. */
  recentArcs?: Array<{ at: number; arc: string }>;
}

export const EMPTY_SNAPSHOT: RecallSnapshot = { facts: [], followUps: [], laughs: [] };

/** The entity the extractor uses for the caller themself. */
const SELF_ENTITY = /^(speaker|user|me)$/i;

/** Same fact extracted in several sessions counts once, at its highest confidence. */
export function dedupeFacts(facts: RecallFact[]): RecallFact[] {
  const best = new Map<string, RecallFact>();
  for (const f of facts) {
    if (!f.entity || !f.value) continue;
    const id = `${f.entity}|${f.key}|${f.value}`.toLowerCase();
    const seen = best.get(id);
    if (!seen || f.confidence > seen.confidence) best.set(id, f);
  }
  return [...best.values()];
}

export function factId(f: RecallFact): string {
  return `${f.entity}|${f.key}|${f.value}`.toLowerCase();
}

/**
 * The facts worth bringing to this turn, best first.
 *
 * A fact is relevant when the user names its entity, or shares content words
 * with it. Facts already surfaced this session are skipped so Ferni does not
 * keep repeating the same recollection.
 */
export function recallForTurn(
  snapshot: RecallSnapshot,
  userText: string,
  surfaced: ReadonlySet<string> = new Set(),
  max = 4
): RecallFact[] {
  const words = contentWords(userText);
  const scored: Array<{ fact: RecallFact; score: number }> = [];
  for (const fact of snapshot.facts) {
    if (surfaced.has(factId(fact))) continue;
    const named = !SELF_ENTITY.test(fact.entity) && mentions(userText, fact.entity);
    let overlap = 0;
    for (const w of contentWords(`${fact.entity} ${fact.key} ${fact.value}`)) {
      if (words.has(w)) overlap++;
    }
    if (!named && overlap === 0) continue;
    scored.push({ fact, score: (named ? 2 : 0) + overlap * 0.5 + fact.confidence * 0.5 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.fact);
}

/** A context note for the LLM, or null when there is nothing to recall. */
export function formatRecall(
  facts: RecallFact[],
  followUps: FollowUp[],
  userName?: string,
  clock: { now?: number; timezone?: string } = {}
): string | null {
  if (facts.length === 0 && followUps.length === 0) return null;
  const who = userName || 'them';
  const lines: string[] = [`[WHAT YOU REMEMBER ABOUT ${who.toUpperCase()}]`];
  for (const f of facts) {
    const subject = SELF_ENTITY.test(f.entity) ? who : f.entity;
    lines.push(`- ${subject}: ${f.key.replace(/_/g, ' ')} = ${f.value}`);
  }
  lines.push(...formatFollowUps(followUps, clock.now ?? Date.now(), clock.timezone));
  lines.push(
    'Use at most one of these, and only if it fits naturally, the way a friend who remembers would. Never list them or say you looked it up.'
  );
  return lines.join('\n');
}

/** The slice of Firestore this module reads; injected so tests need no database. */
export interface RecallStore {
  facts(userId: string): Promise<Array<Record<string, unknown>>>;
  summaries(userId: string): Promise<Array<Record<string, unknown>>>;
  /** Shared laughs and inside jokes, already normalized. Optional: older stores have none. */
  laughs?(userId: string): Promise<SharedLaugh[]>;
  /** Ids of threads already raised on an earlier call. Optional like laughs. */
  closedFollowUps?(userId: string): Promise<string[]>;
  /** Stories already told, newest first. Optional like laughs. */
  toldStories?(userId: string): Promise<ToldStory[]>;
  /** Plans the caller said they would do, newest first (commitments.ts). Optional. */
  commitments?(userId: string): Promise<FollowUp[]>;
}

const MAX_FACTS = 300;

/** Load a user's recall snapshot. Never throws; an unreachable store yields an empty snapshot. */
export async function loadRecallSnapshot(
  store: RecallStore,
  userId: string
): Promise<RecallSnapshot> {
  const [rawFacts, rawSummaries, laughs, closed, toldStories, commitments] = await Promise.all([
    store.facts(userId).catch(() => []),
    store.summaries(userId).catch(() => []),
    store.laughs ? store.laughs(userId).catch(() => []) : Promise.resolve([]),
    store.closedFollowUps ? store.closedFollowUps(userId).catch(() => []) : Promise.resolve([]),
    store.toldStories ? store.toldStories(userId).catch(() => []) : Promise.resolve([]),
    store.commitments ? store.commitments(userId).catch(() => []) : Promise.resolve([]),
  ]);
  const facts = dedupeFacts(
    rawFacts.slice(0, MAX_FACTS).map((d) => ({
      entity: String(d.entityName ?? ''),
      key: String(d.key ?? ''),
      value: String(d.value ?? ''),
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
    }))
  );
  const closedIds = new Set(closed);
  const followUps = mergeFollowUps(
    commitments.filter((c) => !closedIds.has(c.id)),
    followUpsFromSummaries(rawSummaries, closedIds)
  );
  return {
    facts,
    followUps,
    laughs,
    ...lastCallOf(rawSummaries),
    ...recentArcsOf(rawSummaries),
    ...(toldStories.length > 0 ? { toldStories } : {}),
  };
}

/** A last call older than this is not "last time" any more. */
const LAST_CALL_MAX_DAYS = 21;

/** How the newest summarized call felt, when it is recent enough to carry. */
function lastCallOf(
  summaries: ReadonlyArray<Record<string, unknown>>,
  now: number = Date.now()
): Pick<RecallSnapshot, 'lastCall'> {
  const newest = summaries[0];
  const arc = String(newest?.emotionalArc ?? '').trim();
  const at = toMillis(newest?.timestamp);
  if (!arc || !at || now - at > LAST_CALL_MAX_DAYS * 86_400_000) return {};
  return { lastCall: { at, arc } };
}

/** Calls further back than this are a different chapter. */
const TREND_MAX_DAYS = 60;
/** A trend needs a few calls; one or two is just how things were. */
const TREND_MIN_CALLS = 3;

/** How the recent summarized calls felt, oldest first, when there are enough to show a trend. */
function recentArcsOf(
  summaries: ReadonlyArray<Record<string, unknown>>,
  now: number = Date.now()
): Pick<RecallSnapshot, 'recentArcs'> {
  const arcs = summaries
    .map((s) => ({ at: toMillis(s.timestamp), arc: String(s.emotionalArc ?? '').trim() }))
    .filter((a) => a.arc && a.at && now - a.at <= TREND_MAX_DAYS * 86_400_000)
    .reverse();
  return arcs.length >= TREND_MIN_CALLS ? { recentArcs: arcs } : {};
}

/** Threads offered at once: their own plans first, then the summaries'. */
const MAX_OPEN_THREADS = 4;

/** Their plans (in their words) before the summaries' threads, once each, newest first. */
function mergeFollowUps(commitments: FollowUp[], fromSummaries: FollowUp[]): FollowUp[] {
  const out: FollowUp[] = [];
  const ids = new Set<string>();
  for (const f of [...commitments, ...fromSummaries]) {
    if (ids.has(f.id)) continue;
    ids.add(f.id);
    out.push(f);
    if (out.length >= MAX_OPEN_THREADS) break;
  }
  return out;
}
