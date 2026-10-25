import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import {
  CRISIS_LINE_SPOKEN,
  crisisLineSpeechTransform,
  offersCrisisLine,
  speakCrisisLine,
} from '../crisis-line-speech.js';

const S = CRISIS_LINE_SPOKEN;

describe('speakCrisisLine', () => {
  it.each([
    // Spelled-out wrong forms: always rewritten, cue or not.
    ['Try ninety-eight-eight.', `Try ${S}.`],
    ['ninety eight eight', S],
    ['Ninety-eighty-eight is free.', `${S} is free.`],
    ['ninety eighty eight', S],
    ['nine eighty-eight', S],
    ['nine-eighty-eight', S],
    ['nine eighty eight', S],
    // Digit forms next to a crisis-line cue.
    ['Call 988.', `Call ${S}.`],
    ['You can call or text 988 any time.', `You can call or text ${S} any time.`],
    ['Dial 9-8-8 now.', `Dial ${S} now.`],
    ['text 9 8 8', `text ${S}`],
    ['988 is the crisis line.', `${S} is the crisis line.`],
    ['988 (Suicide & Crisis Lifeline)', `${S} (Suicide & Crisis Lifeline)`],
    ['the hotline, 988, is open', `the hotline, ${S}, is open`],
    [
      'You can call 988 Suicide & Crisis Lifeline at 988.',
      `You can call ${S} Suicide & Crisis Lifeline at ${S}.`,
    ],
    // Already spoken: unchanged.
    [`call ${S}`, `call ${S}`],
  ])('%s → %s', (input, output) => {
    expect(speakCrisisLine(input)).toBe(output);
  });

  it.each([
    'It cost $988 in the end.',
    'There were 988 people there.',
    'We drove 988 miles.',
    'She is in room 988.',
    'Back in 1988 we met.',
    'It weighed 988.5 grams.',
    'That makes 1,988 total.',
    'Score went to 9880.',
    'up 988% this year',
    'nine eight eight hundred',
    'ninety-eight percent of people',
    'nine o clock',
  ])('leaves "%s" alone', (input) => {
    expect(speakCrisisLine(input)).toBe(input);
  });

  it('rewrites only matches inside [from, to)', () => {
    const text = 'call 988 and call 988';
    expect(speakCrisisLine(text, 9)).toBe(`call 988 and call ${S}`);
    expect(speakCrisisLine(text, 0, 9)).toBe(`call ${S} and call 988`);
  });
});

async function stream(chunks: string[], env: Record<string, string> = {}): Promise<string[]> {
  const out: string[] = [];
  const source = new ReadableStream<string>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });
  for await (const chunk of source.pipeThrough(crisisLineSpeechTransform(env))) out.push(chunk);
  return out;
}

describe('crisisLineSpeechTransform', () => {
  it('rewrites a form split across chunks', async () => {
    const out = await stream(['Call or text nin', 'ety', '-eigh', 'ty-eight', ' any time.']);
    expect(out.join('')).toBe(`Call or text ${S} any time.`);
  });

  it('rewrites digits split across chunks with the cue in an earlier chunk', async () => {
    const out = await stream(['You can call', ' 9', '8', '8 tonight.']);
    expect(out.join('')).toBe(`You can call ${S} tonight.`);
  });

  it('sees a cue that arrives after the digits', async () => {
    const out = await stream(['It is 988', ', the', ' crisis', ' line.']);
    expect(out.join('')).toBe(`It is ${S}, the crisis line.`);
  });

  it('keeps a non-crisis 988 and every other character', async () => {
    const text = ['We drove 988', ' miles, nine', ' of us, in ', 'ninety minutes.'];
    expect((await stream(text)).join('')).toBe(text.join(''));
  });

  it('passes text with no risky words through without holding it back', async () => {
    expect(await stream(['Hello there, ', 'how are you? '])).toEqual([
      'Hello there, ',
      'how are you? ',
    ]);
  });

  it('copes with empty and whitespace-only chunks', async () => {
    const out = await stream(['', 'Call', ' ', '', '988', '', ' now.']);
    expect(out.join('')).toBe(`Call ${S} now.`);
  });

  it('with SPEAK_988_DIGITS off passes text through unchanged', async () => {
    const chunks = ['Call ninety-', 'eight-eight or text 988.'];
    expect((await stream(chunks, { SPEAK_988_DIGITS: 'off' })).join('')).toBe(chunks.join(''));
  });
});

describe('offersCrisisLine (a finished transcript, written forms kept)', () => {
  it.each([
    'You can call or text 988, any time.',
    'the 988 Suicide & Crisis Lifeline.',
    'You can call or text 9-8-8 any time',
    'You can call 9 8 8 whenever you need',
    'You can call or text nine eight eight any time',
    'Nine-eight-eight is there around the clock.',
    'please call ninety-eight-eight tonight',
    'nine eighty-eight is free',
    'the Suicide and Crisis Lifeline',
    'There is a crisis line you can call',
    'the Crisis Text Line is there too',
    'You can call the suicide hotline any time.',
    "There's a crisis hotline you can call.",
    'You can call nine, eight, eight.',
    'text HOME to 741741',
    'text home to 741-741',
    'text HOME to 7 4 1 7 4 1',
    'text home to seven four one seven four one',
    '988',
  ])('a crisis line: %s', (line) => {
    expect(offersCrisisLine(line)).toBe(true);
  });

  it.each([
    'That trip cost $988 all in.',
    'I watched a film from 1988 last night.',
    'Order 98812 shipped today.',
    'Text home to say you are running late.',
    'Your crisis of confidence will pass.',
    'The suicide rate in the study fell.',
    'How was the week?',
  ])('not a crisis line: %s', (line) => {
    expect(offersCrisisLine(line)).toBe(false);
  });
});
