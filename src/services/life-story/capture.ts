/**
 * Capture for life story, values and beliefs:
 *
 * - Live, per user turn: `recordUserTurnLifeStory` (voice transcript handler,
 *   next to the preference and work/places capture). The user's own words.
 * - After a conversation is summarized (session end and catch-up, via
 *   services/memory/conversation-summarized-hooks.ts):
 *   `onConversationSummarized` reads the user turns, the summary (inferred)
 *   and this conversation's facts with story/value/belief keys.
 *
 * Beliefs are written only with the `beliefs` consent (checked per write in
 * the store); values and story are not gated, except that a story touching a
 * switched-off sensitive category is skipped. Everything carries the
 * conversation id (and fact id when derived from a fact).
 *
 * @module services/life-story/capture
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { beliefsEnabled, seenBeliefRecently } from './consent.js';
import { detectInSummary, detectInUserText, type Detection, type DetectedStory } from './detect.js';
import { inputsFromFacts, type FactLike } from './facts-mapping.js';
import { linkStoryItem } from './links.js';
import { upsertItem } from './store.js';
import type { BeliefInput, MemorySource, StoryInput, UpsertResult, ValueInput } from './types.js';
import { recordValue, type ValueOutcome } from './values-store.js';

const log = createLogger({ module: 'LifeStoryCapture' });

function realUser(userId: string | undefined): userId is string {
  return !!userId && userId !== 'anonymous';
}

export interface CaptureReport {
  readonly stories: UpsertResult[];
  readonly values: ValueOutcome[];
  readonly beliefs: UpsertResult[];
}

const EMPTY: CaptureReport = { stories: [], values: [], beliefs: [] };

function storyInput(
  d: DetectedStory,
  source: MemorySource,
  confidence: number,
  conversationId?: string
): StoryInput {
  return { area: 'story', ...d, source, confidence, ...(conversationId ? { conversationId } : {}) };
}

async function applyStories(
  userId: string,
  inputs: readonly StoryInput[]
): Promise<UpsertResult[]> {
  const out: UpsertResult[] = [];
  for (const input of inputs) {
    const result = await upsertItem(userId, input);
    if (
      result.item?.area === 'story' &&
      (result.outcome === 'created' || result.outcome === 'updated')
    ) {
      await linkStoryItem(userId, result.item);
    }
    out.push(result);
  }
  return out;
}

async function applyValues(userId: string, inputs: readonly ValueInput[]): Promise<ValueOutcome[]> {
  const out: ValueOutcome[] = [];
  for (const input of inputs) out.push((await recordValue(userId, input)).outcome);
  return out;
}

async function applyBeliefs(
  userId: string,
  inputs: readonly BeliefInput[],
  live: boolean
): Promise<UpsertResult[]> {
  if (inputs.length === 0) return [];
  // Consent is checked once here (cheap exit) and again by the store on every write.
  if (!(await beliefsEnabled(userId)))
    return inputs.map(() => ({ outcome: 'skipped_no_consent' as const }));
  const out: UpsertResult[] = [];
  for (const input of inputs) {
    if (live && seenBeliefRecently(userId, input.title.toLowerCase())) continue;
    out.push(await upsertItem(userId, input));
  }
  return out;
}

async function applyDetection(
  userId: string,
  found: Detection,
  conversationId: string | undefined,
  live: boolean
): Promise<CaptureReport> {
  const conv = conversationId ? { conversationId } : {};
  return {
    stories: await applyStories(
      userId,
      found.stories.map((s) => storyInput(s, 'stated', 0.85, conversationId))
    ),
    values: await applyValues(
      userId,
      found.values.map((v) => ({ ...v, source: 'stated' as const, confidence: 0.85, ...conv }))
    ),
    beliefs: await applyBeliefs(
      userId,
      found.beliefs.map((b) => ({
        area: 'beliefs' as const,
        ...b,
        source: 'stated' as const,
        confidence: 0.85,
        ...conv,
      })),
      live
    ),
  };
}

/** Live capture for one user utterance. Never throws. */
export async function recordUserTurnLifeStory(
  userId: string,
  text: string,
  conversationId?: string
): Promise<CaptureReport> {
  if (!realUser(userId) || !text || text.length < 10) return EMPTY;
  try {
    const found = detectInUserText(text);
    if (!found.stories.length && !found.values.length && !found.beliefs.length) return EMPTY;
    return await applyDetection(userId, found, conversationId, true);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Life story turn capture failed');
    return EMPTY;
  }
}

async function conversationFacts(userId: string, conversationId: string): Promise<FactLike[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_facts')
      .where('sourceConversationIds', 'array-contains', conversationId)
      .limit(200)
      .get();
    return (snap.docs ?? []).map((d) => ({ id: d.id, ...(d.data() as object) }) as FactLike);
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Could not read extraction output');
    return [];
  }
}

export interface SummarizedTurn {
  readonly role: string;
  readonly text: string;
}

/**
 * Hook for session end and catch-up summarization (never throws):
 *   await onConversationSummarized(userId, conversationId, summary, turns)
 */
export async function onConversationSummarized(
  userId: string,
  conversationId: string,
  summary: string,
  turns: readonly SummarizedTurn[]
): Promise<{ applied: number; skipped: number }> {
  if (!realUser(userId) || !conversationId) return { applied: 0, skipped: 0 };
  try {
    const userText = turns
      .filter((t) => t.role === 'user' && t.text)
      .map((t) => t.text)
      .join('\n');
    const reports: CaptureReport[] = [];
    if (userText)
      reports.push(await applyDetection(userId, detectInUserText(userText), conversationId, false));
    if (summary) {
      reports.push({
        ...EMPTY,
        stories: await applyStories(
          userId,
          detectInSummary(summary).map((s) => storyInput(s, 'inferred', 0.6, conversationId))
        ),
      });
    }
    const fromFacts = inputsFromFacts(
      await conversationFacts(userId, conversationId),
      conversationId
    );
    reports.push({
      stories: await applyStories(userId, fromFacts.stories),
      values: await applyValues(userId, fromFacts.values),
      beliefs: await applyBeliefs(userId, fromFacts.beliefs, false),
    });
    const outcomes = reports.flatMap((r) => [
      ...r.stories.map((s) => s.outcome as string),
      ...r.values,
      ...r.beliefs.map((b) => b.outcome as string),
    ]);
    const applied = outcomes.filter((o) => ['created', 'updated', 'reinforced'].includes(o)).length;
    log.debug({ userId, conversationId, applied, total: outcomes.length }, 'Life story captured');
    return { applied, skipped: outcomes.length - applied };
  } catch (error) {
    log.warn({ userId, conversationId, error: String(error) }, 'Life story capture failed');
    return { applied: 0, skipped: 0 };
  }
}
