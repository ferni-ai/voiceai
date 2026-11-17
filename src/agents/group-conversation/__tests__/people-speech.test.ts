/**
 * Who on one call is heard on their own stream (people-speech.ts): from `add` until their
 * stream ends or they are removed, one store per session.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import type { stt } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { peopleSpeechFor } from '../people-speech.js';

function own(): { stream: ReadableStream<stt.SpeechEvent>; end: () => void } {
  let controller: ReadableStreamDefaultController<stt.SpeechEvent> | undefined;
  const stream = new ReadableStream<stt.SpeechEvent>({
    start: (c) => {
      controller = c;
    },
  });
  return { stream, end: () => controller?.close() };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    // eslint-disable-next-line no-await-in-loop -- each turn lets the read loop take one step
    await nextTick();
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

  it('one store per session', () => {
    const session = {};
    expect(peopleSpeechFor(session)).toBe(peopleSpeechFor(session));
    expect(peopleSpeechFor({})).not.toBe(peopleSpeechFor(session));
  });
});
