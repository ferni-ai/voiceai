/**
 * Ferni doesn't offer to listen (identity/character.md). A prod smoke call
 * (build c20c77407, 2026-10-17) opened with the sentence below; with
 * LISTEN_OFFER_STRIP=on the offer is dropped and the rest is kept. Crisis
 * resources are never touched.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import {
  ListenOfferFilter,
  withoutListenOffer,
  withoutListenOfferText as strip,
} from '../listen-offer.js';

const PROD =
  "Sounds like a lot… I'm right here if you want to vent, or if you just need a quiet space to decompress.";

const ON = { LISTEN_OFFER_STRIP: 'on' };

async function collect(stream: ReadableStream<unknown> | null): Promise<string> {
  let text = '';
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
    text +=
      typeof chunk === 'string'
        ? chunk
        : ((chunk as { delta?: { content?: string } }).delta?.content ?? '');
  }
  return text;
}

const streamOf = (pieces: string[]): ReadableStream<string> =>
  new ReadableStream<string>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(piece);
      controller.close();
    },
  });

/** The text cut into small pieces, the way the model streams it. */
const pieces = (text: string, size = 5): string[] =>
  Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
    text.slice(i * size, i * size + size)
  );

describe('listen offer strip', () => {
  it('drops the prod listen offer and keeps the rest of the reply', () => {
    expect(strip(PROD)).toBe('Sounds like a lot…');
  });

  it('drops the other host phrases, keeping what is around them', () => {
    expect(strip("That's rough, and I'm here for you. How did he take it?")).toBe(
      "That's rough. How did he take it?"
    );
    expect(strip("I'm here for you. That sounds exhausting.")).toBe('That sounds exhausting.');
    expect(strip('Ugh, Mondays. This is a safe space, so say it.')).toBe('Ugh, Mondays. Say it.');
    expect(strip("I'll always be here whenever you need. Anyway, what's for dinner?")).toBe(
      "Anyway, what's for dinner?"
    );
    expect(strip("I'm here if you need to talk.")).toBe("I'm here if you need to talk."); // nothing else to say
  });

  it('leaves ordinary replies alone', () => {
    for (const text of [
      "I'm here at the lake, actually. What's up?",
      'Your turn. What is here for you?',
      'We found a space to park, finally.',
      'So, the interview. And then what happened?',
      'Sounds like a lot. Do you want me to look up the train times?',
    ]) {
      expect(strip(text), text).toBe(text);
    }
  });

  it('never alters crisis guidance', () => {
    const crisis =
      "If you're thinking about ending your life, please call or text 988 right now. I'm here for you, and you can call 988 any time.";
    expect(strip(crisis)).toBe(crisis);
  });

  it('streams: the same result however the reply is cut, nothing lost or repeated', async () => {
    for (const size of [1, 3, 7, 200]) {
      const out = await collect(withoutListenOffer(streamOf(pieces(PROD, size)), { env: ON }));
      expect(out, `size ${size}`).toBe('Sounds like a lot…');
    }
  });

  it('holds back at most one clause', () => {
    const filter = new ListenOfferFilter();
    expect(filter.push('Sounds like a lot… ')).toBe('Sounds like a lot');
    expect(filter.push("I'm right here if you want to vent, ")).toBe('');
    expect(filter.push('or if you just need a quiet space to decompress.')).toBe('');
    expect(filter.end()).toBe('…');
  });

  it('is off by default and skips replies asked with crisis guidance', async () => {
    const off = withoutListenOffer(streamOf([PROD]), { env: {} });
    expect(await collect(off)).toBe(PROD);
    const guided = withoutListenOffer(streamOf([PROD]), { env: ON, guided: true });
    expect(await collect(guided)).toBe(PROD);
  });
});
