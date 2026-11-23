/**
 * SELF_SHARE_STAYS=on (off by default, #3475): asked about himself, Ferni
 * says one real thing and leaves it there instead of handing the question
 * straight back, and asked again ("no, something specific", "what's been
 * bugging you lately, and don't say nothing") he stays on himself a moment
 * longer, with one more real thing.
 *
 * Dev calls 2026-11-04 and 2026-11-22 (rt-1104-your-day-specific,
 * rt-1122-your-turn-first): every turn where the caller asked about him ended
 * with "what about you, how's your afternoon?", and a follow-up got "fair
 * enough, what's on your mind then?". That was the per-turn notes, not the
 * model: ferni-state.ts told him "then ask them something about theirs" on
 * every asked turn, ASKED_NO_DETAIL (self-share-asked.ts) told him to "say
 * you're doing well" once the call's details were spent, and the turn after a
 * share of his was swung onto them ("this one is about them") even when the
 * caller asked again. Those rules came from a real call (ferni-self-share.ts:
 * five unasked replies about himself) and still hold for unasked shares; they
 * over-apply when the caller is the one asking.
 *
 * This wraps ferni-state's turn (turn-notes-guarded.ts) and, flag on, rewrites
 * only those three lines; the rest of the turn is ferni-state's, byte for byte,
 * and flag off returns it untouched. It acts only on a line ferni-state wrote,
 * so never on a call that has had crisis, hard news or distress (ferni-state's
 * sticky `needed`), never for another persona, and never on a turn whose exits
 * are held (exits-held.ts: crisis guidance, or crisis risk noted on the call,
 * where a question to the caller may be the safety check that matters).
 * It also leaves the turn alone when his last reply sounded flat (that
 * correction stays), on a task turn, and when he just asked a question and
 * their words open with an answer ("Yes. How are you?"): they may be answering him.
 *
 * Canon: an asked turn still answers from ferni-state's grounded day detail;
 * a follow-up goes deeper on what he has already said this call, never a new
 * event of his day (the same ten details coming back call after call is why
 * they are rationed, self-share-asked.ts).
 *
 * @module agents/personas/self-share-stays
 */

import type { llm } from '@livekit/agents';

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { ferniStateTurn, type StateTurn } from './ferni-state.js';
import { exitsHeld } from './exits-held.js';
import { isSelfShare, selfQuotes } from './ferni-self-share.js';
import { callerTurnsOf } from './happy-exits.js';
import { ASKED_NO_DETAIL } from './self-share-asked.js';
import { callerMove } from './turn-shape.js';

const log = createLogger({ module: 'SelfShareStays' });

function selfShareStaysOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('SELF_SHARE_STAYS', env);
}

/**
 * The lines read from ferni-state's turn, and what they become. If ferni-state's
 * wording changes, nothing matches and its turn passes through untouched; the
 * tests (self-share-stays.test.ts) go red on that, through the live path.
 */
const STAY_LINES = {
  /** ferni-state.ts's asked-turn ending (a test pins it against ferni-state's real output). */
  turnBack: ', then ask them something about theirs.',
  /** ferni-state.ts's swing after a share of his that didn't turn back (pinned the same way). */
  swing: 'Your last reply was about you: this one is about them, their day or their world.',
  /** ferni-state.ts's flat-mood correction: when it rides the turn, nothing here changes. */
  flat: 'You sounded flat about your own day just now',
  /** Asked about him, with a day detail: the same answer, ending on his thing. */
  end: ', said plainly, and leave it there, no question back this time. End on your own thing, like "And that was my morning." or "Still makes me laugh, honestly.", not on "what about you?"',
  /** Asked again, or asked with the call's details spent: one more real thing about what he told them. */
  again:
    'They are still asking about you: stay on yourself a moment. Give one more real thing about what you already told them (why it stuck with you, what happened next, or what you will do about it), true to it, in a sentence or two, and leave it there, no question back. Start like "Okay, honestly," or "The real answer is," and say it plainly.',
  /** Asked with the call's details spent and nothing told yet: his life as written, not a new event. */
  noDetail:
    'They asked about you: give one real, small thing from your life as you know it, not a new story of your day, in a sentence or two, and leave it there, no question back. Like "Honestly, I keep meaning to book that trip and never do."',
} as const;
const { turnBack: TURN_BACK, swing: SWING, flat: FLAT } = STAY_LINES;

/** The turn, and which rewrite it got, if any (turn-shape.ts then asks no question). */
export type StayTurn = StateTurn & { stays?: 'asked' | 'no_detail' | 'again' };

/** The caller talking about themselves: then it's their turn, not a follow-up about him. */
const CALLER_SELF = /\b(?:i|i'm|im|i've|i'd|i'll|me|my|mine|myself|we|we're|our|ours|us)\b/i;
const ABOUT_HIM = /\b(?:you|your|yours|yourself|you're|you've)\b/i;
/** A push for more: "no, something specific", "come on", "what else". */
const PUSH =
  /\b(?:specific|specifically|really|seriously|come on|for real|what else|tell me more|go on|then what|like what|such as)\b/i;
/** Words that answer a question of his: "Yes. How are you?" after "are you safe?" is an answer first. */
const ANSWER_OPEN =
  /^\W*(?:yes|yeah|yep|yup|no|nope|nah|maybe|not really|kind of|kinda|sort of|i guess|i do|i don't|i am|i'm not)\b/i;
/** A follow-up is a short turn; a long one is them telling something. */
const MAX_FOLLOW_UP_WORDS = 16;

/** Still asking about him: short, nothing of their own, and about him or pushing for more. */
function stillAboutHim(said: string): boolean {
  const words = said.split(/\s+/).filter(Boolean).length;
  if (words === 0 || words > MAX_FOLLOW_UP_WORDS || CALLER_SELF.test(said)) return false;
  return ABOUT_HIM.test(said) || PUSH.test(said);
}

/** His spoken replies so far, markup removed, oldest first. */
function repliesOf(chatCtx: llm.ChatContext): string[] {
  return chatCtx.items.flatMap((item) => {
    if (item.type !== 'message' || item.role !== 'assistant') return [];
    const text = (item.textContent ?? '').replace(/<[^>]+>/g, '').trim();
    return text ? [text] : [];
  });
}

const consistentWith = (replies: string[]): string => {
  const told = selfQuotes(replies);
  return told.length
    ? ` You've said: ${told.map((q) => `"${q}"`).join(' ')} Stay consistent with it.`
    : '';
};

/** Which rewrite this turn gets, or undefined to leave ferni-state's line as it is. */
function stayKind(
  last: string,
  said: string,
  before: string | undefined,
  lastReply: string
): 'asked' | 'no_detail' | 'again' | undefined {
  if (!last || last.includes(FLAT)) return undefined;
  if (lastReply.includes('?') && ANSWER_OPEN.test(said)) return undefined;
  // ASKED_NO_DETAIL ends with TURN_BACK too, so it is read first.
  if (last.includes(ASKED_NO_DETAIL)) return 'no_detail';
  if (last.includes(TURN_BACK)) return 'asked';
  const askedBefore =
    before !== undefined && (callerMove(before) === 'about_ferni' || stillAboutHim(before));
  const follows =
    last.startsWith(`[${SWING}]`) &&
    isSelfShare(lastReply) &&
    !lastReply.includes('?') &&
    callerMove(said) !== 'about_ferni' &&
    stillAboutHim(said);
  return follows && askedBefore ? 'again' : undefined;
}

/** ferni-state's turn with the three hand-back lines rewritten (flag on, see the header). */
function staysTurn(
  turn: StateTurn,
  chatCtx: llm.ChatContext,
  env: Record<string, string | undefined> = process.env,
  held = false
): StayTurn {
  if (held || !selfShareStaysOn(env) || !turn.last) return turn;
  const turns = callerTurnsOf(chatCtx);
  const said = turns[turns.length - 1] ?? '';
  const replies = repliesOf(chatCtx);
  const lastReply = replies[replies.length - 1] ?? '';
  const kind = stayKind(turn.last, said, turns[turns.length - 2], lastReply);
  if (!kind) return turn;
  const unswung = turn.last.replace(`${SWING} `, '');
  const again = `${STAY_LINES.again}${consistentWith(replies)}`;
  const last =
    kind === 'asked'
      ? unswung.replace(TURN_BACK, STAY_LINES.end)
      : kind === 'no_detail'
        ? unswung.replace(ASKED_NO_DETAIL, selfQuotes(replies).length ? again : STAY_LINES.noDetail)
        : turn.last.replace(`[${SWING}]`, `[${again}]`);
  return { ...turn, last, stays: kind };
}

/** ferniStateTurn, then staysTurn: what turn-request.ts reads (through turn-notes-guarded.ts). */
export function ferniStateStays(
  chatCtx: llm.ChatContext,
  session: object,
  options: Parameters<typeof ferniStateTurn>[2] = {}
): StayTurn {
  const raw = ferniStateTurn(chatCtx, session, options);
  if (!raw.last || !selfShareStaysOn(options.env)) return raw;
  const { userData } = session as { userData?: { services?: { sessionId?: string } } };
  const sessionId = userData?.services?.sessionId;
  // A turn whose exits are held (crisis guidance, or risk noted on the call) keeps its question.
  const turn = staysTurn(raw, chatCtx, options.env, exitsHeld(sessionId, options.careful === true));
  if (turn.stays) log.info({ sessionId, kind: turn.stays }, 'SELF_SHARE_STAYS');
  return turn;
}
