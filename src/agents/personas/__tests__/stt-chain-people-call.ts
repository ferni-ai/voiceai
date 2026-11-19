/**
 * The STT chain on a fresh call with people heard apart, for the sttChain tests: a fake
 * base STT that counts the audio it hears, and ways to make people speak.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import { asLanguageCode, stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { type Mock, vi } from 'vitest';
import type { PersonSpeechEvent } from '../../group-conversation/floor-arbiter.js';
import { type PeopleSpeech, peopleSpeechFor } from '../../group-conversation/people-speech.js';
import {
  type Person,
  SARAH,
  said,
} from '../../group-conversation/__tests__/person-speech-events.js';
import { sttChain } from '../stt-chain.js';

const { START_OF_SPEECH, FINAL_TRANSCRIPT } = stt.SpeechEventType;
type Event = stt.SpeechEvent | string;

/** A stream the test writes to as it goes. */
export interface Feed<T> {
  stream: ReadableStream<T>;
  cancelled: Mock;
  put: (item: T) => void;
  end: () => void;
  fail: (error: Error) => void;
}

export function feed<T>(): Feed<T> {
  let controller: ReadableStreamDefaultController<T> | undefined;
  const cancelled = vi.fn();
  const stream = new ReadableStream<T>({
    start: (c) => {
      controller = c;
    },
    cancel: cancelled,
  });
  return {
    stream,
    cancelled,
    put: (item: T) => controller?.enqueue(item),
    end: () => controller?.close(),
    fail: (error: Error) => controller?.error(error),
  };
}

/** Lets queued stream reads and relays run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    // eslint-disable-next-line no-await-in-loop -- each turn lets one more pending step run
    await nextTick();
  }
}

/** 10 ms of someone talking. */
export const frame = (): AudioFrame =>
  new AudioFrame(new Int16Array(160).fill(900), 16_000, 1, 160);

export const final = (text: string): stt.SpeechEvent => ({
  type: FINAL_TRANSCRIPT,
  alternatives: [
    { text, language: asLanguageCode('en'), startTime: 0, endTime: 1, confidence: 0.9 },
  ],
});
export const textOf = (event: Event | undefined): string | undefined =>
  typeof event === 'string' ? event : event?.alternatives?.[0]?.text;

/**
 * The chain on a fresh call. The base STT reads its audio to the end, counting samples
 * and the frames that are not silence, and says what the test says on the mixed input.
 */
export interface Call {
  people: PeopleSpeech;
  audio: Feed<AudioFrame>;
  mixedSaid: Feed<Event>;
  out: Event[];
  outcome: { ended: boolean; error?: unknown };
  heard: { samples: number; loudFrames: number };
  hearApart: (person: Person) => (type: stt.SpeechEventType, text?: string) => Promise<void>;
  nextChainHears: () => Promise<IteratorResult<PersonSpeechEvent> | 'nothing'>;
  cancel: () => Promise<void>;
  sttRead: () => Promise<void>;
}

export async function call({ read = true } = {}): Promise<Call> {
  const session = { userData: {} };
  const audio = feed<AudioFrame>();
  const mixedSaid = feed<Event>();
  const heard = { samples: 0, loudFrames: 0 };
  let sttRead: Promise<void> = Promise.resolve();
  const base = vi.fn(async (input: ReadableStream<AudioFrame>) => {
    await Promise.resolve();
    sttRead = (async () => {
      for await (const f of input) {
        heard.samples += f.samplesPerChannel;
        if (f.data.some((sample) => sample !== 0)) heard.loudFrames += 1;
      }
    })();
    return mixedSaid.stream;
  });
  const chained = await sttChain(session, audio.stream, base);
  if (!chained) throw new Error('no STT stream');
  const reader = chained.getReader();
  const out: Event[] = [];
  const outcome: { ended: boolean; error?: unknown } = { ended: false };
  if (read)
    void (async () => {
      // eslint-disable-next-line no-await-in-loop -- the output is read in order, as the SDK does
      for (let next = await reader.read(); !next.done; next = await reader.read()) {
        out.push(next.value);
      }
      outcome.ended = true;
    })().catch((error: unknown) => {
      outcome.error = error;
    });
  const people = peopleSpeechFor(session);
  /** `person` heard on their own stream from now on; returns how to make them speak. */
  const hearApart = (person: Person) => {
    const own = feed<PersonSpeechEvent>();
    people.add(person.identity, own.stream);
    return async (type: stt.SpeechEventType, text?: string): Promise<void> => {
      own.put(said(person, type, text));
      await settle();
    };
  };
  /** What a chain opened after this one hears first, or `nothing`. */
  const nextChainHears = async (): Promise<IteratorResult<PersonSpeechEvent> | 'nothing'> =>
    Promise.race([people.listen().next(), settle().then(() => 'nothing' as const)]);
  return {
    people,
    audio,
    mixedSaid,
    out,
    outcome,
    heard,
    hearApart,
    nextChainHears,
    cancel: async () => reader.cancel(),
    sttRead: async () => sttRead,
  };
}

export const typesOf = (events: Event[]): Array<stt.SpeechEventType | string> =>
  events.map((e) => (typeof e === 'string' ? e : e.type));
export const saidBySarah = { done: false, value: said(SARAH, START_OF_SPEECH) };
