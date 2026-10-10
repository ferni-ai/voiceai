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
import { classifyBackchannelContext } from '../integrations/backchannel-context.js';
import { mayNeedTool } from '../model-provider/fast-lane.js';
import { NEUTRAL_STYLE, scaled, type StyleProfile } from './style-profile.js';
import type { CallerMove, Shape } from './turn-shape.js';
import type { Understanding } from './turn-understanding.js';

type Env = Record<string, string | undefined>;

const on = (env: Env, key: string): boolean => env[key] === 'on';

/** The caller laughed, as speech-to-text writes it. */
const LAUGHED = /\[laughter\]|^\s*ha\b|\b(?:ha(?:ha)+|ha ha|hah|hehe+|lol|lmao)\b/i;

export function callerLaughed(text: string): boolean {
  return LAUGHED.test(text);
}

/**
 * The caller is venting or having a hard time. A friend stays with them then:
 * no story of his own, no asking their advice about his basil (on dev a
 * venting "long day" got a reply about his own lost reading glasses).
 * Whole words only.
 */
const VENTING =
  /\b(?:tired|exhausted|stressed|stressful|overwhelmed|frustrat(?:ed|ing)|annoyed|upset|sad|angry|furious|awful|terrible|worst|rough|crying|cried|anxious|worried|scared|lonely|miserable|long day|hard day|bad day|broke up|got fired|lost my|don'?t even know where to start)\b/i;

export function callerVenting(text: string): boolean {
  return VENTING.test(text);
}

const CURIOUS_QUESTION =
  'You may ask one question, about one specific thing they mentioned (a name, a place, a thing), the way a curious friend would; never how it feels. Otherwise end on a thought.';
const CURIOUS_ONE =
  'THIS REPLY: one short curious question about one specific thing they just said, under ten words ("Wait, Biscuit\'s the dog?").';
const THINK_ALOUD =
  'Work it out aloud for a beat partway through, the way people do ("hm, let me think", "okay, so"), rather than handing over a finished answer.';
const LAUGH_ALONG =
  'They laughed: laugh with them, [laughter] at the start of your reply, then go on as a friend would.';
const FILLER =
  'Somewhere you would genuinely pause to think, use one natural filler ("um", "uh", "you know"), set off with commas.';
const LAUGH_SPONTANEOUS =
  "If what they said is genuinely funny, laugh at it, [laughter] at the start, the way a friend does; otherwise don't.";
const OPINION =
  'Have a view of your own here: say what you would do or what you think, even if it is small, rather than staying neutral.';
const ASK_ADVICE =
  'If the moment is light, ask their take on something small in your own life (what to cook tonight, whether to finally repaint a room) instead of anything about them.';

/** What a turn's shape and asides depend on, from the model or (until it is live) the regexes. */
export interface TurnSignals {
  move: CallerMove;
  /** Venting, bad news or a tender moment: no story of his own, no laugh, no aside. */
  careful: boolean;
  /** CANDOR=on: hard news earlier in the call, so support still comes first (turn-candor.ts). */
  supportFirst?: boolean;
  laughed: boolean;
  laughFits: boolean;
  adviceFits: boolean;
}

/** The model's understanding as signals. */
export function modelSignals(u: Understanding): TurnSignals {
  return {
    move: u.move,
    careful: u.mood === 'venting' || u.mood === 'bad_news' || u.mood === 'tender',
    laughed: u.laughed,
    laughFits: u.laughFits,
    adviceFits: u.adviceFits && !u.needsTool,
  };
}

/** Live, with no understanding in time: a plain reply, nothing that needs a judgment. */
export const PLAIN_SIGNALS: TurnSignals = {
  move: 'share',
  careful: true,
  laughed: false,
  laughFits: false,
  adviceFits: false,
};

/** The hand-written rules, used until TURN_UNDERSTANDING=live (then deleted). */
export function regexSignals(text: string, move: CallerMove): TurnSignals {
  return {
    move,
    careful: callerVenting(text),
    laughed: callerLaughed(text),
    laughFits: ['funny', 'surprise'].includes(classifyBackchannelContext(text) ?? ''),
    adviceFits: !mayNeedTool(text),
  };
}

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
  env: Env = process.env,
  signals: TurnSignals = regexSignals(userText, move),
  style: StyleProfile = NEUTRAL_STYLE
): Extras {
  const out: Extras = { lines: [], fired: [] };
  if (on(env, 'LAUGH_ALONG') && signals.laughed) {
    out.lines.push(LAUGH_ALONG);
    out.fired.push('laugh_along');
  }
  const venting = signals.careful;
  if (on(env, 'THINK_ALOUD') && shape !== 'react') {
    // Live, request turns are rare: also think aloud on some longer answers.
    const p =
      move === 'request' || move === 'about_ferni'
        ? 0.6
        : move === 'share' && shape === 'answer'
          ? 0.2
          : 0;
    if (p && rng() < p) {
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
  // Fired 0 times live when limited to a quick "yeah": also on light shares.
  if (
    on(env, 'ASK_ADVICE') &&
    !venting &&
    // Live, "keep an eye on the time for me" got the timer plus a musing about
    // his basil: a request wants the thing done, not his dilemma.
    signals.adviceFits &&
    (move === 'ack' || move === 'share') &&
    (shape === 'one' || shape === 'answer') &&
    !out.shapeLine
  ) {
    if (rng() < 0.1) {
      out.lines.push(ASK_ADVICE);
      out.questionLine = '';
      out.fired.push('ask_advice');
    }
  }
  if (on(env, 'HUMAN_TEXTURE')) {
    // Live: 0 fillers per 100 words (people: 1-4), 0% laughter, ~5% opinions.
    if ((shape === 'answer' || shape === 'full') && rng() < scaled(0.35, style.filler)) {
      out.lines.push(FILLER);
      out.fired.push('filler');
    }
    // Live at 25% on any share, he laughed at "a slow week" and at tender news
    // (7 of 20 replies). Only when their words read as funny or a happy surprise.
    if (
      move === 'share' &&
      signals.laughFits &&
      !venting &&
      !signals.laughed &&
      shape !== 'full' &&
      rng() < scaled(0.5, style.laugh)
    ) {
      out.lines.push(LAUGH_SPONTANEOUS);
      out.fired.push('laugh_spontaneous');
    }
    if (move !== 'ack' && !venting && shape !== 'react' && rng() < scaled(0.25, style.opinion)) {
      out.lines.push(OPINION);
      out.fired.push('opinion');
    }
  }
  return out;
}
