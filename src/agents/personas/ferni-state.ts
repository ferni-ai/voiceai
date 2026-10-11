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
import { callerVenting } from './turn-extras.js';
import { hardNews } from './turn-candor.js';
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

const NOT_UNLESS_ASKED = "Don't mention being tired unless they ask.";
const OFFER_FADING = "If it fits, you can say once, in passing, that you're fading a bit.";

/** The one line for the turn reminder (empty when steady). */
export function noteFor(
  state: FerniState,
  clock: { hour: number; minute: number },
  offerFading: boolean
): string {
  if (state.level === 'high')
    return "[You're in good form right now: let a little more energy into how you say things.]";
  if (state.level !== 'low') return '';
  const where = isLate(clock.hour)
    ? `You're a bit worn out; it's ${spokenTime(clock.hour, clock.minute)} where you are.`
    : "You're a little worn out after a long call.";
  const keep =
    "Keep replies short and unhurried, and if they're winding down, let the call end warmly.";
  return `[${where} ${keep}] ${offerFading ? OFFER_FADING : NOT_UNLESS_ASKED}`;
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
}
const calls = new WeakMap<object, CallState>();

interface UserDataView {
  personaId?: string;
  voiceEmotion?: { arousal?: number; confidence?: number };
  services?: { sessionId?: string; sessionStartTime?: number };
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

/** On for Ferni only (his home, his clock), when the flag is on. */
function activeFor(userData: UserDataView, env?: Record<string, string | undefined>): boolean {
  const ferni = userData.personaId === undefined || userData.personaId === 'ferni';
  return ferni && ferniStateEnabled(env);
}

const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function callFor(session: object, now: Date): CallState {
  let call = calls.get(session);
  if (!call) {
    call = { firstSeen: now.getTime(), needed: false, lastNote: '' };
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

/**
 * This turn's state line for the reminder (turn-request.ts), and the pace the
 * Director reads. Empty and nothing set when the flag is off, another persona
 * is speaking, or the caller needs him. The preemptive and final requests for
 * one turn agree: the same words get the same line, and the fading offer
 * made with the preemptive request holds for the final one that extends it.
 */
export function ferniStateNote(
  chatCtx: llm.ChatContext,
  session: object,
  options: { careful?: boolean; now?: Date; env?: Record<string, string | undefined> } = {}
): string {
  const userData = ((session as { userData?: unknown }).userData ?? {}) as UserDataView;
  const sessionId = userData.services?.sessionId;
  const quiet = (): string => {
    if (sessionId) setFerniEnergy(sessionId, undefined);
    return '';
  };
  if (!activeFor(userData, options.env)) return quiet();
  const now = options.now ?? new Date();
  const call = callFor(session, now);
  const turns = callerTurns(chatCtx);
  const said = turns[turns.length - 1] ?? '';
  if (said && said === call.lastSaid) return call.lastNote;
  call.lastSaid = said;
  call.lastNote = '';
  const mood = understandingFor(session, said)?.mood;
  if (options.careful === true || callerNeedsHim(said, mood)) call.needed = true;
  if (call.needed) return quiet();
  call.lastNote = stateNote(call, userData, { words: turns.map(wordsIn), said, mood }, now);
  return call.lastNote;
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
  const clock = localClock(now);
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
