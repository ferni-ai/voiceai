import { describe, expect, it } from 'vitest';
import { stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import {
  FirstTurnGate,
  MIN_SPEECH_MS,
  SILENCE_MS,
  STABLE_MS,
  sttWithFirstTurnFast,
} from '../first-turn-fast.js';

const T = stt.SpeechEventType;
const FRAME_MS = 10;
type Event = stt.SpeechEvent | string;

const samples = (amp: number): Int16Array => new Int16Array(160).fill(amp);
const transcript = (type: stt.SpeechEventType, text: string): stt.SpeechEvent => ({
  type,
  alternatives: [
    { language: 'en' as stt.SpeechData['language'], text, startTime: 0, endTime: 0, confidence: 0 },
  ],
});
const texts = (events: Event[]): string[] =>
  events.map((e) => (typeof e === 'string' ? e : `${e.type}:${e.alternatives?.[0]?.text ?? ''}`));

/** Drives a gate with 10 ms frames on a fake clock and collects what it passes on. */
class Call {
  t = 0;
  out: Event[] = [];
  gate = new FirstTurnGate(() => this.t);

  frames(ms: number, amp: number): void {
    for (let i = 0; i < ms / FRAME_MS; i++) {
      this.t += FRAME_MS;
      this.out.push(...this.gate.onFrame(samples(amp), FRAME_MS));
    }
  }
  speak(ms: number): void {
    this.frames(ms, 3000);
  }
  quiet(ms: number): void {
    this.frames(ms, 30);
  }
  ink(ev: stt.SpeechEvent): void {
    this.out.push(...this.gate.onEvent(ev));
  }
  /** Caller says `text` for `ms` after a quiet line; Ink starts the turn and keeps up. */
  firstSentence(text: string, ms = 2000): void {
    this.quiet(1000);
    this.ink({ type: T.START_OF_SPEECH });
    this.speak(ms);
    this.ink(transcript(T.INTERIM_TRANSCRIPT, text));
  }
}

describe('FirstTurnGate', () => {
  it('ends turn 1 on silence when Ink is late, and drops Ink’s own end of it', () => {
    const c = new Call();
    c.firstSentence("Hey Ferni, it's been kind of a long day");
    c.quiet(SILENCE_MS - 20);
    expect(c.out.filter((e) => typeof e !== 'string' && e.type === T.END_OF_SPEECH)).toHaveLength(
      0
    );
    c.quiet(40);
    expect(texts(c.out.slice(-2))).toEqual([
      `${T.FINAL_TRANSCRIPT}:Hey Ferni, it's been kind of a long day`,
      `${T.END_OF_SPEECH}:`,
    ]);

    const before = c.out.length;
    c.quiet(400);
    c.ink(transcript(T.FINAL_TRANSCRIPT, "Hey Ferni, it's been kind of a long day."));
    c.ink({ type: T.END_OF_SPEECH });
    expect(c.out.length).toBe(before); // one committed turn, not two
  });

  it('leaves turn 1 to Ink when Ink ends it first', () => {
    const c = new Call();
    c.firstSentence('Hey Ferni, long day');
    c.quiet(300);
    c.ink(transcript(T.FINAL_TRANSCRIPT, 'Hey Ferni, long day.'));
    c.ink({ type: T.END_OF_SPEECH });
    c.quiet(3000);
    expect(texts(c.out)).toEqual([
      `${T.START_OF_SPEECH}:`,
      `${T.INTERIM_TRANSCRIPT}:Hey Ferni, long day`,
      `${T.FINAL_TRANSCRIPT}:Hey Ferni, long day.`,
      `${T.END_OF_SPEECH}:`,
    ]);
  });

  it('does not end the turn on a pause shorter than the silence window', () => {
    const c = new Call();
    c.firstSentence('So I was thinking');
    c.quiet(SILENCE_MS - 100);
    c.speak(500);
    c.quiet(SILENCE_MS - 100);
    expect(c.out.some((e) => typeof e !== 'string' && e.type === T.END_OF_SPEECH)).toBe(false);
  });

  it('does not end a short first turn', () => {
    const c = new Call();
    c.firstSentence('Hi there', MIN_SPEECH_MS - 200);
    c.quiet(3000);
    expect(c.out.some((e) => typeof e !== 'string' && e.type === T.END_OF_SPEECH)).toBe(false);
  });

  it('waits until Ink’s transcript has stopped changing', () => {
    const c = new Call();
    c.firstSentence("Hey Ferni, it's been kind of a");
    c.quiet(SILENCE_MS - 200);
    // Ink's late last words land before the silence window closes.
    c.ink(transcript(T.INTERIM_TRANSCRIPT, "Hey Ferni, it's been kind of a long day"));
    c.quiet(STABLE_MS - 20);
    expect(c.out.some((e) => typeof e !== 'string' && e.type === T.END_OF_SPEECH)).toBe(false);
    c.quiet(40);
    expect(texts(c.out.slice(-2))[0]).toBe(
      `${T.FINAL_TRANSCRIPT}:Hey Ferni, it's been kind of a long day`
    );
  });

  it('passes on words the caller adds after the early end as a new turn', () => {
    const c = new Call();
    c.firstSentence('Hey Ferni, so I got the job');
    c.quiet(SILENCE_MS + STABLE_MS);
    const before = c.out.length;
    c.speak(600);
    c.ink(transcript(T.INTERIM_TRANSCRIPT, 'Hey Ferni, so I got the job at the bakery'));
    c.ink(transcript(T.FINAL_TRANSCRIPT, 'Hey Ferni, so I got the job at the bakery.'));
    c.ink({ type: T.END_OF_SPEECH });
    expect(texts(c.out.slice(before))).toEqual([
      `${T.START_OF_SPEECH}:`,
      `${T.INTERIM_TRANSCRIPT}:at the bakery`,
      `${T.FINAL_TRANSCRIPT}:at the bakery.`,
      `${T.END_OF_SPEECH}:`,
    ]);
  });

  it('never touches turn 2', () => {
    for (const inkFirst of [true, false]) {
      const c = new Call();
      c.firstSentence("Hey Ferni, it's been kind of a long day");
      if (inkFirst) {
        c.ink(transcript(T.FINAL_TRANSCRIPT, "Hey Ferni, it's been kind of a long day."));
        c.ink({ type: T.END_OF_SPEECH });
      } else {
        c.quiet(SILENCE_MS + STABLE_MS);
        c.ink(transcript(T.FINAL_TRANSCRIPT, "Hey Ferni, it's been kind of a long day."));
        c.ink({ type: T.END_OF_SPEECH });
      }
      const before = c.out.length;
      c.ink({ type: T.START_OF_SPEECH });
      c.speak(2000);
      c.ink(transcript(T.INTERIM_TRANSCRIPT, 'Work was just a lot this week honestly'));
      c.quiet(3000);
      expect(texts(c.out.slice(before))).toEqual([
        `${T.START_OF_SPEECH}:`,
        `${T.INTERIM_TRANSCRIPT}:Work was just a lot this week honestly`,
      ]);
    }
  });
});

describe('sttWithFirstTurnFast', () => {
  const frame = (amp: number): AudioFrame => new AudioFrame(samples(amp), 16000, 1, 160);
  const collect = async (s: ReadableStream<Event>): Promise<Event[]> => {
    const out: Event[] = [];
    for await (const ev of s) out.push(ev);
    return out;
  };

  it('is the plain STT node with the flag off', async () => {
    const events = new ReadableStream<Event>();
    const audio = new ReadableStream<AudioFrame>();
    const got = await sttWithFirstTurnFast(
      {},
      audio,
      async (a) => (a === audio ? events : null),
      {}
    );
    expect(got).toBe(events);
  });

  it('feeds the audio through the gate and injects the early end into the STT events', async () => {
    let t = 0;
    const gate = new FirstTurnGate(() => t);
    const ink: stt.SpeechEvent[] = [
      { type: T.START_OF_SPEECH },
      transcript(T.INTERIM_TRANSCRIPT, 'Hey Ferni, it has been a long day'),
    ];
    const frames = [
      ...Array.from({ length: 100 }, () => frame(30)),
      ...Array.from({ length: 200 }, () => frame(3000)),
      ...Array.from({ length: 150 }, () => frame(30)),
    ];
    const session = {};
    const got = await sttWithFirstTurnFast(
      session,
      new ReadableStream<AudioFrame>({
        pull(c) {
          const f = frames.shift();
          if (f) c.enqueue(f);
          else c.close();
        },
      }),
      async (audio) =>
        new ReadableStream<Event>({
          async start(c) {
            const reader = audio.getReader();
            for (let i = 0; ; i++) {
              if (i === 50) c.enqueue(ink[0]!);
              if (i === 299) c.enqueue(ink[1]!); // the transcript as speech stops
              const { done } = await reader.read();
              if (done) break;
              t += FRAME_MS;
            }
            c.close();
          },
        }),
      { FIRST_TURN_FAST: 'on' },
      gate
    );
    const out = texts(await collect(got!));
    expect(out.slice(-2)).toEqual([
      `${T.FINAL_TRANSCRIPT}:Hey Ferni, it has been a long day`,
      `${T.END_OF_SPEECH}:`,
    ]);

    // Turn 1 happens once per call: a later STT stream on the session is plain.
    const later = new ReadableStream<Event>();
    expect(
      await sttWithFirstTurnFast(session, new ReadableStream(), async () => later, {
        FIRST_TURN_FAST: 'on',
      })
    ).toBe(later);
  });
});
