import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';

import {
  NAME_EVERY,
  applyVocatives,
  findVocatives,
  firstNameOf,
  mayUseName,
  withNameGate,
  type HistoryItem,
} from '../name-gate.js';

/** The reply with every vocative "Sam" dropped (what a mid-call reply gets). */
const strip = (text: string, name = 'Sam'): string =>
  applyVocatives(text, findVocatives(text, name, true).found, () => false, false);
const keep = (text: string, falling = false): string =>
  applyVocatives(text, findVocatives(text, 'Sam', true).found, () => true, falling);

const msg = (role: string, textContent: string): HistoryItem => ({
  type: 'message',
  role,
  textContent,
});
/** A call so far: Ferni's greeting with the name, then `n` exchanges without it. */
const callWith = (n: number, last = 'Yeah.'): HistoryItem[] => [
  msg('system', 'You are Ferni.'),
  msg('assistant', 'Hey Sam. Afternoon.'),
  ...Array.from({ length: n }, (_, i) => [
    msg('user', `Thing ${i}.`),
    msg('assistant', `Reply ${i}.`),
  ]).flat(),
  msg('user', last),
];

async function run(
  chunks: string[],
  history: HistoryItem[],
  env: Record<string, string> = {}
): Promise<string> {
  const input = new ReadableStream<object | string>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
  let out = '';
  for await (const ch of withNameGate(input, {
    name: 'Sam',
    history,
    env,
  }) as unknown as AsyncIterable<string>)
    out += ch;
  return out;
}

describe('vocative names', () => {
  it('drops the name addressing the caller, as the prod call used it', () => {
    expect(strip('I am, Sam.')).toBe('I am.');
    expect(strip("Yes, Sam, I'm sure.")).toBe("Yes, I'm sure.");
    expect(strip('Really. … Sam')).toBe('Really. … ');
    expect(strip('Sam, really? Again?')).toBe('Really? Again?');
    expect(strip('What about you, Sam?')).toBe('What about you?');
    expect(strip("I don't track it all, Sam, but I'm listening.")).toBe(
      "I don't track it all, but I'm listening."
    );
    expect(strip("But honestly, Sam, you're the one stuck in it.")).toBe(
      "But honestly, you're the one stuck in it."
    );
    expect(strip('Hey Sam, afternoon. How was it?')).toBe('Afternoon. How was it?');
    expect(strip('<emotion value="sympathetic"/>Long days stick to you, Sam.')).toBe(
      '<emotion value="sympathetic"/>Long days stick to you.'
    );
  });

  it('keeps the name when it is not addressing them', () => {
    for (const text of [
      'Tell Sam I said hi.',
      "Sam's sister called?",
      'Your name is Sam.',
      'My friend, Sam, called yesterday.',
      'Sam and I go way back.',
      'Samantha, really?',
      'Same, honestly.',
      ', Sam said it first.',
      'That was my friend, Sam.',
      'Her son, Sam, just started school.',
      'My cousin, Sam, I think you met him.',
      'I invited Alex, Jo, Sam.',
      'Who should go first? Sam.',
      "Who's driving? Sam, I think.",
      'I talked to Dr. Sam, he said rest.',
    ]) {
      expect(strip(text)).toBe(text);
    }
    expect(strip('I talked to my brother, Bill.', 'Bill')).toBe('I talked to my brother, Bill.');
    expect(strip("Mary-Kate's coming over? Fun.", 'Mary')).toBe("Mary-Kate's coming over? Fun.");
    expect(strip('April, May, I think it was.', 'May')).toBe('April, May, I think it was.');
    expect(strip('May, June, July. Busy months.', 'May')).toBe('May, June, July. Busy months.');
    expect(strip('That is rough, May.', 'May')).toBe('That is rough.');
  });

  it('drops it past markup in the middle of a reply', () => {
    expect(strip('Okay. [laughter] Sam, stop.')).toBe('Okay. [laughter] Stop.');
  });

  it('with the falling-name delivery, a kept name ends its own sentence', () => {
    expect(keep('Sam, take care.', true)).toBe('Sam. Take care.');
    expect(keep("Yes, Sam, I'm sure.", true)).toBe("Yes, Sam. I'm sure.");
    expect(keep('Talk soon, Sam.', true)).toBe('Talk soon, Sam.'); // already falls
    expect(keep('Sam, take care.', false)).toBe('Sam, take care.');
  });
});

describe('when the name may be said', () => {
  it('in the first reply, at goodbye, and once every NAME_EVERY replies', () => {
    expect(mayUseName([msg('system', 'x')], 'Sam')).toBe(true);
    expect(mayUseName(callWith(1), 'Sam')).toBe(false);
    expect(mayUseName(callWith(NAME_EVERY - 1), 'Sam')).toBe(false);
    expect(mayUseName(callWith(NAME_EVERY), 'Sam')).toBe(true);
    expect(mayUseName(callWith(1, 'Okay, I gotta go, talk soon.'), 'Sam')).toBe(true);
    // A hello without the name doesn't open the door to one on the next reply.
    const noNameHello = [msg('assistant', 'Hey, afternoon.'), msg('user', 'Hi.')];
    expect(mayUseName(noNameHello, 'Sam')).toBe(false);
  });

  it('sets NAME_EVERY from the human target (score-targets.json nameUseRate max 0.025)', () => {
    expect(1 / NAME_EVERY).toBeLessThanOrEqual(0.025);
  });

  it('counts only names that addressed them, not "tell Sam I said hi"', () => {
    const items = callWith(NAME_EVERY);
    items.splice(4, 1, msg('assistant', 'Tell Sam I said hi.'));
    expect(mayUseName(items, 'Sam')).toBe(true);
  });

  it('reads the first name from the profile', () => {
    expect(firstNameOf('seth ford')).toBe('Seth');
    expect(firstNameOf("o'neil")).toBe("O'Neil");
    expect(firstNameOf('McKenzie')).toBe('McKenzie');
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
  });
});

describe('withNameGate', () => {
  it('drops a mid-call name from a reply streamed in pieces', async () => {
    const out = await run(
      ['Yes', ', S', 'am', ", I'm ", 'sure. That', ' is rough', ', Sa', 'm.'],
      callWith(2)
    );
    expect(out).toBe("Yes, I'm sure. That is rough.");
  });

  it('keeps one name in the greeting and drops a second', async () => {
    expect(await run(['Hey Sam', ', afternoon. Good to hear you', ', Sam.'], [])).toBe(
      'Hey Sam, afternoon. Good to hear you.'
    );
  });

  it("keeps a goodbye by name, the caller's or its own", async () => {
    expect(await run(['Talk soon', ', Sam.'], callWith(2, 'Alright, bye!'))).toBe(
      'Talk soon, Sam.'
    );
    expect(await run(['Sam, ', 'take care. ', 'Bye!'], callWith(2))).toBe('Sam, take care. Bye!');
    expect(await run(['That is rough, Sam. ', 'Talk soon, Sam.'], callWith(2))).toBe(
      'That is rough. Talk soon, Sam.'
    );
  });

  it('does not stall a reply on an unclear ", Sam," (it keeps the name)', async () => {
    expect(await run(['Okay, Sam, ', '5 things to do.'], callWith(2))).toBe(
      'Okay, Sam, 5 things to do.'
    );
  });

  it('is not fooled by "take care of" or "call me back"', async () => {
    expect(await run(['That is rough, Sam.'], callWith(2, 'I need to take care of my mom.'))).toBe(
      'That is rough.'
    );
    expect(await run(['Of course, Sam.'], callWith(2, 'Can you call me back tomorrow?'))).toBe(
      'Of course.'
    );
  });

  it('leaves a reply about their own name alone', async () => {
    expect(await run(['Sam. ', 'It is Sam, right?'], callWith(2, "What's my name?"))).toBe(
      'Sam. It is Sam, right?'
    );
  });

  it('passes text through without the name untouched, and is off with NAME_GATE=off', async () => {
    expect(await run(['How was ', 'the drive?'], callWith(2))).toBe('How was the drive?');
    expect(await run(['That is rough, Sam.'], callWith(2), { NAME_GATE: 'off' })).toBe(
      'That is rough, Sam.'
    );
  });

  it('says a reply that was only the name as it came', async () => {
    expect(await run(['Sam?'], callWith(2))).toBe('Sam?');
  });
});
