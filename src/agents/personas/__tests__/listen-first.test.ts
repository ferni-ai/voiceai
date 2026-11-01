/**
 * LISTEN_FIRST=on: a caller low on energy gets a listener, not a monologue.
 *
 * Modelled on a prod call (2026-10-11, the middle of the night for the
 * caller), paraphrased: short, tired answers, while Ferni kept telling the
 * story of the mail on his table, then the coffee and the kettle. The script
 * runs through gatedReply (the persona's real request path) with a fake model
 * that records each request, and checks what the reply was asked to do.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { setDirector, type Director } from '../director-notes.js';
import {
  callerTimeZoneOf,
  lateNightFor,
  listeningCuesFor,
  lowEnergyCaller,
  lowInformation,
  withoutSharingNotes,
} from '../listen-first.js';

/** The call, paraphrased: [caller, Ferni's reply]. The caller tires from the third turn. */
const CALL: Array<[string, string]> = [
  [
    "Honestly I couldn't sleep, I've been lying here thinking about work all night.",
    "Same here, wide awake. There's a stack of mail on my counter that's been staring me down all week.",
  ],
  ['Just hanging out.', 'I moved it to the kitchen table so I can pretend it is not there.'],
  ['You did?', 'Right where breakfast goes, which was a mistake.'],
  ['What is that?', 'The mail. Coffee ends up sitting on the electric bill now.'],
  ["That's cute.", "It's basically a coaster at this point."],
  ['Yep, still here.', 'Good. Thought the mail had swallowed you.'],
  ['That is true.', 'The kettle takes forever when you watch it.'],
  ['Oh, that is true as well.', 'Longest watched pot in Wyoming.'],
  ['How are you doing, Fern?', "I'm alright. What about you?"],
  ['I am a little tired.', 'Late one.'],
  ['That it does.', ''],
];

/** Lines in the reminder that ask Ferni to talk about himself or air a view. */
const OWN_LIFE =
  /share a small piece of it|something specific from your own life|Have a view of your own|Work it out aloud|something small in your own life/i;
const LISTEN = /Listen more than you talk/;

function contextAt(turn: number): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (let i = 0; i <= turn; i++) {
    ctx.addMessage({ role: 'user', content: CALL[i][0] });
    if (i < turn) ctx.addMessage({ role: 'assistant', content: CALL[i][1] });
  }
  return ctx;
}

function streamOf(text: string): ReadableStream<unknown> {
  return new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

/** A call with its own id (without one, exits are held: exits-held.ts). */
let calls = 0;
const aCall = () => ({ userData: { services: { sessionId: `listen-first-${++calls}` } } });

/** The reminder each turn's reply was asked with, through the real request path. */
async function reminders(session: object): Promise<string[]> {
  const out: string[] = [];
  for (let turn = 0; turn < CALL.length; turn++) {
    const model = vi.fn(async (ctx: llm.ChatContext) => {
      const last = ctx.items[ctx.items.length - 1] as llm.ChatMessage;
      out.push(last.textContent ?? '');
      return streamOf('ok');
    });
    // eslint-disable-next-line no-await-in-loop -- one turn after another, like the call
    await gatedReply(
      contextAt(turn),
      session as never,
      model as never,
      { wrap: (s) => s },
      {
        env: { CRISIS_GUARD_MODE: 'off' },
      }
    );
  }
  return out;
}

/** The flags prod ran with on that call, so the turn shape draws what it drew there. */
const PROD_FLAGS = {
  ASK_ADVICE: 'on',
};
const saved = Object.fromEntries(
  ['LISTEN_FIRST', ...Object.keys(PROD_FLAGS)].map((k) => [k, process.env[k]])
);
beforeEach(() => {
  Object.assign(process.env, PROD_FLAGS);
  // A fixed seed: the shape draws are seeded per call from Math.random.
  vi.spyOn(Math, 'random').mockReturnValue(0.123);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('the caller low on energy', () => {
  it('reads short and agreement-only turns as low information', () => {
    for (const t of ['Just hanging out.', 'That is true.', "Oh, that's true as well.", 'Really?'])
      expect(lowInformation(t), t).toBe(true);
    expect(lowInformation("Well, that's pretty interesting as well.")).toBe(true);
    expect(lowInformation('I was thinking about my brother and the move next month.')).toBe(false);
    expect(
      lowEnergyCaller(['Long turn about the job and the commute today.', 'Yep.', 'True.'])
    ).toBe(false);
    expect(
      lowEnergyCaller([
        'Yep.',
        'Really?',
        'That is true.',
        'A long story about the move and my brother.',
      ])
    ).toBe(true);
  });

  it('knows late night in the caller zone, and nothing without one', () => {
    const at = new Date('2026-10-11T07:47:00Z');
    expect(lateNightFor(at, 'America/New_York')).toBe(true); // 3:47 am
    expect(lateNightFor(at, 'Asia/Tokyo')).toBe(false); // 4:47 pm
    expect(lateNightFor(at, undefined)).toBe(false);
  });
});

describe("the caller's zone", () => {
  it("uses the call's settled zone, never the account's profile zone (phone-parity.ts)", () => {
    const account = { services: { userProfile: { contactInfo: { timezone: 'America/Denver' } } } };
    expect(callerTimeZoneOf({ callerTimezone: 'Europe/Dublin', ...account })).toBe('Europe/Dublin');
    expect(callerTimeZoneOf(account)).toBeUndefined();
    expect(callerTimeZoneOf({ callerTimezone: 'Not/AZone', ...account })).toBeUndefined();
    expect(callerTimeZoneOf({ services: { userProfile: null } })).toBeUndefined();
    expect(callerTimeZoneOf(undefined)).toBeUndefined();
  });
});

describe('LISTEN_FIRST through the reply path', () => {
  it('off: the low-energy turns still draw stories and views of his own', async () => {
    delete process.env.LISTEN_FIRST;
    const sent = await reminders(aCall());
    expect(sent.slice(3).some((r) => OWN_LIFE.test(r))).toBe(true);
    expect(sent.some((r) => LISTEN.test(r))).toBe(false);
  });

  it('on: from the low-energy trigger on, no reply is asked for anything of his own', async () => {
    process.env.LISTEN_FIRST = 'on';
    const sent = await reminders(aCall());
    // Not yet: one short turn after a long one is not a tired caller.
    expect(sent[0]).not.toMatch(LISTEN);
    expect(sent[1]).not.toMatch(LISTEN);
    // From the third short turn in four, every reply listens.
    for (const r of sent.slice(3)) {
      expect(r).toMatch(LISTEN);
      expect(r).not.toMatch(OWN_LIFE);
    }
  });

  it('on: a question at most every other turn', async () => {
    process.env.LISTEN_FIRST = 'on';
    const sent = await reminders(aCall());
    // The reply after "I'm alright. What about you?" may not ask another.
    expect(sent[9]).toMatch(/No question this time/);
    expect(sent[8]).toMatch(/You may ask one easy question/);
  });

  it('on, late at night: soft, and offers sleep once', async () => {
    process.env.LISTEN_FIRST = 'on';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T07:47:00Z'));
    const session = { userData: { callerTimezone: 'America/New_York' } };
    const sent = await reminders(session);
    expect(sent[4]).toMatch(/middle of the night/);
    expect(sent[4]).toMatch(/try to get some sleep/);
    const offered = [...CALL.slice(0, 6).map(([, f]) => f), 'Want to try to get some sleep?'];
    const cues = listeningCuesFor(
      offered.flatMap((f) => [
        { type: 'message', role: 'user', textContent: 'Yep.' },
        { type: 'message', role: 'assistant', textContent: f },
      ]),
      'America/New_York'
    );
    expect(cues?.lateNight).toBe(true);
    expect(cues?.ferniLines.at(-1)).toMatch(/sleep/);
  });

  it("on, a phone call whose owner's zone phone-parity settled: late night", async () => {
    process.env.LISTEN_FIRST = 'on';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T07:47:00Z'));
    const phone = { userData: { callerTimezone: 'America/New_York' } };
    const sent = await reminders(phone);
    expect(sent[4]).toMatch(/middle of the night/);
  });

  it('on, a phone call with only an account zone in the profile: not read as late night', async () => {
    process.env.LISTEN_FIRST = 'on';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T07:47:00Z'));
    const phone = {
      userData: {
        services: { userProfile: { contactInfo: { timezone: 'America/New_York' } } },
      },
    };
    const sent = await reminders(phone);
    expect(sent[4]).not.toMatch(/middle of the night/);
  });

  it('on: drops director notes that push him to share, keeps the rest', async () => {
    process.env.LISTEN_FIRST = 'on';
    const session = { userData: { services: { sessionId: 'listen-first' } } };
    setDirector(session, {
      current: () => [
        'Break the pattern by sharing a memory from Wyoming.',
        'Drop the mail topic; his answers are short.',
      ],
      told: () => '',
    } as unknown as Director);
    const sent = await reminders(session);
    setDirector(session, null);
    expect(sent[5]).toContain('Drop the mail topic');
    expect(sent[5]).not.toContain('sharing a memory');
    expect(withoutSharingNotes(['Tell him a story about your dad.', 'Let him lead.'])).toEqual([
      'Let him lead.',
    ]);
  });

  it('on: a talkative caller keeps the usual shape', async () => {
    process.env.LISTEN_FIRST = 'on';
    const ctx = llm.ChatContext.empty();
    for (const said of [
      'So I finally booked the flights for the reunion in March.',
      'My sister is flying in from Denver and bringing the kids too.',
      "We haven't all been in one place since the wedding, it's been years.",
    ]) {
      ctx.addMessage({ role: 'user', content: said });
      ctx.addMessage({ role: 'assistant', content: 'Oh nice.' });
    }
    ctx.addMessage({ role: 'user', content: 'I am nervous about it though, honestly.' });
    expect(listeningCuesFor(ctx.items, undefined)).toBeNull();
  });
});
