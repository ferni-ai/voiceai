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
/** Ferni's own words, when the caller reads neutral (pacing.ts's valence targets). */
const WORDS_SPEED: Readonly<Record<Valence, number>> = {
  heavy: 0.94,
  bright: 1.03,
  inquisitive: 1,
  neutral: 1,
};

export const SPEED_RANGE = [0.84, 1.08] as const;
export const VOLUME_RANGE = [0.8, 1.12] as const;
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

export interface AttuneInput {
  state: CallerState;
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

/** Move toward `target` by PULL of the gap, at most `step`, inside `range`. */
function approach(
  from: number,
  target: number,
  step: number,
  range: readonly [number, number]
): number {
  const move = clamp(PULL * (target - from), [-step, step]);
  return round2(clamp(from + move, range));
}

/** Bright good news never meets heavy words: heavy words win the pace. */
function targetFor(state: CallerState, valence: Valence): Target {
  if (valence === 'heavy' && (state === 'bright' || state === 'neutral')) {
    return { speed: WORDS_SPEED.heavy, volume: 0.95 };
  }
  if (state === 'neutral') return { speed: WORDS_SPEED[valence], volume: 1 };
  return TARGET[state];
}

export function decideAttune(input: AttuneInput): Attunement {
  const target = targetFor(input.state, input.valence);
  const prevSpeed = input.previous.speed ?? 1;
  const prevVolume = input.previous.volume ?? 1;
  return {
    state: input.state,
    speed: approach(prevSpeed, target.speed + (input.nudge ?? 0), MAX_SPEED_STEP, SPEED_RANGE),
    volume: approach(prevVolume, target.volume, MAX_VOLUME_STEP, VOLUME_RANGE),
    emotion: input.state === 'low' && input.valence === 'heavy' ? 'sympathetic' : target.emotion,
  };
}
