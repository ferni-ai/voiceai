/**
 * "What I've Learned" (GET /api/cognitive/memories): the facts live recall
 * reads, bogle_users/{uid}/dynamic_facts, through memory-control.ts, the same
 * as /api/memories/remembered. It used to read profile.personaMemories, which
 * the 2026-10-18 prod audit found on 0 of 46 real profiles.
 *
 * Always the verified caller's own facts: callers pass requireUserId's uid.
 *
 * @module api/routes/learned-facts
 */
import { forgetRemembered, listRemembered } from '../../memory/recall/memory-control.js';
import type { RememberedFact } from '../../memory/recall/memory-control.js';
import { firestoreMemoryControlStore as factStore } from '../../memory/storage/memory-control-store.js';
import type { UIMemory } from './types.js';

const FACT_ID = /^[A-Za-z0-9_-]{1,200}$/;

export const isFactId = (id: string): boolean => FACT_ID.test(id);

function toUI(f: RememberedFact): UIMemory {
  return {
    id: f.id,
    type: 'fact',
    content: f.subject === 'you' ? f.detail : `${f.subject}: ${f.detail}`,
    // recall only uses facts it is sure enough of, so each listed one is
    confidence: f.fromYou ? 1 : 0.8,
    source: f.fromYou ? 'you' : 'conversation',
    ...(f.learnedAt && { learnedAt: f.learnedAt }),
    sourceType: 'remembered',
  };
}

/**
 * Read through on every request, never cached (as remembered.ts): a cache here
 * would still show a fact forgotten or corrected on another instance or path.
 */
export async function learnedMemories(userId: string): Promise<UIMemory[]> {
  return (await listRemembered(userId, factStore)).map(toUI);
}

/** Forget one of the caller's facts (and its copies); false when they have no such fact. */
export async function forgetLearned(userId: string, id: string): Promise<boolean> {
  return forgetRemembered(userId, id, factStore);
}
