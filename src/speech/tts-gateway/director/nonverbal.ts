/**
 * The reply's opening breath or sigh (SPEECH_DIRECTOR_NONVERBAL, opt-in).
 *
 * Cartesia has no breath or sigh, so the Director only decides; Stage 2
 * renders it before the first word (speech/reply-audio-plan.ts). One decision
 * per reply, from its opening:
 * - sigh: the reply opens with a sigh cue (the LLM's *sighs* / [sigh] /
 *   (sighs), or the behavior tool's `<emotion value="gentle"/>Ahh.`), or the
 *   reply is heavy AND the user's turn was heavy (both read by readValence);
 * - breath: the reply's first sentence is long (LONG_SENTENCE_WORDS), or the
 *   user just spoke at length (LONG_USER_TURN_WORDS): a speaker inhales
 *   before a long phrase, and after listening to one;
 * - never both (a sigh wins); a session gets at most one sigh in any
 *   SIGH_EVERY replies and one breath in any BREATH_EVERY, so neither becomes
 *   a tic.
 * The sigh is rendered at the voice's median f0 when it is known.
 *
 * @module speech/tts-gateway/director/nonverbal
 */

import { voiceMedianF0Hz } from '../../../config/voice-capabilities.js';
import type { ReplyAudioPlan } from '../../reply-audio-plan.js';
import { readValence } from './emotion.js';

export const LONG_SENTENCE_WORDS = 16;
export const LONG_USER_TURN_WORDS = 25;
/** The first sentence is read for a late breath for at most this many characters. */
export const FIRST_SENTENCE_WATCH_CHARS = 200;
/** At most one sigh in any 4 consecutive replies, one breath in any 3. */
export const SIGH_EVERY = 4;
export const BREATH_EVERY = 3;
/** Intensities stay in 0.5-0.7: audible, never louder than the speech after them. */
const SIGH_INTENSITY = 0.6;
const BREATH_INTENSITY = 0.5;

export type Opening = NonNullable<ReplyAudioPlan['opening']>;

/** Replies since the session's last sigh / breath (absent: none yet). */
export interface NonverbalCarry {
  sinceSigh?: number;
  sinceBreath?: number;
}

export interface OpeningInput {
  /** The reply's first phrase, cleaned. */
  openingText: string;
  /** The raw reply opened with a sigh cue (raw-cues.ts). */
  opensWithSigh: boolean;
  /** The user's words this reply answers. */
  userText?: string;
  voiceId: string;
  carry: NonverbalCarry;
}

export interface OpeningDecision {
  opening?: Opening;
  reason: 'cue' | 'heavy' | 'long-sentence' | 'long-user-turn' | 'cooldown' | 'none';
}

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Words in the first sentence (all of `text` when it has no sentence end yet). */
function firstSentenceWords(text: string): number {
  const end = /[.!?](?=\s|$)/.exec(text);
  return words(end ? text.slice(0, end.index + 1) : text).length;
}

const cooled = (since: number | undefined, every: number): boolean =>
  since === undefined || since >= every - 1;

export function decideOpening(input: OpeningInput): OpeningDecision {
  const { openingText, opensWithSigh, userText = '', carry } = input;
  const heavy = readValence(openingText) === 'heavy' && readValence(userText) === 'heavy';
  const sighReason = opensWithSigh ? 'cue' : heavy ? 'heavy' : undefined;
  const sighOk = cooled(carry.sinceSigh, SIGH_EVERY);
  if (sighReason && sighOk) {
    const f0Hz = voiceMedianF0Hz(input.voiceId);
    const opening: Opening = { kind: 'sigh', intensity: SIGH_INTENSITY };
    if (f0Hz !== undefined) opening.f0Hz = f0Hz;
    return { opening, reason: sighReason };
  }
  const breathReason =
    firstSentenceWords(openingText) >= LONG_SENTENCE_WORDS
      ? 'long-sentence'
      : words(userText).length >= LONG_USER_TURN_WORDS
        ? 'long-user-turn'
        : undefined;
  if (breathReason && cooled(carry.sinceBreath, BREATH_EVERY)) {
    return { opening: { kind: 'breath', intensity: BREATH_INTENSITY }, reason: breathReason };
  }
  return { reason: sighReason || breathReason ? 'cooldown' : 'none' };
}

/** True once `text` contains the end of its first sentence. */
export function firstSentenceEnded(text: string): boolean {
  return /[.!?](?=\s|$)/.test(text);
}

/**
 * A breath decided after the opening: the reply's first push is often only a
 * few words (it goes out at once, review M3), so the first sentence is read
 * as it streams. A breath once it reaches LONG_SENTENCE_WORDS, within the
 * breath cooldown; the caller never asks after an opening was decided.
 */
export function decideLateBreath(
  firstSentence: string,
  carry: NonverbalCarry
): Opening | undefined {
  if (firstSentenceWords(firstSentence) < LONG_SENTENCE_WORDS) return undefined;
  if (!cooled(carry.sinceBreath, BREATH_EVERY)) return undefined;
  return { kind: 'breath', intensity: BREATH_INTENSITY };
}

/** The carry-over after this reply: reset what played, count the rest. */
export function nextNonverbalCarry(carry: NonverbalCarry, played?: Opening): NonverbalCarry {
  const bump = (n: number | undefined): number | undefined => (n === undefined ? n : n + 1);
  return {
    sinceSigh: played?.kind === 'sigh' ? 0 : bump(carry.sinceSigh),
    sinceBreath: played?.kind === 'breath' ? 0 : bump(carry.sinceBreath),
  };
}

/** The behavior tool's sigh leaves "Ahh." as speech; with the lever live it is the sigh. */
const SPOKEN_SIGH = /^\s*ahh+[.!,]?\s*/i;

export function stripSpokenSigh(text: string): string {
  return text.replace(SPOKEN_SIGH, '');
}
