/**
 * Ferni's own state on a call (FERNI_STATE=on, off by default): how much
 * energy he has and a one-word mood, so he isn't the same at minute ten as at
 * minute one, or at 2am in Wyoming as at 2pm.
 *
 * Energy comes from his local hour (America/Denver), how long the call has
 * run, and a little contagion from the caller: how they sound (voiceEmotion
 * arousal), their mood, and how much they're saying. It shows up three ways,
 * all small: one line in the turn reminder (so his words match how he sounds,
 * and "you sound tired" gets a true answer), a slightly slower or quicker
 * pace through the Director (ferni-energy.ts), and, late at night, a single
 * offer to say he's fading a bit, at most once a call.
 *
 * When the caller needs him (hard news, a crisis, real distress) the state
 * goes neutral for the rest of the call: his tiredness never takes over then.
 *
 * He is also a well, curious friend about himself (ferni-self-share.ts): his
 * day holds one small, specific, good thing per call; he talks about himself
 * rarely (never in two replies running, never while they're telling him
 * something of theirs), lightly, and turns back to them with a question; and
 * a reply that sounded resigned or avoidant gets corrected on the next turn.
 * Dev call 2026-10-11: five replies about a tired man's chores ("It's just too
 * much effort") to a quiet caller, caller talk share 0.08.
 *
 * Replaces nothing live: conversation/humanization/vocal-fatigue.ts and
 * conversation/energy-regulation.ts had the idea but no live caller on the
 * cascade (vocal-fatigue only through humanizeResponse, which nothing calls).
 *
 * @module agents/personas/ferni-state
 */

import type { llm } from '@livekit/agents';

import {
  setFerniEnergy,
  type FerniEnergyLevel,
} from '../../speech/tts-gateway/director/ferni-energy.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-intelligence.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import { helpAskLine, newHelpAskState, type HelpAskState } from './ferni-asks-help.js';
import { ferniThreadsOn, threadDetailFor } from './ferni-life-threads.js';
import { dayDetailFor, isSelfShare, selfQuotes, soundsLow, turnsBack } from './ferni-self-share.js';
import * as asked from './self-share-asked.js';
import { callerVenting } from './turn-extras.js';
import { hardNews } from './turn-candor.js';
import { callerMove, taskTurn } from './turn-shape.js';
import { callerTurn } from '../model-provider/fast-lane.js';
import { understandingFor } from './turn-understanding.js';

const log = createLogger({ module: 'FerniState' });

/** Where Ferni lives (Wyoming). */
export const FERNI_HOME_TZ = 'America/Denver';

export function ferniStateEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FERNI_STATE === 'on';
}

/**
 * Energy (0-1) by local hour: low in the small hours, up through the
 * morning, a dip after lunch, easing off through the evening.
 */
const HOUR_ENERGY = [
  0.3, 0.25, 0.22, 0.2, 0.22, 0.3, 0.45, 0.6, 0.7, 0.72, 0.72, 0.7, 0.66, 0.6, 0.56, 0.6, 0.64,
  0.65, 0.64, 0.6, 0.56, 0.5, 0.44, 0.36,
];
const LOW = 0.35;
const HIGH = 0.72;
/** A long call wears him down a little: 0.01 a minute, at most 0.15. */
const DRAIN_PER_MINUTE = 0.01;
const MAX_DRAIN = 0.15;
/** He can say he's fading once, late, and only once the call has run a while. */
const FADING_AFTER_MINUTES = 5;

export interface StateInputs {
  /** Ferni's local time. */
  hour: number;
  minute: number;
  callMinutes: number;
  /** The caller's voice arousal, -1 calm to 1 excited, when the reading is confident. */
  callerArousal?: number;
  /** The model's reading of the caller's mood (turn-understanding.ts), if any. */
  callerMood?: string;
  /** Words in the caller's last few turns, oldest first. */
  callerTurnWords: number[];
  /** They said they're tired themselves. */
  callerTired: boolean;
}

export interface FerniState {
  energy: number;
  level: FerniEnergyLevel;
  mood: string;
}

/** The small hours, when being tired is just true. */
export function isLate(hour: number): boolean {
  return hour >= 23 || hour < 5;
}

export function stateFor(i: StateInputs): FerniState {
  let energy = HOUR_ENERGY[i.hour] ?? 0.6;
  energy -= Math.min(MAX_DRAIN, Math.max(0, i.callMinutes) * DRAIN_PER_MINUTE);
  // Contagion: a little, never a mirror.
  if (i.callerArousal !== undefined) energy += 0.12 * Math.max(-1, Math.min(1, i.callerArousal));
  if (i.callerMood === 'excited' || i.callerMood === 'funny' || i.callerMood === 'surprise')
    energy += 0.08;
  if (i.callerTired) energy -= 0.05;
  const recent = i.callerTurnWords.slice(-3);
  if (recent.length) {
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (mean >= 25) energy += 0.04;
    else if (mean <= 3) energy -= 0.03;
  }
  energy = Math.round(Math.max(0, Math.min(1, energy)) * 100) / 100;
  const level: FerniEnergyLevel = energy < LOW ? 'low' : energy > HIGH ? 'high' : 'steady';
  const mood =
    level === 'low' ? (isLate(i.hour) ? 'sleepy' : 'mellow') : level === 'high' ? 'lively' : 'easy';
  return { energy, level, mood };
}

/** "nearly 2am", "just after midnight", "past 1am": for the note, not to be read out. */
export function spokenTime(hour: number, minute: number): string {
  const name = (h: number): string =>
    h === 0 ? 'midnight' : h === 12 ? 'noon' : `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
  if (minute >= 40) return `nearly ${name((hour + 1) % 24)}`;
  if (minute < 15) return `just after ${name(hour)}`;
  return `past ${name(hour)}`;
}

/** Ferni's local hour and minute. */
export function localClock(now: Date, timeZone = FERNI_HOME_TZ): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const num = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: num('hour') % 24, minute: num('minute') };
}

const NOT_UNLESS_ASKED = "Don't mention being sleepy unless they ask.";
const OFFER_FADING = "If it fits, you can say once, in passing, that you're fading a bit.";

/** The energy line for the turn reminder (empty when steady). */
export function noteFor(
  state: FerniState,
  clock: { hour: number; minute: number },
  offerFading: boolean
): string {
  if (state.level === 'high')
    return "[You're in good form right now: let a little more energy into how you say things.]";
  if (state.level !== 'low') return '';
  if (!isLate(clock.hour))
    return '[You two have been talking a while: keep replies short and easy.]';
  const where = `You're getting sleepy; it's ${spokenTime(clock.hour, clock.minute)} where you are, and you're glad they called.`;
  const keep =
    "Keep replies short and unhurried, and if they're winding down, let the call end warmly.";
  return `[${where} ${keep}] ${offerFading ? OFFER_FADING : NOT_UNLESS_ASKED}`;
}

/** Always on: how he is, so he never improvises a low day to talk about. */
const WELL =
  "[You're doing well today and glad they called. Anything about yourself comes out light, specific and a little funny, the way someone who's doing fine talks, and your attention stays on them.]";

/** What this turn knows about his own talk on the call. */
export interface SelfTurn {
  /** His replies so far, oldest first. */
  replies: string[];
  /** The caller's latest words. */
  said: string;
  /** The day detail for this call. */
  detail: string;
  /** A tool ran for this reply (it confirms or reports what was done). */
  toolRan?: boolean;
  /** SELF_SHARE_WHEN_ASKED=on: his day only when asked, never on his first reply (self-share-asked.ts). */
  askedOnly?: { firstReply: boolean; nextDetail: () => string | undefined };
}

/**
 * Asked to do or find something: his day stays out of it. Prod 2026-10-17,
 * "Do you have my number?" after "I can't ring your phone directly": "I do
 * have your number, but since I can't call you directly, I was actually just
 * about to head out and try to find a replacement houseplant."
 */
export const TASK_LINE =
  "[They want something answered or done: answer it or do it, plainly, and if you can't, say so simply. Nothing about your own day, plans or errands in this reply, and never a plan of your own as a reason to go.]";

/**
 * The self-share line for this turn, and whether a story of his own may ride
 * this reply at all (turn-shape.ts reads it for its "second story" line).
 */
export function selfShareFor(turn: SelfTurn): { line: string; ownStory: boolean; brief?: boolean } {
  const { replies, said, askedOnly } = turn;
  const last = replies[replies.length - 1] ?? '';
  const recent = replies.slice(-2).some(isSelfShare);
  const move = callerMove(said);
  const sharing = move === 'share' && said.split(/\s+/).filter(Boolean).length >= 8;
  const lines: string[] = [];
  if (soundsLow(last))
    lines.push(
      "You sounded flat about your own day just now, and you aren't: leave that thread, keep it light, and turn to them."
    );
  else if (isSelfShare(last) && !turnsBack(last))
    lines.push('Your last reply was about you: this one is about them, their day or their world.');
  if (taskTurn(said, turn.toolRan)) {
    const before = lines.length ? `[${lines.join(' ')}] ` : '';
    return { line: `${before}${TASK_LINE}`, ownStory: false };
  }
  if (move === 'about_ferni') {
    const detail = askedOnly?.firstReply
      ? undefined
      : askedOnly
        ? askedOnly.nextDetail()
        : turn.detail;
    const brief = askedOnly?.firstReply ? asked.FIRST_REPLY_ASKED : asked.ASKED_NO_DETAIL;
    if (!detail) return { line: `[${[...lines, brief].join(' ')}]`, ownStory: false, brief: true };
    const told = selfQuotes(replies);
    const consistent = told.length
      ? ` You've said: ${told.map((q) => `"${q}"`).join(' ')} Stay consistent with it.`
      : '';
    lines.push(
      `They asked about you: answer from your day (${detail}), in a sentence or two, then ask them something about theirs.${consistent}`
    );
    return { line: `[${lines.join(' ')}]`, ownStory: true };
  }
  if (askedOnly)
    return { line: `[${(lines.length ? lines : [asked.UNASKED]).join(' ')}]`, ownStory: false };
  // Early on, the call is theirs: nothing of his own until he has listened a
  // bit, and then at most one unasked share in any three replies.
  const early = replies.length < 2 || replies.slice(-3).some(isSelfShare);
  if (recent || sharing || early) {
    if (!lines.length)
      lines.push(
        recent
          ? 'You talked about yourself just now: keep this reply on them, nothing more about your own day.'
          : sharing
            ? "They're telling you something of theirs: stay with it, nothing about yourself this time."
            : 'Keep this reply on them.'
      );
    return { line: `[${lines.join(' ')}]`, ownStory: false };
  }
  lines.push(
    `If something of your own fits, it's from today (${turn.detail}): one light sentence, then turn to them with a question about their world.`
  );
  return { line: `[${lines.join(' ')}]`, ownStory: !soundsLow(last) };
}

/**
 * The caller needs him: hard news, a crisis, or distress (venting about more
 * than being tired). Tiredness alone ("ugh, long day") isn't distress.
 */
const TIRED = /\b(?:tired|exhausted|sleepy|long day)\b/gi;
export function callerNeedsHim(said: string, mood?: string): boolean {
  if (mood === 'bad_news') return true;
  if (hardNews(said) || callerVenting(said.replace(TIRED, ''))) return true;
  return detectCrisis(said).isCrisis;
}

interface CallState {
  firstSeen: number;
  needed: boolean;
  /** The caller words the fading offer went with: the final request extending them keeps it. */
  offeredOn?: string;
  lastSaid?: string;
  lastLevel?: FerniEnergyLevel;
  lastNote: string;
  lastSelf: string;
  /** Whether the last note let a story of his own ride the reply (undefined: no say). */
  lastOwnStory?: boolean;
  /** Whether a tool had run for the last request's reply. */
  lastToolRan?: boolean;
  /** The one good thing in his day this call (ferni-self-share.ts). */
  detail: string;
  /** FERNI_ASKS_HELP: how far his ask for a hand has got (ferni-asks-help.ts). */
  help: HelpAskState;
  /** SELF_SHARE_WHEN_ASKED=on: the details this call may use and has used. */
  asked?: asked.AskedRecord;
  /** Whether the last note asked for a short answer about him, no story (turn-shape.ts). */
  lastBrief?: boolean;
}
const calls = new WeakMap<object, CallState>();

interface UserDataView {
  personaId?: string;
  userId?: string;
  voiceEmotion?: { arousal?: number; confidence?: number };
  services?: { sessionId?: string; sessionStartTime?: number };
  /** Eval calls only: his clock from the job metadata (eval-local-time.ts). */
  evalLocalTime?: { hour: number; minute: number };
}

function callerTurns(chatCtx: llm.ChatContext): string[] {
  const turns: string[] = [];
  for (const item of chatCtx.items) {
    if (item.type !== 'message' || item.role !== 'user') continue;
    const text = item.textContent ?? '';
    if (text && !text.startsWith(TURN_CONTEXT_HEADER)) turns.push(text);
  }
  return turns;
}

/** Ferni's spoken replies so far, markup removed, oldest first. */
function ferniReplies(chatCtx: llm.ChatContext): string[] {
  const replies: string[] = [];
  for (const item of chatCtx.items) {
    if (item.type !== 'message' || item.role !== 'assistant') continue;
    const text = (item.textContent ?? '').replace(/<[^>]+>/g, '').trim();
    if (text) replies.push(text);
  }
  return replies;
}

/** On for Ferni only (his home, his clock), when the flag is on. */
function activeFor(userData: UserDataView, env?: Record<string, string | undefined>): boolean {
  const ferni = userData.personaId === undefined || userData.personaId === 'ferni';
  return ferni && ferniStateEnabled(env);
}

const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** His day this call: his thread's current beat (FERNI_THREADS), else a day detail. */
function detailFor(
  seed: string,
  now: Date,
  userId?: string,
  env?: Record<string, string | undefined>
) {
  const caller = userId && userId !== 'anonymous' ? userId : seed;
  return (ferniThreadsOn(env) && threadDetailFor(caller, now)) || dayDetailFor(seed);
}

function callFor(
  session: object,
  now: Date,
  view: UserDataView,
  env?: Record<string, string | undefined>
): CallState {
  let call = calls.get(session);
  if (!call) {
    const seed = view.services?.sessionId ?? Math.random().toString(36).slice(2);
    call = {
      firstSeen: now.getTime(),
      needed: false,
      lastNote: '',
      lastSelf: '',
      detail: detailFor(seed, now, view.userId, env),
      help: newHelpAskState(),
    };
    if (asked.selfShareWhenAskedOn(env))
      call.asked = asked.askedRecordFor(seed, view.userId, call.detail);
    calls.set(session, call);
  }
  return call;
}

/** The caller's voice arousal, only from a reading confident enough to lean on. */
function arousalOf(userData: UserDataView): number | undefined {
  const voice = userData.voiceEmotion;
  if (typeof voice?.arousal !== 'number' || (voice.confidence ?? 0) < 0.5) return undefined;
  return voice.arousal;
}

/** Whether this turn carries the once-a-call "fading a bit" offer. */
function fadingOffer(
  call: CallState,
  said: string,
  state: FerniState,
  hour: number,
  minutes: number
): boolean {
  if (call.offeredOn !== undefined) return said.startsWith(call.offeredOn);
  const offer = state.level === 'low' && isLate(hour) && minutes >= FADING_AFTER_MINUTES;
  if (offer) call.offeredOn = said;
  return offer;
}

/** This turn's state: the reminder text, and whether a story of his own may ride the reply. */
export interface StateTurn {
  /** How he is: goes with the other notes. */
  note: string;
  /**
   * His self-share line: goes last, after the turn shape, where a line is
   * followed best (turn-shape.ts). In the middle, "keep this reply on them"
   * was ignored as often as the director's notes were (quiet-caller rollouts).
   */
  last: string;
  /** Undefined when the state has no say (flag off, another persona, the caller needs him). */
  ownStory?: boolean;
  /** SELF_SHARE_WHEN_ASKED=on: asked about him, but a short answer, not a story of his own. */
  brief?: boolean;
}

/**
 * This turn's state lines for the reminder (turn-request.ts), and the pace the
 * Director reads. Empty and nothing set when the flag is off, another persona
 * is speaking, or the caller needs him. The preemptive and final requests for
 * one turn agree: the same words get the same lines, and the fading offer
 * made with the preemptive request holds for the final one that extends it.
 */
export function ferniStateTurn(
  chatCtx: llm.ChatContext,
  session: object,
  options: { careful?: boolean; now?: Date; env?: Record<string, string | undefined> } = {}
): StateTurn {
  const userData = ((session as { userData?: unknown }).userData ?? {}) as UserDataView;
  const sessionId = userData.services?.sessionId;
  const quiet = (): StateTurn => {
    if (sessionId) setFerniEnergy(sessionId, undefined);
    return { note: '', last: '' };
  };
  if (!activeFor(userData, options.env)) return quiet();
  const now = options.now ?? new Date();
  const call = callFor(session, now, userData, options.env);
  const turns = callerTurns(chatCtx);
  const said = turns[turns.length - 1] ?? '';
  // The reply after a tool ran is a new request for the same words.
  const toolRan = callerTurn(chatCtx.items) === null;
  if (said && said === call.lastSaid && toolRan === call.lastToolRan) return turnOf(call);
  call.lastSaid = said;
  call.lastToolRan = toolRan;
  call.lastNote = '';
  call.lastSelf = '';
  call.lastOwnStory = undefined;
  call.lastBrief = undefined;
  const mood = understandingFor(session, said)?.mood;
  if (options.careful === true || callerNeedsHim(said, mood)) call.needed = true;
  if (call.needed) return quiet();
  const energy = stateNote(call, userData, { words: turns.map(wordsIn), said, mood }, now);
  const replies = ferniReplies(chatCtx);
  const self = selfShareFor({
    replies,
    said,
    detail: call.detail,
    toolRan,
    askedOnly: call.asked && {
      firstReply: turns.length <= 1,
      nextDetail: () => (call.asked ? asked.nextDetail(call.asked) : undefined),
    },
  });
  const help = helpAskLine(
    { ...self, detail: call.detail, replies, userId: userData.userId, userData, env: options.env },
    call.help
  );
  call.lastNote = [WELL, energy].filter(Boolean).join(' ');
  call.lastSelf = [self.line, help].filter(Boolean).join(' ');
  call.lastOwnStory = self.ownStory;
  call.lastBrief = self.brief;
  return turnOf(call);
}

const turnOf = (c: CallState): StateTurn => ({
  note: c.lastNote,
  last: c.lastSelf,
  ownStory: c.lastOwnStory,
  brief: c.lastBrief,
});

/** The reminder text only (see ferniStateTurn). */
export function ferniStateNote(
  chatCtx: llm.ChatContext,
  session: object,
  options: { careful?: boolean; now?: Date; env?: Record<string, string | undefined> } = {}
): string {
  const turn = ferniStateTurn(chatCtx, session, options);
  return [turn.note, turn.last].filter(Boolean).join(' ');
}

/** Ferni's state this turn: the reminder line, the Director's pace, the log on a change. */
function stateNote(
  call: CallState,
  userData: UserDataView,
  turn: { words: number[]; said: string; mood?: string },
  now: Date
): string {
  const { said, mood } = turn;
  const sessionId = userData.services?.sessionId;
  const clock = userData.evalLocalTime ?? localClock(now);
  const minutes =
    (now.getTime() - (userData.services?.sessionStartTime ?? call.firstSeen)) / 60_000;
  const state = stateFor({
    ...clock,
    callMinutes: minutes,
    callerArousal: arousalOf(userData),
    callerMood: mood,
    callerTurnWords: turn.words,
    callerTired: /\b(?:tired|exhausted|sleepy)\b/i.test(said),
  });
  const offer = fadingOffer(call, said, state, clock.hour, minutes);
  if (sessionId) setFerniEnergy(sessionId, state.level);
  if (state.level !== call.lastLevel || offer) {
    log.info({ sessionId, ...state, hour: clock.hour, offer }, 'FERNI_STATE');
  }
  call.lastLevel = state.level;
  return noteFor(state, clock, offer);
}
