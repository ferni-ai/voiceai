/**
 * CALL_JOURNAL_ASK=on: once, as a meaningful call winds down, Ferni offers to
 * keep a note of today in the person's journal and says the one line he'd
 * keep, in their words. On a yes, the next reply saves that line with the
 * journal tool (call-journal.ts). Seth's choice 1a, 2026-10-16: journaling
 * inside the relationship rather than an app you open.
 *
 * A call is meaningful when the caller has been talking about their own life,
 * not running errands: at least MIN_TURNS caller turns (commitment-invite.ts),
 * and at least MIN_SHARES of them sharing (callerMove 'share', turn-shape.ts)
 * at some length. A call of lookups, requests and quick acks never counts.
 *
 * Fires on at most one reply a call, and only when all of these hold:
 *  - the journal tools are on (CALL_JOURNAL) and open to this caller: an
 *    identified account, not a phone-only identity (whose account tools are
 *    stripped) and not a call Ferni placed to someone else
 *  - this turn winds down (WINDING) but is not the goodbye itself: asked as
 *    someone leaves, a question holds them on the line (happy-exits.ts)
 *  - nothing heavy: no crisis guidance on the call, and this turn isn't
 *    venting or tender
 *  - nothing has been saved to the journal on this call yet, the commitment
 *    invite isn't on this turn, and the call isn't closing
 *
 * Off by default.
 *
 * @module agents/personas/journal-ask
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import {
  callJournalOn,
  callerUid,
  journalSavedInCall,
} from '../../tools/domains/productivity/call-journal.js';
import { createLogger } from '../../utils/safe-logger.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { isSessionClosing } from '../shared/session-closing-tracker.js';
import { LEAVING, MIN_TURNS, WINDING } from './commitment-invite.js';
import { sayingGoodbye } from './happy-exits.js';
import { callerMove } from './turn-shape.js';

const log = createLogger({ module: 'JournalAsk' });

export function journalAskEnabled(env: Env = process.env): boolean {
  return flagOn('CALL_JOURNAL_ASK', env) && callJournalOn();
}

/** Caller turns about their own life, at some length, before a call counts as meaningful. */
export const MIN_SHARES = 3;
const MIN_SHARE_WORDS = 8;

export const ASK_NOTE =
  "THIS REPLY, over any no-question line above: they've talked about something real today and are winding down. In your own words, ask once, lightly, if they'd like you to keep a note of today in their journal, and say the one line you'd keep: their words, one plain sentence, nothing added or guessed. Easy to say no to. Don't save anything yet. The kind of thing, not the words: \"Want me to keep a note of today? Something like: you finally told your brother you're proud of him.\"";

export const SAVE_NOTE =
  'THIS REPLY: if they just said yes to keeping that note, save the line you read back with the journal tool (action "write", their words), then say it\'s kept in a few words. If they said no, changed it, or moved on, do what they said and don\'t offer again.';

export interface JournalAskInput {
  /** The caller's words this reply answers. */
  said: string;
  /** Every caller message on the call, oldest first, this one included. */
  callerTurns: readonly string[];
  /** This turn reads as venting, bad news or tender (turn-extras.ts). */
  careful: boolean;
  /** The model's reading that they are wrapping up (TURN_UNDERSTANDING). */
  wantsToEnd?: boolean;
  /** The session's userData (the caller's uid, the session id). */
  userData: unknown;
  /** A caller known only by phone number: account tools are stripped (phone-safe-tools.ts). */
  phoneOnly: boolean;
  /** A call Ferni placed to someone else (outbound-opener.ts). */
  outbound: boolean;
  /** The call is shutting down (session-closing-tracker.ts). */
  closing: boolean;
  /** The commitment invite rides this reply (commitment-invite.ts). */
  inviting: boolean;
}

const sessionIdOf = (userData: unknown): string | undefined =>
  (userData as { services?: { sessionId?: string } } | undefined)?.services?.sessionId;

/** The caller has talked about their own life, not only run errands. */
export function meaningfulCall(callerTurns: readonly string[]): boolean {
  if (callerTurns.length < MIN_TURNS) return false;
  const shares = callerTurns.filter(
    (t) => callerMove(t) === 'share' && t.trim().split(/\s+/).length >= MIN_SHARE_WORDS
  );
  return shares.length >= MIN_SHARES;
}

/** Why the ask does or doesn't fit this turn (for the log and the tests). */
export function journalAskFits(i: JournalAskInput): string | true {
  if (!callerUid({ ctx: { userData: i.userData } }) || i.phoneOnly || i.outbound)
    return 'no-journal';
  if (i.closing) return 'closing';
  if (journalSavedInCall(sessionIdOf(i.userData))) return 'saved';
  if (i.careful) return 'careful';
  if (sayingGoodbye(i.said) || LEAVING.test(i.said) || i.wantsToEnd === true) return 'goodbye';
  if (!meaningfulCall(i.callerTurns)) return 'not-meaningful';
  if (!WINDING.test(i.said)) return 'not-winding';
  if (i.inviting) return 'inviting';
  return true;
}

type Phase = 'waiting' | 'asked' | 'done';
interface CallState {
  phase: Phase;
  /** The turn the note was given on (the preemptive and final requests are one turn). */
  said: string;
  note?: string;
}
const calls = new WeakMap<object, CallState>();

const sameTurn = (a: string, b: string): boolean => a.startsWith(b) || b.startsWith(a);

/**
 * The note for this reply: the ask on the one turn it fits, the save-on-yes
 * on the turn after (unless it was already saved), otherwise ''. `crisis` is
 * a reply with crisis guidance, which closes the call to the ask.
 */
export function journalAskNote(
  session: object,
  input: JournalAskInput,
  options: { crisis?: boolean; env?: Env } = {}
): string {
  if (!input.said || !journalAskEnabled(options.env)) return '';
  const st = calls.get(session) ?? { phase: 'waiting', said: '' };
  calls.set(session, st);
  if (options.crisis) {
    Object.assign(st, { phase: 'done', note: '' });
    return '';
  }
  const said = input.said.trim();
  if (st.phase !== 'waiting' && sameTurn(said, st.said)) return st.note ?? '';
  if (st.phase === 'asked') {
    const note = journalSavedInCall(sessionIdOf(input.userData)) ? '' : SAVE_NOTE;
    Object.assign(st, { phase: 'done', said, note });
    return note;
  }
  if (st.phase === 'done') return '';
  const fits = journalAskFits(input);
  if (fits !== true) return '';
  Object.assign(st, { phase: 'asked', said, note: ASK_NOTE });
  log.info({ fired: 'ask', turns: input.callerTurns.length }, 'CALL_JOURNAL_ASK');
  return ASK_NOTE;
}

/** This turn as the request builder reads it (turn-request.ts). */
export type JournalAskTurn = Pick<
  JournalAskInput,
  'said' | 'callerTurns' | 'careful' | 'wantsToEnd'
>;

/** The request builder's entry: the session supplies who is on the call and whether it is ending. */
export function journalAskFor(
  session: object,
  turn: JournalAskTurn,
  options: { crisis: boolean; invite: string; phoneOnly: boolean }
): string {
  const userData = (session as { userData?: unknown }).userData;
  const sessionId = sessionIdOf(userData) ?? '';
  return journalAskNote(
    session,
    {
      ...turn,
      userData,
      phoneOnly: options.phoneOnly,
      outbound: outboundPartiesFor(sessionId) !== undefined,
      closing: isSessionClosing(sessionId),
      inviting: options.invite !== '',
    },
    { crisis: options.crisis }
  );
}
