/**
 * SELF_SHARE_STAYS=on (off by default, #3475): asked about himself, Ferni
 * says one real thing and leaves it there instead of handing the question
 * straight back, and on the next turn or two the model decides whether the
 * caller is still asking about him ("no, something specific", "what's been
 * bugging you lately") or has moved on to their own things.
 *
 * Dev calls 2026-11-04 and 2026-11-22 (rt-1104-your-day-specific,
 * rt-1122-your-turn-first): every turn where the caller asked about him ended
 * with "what about you, how's your afternoon?", and a follow-up got "fair
 * enough, what's on your mind then?". That was the per-turn notes, not the
 * model: ferni-state.ts told him "then ask them something about theirs" on
 * every asked turn, ASKED_NO_DETAIL (self-share-asked.ts) told him to "say
 * you're doing well" once the call's details were spent, and the turn after a
 * share of his was swung onto them ("this one is about them") even when they
 * asked again. Those rules came from a real call (ferni-self-share.ts: five
 * unasked replies about himself) and still hold for unasked shares.
 *
 * What changes, flag on (the rest of the turn is ferni-state's, byte for byte;
 * flag off returns it untouched):
 * - An ask about him (ferni-state's own read: its asked line) ends on his
 *   thing, with no question back unless something they said sounds low.
 * - The one or two caller turns right after such a turn: ferni-state's "keep
 *   this reply on them" line becomes a note that hands the call to the model.
 *   Which turns those are comes from this call's state, never from a word
 *   list on the caller's words (round-1 review: word lists read "Thanks, you
 *   are sweet." as an ask and missed "And?").
 *
 * Never, whatever the words: when ferni-state wrote nothing (crisis, hard news
 * or distress on the call: its sticky `needed`); when exits are held
 * (exits-held.ts: crisis guidance, or crisis risk noted); on a task turn; when
 * his last reply sounded flat; or when any shared distress reader marks the
 * caller's turn (callerNeedsHim, troubleWords, soundsLow, a heavy moment, or
 * the model's read of their mood). Those readers miss some low lines ("so done
 * with everything", "I'm just numb"), so every note here leads with "if
 * anything they said sounds low or hard, set yourself aside and check on them".
 *
 * Canon: an asked turn still answers from ferni-state's grounded day detail; a
 * follow-up stays on what he already told them, never a new event of his day.
 * His first reply's "say you're good, then turn to them" (FIRST_REPLY_ASKED)
 * is kept: there is no detail of his day yet to stay on, and "good, you?" is
 * how people answer a hello.
 *
 * The chat-history helper is the shared one (callerTurnsOf); ferni-state.ts
 * keeps a private copy and is held by an open PR (#3811), so this module only
 * reads its output.
 *
 * @module agents/personas/self-share-stays
 */

import type { llm } from '@livekit/agents';

import { flagOn } from '../../config/env-flag.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { exitsHeld } from './exits-held.js';
import { soundsLow } from './ferni-self-share.js';
import { callerNeedsHim, ferniStateTurn, TASK_LINE, type StateTurn } from './ferni-state.js';
import { callerTurnsOf } from './happy-exits.js';
import { ASKED_NO_DETAIL, UNASKED } from './self-share-asked.js';
import { troubleWords } from './troubles-talk.js';
import { understandingFor } from './turn-understanding.js';

const log = createLogger({ module: 'SelfShareStays' });

function selfShareStaysOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('SELF_SHARE_STAYS', env);
}

/** Every note here leads with the check-in, for the low lines no shared reader marks. */
const LOW_FIRST = 'If anything they said sounds low or hard, set yourself aside and check on them.';

/**
 * ferni-state's wording this module reads (if it changes, nothing matches and
 * its turn passes through untouched; self-share-stays.test.ts goes red on that
 * through the live path), and what it becomes.
 */
const LINES = {
  asked: 'They asked about you: answer from your day',
  turnBack: ', then ask them something about theirs.',
  flat: 'You sounded flat about your own day just now',
  /** ferni-state's lines for the turn after a share of his, when the call is theirs again. */
  onThem: [
    'Your last reply was about you: this one is about them, their day or their world.',
    'You talked about yourself just now: keep this reply on them, nothing more about your own day.',
    "They're telling you something of theirs: stay with it, nothing about yourself this time.",
    'Keep this reply on them.',
    UNASKED,
  ],
  askedLowFirst: `${LOW_FIRST} Otherwise, they asked about you: answer from your day`,
  end: ', said plainly in your own words, and leave it there, no question back. End on your own thing, not on a question about theirs.',
  noDetail: `${LOW_FIRST} Otherwise, they asked about you: say one more real thing about what you've already told them, or how you honestly are right now, not a new story of your day, in a sentence or two, and leave it there, no question back.`,
  followUp: `${LOW_FIRST} Otherwise, you were just telling them about yourself: if they are still asking about you, stay on yourself a moment, one more real thing about what you already told them, plainly, with no question back; if they have moved on to something of theirs, go with them, this reply is about them.`,
} as const;

/** Follow-up turns after an ask about him that get the follow-up note; after that, ferni-state's lines. */
const MAX_FOLLOW_UPS = 2;
/** Caller turns per call remembered as stays turns (only the previous turn is ever read). */
const REMEMBERED = 6;

type StayKind = 'asked' | 'no_detail' | 'follow_up';
/** The turn, and which rewrite it got (asked/no_detail: turn-shape.ts then bars the turn-back). */
export type StayTurn = StateTurn & { stays?: StayKind };

/**
 * Per call: each stays turn, keyed by its position among the caller's turns
 * and its words, and how many follow-ups deep it was (0: the ask). Position,
 * so the same words later in the call ("Ha.") never count as a stays turn;
 * words too, so a trimmed history that shifts positions can't match by chance.
 * A second read of the same turn finds the same previous entry.
 */
const stayed = new WeakMap<object, Map<string, number>>();

function turnKey(turns: readonly string[], at: number): string {
  return `${at}:${turns[at] ?? ''}`;
}

/** How many follow-ups deep the caller's previous turn was, if it was a stays turn. */
function depthBefore(session: object, turns: readonly string[]): number | undefined {
  return turns.length < 2 ? undefined : stayed.get(session)?.get(turnKey(turns, turns.length - 2));
}

/** Records the caller's latest turn as a stays turn. */
function remember(session: object, turns: readonly string[], depth: number): void {
  const key = turnKey(turns, turns.length - 1);
  const seen = stayed.get(session) ?? new Map<string, number>();
  seen.delete(key);
  seen.set(key, depth);
  if (seen.size > REMEMBERED) seen.delete(seen.keys().next().value as string);
  stayed.set(session, seen);
}

/** Any shared reader of distress marks their words: then nothing here applies. */
function soundsHard(said: string, mood: string | undefined): boolean {
  if (mood === 'venting' || mood === 'tender' || mood === 'bad_news') return true;
  return (
    callerNeedsHim(said, mood) || troubleWords(said) || soundsLow(said) || isHeavyMoment([said])
  );
}

/** The rewrite for this turn, or undefined to leave ferni-state's line as it is. */
function rewrite(
  last: string,
  before: number | undefined
): { last: string; kind: StayKind } | undefined {
  if (last.includes(LINES.flat) || last.includes(TASK_LINE)) return undefined;
  // ASKED_NO_DETAIL ends with the turn-back too, so it is read first.
  if (last.includes(ASKED_NO_DETAIL))
    return { last: last.replace(ASKED_NO_DETAIL, LINES.noDetail), kind: 'no_detail' };
  if (last.includes(LINES.turnBack)) {
    const unswung = last.replace(`${LINES.onThem[0]} `, '');
    const ended = unswung.replace(LINES.turnBack, LINES.end);
    return { last: ended.replace(LINES.asked, LINES.askedLowFirst), kind: 'asked' };
  }
  if (before === undefined || before >= MAX_FOLLOW_UPS) return undefined;
  const onThem = LINES.onThem.find((l) => last === `[${l}]` || last.startsWith(`[${l}] `));
  if (!onThem) return undefined;
  return { last: last.replace(`[${onThem}]`, `[${LINES.followUp}]`), kind: 'follow_up' };
}

/** ferniStateTurn with the hand-back lines rewritten (flag on, see the header): what turn-request.ts reads. */
export function ferniStateStays(
  chatCtx: llm.ChatContext,
  session: object,
  options: Parameters<typeof ferniStateTurn>[2] = {}
): StayTurn {
  const turn = ferniStateTurn(chatCtx, session, options);
  if (!turn.last || !selfShareStaysOn(options.env)) return turn;
  const { userData } = session as { userData?: { services?: { sessionId?: string } } };
  const sessionId = userData?.services?.sessionId;
  // A turn whose exits are held (crisis guidance, or risk noted on the call) keeps its question.
  if (exitsHeld(sessionId, options.careful === true)) return turn;
  const turns = callerTurnsOf(chatCtx);
  const said = turns[turns.length - 1] ?? '';
  if (soundsHard(said, understandingFor(session, said)?.mood)) return turn;
  const before = depthBefore(session, turns);
  const done = rewrite(turn.last, before);
  if (!done) return turn;
  remember(session, turns, done.kind === 'follow_up' ? (before ?? 0) + 1 : 0);
  log.info({ sessionId, kind: done.kind }, 'SELF_SHARE_STAYS');
  return { ...turn, last: done.last, stays: done.kind };
}
