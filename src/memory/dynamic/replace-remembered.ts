/**
 * updateMemory under MEMORY_TOOLS_HONEST: the remembered fact a caller's correction
 * names is replaced, in the store recall reads (dynamic_facts).
 *
 * The new fact goes through the remembered-fact writer (keepForRecall), so every guard
 * it has applies: member only, credentials, the secret check, forgotten topics, contact
 * data. Only once it is kept is the old one forgotten, with every copy of it
 * (memory-control.ts, as the app's forget button does), so recall serves the new value
 * and never both, and a refused correction loses nothing. The old fact is the one the
 * caller's words name best; none, or two named equally well, and nothing is changed.
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
  type RememberedFact as ShownFact,
} from '../recall/memory-control.js';
import { contentWords } from '../recall/session-recall.js';
import { keepForRecall, type KeepOutcome, type RememberToRecallDeps } from './remembered-facts.js';

const log = createLogger({ module: 'ReplaceRemembered' });

let control: MemoryControlStore | null = null;

/** Called once by the agent process with the Firestore store; null unplugs (tests). */
export function useRememberedFactControl(store: MemoryControlStore | null): void {
  control = store;
}

export type ReplaceOutcome =
  | { kind: 'replaced' }
  | { kind: 'no_match' }
  | { kind: 'ambiguous' }
  /** The new fact was not kept (why, as keepForRecall says); the old one stays. */
  | { kind: 'not_kept'; kept: KeepOutcome }
  /** The new fact is kept, but the old one could not be forgotten. */
  | { kind: 'half_done' }
  | { kind: 'failed' };

/**
 * The one shown fact `original` names: the most content words in common, at least two
 * (one for a one-word description) and at least half of them. A tie is 'ambiguous':
 * replacing the wrong one would lose a true memory.
 */
function named(facts: readonly ShownFact[], original: string): ShownFact | 'ambiguous' | null {
  const want = contentWords(original);
  if (want.size === 0) return null;
  const need = Math.max(Math.min(2, want.size), Math.ceil(want.size / 2));
  const scored = facts
    .filter((f) => !f.earlier)
    .map((f) => {
      const have = contentWords(`${f.subject} ${f.detail}`);
      return { f, n: [...want].filter((w) => have.has(w)).length };
    })
    .filter((s) => s.n >= need)
    .sort((a, b) => b.n - a.n);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[1].n === scored[0].n) return 'ambiguous';
  return scored[0].f;
}

/** Replace the remembered fact `original` names with `updated`. Never throws. */
export async function replaceRemembered(
  userId: string,
  change: { original: string; updated: string; sessionId?: string },
  deps: RememberToRecallDeps & { control?: MemoryControlStore } = {}
): Promise<ReplaceOutcome> {
  const store = deps.control ?? control;
  if (!store || !isMemberIdentity(userId)) return { kind: 'failed' };
  try {
    const old = named(await listRemembered(userId, store), change.original);
    if (old === null) return { kind: 'no_match' };
    if (old === 'ambiguous') return { kind: 'ambiguous' };
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
