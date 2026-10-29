/**
 * Ferni doesn't offer to listen (LISTEN_OFFER_STRIP=on, off by default).
 *
 * identity/character.md: he doesn't "offer to listen or tell them you're here
 * for them (you just listen)". The prompt says so and the model still slips: a
 * prod smoke call (build c20c77407, 2026-10-17) opened with "Sounds like a
 * lot… I'm right here if you want to vent, or if you just need a quiet space
 * to decompress." With the flag on, a clause that offers to listen, says he's
 * here for them, or offers a "safe space" / "space to decompress" is dropped
 * before TTS, captions and the saved history see it; the rest of the reply is
 * kept ("Sounds like a lot…").
 *
 * Only one clause is held at a time (up to the next , ; : . ! ? … or dash), so
 * the reply's first words wait at most until their first clause ends, which
 * is where the TTS cuts its first chunk anyway.
 *
 * Crisis replies are never touched: crisis-gate.ts doesn't apply this to the
 * crisis script or to a reply asked with crisis guidance, and here, once the
 * reply mentions a crisis resource (988, a hotline, emergency services), every
 * later clause passes as written. A reply that would be left empty is spoken
 * unchanged.
 *
 * @module agents/personas/listen-offer
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ListenOffer' });

const ADVERBS = String.raw`(?:(?:right|always|still|just|totally|all)\s+){0,2}`;
const I_AM = String.raw`\bI(?:['’]m|\s+am|['’]ll\s+${ADVERBS}be|\s+will\s+${ADVERBS}be)`;

/** A clause that offers to listen or to hold space. Whole clauses only. */
export const LISTEN_OFFER: readonly RegExp[] = [
  // "I'm right here if you want to vent", "I'm here for you", "I'll always be here whenever you need"
  new RegExp(`${I_AM}\\s+${ADVERBS}here\\s+(?:for\\s+you|if\\s+you|when(?:ever)?\\s+you)\\b`, 'i'),
  /\bsafe space\b/i,
  /\bspace to decompress\b/i,
];

/** Crisis resources: from the first one on, nothing in the reply is changed. */
const CRISIS =
  /\b(?:988|741741|911|crisis|hotline|lifeline|emergency|suicid\w*|(?:hurt|kill)(?:ing)? yourself|end(?:ing)? your life)\b/i;

/** Whether a reply mentions a crisis resource; such a reply is never changed (phrase-loops.ts too). */
export const mentionsCrisisResource = (text: string): boolean => CRISIS.test(text);

/** A clause ends at punctuation followed by space, or at a spaced dash. */
const CLAUSE_END = /(?:[,;:.!?…]+|\s[—–-])\s+/g;
const SENTENCE_END = /[.!?…]/;
const CONJUNCTION = /^(?:and|or|but|so)\s+/i;

export const isListenOffer = (clause: string): boolean =>
  LISTEN_OFFER.some((pattern) => pattern.test(clause));

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Whether `text` has an unclosed markup tag (`<break time="0.3s"`), where no clause ends. */
const insideTag = (text: string): boolean => text.lastIndexOf('<') > text.lastIndexOf('>');

/**
 * One reply's words, a piece at a time: push() returns the text that may be
 * spoken now, end() the rest.
 */
export class ListenOfferFilter {
  private pending = '';
  /** Punctuation and space after the last kept clause, not yet emitted. */
  private delim = '';
  private kept = false;
  /** The next kept clause starts a sentence. */
  private sentenceStart = true;
  private crisis = false;
  /** The last clause was dropped: a kept one starting a sentence loses a leading "and". */
  private afterDrop = false;
  /** The last clause was dropped and its sentence goes on. */
  private midSentenceDrop = false;
  private original = '';
  readonly dropped: string[] = [];

  push(text: string): string {
    this.original += text;
    this.pending += text;
    let out = '';
    for (;;) {
      const end = this.nextClauseEnd();
      if (!end) return out;
      const clause = this.pending.slice(0, end.index);
      this.pending = this.pending.slice(end.index + end.text.length);
      out += this.clause(clause, end.text);
    }
  }

  end(): string {
    const last = this.pending;
    this.pending = '';
    let out = last ? this.clause(last, '') : '';
    if (!this.kept) return this.dropped.length ? this.original : out;
    out += this.delim.trimEnd();
    this.delim = '';
    return out;
  }

  private nextClauseEnd(): { index: number; text: string } | undefined {
    CLAUSE_END.lastIndex = 0;
    for (let m = CLAUSE_END.exec(this.pending); m; m = CLAUSE_END.exec(this.pending)) {
      if (!insideTag(this.pending.slice(0, m.index))) return { index: m.index, text: m[0] };
    }
    return undefined;
  }

  /** The text to emit for one clause and the delimiter after it. */
  private clause(clause: string, delim: string): string {
    if (!this.crisis && CRISIS.test(clause)) this.crisis = true;
    const endsSentence = delim === '' || SENTENCE_END.test(delim);
    // "…here if you want to vent, or if you just need…": the "or" goes with the offer.
    const continuesOffer = this.midSentenceDrop && /^\s*or\b/i.test(clause);
    if (!this.crisis && clause.trim() && (continuesOffer || isListenOffer(clause))) {
      this.dropped.push(clause.trim());
      // "That's rough, and I'm here for you." keeps "That's rough." not "That's rough,"
      if (endsSentence && this.kept && !SENTENCE_END.test(this.delim)) {
        this.delim = delim || (/[.!?…]+$/.exec(clause.trim())?.[0] ?? '.');
      }
      if (!this.kept || SENTENCE_END.test(this.delim)) this.sentenceStart = true;
      this.afterDrop = true;
      this.midSentenceDrop = !endsSentence;
      return '';
    }
    let text = clause;
    if (this.sentenceStart && this.afterDrop) text = capitalize(text.replace(CONJUNCTION, ''));
    const out = this.delim + text;
    this.delim = delim;
    this.kept = this.kept || clause.trim().length > 0;
    this.sentenceStart = endsSentence;
    this.afterDrop = false;
    this.midSentenceDrop = false;
    return out;
  }
}

/** The reply text with any listen offer dropped (the whole reply at once). */
export function withoutListenOfferText(text: string): string {
  const filter = new ListenOfferFilter();
  return filter.push(text) + filter.end();
}

type Chunk = llm.ChatChunk | string | object;

function textOf(chunk: Chunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const c = chunk as llm.ChatChunk;
  if ('delta' in c && c.delta !== undefined && (c.delta.toolCalls?.length ?? 0) === 0) {
    return c.delta.content ?? '';
  }
  return undefined; // tool calls, usage: not reply text
}

function withText<T extends Chunk>(chunk: T, text: string): T {
  if (typeof chunk === 'string') return text as T;
  const c = chunk as llm.ChatChunk;
  return { ...c, delta: { ...c.delta, content: text } } as T;
}

/**
 * The model's reply stream with any listen offer dropped. `guided`: the reply
 * was asked with crisis guidance, so it passes untouched.
 */
export function withoutListenOffer<T extends Chunk>(
  reply: ReadableStream<T> | null,
  options: { guided?: boolean; env?: Env } = {}
): ReadableStream<T> | null {
  if (!reply || options.guided || !flagOn('LISTEN_OFFER_STRIP', options.env)) return reply;
  const filter = new ListenOfferFilter();
  return new ReadableStream<T>({
    async start(controller) {
      try {
        let last: T | undefined;
        const emit = (text: string) => {
          if (text && last !== undefined) controller.enqueue(withText(last, text));
        };
        for await (const chunk of reply as unknown as AsyncIterable<T>) {
          const text = textOf(chunk);
          if (text === undefined) {
            controller.enqueue(chunk); // tool calls, usage: not words, never held
            continue;
          }
          last = chunk;
          emit(filter.push(text));
        }
        emit(filter.end());
        if (filter.dropped.length) {
          log.info({ dropped: filter.dropped }, 'Dropped a listen offer from the reply');
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
