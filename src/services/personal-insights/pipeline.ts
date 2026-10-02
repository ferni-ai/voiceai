/**
 * Personal insights pipeline: precompute after each conversation, read
 * cheaply at session start.
 *
 *   onConversationSummarized(userId, conversationId, summary?, turns?)
 *     1. score the predictions made before this conversation (calibration)
 *     2. recompute people, life threads, dates, predictions, insights/openers
 *     3. save derived docs and refresh the cache
 *
 * Everything is recomputed from the user's current memory, so deleted
 * sources (and tombstoned facts/people) drop out on the next pass.
 *
 * @module services/personal-insights/pipeline
 */

import { callLLM } from '../llm-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  INSIGHTS_LIMITS,
  INSIGHTS_TTL_MS,
  personalInsightsEnabled,
  personalInsightsLlmEnabled,
} from './config.js';
import { createFirestoreInsightsStore, type InsightsStore } from './firestore-store.js';
import {
  buildEvidence,
  generateInsights,
  upcomingFromDetected,
  type InsightLlm,
} from './insight-generator.js';
import { keepInTouchNudges } from './friends.js';
import { filterAllowed, syncDetectedDates, upcomingFromStore } from './integrations.js';
import { buildPeopleModel, findPerson, personMatchTerms } from './people-model.js';
import { looksLikeProperName, mentions } from './text-utils.js';
import { calibrationFrom, predictTopics, scorePredictions } from './prediction.js';
import { conversationText, buildLifeThreads } from './topic-threads.js';
import type {
  ApiPerson,
  InsightBundle,
  LifeThread,
  PersonProfile,
  PersonSummary,
  UpcomingDate,
} from './types.js';

const log = createLogger({ module: 'personal-insights' });

export interface PipelineDeps {
  store?: InsightsStore;
  llm?: InsightLlm | null;
  now?: () => number;
}

let defaultStore: InsightsStore | null = null;
const deps = (d: PipelineDeps = {}) => ({
  store: d.store ?? (defaultStore ??= createFirestoreInsightsStore()),
  llm:
    d.llm === null ? undefined : (d.llm ?? (personalInsightsLlmEnabled() ? defaultLlm : undefined)),
  now: d.now ?? Date.now,
});

const defaultLlm: InsightLlm = (prompt) =>
  callLLM(prompt, { maxTokens: 700, temperature: 0.3, timeout: 10_000 });

// ============================================================================
// CACHE (per user, TTL tiers like the superhuman cache)
// ============================================================================

interface Cached<T> {
  value: T;
  expires: number;
}
const peopleCache = new Map<string, Cached<PersonProfile[]>>();
const bundleCache = new Map<string, Cached<InsightBundle | null>>();

function cached<T>(map: Map<string, Cached<T>>, key: string, now: number): T | undefined {
  const hit = map.get(key);
  if (hit && hit.expires > now) return hit.value;
  map.delete(key);
  return undefined;
}

export function invalidatePersonalInsightsCache(userId?: string): void {
  if (userId) {
    peopleCache.delete(userId);
    bundleCache.delete(userId);
  } else {
    peopleCache.clear();
    bundleCache.clear();
  }
}

// ============================================================================
// PRECOMPUTE
// ============================================================================

export interface RefreshResult {
  people: number;
  threads: number;
  predictions: number;
  openers: number;
  dates: number;
}

/** Recompute everything for a user from their current memory. Never throws. */
export async function refreshPersonalInsights(
  userId: string,
  d: PipelineDeps = {}
): Promise<RefreshResult | null> {
  if (!personalInsightsEnabled() || !userId || userId === 'anonymous') return null;
  const { store, llm, now } = deps(d);
  const nowMs = now();
  try {
    const [rawSources, tombstones, outcomes] = await Promise.all([
      store.loadSources(userId),
      store.loadTombstoneIds(userId),
      store.loadOutcomes(userId, INSIGHTS_LIMITS.calibrationWindow).catch(() => []),
    ]);
    const sources = { ...rawSources, facts: rawSources.facts.filter((f) => !tombstones.has(f.id)) };

    const { people, dates } = buildPeopleModel(sources, nowMs, tombstones);
    const threads = buildLifeThreads(sources, people, nowMs);
    // Never proactive: someone who has died (dates stay in their profile only),
    // a former partner, or an estranged relative. They still get per-turn
    // context when the user brings them up.
    const quietIds = new Set(
      people
        .filter(
          (p) =>
            p.memorial ||
            p.relationshipDetails?.isFormer ||
            p.relationshipDetails?.status === 'estranged'
        )
        .map((p) => p.id)
    );
    const synced = await syncDetectedDates(
      userId,
      dates.filter((d) => !d.personId || !quietIds.has(d.personId))
    );
    const fromStore = await upcomingFromStore(userId, INSIGHTS_LIMITS.upcomingWindowDays);
    const upcomingDates = upcomingFromDetected(
      fromStore ?? dates,
      nowMs,
      INSIGHTS_LIMITS.upcomingWindowDays
    ).filter((u) => !u.personId || !quietIds.has(u.personId));
    const proactivePeople = people.filter((p) => !quietIds.has(p.id) || p.memorial);
    const quietTerms = people
      .filter((p) => quietIds.has(p.id) && !p.memorial)
      .flatMap((p) => personMatchTerms(p, true).filter((t) => looksLikeProperName(t)));
    const isQuiet = (text: string) => quietTerms.some((t) => mentions(text, t));
    const proactiveThreads = threads.filter(
      (t) =>
        !t.personIds.some((id) => quietIds.has(id) && !people.find((p) => p.id === id)?.memorial)
    );

    const predicted = predictTopics({
      threads: proactiveThreads,
      people: proactivePeople,
      upcomingDates,
      summaries: sources.summaries,
      conversations: sources.conversations,
      calibration: calibrationFrom(outcomes),
      nowMs,
      max: INSIGHTS_LIMITS.maxPredictions * 2,
    });
    // Boundaries are hard constraints: filter before anything is surfaced.
    const predictions = (
      await filterAllowed(
        userId,
        predicted.filter((p) => !isQuiet(`${p.label} ${p.reason}`)),
        (p) => p.label
      )
    ).slice(0, INSIGHTS_LIMITS.maxPredictions);
    const allowedPeople = await filterAllowed(userId, proactivePeople, (p) =>
      `${p.name} ${p.openThreads[0]?.text ?? ''}`.trim()
    );
    const allowedThreads = await filterAllowed(userId, proactiveThreads, (t) => t.label);
    const allowedDates = await filterAllowed(userId, upcomingDates, (u) => u.title);

    const { evidence, safetyHold } = buildEvidence({
      people: allowedPeople.filter((p) => p.openThreads.length > 0 || p.keyFacts.length > 0),
      threads: allowedThreads,
      upcomingDates: allowedDates,
      summaries: sources.summaries,
      nowMs,
      exclude: isQuiet,
    });
    const generated = await generateInsights(evidence, {
      llm,
      maxInsights: INSIGHTS_LIMITS.maxInsights,
      maxOpeners: INSIGHTS_LIMITS.maxOpeners,
    });
    const insights = await filterAllowed(userId, generated.insights, (i) => i.text);
    const openers = safetyHold ? [] : await filterAllowed(userId, generated.openers, (o) => o.text);
    const nudges = safetyHold
      ? []
      : await filterAllowed(userId, keepInTouchNudges(allowedPeople, userId, nowMs), (n) => n.text);

    const bundle: InsightBundle = {
      computedAt: nowMs,
      predictions,
      insights,
      openers,
      nudges,
      upcomingDates: allowedDates,
      people: summarizePeople(allowedPeople),
      safetyHold,
      generator: generated.generator,
      sourceConversationIds: [
        ...new Set([
          ...allowedPeople
            .slice(0, INSIGHTS_LIMITS.maxPeopleInBlock)
            .flatMap((p) => p.sourceConversationIds),
          ...allowedThreads.flatMap((t) => t.sourceConversationIds),
          ...insights.flatMap((i) => i.sourceConversationIds),
          ...openers.flatMap((o) => o.sourceConversationIds),
          ...nudges.flatMap((n) => n.sourceConversationIds),
        ]),
      ],
    };
    await store.saveDerived(userId, { people, threads, bundle });
    peopleCache.set(userId, { value: [...people], expires: nowMs + INSIGHTS_TTL_MS.people });
    bundleCache.set(userId, { value: bundle, expires: nowMs + INSIGHTS_TTL_MS.bundle });
    log.info(
      {
        userId,
        people: people.length,
        threads: threads.length,
        predictions: predictions.length,
        openers: openers.length,
        generator: generated.generator,
        ms: now() - nowMs,
      },
      'Personal insights refreshed'
    );
    return {
      people: people.length,
      threads: threads.length,
      predictions: predictions.length,
      openers: openers.length,
      dates: synced || dates.length,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Personal insights refresh failed');
    return null;
  }
}

function summarizePeople(people: readonly PersonProfile[]): PersonSummary[] {
  return [...people]
    .sort(
      (a, b) =>
        Number(b.openThreads.length > 0) - Number(a.openThreads.length > 0) ||
        b.lastMentionedAt - a.lastMentionedAt
    )
    .slice(0, INSIGHTS_LIMITS.maxPeopleInBlock)
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      relationship: p.relationship,
      openThread: p.openThreads[0]?.text,
      memorial: p.memorial || undefined,
    }));
}

/**
 * Hook for the end of a conversation (session end, or the catch-up
 * summarization job): score the previous predictions against what was
 * actually discussed, then recompute. Never throws.
 */
export async function onConversationSummarized(
  userId: string,
  conversationId: string,
  summary?: string,
  turns?: ReadonlyArray<{ role?: string; text?: string; content?: string }>,
  d: PipelineDeps = {}
): Promise<RefreshResult | null> {
  if (!personalInsightsEnabled() || !userId || userId === 'anonymous') return null;
  const { store, now } = deps(d);
  try {
    const bundle = await store.loadBundle(userId);
    if (bundle && bundle.predictions.length > 0) {
      const sources = await store.loadSources(userId);
      const userWords = (turns ?? [])
        .filter((t) => t.role !== 'assistant')
        .map((t) => t.text ?? t.content ?? '');
      const text = conversationText(sources.summaries, conversationId, [
        summary ?? '',
        ...userWords,
      ]);
      if (text.trim()) {
        const outcome = scorePredictions(
          bundle.predictions,
          conversationId,
          text,
          bundle.computedAt,
          now()
        );
        await store.saveOutcome(userId, outcome);
        log.info(
          {
            userId,
            conversationId,
            hits: outcome.hits,
            total: outcome.total,
            brier: outcome.brier,
          },
          'Predictions scored'
        );
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId, conversationId }, 'Prediction scoring failed');
  }
  return refreshPersonalInsights(userId, d);
}

// ============================================================================
// READS
// ============================================================================

/** The precomputed bundle for the session start (cache, then one doc read). */
export async function loadSessionInsights(
  userId: string,
  d: PipelineDeps = {}
): Promise<InsightBundle | null> {
  if (!personalInsightsEnabled() || !userId || userId === 'anonymous') return null;
  const { store, now } = deps(d);
  const nowMs = now();
  const hit = cached(bundleCache, userId, nowMs);
  if (hit !== undefined) return hit;
  try {
    const bundle = await store.loadBundle(userId);
    bundleCache.set(userId, { value: bundle, expires: nowMs + INSIGHTS_TTL_MS.bundle });
    return bundle ? withFreshDates(bundle, nowMs) : null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Session insights unavailable');
    return null;
  }
}

/** Recount "in N days" for a bundle computed earlier; drop dates that passed. */
function withFreshDates(bundle: InsightBundle, nowMs: number): InsightBundle {
  const shift = Math.floor((nowMs - bundle.computedAt) / 86_400_000);
  if (shift <= 0) return bundle;
  const upcomingDates: UpcomingDate[] = bundle.upcomingDates
    .map((u) => ({ ...u, daysAway: u.daysAway - shift }))
    .filter((u) => u.daysAway >= 0);
  return { ...bundle, upcomingDates };
}

export async function getPeople(userId: string, d: PipelineDeps = {}): Promise<PersonProfile[]> {
  if (!userId) return [];
  const { store, now } = deps(d);
  const nowMs = now();
  const hit = cached(peopleCache, userId, nowMs);
  if (hit) return hit;
  try {
    const people = await store.loadPeople(userId);
    people.sort((a, b) => b.lastMentionedAt - a.lastMentionedAt);
    peopleCache.set(userId, { value: people, expires: nowMs + INSIGHTS_TTL_MS.people });
    return people;
  } catch {
    return [];
  }
}

export async function getPerson(
  userId: string,
  nameOrAlias: string,
  d: PipelineDeps = {}
): Promise<PersonProfile | null> {
  return findPerson(await getPeople(userId, d), nameOrAlias);
}

export async function getLifeThreads(userId: string, d: PipelineDeps = {}): Promise<LifeThread[]> {
  try {
    return await deps(d).store.loadThreads(userId);
  } catch {
    return [];
  }
}

/** People in the `/api/memory/me` shape: `{ id, name, relationship?, notes?, updatedAt }`. */
export function toApiPerson(p: PersonProfile): ApiPerson {
  const notes = [...p.keyFacts.map((f) => f.text), ...p.openThreads.map((t) => `Open: ${t.text}`)]
    .slice(0, 5)
    .join(' • ');
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    memorial: p.memorial || undefined,
    relationship: p.relationship?.replace(/_/g, ' '),
    notes: notes || undefined,
    updatedAt: new Date(p.updatedAt).toISOString(),
  };
}

export async function getPeopleForApi(userId: string, d: PipelineDeps = {}): Promise<ApiPerson[]> {
  return (await getPeople(userId, d)).map(toApiPerson);
}
