/**
 * Slow the key phrase, not the whole reply (VOICE_ATTUNE only).
 *
 * Attune drops a reply on hard news to HEAVY pace and loudness (attune.ts),
 * and the engine used to hold that for the whole reply. A blind same-words
 * test on 2026-10-16 (20 pairs) split by length: the slow, soft delivery won
 * 5 of 6 replies of 11 words or fewer and 0 of 4 of 23 words or more.
 * Uniformly slow long speech tires the listener; people slow the phrase that
 * carries the news and let the rest run nearer their usual pace.
 *
 * So a heavy reply keeps its slow, soft delivery for its first sentence, then
 * returns to the pace and loudness it would have had without the heavy drop
 * (easeTarget, through the same persona layers) at the start of the first push
 * after that sentence ends (continuation-tts pushes a sentence at a time). It
 * returns fully, in one step: offline Sonic 3.6 renders of Ferni's voice
 * (2026-10-16, 3 takes) heard <speed> 0.93 and 0.86 both as ~5-6% slower, so a
 * half-way step would be inaudible against the heavy pace. The step always
 * writes both a speed and a volume tag, even when the target is 1: a tag
 * persists on the context until reset, so without them the heavy tags would
 * carry through the reply. It never goes slower or softer than the first
 * sentence. A one-sentence reply is unchanged, as is emotion: one per reply.
 *
 * @module speech/tts-gateway/director/key-phrase
 */

import type { SSMLProsodyConfig } from '../types.js';
import type { Delivery } from './attune.js';
import { composeSpeed, composeVolume } from './engine-tags.js';

export interface Pace {
  speed: number;
  volume: number;
}

/** A pace at two levels: what goes into the push's tags, and the caller layer the session carries. */
export interface Paces {
  reply: Pace;
  caller: Pace;
}

/** The pace for one push after the opening, and the tags that move the voice there. */
export interface KeyPhraseStep extends Pace {
  tags: string;
}

/** Ease below this (a ratio) is not worth a tag. */
const EASE_EPSILON = 0.015;
const EASED = 1;

/**
 * A sentence end: firstSentenceEnded's rule (nonverbal.ts), counted, except a
 * trailing ellipsis, which usually trails off mid-thought rather than ending.
 */
const SENTENCE_END = /(?<!\.\.)[.!?](?=\s|$)/g;

export function sentenceEnds(text: string): number {
  return text.match(SENTENCE_END)?.length ?? 0;
}

/** Never slower or softer than the heavy opening. */
const atLeast = (floor: Pace, p: Pace): Pace => ({
  speed: Math.max(floor.speed, p.speed),
  volume: Math.max(floor.volume, p.volume),
});

export class KeyPhrase {
  /** The stage of the last push taken: 0 heavy, 1 eased. */
  private stage = 0;
  private sentences = 0;
  /** continuation-tts's own speed and volume, which persist on the context until it changes them. */
  private lead: Pace = { speed: 1, volume: 1 };
  private readonly stages: readonly Paces[];

  constructor(heavy: Paces, eased: Paces) {
    const to = {
      reply: atLeast(heavy.reply, eased.reply),
      caller: atLeast(heavy.caller, eased.caller),
    };
    this.stages = [heavy, to];
  }

  /**
   * The caller-layer pace actually spoken last: what the session carries to the
   * next reply (session-state.ts), so it smooths from the eased pace the caller
   * last heard, not from the heavy opening.
   */
  get spoken(): Pace {
    return this.stages[this.stage].caller;
  }

  /**
   * One push, in order. The first push opens at the heavy pace (the engine's
   * opening tags); a later one returns its step, decided by the sentences that
   * ended before it.
   */
  take(text: string, lead: SSMLProsodyConfig, first: boolean): KeyPhraseStep | undefined {
    const step = first ? undefined : this.step(lead);
    this.lead = { speed: lead.speed ?? this.lead.speed, volume: lead.volume ?? this.lead.volume };
    this.sentences += sentenceEnds(text);
    return step;
  }

  private step(lead: SSMLProsodyConfig): KeyPhraseStep {
    const from = this.stage;
    this.stage = Math.min(this.sentences, EASED);
    const to = this.stages[this.stage].reply;
    if (this.stage === from) return { ...to, tags: '' };
    // A tag continuation-tts leads with is composed with the step in laterTags;
    // otherwise its standing value is, so a soft start or base pace survives.
    let tags = '';
    if (lead.speed === undefined) {
      tags += `<speed ratio="${composeSpeed(this.lead.speed, to.speed)}"/>`;
    }
    if (lead.volume === undefined) {
      tags += `<volume ratio="${composeVolume(this.lead.volume, to.volume)}"/>`;
    }
    return { ...to, tags };
  }
}

/**
 * A layered delivery (attune.ts layerDelivery) as Paces: the reply level the
 * engine tags (its speed only where speed is tagged, as engine.ts replySpeed),
 * and the caller layer with its loudness, which the session carries.
 */
export function pacesOf(d: Delivery, callerVolume: number, tagSpeed: boolean): Paces {
  return {
    reply: { speed: tagSpeed ? d.speed : 1, volume: d.volume },
    caller: { speed: d.relativeSpeed, volume: callerVolume },
  };
}

/**
 * The pace the session carries to the next reply (session-state.ts): the
 * caller layer as last spoken. A heavy reply that eased back carries its eased
 * pace; any other carries its caller layer (the resting layers are reapplied
 * each reply, never compounded).
 */
export function carriedPace(engine: {
  keyPhrase: KeyPhrase | undefined;
  delivery: Delivery | undefined;
  attunement: { volume: number } | undefined;
  speed: number;
}): { speed: number; volume: number | undefined } {
  if (engine.keyPhrase) return engine.keyPhrase.spoken;
  return {
    speed: engine.delivery?.relativeSpeed ?? engine.speed,
    volume: engine.attunement?.volume,
  };
}

/** A KeyPhrase when the heavy reply is slower or softer than where it eases to, else undefined. */
export function planKeyPhrase(heavy: Paces, eased: Paces): KeyPhrase | undefined {
  const below =
    eased.reply.speed - heavy.reply.speed >= EASE_EPSILON ||
    eased.reply.volume - heavy.reply.volume >= EASE_EPSILON;
  return below ? new KeyPhrase(heavy, eased) : undefined;
}
