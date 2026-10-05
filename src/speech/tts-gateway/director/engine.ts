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
import type { SSMLProsodyConfig } from '../types.js';
import { decideEmotion, readValence, type EmotionDecision, type Valence } from './emotion.js';
import { decideReplyLaughter, placeLaughter, type LaughPlacement } from './laughter.js';
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
import { normalizeForSpeech } from './normalize.js';
import { decideSpeed } from './pacing.js';
import { commaDensity, planPauses, removeMidSentenceEllipses } from './pauses.js';
import { PhraseAssembler } from './phrasing.js';
import type { CarryOver } from './session-state.js';
import type { Lever, LeverModes, RustEvent, SpeechPlan, SpeechSegment } from './types.js';

/** Leading inline tags continuation-tts puts on a push. */
const LEAD_TAGS = /^((?:\s*<(?:speed|volume|emotion)\b[^>]*\/>)*)([\s\S]*)$/;
const SPEED_TAG = /<speed\s+ratio="([\d.]+)"\s*\/>/;
const VOLUME_TAG = /<volume\s+ratio="([\d.]+)"\s*\/>/;
const EMOTION_TAG = /<emotion\s+value="([a-z_]+)"\s*\/>/;
/** Any emotion tag, anywhere in a push: stripped after the opening when emotion is live. */
const ANY_EMOTION_TAG = /<\/?emotion\b[^>]*>/gi;
/**
 * The tags a PVC ignores, stripped from each push for one. <volume> stays: a
 * PVC honors it (voice-capabilities.ts), and it is how a reply restarts
 * softly after the caller interrupts.
 */
const PROSODY_TAG = /<\/?(?:speed|emotion)\b[^>]*>/gi;
const VOLUME_TAGS = /<volume\s+ratio="[\d.]+"\s*\/>/g;

/** Only the volume tags of a run of leading tags. */
function volumeOnly(tags: string): string {
  return (tags.match(VOLUME_TAGS) ?? []).join('');
}
/**
 * Stage 2 tempo range for a voice that ignores <speed>. Listeners hear about
 * +/-10% tempo; more is a different voice. Gentle on purpose.
 */
export const STAGE2_TEMPO_MIN = 0.85;
export const STAGE2_TEMPO_MAX = 1.15;
/** Cartesia's accepted speed range (providers/cartesia.ts prosodyTags). */
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.5;

/** A breath before a phrase this long, at most every other segment. */
const BREATH_MIN_WORDS = 10;
const BREATH_FULL_WORDS = 18;
/** Below this distance from 1 a speed is not worth a tag. */
const SPEED_EPSILON = 0.015;

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
  laughter?: {
    sessionId?: string;
    personaId?: string;
    turn?: number;
    userEmotion?: string;
    comfortLevel?: number;
  };
  /** The user's words this reply answers (nonverbal.ts). */
  userText?: string;
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

function parseLead(push: string): { tags: string; body: string; prosody: SSMLProsodyConfig } {
  const [, tags = '', body = ''] = LEAD_TAGS.exec(push) ?? [];
  const prosody: SSMLProsodyConfig = {};
  const speed = SPEED_TAG.exec(tags);
  const volume = VOLUME_TAG.exec(tags);
  const emotion = EMOTION_TAG.exec(tags);
  if (speed) prosody.speed = Number(speed[1]);
  if (volume) prosody.volume = Number(volume[1]);
  if (emotion) prosody.emotion = emotion[1];
  return { tags, body: body.trim(), prosody };
}

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/**
 * The Director's reply speed applied ON TOP of whatever speed the push already
 * asks for (a soft start, or per-sentence pace matching from continuation-tts):
 * multiplied, never substituted, inside Cartesia's range.
 */
export function composeSpeed(incoming: number, reply: number): number {
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, incoming * reply));
  return Math.round(ratio * 100) / 100;
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
  private pendingTags = '';
  private segmentsSinceBreath = Infinity;
  private spokenSighChecked = false;
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
      const normalized = normalizeForSpeech(body);
      this.stats.normalizations += normalized.count;

      const planned = this.planPhrases.accept(normalized.text, first);
      if (first) this.open(planned[0] ?? normalized.text, prosody.speed);
      this.readFirstSentence(normalized.text, first);
      this.planSegments(planned);

      let spokenBody = this.live('normalize') ? normalized.text : body;
      if (this.live('emotion')) spokenBody = spokenBody.replace(ANY_EMOTION_TAG, '');
      // Opening tags lead the first phrase. A later push's tags travel inline
      // with its own text, so a phrase held back from the previous push is
      // never voiced with them (review LOW: tags one phrase early).
      const strip = this.ctx.stripProsody === true;
      if (strip) spokenBody = spokenBody.replace(PROSODY_TAG, '');
      if (first) this.pendingTags += strip ? volumeOnly(tags) : this.openingTags(tags, prosody);
      else spokenBody = `${strip ? volumeOnly(tags) : this.laterTags(tags, prosody)}${spokenBody}`;
      const spoken = this.spokenPhrases.accept(spokenBody, first);
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
    this.replyValence = readValence(openingText);
    this.emotion = decideEmotion({
      authored: this.ctx.cues.authoredEmotion,
      sessionHint: this.ctx.sessionHint,
      openingText,
      previous: this.ctx.carry.emotion,
    });
    const pace = decideSpeed({
      valence: readValence(openingText),
      emotion: this.emotion.emotion,
      voiceId: this.ctx.voiceId,
      previous: this.ctx.carry.speed,
    });
    this.speed = Math.abs(pace.speed - 1) < SPEED_EPSILON ? 1 : pace.speed;
    this.replySpeed = this.live('pacing') && pace.supported ? this.speed : 1;
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

  private openingTags(original: string, lead: SSMLProsodyConfig): string {
    if (!this.live('emotion') && !this.live('pacing')) return original;
    return this.ctx.renderTags({
      // A soft start (interrupt recovery) keeps its own pace, scaled by the reply's.
      speed: this.live('pacing') ? composeSpeed(lead.speed ?? 1, this.replySpeed) : lead.speed,
      volume: lead.volume,
      emotion: this.live('emotion') ? this.emotion.emotion : lead.emotion,
    });
  }

  /**
   * Tags on a push after the opening. A speed there (continuation-tts's reset
   * after a soft start, or per-sentence pace matching) is composed with the
   * reply's speed, not replaced; with the emotion lever live, a later emotion
   * is dropped so one emotion holds for the whole reply (review H1).
   */
  private laterTags(original: string, lead: SSMLProsodyConfig): string {
    let tags = original;
    if (this.live('pacing') && lead.speed !== undefined) {
      tags = tags.replace(
        SPEED_TAG,
        `<speed ratio="${composeSpeed(lead.speed, this.replySpeed)}"/>`
      );
    }
    if (this.live('emotion')) tags = tags.replace(ANY_EMOTION_TAG, '');
    return tags;
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
