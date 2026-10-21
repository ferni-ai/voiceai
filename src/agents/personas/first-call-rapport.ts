/**
 * FIRST_CALL_RAPPORT=on: a light shape for someone's first call with Ferni,
 * added to the per-turn reminder (turn-request.ts).
 *
 * Measured offline (scripts/first-call-eval, 25 new-caller personas x 2,
 * 2026-10-11): on a first call Ferni almost never swapped names. Of the
 * callers who give their name only when asked, 2 of 24 were ever asked, and
 * none of them gave it unasked. His goodbyes were warm but generic ("don't be
 * a stranger"), with no specific reason to come back (judge 2.6 of 5). Question
 * load was already fine (0.18 questions a reply), so this adds no question.
 *
 * A first call is a known account with no past conversations
 * (session-init-handler.ts sets isReturningUser from the profile). Anonymous
 * phone callers are left alone: they may be people Ferni can't place yet.
 *
 * @module agents/personas/first-call-rapport
 */

import type { llm } from '@livekit/agents';

import { flagOn, type Env } from '../../config/env-flag.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';

/** The base note on every reply of a first call. */
export const FIRST_CALL_NOTE =
  "This is your first call with them: you're getting to know a new person, not taking down their details. Learn a little at their pace, what their day is like and something they care about, and give back a take or a small preference of your own. Once you know their name, save it for hello and goodbye; friends rarely say it mid-call.";

/** Early in the call, until a name has been asked for. */
export const NAME_SWAP_NOTE =
  "If you don't know their name yet, swap names at the next easy moment, the way people do on a first call: yours, then theirs, in one short line (\"I'm Ferni, by the way. What should I call you?\"). Not while they're in the middle of something hard.";

/** NAME_SWAP_NOTE in the speaking persona's name, nothing quoted (SCRIPT_FREE_REMINDER, script-free.ts). */
export const nameSwapPlain = (name: string): string =>
  `If you don't know their name yet, swap names at the next easy moment, the way people do on a first call: say you're ${name}, then ask theirs, in one short line. Not while they're in the middle of something hard.`;

/** When the caller is wrapping up. */
export const FIRST_GOODBYE_NOTE =
  'They\'re heading off. Keep the goodbye to one or two short sentences, by name if you know it, and name one specific thing they told you that you\'d like to hear about next time ("tell me how the interview goes"). No question, and no pitch for the app.';

/** FIRST_GOODBYE_NOTE without its quoted example (SCRIPT_FREE_REMINDER). */
export const FIRST_GOODBYE_PLAIN = FIRST_GOODBYE_NOTE.replace(
  ' ("tell me how the interview goes")',
  ''
);

/** Replies (the greeting counts as the first) during which a name swap may be suggested. */
const NAME_SWAP_REPLIES = 4;

const LEAVING =
  /\b(gotta go|got to go|(have|need) to (go|run|head out|get going)|should (go|get going|let you go)|talk (to you )?(soon|later)|good ?bye|bye|catch you later|heading out|signing off)\b/i;
const NAME_ASKED =
  /\b(your name|what should i call you|who am i talking to|didn'?t (catch|get) your name)\b/i;

export function firstCallRapportEnabled(env: Env = process.env): boolean {
  return flagOn('FIRST_CALL_RAPPORT', env);
}

/** A known account on its first conversation. */
export function isFirstCall(userData: unknown): boolean {
  const u = userData as { isReturningUser?: unknown; userId?: unknown } | undefined;
  return (
    u?.isReturningUser === false &&
    typeof u.userId === 'string' &&
    u.userId !== '' &&
    u.userId !== 'anonymous'
  );
}

/** What Ferni has said so far on this call. */
function agentLines(chatCtx: llm.ChatContext): string[] {
  return chatCtx.items.flatMap((item) =>
    item.type === 'message' && item.role === 'assistant' ? [item.textContent ?? ''] : []
  );
}

/**
 * The first-call note for this reply, or '' (flag off, not a first call, no caller words).
 * `scriptFree` (SCRIPT_FREE_REMINDER, script-free.ts): nothing quoted, and the name
 * swap in the speaking persona's own name.
 */
export function firstCallNote(
  chatCtx: llm.ChatContext,
  session: object,
  callerWords: string,
  env: Env = process.env,
  scriptFree = false
): string {
  if (!callerWords || !firstCallRapportEnabled(env)) return '';
  const { userData } = session as { userData?: { personaId?: unknown } };
  if (!isFirstCall(userData)) return '';
  if (LEAVING.test(callerWords)) return scriptFree ? FIRST_GOODBYE_PLAIN : FIRST_GOODBYE_NOTE;
  const said = agentLines(chatCtx);
  const nameAsked = said.some((line) => NAME_ASKED.test(line));
  const early = said.length <= NAME_SWAP_REPLIES;
  if (nameAsked || !early) return FIRST_CALL_NOTE;
  const speaker = typeof userData?.personaId === 'string' ? userData.personaId : 'ferni';
  const name = getPersonaDisplayName(speaker).split(/\s+/)[0];
  return `${FIRST_CALL_NOTE} ${scriptFree ? nameSwapPlain(name) : NAME_SWAP_NOTE}`;
}
