/**
 * EMOTION_LIFT (off by default): Ferni rests calm and lifts on bright words.
 *
 * Seth's "lively" pick (2026-10-17: calm B, excited at 1.08) was rarely heard
 * through the Director as it stood (prod audit, 385 replies):
 * - BRIGHT (emotion.ts) missed laughter and everyday warm words (fun, funny,
 *   ha, love, wow, great news), so few turns read as bright;
 * - curious was 42% of picks and outranked a resting tone on a question;
 * - the previous reply's emotion carried into 61% of replies, so a
 *   sympathetic or calm turn kept colouring the bright turns after it.
 *
 * With the flag on, for Ferni only:
 * - laughter in the reply makes it bright (a laughing line is never voiced
 *   sympathetic); otherwise heavy words still win, then the wider bright
 *   words;
 * - a bright reply takes its tone from its words, so a carried sympathetic
 *   or calm is dropped, and curious gives way to the resting tone, so
 *   FERNI_VOICE_EMOTION is voiced there
 *   (ferni-resting-voice.ts). Only bright replies get it: a neutral reply
 *   keeps the Director's own tone, so the lift is a contrast, not a register;
 * - pace: bright replies rest at FERNI_VOICE_SPEED, other non-heavy replies
 *   at 1 + (speed - 1) x 0.4 (about 1.03 for 1.08), and heavy or careful
 *   replies (sympathetic, calm, contemplative) at the Director's own 1.0.
 *   No reply goes faster than FERNI_VOICE_SPEED.
 *
 * Why big emotions were excluded: on 2026-09-27 emotion tags on Ferni's then
 * instant clone swung his pitch range 6.4-10.9 semitones between turns
 * (docs/plans/2026-09-27-human-level-ferni.md, emotion.ts STABLE_EMOTIONS).
 * The guards here: the upbeat tone goes only on replies whose words are
 * bright (Cartesia honours an emotion only when the words carry it), one
 * emotion per reply (later tags are still stripped), never on heavy or
 * careful replies, and the pace is capped at FERNI_VOICE_SPEED (at most 1.2).
 *
 * @module speech/tts-gateway/director/emotion-lift
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { layerDelivery, type Delivery, type DeliveryLayers } from './attune.js';
import { decideEmotion, readValence, type EmotionDecision, type EmotionInput } from './emotion.js';
import type { StableEmotion, Valence } from './emotion.js';
import { ferniRestingSpeed } from './ferni-resting-voice.js';
import { deliveryFromManifest } from './persona-delivery.js';

/** A laughter cue in the reply (raw-cues.ts LAUGHTER_CUE, plus Cartesia's own [laughter]). */
const LAUGHTER = /\[(?:laugh\w*|chuckl\w*|warm laugh|big laugh)\]/i;
/** Warm everyday words BRIGHT (emotion.ts) misses. Whole words only. */
const LIFT_BRIGHT = /\b(?:fun|funny|ha(?:ha)*|love|wow|great news)\b/i;
/** Replies that keep the Director's own resting pace. */
const CAREFUL: ReadonlySet<StableEmotion | undefined> = new Set([
  'sympathetic',
  'calm',
  'contemplative',
]);
/** How much of FERNI_VOICE_SPEED's lift a non-bright reply keeps. */
export const RESTING_SHARE = 0.4;

/** One reply's lift: decided at the opening, read by the pace and the tag renderer. */
export class EmotionLift {
  /** The reply's words read bright (set when the opening is decided). */
  bright = false;
  private careful = false;

  /** FERNI_VOICE_SPEED, when set: the bright pace and the cap. */
  constructor(readonly speed?: number) {}

  /** The reply's valence: laughter, then heavy words, then the wider bright words. */
  valence(text: string): Valence {
    if (LAUGHTER.test(text)) return 'bright';
    const base = readValence(text);
    if (base === 'heavy') return base;
    return LIFT_BRIGHT.test(text) ? 'bright' : base;
  }

  /**
   * The Director's tone from the lifted valence. A bright reply takes its tone
   * from its words, which rank above the previous reply's (emotion.ts choose),
   * so a sympathetic or calm turn no longer carries into it; and curious (the
   * LLM's or the caller's) gives way to the resting tone.
   */
  decide(input: EmotionInput): EmotionDecision {
    const valence = this.valence(input.openingText);
    this.bright = valence === 'bright';
    const decision = decideEmotion({ ...input, valence });
    this.careful = valence === 'heavy' || CAREFUL.has(decision.emotion);
    return this.bright && decision.emotion === 'curious'
      ? { emotion: 'content', source: 'lift' }
      : decision;
  }

  /** The reply's pace: bright at FERNI_VOICE_SPEED, careful at 1, the rest between; never above it. */
  deliver(layers: DeliveryLayers, pacingLive: boolean): Delivery {
    const { speed } = this;
    if (speed === undefined) return layerDelivery(layers, pacingLive);
    const base = this.careful ? undefined : this.bright ? speed : 1 + (speed - 1) * RESTING_SHARE;
    const persona =
      base === undefined ? undefined : deliveryFromManifest('ferni', { default_speed: base });
    const delivery = layerDelivery({ ...layers, persona }, pacingLive);
    return delivery.speed > speed ? { ...delivery, speed } : delivery;
  }
}

/** The lift for this reply: Ferni with EMOTION_LIFT on, else undefined. */
export function emotionLift(
  personaId: string | undefined,
  env: Env = process.env
): EmotionLift | undefined {
  if (personaId !== 'ferni' || !flagOn('EMOTION_LIFT', env)) return undefined;
  return new EmotionLift(ferniRestingSpeed(env));
}

/** The reply's valence, lifted when EMOTION_LIFT is on. */
export function liftedValence(lift: EmotionLift | undefined, text: string): Valence {
  return lift ? lift.valence(text) : readValence(text);
}

/** The reply's tone, lifted when EMOTION_LIFT is on. */
export function decideTone(lift: EmotionLift | undefined, input: EmotionInput): EmotionDecision {
  return lift ? lift.decide(input) : decideEmotion(input);
}

/** The reply's pace, lifted when EMOTION_LIFT is on. */
export function liftedDelivery(
  lift: EmotionLift | undefined,
  layers: DeliveryLayers,
  pacingLive: boolean
): Delivery {
  return lift ? lift.deliver(layers, pacingLive) : layerDelivery(layers, pacingLive);
}
