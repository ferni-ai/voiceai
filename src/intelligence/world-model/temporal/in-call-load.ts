/**
 * The caller's open world facts, loaded once when the call starts
 * (WORLD_FACTS_IN_CALL=on) and kept per call for every turn's note
 * (in-call.ts). Keyed by the call's userData, which the turn request, the
 * agent setup and the forgetMemory tool all hold. A slow or failed load means
 * no block on this call, never an error; a forget during the call applies at
 * once.
 *
 * @module intelligence/world-model/temporal/in-call-load
 */

import { forgottenTopics } from '../../../memory/recall/forget.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  isWorldFactsInCallOn,
  worldFactLines,
  worldFactsNote,
  type InCallOptions,
} from './in-call.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from './store.js';
import type { TemporalFact } from './types.js';

const log = createLogger({ module: 'world-model:in-call' });

/** Call start waits for nothing; past this the call goes on without the block. */
export const LOAD_TIMEOUT_MS = 2_000;

interface CallFacts {
  facts: TemporalFact[];
  forgotten: string[];
}
const calls = new WeakMap<object, CallFacts>();

export interface WorldFactsLoadDeps {
  store?: WorldFactStore;
  forgotten?: (userId: string) => Promise<string[]>;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Load the caller's open facts for this call. Never throws. */
export async function loadWorldFactsForCall(
  call: object,
  userId: string | undefined,
  deps: WorldFactsLoadDeps = {}
): Promise<void> {
  if (!isWorldFactsInCallOn(deps.env) || !userId || userId === 'anonymous') return;
  const store = deps.store ?? createFirestoreWorldFactStore();
  const topics = deps.forgotten ?? ((id: string) => forgottenTopics(id));
  try {
    const [facts, forgotten] = await within(
      Promise.all([store.listOpen(userId), topics(userId)]),
      deps.timeoutMs ?? LOAD_TIMEOUT_MS
    );
    const known = calls.get(call)?.forgotten ?? []; // forgotten while loading
    calls.set(call, { facts, forgotten: [...forgotten, ...known] });
    log.info({ facts: facts.length }, 'WORLD_FACTS_LOADED'); // counts only
  } catch (error) {
    log.warn({ error: String(error) }, 'World facts not loaded for this call');
  }
}

/** The caller asked to forget `topic` on this call: no fact about it shows again. */
export function forgetWorldFactsInCall(call: object | undefined, topic: string): void {
  if (!call) return;
  const known = calls.get(call) ?? { facts: [], forgotten: [] };
  calls.set(call, { ...known, forgotten: [...known.forgotten, topic] });
}

type TurnOptions = Omit<InCallOptions, 'forgotten'>;

/** This turn's lines (CONTEXT_PACKET on); [] when off, not loaded or nothing is timely. */
export function worldFactLinesFor(call: object | undefined, opts: TurnOptions): string[] {
  const known = call && isWorldFactsInCallOn() ? calls.get(call) : undefined;
  return known ? worldFactLines(known.facts, { ...opts, forgotten: known.forgotten }) : [];
}

/** This turn's legacy note (CONTEXT_PACKET off); '' when off, not loaded or nothing is timely. */
export function worldFactsNoteFor(call: object | undefined, opts: TurnOptions): string {
  const known = call && isWorldFactsInCallOn() ? calls.get(call) : undefined;
  return known ? worldFactsNote(known.facts, { ...opts, forgotten: known.forgotten }) : '';
}
