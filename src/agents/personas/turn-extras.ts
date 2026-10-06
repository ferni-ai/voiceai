/**
 * Small, optional behaviours a friend has on the phone, added to one reply's
 * shape (turn-shape.ts). Each is off unless its env var is "on", so prod is
 * unchanged until one has been heard on dev:
 *
 *   CURIOUS_DETAIL  questions go after one concrete detail they mentioned
 *                   ("wait, Biscuit's the dog?"), not how they feel.
 *   THINK_ALOUD     on a real question, work it out aloud partway through
 *                   ("hm, let me think") instead of a finished answer. Live
 *                   fillers were 0.4 per 100 words; people use 1-4.
 *   LAUGH_ALONG     when they laugh, laugh with them. Ferni laughed in 0 of 37
 *                   live replies; most laughter in conversation is shared, not
 *                   a response to a joke (Provine).
 *   ASK_ADVICE      on a light acknowledgement, now and then ask their take on
 *                   something small in his own life; being asked for help
 *                   draws people closer.
 *
 * A switched-off behaviour draws nothing from the random source, so the
 * shapes drawn for a turn are the same as without this module.
 *
 * @module agents/personas/turn-extras
 */
import type { CallerMove, Shape } from './turn-shape.js';

type Env = Record<string, string | undefined>;

const on = (env: Env, key: string): boolean => env[key] === 'on';

/** The caller laughed, as speech-to-text writes it. */
const LAUGHED = /\[laughter\]|^\s*ha\b|\b(?:ha(?:ha)+|ha ha|hah|hehe+|lol|lmao)\b/i;

export function callerLaughed(text: string): boolean {
  return LAUGHED.test(text);
}

const CURIOUS_QUESTION =
  'You may ask one question, about one specific thing they mentioned (a name, a place, a thing), the way a curious friend would; never how it feels. Otherwise end on a thought.';
const CURIOUS_ONE =
  'THIS REPLY: one short curious question about one specific thing they just said, under ten words ("Wait, Biscuit\'s the dog?").';
const THINK_ALOUD =
  'Work it out aloud for a beat partway through, the way people do ("hm, let me think", "okay, so"), rather than handing over a finished answer.';
const LAUGH_ALONG =
  'They laughed: laugh with them, [laughter] at the start of your reply, then go on as a friend would.';
const ASK_ADVICE =
  'If the moment is light, ask their take on something small in your own life (whether to give up on the basil, what to cook tonight) instead of anything about them.';

export interface Extras {
  /** Lines to add before the shape line. */
  lines: string[];
  /** Replaces the shape line, when the reply becomes a curious question. */
  shapeLine?: string;
  /** Replaces the question allowance line. */
  questionLine?: string;
  /** Which behaviours fired, for the TURN_SHAPE log. */
  fired: string[];
}

/**
 * The optional behaviours for one reply. `questionAllowed` is whether the
 * shape already allows a question (turn-shape.ts questionLine).
 */
export function extrasFor(
  userText: string,
  move: CallerMove,
  shape: Shape,
  questionAllowed: boolean,
  rng: () => number,
  env: Env = process.env
): Extras {
  const out: Extras = { lines: [], fired: [] };
  if (on(env, 'LAUGH_ALONG') && callerLaughed(userText)) {
    out.lines.push(LAUGH_ALONG);
    out.fired.push('laugh_along');
  }
  if (
    on(env, 'THINK_ALOUD') &&
    (move === 'request' || move === 'about_ferni') &&
    shape !== 'react'
  ) {
    if (rng() < 0.4) {
      out.lines.push(THINK_ALOUD);
      out.fired.push('think_aloud');
    }
  }
  if (on(env, 'CURIOUS_DETAIL')) {
    if (questionAllowed) {
      out.questionLine = CURIOUS_QUESTION;
      out.fired.push('curious_question');
    } else if (move === 'share' && shape === 'one' && rng() < 0.1) {
      out.shapeLine = CURIOUS_ONE;
      out.questionLine = '';
      out.fired.push('curious_one');
    }
  }
  if (on(env, 'ASK_ADVICE') && move === 'ack' && shape === 'one' && !out.shapeLine) {
    if (rng() < 0.12) {
      out.lines.push(ASK_ADVICE);
      out.questionLine = '';
      out.fired.push('ask_advice');
    }
  }
  return out;
}
