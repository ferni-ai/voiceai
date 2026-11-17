/**
 * Who on one call is heard on their own stream (people-speech.ts): from `add` until their
 * stream ends or they are removed, one store per session. What they say reaches one
 * listener; what is said before anyone listens waits for the first, newest 32 only.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import { stt } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import type { PersonSpeechEvent } from '../floor-arbiter.js';
import { PeopleSpeech, peopleSpeechFor } from '../people-speech.js';
import { SARAH, said } from './person-speech-events.js';

const { INTERIM_TRANSCRIPT } = stt.SpeechEventType;
const FINISHED = { done: true, value: undefined };

function own(): { stream: ReadableStream<PersonSpeechEvent>; end: () => void } {
  let controller: ReadableStreamDefaultController<PersonSpeechEvent> | undefined;
  const stream = new ReadableStream<PersonSpeechEvent>({
    start: (c) => {
      controller = c;
    },
  });
  return { stream, end: () => controller?.close() };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    // eslint-disable-next-line no-await-in-loop -- each turn lets the relay take one step
    await nextTick();
  }
}

/** Sarah's stream, saying `count` interims numbered from 1, then staying open. */
async function* sarahSays(count: number): AsyncGenerator<PersonSpeechEvent> {
  for (let n = 1; n <= count; n++) yield said(SARAH, INTERIM_TRANSCRIPT, `word ${n}`);
  await new Promise<never>(() => {
    // Sarah's stream stays open
  });
}

/** The texts a listener has waiting, read until it would have to wait. */
async function waiting(heard: AsyncIterator<PersonSpeechEvent>): Promise<string[]> {
  const texts: string[] = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- read one waiting event at a time
    const next = await Promise.race([heard.next(), settle().then(() => undefined)]);
    if (!next || next.done) return texts;
    texts.push(next.value.event.alternatives?.[0]?.text ?? '');
  }
}

describe('PeopleSpeech', () => {
  it('is live from add until the person is removed', () => {
    const people = peopleSpeechFor({});
    expect(people.live).toBe(false);
    people.add('guest_call1', own().stream);
    expect(people.live).toBe(true);
    people.remove('guest_call1');
    expect(people.live).toBe(false);
  });

  it('a person whose stream ends is no longer heard apart', async () => {
    const people = peopleSpeechFor({});
    const sarah = own();
    people.add('guest_call1', sarah.stream);
    sarah.end();
    await settle();
    expect(people.live).toBe(false);
  });

  it('a stream replaced by a newer one ending does not take the newer one out', async () => {
    const people = peopleSpeechFor({});
    const first = own();
    people.add('guest_call1', first.stream);
    people.add('guest_call1', own().stream);
    first.end();
    await settle();
    expect(people.live).toBe(true);
  });

  it('relays what a person says to the listener', async () => {
    const people = new PeopleSpeech();
    const heard = people.listen();
    people.add(SARAH.identity, sarahSays(2));
    await settle();
    expect(await waiting(heard)).toEqual(['word 1', 'word 2']);
  });

  it('keeps what was said before anyone listened for the first listener', async () => {
    const people = new PeopleSpeech();
    people.add(SARAH.identity, sarahSays(3));
    await settle();
    expect(await waiting(people.listen())).toEqual(['word 1', 'word 2', 'word 3']);
  });

  it('keeps only the newest 32 of them', async () => {
    const people = new PeopleSpeech();
    people.add(SARAH.identity, sarahSays(40));
    await settle();
    const texts = await waiting(people.listen());
    expect(texts).toHaveLength(32);
    expect(texts[0]).toBe('word 9');
    expect(texts[31]).toBe('word 40');
  });

  it('a listener stopped while waiting finishes at once and hears nothing more', async () => {
    const people = new PeopleSpeech();
    const heard = people.listen();
    const pending = heard.next();
    await heard.return?.();
    expect(await pending).toEqual(FINISHED);
    people.add(SARAH.identity, sarahSays(1));
    await settle();
    expect(await heard.next()).toEqual(FINISHED);
    expect(await waiting(people.listen())).toEqual(['word 1']); // kept for the next listener
  });

  it('a newer listener finishes the last one, even with a next() waiting', async () => {
    const people = new PeopleSpeech();
    const first = people.listen();
    const pending = first.next();
    const second = people.listen();
    expect(await pending).toEqual(FINISHED);
    people.add(SARAH.identity, sarahSays(1));
    await settle();
    expect(await waiting(second)).toEqual(['word 1']);
  });

  it('one next() at a time: a second while one waits throws, and the first still hears', async () => {
    const people = new PeopleSpeech();
    const heard = people.listen();
    const first = heard.next();
    await expect(heard.next()).rejects.toThrow('one next() at a time');
    people.add(SARAH.identity, sarahSays(1));
    expect((await first).value?.event.alternatives?.[0]?.text).toBe('word 1');
  });

  it('one store per session', () => {
    const session = {};
    expect(peopleSpeechFor(session)).toBe(peopleSpeechFor(session));
    expect(peopleSpeechFor({})).not.toBe(peopleSpeechFor(session));
  });
});
