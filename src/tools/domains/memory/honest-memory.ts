/**
 * MEMORY_TOOLS_HONEST: the memory tools say only what the store recall reads holds.
 *
 * rememberAboutUser and rememberImportantFact wrote bogle_users/{uid}/memories, which
 * the call-start recall never reads (it reads dynamic_facts), and still said
 * "noted for next time". updateMemory changed an in-call list and returned ''.
 * predictUserNeed stored its own guess as a memory. With the flag on, remembering and
 * updating go through the remembered-fact writer (memory/dynamic/remembered-facts.ts,
 * the one REMEMBER_TO_RECALL turns on, and replace-remembered.ts), which writes
 * dynamic_facts with its guards (member only, credentials, the secret check, forgotten
 * topics, contact data), and each tool answers from what that write did. No second
 * copy goes to memories. These are the answers.
 *
 * @module tools/domains/memory/honest-memory
 */
import {
  keepForRecall,
  replaceRemembered,
  type KeepOutcome,
  type ReplaceOutcome,
} from '../../../memory/index.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { REMEMBERED, REMEMBERED_THIS_CALL } from './remember-results.js';

export { memoryToolsHonestOn } from '../../../memory/index.js';

const NOT_SAVED = {
  contact:
    "Not saved: phone numbers and emails aren't kept as memories; they belong in contacts. Don't say it was remembered.",
  forgotten:
    "Not saved: it's about something they asked you to forget. Don't say it was remembered.",
  credential:
    "Not saved: it looks like a password or code, which is never kept. Don't say it was remembered.",
} as const;

/** True when recall reads this fact now: written, or the same text already on file. */
export const isKept = (o: KeepOutcome): o is Extract<KeepOutcome, { id: string }> =>
  o.kind === 'kept' || o.kind === 'already';

/** The answer when a fact was not kept for next time: never empty, never "saved". */
export function notKeptReply(o: KeepOutcome): string {
  if (o.kind !== 'refused') return REMEMBERED_THIS_CALL;
  if (o.reason === 'contact' || o.reason === 'forgotten') return NOT_SAVED[o.reason];
  if (o.reason === 'credential' || o.reason === 'secret') return NOT_SAVED.credential;
  return REMEMBERED_THIS_CALL;
}

/** rememberAboutUser's answer from the write. */
export const rememberReply = (o: KeepOutcome): string => (isKept(o) ? REMEMBERED : notKeptReply(o));

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

export const UPDATED = 'Updated for next time. Carry on; no need to mention it.';
export const NO_MATCH =
  "No saved memory matched that, so nothing was changed. Don't say it was updated; if it matters, remember the new detail instead.";
export const AMBIGUOUS =
  'More than one saved memory matched, so nothing was changed. Ask which one they mean.';
const HALF_DONE =
  'The new detail is saved, but the old one could not be cleared yet. Carry on; no need to mention it.';
const NOT_UPDATED = "It couldn't be updated for next time. Don't say it was changed; carry on.";

const UPDATE_REPLY: Record<Exclude<ReplaceOutcome['kind'], 'not_kept'>, string> = {
  replaced: UPDATED,
  no_match: NO_MATCH,
  ambiguous: AMBIGUOUS,
  half_done: HALF_DONE,
  failed: NOT_UPDATED,
};

/** updateMemory: replace the remembered fact `originalFact` names, and say what happened. */
export async function updateRemembered(req: {
  userId: string | undefined;
  sessionId: string | undefined;
  originalFact: string;
  updatedFact: string;
}): Promise<string> {
  const { userId, sessionId } = req;
  if (!userId || writeHeld(userId, sessionId)) return NOT_UPDATED;
  const change = { original: req.originalFact, updated: req.updatedFact, sessionId };
  const done = await replaceRemembered(userId, change);
  return done.kind === 'not_kept' ? notKeptReply(done.kept) : UPDATE_REPLY[done.kind];
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
