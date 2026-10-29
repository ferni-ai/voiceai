/**
 * MEMORY_TOOLS_HONEST: the memory tools say only what the store recall reads holds.
 *
 * rememberAboutUser and rememberImportantFact wrote bogle_users/{uid}/memories, which
 * the call-start recall never reads (it reads dynamic_facts), and still said
 * "noted for next time". updateMemory changed an in-call list and returned ''.
 * predictUserNeed stored its own guess as a memory. With the flag on, each goes
 * through the remembered-fact writer (memory/dynamic/remembered-facts.ts, the one
 * REMEMBER_TO_RECALL turns on), which writes dynamic_facts with its guards (member
 * only, credentials, the secret check, forgotten topics, contact data), and answers
 * from what that write did. No second copy goes to memories.
 *
 * @module tools/domains/memory/honest-memory
 */
import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { keepForRecall, type KeepOutcome } from '../../../memory/dynamic/remembered-facts.js';
import {
  forgetRemembered,
  listRemembered,
  type MemoryControlStore,
  type RememberedFact,
} from '../../../memory/recall/memory-control.js';
import { firestoreMemoryControlStore } from '../../../memory/storage/memory-control-store.js';
import { contentWords } from '../../../memory/recall/session-recall.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { REMEMBERED, REMEMBERED_THIS_CALL } from './remember-results.js';

export { memoryToolsHonestOn } from '../../../memory/dynamic/remembered-facts.js';

const log = createLogger({ module: 'honest-memory' });

const NOT_SAVED: Partial<Record<string, string>> = {
  contact:
    "Not saved: phone numbers and emails aren't kept as memories; they belong in contacts. Don't say it was remembered.",
  forgotten:
    "Not saved: it's about something they asked you to forget. Don't say it was remembered.",
  credential:
    "Not saved: it looks like a password or code, which is never kept. Don't say it was remembered.",
  secret:
    "Not saved: it looks like a password or code, which is never kept. Don't say it was remembered.",
};

/** True when recall reads this fact now: written, or the same text already on file. */
export const isKept = (o: KeepOutcome): o is Extract<KeepOutcome, { id: string }> =>
  o.kind === 'kept' || o.kind === 'already';

/** The tool's answer when a fact was not kept for next time: never empty, never "saved". */
export function notKeptReply(o: KeepOutcome): string {
  return (o.kind === 'refused' && NOT_SAVED[o.reason]) || REMEMBERED_THIS_CALL;
}

/** Write a fact where recall reads it, unless MINOR_CARE holds this call. */
export async function keepFact(
  userId: string | undefined,
  sessionId: string | undefined,
  fact: string,
  category: string
): Promise<KeepOutcome> {
  if (!userId || writeHeld(userId, sessionId)) return { kind: 'refused', reason: 'not_member' };
  return keepForRecall(userId, { fact, category, ...(sessionId && { sessionId }) });
}

/** rememberAboutUser's answer from the write. */
export const rememberReply = (o: KeepOutcome): string => (isKept(o) ? REMEMBERED : notKeptReply(o));

/**
 * The one remembered fact `original` names: the most content words in common, at least
 * two (one for a one-word description) and at least half of them. Two facts tied for it
 * are 'ambiguous', since replacing the wrong one would lose a true memory.
 */
export function matchingFact(
  facts: readonly RememberedFact[],
  original: string
): RememberedFact | 'ambiguous' | null {
  const want = contentWords(original);
  const need = Math.max(Math.min(2, want.size), Math.ceil(want.size / 2));
  if (want.size === 0) return null;
  const scored = facts
    .map((f) => {
      const have = contentWords(`${f.subject} ${f.detail}`);
      return { f, n: [...want].filter((w) => have.has(w)).length };
    })
    .filter((s) => s.n >= need && !s.f.earlier)
    .sort((a, b) => b.n - a.n);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[1].n === scored[0].n) return 'ambiguous';
  return scored[0].f;
}

export const UPDATED = 'Updated for next time. Carry on; no need to mention it.';
export const NO_MATCH =
  "No saved memory matched that, so nothing was changed. Don't say it was updated; if it matters, remember the new detail instead.";
export const AMBIGUOUS =
  'More than one saved memory matched, so nothing was changed. Ask which one they mean.';
const HALF_DONE =
  'The new detail is saved, but the old one could not be cleared yet. Carry on; no need to mention it.';

export interface UpdateRequest {
  userId: string | undefined;
  sessionId: string | undefined;
  originalFact: string;
  updatedFact: string;
}

/**
 * updateMemory: the remembered fact `originalFact` names is replaced by `updatedFact`.
 * The new one is written first through the same writer (so all its guards apply),
 * then the old one and its copies are forgotten (memory-control.ts), so recall serves
 * the new value and never both. Nothing matched: nothing written, and it says so.
 */
export async function updateRemembered(
  req: UpdateRequest,
  store: MemoryControlStore = firestoreMemoryControlStore
): Promise<string> {
  const { userId, sessionId } = req;
  if (!userId || !isMemberIdentity(userId) || writeHeld(userId, sessionId)) {
    return REMEMBERED_THIS_CALL;
  }
  const match = matchingFact(await listRemembered(userId, store), req.originalFact);
  if (match === null) return NO_MATCH;
  if (match === 'ambiguous') return AMBIGUOUS;
  const kept = await keepFact(userId, sessionId, req.updatedFact, 'correction');
  if (!isKept(kept)) return notKeptReply(kept);
  if (kept.id === match.id) return UPDATED;
  try {
    await forgetRemembered(userId, match.id, store);
    return UPDATED;
  } catch (error) {
    log.warn({ errorName: (error as Error)?.name }, 'Updated fact kept; old one not forgotten');
    return HALF_DONE;
  }
}

/** predictUserNeed's answer: the guess as a guess, and what stored memory says beside it. */
export function guessReply(
  prediction: string,
  suggestedAction?: string,
  found?: string | null
): string {
  return [
    `A guess, not something they told you: ${prediction}.`,
    found ? `Saved memory that may relate: ${found}` : '',
    suggestedAction ? `Possible next step: ${suggestedAction}.` : '',
    'Offer it as a question, not as something you remember.',
  ]
    .filter(Boolean)
    .join(' ');
}
