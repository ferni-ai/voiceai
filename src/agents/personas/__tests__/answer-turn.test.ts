import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { answersQuestion, endsOnQuestion, isAnswerTurn, lastFerniLine } from '../answer-turn.js';
import { Director, setDirector } from '../director-notes.js';
import { withTurnReminder } from '../turn-request.js';

// Seth's prod call, 2026-10-12 (voiceai-evidence/seth-prod-call-2026-10-12).
const GREETING = 'Morning, Seth. Did you finally tackle that mountain of mail?';
const ASKED_AGAIN = 'Morning, Seth, did you tackle that mail yet?';
const STALE_NOTE =
  'He answered with a distracted greeting. Drop the mail topic and match his slower pace.';
const SECOND_STORY = /share a small piece of it/;
const TAKE_UP = /They just answered what you asked/;

const FLAG = 'DIRECTOR_ANSWER_TURN_GUARD';
const prevFlag = process.env[FLAG];
afterEach(() => {
  if (prevFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prevFlag;
});

/** The call up to the caller's latest words. */
function call(...lines: Array<['ferni' | 'caller', string]>): llm.ChatContext {
  const c = llm.ChatContext.empty();
  for (const [who, text] of lines)
    c.addMessage({ role: who === 'ferni' ? 'assistant' : 'user', content: text });
  return c;
}
const theMissedAnswer = () =>
  call(
    ['ferni', GREETING],
    ['caller', 'Hello, hello.'],
    ['ferni', ASKED_AGAIN],
    ['caller', 'I did.']
  );

/** The request text for this call, with the director's stale note pending. */
function request(c: llm.ChatContext, session: object = {}): string {
  setDirector(session, {
    current: () => [STALE_NOTE],
    told: () => '',
  } as unknown as Director);
  try {
    const out = withTurnReminder(c, session);
    return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
  } finally {
    setDirector(session, null);
  }
}

describe('answersQuestion', () => {
  it('reads "I did." after "did you tackle that mail yet?" as an answer', () => {
    expect(answersQuestion(ASKED_AGAIN, 'I did.')).toBe(true);
  });

  it('reads short answers and short declaratives as answers', () => {
    for (const said of [
      'Yeah.',
      'Nope.',
      'Not yet.',
      'Kind of.',
      'Oh, I did, finally.',
      'Done.',
      'Tackled it this morning.',
      'I did, then replayed the whole thing.',
    ])
      expect(answersQuestion(ASKED_AGAIN, said), said).toBe(true);
  });

  it('does not read a greeting as an answer ("Hello, hello." after the greeting)', () => {
    expect(answersQuestion(GREETING, 'Hello, hello.')).toBe(false);
    expect(answersQuestion(GREETING, 'Hey Ferni.')).toBe(false);
  });

  it('does not read "it\'s me" after a return call\'s greeting as an answer (sweep 2026-10-21)', () => {
    const asked = 'Hey Sam, did you end up sending that resume to Dana?';
    for (const said of [
      "Hey Ferni, it's me.",
      "Hey Ferni, it's me again.",
      "Hi, it's me!",
      'It is just me.',
      'Me again.',
      "Hey, I'm back.",
    ])
      expect(answersQuestion(asked, said), said).toBe(false);
    // Still answers: a hello in front of one, or "it's" about the thing asked.
    for (const said of ['Hey Ferni, I did.', "It's done.", "It's sent, finally.", 'Hi, yes.'])
      expect(answersQuestion(asked, said), said).toBe(true);
  });

  it('does not read their own question or a change of topic as an answer', () => {
    for (const said of [
      'Can you play some music?',
      'can you play some music',
      'What time is it there',
      'Anyway, my sister called.',
      'Yeah, play something upbeat.',
    ])
      expect(answersQuestion(ASKED_AGAIN, said), said).toBe(false);
  });

  it('matches whole words only', () => {
    // "Donegal" starts with "done", "yesterday" with "yes": long turns, not answers.
    expect(answersQuestion(ASKED_AGAIN, 'Donegal is lovely this time of year honestly.')).toBe(
      false
    );
    expect(
      answersQuestion(ASKED_AGAIN, 'Yesterday my brother drove up from Tampa for the game.')
    ).toBe(false);
  });

  it('needs a question in the last sentence of Ferni line', () => {
    expect(endsOnQuestion(GREETING)).toBe(true);
    expect(endsOnQuestion('Did you go? I bet it was fun.')).toBe(false);
    expect(answersQuestion('Barnaby gave me that look this morning.', 'I did.')).toBe(false);
  });

  it('finds the last Ferni line before the caller words', () => {
    expect(lastFerniLine(theMissedAnswer().items)).toBe(ASKED_AGAIN);
    expect(isAnswerTurn(theMissedAnswer().items, 'I did.', { [FLAG]: 'on' })).toBe(true);
    expect(isAnswerTurn(theMissedAnswer().items, 'I did.', {})).toBe(false);
  });
});

describe('withTurnReminder on an answer turn (DIRECTOR_ANSWER_TURN_GUARD)', () => {
  it('drops the stale "Drop the mail topic" note on the "I did." turn', () => {
    process.env[FLAG] = 'off';
    expect(request(theMissedAnswer())).toContain('Drop the mail topic');
    process.env[FLAG] = 'on';
    expect(request(theMissedAnswer())).not.toContain('Drop the mail topic');
  });

  it('keeps the notes when the caller asks their own question', () => {
    process.env[FLAG] = 'on';
    const c = call(['ferni', ASKED_AGAIN], ['caller', 'Can you play some music?']);
    expect(request(c)).toContain('Drop the mail topic');
  });

  it("keeps the notes when Ferni's last line was not a question", () => {
    process.env[FLAG] = 'on';
    const c = call(['ferni', 'Barnaby gave me that look this morning.'], ['caller', 'I did.']);
    expect(request(c)).toContain('Drop the mail topic');
  });

  it('keeps the notes on "Hello, hello." after the greeting question', () => {
    process.env[FLAG] = 'on';
    expect(request(call(['ferni', GREETING], ['caller', 'Hello, hello.']))).toContain(
      'Drop the mail topic'
    );
  });

  it('shapes "I did." as taking up the answer, never a story of his own', () => {
    // Each session draws its own shape, so 40 calls cover the 30% story draw.
    const replies = (flag: string) => {
      process.env[FLAG] = flag;
      return Array.from({ length: 40 }, () => request(theMissedAnswer()));
    };
    const off = replies('off');
    expect(off.some((r) => SECOND_STORY.test(r))).toBe(true);
    expect(off.some((r) => TAKE_UP.test(r))).toBe(false);
    const on = replies('on');
    expect(on.some((r) => SECOND_STORY.test(r))).toBe(false);
    expect(on.every((r) => TAKE_UP.test(r))).toBe(true);
  });
});
