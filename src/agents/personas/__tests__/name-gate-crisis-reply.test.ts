/**
 * NAME_GATE_V2 and NAME_FALLING_SPLIT on a guided crisis reply.
 *
 * crisis-gate.ts runs every model-written reply through withNameGate, including a reply written
 * with crisis guidance, and the TTS gateway runs the spoken text through withFallingVocative
 * (continuation-tts.ts). With either flag on, the only change to such a reply is the caller's
 * name: every other word stays, in order, and 988 and 911 are always said. All lines fictional.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withFallingVocative } from '../../../speech/tts-gateway/name-intonation.js';
import { withNameGate, type HistoryItem } from '../name-gate.js';

const NAME = 'Riley';
const V2 = { NAME_FALLING_INTONATION: 'on', NAME_GATE_V2: 'on' };
const V2_SPLIT = { ...V2, NAME_FALLING_SPLIT: 'on' };
const FLAGS = [
  ['NAME_GATE_V2', V2],
  ['NAME_GATE_V2 + NAME_FALLING_SPLIT', V2_SPLIT],
] as const;

const msg = (role: string, textContent: string): HistoryItem => ({
  type: 'message',
  role,
  textContent,
});
/** Mid-call, the name said two replies ago: the gate drops a vocative here. */
const MID_CALL: HistoryItem[] = [
  msg('assistant', 'Hey Riley. Good to hear you.'),
  msg('user', 'Yeah.'),
  msg('assistant', 'Tell me more.'),
  msg('user', 'It has been a lot.'),
];
/** The call's first reply: the gate may keep one name. */
const FIRST_REPLY: HistoryItem[] = [msg('user', 'Hello?')];

/** Guided crisis replies with the name opening, inside and closing a sentence. */
const NAMED = [
  ['opening', 'Riley, please call or text 988 right now.', 'Please call or text 988 right now.'],
  [
    'mid-sentence',
    "I'm here with you, Riley, and 988 is there tonight.",
    "I'm here with you, and 988 is there tonight.",
  ],
  ['closing', "If you're in danger, call 911, Riley.", "If you're in danger, call 911."],
] as const;
const UNNAMED = "Please call or text 988 right now. I'm staying right here with you.";

/** The spoken words, in order, without case. */
const words = (text: string): string[] =>
  (text.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? []).map((w) => w.replace('’', "'"));
const withoutName = (text: string): string[] => words(text).filter((w) => w !== 'riley');
const numbers = (text: string): string[] => text.match(/\d+/g) ?? [];

function streamOf(text: string, whole: boolean): ReadableStream<string> {
  const pieces = whole ? [text] : (text.match(/\S+\s*/g) ?? []);
  return new ReadableStream<string>({
    start(c) {
      for (const p of pieces) c.enqueue(p);
      c.close();
    },
  });
}

/** The reply as crisis-gate.ts lets it out: streamed a word at a time like the LLM, or whole. */
async function gated(
  text: string,
  history: readonly HistoryItem[],
  env: Record<string, string>,
  whole = false
): Promise<string> {
  let out = '';
  const stream = withNameGate(streamOf(text, whole), { name: NAME, history, env });
  for await (const chunk of stream as unknown as AsyncIterable<string>) out += chunk;
  return out;
}

/** The text the TTS gateway speaks for it (continuation-tts.ts). */
async function spoken(text: string, env: Record<string, string>): Promise<string> {
  let out = '';
  const stream = withFallingVocative(streamOf(text, false) as never, env, NAME, { holdMs: 0 });
  for await (const chunk of stream as unknown as AsyncIterable<string>) out += chunk;
  return out;
}

describe.each(FLAGS)('%s: a guided crisis reply loses only the name', (_label, env) => {
  it.each(NAMED)('%s name, mid-call: dropped, every other word kept', async (_at, line, want) => {
    for (const whole of [false, true]) {
      const out = await gated(line, MID_CALL, env, whole);
      expect(out, `whole=${whole}`).toBe(want);
      expect(words(out)).toEqual(withoutName(line));
      expect(numbers(out)).toEqual(numbers(line)); // 988 and 911 are said
    }
  });

  it.each(NAMED)('%s name, first reply: kept or dropped, nothing else', async (_at, line) => {
    for (const whole of [false, true]) {
      const out = await gated(line, FIRST_REPLY, env, whole);
      expect(withoutName(out), `whole=${whole}`).toEqual(withoutName(line));
      expect(numbers(out)).toEqual(numbers(line));
    }
  });

  it('a reply without the name comes back unchanged', async () => {
    expect(await gated(UNNAMED, MID_CALL, env)).toBe(UNNAMED);
    expect(await gated(UNNAMED, MID_CALL, env, true)).toBe(UNNAMED);
  });

  it('a reply that is only the name is still said, never silence', async () => {
    expect(await gated('Riley?', MID_CALL, env)).toBe('Riley?');
  });

  it('the TTS gateway changes punctuation and case only, never words', async () => {
    for (const [, line] of NAMED) {
      const out = await spoken(line, env);
      expect(words(out)).toEqual(words(line));
      expect(numbers(out)).toEqual(numbers(line));
    }
    expect(await spoken(UNNAMED, env)).toBe(UNNAMED);
  });
});

describe('NAME_FALLING_SPLIT reaches a crisis reply in the TTS gateway', () => {
  it('a kept opening name ends its own sentence; the words and 988 stay', async () => {
    // Pre: without the split, the opening is said as written.
    expect(await spoken(NAMED[0][1], V2)).toBe(NAMED[0][1]);
    expect(await spoken(NAMED[0][1], V2_SPLIT)).toBe('Riley. Please call or text 988 right now.');
  });

  it('a hello after an interjection loses only the interjection; the rest and 988 stay', async () => {
    const line = 'Oh hey Riley, please call or text 988 right now.';
    // Pre: without the split, the line is said as written.
    expect(await spoken(line, V2)).toBe(line);
    const out = await spoken(line, V2_SPLIT);
    expect(out).toBe('Hey Riley. Please call or text 988 right now.');
    expect(words(out)).toEqual(words(line).slice(1)); // only "oh" goes
    expect(numbers(out)).toEqual(['988']);
    // An interjection straight before the name is not a hello: nothing changes.
    const bare = 'Oh Riley, please call or text 988 right now.';
    expect(await spoken(bare, V2_SPLIT)).toBe(bare);
  });

  describe('when the split holds past its limit', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('the held opening goes out on the timer, and the rest with 988 follows', async () => {
      vi.useFakeTimers();
      // After "Riley, " the split waits to see whether a list follows; the plain path has
      // decided. The split only ever holds the opening words, so 988 comes after the hold.
      const head = 'Riley, ';
      const line = `${head}please call or text 988 right now.`;
      let feed!: ReadableStreamDefaultController<string>;
      const source = new ReadableStream<string>({
        start(c) {
          feed = c;
        },
      });
      const out: string[] = [];
      const stream = withFallingVocative(source as never, V2_SPLIT, NAME, { holdMs: 150 });
      const done = (async () => {
        for await (const chunk of stream as unknown as AsyncIterable<string>) out.push(chunk);
      })();

      feed.enqueue(head);
      await vi.advanceTimersByTimeAsync(149);
      expect(out.join('')).toBe(''); // still held
      await vi.advanceTimersByTimeAsync(1);
      expect(out.join('')).toBe(head); // the timer let it out, as written

      for (const piece of line.slice(head.length).match(/\S+\s*/g) ?? []) feed.enqueue(piece);
      feed.close();
      await done;
      expect(out.join('')).toBe(line);
      expect(numbers(out.join(''))).toEqual(['988']);
    });
  });
});
