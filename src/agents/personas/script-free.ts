/**
 * SCRIPT_FREE_REMINDER=on: the per-turn reminder stops telling every persona
 * how to sound, and keeps what it says about this caller, this moment, the
 * facts and safety.
 *
 * Measured on prod flags (scripts/persona-eval, 6 personas x 30 caller lines,
 * 2026-10-18): a blind judge told the personas apart 20% of the time (chance
 * 17%), and the reminder's quoted examples came back nearly word for word ("hm
 * let me think" in 8 of 180 replies, from all six). The reminder sits nearer the
 * reply than the character sheet, so its one shared register wins.
 *
 * On, a non-crisis turn's reminder drops the shared register, FIT_THE_MOMENT,
 * the question lines and their draw, ROUGH_FORMS, the texture, filler, opinion,
 * laugh and ask-advice extras, vocal-burst invitations and every quoted example
 * line. It keeps the look-up rule, honesty (CANDOR without its quote), "build
 * only on what they told you", what they asked or answered, and every note about
 * this caller and call (turn-request.ts). How a persona talks is its character
 * sheet's job. A crisis turn (shape: false) is never changed.
 *
 * Measured on, same harness, two runs vs the saved prod base: copied 4-grams
 * 7.8% -> 0.6% (better), distinctness and length-matched humanness within the
 * A/A floor (57% win), insight 85% -> 74% (worse pooled), median 34 -> 25 words.
 * Replies ending on a question went 28% -> 94%, stock openers 7% -> 59% and "how
 * are you feeling" 1% -> 9%: the register's bans did work the sheets don't. Off
 * by default until the director (M2) carries that.
 *
 * Plan: docs/plans/2026-10-18-directed-not-scripted.md, milestone M2.
 *
 * @module agents/personas/script-free
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { quietLineFor } from './quiet-caller.js';
import { CANDOR, CANDOR_PLAIN, stanceFor } from './turn-candor.js';
import { regexSignals, type TurnSignals } from './turn-extras.js';
import { lengthLearned, lengthLine, targetWords } from './turn-length.js';
import {
  ABOUT_YOU,
  callerMove,
  LOOKUP,
  NOT_AN_ASSISTANT,
  ONLY_WHAT_THEY_TOLD,
  TAKE_UP_ANSWER,
  type TurnShape,
} from './turn-shape.js';

export function scriptFreeOn(env: Env = process.env): boolean {
  return flagOn('SCRIPT_FREE_REMINDER', env);
}

/** Facts, not sound: only what they said, no unasked offers, one spoken paragraph (TTS). */
export const SCRIPT_FREE_BASE = `${ONLY_WHAT_THEY_TOLD}${NOT_AN_ASSISTANT} No paragraph breaks.`;

/** Substance: a reply to this turn, not one that would fit any turn. */
const ANSWER_THEM =
  'Respond to the specific thing they just said, not with a remark that would fit anything; when they ask you something or ask for help, actually answer it.';

/** This reply's reminder with no style in it: the script-free twin of turnShapeFor (turn-shape.ts). */
export function scriptFreeShapeFor(
  userText: string,
  rng: () => number,
  signals?: TurnSignals,
  env: Env = process.env
): TurnShape {
  const sig = signals ?? regexSignals(userText, callerMove(userText));
  const { move } = sig;
  if (move === 'lookup')
    return {
      move,
      shape: 'answer',
      reminder: `${SCRIPT_FREE_BASE} ${LOOKUP}`,
      extras: ['script_free'],
    };
  const parts = [SCRIPT_FREE_BASE, ANSWER_THEM];
  if (move === 'about_ferni' && !sig.selfBrief) parts.push(ABOUT_YOU);
  else if (sig.answered) parts.push(TAKE_UP_ANSWER);
  // CANDOR=on: honesty fitted to the moment (held back while they hurt); no random stance draw.
  const stance = stanceFor(userText, move, sig, false, env);
  parts.push(...stance.lines.map((line) => (line === CANDOR ? CANDOR_PLAIN : line)));
  // TURN_LENGTH=learned: its own experiment, a length drawn from friends' turns (turn-length.ts).
  const target =
    lengthLearned(env) && move !== 'request'
      ? targetWords(userText, sig.recent, rng, sig.careful || move !== 'share')
      : 0;
  if (target) parts.push(lengthLine(target));
  if (sig.quiet) parts.push(...[quietLineFor(env)].filter(Boolean));
  return {
    move,
    shape: 'answer',
    reminder: parts.join(' '),
    extras: ['script_free', ...stance.fired, ...(target ? [`length_${target}`] : [])],
  };
}
