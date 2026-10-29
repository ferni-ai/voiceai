/**
 * updateMemory under MEMORY_TOOLS_HONEST: the remembered fact a caller's correction
 * names is replaced, in the store recall reads (dynamic_facts).
 *
 * The new fact goes through the remembered-fact writer (keepForRecall), so every guard
 * it has applies: member only, credentials, the secret check, forgotten topics, contact
 * data. Only once it is kept is the old one forgotten, with every copy of it
 * (memory-control.ts, as the app's forget button does), so recall serves the new value
 * and never both, and a refused correction loses nothing. The old fact is the one the
 * caller's words name best among facts about the same person (fact-subject.ts); none,
 * two named equally well, or a person that can't be read, and nothing is changed.
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
import { normalizeName, relationOf } from '../domain/person-key.js';
import { relationsFrom, sameSubject, subjectOfFact, subjectOfText } from './fact-subject.js';
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
  /** Whose fact it is can't be read, in the request or the fact it would replace. */
  | { kind: 'unclear' }
  /** The new fact was not kept (why, as keepForRecall says); the old one stays. */
  | { kind: 'not_kept'; kept: KeepOutcome }
  /** The new fact is kept, but the old one could not be forgotten. */
  | { kind: 'half_done' }
  | { kind: 'failed' };

/**
 * The one shown fact `original` names: about the same person (fact-subject.ts), then the
 * most content words in common, at least half of what it says about them (its words
 * minus the person's own). Shared words about someone else never count: correcting "my
 * husband is a nurse" must not touch the caller's own job. A tie is 'ambiguous', and a
 * request or a fact whose person can't be read is 'unclear': replacing the wrong one
 * would lose a true memory.
 */
function named(
  facts: readonly ShownFact[],
  stored: ReadonlyArray<Record<string, unknown>>,
  original: string
): ShownFact | 'ambiguous' | 'unclear' | null {
  const all = contentWords(original);
  if (all.size === 0) return null;
  const known = new Set(
    facts.filter((f) => f.subject !== 'you').map((f) => normalizeName(f.subject))
  );
  const asked = subjectOfText(original, known);
  if (asked.kind === 'unclear') return 'unclear';
  // What it says about them, not who: "my brother Dana" can't match on "brother" and "Dana"
  const want = [...all].filter((w) =>
    asked.kind === 'person'
      ? !(asked.relation && relationOf(w) === asked.relation) && normalizeName(w) !== asked.name
      : w !== 'user' && w !== 'caller'
  );
  if (want.length === 0) return null;
  const relations = relationsFrom(stored, known);
  const need = Math.max(1, Math.ceil(want.length / 2));
  const scored = facts
    .filter((f) => !f.earlier)
    .map((f) => {
      const about = subjectOfFact(f, relations, known);
      // The caller's own facts read as theirs: "user works as a nurse" ~ "you | job: nurse"
      const have = contentWords(`${about.kind === 'owner' ? 'user' : ''} ${f.subject} ${f.detail}`);
      return { f, about, have, n: want.filter((w) => have.has(w)).length };
    })
    .filter((s) => s.n >= need);
  // "my job ...": the caller's fact about that thing, never another of theirs
  const thing = asked.kind === 'owner' && asked.thing ? [...contentWords(asked.thing)] : [];
  const same = scored
    .filter((s) => sameSubject(asked, s.about) && thing.every((w) => s.have.has(w)))
    .sort((a, b) => b.n - a.n);
  if (same.length === 0) return scored.some((s) => s.about.kind === 'unclear') ? 'unclear' : null;
  if (same.length > 1 && same[1].n === same[0].n) return 'ambiguous';
  return same[0].f;
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
    const [shown, stored] = await Promise.all([listRemembered(userId, store), store.facts(userId)]);
    const old = named(
      shown,
      stored.map((f) => f.data),
      change.original
    );
    if (old === null) return { kind: 'no_match' };
    if (old === 'ambiguous' || old === 'unclear') return { kind: old };
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
