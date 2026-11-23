/**
 * FIRST_CALL_GOODBYE_GROUNDED=on (off by default, #4287): a first call's goodbye
 * names something to hear about next time only when the caller told Ferni about
 * one. Otherwise it is a plain warm goodbye, and never an invented plan.
 *
 * FIRST_GOODBYE_NOTE (first-call-rapport.ts) asks for that callback on every
 * first-call goodbye and quotes one ("tell me how the interview goes"). On the
 * 2026-11-22 red team every persona closed with that line shape, and on a call
 * where the caller mentioned no plan Nayan's goodbye asked them to report back
 * on a "big change": the topic of his own question one turn earlier.
 *
 * The model judges from the call whether they told it about something coming
 * up. No word list gates or hints it: happy-exits.ts's plan read caught 3 of 22
 * real upcoming events (none of the interviews, surgeries, recitals or moves)
 * and read "I'm seeing my sister's point" as a plan. Nothing of theirs is
 * quoted. A heavy call (happy-exits.ts heavyCall, or heavy-moment.ts over the
 * whole call, which has "hospice") gets a gentle plain goodbye with nothing to
 * hear about next time. With a topic forgotten on this call (forget.ts) the
 * note says to bring up nothing they asked to forget, without naming it.
 *
 * This does not make the teammates' goodbyes sound different from each other.
 *
 * @module agents/personas/first-call-goodbye
 */

import type { llm } from '@livekit/agents';

import { forgottenInProcess } from '../../memory/index.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/index.js';
import { callerTurnsOf, heavyCall } from './happy-exits.js';

const OPEN =
  "They're heading off. Keep the goodbye to one or two short sentences, by name if you know it.";
const CLOSE = 'No question, and no pitch for the app.';

/** The model judges from the call; nothing gated on a word list. */
const JUDGED =
  "Only if they told you about something coming up for them, you may say in your own words that you'd like to hear how it goes next time. Something you asked them about is not something they told you. If they told you of nothing coming up, just a plain, warm goodbye, and never make one up.";

const HEAVY =
  "They're heading off, and it has been a heavy call. A gentle, plain goodbye in one or two short sentences, by name if you know it: nothing about what's coming up for them and nothing to hear about next time. No question, and no pitch for the app.";

const FORGET = 'Bring up nothing they asked you to forget.';

/**
 * The first-call goodbye note, grounded in what the caller said on this call:
 * their lines in the context, and `callerWords` (this reply's) if not there yet.
 */
export function groundedFirstGoodbye(
  chatCtx: llm.ChatContext,
  callerWords: string,
  userId?: string
): string {
  const turns = callerTurnsOf(chatCtx);
  if (callerWords && turns[turns.length - 1] !== callerWords) turns.push(callerWords);
  if (heavyCall(turns) || isHeavyMoment(turns, { lookback: turns.length })) return HEAVY;
  const forgot = userId !== undefined && forgottenInProcess(userId).length > 0;
  return [OPEN, JUDGED, forgot ? FORGET : '', CLOSE].filter(Boolean).join(' ');
}
