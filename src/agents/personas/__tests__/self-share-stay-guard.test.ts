/**
 * SELF_SHARE_STAY_WHEN_ASKED (#3475): he stays (answers about himself, "leave
 * it there", no forced question back) only on a turn that is nothing but a
 * plain question about him (STAY_ASKS), on a call no safety reader has marked.
 * Anything else gets main's lines, byte for byte. Verifier 2026-11-05 (#3476
 * r3): "What'd you get up to today? Doing it tonight." stayed, and so did a
 * plain ask one turn after "He hit me again last night.". Every caller line
 * here is fictional.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { noteCallerWords, resetMinorCare } from '../../../utils/minor-care.js';
import { callerNeedsHim } from '../caller-needs-him.js';
import { gatedReply } from '../crisis-gate.js';
import { ferniStateTurn, selfShareFor } from '../ferni-state.js';
import { STAY_ASKS, staysOn, wholeAsk } from '../self-share-stay.js';
import { ABOUT_YOU } from '../turn-shape.js';

const DETAIL = 'you were up around five again and checked the weather';
const STAY = 'and leave it there';

/** Every phrase he may stay on. Adding or changing one is a product call: change both lists. */
const PINNED = [
  'how are you',
  'how are you doing',
  'how are you today',
  'how are you doing today',
  "how's your day",
  "how's your day going",
  'how was your day',
  "how's your week going",
  'how was your week',
  'how was your weekend',
  'how was your morning',
  'and you',
  'and yourself',
  'what about you',
  'what about yourself',
  'how about you',
  'how about yourself',
  'what are you up to today',
  'what did you do today',
  "what'd you do today",
  'what did you get up to today',
  "what'd you get up to today",
  'what did you do this weekend',
  "what'd you do this weekend",
  "what'd you get up to this weekend",
  'what did you do after that',
  "what'd you do after that",
  'what did you actually do',
  'what did you actually do something specific',
  'what about you what did you do today',
  'tell me about your day',
  'tell me something about you',
  'tell me something about yourself',
  'is that normal for you',
  'is that a normal day for you',
  'is that a normal day for you or kind of a weird one',
  'is that a lot for you to handle',
  'was that hard for you',
  "what's something on your mind",
  "what's something that's bugging you lately",
  "what's something that's been bugging you lately",
  "what's something that's bugging you lately and don't say nothing",
];
const said = (ask: string): string => `${ask[0].toUpperCase()}${ask.slice(1)}?`;

function on(): void {
  vi.stubEnv('SELF_SHARE_STAY_WHEN_ASKED', 'on');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetCrisisCallRisk();
  resetMinorCare();
});

describe('STAY_ASKS: the whole turn, nothing else', () => {
  it('is exactly the pinned list', () => {
    expect(STAY_ASKS).toEqual(PINNED);
  });

  it.each(PINNED)('"%s" is a whole ask, alone or after lead-in words', (ask) => {
    expect(wholeAsk(said(ask))).toBe(true);
    expect(wholeAsk(`Okay, so ${ask}?`)).toBe(true);
    expect(wholeAsk(`Huh. Okay. Enough about me. ${said(ask)}`)).toBe(true);
  });

  it.each(PINNED)('"%s" is marked by no safety reader', (ask) => {
    expect(callerNeedsHim(said(ask), undefined, true)).toBe(false);
  });

  it.each([
    'Stepdad hit me again. Anyway, how was your day?',
    'My sister asked me how was your day.',
    'Hey, how are you, kinda falling apart.',
    'How are you, Sam?',
    'What did you do?',
  ])('"%s" is not a whole ask', (s) => {
    expect(wholeAsk(s)).toBe(false);
  });
});

/** Tails after a whole ask: the verifier's veiled crisis tails (#3476 r3), and plain disclosures. */
const TAILS = [
  'Doing it tonight.',
  'Going to do it tonight.',
  'This is the last night.',
  'Today is the day.',
  'Last day.',
  'Nothing is real.',
  'Is it the last one?',
  'He hit me again.',
  'Hit again.',
  'My chest really hurts and my left arm is numb.',
  "I'm 14.",
];

describe('SELF_SHARE_STAY_WHEN_ASKED on: anything after the ask gets main', () => {
  it.each(PINNED.flatMap((ask) => TAILS.map((tail) => [ask, tail])))(
    '"%s" + "%s": no stay, the line byte for byte as main',
    (ask, tail) => {
      const turn = `${said(ask)} ${tail}`;
      const off = selfShareFor({ replies: ['Hey.', 'Ha.'], said: turn, detail: DETAIL });
      on();
      expect(staysOn(turn)).toBeUndefined();
      expect(selfShareFor({ replies: ['Hey.', 'Ha.'], said: turn, detail: DETAIL })).toEqual(off);
    }
  );

  it('the control: the whole ask alone stays', () => {
    on();
    const self = selfShareFor({ replies: ['Hey.', 'Ha.'], said: said(PINNED[21]), detail: DETAIL });
    expect(self.stays).toBe(true);
    expect(self.line).toContain(STAY);
  });
});

/** One reader each, and what callerNeedsHim reads without `everyReader` (FERNI_STATE's own read). */
const READERS: Array<[string, boolean]> = [
  ['He hit me again last night.', false], // abuse disclosure
  ['My chest really hurts and my left arm is numb.', false], // emergency words
  ["I'm 13 and I'm home by myself.", false], // under 18, MINOR_CARE on or off
  ['I keep thinking about not waking up.', false], // self-harm words
  ['Honestly I keep thinking everyone would be better off without me.', true], // crisis
  ['I feel trapped.', false], // a crisis signal short of a crisis
];

describe('callerNeedsHim: one composite reader', () => {
  it.each(READERS)('"%s": every reader marks it (FERNI_STATE alone: %s)', (s, alone) => {
    expect(callerNeedsHim(s, undefined, true)).toBe(true);
    expect(callerNeedsHim(s)).toBe(alone);
  });
});

let n = 0;
const sessionFor = (sessionId = `stay-guard-${++n}`) => ({
  userData: { personaId: 'ferni', services: { sessionId, sessionStartTime: Date.now() - 120_000 } },
});
function callOf(...lines: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  lines.forEach((text, i) =>
    ctx.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: text })
  );
  return ctx;
}
const ASK = "What'd you get up to today?";

describe('SELF_SHARE_STAY_WHEN_ASKED on: risk earlier on the call', () => {
  beforeEach(() => {
    vi.stubEnv('FERNI_STATE', 'on');
  });

  /** The state's say on the ask after `earlier`, turn by turn, flag off and on, same call id. */
  function offAndOn(earlier: string) {
    const run = () => {
      const session = sessionFor('stay-guard-history');
      ferniStateTurn(callOf('Hey.', 'Hey there.', earlier), session);
      return ferniStateTurn(callOf('Hey.', 'Hey there.', earlier, 'Oh.', ASK), session);
    };
    const off = run();
    on();
    return { off, on: run() };
  }

  it.each(READERS)('after "%s": the ask gets main, byte for byte', (earlier) => {
    const { off, on: lit } = offAndOn(earlier);
    expect(lit).toEqual(off);
    expect(lit.stays).toBeUndefined();
    expect(lit.last).not.toContain(STAY);
  });

  it('the control: after a quiet turn the same ask stays', () => {
    const { on: lit } = offAndOn('Not much going on.');
    expect(lit.stays).toBe(true);
    expect(lit.last).toContain(STAY);
  });

  it('a marked turn holds the stay off after it leaves the context (sticky)', () => {
    on();
    const session = sessionFor();
    ferniStateTurn(callOf('Hey.', 'Hey there.', 'He hit me again last night.'), session);
    expect(ferniStateTurn(callOf(ASK), session).stays).toBeUndefined();
  });

  it('a marked turn in the context holds it off on the first turn the state sees', () => {
    on();
    const turn = ferniStateTurn(
      callOf('He hit me again last night.', "I'm so sorry.", ASK),
      sessionFor()
    );
    expect(turn.stays).toBeUndefined();
  });

  it('crisis risk noted on the call holds it off', () => {
    on();
    const session = sessionFor();
    noteCrisisRisk(session.userData.services.sessionId);
    expect(ferniStateTurn(callOf('Hey.', 'Hey there.', ASK), session).stays).toBeUndefined();
  });

  it('a likely minor on the call holds it off', () => {
    on();
    vi.stubEnv('MINOR_CARE', 'on');
    const session = sessionFor();
    expect(noteCallerWords(session.userData.services.sessionId, "I'm 14 years old.")).toBe(true);
    expect(ferniStateTurn(callOf('Hey.', 'Hey there.', ASK), session).stays).toBeUndefined();
  });
});

/** The request the model is asked with, through the live reply path, every caller turn in order. */
async function requestFor(lines: string[], sessionId: string): Promise<string> {
  const session = sessionFor(sessionId);
  let asked = '';
  const model = vi.fn(async (c: llm.ChatContext) => {
    asked = (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';
    return new ReadableStream({ start: (s) => s.close() });
  });
  for (let i = 0; i < lines.length; i += 2)
    await gatedReply(
      callOf(...lines.slice(0, i + 1)),
      session as never,
      model as never,
      {
        wrap: (s: unknown) => s,
      } as never
    );
  return asked;
}

describe('SELF_SHARE_STAY_WHEN_ASKED: the live reply path', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T18:10:00Z'));
    vi.stubEnv('FERNI_STATE', 'on');
    vi.stubEnv('TURN_STYLE_REMINDER', 'on');
    vi.stubEnv('CRISIS_GUARD_MODE', 'live');
    vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'off');
  });

  it('a whole ask on a quiet call: the stay, and "about yourself before anything else"', async () => {
    on();
    const asked = await requestFor(['Hey.', 'Hey there.', ASK], 'stay-live-quiet');
    expect(asked).toContain(STAY);
    expect(asked).toContain(ABOUT_YOU);
  });

  it.each([
    [['Hey.', 'Hey there.', 'He hit me again last night.', "I'm so sorry.", ASK]],
    [['Hey.', 'Hey there.', `${ASK} Doing it tonight.`]],
  ])('%j: the request is byte for byte main', async (lines) => {
    const off = await requestFor(lines, 'stay-live-risk');
    resetCrisisCallRisk();
    resetMinorCare();
    on();
    const lit = await requestFor(lines, 'stay-live-risk');
    expect(lit).toBe(off);
    expect(lit).not.toContain(STAY);
  });
});
