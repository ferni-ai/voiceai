/**
 * EMOTION_LIFT (off by default): Ferni lifts when the CALLER brings something
 * bright, and otherwise rests calm.
 *
 * Seth's "lively" pick (2026-10-17: calm B, excited at 1.08) was rarely heard
 * through the Director (prod audit, 385 replies): curious was 42% of picks,
 * the previous reply's emotion carried into 61%, and BRIGHT missed laughter.
 *
 * Caller-led, because the caller's turn is fully known before Ferni speaks,
 * while Ferni's own reply is not: in production the first push is cut at the
 * first clause ("Ha. I'm so s"), so a lift judged on Ferni's words leaked
 * (two review rounds on #1830: "Wow, how is she doing now?" after a relapse,
 * "You worked so hard" flipping a congratulations to sympathetic).
 *
 * With the flag on, for Ferni only, a reply is lifted when all hold:
 * - the caller's turn is bright: good news, or a laugh with something they
 *   call funny, or bright words; never bad-news, negated, shocked or
 *   sarcastic words ("lol great"), and a laugh alone is not enough;
 * - none of the caller's last three turns (this one and the two before) is a
 *   heavy moment (heavy-moment.ts) or has bad-news words;
 * - the LLM did not tag the reply sympathetic, calm or contemplative;
 * - the reply's first clause has no hard, negated or shocked words (biopsy,
 *   ER, hospital, results, "miss him", gone, sorry...).
 * A lifted reply reads bright: the Director's tone comes from that (so a
 * carried sympathetic or calm cannot reach it), curious gives way, and
 * FERNI_VOICE_EMOTION is voiced (ferni-resting-voice.ts). Lifted replies go
 * at FERNI_VOICE_SPEED, every push capped at min(FERNI_VOICE_SPEED, 1.2).
 *
 * Any other reply is sent exactly as with no overrides: no pace change, no
 * tone (one exception: a laughing line is never voiced a carried
 * sympathetic, it becomes calm).
 *
 * Mid-reply, a lifted reply is downgraded only by strong heavy wording
 * (isHeavyMoment on the push, or "I'm so sorry"-style care, minus joyful
 * idioms like "crying laughing" or "fired up"): sympathetic, and the
 * Director's own pace for the rest of the reply. Bare words ("so hard for
 * this") never flip it.
 *
 * Why big emotions were excluded: on 2026-09-27 emotion tags on Ferni's then
 * instant clone swung his pitch range 6.4-10.9 semitones between turns
 * (docs/plans/2026-09-27-human-level-ferni.md, emotion.ts STABLE_EMOTIONS).
 * The guards: the upbeat tone only follows a bright caller, one emotion per
 * reply (later tags are still stripped), never on heavy or careful replies,
 * and the pace is capped.
 *
 * @module speech/tts-gateway/director/emotion-lift
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { voiceHonorsProsodyTags } from '../../../config/voice-capabilities.js';
import { isHeavyMoment } from '../../adaptive-ssml/heavy-moment.js';
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
import type { SSMLProsodyConfig } from '../types.js';
import type { LeverModes } from './types.js';

const log = createLogger({ module: 'EmotionLift' });

/** A laughter cue Ferni wrote (raw-cues.ts LAUGHTER_CUE, plus Cartesia's own [laughter]). */
const LAUGHTER = /\[(?:laugh\w*|chuckl\w*|warm laugh|big laugh)\]/i;
/** The caller laughed. */
const CALLER_LAUGH =
  /\b(?:ha(?:ha)+|he(?:he)+|lol+|lmao|rofl|hilarious|crack(?:ed|ing) up|(?:crying|dying) laughing)\b|[\u{1F602}\u{1F923}]/iu;
/**
 * The caller brings good news, theirs or someone's they love ("my friend got
 * the job"). Also GOOD_NEWS_BIGGER's vocabulary (callerGoodNews).
 */
const GOOD_NEWS =
  /\b(?:good news|great news|best news|(?:we're|we are|i'm|i am|just got|got) engaged|getting married|got married|i got (?:it|in|the (?:job|offer|part|apartment|house))|got (?:in|accepted|promoted|the (?:job|offer|role|promotion|raise|scholarship)|a (?:raise|promotion|scholarship))|passed (?:my|the|her|his) (?:exam|test|bar|boards|driving test)|graduated|(?:i|we) won|won (?:the|first)|first place|made the (?:team|cut|finals)|landed (?:the|a|my) (?:job|role|client|deal|contract|offer)|(?:finally )?finished (?:my|the|our) (?:first )?(?:marathon|race|thesis|dissertation|degree|book|novel)|pulled it off|closed on (?:the|our|a) (?:house|home|apartment|place)|bought a (?:house|home|place)|nailed it|so excited|so happy|can'?t wait)\b/i;
/** The caller says something is funny: with a laugh, that is bright content. */
const FUNNY = /\b(?:funny|funniest|hilarious|so good|best (?:thing|part))\b/i;
/** Weak praise next to a sarcasm marker, either side: "lol great", "great, of course". */
const SARCASM =
  /\b(?:lol|ugh|sure|yeah right|of course)\b\W+(?:\w+\W+)?(?:great|nice|perfect|awesome|love that)\b|\b(?:great|nice|perfect|awesome|love that)\b\W+(?:\w+\W+)?(?:lol|ugh|sure|yeah right|of course)\b/i;
/** Bad news or a hard day in the caller's turn: never a bright turn, whatever else it says. */
const CALLER_BAD =
  /\b(?:awful|terrible|horrible|sucks?|worst|hate|yelled|screamed|angry|mad at|upset|sad|stressed|anxious|worried|scared|(?:rough|hard|bad|long) day|exhausted|sick|hurt|lost|failed|rejected|cancell?ed|crashed|accident|fight|argument|lazy|stupid|idiot|called me|rude|mean to me|insult\w*|relaps\w*|surgery|rehab|biopsy|cried|miss (?:him|her|them)|hospital|diagnos\w*)\b/i;
/** Hard words in Ferni's first clause that readValence misses or needs two of. */
const CLAUSE_HEAVY =
  /\b(?:gone|awful|terrible|horrible|worried about you|sorry|hard|scary|fired|laid off|biopsy|hospital|scans?|results|miss (?:him|her|them))\b/i;
/** The emergency room, upper case only ("ER", never "er"). */
const ER = /\bER\b/;
/** Shock or sarcasm, not delight: "really said that", "oh great". */
const SHOCK =
  /\b(?:really said|said that|did that|can'?t believe|oh no|yikes|ugh|seriously)\b|\boh,? great\b/i;
/** A bright word negated a few words before it: "not funny", "doesn't sound like fun". */
const NEGATED =
  /\b(?:not|no|never|hardly|\w+n't)\b(?:\s+\w+){0,3}?\s+(?:fun|funny|love|great|amazing|wonderful|awesome|fantastic|brilliant|incredible|good)\b/i;
/** Idioms that read heavy word by word but are joy: stripped before the heavy check. */
const BENIGN =
  /\b(?:(?:crying|cried|dying|died) (?:laughing|of laughter)|tears of joy|happy tears|fired up|laughed so hard)\b/gi;
/** Care wording strong enough to settle a reply mid-way: "I'm so sorry", "that sounds really hard". */
const STRONG_CARE =
  /\b(?:i'?m|i am) (?:so |really |truly )?sorry\b(?!,? (?:i'?m late|for the wait|to interrupt))|\b(?:sounds|must be|must have been|that's|that is) (?:so |really |incredibly )?(?:hard|awful|terrible|painful|scary|rough|heartbreaking)\b(?!\s+(?:question|call|choice|decision))/i;
/** Replies that keep the Director's own pace and tone. */
const CAREFUL: ReadonlySet<StableEmotion | undefined> = new Set([
  'sympathetic',
  'calm',
  'contemplative',
]);
/** How many of the caller's turns a heavy one blocks the lift for: that turn and the next two. */
export const LIFT_LOOKBACK = 3;
/** Cartesia's speed is never pushed past this, whatever FERNI_VOICE_SPEED says. */
const SPEED_CEILING = 1.2;
const SPEED_TAG = /<speed ratio="([\d.]+)"\s*\/>/g;

const plain = (text: string): string => text.replace(/[\u2018\u2019]/g, "'");
/** The text with joyful idioms ("crying laughing", "fired up") taken out, for the heavy checks. */
const unidiom = (text: string): string => plain(text).replace(BENIGN, ' ');
/** isHeavyMoment, idioms aside. */
const strongHeavy = (texts: ReadonlyArray<string | undefined>): boolean =>
  isHeavyMoment(
    texts.map((t) => (t === undefined ? t : unidiom(t))),
    { lookback: LIFT_LOOKBACK }
  );

/** Ferni's own push turns hard: strong heavy wording or care wording, idioms aside. */
const turnsHard = (text: string): boolean => strongHeavy([text]) || STRONG_CARE.test(unidiom(text));

/** The caller's turn is bright: a laugh, good news or bright words, and nothing bad, negated or shocked. */
export function callerBright(said: string | undefined): boolean {
  if (!said) return false;
  const t = plain(said);
  const hard = unidiom(said);
  if (CALLER_BAD.test(hard) || NEGATED.test(t) || SHOCK.test(t) || SARCASM.test(t)) return false;
  if (readValence(hard) === 'heavy') return false;
  if (GOOD_NEWS.test(t)) return true;
  // A laugh needs something the caller calls funny: a laugh alone ("haha
  // guess what") is not bright content, and weak praise beside a laugh reads
  // as sarcasm ("lol great"), so it does not count.
  if (CALLER_LAUGH.test(t)) return FUNNY.test(t);
  return readValence(t) === 'bright';
}

/** Mixed news: a win with a "but" ("I got promoted but my mom is sick"). */
const MIXED = /\b(?:but|though|although|except|however)\b/i;
/** Not news yet: "if I get in", "hoping I passed". */
const NOT_YET = /\b(?:if|hope|hoping|wish|whether|praying|fingers crossed)\b/i;
/** Irony markers SARCASM misses when no weak praise is near ("yeah right, I got promoted"). */
const IRONY = /\b(?:yeah,? right|as if|lol|lmao|whatever)\b/i;
/** "got in" that is not getting in: "got in the car", "got in trouble". */
const GOT_INTO = /\bgot in (?:the|a|an|my|his|her|their|our|trouble|line)\b/i;

/** Any of these caller turns is a heavy moment or has bad-news words (idioms aside). */
export function callerHeavyLately(turns: ReadonlyArray<string | undefined>): boolean {
  return strongHeavy(turns) || turns.some((t) => !!t && CALLER_BAD.test(unidiom(t)));
}

/**
 * GOOD_NEWS_BIGGER: the caller's turn is good news, read conservatively. A
 * bright turn (callerBright) whose words are news, with no "but", nothing
 * hoped for, no irony, and no heavy or bad turn among the caller's last
 * LIFT_LOOKBACK (`earlier` is their turns before this one, oldest first).
 */
export function callerGoodNews(said: string | undefined, earlier: readonly string[] = []): boolean {
  if (!said || !callerBright(said)) return false;
  const t = plain(said);
  if (!GOOD_NEWS.test(t) || GOT_INTO.test(t)) return false;
  if (MIXED.test(t) || NOT_YET.test(t) || IRONY.test(t)) return false;
  return !callerHeavyLately([...earlier.slice(-(LIFT_LOOKBACK - 1)), said]);
}

/** What the lift knows before Ferni speaks. */
export interface LiftContext {
  /** The caller's current turn is bright (callerBright). */
  callerBright: boolean;
  /** One of the caller's last three turns is a heavy moment or bad news. */
  callerHeavy: boolean;
  /** The LLM's own emotion tag (raw-cues.ts). */
  cues: { readonly authoredEmotion?: string };
  /** Tags the voice will honour on a later push (live levers, not a Pro clone). */
  tags: { emotion: boolean; pacing: boolean };
  /** For the EMOTION_LIFT log line: never the caller's words, only their length and source. */
  report: { sessionId?: string; callerTextLen: number; callerTextIsThisTurn: boolean };
}

/** Why a reply was or was not lifted (the EMOTION_LIFT log line). */
export type LiftReason =
  | 'lifted'
  | 'authored_careful'
  | 'first_clause_hard'
  | 'first_clause_wary'
  | 'heavy_moment'
  | 'no_caller_text'
  | 'caller_not_bright'
  | 'director_careful';

interface Reading {
  valence: Valence;
  lifted: boolean;
  careful: boolean;
  reason: LiftReason;
}

/** One reply's lift: decided at the opening, read by the pace, the tag renderer and each push. */
export class EmotionLift {
  /** The reply is lifted and not downgraded (the tag renderer reads it at the opening). */
  bright = false;
  private careful = false;
  private reading: Reading | undefined;
  private downgraded = false;
  private logged = false;
  /** The Director's own pace for this reply, without the lift (a downgrade's pace). */
  private ownSpeed = 1;

  /** `speed`: FERNI_VOICE_SPEED, when set: the lifted pace and the cap. */
  constructor(
    private readonly context: LiftContext,
    readonly speed?: number
  ) {}

  /** How the reply reads: bright when lifted, else the Director's own reading. */
  valence(openingText: string): Valence {
    this.reading ??= this.read(openingText);
    return this.reading.valence;
  }

  private read(opening: string): Reading {
    const clause = plain(opening);
    const base = readValence(clause);
    const heavy =
      base === 'heavy' || CLAUSE_HEAVY.test(clause) || ER.test(clause) || strongHeavy([clause]);
    const authored = toStableEmotion(this.context.cues.authoredEmotion);
    const wary = NEGATED.test(clause) || SHOCK.test(clause); // "oh no", "not funny": bad news ahead
    const authoredCareful = !!authored && CAREFUL.has(authored);
    const careful = heavy || wary || this.context.callerHeavy || authoredCareful;
    const lifted = this.context.callerBright && !careful;
    const reason = this.why(lifted, { authoredCareful, heavy, wary });
    return { valence: lifted ? 'bright' : base, lifted, careful, reason };
  }

  private why(
    lifted: boolean,
    c: { authoredCareful: boolean; heavy: boolean; wary: boolean }
  ): LiftReason {
    if (lifted) return 'lifted';
    if (c.authoredCareful) return 'authored_careful';
    if (c.heavy) return 'first_clause_hard';
    if (c.wary) return 'first_clause_wary';
    if (this.context.callerHeavy) return 'heavy_moment';
    return this.context.report.callerTextLen === 0 ? 'no_caller_text' : 'caller_not_bright';
  }

  /**
   * The Director's tone from the reading. A lifted reply reads bright, and its
   * words rank above the previous reply's tone (emotion.ts choose), so a
   * carried sympathetic or calm cannot reach it; curious gives way to the
   * resting tone. A laughing line is never voiced a carried sympathetic.
   */
  decide(input: EmotionInput): EmotionDecision {
    const reading = (this.reading ??= this.read(input.openingText));
    const decision = decideEmotion({ ...input, valence: reading.valence });
    this.careful = reading.careful || CAREFUL.has(decision.emotion);
    this.bright = reading.lifted && !this.careful;
    // No live lever renders an opening tag (engine.ts openingTags): log what was decided now.
    if (!this.context.tags.emotion && !this.context.tags.pacing) this.sent({});
    if (this.bright && decision.emotion === 'curious')
      return { emotion: 'content', source: 'lift' };
    const carried = decision.source === 'previous' && decision.emotion === 'sympathetic';
    return carried && LAUGHTER.test(input.openingText)
      ? { emotion: 'calm', source: 'lift' }
      : decision;
  }

  /** The reply's pace: lifted at FERNI_VOICE_SPEED; any other reply exactly the Director's own. */
  deliver(layers: DeliveryLayers, pacingLive: boolean): Delivery {
    const { speed } = this;
    const own = layerDelivery({ ...layers, persona: undefined }, pacingLive);
    this.ownSpeed = own.speed;
    if (speed === undefined || !this.bright) return own;
    const persona = deliveryFromManifest('ferni', { default_speed: speed });
    return layerDelivery({ ...layers, persona }, pacingLive); // every push is capped (push, cap)
  }

  /**
   * One EMOTION_LIFT line per reply, with what the opening actually sends
   * (called by the tag renderer, ferni-resting-voice.ts).
   */
  sent(prosody: SSMLProsodyConfig): void {
    if (this.logged) return;
    this.logged = true;
    const { report } = this.context;
    const decided = this.reading?.reason;
    log.info(
      {
        sessionId: report.sessionId,
        lifted: this.lifted,
        // A lifted reading the Director then voiced careful (its own tag or hint).
        reason: decided === 'lifted' && !this.lifted ? 'director_careful' : decided,
        sentEmotion: prosody.emotion,
        sentSpeed: prosody.speed,
        callerTextLen: report.callerTextLen,
        callerTextIsThisTurn: report.callerTextIsThisTurn,
      },
      'EMOTION_LIFT'
    );
  }

  /** A lifted reply's speed, never above FERNI_VOICE_SPEED (when set) or 1.2; others untouched. */
  cap(speed: number | undefined): number | undefined {
    if (speed === undefined || !this.lifted) return speed;
    return Math.min(speed, this.speed ?? SPEED_CEILING, SPEED_CEILING);
  }

  /** The reply was lifted at its opening (a later downgrade does not undo the cap). */
  private get lifted(): boolean {
    return this.reading?.lifted === true && !this.careful;
  }

  /**
   * One push as it goes to Cartesia. Only a lifted reply is touched: a push
   * that says something strongly heavy (isHeavyMoment, or care wording like
   * "I'm so sorry") downgrades it once, to sympathetic at the Director's own
   * pace from there to the end; and every speed tag is capped.
   */
  push(text: string, first: boolean): string {
    if (!this.lifted) return text;
    let out = text;
    if (!first && !this.downgraded && turnsHard(text)) {
      this.downgraded = true;
      this.bright = false;
      const { emotion, pacing } = this.context.tags;
      const speedTag = pacing ? `<speed ratio="${this.ownSpeed}"/>` : '';
      out = `${speedTag}${emotion ? '<emotion value="sympathetic"/>' : ''}${text}`;
    }
    return out.replace(SPEED_TAG, (_, ratio: string) => {
      const speed = this.downgraded ? this.ownSpeed : (this.cap(Number(ratio)) ?? 1);
      return `<speed ratio="${speed}"/>`;
    });
  }
}

/** The caller's last LIFT_LOOKBACK turns per session, oldest first (bounded, least recent evicted). */
const turnsBySession = new Map<string, string[]>();
const MAX_SESSIONS = 500;

/**
 * Note the caller's turn and return the session's latest turns. The same
 * words again, or a final transcript extending a partial, replace the latest
 * turn (several replies can answer one turn).
 */
function noteTurn(sessionId: string, said: string | undefined): readonly string[] {
  const turns = turnsBySession.get(sessionId) ?? [];
  const text = said?.trim();
  const last = turns.at(-1);
  if (text && last !== undefined && (text === last || text.startsWith(last))) {
    turns[turns.length - 1] = text;
  } else if (text) turns.push(text);
  turnsBySession.delete(sessionId); // re-insert: the map's order is least recently used first
  turnsBySession.set(sessionId, turns.slice(-LIFT_LOOKBACK));
  if (turnsBySession.size > MAX_SESSIONS) {
    const oldest = turnsBySession.keys().next().value;
    if (oldest !== undefined) turnsBySession.delete(oldest);
  }
  return turnsBySession.get(sessionId) ?? [];
}

/** Forget a session's turns (tests; a call that ended). */
export function forgetLiftTurns(sessionId: string): void {
  turnsBySession.delete(sessionId);
}

/** Who the reply is for, as reply-director has it. */
export interface LiftOptions {
  personaId?: string;
  sessionId?: string;
  voiceId: string;
  turnContext?: { userRequest?: string; callerTurnFresh?: boolean };
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
  const turns = opts.sessionId ? noteTurn(opts.sessionId, said) : [said];
  const honours = voiceHonorsProsodyTags(opts.voiceId);
  const context: LiftContext = {
    callerBright: callerBright(said),
    callerHeavy: callerHeavyLately(turns),
    cues,
    tags: {
      emotion: honours && modes.emotion === 'live',
      pacing: honours && modes.pacing === 'live',
    },
    report: {
      sessionId: opts.sessionId,
      callerTextLen: said?.trim().length ?? 0,
      callerTextIsThisTurn: opts.turnContext?.callerTurnFresh === true,
    },
  };
  return new EmotionLift(context, ferniRestingSpeed(env));
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

/** One push as it goes to Cartesia: capped, and downgraded if a lifted reply turns hard. */
export function liftPush(lift: EmotionLift | undefined, text: string, first: boolean): string {
  return lift ? lift.push(text, first) : text;
}
