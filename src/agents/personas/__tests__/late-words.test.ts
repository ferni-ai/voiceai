import { describe, expect, it, vi } from 'vitest';
import { llm, stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { FirstTurnGate, sttWithFirstTurnFast } from '../first-turn-fast.js';
import { isMergeableTail, lateWordsMerger, MAX_LATE_WORDS } from '../late-words.js';

const T = stt.SpeechEventType;
type Event = stt.SpeechEvent | string;
const FRAME_MS = 10;
const SAID = "Hey Ferni, it's been kind of a long";

const samples = (amp: number): Int16Array => new Int16Array(160).fill(amp);
const transcript = (type: stt.SpeechEventType, text: string): stt.SpeechEvent => ({
  type,
  alternatives: [
    { language: 'en' as stt.SpeechData['language'], text, startTime: 0, endTime: 0, confidence: 0 },
  ],
});
const texts = (events: Event[]): string[] =>
  events.map((e) => (typeof e === 'string' ? e : `${e.type}:${e.alternatives?.[0]?.text ?? ''}`));

/** An agent whose chat context holds turn 1 as the SDK committed it, reply in flight. */
const makeAgent = (...turn: Array<['user' | 'assistant', string]>) => {
  let ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'assistant', content: 'Hey Sam, up late tonight?' });
  for (const [role, content] of turn) ctx.addMessage({ role, content });
  return {
    get chatCtx() {
      return ctx;
    },
    updateChatCtx: vi.fn(async (next: llm.ChatContext) => {
      ctx = next;
    }),
  };
};
const userTexts = (agent: ReturnType<typeof makeAgent>) =>
  agent.chatCtx.items
    .filter((i) => (i as llm.ChatMessage).role === 'user')
    .map((i) => (i as llm.ChatMessage).textContent);

/** Turn 1 ended early by FIRST_TURN_FAST on SAID; returns the gate and what it emitted. */
function earlyEnd(lateWords?: FirstTurnGate['lateWords']) {
  let t = 0;
  const out: Event[] = [];
  const gate = new FirstTurnGate(() => t);
  gate.lateWords = lateWords;
  const frames = (ms: number, amp: number) => {
    for (let i = 0; i < ms / FRAME_MS; i++) {
      t += FRAME_MS;
      out.push(...gate.onFrame(samples(amp), FRAME_MS));
    }
  };
  frames(1000, 30);
  out.push(...gate.onEvent({ type: T.START_OF_SPEECH }));
  frames(2000, 3000);
  out.push(...gate.onEvent(transcript(T.INTERIM_TRANSCRIPT, SAID)));
  frames(1500, 30);
  expect(texts(out).slice(-2)).toEqual([`${T.FINAL_TRANSCRIPT}:${SAID}`, `${T.END_OF_SPEECH}:`]);
  const ink = (ev: stt.SpeechEvent) => {
    const before = out.length;
    out.push(...gate.onEvent(ev));
    return texts(out.slice(before));
  };
  return { ink };
}

describe('isMergeableTail', () => {
  it('takes a short tail and refuses questions, negations, crisis words and long tails', () => {
    expect(isMergeableTail(['day.'], SAID)).toBe(true);
    expect(isMergeableTail(['day', 'you', 'know?'], SAID)).toBe(false);
    expect(isMergeableTail(['not', 'really'], SAID)).toBe(false);
    expect(isMergeableTail(['kill', 'myself'], 'Honestly I want to')).toBe(false);
    expect(isMergeableTail(Array(MAX_LATE_WORDS + 1).fill('word'), SAID)).toBe(false);
  });
});

describe('late words of turn 1 with EOT_CONTINUED_MERGE', () => {
  it('joins a late word to turn 1 while the reply is being generated, instead of a new turn', () => {
    const agent = makeAgent(['user', SAID]);
    const session = { agentState: 'thinking' };
    const { ink } = earlyEnd(lateWordsMerger(agent, session));

    expect(ink(transcript(T.FINAL_TRANSCRIPT, `${SAID} day.`))).toEqual([]);
    expect(ink({ type: T.END_OF_SPEECH })).toEqual([]);
    expect(userTexts(agent)).toEqual([`${SAID} day.`]);
    expect(agent.updateChatCtx).toHaveBeenCalledTimes(1);
  });

  it('without the merger (flag off) the late word is a new turn, as before', () => {
    const { ink } = earlyEnd(undefined);
    expect(ink(transcript(T.FINAL_TRANSCRIPT, `${SAID} day.`))).toEqual([
      `${T.START_OF_SPEECH}:`,
      `${T.FINAL_TRANSCRIPT}:day.`,
    ]);
    expect(ink({ type: T.END_OF_SPEECH })).toEqual([`${T.END_OF_SPEECH}:`]);
  });

  it('keeps the new turn once Ferni is speaking', () => {
    const agent = makeAgent(['user', SAID]);
    const { ink } = earlyEnd(lateWordsMerger(agent, { agentState: 'speaking' }));
    expect(ink(transcript(T.FINAL_TRANSCRIPT, `${SAID} day.`))).toEqual([
      `${T.START_OF_SPEECH}:`,
      `${T.FINAL_TRANSCRIPT}:day.`,
    ]);
    expect(userTexts(agent)).toEqual([SAID]);
  });

  it('opens the new turn at once when the caller goes on past a short tail', () => {
    const agent = makeAgent(['user', SAID]);
    const { ink } = earlyEnd(lateWordsMerger(agent, { agentState: 'thinking' }));
    expect(ink(transcript(T.INTERIM_TRANSCRIPT, `${SAID} day`))).toEqual([]);
    expect(ink(transcript(T.INTERIM_TRANSCRIPT, `${SAID} day and then my boss`))).toEqual([
      `${T.START_OF_SPEECH}:`,
      `${T.INTERIM_TRANSCRIPT}:day and then my boss`,
    ]);
    expect(ink({ type: T.END_OF_SPEECH })).toEqual([`${T.END_OF_SPEECH}:`]);
    expect(userTexts(agent)).toEqual([SAID]);
  });

  it('falls back to a new turn when Ferni starts speaking before Ink ends', () => {
    const agent = makeAgent(['user', SAID]);
    const session = { agentState: 'thinking' };
    const { ink } = earlyEnd(lateWordsMerger(agent, session));
    expect(ink(transcript(T.FINAL_TRANSCRIPT, `${SAID} day.`))).toEqual([]);
    session.agentState = 'speaking';
    expect(ink({ type: T.END_OF_SPEECH })).toEqual([
      `${T.START_OF_SPEECH}:`,
      `${T.FINAL_TRANSCRIPT}:day.`,
      `${T.END_OF_SPEECH}:`,
    ]);
    expect(userTexts(agent)).toEqual([SAID]);
  });

  it('falls back when turn 1 is not in the context yet, or Ferni already answered it', () => {
    for (const agent of [makeAgent(), makeAgent(['user', SAID], ['assistant', 'Long day?'])]) {
      const { ink } = earlyEnd(lateWordsMerger(agent, { agentState: 'listening' }));
      ink(transcript(T.FINAL_TRANSCRIPT, `${SAID} day.`));
      expect(ink({ type: T.END_OF_SPEECH })).toEqual([
        `${T.START_OF_SPEECH}:`,
        `${T.FINAL_TRANSCRIPT}:day.`,
        `${T.END_OF_SPEECH}:`,
      ]);
      expect(agent.updateChatCtx).not.toHaveBeenCalled();
    }
  });
});

describe('sttWithFirstTurnFast with EOT_CONTINUED_MERGE (the STT node path)', () => {
  const frame = (amp: number): AudioFrame => new AudioFrame(samples(amp), 16000, 1, 160);

  const run = async (env: Record<string, string>) => {
    let t = 0;
    const agent = makeAgent(['user', SAID]);
    const session = { agentState: 'thinking', currentAgent: agent };
    const ink: Array<[number, stt.SpeechEvent]> = [
      [50, { type: T.START_OF_SPEECH }],
      [299, transcript(T.INTERIM_TRANSCRIPT, SAID)],
      [440, transcript(T.FINAL_TRANSCRIPT, `${SAID} day.`)],
      [441, { type: T.END_OF_SPEECH }],
    ];
    const frames = [
      ...Array.from({ length: 100 }, () => frame(30)),
      ...Array.from({ length: 200 }, () => frame(3000)),
      ...Array.from({ length: 150 }, () => frame(30)),
    ];
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
              for (const [at, ev] of ink) if (at === i) c.enqueue(ev);
              const { done } = await reader.read();
              if (done) break;
              t += FRAME_MS;
            }
            c.close();
          },
        }),
      env,
      new FirstTurnGate(() => t)
    );
    const out: Event[] = [];
    for await (const ev of got!) out.push(ev);
    return { out: texts(out), agent };
  };

  it('on: one turn 1 with the late word in it; off: a second turn', async () => {
    const on = await run({ FIRST_TURN_FAST: 'on', EOT_CONTINUED_MERGE: 'on' });
    const early = [`${T.FINAL_TRANSCRIPT}:${SAID}`, `${T.END_OF_SPEECH}:`];
    expect(on.out.slice(-2)).toEqual(early);
    expect(userTexts(on.agent)).toEqual([`${SAID} day.`]);

    const off = await run({ FIRST_TURN_FAST: 'on' });
    expect(off.out.slice(-5)).toEqual([
      ...early,
      `${T.START_OF_SPEECH}:`,
      `${T.FINAL_TRANSCRIPT}:day.`,
      `${T.END_OF_SPEECH}:`,
    ]);
    expect(userTexts(off.agent)).toEqual([SAID]);
  });
});
