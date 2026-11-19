/**
 * Builders for the floor arbiter tests: fake per-person speech events, a way to
 * run them through the arbiter, and small readers for what comes out.
 */
import type { stt } from '@livekit/agents';
import { asLanguageCode } from '@livekit/agents';
import { floorArbiter, type PersonSpeechEvent } from '../floor-arbiter.js';

export const ALEX = { identity: 'owner_web', label: 'Alex' };
export const SARAH = { identity: 'guest_call1', label: 'Sarah (guest)' };
export type Person = typeof ALEX;

export function alt(text: string, startTime = 0, endTime = 0): stt.SpeechData {
  return { language: asLanguageCode('en'), text, startTime, endTime, confidence: 0.9 };
}

/** One event from `person`'s own stream, with one alternative when `text` is given. */
export function said(
  person: Person,
  type: stt.SpeechEventType,
  text?: string,
  times: [number, number] = [0, 0]
): PersonSpeechEvent {
  const event: stt.SpeechEvent =
    text === undefined ? { type } : { type, alternatives: [alt(text, times[0], times[1])] };
  return { ...person, event };
}

/** The events as one async stream, the shape the per-person merge hands the arbiter. */
function feed(items: PersonSpeechEvent[]): AsyncIterable<PersonSpeechEvent> {
  return {
    [Symbol.asyncIterator]: () => {
      const queue = [...items];
      return {
        next: async () => {
          const value = queue.shift();
          return Promise.resolve(
            value === undefined ? { done: true, value: undefined } : { done: false, value }
          );
        },
      };
    },
  };
}

/** Everything the arbiter emits for `items` on `session`'s call, read to the end. */
export async function run(
  items: PersonSpeechEvent[],
  session: object = {}
): Promise<stt.SpeechEvent[]> {
  const out: stt.SpeechEvent[] = [];
  for await (const ev of floorArbiter(session, feed(items))) out.push(ev);
  return out;
}

export const types = (events: stt.SpeechEvent[]): stt.SpeechEventType[] =>
  events.map((e) => e.type);
export const texts = (events: stt.SpeechEvent[]): string[] =>
  events.map((e) => e.alternatives?.[0]?.text ?? '');
export const ofType = (events: stt.SpeechEvent[], type: stt.SpeechEventType): stt.SpeechEvent[] =>
  events.filter((e) => e.type === type);

export const tick = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
