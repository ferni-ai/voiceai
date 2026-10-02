/**
 * Capture for work & places:
 *
 * - Live, per user turn: `recordUserTurnWorkAndPlaces` (voice agent transcript
 *   handler, same place as the preference capture). The user's own words.
 * - After a conversation is summarized (session end and catch-up, via
 *   services/memory/conversation-summarized-hooks.ts):
 *   `onConversationSummarized` reads the user turns, the summary (inferred),
 *   this conversation's work/place facts and its place entities.
 *
 * Everything written carries the conversation id (and fact id when derived
 * from a fact); tombstoned and user-edited items are respected by the store.
 *
 * @module services/work-and-places/capture
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  inputsFromFacts,
  inputsFromPlaceEntities,
  type FactLike,
  type PlaceEntityLike,
} from './facts-mapping.js';
import { parsePlaceStatements, parsePlaceSummary } from './place-capture.js';
import { recordLifeItem } from './record.js';
import { normalizeSubject } from './rules.js';
import { listLifeItems } from './store.js';
import { thisMonth } from './text-patterns.js';
import type { LifeInput, LifeSource, UpsertResult } from './types.js';
import { parseWorkStatements, parseWorkSummary, type WorkCapture } from './work-capture.js';

const log = createLogger({ module: 'WorkAndPlacesCapture' });

function realUser(userId: string | undefined): userId is string {
  return !!userId && userId !== 'anonymous';
}

interface CurrentJobPatch {
  role?: string;
  team?: string;
  factId?: string;
}

/** Role/team said without an employer goes onto the current job; "I quit my job" ends it. */
async function applyJobSignals(
  userId: string,
  patch: CurrentJobPatch | undefined,
  leftCurrentJob: boolean,
  source: LifeSource,
  confidence: number,
  conversationId: string | undefined,
  results: UpsertResult[]
): Promise<void> {
  if (!patch && !leftCurrentJob) return;
  const jobs = (await listLifeItems(userId, 'work')).filter(
    (i) => i.kind === 'job' && i.status === 'current'
  );
  const common = {
    area: 'work' as const,
    kind: 'job' as const,
    source,
    confidence,
    conversationId,
    ...(patch?.factId ? { factId: patch.factId } : {}),
  };
  if (leftCurrentJob) {
    for (const job of jobs) {
      results.push(
        await recordLifeItem(userId, {
          ...common,
          subject: job.employer ?? job.role ?? job.title,
          employer: job.employer,
          status: 'past',
          endDate: thisMonth(new Date()),
        })
      );
    }
    return;
  }
  if (!patch) return;
  const current = jobs[0];
  if (current) {
    results.push(
      await recordLifeItem(userId, {
        ...common,
        subject: current.employer ?? current.role ?? current.title,
        employer: current.employer,
        role: patch.role,
        team: patch.team,
        additional: true,
      })
    );
  } else if (patch.role) {
    // Employer unknown for now: remember the role on its own.
    results.push(
      await recordLifeItem(userId, {
        ...common,
        subject: patch.role,
        role: patch.role,
        status: 'current',
      })
    );
  }
}

async function applyAll(userId: string, inputs: readonly LifeInput[]): Promise<UpsertResult[]> {
  const results: UpsertResult[] = [];
  for (const input of inputs) results.push(await recordLifeItem(userId, input));
  return results;
}

async function applyWork(
  userId: string,
  capture: WorkCapture,
  source: LifeSource,
  confidence: number,
  conversationId?: string
): Promise<UpsertResult[]> {
  const results = await applyAll(userId, capture.inputs);
  await applyJobSignals(
    userId,
    capture.currentJobPatch,
    capture.leftCurrentJob === true,
    source,
    confidence,
    conversationId,
    results
  );
  return results;
}

/** Live capture for one user utterance. Never throws. */
export async function recordUserTurnWorkAndPlaces(
  userId: string,
  text: string,
  conversationId?: string
): Promise<UpsertResult[]> {
  if (!realUser(userId) || !text || text.length < 8) return [];
  try {
    const work = parseWorkStatements(text, 'stated', 0.85, { conversationId });
    const places = parsePlaceStatements(text, 'stated', 0.85, { conversationId });
    return [
      ...(await applyWork(userId, work, 'stated', 0.85, conversationId)),
      ...(await applyAll(userId, places)),
    ];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Work/places turn capture failed');
    return [];
  }
}

async function conversationSources(
  userId: string,
  conversationId: string
): Promise<{ facts: FactLike[]; places: PlaceEntityLike[] }> {
  const db = getFirestoreDb();
  if (!db) return { facts: [], places: [] };
  const user = db.collection('bogle_users').doc(userId);
  const read = async <T>(collection: string): Promise<T[]> => {
    try {
      const snap = await user
        .collection(collection)
        .where('sourceConversationIds', 'array-contains', conversationId)
        .limit(200)
        .get();
      return (snap.docs ?? []).map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
    } catch (error) {
      log.debug({ userId, collection, error: String(error) }, 'Could not read extraction output');
      return [];
    }
  };
  const [facts, entities] = await Promise.all([
    read<FactLike>('dynamic_facts'),
    read<PlaceEntityLike>('dynamic_entities'),
  ]);
  return { facts, places: entities.filter((e) => (e.type ?? '').toLowerCase() === 'place') };
}

/** Give statement-derived places the extraction entity id when names match. */
function linkEntities(inputs: LifeInput[], places: readonly PlaceEntityLike[]): LifeInput[] {
  if (places.length === 0) return inputs;
  const byName = new Map(places.map((p) => [normalizeSubject(p.name), p.id]));
  return inputs.map((i) => {
    if (i.area !== 'places' || i.entityId) return i;
    const id = byName.get(normalizeSubject(i.place ?? i.subject));
    return id ? { ...i, entityId: id } : i;
  });
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
    const { facts, places } = await conversationSources(userId, conversationId);
    const results: UpsertResult[] = [];
    const userText = turns
      .filter((t) => t.role === 'user' && t.text)
      .map((t) => t.text)
      .join('\n');
    if (userText) {
      const work = parseWorkStatements(userText, 'stated', 0.85, { conversationId });
      results.push(...(await applyWork(userId, work, 'stated', 0.85, conversationId)));
      const stated = parsePlaceStatements(userText, 'stated', 0.85, { conversationId });
      results.push(...(await applyAll(userId, linkEntities(stated, places))));
    }
    if (summary) {
      results.push(
        ...(await applyWork(
          userId,
          parseWorkSummary(summary, { conversationId }),
          'inferred',
          0.6,
          conversationId
        ))
      );
      results.push(
        ...(await applyAll(
          userId,
          linkEntities(parsePlaceSummary(summary, { conversationId }), places)
        ))
      );
    }
    const fromFacts = inputsFromFacts(facts, conversationId);
    results.push(...(await applyAll(userId, linkEntities(fromFacts.inputs, places))));
    await applyJobSignals(
      userId,
      fromFacts.currentJobPatch,
      false,
      'inferred',
      0.6,
      conversationId,
      results
    );
    results.push(...(await applyAll(userId, inputsFromPlaceEntities(places, conversationId))));

    const applied = results.filter((r) =>
      ['created', 'updated', 'reinforced'].includes(r.outcome)
    ).length;
    log.debug({ userId, conversationId, applied, total: results.length }, 'Work/places captured');
    return { applied, skipped: results.length - applied };
  } catch (error) {
    log.warn({ userId, conversationId, error: String(error) }, 'Work/places capture failed');
    return { applied: 0, skipped: 0 };
  }
}
