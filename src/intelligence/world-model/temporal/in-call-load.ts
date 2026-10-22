/**
 * The caller's open world facts, loaded once when the call starts
 * (WORLD_FACTS_IN_CALL=on) and kept per call for every turn's note
 * (in-call.ts). Keyed by the call's userData, which the turn request and
 * the agent setup both hold. A slow or failed load means no block on this
 * call, never an error; a forget during the call (forgetMemory) applies at
 * once, through forget.ts's in-process record.
 *
 * @module intelligence/world-model/temporal/in-call-load
 */

import { forgottenInProcess, forgottenTopicsOrNull } from '../../../memory/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  isWorldFactsInCallOn,
  worldFactLines,
  worldFactsNote,
  type InCallOptions,
} from './in-call.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from './store.js';
import type { TemporalFact } from './types.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';

const log = createLogger({ module: 'world-model:in-call' });

/** Call start waits for nothing; past this the call goes on without the block. */
export const LOAD_TIMEOUT_MS = 2_000;

interface CallFacts {
  facts: TemporalFact[];
  forgotten: string[];
  userId: string;
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
  if (!isWorldFactsInCallOn(deps.env) || !isMemberIdentity(userId)) return;
  const store = deps.store ?? createFirestoreWorldFactStore();
  const topics = deps.forgotten ?? (async (id: string) => (await forgottenTopicsOrNull(id)) ?? []);
  try {
    const [facts, forgotten] = await within(
      Promise.all([store.listOpen(userId), topics(userId)]),
      deps.timeoutMs ?? LOAD_TIMEOUT_MS
    );
    calls.set(call, { facts, forgotten, userId });
    log.info({ facts: facts.length }, 'WORLD_FACTS_LOADED'); // counts only
  } catch (error) {
    log.warn({ error: String(error) }, 'World facts not loaded for this call');
  }
}

/**
 * Topics recorded before the call, and any forgotten since in this process
 * (forget.ts forgottenInProcess), so a forget asked on this call applies at once.
 */
const forgottenNow = (known: CallFacts): string[] => [
  ...known.forgotten,
  ...forgottenInProcess(known.userId),
];

type TurnOptions = Omit<InCallOptions, 'forgotten'>;

/** This turn's lines (CONTEXT_PACKET on); [] when off, not loaded or nothing is timely. */
export function worldFactLinesFor(call: object | undefined, opts: TurnOptions): string[] {
  const known = call && isWorldFactsInCallOn() ? calls.get(call) : undefined;
  return known ? worldFactLines(known.facts, { ...opts, forgotten: forgottenNow(known) }) : [];
}

/** This turn's legacy note (CONTEXT_PACKET off); '' when off, not loaded or nothing is timely. */
export function worldFactsNoteFor(call: object | undefined, opts: TurnOptions): string {
  const known = call && isWorldFactsInCallOn() ? calls.get(call) : undefined;
  return known ? worldFactsNote(known.facts, { ...opts, forgotten: forgottenNow(known) }) : '';
}
