/**
 * When a listener says "mm-hm": the decision for pre-recorded backchannels.
 *
 * Listeners backchannel at short pauses inside the speaker's turn (Ward &
 * Tsukahara 2000 found them cued by a stretch of low pitch of 110 ms or more).
 * The rates below are a design choice, to be checked with scripts/voice-eval.
 * The older gates (5 turns of rapport, 6 s of speech, 15 s apart, 10% odds)
 * were tuned for backchannels spoken as full LLM/TTS turns, which interrupted
 * and cluttered the chat; they fired 0 times in a 30 s story on 2026-09-28.
 * Played as cached clips on a side track, a backchannel changes nothing else,
 * so it can run at human rates.
 *
 * @module agents/integrations/backchannel-policy
 */

import { callerLaughed } from '../personas/turn-extras.js';

export interface BackchannelMoment {
  /** Completed user turns so far in the session. */
  turnCount: number;
  /** How long the user has been talking in this turn, ms. */
  userSpeakingMs: number;
  /** Time since our last backchannel, ms. */
  sinceLastBackchannelMs: number;
  /** Time since the agent last stopped talking, ms. */
  sinceAgentSpokeMs: number;
  agentSpeaking: boolean;
  /** The user's words so far this turn (interim transcript). */
  partialTranscript: string;
  /** Distressed or intense moment: fewer, softer backchannels. */
  emotional: boolean;
}

export const BACKCHANNEL_POLICY = {
  minTurns: 1,
  minSpeakingMs: 2500,
  minIntervalMs: 5000,
  /** Right after the agent stops, a pause is the user taking the floor. */
  agentGraceMs: 1500,
  probability: 0.6,
  emotionalProbability: 0.4,
} as const;

export type BackchannelDecision = { play: true } | { play: false; reason: string };

export function decideBackchannel(
  m: BackchannelMoment,
  random: () => number = Math.random,
  policy: typeof BACKCHANNEL_POLICY = BACKCHANNEL_POLICY
): BackchannelDecision {
  if (m.agentSpeaking) return { play: false, reason: 'agent_speaking' };
  if (m.turnCount < policy.minTurns) return { play: false, reason: 'first_turn' };
  if (m.userSpeakingMs < policy.minSpeakingMs) return { play: false, reason: 'speaking_too_short' };
  if (m.sinceAgentSpokeMs < policy.agentGraceMs) return { play: false, reason: 'agent_just_spoke' };
  // Jittered so the rhythm is not metronomic.
  const interval = policy.minIntervalMs * (0.8 + random() * 0.4);
  if (m.sinceLastBackchannelMs < interval) return { play: false, reason: 'too_soon' };
  // A question wants an answer, not "mm-hm".
  if (/\?\s*$/.test(m.partialTranscript)) return { play: false, reason: 'question' };
  const p = m.emotional ? policy.emotionalProbability : policy.probability;
  if (random() >= p) return { play: false, reason: 'chance' };
  return { play: true };
}

/** Clips suited to mid-speech listening (no words that claim the floor). */
const NEUTRAL = ['Mm-hmm', 'Mhm', 'Yeah', 'Right', 'Mm'];
const SOFT = ['Mm', 'Mhm', 'Mm-hmm'];

/** Pick a clip text, avoiding the last one used. */
export function pickBackchannel(
  emotional: boolean,
  last: string | null,
  random: () => number = Math.random
): string {
  const pool = (emotional ? SOFT : NEUTRAL).filter((p) => p !== last);
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}

/** The pre-rendered laugh, in the persona's voice (conversational-audio-cache.ts). */
export const LAUGH_CLIP = '[laughter]';

export interface LaughMoment {
  partialTranscript: string;
  emotional: boolean;
  agentSpeaking: boolean;
  turnCount: number;
  /** Turn of the last laugh-along, or null if none this call. */
  lastLaughTurn: number | null;
}

/**
 * LAUGH_ALONG=on: when the caller laughs mid-turn, laugh with them instead of
 * an "mm-hm", the way a friend chuckles along. Not into emotion, not over
 * Ferni's own speech, and not two turns running (a laugh on cue is a tic).
 */
export function shouldLaughAlong(
  m: LaughMoment,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.LAUGH_ALONG !== 'on' || m.emotional || m.agentSpeaking) return false;
  if (m.lastLaughTurn !== null && m.turnCount - m.lastLaughTurn < 2) return false;
  return callerLaughed(m.partialTranscript);
}
