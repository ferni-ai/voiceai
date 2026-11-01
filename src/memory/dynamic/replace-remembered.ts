/**
 * updateMemory under MEMORY_TOOLS_HONEST: the remembered fact a caller's correction
 * quotes is replaced, in the store recall reads (dynamic_facts).
 *
 * Exact match only. The model quotes the fact as it saw it (the recall note's line
 * "Dana: lives in = Denver [said 3 days ago]", the bare value "Denver", or a sentence
 * the caller asked Ferni to remember), and only a fact that reads exactly so is
 * replaced. Five rounds of fuzzy matching kept finding a wrong fact to forget: one
 * shared word picked "allergic to dog hair" for "the user's dog: Max", another person's
 * city for a sister's. Nothing that reads exactly so, or two that do, and nothing is
 * changed. Only case, spacing, quotes, a leading "- ", trailing punctuation and the
 * recall note's own bracketed notes ("[said 3 days ago]") are ignored.
 *
 * The new fact goes through the remembered-fact writer (keepForRecall), so every guard
 * it has applies: member only, credentials, the secret check, forgotten topics, contact
 * data. Only once it is kept is the old one forgotten, with every copy of it
 * (memory-control.ts, as the app's forget button does), so recall serves the new value
 * and never both, and a refused correction loses nothing.
 *
 * Firestore: storage/memory-control-store.ts, handed in by the agent process
 * (agents/remembered-fact-store-register.ts); until it is, nothing is replaced.
 *
 * @module memory/dynamic/replace-remembered
 */
import { errorClass } from '../../utils/error-class.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import {
  forgetRemembered,
  listRemembered,
  type MemoryControlStore,
} from '../recall/memory-control.js';
import { keepForRecall, type KeepOutcome, type RememberToRecallDeps } from './remembered-facts.js';

const log = createLogger({ module: 'ReplaceRemembered' });

let control: MemoryControlStore | null = null;

/** Called once by the agent process with the Firestore store; null unplugs (tests). */
export function useRememberedFactControl(store: MemoryControlStore | null): void {
  control = store;
}

export type ReplaceOutcome =
  | { kind: 'replaced' }
  /** No fact reads exactly as quoted. */
  | { kind: 'no_match' }
  /** More than one fact reads exactly as quoted. */
  | { kind: 'ambiguous' }
  /** The new fact was not kept (why, as keepForRecall says); the old one stays. */
  | { kind: 'not_kept'; kept: KeepOutcome }
  /** The new fact is kept, but the old one could not be forgotten. */
  | { kind: 'half_done' }
  | { kind: 'failed' };

/** The extractor's and recall's names for the caller themself (session-recall.ts). */
const SELF = /^(?:speaker|user|me)$/i;
/** How the recall note may name the caller: their name, else "them". */
const SELF_NAMES = ['them', 'they', 'user', 'the user'];

/** Case, spacing, quotes, a leading "- ", trailing punctuation and recall's "[...]" notes. */
function quoteKey(text: string): string {
  let t = text
    .normalize('NFKC')
    .replace(/["'“”‘’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^-\s+/, '');
  for (let prev = ''; prev !== t;) {
    prev = t;
    t = t
      .replace(/\s*\[[^\]]*\]$/, '')
      .replace(/[.!?;,:]+$/, '')
      .trim();
  }
  return t.toLowerCase();
}

/** Every way the fact can have been shown: its value, and its recall-note and app lines. */
function quotesOf(d: Record<string, unknown>, userName?: string): string[] {
  const entity = String(d.entityName ?? '').trim();
  const key = String(d.key ?? '')
    .replace(/_/g, ' ')
    .trim();
  const value = String(d.value ?? '').trim();
  if (!value) return [];
  const subjects = SELF.test(entity) ? [...SELF_NAMES, ...(userName ? [userName] : [])] : [entity];
  const lines = key
    ? [`${key}: ${value}`, `${key} = ${value}`, ...subjects.map((s) => `${s}: ${key} = ${value}`)]
    : [];
  return [value, ...lines].map(quoteKey);
}

/** Replace the remembered fact `original` quotes with `updated`. Never throws. */
export async function replaceRemembered(
  userId: string,
  change: { original: string; updated: string; sessionId?: string; userName?: string },
  deps: RememberToRecallDeps & { control?: MemoryControlStore } = {}
): Promise<ReplaceOutcome> {
  const store = deps.control ?? control;
  if (!store || !isMemberIdentity(userId)) return { kind: 'failed' };
  try {
    const want = quoteKey(change.original);
    if (!want) return { kind: 'no_match' };
    // What recall reads now (forgotten, unsure and superseded facts left out), as stored
    const [shown, stored] = await Promise.all([listRemembered(userId, store), store.facts(userId)]);
    const current = new Set(shown.filter((f) => !f.earlier).map((f) => f.id));
    const matches = stored.filter(
      (f) => current.has(f.id) && quotesOf(f.data, change.userName).includes(want)
    );
    if (matches.length === 0) return { kind: 'no_match' };
    if (matches.length > 1) return { kind: 'ambiguous' };
    const old = matches[0];
    const fact = { fact: change.updated, category: 'correction', sessionId: change.sessionId };
    const kept = await keepForRecall(userId, fact, deps);
    if (kept.kind !== 'kept' && kept.kind !== 'already') return { kind: 'not_kept', kept };
    if (kept.id === old.id) return { kind: 'replaced' };
    try {
      await forgetRemembered(userId, old.id, store);
    } catch (error) {
      log.warn({ error: errorClass(error) }, 'Replacement kept; the old fact not forgotten');
      return { kind: 'half_done' };
    }
    return { kind: 'replaced' };
  } catch (error) {
    log.warn({ error: errorClass(error) }, 'Remembered fact not replaced');
    return { kind: 'failed' };
  }
}
