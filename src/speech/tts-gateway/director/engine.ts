/**
 * The Director's per-reply core: takes each piece continuation-tts would push
 * to Cartesia and returns (a) the full SpeechPlan, every lever applied, and
 * (b) the pieces to actually push, with only the live levers applied.
 *
 * Pure apart from its own state; no I/O. reply-director.ts wraps it around
 * the Cartesia reply stream.
 *
 * @module speech/tts-gateway/director/engine
 */

import type { ReplyAudioPlan } from '../../reply-audio-plan.js';
import { callerState, decideAttune, SPEED_EPSILON } from './attune.js';
import type { Attunement, Delivery, Shift } from './attune.js';
import { pacesOf, planKeyPhrase, type KeyPhrase, type KeyPhraseStep } from './key-phrase.js';
import type { SSMLProsodyConfig } from '../types.js';
import { decideTone, liftedDelivery, liftedValence, liftPush } from './emotion-lift.js';
import type { EmotionLift } from './emotion-lift.js';
import { type EmotionDecision, type StableEmotion, type Valence } from './emotion.js';
import { decideReplyLaughter, placeLaughter, type LaughPlacement } from './laughter.js';
import type { LaughterWho } from './laughter.js';
import {
  FIRST_SENTENCE_WATCH_CHARS,
  decideLateBreath,
  decideOpening,
  firstSentenceEnded,
  nextNonverbalCarry,
  stripSpokenSigh,
  type NonverbalCarry,
  type OpeningDecision,
} from './nonverbal.js';
import { replyNormalizer } from './normalize.js';
import { decideSpeed } from './pacing.js';
import { personaTone, type PersonaDelivery } from './persona-delivery.js';
import { respondToProsody, type ProsodyResponse } from './prosody-response.js';
import type { CallerProsody } from '../../audio-prosody/caller-prosody.js';
import { commaDensity, planPauses, removeMidSentenceEllipses } from './pauses.js';
import { PhraseAssembler } from './phrasing.js';
import type { CarryOver } from './session-state.js';
import {
  ANY_EMOTION_TAG,
  composeSpeed,
  composeVolume,
  laterTags,
  parseLead,
  PROSODY_TAG,
  volumeOnly,
  wordCount,
} from './engine-tags.js';
export { composeSpeed, composeVolume } from './engine-tags.js';
export { emotionLift } from './emotion-lift.js'; // builds EngineContext.lift
import type { Lever, LeverModes, RustEvent, SpeechPlan, SpeechSegment } from './types.js';

/**
 * Stage 2 tempo range for a voice that ignores <speed>. Listeners hear about
 * +/-10% tempo; more is a different voice. Gentle on purpose.
 */
export const STAGE2_TEMPO_MIN = 0.85;
export const STAGE2_TEMPO_MAX = 1.15;
/** A breath before a phrase this long, at most every other segment. */
const BREATH_MIN_WORDS = 10;
const BREATH_FULL_WORDS = 18;

export interface EngineContext {
  modes: LeverModes;
  voiceId: string;
  /** The session's emotion hint (gateway config). */
  sessionHint?: string;
  carry: CarryOver;
  /** Raw-stream cues: the LLM's own emotion tag, sigh cues, how the reply opens. */
  cues: {
    authoredEmotion?: string;
    takeSighs: () => number;
    opensWithSigh?: boolean;
    opensWithSpokenSigh?: boolean;
    sawLaughter?: boolean;
  };
  /** Who and which turn, for the laughter rules' cooldowns. */
  laughter?: LaughterWho;
  /** The user's words this reply answers (nonverbal.ts). */
  userText?: string;
  /** How the caller sounded this turn, against their baseline (caller-prosody.ts). */
  callerProsody?: CallerProsody;
  /** Ferni's own energy on this call as a pace nudge (ferni-energy.ts; 0 when FERNI_STATE is off). */
  ferniNudge?: number;
  /**
   * VOICE_ATTUNE=on: the caller's mood this turn (turnContext.userEmotion),
   * answered with pace, loudness and tone (attune.ts). Absent: attunement off.
   */
  attune?: { userEmotion?: string };
  persona?: PersonaDelivery; // TEAM_VOICES=on: resting voice and tones (persona-delivery.ts)
  lift?: EmotionLift; // EMOTION_LIFT=on: Ferni lifts on bright words (emotion-lift.ts)
  lateNight?: Shift; // PORCH_LIGHT=on: the late-night resting shift (attune.ts LATE_NIGHT)
  /** Renders opening controls; providers/cartesia.ts prosodyTags. */
  renderTags: (prosody: SSMLProsodyConfig) => string;
  /**
   * The voice ignores <speed>/<emotion>/<volume> (a Professional Voice Clone)
   * and the Director is live: send no prosody tag at all.
   */
  stripProsody?: boolean;
}

export interface EngineStats {
  pushesIn: number;
  pushesOut: number;
  normalizations: number;
  ellipsesRemoved: number;
  held: number;
  commas: number;
  words: number;
  breaths: number;
  sighs: number;
}

export class DirectorEngine {
  readonly plan: SpeechPlan = { segments: [] };
  readonly stats: EngineStats = {
    pushesIn: 0,
    pushesOut: 0,
    normalizations: 0,
    ellipsesRemoved: 0,
    held: 0,
    commas: 0,
    words: 0,
    breaths: 0,
    sighs: 0,
  };
  emotion: EmotionDecision = { emotion: undefined, source: 'none' };
  /** How this reply answers the caller's voice (applied only when the prosody lever is live). */
  prosody: ProsodyResponse = { speedNudge: 0, reason: 'no-reading' };
  /** How this reply answers the caller's mood, when VOICE_ATTUNE is on. */
  attunement: Attunement | undefined;
  delivery: Delivery | undefined; // pace and loudness, layered by attune.ts (layerDelivery)
  directorEmotion: StableEmotion | undefined; // decided in Ferni's space, before the persona's tone
  keyPhrase: KeyPhrase | undefined; // a heavy reply's ease back after its first sentence (key-phrase.ts)

  /** The caller's voice reading this reply answers, for the plan log. */
  get callerProsody(): CallerProsody | undefined {
    return this.ctx.callerProsody;
  }
  speed = 1;
  /** Stage 2 tempo for this reply, when the voice can't take a <speed> tag. */
  tempo: number | undefined;
  /** The opening breath/sigh decision (decided unless the nonverbal lever is off). */
  opening: OpeningDecision = { reason: 'none' };
  /** Bumped when a live opening is decided late (a long first sentence): at most once. */
  openingRevision = 0;
  /** The first sentence so far, while it is still being read for a late breath. */
  private firstSentence: string | undefined;
  /** Where `[laughter]` went (or would go, in shadow), if anywhere. */
  laughter: LaughPlacement | undefined;
  private laughterAsked = false;
  private replyValence: Valence = 'neutral';

  private readonly planPhrases = new PhraseAssembler();
  private readonly spokenPhrases: PhraseAssembler;
  private opened = false;
  private replySpeed = 1;
  /** Attuned loudness for the whole reply (1 unless attunement and pacing are live). */
  private replyVolume = 1;
  private pendingTags = '';
  private segmentsSinceBreath = Infinity;
  private spokenSighChecked = false;
  private readonly normalize = replyNormalizer(); // knows when a push starts mid-sentence
  /** Tags of a first push whose only words were the spoken sigh: they lead the next. */
  private stashedLead: { tags: string; prosody: SSMLProsodyConfig } | undefined;

  constructor(private readonly ctx: EngineContext) {
    // Live phrasing re-cuts; live pauses holds a trailing "..." to see what follows.
    this.spokenPhrases = new PhraseAssembler({
      reCut: this.live('phrasing'),
      holdEllipsis: this.live('pauses'),
    });
  }

  private live(lever: Lever): boolean {
    return this.ctx.modes[lever] === 'live';
  }

  /** True once the reply's opening (emotion, pace, breath/sigh) is decided. */
  get decided(): boolean {
    return this.opened;
  }

  /** True while phrasing holds text back from Cartesia. */
  get holding(): boolean {
    return this.spokenPhrases.holding;
  }

  /** One push from continuation-tts; returns what to push to Cartesia now. */
  take(push: string): string[] {
    return this.atomically(() => {
      this.stats.pushesIn++;
      const parsed = parseLead(push);
      const body = this.takeSpokenSigh(parsed.body);
      const { tags, prosody } = this.withStashedLead(parsed);
      if (!body && !this.opened) {
        // Nothing spoken yet: tags only, or a sigh cue stripped down to
        // nothing. Stash the tags/prosody for the push that opens the reply
        // (review M3) instead of deciding the opening from empty text.
        this.stashedLead = { tags, prosody };
        return [];
      }
      const first = !this.opened;
      const normalized = this.normalize(body);
      this.stats.normalizations += normalized.count;

      const planned = this.planPhrases.accept(normalized.text, first);
      if (first) this.open(planned[0] ?? normalized.text, prosody.speed);
      const step = this.keyPhrase?.take(normalized.text, prosody, first);
      this.readFirstSentence(normalized.text, first);
      this.planSegments(planned);

      let spokenBody = this.live('normalize') ? normalized.text : body;
      if (this.live('emotion')) spokenBody = spokenBody.replace(ANY_EMOTION_TAG, '');
      // Opening tags lead the first phrase. A later push's tags travel inline with its own text,
      // so a phrase held back from the previous push never carries them (review LOW).
      const strip = this.ctx.stripProsody === true;
      if (strip) spokenBody = spokenBody.replace(PROSODY_TAG, '');
      const lead = first ? this.openingTags(tags, prosody) : this.laterTags(tags, prosody, step);
      // A voice that ignores the rest still takes the reply's loudness (attune.ts layerDelivery).
      const own = strip ? volumeOnly(this.replyVolume === 1 ? tags : lead) : lead;
      if (first) this.pendingTags += own;
      else spokenBody = `${own}${spokenBody}`;
      const spoken = this.spokenPhrases.accept(liftPush(this.ctx.lift, spokenBody, first), first);
      if (spoken.length === 0) this.stats.held++;
      return this.emit(spoken);
    });
  }

  /**
   * With the nonverbal lever live, the behavior tool's sigh is rendered by
   * Stage 2, so its spoken "Ahh." at the start of the reply is taken out.
   *
   * Checked on the first push that has a body, not the first push overall
   * (review M3): a tags-only first push (e.g. a lone `<emotion .../>`) has
   * nothing to check yet, and would otherwise burn the one-time check
   * before the reply's actual opening words arrive, letting a later "Ahh."
   * through while Stage 2 still plays the sigh — heard twice.
   */
  private takeSpokenSigh(body: string): string {
    if (!body || this.spokenSighChecked) return body;
    this.spokenSighChecked = true;
    const strip = this.live('nonverbal') && this.ctx.cues.opensWithSpokenSigh === true;
    return strip ? stripSpokenSigh(body) : body;
  }

  private withStashedLead(parsed: { tags: string; prosody: SSMLProsodyConfig }): {
    tags: string;
    prosody: SSMLProsodyConfig;
  } {
    const stash = this.stashedLead;
    this.stashedLead = undefined;
    if (!stash) return parsed;
    return { tags: stash.tags + parsed.tags, prosody: { ...stash.prosody, ...parsed.prosody } };
  }

  /** The reply is over: release held phrases. */
  finish(): string[] {
    // A reply that was only the sigh still gets its opening decided.
    if (!this.opened && this.stashedLead) this.open('', this.stashedLead.prosody.speed);
    return this.atomically(() => {
      this.planSegments(this.planPhrases.flush());
      return this.emit(this.spokenPhrases.flush());
    });
  }

  /** A hold ran out of time: release what phrasing is holding, directed. */
  releaseHold(): string[] {
    return this.atomically(() => this.emit(this.spokenPhrases.flush()));
  }

  /**
   * Run a step so that a throw leaves the spoken state as it was before the
   * step: the caller's fallback (releaseHeld, then the raw push) then speaks
   * every word exactly once and in order (review M4). Plan state is a log and
   * is not rolled back.
   */
  private atomically(step: () => string[]): string[] {
    const held = this.spokenPhrases.snapshot();
    const pendingTags = this.pendingTags;
    try {
      return step();
    } catch (error) {
      this.spokenPhrases.restore(held);
      this.pendingTags = pendingTags;
      throw error;
    }
  }

  /** After a failure: whatever phrasing was holding, undirected, so no words are lost. */
  releaseHeld(): string[] {
    const held = this.spokenPhrases.flush().map((t) => `${this.pendingTags}${t} `);
    this.pendingTags = '';
    return held;
  }

  /** What Stage 2 should do to this reply's audio, if anything. */
  audioPlan(): ReplyAudioPlan | undefined {
    const plan: ReplyAudioPlan = {};
    if (this.tempo !== undefined) plan.tempo = this.tempo;
    if (this.live('nonverbal') && this.opening.opening) plan.opening = this.opening.opening;
    return plan.tempo === undefined && plan.opening === undefined ? undefined : plan;
  }

  /** The session's nonverbal cooldown counters after this reply. */
  nonverbalCarry(): NonverbalCarry {
    const { sinceSigh, sinceBreath } = this.ctx.carry;
    if (this.ctx.modes.nonverbal === 'off') return { sinceSigh, sinceBreath };
    return nextNonverbalCarry({ sinceSigh, sinceBreath }, this.opening.opening);
  }

  /**
   * Read the first sentence as it streams for a late long-sentence breath:
   * only while no opening is decided, until the sentence ends or
   * FIRST_SENTENCE_WATCH_CHARS have streamed, and at most once.
   */
  private readFirstSentence(text: string, first: boolean): void {
    if (first) {
      const watch = this.ctx.modes.nonverbal !== 'off' && !this.opening.opening;
      const open = !firstSentenceEnded(text) && text.length < FIRST_SENTENCE_WATCH_CHARS;
      this.firstSentence = watch && open ? text : undefined;
      return;
    }
    if (this.firstSentence === undefined) return;
    const soFar = `${this.firstSentence} ${text}`.trim();
    const breath = decideLateBreath(soFar, this.ctx.carry);
    if (breath) {
      this.opening = { opening: breath, reason: 'long-sentence' };
      if (this.live('nonverbal')) this.openingRevision++; // shadow only logs it
    }
    const done =
      breath !== undefined ||
      firstSentenceEnded(soFar) ||
      soFar.length >= FIRST_SENTENCE_WATCH_CHARS;
    this.firstSentence = done ? undefined : soFar;
  }

  /** One emotion and one speed for the whole reply, from its opening phrase. */
  private open(openingText: string, leadSpeed: number | undefined): void {
    this.opened = true;
    this.replyValence = liftedValence(this.ctx.lift, openingText);
    // Decided in shadow too, so the plan log shows what it would do.
    this.prosody = respondToProsody(this.ctx.callerProsody, this.replyValence);
    const answerVoice = this.live('prosody');
    this.attunement = this.attune(answerVoice);
    this.emotion = decideTone(this.ctx.lift, {
      authored: this.ctx.cues.authoredEmotion,
      sessionHint: this.ctx.sessionHint,
      openingText,
      previous: this.ctx.carry.emotion,
      prosody: this.toneCandidate(answerVoice),
    });
    // A sympathetic reply is hard news even when its first phrase ("Ah, hell.") doesn't say so.
    if (this.emotion.emotion === 'sympathetic') this.attunement = this.attune(answerVoice, 'heavy');
    const pace = decideSpeed({
      valence: this.replyValence,
      emotion: this.emotion.emotion,
      voiceId: this.ctx.voiceId,
      previous: this.ctx.carry.speed,
      nudge: (answerVoice ? this.prosody.speedNudge : 0) + (this.ctx.ferniNudge ?? 0),
    });
    const { persona, lateNight, lift } = this.ctx; // attune's: persona, late night, caller
    const caller = this.attunement ?? { speed: pace.speed, volume: 1 };
    this.delivery = liftedDelivery(lift, { persona, lateNight, caller }, this.live('pacing'));
    ({ speed: this.speed, volume: this.replyVolume } = this.delivery);
    this.directorEmotion = this.emotion.emotion;
    this.emotion = personaTone(this.ctx.persona, this.emotion, this.replyValence);
    this.replySpeed = this.live('pacing') && pace.supported ? this.speed : 1;
    this.planKeyPhrase(pace.supported);
    if (this.ctx.modes.nonverbal !== 'off') {
      this.opening = decideOpening({
        openingText,
        opensWithSigh: this.ctx.cues.opensWithSigh === true,
        userText: this.ctx.userText,
        voiceId: this.ctx.voiceId,
        carry: this.ctx.carry,
      });
    }
    if (this.live('pacing') && !pace.supported) {
      // The voice ignores <speed>: the pace (with any soft start) goes to Stage 2.
      const tempo = composeSpeed(leadSpeed ?? 1, this.speed);
      const gentle = Math.min(STAGE2_TEMPO_MAX, Math.max(STAGE2_TEMPO_MIN, tempo));
      this.tempo = Math.abs(gentle - 1) < SPEED_EPSILON ? undefined : gentle;
    }
  }

  /** A tone answering the caller: their mood when attuned, else their voice (prosody lever). */
  private toneCandidate(answerVoice: boolean): StableEmotion | undefined {
    return this.attunement?.emotion ?? (answerVoice ? this.prosody.emotion : undefined);
  }

  /** VOICE_ATTUNE: how this reply answers the caller's mood (attune.ts), else undefined. */
  private attune(answerVoice: boolean, valence = this.replyValence): Attunement | undefined {
    if (!this.ctx.attune) return undefined;
    return decideAttune({
      state: callerState(this.ctx.attune.userEmotion, answerVoice ? this.prosody : undefined),
      voice: this.ctx.callerProsody,
      valence,
      previous: { speed: this.ctx.carry.speed, volume: this.ctx.carry.volume },
      nudge: this.ctx.ferniNudge,
    });
  }

  private openingTags(original: string, lead: SSMLProsodyConfig): string {
    if (!this.live('emotion') && !this.live('pacing')) return original;
    return this.ctx.renderTags({
      // A soft start (interrupt recovery) keeps its own pace, scaled by the reply's.
      speed: this.live('pacing') ? composeSpeed(lead.speed ?? 1, this.replySpeed) : lead.speed,
      volume:
        this.replyVolume === 1 ? lead.volume : composeVolume(lead.volume ?? 1, this.replyVolume),
      emotion: this.live('emotion') ? this.emotion.emotion : lead.emotion,
    });
  }

  /** Tags on a later push (engine-tags.ts laterTags), led by a heavy reply's easing step if any. */
  private laterTags(original: string, lead: SSMLProsodyConfig, step?: KeyPhraseStep): string {
    const pace = step ?? { speed: this.replySpeed, volume: this.replyVolume };
    const live = { pacing: this.live('pacing'), emotion: this.live('emotion') };
    return `${step?.tags ?? ''}${laterTags(original, lead, pace, live)}`;
  }

  /** A heavy reply keeps its slow, soft delivery for the key phrase only (key-phrase.ts). */
  private planKeyPhrase(supported: boolean): void {
    const caller = this.attunement?.ease;
    if (!this.attunement || !caller || !this.delivery) return;
    const eased = liftedDelivery(
      this.ctx.lift, // the eased pace goes through the reply's own resting layers and lift
      { persona: this.ctx.persona, caller },
      this.live('pacing')
    );
    const tagSpeed = this.live('pacing') && supported; // as replySpeed
    this.keyPhrase = planKeyPhrase(
      pacesOf(this.delivery, this.attunement.volume, tagSpeed),
      pacesOf(eased, caller.volume, tagSpeed)
    );
  }

  /** Ask the laughter rules once, on the reply's first phrase. */
  private withLaughter(text: string): string {
    if (this.laughterAsked || this.ctx.modes.laughter === 'off') return text;
    this.laughterAsked = true;
    this.laughter = decideReplyLaughter({
      ...this.ctx.laughter,
      phrase: text,
      replyValence: this.replyValence,
      alreadyLaughing: this.ctx.cues.sawLaughter === true,
      userText: this.ctx.userText,
    });
    return this.laughter && this.live('laughter') ? placeLaughter(text, this.laughter) : text;
  }

  private emit(texts: string[]): string[] {
    const out: string[] = [];
    for (const raw of texts) {
      const paused = this.live('pauses') ? removeMidSentenceEllipses(raw).text : raw;
      if (!paused) continue;
      const text = this.withLaughter(paused);
      out.push(`${this.pendingTags}${text} `);
      this.pendingTags = '';
    }
    this.stats.pushesOut += out.length;
    return out;
  }

  private planSegments(phrases: string[]): void {
    for (const phrase of phrases) {
      const rendered = removeMidSentenceEllipses(phrase);
      this.stats.ellipsesRemoved += rendered.removed;
      const density = commaDensity(rendered.text);
      this.stats.commas += density.commas;
      this.stats.words += density.words;
      const events: RustEvent[] = [];
      const sighs = this.ctx.cues.takeSighs();
      for (let i = 0; i < sighs; i++) {
        events.push({
          type: 'sigh',
          anchor: { edge: 'segment-start' },
          params: { intensity: 'soft' },
        });
      }
      this.stats.sighs += sighs;
      const words = wordCount(rendered.text);
      if (words >= BREATH_MIN_WORDS && this.segmentsSinceBreath >= 2) {
        const intensity = words >= BREATH_FULL_WORDS ? 'full' : 'soft';
        events.push({ type: 'breath', anchor: { edge: 'segment-start' }, params: { intensity } });
        this.stats.breaths++;
        this.segmentsSinceBreath = 0;
      } else {
        this.segmentsSinceBreath++;
      }
      events.push(...planPauses(rendered.text));
      const segment: SpeechSegment = { cartesiaText: rendered.text, rustEvents: events };
      if (this.plan.segments.length === 0) {
        segment.cartesiaControls = { emotion: this.emotion.emotion, speed: this.speed };
      }
      this.plan.segments.push(segment);
    }
  }
}
