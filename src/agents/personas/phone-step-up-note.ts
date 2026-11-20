/**
 * PHONE_STEP_UP (off by default): why calling and texting wait on a phone-in
 * call, and the way forward, for the model when an action is in play.
 *
 * Before this the model met no call or text tool and said a flat "I can't
 * actually make calls for you" (honest-line.ts), with no reason and no way
 * on. Now it hears that a code texted to the caller's verified phone opens
 * those tools, and offers it as a question: the code goes out only on the
 * caller's own yes. Never on a crisis turn, where no tools run at all, nor on
 * a later turn of a call with crisis risk (phone-step-up.ts).
 *
 * @module agents/personas/phone-step-up-note
 */
import { stepUpOffered } from '../shared/phone-step-up.js';
import { actionInPlay, lastCallerWords } from './action-claim-guard.js';
import { STEP_UP_OFFER } from './honest-line.js';

const STEP_UP_NOTE =
  'This caller phoned in, so calling, texting and emailing people stay closed until they say back a code ' +
  "texted to their verified phone. If they ask for one of those, don't say you did it or that you can't: " +
  `say "${STEP_UP_OFFER}" and wait for their answer. Never say or guess a code.`;

/** The note on a phone-in call that can be offered a code, with an action in play; else ''. */
export function phoneStepUpNote(
  sessionId: string | undefined,
  chatCtx: { items: readonly unknown[] },
  crisis: boolean
): string {
  if (crisis || !stepUpOffered(sessionId, process.env, lastCallerWords(chatCtx))) return '';
  return actionInPlay(chatCtx) ? STEP_UP_NOTE : '';
}
