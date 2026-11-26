/**
 * BIDS_TURN_TOWARD (off by default, #4509): when the caller makes a bid for
 * Ferni's attention, he takes it up before anything he had planned.
 *
 * Gottman's newlyweds who were still married six years later had turned toward
 * 86% of their partner's small bids; those who divorced, 33% (Driver and
 * Gottman 2004, Family Process). On a call the bids are small: a teaser that
 * builds up to something ("guess what", "you won't believe this") or a side
 * road off the current topic ("oh, and", "random, but", "that reminds me").
 * A model carrying a follow-up, a tool result or a topic of its own steps over
 * them.
 *
 * With the flag on, a teaser not yet told, or a side-road turn, gets one note: take the bid up
 * first, in a few words of his own. Not a bid here:
 *   - good news ("guess what, I got the job"): GOOD_NEWS_BIGGER's note says
 *     how to meet it (newsNote below picks that one first);
 *   - "anyway", "never mind", "it's fine": the caller closing a topic, which
 *     CALLER_SETS_DEPTH says to follow, never to probe;
 *   - any reply with crisis guidance.
 * Whole-word patterns only.
 *
 * @module agents/personas/turn-toward-bids
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { goodNewsNote } from './good-news-bigger.js';

const log = createLogger({ module: 'TurnTowardBids' });

type Bid = 'teaser' | 'side_road';

/** Building up to something, not yet told. */
const TEASER =
  /\b(?:guess what|you(?:'ll| will)? never guess|you won'?t believe|you(?:'re| are) not gonna believe|wait (?:till|until) you hear|(?:so|okay),? funny story|(?:wanna|want to) hear something|i have to tell you something|i gotta tell you something|get this)\b/i;

/** Off the current topic, onto something of their own (after a lead-in like "yeah," too). */
const SIDE_ROAD =
  /(?:^|[.!?]\s+)(?:(?:yeah|oh|okay|ok|so|hey|well|um),?\s+)?(?:oh,? and\b|oh,? also\b|random(?:ly)?,? but\b|totally unrelated\b|side note\b|that reminds me\b|speaking of\b|before i forget\b|oh,? (?:wait|hey),? (?:did i tell you|i forgot to tell you)\b)/i;

const TEASER_NOTE =
  "They're building up to something. Bite first, in a few words of your own, the way a friend leans in, then let them tell it. Don't guess what it is, and don't bring up anything you had planned in this reply.";

const SIDE_ROAD_NOTE =
  "They just took a side road onto something of their own. Follow them there; don't steer back to the earlier topic or anything you had planned. Come back to it only if they do.";

function bidsTurnTowardOn(env: Env = process.env): boolean {
  return flagOn('BIDS_TURN_TOWARD', env);
}

/**
 * A teaser still waiting to be told: at most this many words after it. "Guess what, the car broke
 * down again" has told it, and gets no teaser note (asking what happened would ignore them).
 */
const TEASER_TAIL_WORDS = 3;

function untoldTeaser(said: string): boolean {
  const m = TEASER.exec(said);
  if (!m) return false;
  // Only the first few words decide it, so a long turn isn't tokenized whole.
  const tail = said.slice(m.index + m[0].length, m.index + m[0].length + 80);
  const after = tail.match(/[\p{L}\p{N}']+/gu) ?? [];
  // "You won't believe who I ran into": a wh- clause still holds the news back.
  return (
    after.length <= TEASER_TAIL_WORDS ||
    /^(?:who|what|where|how|which|whose|happened)$/i.test(after[0] ?? '')
  );
}

/** The bid in the caller's words, if any. */
function bidIn(said: string): Bid | undefined {
  if (untoldTeaser(said)) return 'teaser';
  if (SIDE_ROAD.test(said)) return 'side_road';
  return undefined;
}

/** The turn-toward note for this reply, or ''. */
function bidNote(said: string, opts: { crisis: boolean }, env: Env = process.env): string {
  if (!bidsTurnTowardOn(env) || opts.crisis || !said) return '';
  const bid = bidIn(said);
  if (!bid) return '';
  log.info({ behaviour: 'bids_turn_toward', bid }, 'Turn-toward note added to the turn reminder');
  return bid === 'teaser' ? TEASER_NOTE : SIDE_ROAD_NOTE;
}

/**
 * The note for something the caller brings: good news first (GOOD_NEWS_BIGGER),
 * else a bid (BIDS_TURN_TOWARD), else ''. One note, so the two never stack.
 */
export function newsNote(
  said: string,
  callerTurns: readonly string[],
  opts: { crisis: boolean; session?: object },
  env: Env = process.env
): string {
  return goodNewsNote(said, callerTurns, opts, env) || bidNote(said, opts, env);
}
