import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { localClock, spokenTime, stateFor } from '../ferni-state.js';
import {
  directSpeech,
  type PlanSummary,
} from '../../../speech/tts-gateway/director/reply-director.js';
import { DirectorSessions } from '../../../speech/tts-gateway/director/session-state.js';
import {
  ferniEnergyFor,
  setFerniEnergy,
} from '../../../speech/tts-gateway/director/ferni-energy.js';

/** 01:47 in Wyoming (MDT, UTC-6): the time of Seth's 3:47am ET call. */
const LATE = new Date('2026-10-11T07:47:00Z');
/** 14:10 in Wyoming. */
const AFTERNOON = new Date('2026-10-11T20:10:00Z');
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LOW_LINE = /worn out/;
const SHORT_LINE = /Keep replies short and unhurried/;
const OFFER = /fading a bit/;

let n = 0;
function call(minutesIn: number, personaId?: string) {
  const sessionId = `ferni-state-${++n}`;
  return {
    sessionId,
    session: {
      userData: {
        personaId,
        services: { sessionId, sessionStartTime: Date.now() - minutesIn * 60_000 },
      },
    },
  };
}

function request(...said: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  said.forEach((text, i) => {
    if (i > 0) ctx.addMessage({ role: 'assistant', content: 'Mm, yeah.' });
    ctx.addMessage({ role: 'user', content: text });
  });
  return ctx;
}

/** The request the model is asked with, through the live reply path (ferni-agent.ts llmNode). */
async function askedWith(ctx: llm.ChatContext, session: object): Promise<string> {
  let asked = '';
  const model = vi.fn(async (c: llm.ChatContext) => {
    const last = c.items[c.items.length - 1] as { textContent?: string };
    asked = last.textContent ?? '';
    return new ReadableStream({ start: (s) => s.close() });
  });
  await gatedReply(ctx, session as never, model as never, { wrap: (s: unknown) => s } as never, {
    env: PATTERNS_ONLY,
  });
  return asked;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LATE);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.FERNI_STATE;
});

describe('Ferni at 1:47am in Wyoming, eight minutes in (FERNI_STATE=on)', () => {
  beforeEach(() => {
    process.env.FERNI_STATE = 'on';
  });

  it('is told he is worn out and the hour, asked for shorter replies, and slows', async () => {
    const { session, sessionId } = call(8);
    expect(ferniEnergyFor(sessionId)).toBeUndefined();
    const asked = await askedWith(
      request('Still up. Just thinking about the trip next week.'),
      session
    );
    expect(asked).toMatch(LOW_LINE);
    expect(asked).toContain("it's nearly 2am where you are");
    expect(asked).toMatch(SHORT_LINE);
    expect(asked).not.toMatch(/morning/i);
    expect(ferniEnergyFor(sessionId)).toBe('low');
  });

  it('at 2pm the same words get no state line and no slower pace', async () => {
    vi.setSystemTime(AFTERNOON);
    const { session, sessionId } = call(8);
    const asked = await askedWith(
      request('Still up. Just thinking about the trip next week.'),
      session
    );
    expect(asked).not.toMatch(LOW_LINE);
    expect(asked).not.toMatch(SHORT_LINE);
    expect(ferniEnergyFor(sessionId)).toBe('steady');
  });

  it('offers "fading a bit" once a call, and the final request keeps the preemptive offer', async () => {
    const { session } = call(8);
    const first = await askedWith(request('Still up. Just thinking'), session);
    expect(first).toMatch(OFFER);
    const final = await askedWith(request('Still up. Just thinking about the trip.'), session);
    expect(final).toMatch(OFFER);
    const next = await askedWith(
      request('Still up. Just thinking about the trip.', 'Do you think Lisbon is too far?'),
      session
    );
    expect(next).toMatch(LOW_LINE);
    expect(next).not.toMatch(OFFER);
    expect(next).toContain("Don't mention being tired unless they ask.");
  });

  it('does not offer it in the first minutes of a call', async () => {
    const { session } = call(2);
    const asked = await askedWith(request('Hey, you up?'), session);
    expect(asked).toMatch(LOW_LINE);
    expect(asked).not.toMatch(OFFER);
  });

  it('a tired caller is not a caller in distress: he stays tired', async () => {
    const { session } = call(8);
    const asked = await askedWith(request("Ugh, I'm so tired. Long day."), session);
    expect(asked).toMatch(LOW_LINE);
  });

  it('drops to neutral for hard news, and stays there for the rest of the call', async () => {
    const { session, sessionId } = call(8);
    await askedWith(request('Still up. Just thinking about the trip next week.'), session);
    expect(ferniEnergyFor(sessionId)).toBe('low');
    const hard = await askedWith(
      request('Still up.', "My dad's in the hospital. They think it was a stroke."),
      session
    );
    expect(hard).not.toMatch(LOW_LINE);
    expect(ferniEnergyFor(sessionId)).toBeUndefined();
    const later = await askedWith(
      request('Still up.', "My dad's in the hospital.", 'Okay. Tell me something about your day.'),
      session
    );
    expect(later).not.toMatch(LOW_LINE);
    expect(later).not.toMatch(OFFER);
  });

  it('drops to neutral when the crisis gate guides the reply', async () => {
    const { session, sessionId } = call(8);
    const asked = await askedWith(request("I hope I don't wake up tomorrow"), session);
    expect(asked).not.toMatch(LOW_LINE);
    expect(ferniEnergyFor(sessionId)).toBeUndefined();
  });

  it('leaves other personas alone', async () => {
    const { session, sessionId } = call(8, 'maya-santos');
    const asked = await askedWith(request('Still up. Just thinking.'), session);
    expect(asked).not.toMatch(LOW_LINE);
    expect(ferniEnergyFor(sessionId)).toBeUndefined();
  });
});

describe('FERNI_STATE off (default)', () => {
  it('changes nothing in the request and sets no pace', async () => {
    const { session, sessionId } = call(8);
    const words = request('Still up. Just thinking about the trip next week.');
    const off = await askedWith(words, session);
    expect(off).not.toMatch(LOW_LINE);
    expect(ferniEnergyFor(sessionId)).toBeUndefined();
    // Same session (same per-call shape seed): only the state line differs when on.
    process.env.FERNI_STATE = 'on';
    const on = await askedWith(words, session);
    expect(on).toMatch(LOW_LINE);
    expect(on.length).toBeGreaterThan(off.length);
    delete process.env.FERNI_STATE;
    expect(await askedWith(words, session)).toBe(off);
  });
});

describe('the state', () => {
  const quiet = { callerTurnWords: [8, 9], callerTired: false };

  it('is lower at minute ten than minute one, and low late at night', () => {
    const one = stateFor({ hour: 20, minute: 0, callMinutes: 1, ...quiet });
    const ten = stateFor({ hour: 20, minute: 0, callMinutes: 10, ...quiet });
    expect(ten.energy).toBeLessThan(one.energy);
    expect(stateFor({ hour: 1, minute: 47, callMinutes: 8, ...quiet })).toMatchObject({
      level: 'low',
      mood: 'sleepy',
    });
    expect(stateFor({ hour: 10, minute: 0, callMinutes: 1, ...quiet }).level).not.toBe('low');
  });

  it('catches a little of the caller: an excited caller lifts him, a flat one lowers him', () => {
    const base = stateFor({ hour: 15, minute: 0, callMinutes: 3, ...quiet });
    const up = stateFor({
      hour: 15,
      minute: 0,
      callMinutes: 3,
      ...quiet,
      callerArousal: 0.8,
      callerMood: 'excited',
    });
    const down = stateFor({
      hour: 15,
      minute: 0,
      callMinutes: 3,
      callerTurnWords: [2, 1, 2],
      callerTired: true,
      callerArousal: -0.8,
    });
    expect(up.energy).toBeGreaterThan(base.energy);
    expect(down.energy).toBeLessThan(base.energy);
  });

  it('says the hour the way a person would, in his own time zone', () => {
    expect(spokenTime(1, 47)).toBe('nearly 2am');
    expect(spokenTime(23, 50)).toBe('nearly midnight');
    expect(spokenTime(0, 5)).toBe('just after midnight');
    expect(spokenTime(13, 20)).toBe('past 1pm');
    expect(localClock(LATE)).toEqual({ hour: 1, minute: 47 });
  });
});

describe('the Director hears it', () => {
  async function planSpeed(sessionId: string): Promise<number | undefined> {
    let summary: PlanSummary | undefined;
    const sink = { push() {}, end() {}, cancel() {}, async *[Symbol.asyncIterator]() {} };
    const text = 'Yeah, I know that feeling. ';
    const directed = directSpeech(sink as never, {
      textStream: new ReadableStream<string>({
        start(c) {
          c.enqueue(text);
          c.close();
        },
      }),
      voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
      sessionId,
      env: { SPEECH_DIRECTOR: 'live' },
      sessions: new DirectorSessions(),
      onPlan: (s) => (summary = s),
    });
    for await (const _ of directed.textStream) {
      /* drain */
    }
    directed.reply.push(text);
    directed.reply.end();
    return summary?.speed;
  }

  it('a low Ferni speaks a touch slower, a high one a touch quicker', async () => {
    vi.useRealTimers();
    const steady = await planSpeed('director-steady');
    setFerniEnergy('director-low', 'low');
    setFerniEnergy('director-high', 'high');
    const low = await planSpeed('director-low');
    const high = await planSpeed('director-high');
    expect(steady).toBeDefined();
    expect(low).toBeLessThan(steady!);
    expect(high).toBeGreaterThan(steady!);
    expect(steady! - low!).toBeLessThanOrEqual(0.05);
  });
});
