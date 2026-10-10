/**
 * Which conversational moves Ferni made on each reply of a call, and what the
 * caller's turns were like, as numbers: after the call, the record a learner
 * reads for which moves help this person (move-outcomes.ts). MOVE_OUTCOMES=on
 * (off by default) only records; nothing here changes a reply.
 *
 * A move is one the turn reminder asked for (turn-shape.ts) or one seen in
 * what Ferni said: a question, a laugh, a name from earlier in the call (a
 * callback). Backchannel clips go on the reply whose answer they are heard in.
 * Caller words become counts and yes/no cues at once; only the last turn's
 * words and earlier names are held, in memory, for the call.
 *
 * @module agents/personas/move-log
 */
import { transcriptText } from '../multi-agent/assistant-transcript.js';
import { STANCE } from './turn-candor.js';
import { callerLaughed } from './turn-extras.js';
import {
  ABOUT_YOU,
  QUESTION_LINE,
  ROUGH_FORMS,
  SECOND_STORY,
  type TurnShape,
} from './turn-shape.js';

type Env = Record<string, string | undefined>;
type Handler = (...args: unknown[]) => void;

export function moveOutcomesEnabled(env: Env = process.env): boolean {
  return env.MOVE_OUTCOMES === 'on';
}

/** What a caller turn was like, never what was said. */
export interface CallerTurn {
  words: number;
  /** Opening up: a feeling, a worry, something they haven't told anyone. */
  disclosure: boolean;
  laughed: boolean;
  /** "Never mind", "forget it": they dropped what they were saying. */
  dropped: boolean;
  goodbye: boolean;
}

/** The reply length drawn (turn-shape.ts); under TURN_SHAPE=model the model picks, so 'default'. */
export type ReplyLength = 'short' | 'default' | 'long';
const LENGTH: Record<string, ReplyLength> = { react: 'short', one: 'short', full: 'long' };

/** One reply: the moves in it, and the caller turn it answers. */
export interface ReplyEntry {
  moves: string[];
  replyLength: ReplyLength;
  caller: CallerTurn;
  replied: boolean;
  bargedIn: boolean;
  replyWords: number;
}

export interface MoveLog {
  sessionId: string;
  startedAt: number;
  entries: ReplyEntry[];
  /** The latest caller words, in memory only. */
  last: string;
  /** Names the caller used before this turn, and in it; in memory only. */
  earlier: Set<string>;
  current: Set<string>;
}

const DISCLOSURE =
  /\b(?:i feel|i felt|i'?ve been feeling|honestly|to be honest|the truth is|i'?ve never (?:told|said)|i haven'?t told|can i tell you something|this is hard to say|between (?:you and me|us)|i'?m (?:so |really |kind of )?(?:scared|worried|nervous|anxious|afraid|ashamed|embarrassed|proud|lonely|struggling|hurt)|i (?:really )?miss)\b/i;
const DROPPED =
  /\b(?:never ?mind|forget (?:it|i said)|doesn'?t matter|it'?s not a big deal|let'?s (?:talk about something else|change the subject)|moving on)\b|^\W*anyway\b/i;
const GOODBYE =
  /\b(?:bye|goodbye|good night|talk (?:to you )?(?:later|soon|tomorrow)|gotta go|have to go|i'?ll let you go|see ya)\b/i;

export function callerTurn(text: string): CallerTurn {
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    disclosure: DISCLOSURE.test(text),
    laughed: callerLaughed(text),
    dropped: DROPPED.test(text),
    goodbye: GOODBYE.test(text),
  };
}

const NOT_TOPICS = new Set(['ferni', 'maya', 'jordan', 'alex', 'peter', 'nayan', 'joel']);

/** Capitalised words not opening a sentence: names, places, things. */
export function namesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const sentence of text.split(/[.!?]+\s+/)) {
    for (const word of sentence.split(/\s+/).slice(1)) {
      const w = word.replace(/[^A-Za-z']/g, '').replace(/'s$/, '');
      if (/^[A-Z][a-z]{2,}$/.test(w) && !NOT_TOPICS.has(w.toLowerCase())) out.add(w.toLowerCase());
    }
  }
  return out;
}

/** The moves a turn's reminder asked for. */
export function movesFor(turn: TurnShape): string[] {
  const moves = turn.extras.filter((id) => id !== 'model_shape');
  const r = turn.reminder;
  if (r.includes(SECOND_STORY)) moves.push('second_story');
  if (r.includes(ABOUT_YOU)) moves.push('about_you');
  if (r.includes(QUESTION_LINE.allowed)) moves.push('question_ok');
  if (r.includes(STANCE)) moves.push('stance');
  if (ROUGH_FORMS.some((f) => r.includes(f))) moves.push('rough');
  return moves;
}

const bySession = new WeakMap<object, MoveLog>();
const byId = new Map<string, MoveLog>();
const STALE_MS = 12 * 60 * 60 * 1000; // a log never taken (no summary saved) is dropped

export function startMoveLog(session: object, sessionId: string, now = Date.now()): MoveLog {
  for (const [id, old] of byId) if (now - old.startedAt > STALE_MS) byId.delete(id);
  const moveLog: MoveLog = {
    sessionId,
    startedAt: now,
    entries: [],
    last: '',
    earlier: new Set(),
    current: new Set(),
  };
  bySession.set(session, moveLog);
  byId.set(sessionId, moveLog);
  return moveLog;
}

/** The call's log, removed: the after-call task reads it once. */
export function takeMoveLog(sessionId: string): MoveLog | undefined {
  const moveLog = byId.get(sessionId);
  byId.delete(sessionId);
  return moveLog;
}

/**
 * A request for a reply to `said`. The preemptive and final requests for one
 * turn (the same words, or the final extending them, with no reply between)
 * are one entry, holding the final request's moves.
 */
export function noteTurn(session: object, said: string, turn: TurnShape | undefined): void {
  const moveLog = bySession.get(session);
  const t = said.trim();
  if (!moveLog || !t) return;
  const moves = turn ? movesFor(turn) : [];
  const replyLength = (turn && LENGTH[turn.shape]) ?? 'default';
  const entry = moveLog.entries.at(-1);
  const sameTurn = entry && !entry.replied && (t === moveLog.last || t.startsWith(moveLog.last));
  if (sameTurn) {
    entry.moves = [...moves, ...entry.moves.filter((m) => m === 'backchannel')];
    entry.caller = callerTurn(t);
    entry.replyLength = replyLength;
  } else {
    for (const name of moveLog.current) moveLog.earlier.add(name);
    moveLog.entries.push({
      moves,
      replyLength,
      caller: callerTurn(t),
      replied: false,
      bargedIn: false,
      replyWords: 0,
    });
  }
  moveLog.last = t;
  moveLog.current = namesIn(t);
}

/** A move outside the turn reminder, added to the latest reply (a backchannel, a thought). */
export function noteMove(session: object, move: string): void {
  const entry = bySession.get(session)?.entries.at(-1);
  if (entry && !entry.moves.includes(move)) entry.moves.push(move);
}

/** What Ferni said in reply (one of possibly several messages), as he said it. */
export function noteReply(session: object, text: string, interrupted: boolean): void {
  const moveLog = bySession.get(session);
  const entry = moveLog?.entries.at(-1);
  if (!moveLog || !entry) return;
  const said = transcriptText(text);
  entry.replied = true;
  entry.bargedIn ||= interrupted;
  entry.replyWords += said.split(/\s+/).filter(Boolean).length;
  const seen: string[] = [];
  if (/\[laughter\]/i.test(text)) seen.push('laughed');
  if (said.includes('?')) seen.push('asked');
  const words = new Set(said.toLowerCase().match(/[a-z']+/g) ?? []);
  if ([...moveLog.earlier].some((n) => words.has(n) && !moveLog.current.has(n)))
    seen.push('callback');
  for (const move of seen) if (!entry.moves.includes(move)) entry.moves.push(move);
}

/** Starts the call's log and listens for Ferni's committed replies. */
export function installMoveLog(
  session: object,
  sessionId: string,
  events: { on: (event: string, handler: Handler) => void },
  handlers: Array<{ event: string; handler: Handler }>
): void {
  if (!moveOutcomesEnabled()) return;
  startMoveLog(session, sessionId);
  const onItem = (event: unknown): void => {
    const item = (
      event as {
        item?: { type?: string; role?: string; textContent?: string; interrupted?: boolean };
      }
    )?.item;
    if (!item || (item.type && item.type !== 'message') || item.role !== 'assistant') return;
    noteReply(session, item.textContent ?? '', item.interrupted === true);
  };
  events.on('conversation_item_added', onItem);
  handlers.push({ event: 'conversation_item_added', handler: onItem });
}
