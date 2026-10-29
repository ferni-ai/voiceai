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
 * copy goes to memories, and a guess is never stored.
 *
 * @module tools/domains/memory/honest-memory
 */
import {
  keepForRecall,
  memoryToolsHonestOn,
  replaceRemembered,
  type KeepOutcome,
  type ReplaceOutcome,
} from '../../../services/memory/index.js';
import { getUnifiedMemoryService } from '../../../services/unified-memory-service.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { getSessionId } from '../../utils/tool-helpers.js';
import { announceMemorySaved } from './memory-saved.js';
import { announceRemembered } from './remember-moment.js';
import { importantReply, REMEMBERED, REMEMBERED_THIS_CALL } from './remember-results.js';

export { memoryToolsHonestOn } from '../../../services/memory/index.js';

const NOT_SAVED = {
  contact:
    "Not saved: phone numbers and emails aren't kept as memories; they belong in contacts. Don't say it was remembered.",
  forgotten:
    "Not saved: it's about something they asked you to forget. Don't say it was remembered.",
  credential:
    "Not saved: it looks like a password or code, which is never kept. Don't say it was remembered.",
} as const;

/** True when recall reads this fact now: written, or the same text already on file. */
const isKept = (o: KeepOutcome): o is Extract<KeepOutcome, { id: string }> =>
  o.kind === 'kept' || o.kind === 'already';

/** The answer when a fact was not kept for next time: never empty, never "saved". */
function notKeptReply(o: KeepOutcome): string {
  if (o.kind !== 'refused') return REMEMBERED_THIS_CALL;
  if (o.reason === 'contact' || o.reason === 'forgotten') return NOT_SAVED[o.reason];
  if (o.reason === 'credential' || o.reason === 'secret') return NOT_SAVED.credential;
  return REMEMBERED_THIS_CALL;
}

/** rememberImportantFact's answer when nothing is written (no caller, MINOR_CARE, a teammate). */
export const notWrittenReply = (): string =>
  memoryToolsHonestOn() ? REMEMBERED_THIS_CALL : "I'll remember that.";

/** Write a fact where recall reads it (unless MINOR_CARE holds the call); announce a new one. */
async function keepFact(
  toolCtx: unknown,
  userId: string | undefined,
  fact: string,
  category: string
): Promise<KeepOutcome> {
  const sessionId = getSessionId({ ctx: toolCtx });
  if (!userId || writeHeld(userId, sessionId)) return { kind: 'refused', reason: 'not_member' };
  const kept = await keepForRecall(userId, { fact, category, ...(sessionId && { sessionId }) });
  // memory_saved (CLIENT_SIGNALS_V2) only for a fact this write created
  if (kept.kind === 'kept') {
    void announceMemorySaved({ sessionId, userId, id: kept.id, fact, category });
  }
  return kept;
}

/** rememberAboutUser: kept where recall reads it, and "I'll remember: …" in the app when new. */
export async function rememberHonestly(
  toolCtx: unknown,
  userId: string | undefined,
  fact: string,
  category: string
): Promise<string> {
  const kept = await keepFact(toolCtx, userId, fact, category);
  if (kept.kind === 'kept' && userId) {
    void announceRemembered({ userId, sessionId: getSessionId({ ctx: toolCtx }), fact, category });
  }
  return isKept(kept) ? REMEMBERED : notKeptReply(kept);
}

/** rememberImportantFact: kept where recall reads it; its warm answer only once it is. */
export async function rememberImportantHonestly(
  toolCtx: unknown,
  userId: string | undefined,
  fact: string,
  type: string
): Promise<string> {
  const kept = await keepFact(toolCtx, userId, fact, type);
  return isKept(kept) ? importantReply(type) : notKeptReply(kept);
}

export const UPDATED = 'Updated for next time. Carry on; no need to mention it.';
export const NO_MATCH =
  "No saved memory matched that, so nothing was changed. Don't say it was updated; if it matters, remember the new detail instead.";
export const AMBIGUOUS =
  'More than one saved memory matched, so nothing was changed. Ask which one they mean.';
export const UNCLEAR =
  "It isn't clear whose detail that is, so nothing was changed. Ask whose it is.";
const NOT_UPDATED = "It couldn't be updated for next time. Don't say it was changed; carry on.";

const UPDATE_REPLY: Record<Exclude<ReplaceOutcome['kind'], 'not_kept'>, string> = {
  replaced: UPDATED,
  no_match: NO_MATCH,
  ambiguous: AMBIGUOUS,
  unclear: UNCLEAR,
  half_done:
    'The new detail is saved, but the old one could not be cleared yet. Carry on; no need to mention it.',
  failed: NOT_UPDATED,
};

/** updateMemory: replace the remembered fact `originalFact` names, and say what happened. */
export async function updateRemembered(
  toolCtx: unknown,
  userId: string | undefined,
  originalFact: string,
  updatedFact: string
): Promise<string> {
  const sessionId = getSessionId({ ctx: toolCtx });
  if (!userId || writeHeld(userId, sessionId)) return NOT_UPDATED;
  const change = { original: originalFact, updated: updatedFact, sessionId };
  const done = await replaceRemembered(userId, change);
  return done.kind === 'not_kept' ? notKeptReply(done.kept) : UPDATE_REPLY[done.kind];
}

/** predictUserNeed: nothing stored; the guess comes back as a guess, beside what is stored. */
export async function guessHonestly(
  userId: string | undefined,
  prediction: string,
  suggestedAction?: string
): Promise<string> {
  const found = userId
    ? await getUnifiedMemoryService().search({ query: prediction, userId, limit: 2, minScore: 0.4 })
    : null;
  return [
    `A guess, not something they told you: ${prediction}.`,
    found ? `Saved memory that may relate: ${found}` : '',
    suggestedAction ? `Possible next step: ${suggestedAction}.` : '',
    'Offer it as a question, not as something you remember.',
  ]
    .filter(Boolean)
    .join(' ');
}
