/**
 * GROUP_CALL: while anyone on the call is heard on their own stream (people-speech.ts),
 * sttChain feeds its STT silence of the same length in place of the mixed input. The SDK
 * times speech by the audio it was fed, so the total must match a call with nobody apart.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import type { stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { peopleSpeechFor } from '../../group-conversation/people-speech.js';

vi.mock('../../group-conversation/group-hearing.js', () => ({ groupHearingFor: () => undefined }));

const { sttChain } = await import('../stt-chain.js');

/** A stream the test writes to as it goes. */
function feed<T>(): { stream: ReadableStream<T>; put: (item: T) => void; end: () => void } {
  let controller: ReadableStreamDefaultController<T> | undefined;
  const stream = new ReadableStream<T>({
    start: (c) => {
      controller = c;
    },
  });
  return { stream, put: (item) => controller?.enqueue(item), end: () => controller?.close() };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    // eslint-disable-next-line no-await-in-loop -- each turn lets one more piped frame through
    await nextTick();
  }
}

/** 10 ms of someone talking. */
const frame = (): AudioFrame => new AudioFrame(new Int16Array(160).fill(900), 16_000, 1, 160);

/**
 * What the base STT hears over five frames, the middle three while Alex is heard apart
 * when `apart`: every sample, and how many frames were not silence.
 */
async function heardBySTT(apart: boolean): Promise<{ samples: number; loud: number }> {
  const session = { userData: {} };
  const audio = feed<AudioFrame>();
  const heard = { samples: 0, loud: 0 };
  let reading: Promise<void> = Promise.resolve();
  const base = async (
    input: ReadableStream<AudioFrame>
  ): Promise<ReadableStream<stt.SpeechEvent>> => {
    reading = (async () => {
      for await (const f of input) {
        heard.samples += f.samplesPerChannel;
        if (f.data.some((sample) => sample !== 0)) heard.loud += 1;
      }
    })();
    return Promise.resolve(new ReadableStream<stt.SpeechEvent>());
  };
  await sttChain(session, audio.stream, base);
  const people = peopleSpeechFor(session);
  audio.put(frame());
  await settle();
  if (apart) people.add('owner_web', feed<stt.SpeechEvent>().stream);
  for (let i = 0; i < 3; i++) audio.put(frame());
  await settle();
  people.remove('owner_web');
  audio.put(frame());
  audio.end();
  await reading;
  return heard;
}

describe('sttChain while people are heard apart', () => {
  beforeEach(() => {
    vi.stubEnv('FIRST_TURN_FAST', 'off');
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'off');
    vi.stubEnv('GROUP_CALL', 'on');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('STT keeps its clock: silence of the same length in place of each frame', async () => {
    const solo = await heardBySTT(false);
    const group = await heardBySTT(true);
    expect(solo).toEqual({ samples: 5 * 160, loud: 5 });
    expect(group).toEqual({ samples: 5 * 160, loud: 2 }); // the three heard apart: silence
  });

  it('with GROUP_CALL off, STT gets the input itself, even with someone heard apart', async () => {
    vi.stubEnv('GROUP_CALL', 'off');
    const session = { userData: {} };
    peopleSpeechFor(session).add('owner_web', feed<stt.SpeechEvent>().stream);
    const audio = new ReadableStream<AudioFrame>();
    const base = vi.fn(async () => Promise.resolve(new ReadableStream<stt.SpeechEvent>()));
    await sttChain(session, audio, base);
    expect(base).toHaveBeenCalledWith(audio);
  });
});
