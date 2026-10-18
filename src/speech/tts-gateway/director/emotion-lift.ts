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
import { voiceHonorsProsodyTags } from '../../../config/voice-capabilities.js';
import {
  isHeavyMoment,
  noteCallerTurn,
  recentCallerTurns,
} from '../../adaptive-ssml/heavy-moment.js';
import { prosodyTags } from '../providers/cartesia.js';
import { layerDelivery, type Delivery, type DeliveryLayers } from './attune.js';
import {
  decideEmotion,
  readValence,
  toStableEmotion,
  type EmotionDecision,
  type EmotionInput,
  type StableEmotion,
  type Valence,
} from './emotion.js';
import { ferniRestingSpeed } from './ferni-resting-voice.js';
import { deliveryFromManifest } from './persona-delivery.js';
import type { LeverModes } from './types.js';

/** A laughter cue in the reply (raw-cues.ts LAUGHTER_CUE, plus Cartesia's own [laughter]). */
const LAUGHTER = /\[(?:laugh\w*|chuckl\w*|warm laugh|big laugh)\]/i;
/** Warm everyday words BRIGHT (emotion.ts) misses. Whole words only. */
const LIFT_BRIGHT = /\b(?:fun|funny|ha(?:ha)*|love|great news)\b/i;
/** Bright only when nothing in the reply reads as shock (SHOCK). */
const WOW = /\bwow\b/i;
/** Hard words in Ferni's own reply that readValence misses or needs two of. */
const REPLY_HEAVY =
  /\b(?:gone|awful|terrible|horrible|worried about you|sorry|hard|scary|fired|laid off)\b/i;
/** Shock or sarcasm, not delight: "Wow. He really said that to you?", "Oh great, ...". */
const SHOCK =
  /\b(?:really said|said that|did that|can'?t believe|oh no|yikes|ugh|seriously)\b|\boh,? great\b/i;
/** A bright word negated a few words before it: "not funny", "doesn't sound like fun". */
const NEGATED =
  /\b(?:not|no|never|hardly|\w+n't)\b(?:\s+\w+){0,3}?\s+(?:fun|funny|love|great|amazing|wonderful|awesome|fantastic|brilliant|incredible)\b/i;
/** Replies that keep the Director's own pace and tone. */
const CAREFUL: ReadonlySet<StableEmotion | undefined> = new Set([
  'sympathetic',
  'calm',
  'contemplative',
]);
/** How much of FERNI_VOICE_SPEED's lift a non-bright reply keeps. */
export const RESTING_SHARE = 0.4;
/** Cartesia's speed is never pushed past this, whatever FERNI_VOICE_SPEED says. */
const SPEED_CEILING = 1.2;

/** What the lift reads besides the opening phrase. */
export interface LiftContext {
  /** The caller's last turns (heavy-moment.ts) say something hard. */
  callerHeavy: boolean;
  /** The raw reply so far and the LLM's own emotion tag (raw-cues.ts). */
  cues: { readonly streamed: string; readonly authoredEmotion?: string };
  /** Tags the voice will honour on a later push (live levers, not a Pro clone). */
  tags: { emotion: boolean; pacing: boolean };
}

interface Reading {
  valence: Valence;
  bright: boolean;
  careful: boolean;
}

const plain = (text: string): string => text.replace(/[\u2018\u2019]/g, "'");

/** Hard words anywhere in this text (Ferni's own reply). */
function heavyText(text: string): boolean {
  const t = plain(text);
  return readValence(t) === 'heavy' || REPLY_HEAVY.test(t) || isHeavyMoment([t]);
}

/** One reply's lift: decided at the opening, read by the pace and the tag renderer. */
export class EmotionLift {
  /** The reply is lifted: bright words, nothing hard (set when the opening is decided). */
  bright = false;
  private careful = false;
  private reading: Reading | undefined;
  private settled = false;
  /** The Director's own pace for this reply, without the lift (for settle). */
  private ownSpeed = 1;

  /** `speed`: FERNI_VOICE_SPEED, when set: the bright pace and the cap. */
  constructor(
    private readonly context: LiftContext,
    readonly speed?: number
  ) {}

  /**
   * How the reply reads. Hard first: a hard moment for the caller, or the
   * LLM's own careful tag, keeps the Director's reading and is never lifted;
   * hard words anywhere in the reply so far make it heavy. Then a negated or
   * shocked bright word is not bright. Only then do laughter and the wider
   * bright words lift.
   */
  valence(openingText: string): Valence {
    this.reading ??= this.read(openingText);
    return this.reading.valence;
  }

  private read(opening: string): Reading {
    const base = readValence(opening);
    const reply = plain(`${opening} ${this.context.cues.streamed}`);
    const authored = toStableEmotion(this.context.cues.authoredEmotion);
    if (this.context.callerHeavy || (authored && CAREFUL.has(authored))) {
      return { valence: base, bright: false, careful: true };
    }
    if (base === 'heavy' || heavyText(reply))
      return { valence: 'heavy', bright: false, careful: true };
    if (NEGATED.test(reply) || SHOCK.test(reply)) {
      return { valence: base === 'bright' ? 'neutral' : base, bright: false, careful: false };
    }
    const bright =
      base === 'bright' || LAUGHTER.test(reply) || LIFT_BRIGHT.test(reply) || WOW.test(reply);
    return { valence: bright ? 'bright' : base, bright, careful: false };
  }

  /**
   * The Director's tone from the lifted reading. A bright reply takes its tone
   * from its words, which rank above the previous reply's (emotion.ts choose),
   * so a sympathetic or calm turn no longer carries into it; and curious (the
   * LLM's or the caller's) gives way to the resting tone.
   */
  decide(input: EmotionInput): EmotionDecision {
    const reading = (this.reading ??= this.read(input.openingText));
    const decision = decideEmotion({ ...input, valence: reading.valence });
    this.careful = reading.careful || CAREFUL.has(decision.emotion);
    this.bright = reading.bright && !this.careful;
    return this.bright && decision.emotion === 'curious'
      ? { emotion: 'content', source: 'lift' }
      : decision;
  }

  /** The reply's pace: bright at FERNI_VOICE_SPEED, careful at the Director's own, the rest between. */
  deliver(layers: DeliveryLayers, pacingLive: boolean): Delivery {
    const { speed } = this;
    const own = layerDelivery({ ...layers, persona: undefined }, pacingLive);
    this.ownSpeed = own.speed;
    if (speed === undefined) return layerDelivery(layers, pacingLive);
    if (this.careful) return own;
    const base = this.bright ? speed : 1 + (speed - 1) * RESTING_SHARE;
    const persona = deliveryFromManifest('ferni', { default_speed: base });
    const delivery = layerDelivery({ ...layers, persona }, pacingLive);
    return delivery.speed > speed ? { ...delivery, speed } : delivery;
  }

  /** An opening speed (a soft start composed with the reply's) never above FERNI_VOICE_SPEED or 1.2. */
  cap(speed: number | undefined): number | undefined {
    if (speed === undefined || this.speed === undefined) return speed;
    return Math.min(speed, this.speed, SPEED_CEILING);
  }

  /**
   * A later push of a lifted reply whose words turn hard ("Ha, I hear you.
   * That sounds really hard."): settle once to sympathetic at the Director's
   * own pace. The opening is decided before the whole reply has streamed, so
   * this catches what it could not see.
   */
  settle(tags: string, body: string): string {
    if (!this.bright || this.settled || !heavyText(body)) return `${tags}${body}`;
    this.settled = true;
    const { emotion, pacing } = this.context.tags;
    const settle = prosodyTags({
      speed: pacing ? this.ownSpeed : undefined,
      emotion: emotion ? 'sympathetic' : undefined,
    });
    return `${tags}${settle}${body}`;
  }
}

/** Who the reply is for, as reply-director has it. */
export interface LiftOptions {
  personaId?: string;
  sessionId?: string;
  voiceId: string;
  turnContext?: { userRequest?: string };
  env?: Env;
}

/** The lift for this reply: Ferni with EMOTION_LIFT on, else undefined. */
export function emotionLift(
  opts: LiftOptions,
  cues: LiftContext['cues'],
  modes: LeverModes
): EmotionLift | undefined {
  const env = opts.env ?? process.env;
  if (opts.personaId !== 'ferni' || !flagOn('EMOTION_LIFT', env)) return undefined;
  const said = opts.turnContext?.userRequest;
  if (opts.sessionId) noteCallerTurn(opts.sessionId, said);
  const turns = opts.sessionId ? recentCallerTurns(opts.sessionId) : [said];
  const honours = voiceHonorsProsodyTags(opts.voiceId);
  const tags = {
    emotion: honours && modes.emotion === 'live',
    pacing: honours && modes.pacing === 'live',
  };
  return new EmotionLift({ callerHeavy: isHeavyMoment(turns), cues, tags }, ferniRestingSpeed(env));
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

/** A later push's tags and body, settled when a lifted reply turns hard. */
export function settleLift(lift: EmotionLift | undefined, tags: string, body: string): string {
  return lift ? lift.settle(tags, body) : `${tags}${body}`;
}
