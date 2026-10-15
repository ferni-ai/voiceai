/**
 * Voice attunement (VOICE_ATTUNE=on, off by default): the reply's voice
 * answers how the caller feels, not only what Ferni's own words say.
 *
 * Without it the Director reads only Ferni's opening words and the LLM's own
 * tag. The caller's mood (the turn analysis, `turnContext.userEmotion`) never
 * reached the voice: on dev 2026-10-09..11, replies to callers read as sad
 * averaged speed 1.003 and replies to joyful ones 1.000 (cloud-agents logs).
 *
 * The caller's mood is read into one of four states, each with a target pace
 * and loudness and a tone. A friend slows and softens for someone low, steadies
 * (rather than matches) someone tense, and brightens a little with good news.
 * Targets are approached across turns, at most MAX_SPEED_STEP / MAX_VOLUME_STEP
 * per reply, so the voice drifts with the conversation instead of jumping, and
 * stay inside SPEED_RANGE / VOLUME_RANGE so it never turns comic. The tone is
 * only a candidate: emotion.ts still drops one the reply's words contradict.
 *
 * Measured on Ferni's voice (scripts/voice-eval/voice-emotion, 2026-10-11):
 * <speed ratio="0.86"/> slows articulation ~7%, <volume ratio="0.85"/> takes
 * ~2 dB off, and Cartesia compresses speed-ups (1.05 is heard as ~1.0), so
 * brightness comes from `content` and loudness, not pace.
 *
 * It also follows how the caller talks (entrain): their pace against a typical
 * talker, and their loudness against their own usual, half-way each and inside
 * PACE_BAND / LOUDNESS_BAND_DB. Pace and loudness only: matching a caller's
 * pitch lowered trust in the entrainment studies, and Cartesia has no pitch
 * control anyway. Heavy words (or a sympathetic reply) drop to HEAVY at once,
 * and a low caller's target is reached at once, as a friend does on hard news;
 * the way back up is gradual.
 *
 * @module speech/tts-gateway/director/attune
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import type { StableEmotion, Valence } from './emotion.js';
import type { ProsodyResponse } from './prosody-response.js';

export type CallerState = 'low' | 'tense' | 'bright' | 'neutral';

/** Exact labels only: the turn analyzer's (detectors/emotion.ts) and common words. */
const STATE_OF: Readonly<Record<string, CallerState>> = {
  sadness: 'low',
  sad: 'low',
  regret: 'low',
  grief: 'low',
  grieving: 'low',
  lonely: 'low',
  hurt: 'low',
  disappointed: 'low',
  depressed: 'low',
  melancholic: 'low',
  anger: 'tense',
  angry: 'tense',
  fear: 'tense',
  scared: 'tense',
  anxiety: 'tense',
  anxious: 'tense',
  worried: 'tense',
  stressed: 'tense',
  frustrated: 'tense',
  overwhelmed: 'tense',
  disgust: 'tense',
  joy: 'bright',
  happy: 'bright',
  excited: 'bright',
  proud: 'bright',
  elated: 'bright',
  thrilled: 'bright',
  delighted: 'bright',
};

const FROM_PROSODY: Partial<Record<ProsodyResponse['reason'], CallerState>> = {
  low: 'low',
  tense: 'tense',
  excited: 'bright',
};

interface Target {
  speed: number;
  volume: number;
  emotion?: StableEmotion;
}

const TARGET: Readonly<Record<CallerState, Target>> = {
  low: { speed: 0.86, volume: 0.85, emotion: 'calm' },
  tense: { speed: 0.93, volume: 0.92, emotion: 'calm' },
  bright: { speed: 1.04, volume: 1.08, emotion: 'content' },
  neutral: { speed: 1, volume: 1 },
};
/**
 * Heavy words, whoever the caller: dev 2026-10-05..12, heavy replies ran +0.8%
 * pace and -0.5 dB against neutral ones (prosody-gap-2026-10-13), where people
 * slow and soften. 0.86 is ~7% slower and 0.8 ~2.5 dB softer on Ferni's voice.
 */
export const HEAVY: Readonly<Target> = { speed: 0.86, volume: 0.8 };
/** Ferni's own words, when the caller reads neutral (pacing.ts's valence targets). */
const WORDS_SPEED: Readonly<Record<Valence, number>> = {
  heavy: HEAVY.speed,
  bright: 1.03,
  inquisitive: 1,
  neutral: 1,
};

export const SPEED_RANGE = [0.8, 1.08] as const;
export const VOLUME_RANGE = [0.7, 1.12] as const;
/**
 * A typical talker's words per voiced second: the AMI corpus median is 4.0
 * (prosody-gap-2026-10-13), and dev's eval caller reads 3.7-4.1 on the native
 * analyzer (cloud-agents, 2026-10-13).
 */
export const TYPICAL_WORDS_PER_SEC = 4;
/** How far Ferni follows the caller's pace: never quicker than 1.04 (Cartesia flattens more anyway). */
export const PACE_BAND = [0.9, 1.04] as const;
/** How far Ferni follows the caller's loudness, in dB: softer readily, louder only a little. */
export const LOUDNESS_BAND_DB = [-3, 1.5] as const;
const FOLLOW = 0.5;
const PULL = 0.7;
export const MAX_SPEED_STEP = 0.08;
export const MAX_VOLUME_STEP = 0.1;

export function voiceAttuneOn(env: Env = process.env): boolean {
  return flagOn('VOICE_ATTUNE', env);
}

/**
 * The caller's state this turn. A non-steady reading of their voice (when the
 * prosody lever is live) speaks for this turn; otherwise the turn analysis.
 */
export function callerState(
  userEmotion: string | undefined,
  prosody?: ProsodyResponse
): CallerState {
  const heard = prosody ? FROM_PROSODY[prosody.reason] : undefined;
  if (heard) return heard;
  return STATE_OF[userEmotion?.trim().toLowerCase() ?? ''] ?? 'neutral';
}

/** How the caller talks this turn (caller-prosody.ts). Pitch is left out on purpose. */
export interface CallerVoice {
  wordsPerSec?: number;
  /** Loudness against the caller's own usual, in dB. */
  energyRelDb?: number;
}

export interface AttuneInput {
  state: CallerState;
  /** How the caller talks this turn, when it was heard. */
  voice?: CallerVoice;
  /** How Ferni's reply opens (emotion.ts readValence). */
  valence: Valence;
  /** The previous reply's speed and volume in this session (1 when none). */
  previous: { speed?: number; volume?: number };
  /** Ferni's own energy (ferni-energy.ts), as a pace nudge. */
  nudge?: number;
}

export interface Attunement {
  state: CallerState;
  speed: number;
  volume: number;
  /** A tone candidate for emotion.ts; it still has to fit the words. */
  emotion?: StableEmotion;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, [lo, hi]: readonly [number, number]): number =>
  Math.min(hi, Math.max(lo, n));

/** Move toward `target` by PULL of the gap, at most `step` (all of it when `atOnce`), inside `range`. */
function approach(
  from: number,
  target: number,
  step: number,
  range: readonly [number, number],
  atOnce = false
): number {
  const move = atOnce ? target - from : clamp(PULL * (target - from), [-step, step]);
  return round2(clamp(from + move, range));
}

/** Pace and loudness multipliers that follow the caller half-way, inside the bands. */
export function entrain(voice: CallerVoice | undefined): { speed: number; volume: number } {
  const wps = voice?.wordsPerSec;
  const pace = wps ? 1 + FOLLOW * (wps / TYPICAL_WORDS_PER_SEC - 1) : 1;
  const db = clamp(FOLLOW * (voice?.energyRelDb ?? 0), LOUDNESS_BAND_DB);
  return { speed: clamp(pace, PACE_BAND), volume: 10 ** (db / 20) };
}

/** Heavy words slow and soften whatever the caller's state; bright good news never meets them. */
function targetFor(state: CallerState, valence: Valence): Target {
  const base: Target =
    state === 'neutral' ? { speed: WORDS_SPEED[valence], volume: 1 } : TARGET[state];
  if (valence !== 'heavy') return base;
  return {
    speed: Math.min(base.speed, HEAVY.speed),
    volume: Math.min(base.volume, HEAVY.volume),
    emotion: state === 'bright' ? undefined : base.emotion,
  };
}

export function decideAttune(input: AttuneInput): Attunement {
  const target = targetFor(input.state, input.valence);
  const follow = entrain(input.voice);
  const prevSpeed = input.previous.speed ?? 1;
  const prevVolume = input.previous.volume ?? 1;
  const speed = target.speed * follow.speed + (input.nudge ?? 0);
  const volume = target.volume * follow.volume;
  const heavy = input.valence === 'heavy';
  // Hard news, theirs or in Ferni's words: the voice drops at once, not over turns.
  const drop = heavy || input.state === 'low';
  return {
    state: input.state,
    speed: approach(prevSpeed, speed, MAX_SPEED_STEP, SPEED_RANGE, drop && speed < prevSpeed),
    volume: approach(
      prevVolume,
      volume,
      MAX_VOLUME_STEP,
      VOLUME_RANGE,
      drop && volume < prevVolume
    ),
    emotion: input.state === 'low' && heavy ? 'sympathetic' : target.emotion,
  };
}

/**
 * Attune is the single owner of a reply's pace and loudness inside the
 * Director (decision 2026-10-14, for TEAM_VOICES and PORCH_LIGHT): nothing else
 * there sets either. Its inputs are layered in this order:
 *  1. persona: the speaker's resting pace, pace band and loudness (TEAM_VOICES;
 *     persona-delivery.ts reads them from the manifest). Ferni has none: 1.
 *  2. late night: a slower, softer resting point for a call the caller started
 *     in their small hours (PORCH_LIGHT). The persona's band bounds the rest.
 *  3. caller: how this reply answers the caller and its own words, relative to
 *     a resting 1 (decideAttune with VOICE_ATTUNE, else pacing.ts), applied
 *     last and in proportion: hard news slows Nayan as much as Ferni, from his
 *     own rest. Only this layer is smoothed and carried to the next reply, so
 *     the resting layers apply at once and never compound.
 * Late night and the caller together stay inside SPEED_RANGE / VOLUME_RANGE of
 * the persona's own rest (never comic; never more than ~3 dB softer than the
 * persona's own voice). Tags continuation-tts leads a push with (a soft start,
 * pace matching) are still composed on top, in engine.ts, as before.
 */
export interface Shift {
  speed: number;
  volume: number;
}
export interface RestingVoice {
  /** Resting pace; 1 is Ferni's. */
  base: number;
  band: readonly [number, number];
  volume: number;
}
export interface DeliveryLayers {
  persona?: RestingVoice;
  lateNight?: Shift;
  caller: Shift;
}
export type DeliveryLayer = 'persona' | 'late-night' | 'caller';
export interface Delivery extends Shift {
  /** The caller layer's pace (snapped): what the next reply smooths from. */
  relativeSpeed: number;
  /** Pace and loudness after each layer present, in the order applied. */
  trace: Array<{ layer: DeliveryLayer } & Shift>;
}

/** Below this distance from 1 a speed is not worth a tag. */
export const SPEED_EPSILON = 0.015;
const CARTESIA_SPEED = [0.6, 1.5] as const;
const CARTESIA_VOLUME = [0.5, 2] as const;
const snap = (speed: number): number => (Math.abs(speed - 1) < SPEED_EPSILON ? 1 : speed);
const around = (rest: number, [lo, hi]: readonly [number, number]): readonly [number, number] => [
  rest * lo,
  rest * hi,
];

/** Pace and loudness from the layers, in order. Loudness applies only with the pacing lever live. */
export function layerDelivery(layers: DeliveryLayers, pacingLive: boolean): Delivery {
  const { persona, lateNight, caller } = layers;
  if (!persona && !lateNight) {
    const trace = [{ layer: 'caller' as const, ...caller }];
    const speed = snap(caller.speed);
    return { speed, volume: pacingLive ? caller.volume : 1, relativeSpeed: speed, trace };
  }
  const own = { speed: persona?.base ?? 1, volume: persona?.volume ?? 1 };
  const band = persona?.band ?? CARTESIA_SPEED;
  const trace: Delivery['trace'] = persona ? [{ layer: 'persona', ...own }] : [];
  const rest = { ...own };
  if (lateNight) {
    rest.speed = round2(clamp(own.speed * lateNight.speed, band));
    rest.volume = round2(own.volume * lateNight.volume);
    trace.push({ layer: 'late-night', ...rest });
  }
  const speedLimits = around(own.speed, SPEED_RANGE);
  const speed = round2(clamp(clamp(rest.speed * caller.speed, speedLimits), CARTESIA_SPEED));
  const loudLimits = around(own.volume, VOLUME_RANGE);
  const volume = round2(clamp(clamp(rest.volume * caller.volume, loudLimits), CARTESIA_VOLUME));
  trace.push({ layer: 'caller', speed, volume });
  return {
    speed: snap(speed),
    volume: pacingLive ? volume : 1,
    relativeSpeed: snap(caller.speed),
    trace,
  };
}
