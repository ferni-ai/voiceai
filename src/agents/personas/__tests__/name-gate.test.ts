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

  it('leaves a name that is also a word unless a clause addresses them', () => {
    expect(strip("Hope. That's what keeps you going.", 'Hope')).toBe(
      "Hope. That's what keeps you going."
    );
    expect(strip("Rich, isn't it? The cake.", 'Rich')).toBe("Rich, isn't it? The cake.");
    expect(strip('Will, not talent, got you there.', 'Will')).toBe(
      'Will, not talent, got you there.'
    );
    expect(strip('Will, you did great.', 'Will')).toBe('You did great.');
    expect(strip('Hope, I think, is the thing.', 'Hope')).toBe('Hope, I think, is the thing.');
    expect(strip("Rich, that's the word for the cake.", 'Rich')).toBe(
      "Rich, that's the word for the cake."
    );
    expect(strip('What carried you? Faith, you said.', 'Faith')).toBe(
      'What carried you? Faith, you said.'
    );
    expect(strip('What got you through? Honestly, Faith.', 'Faith')).toBe(
      'What got you through? Honestly, Faith.'
    );
  });

  it('after a question, drops only a name that addresses them', () => {
    expect(strip('You know what? Sam, you did great.')).toBe('You know what? You did great.');
    expect(strip("How are you holding up? Sam, I've been thinking.")).toBe(
      "How are you holding up? I've been thinking."
    );
    expect(strip("Who's driving? Sam, I think.")).toBe("Who's driving? Sam, I think.");
  });

  it('reads ; and : after the name as the end of the address, and "sam" as Sam', () => {
    expect(strip("I hear you, Sam; that's hard.")).toBe("I hear you; that's hard.");
    expect(strip("that's rough, sam.")).toBe("that's rough.");
    expect(strip('My mentor, Sam, I think, said that.')).toBe(
      'My mentor, Sam, I think, said that.'
    );
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
    expect(firstNameOf('SETH')).toBe('Seth');
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

  it('at goodbye, with the falling-name delivery, the kept name ends its own sentence', async () => {
    const env = { NAME_FALLING_INTONATION: 'on' };
    // The eval scenarios end like this (catch-up, about-ferni: "I gotta go. Talk soon.").
    const bye = callWith(6, 'Okay, I gotta go. Talk soon.');
    expect(await run(['Sam, ', 'take care. ', 'Talk soon.'], bye, env)).toBe(
      'Sam. Take care. Talk soon.'
    );
    expect(await run(['Talk soon', ', Sam.'], bye, env)).toBe('Talk soon, Sam.');
    // Never twice, even at goodbye.
    expect(await run(['Sam, take care. ', 'Bye, Sam!'], bye, env)).toBe('Sam. Take care. Bye!');
  });

  it('never changes its mind on a long sentence that ends in a goodbye phrase', async () => {
    for (const text of [
      'Sam, when you show up like that for your team, people really see you.',
      "Sam, no matter what happens at the hearing next week, I won't let you go.",
      "Honestly, Sam, it's been really good talking tonight, so I'll talk to you tomorrow!",
    ]) {
      const words = text.split(/(?<= )/);
      const out = await run(words, callWith(2));
      expect(out.length).toBeLessThan(text.length);
      expect(out).toBe(await run([text], callWith(2)));
      expect(out).not.toMatch(/Sam/);
    }
  });

  it('does not read a goodbye where the 40-character window cuts a sentence', async () => {
    const text = 'Sam, x x x x x x x x x remember to take care of the paperwork first.';
    expect(await run(text.split(/(?<= )/), callWith(2))).toBe(
      'X x x x x x x x x remember to take care of the paperwork first.'
    );
  });

  it('leaves no stray ; or : where a sentence-start name was', () => {
    expect(strip("Sam; that's hard.")).toBe("That's hard.");
  });

  it('does not stall a reply on an unclear ", Sam," (it keeps the name)', async () => {
    expect(await run(['Okay, Sam, ', '5 things to do.'], callWith(2))).toBe(
      'Okay, Sam, 5 things to do.'
    );
  });

  it('counts only a goodbye that closes its sentence', async () => {
    for (const caller of [
      'I have to go to the doctor tomorrow.',
      'I need to see you about something.',
      'You can call me tomorrow.',
      'My name was on the list.',
    ]) {
      expect(await run(['That is rough, Sam.'], callWith(2, caller))).toBe('That is rough.');
    }
    expect(await run(['I see you, Sam.'], callWith(2))).toBe('I see you.');
    expect(await run(['Take care to rest, Sam.'], callWith(2))).toBe('Take care to rest.');
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
