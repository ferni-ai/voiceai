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

import type { SSMLProsodyConfig } from '../types.js';
import { decideEmotion, readValence, type EmotionDecision } from './emotion.js';
import { normalizeForSpeech } from './normalize.js';
import { decideSpeed } from './pacing.js';
import { planPauses, renderPauses } from './pauses.js';
import { PhraseAssembler } from './phrasing.js';
import type { CarryOver } from './session-state.js';
import type { Lever, LeverModes, RustEvent, SpeechPlan, SpeechSegment } from './types.js';

/** Leading inline tags continuation-tts puts on a push. */
const LEAD_TAGS = /^((?:\s*<(?:speed|volume|emotion)\b[^>]*\/>)*)([\s\S]*)$/;
const SPEED_TAG = /<speed\s+ratio="([\d.]+)"\s*\/>/;
const VOLUME_TAG = /<volume\s+ratio="([\d.]+)"\s*\/>/;
const EMOTION_TAG = /<emotion\s+value="([a-z_]+)"\s*\/>/;

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
  /** Raw-stream cues: the LLM's own emotion tag, and sigh cues not yet placed. */
  cues: { authoredEmotion?: string; takeSighs: () => number };
  /** Renders opening controls; providers/cartesia.ts prosodyTags. */
  renderTags: (prosody: SSMLProsodyConfig) => string;
}

export interface EngineStats {
  pushesIn: number;
  pushesOut: number;
  normalizations: number;
  pauseUpgrades: number;
  held: number;
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

export class DirectorEngine {
  readonly plan: SpeechPlan = { segments: [] };
  readonly stats: EngineStats = {
    pushesIn: 0,
    pushesOut: 0,
    normalizations: 0,
    pauseUpgrades: 0,
    held: 0,
    breaths: 0,
    sighs: 0,
  };
  emotion: EmotionDecision = { emotion: undefined, source: 'none' };
  speed = 1;

  private readonly planPhrases = new PhraseAssembler();
  private readonly spokenPhrases = new PhraseAssembler();
  private opened = false;
  private replySpeed = 1;
  private pendingTags = '';
  private segmentsSinceBreath = Infinity;

  constructor(private readonly ctx: EngineContext) {}

  private live(lever: Lever): boolean {
    return this.ctx.modes[lever] === 'live';
  }

  /** One push from continuation-tts; returns what to push to Cartesia now. */
  take(push: string): string[] {
    this.stats.pushesIn++;
    const { tags, body, prosody } = parseLead(push);
    const first = !this.opened;
    const normalized = normalizeForSpeech(body);
    this.stats.normalizations += normalized.count;

    const planned = this.planPhrases.accept(normalized.text, first);
    if (first) this.open(planned[0] ?? normalized.text);
    this.planSegments(planned);

    const spokenBody = this.live('normalize') ? normalized.text : body;
    const spoken = this.live('phrasing')
      ? this.spokenPhrases.accept(spokenBody, first)
      : [spokenBody];
    if (spoken.length === 0) this.stats.held++;
    this.pendingTags += first ? this.openingTags(tags, prosody) : this.paceTags(tags, prosody);
    return this.emit(spoken);
  }

  /** The reply is over: release held phrases. */
  finish(): string[] {
    this.planSegments(this.planPhrases.flush());
    return this.emit(this.live('phrasing') ? this.spokenPhrases.flush() : []);
  }

  /** After a failure: whatever phrasing was holding, undirected, so no words are lost. */
  releaseHeld(): string[] {
    const held = this.spokenPhrases.flush().map((t) => `${this.pendingTags}${t} `);
    this.pendingTags = '';
    return held;
  }

  /** One emotion and one speed for the whole reply, from its opening phrase. */
  private open(openingText: string): void {
    this.opened = true;
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
  }

  private openingTags(original: string, lead: SSMLProsodyConfig): string {
    if (!this.live('emotion') && !this.live('pacing')) return original;
    return this.ctx.renderTags({
      // A soft start (interrupt recovery) keeps its own opening pace.
      speed: lead.speed ?? this.replySpeed,
      volume: lead.volume,
      emotion: this.live('emotion') ? this.emotion.emotion : lead.emotion,
    });
  }

  /** continuation-tts resets pace after a soft start; reset to the reply's speed. */
  private paceTags(original: string, lead: SSMLProsodyConfig): string {
    if (!this.live('pacing') || lead.speed === undefined) return original;
    return original.replace(SPEED_TAG, `<speed ratio="${this.replySpeed}"/>`);
  }

  private emit(texts: string[]): string[] {
    const out: string[] = [];
    for (const raw of texts) {
      const text = this.live('pauses') ? renderPauses(raw).text : raw;
      if (!text) continue;
      out.push(`${this.pendingTags}${text} `);
      this.pendingTags = '';
    }
    this.stats.pushesOut += out.length;
    return out;
  }

  private planSegments(phrases: string[]): void {
    for (const phrase of phrases) {
      const rendered = renderPauses(phrase);
      this.stats.pauseUpgrades += rendered.inserted;
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
