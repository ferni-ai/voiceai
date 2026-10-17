/**
 * His own day never rides a turn about getting something done (FERNI_STATE=on).
 *
 * Prod call 2026-10-17 (owner, build c20c77407): asked to be called, Ferni
 * said he can't ring the phone; then "Do you have my number?" got "I do have
 * your number, but since I can't call you directly, I was actually just about
 * to head out and try to find a replacement houseplant." The question read as
 * about him ("do you have"), so the turn asked for his day, and the life
 * ledger had kept "about to head out to find a houseplant replacement" from a
 * call an hour earlier.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { dayDetailFor, DAY_DETAILS } from '../ferni-self-share.js';
import { selfShareFor } from '../ferni-state.js';
import { createLedgerRecorder, loadLedger, type LedgerFact } from '../life-ledger.js';
import { pendingLifeUpdates, safeUpdates } from '../life-updates.js';
import { callerMove, rngFor, turnShapeFor } from '../turn-shape.js';

const NOON = new Date('2026-10-17T18:10:00Z');
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
/** What the task line says; the day detail and the "asked about you" line must not ride. */
const ON_TASK = 'Nothing about your own day, plans or errands in this reply';
const ASKED_ABOUT_HIM = /They asked about you/;
const OWN_FITS = /If something of your own fits/;

/** The prod exchange up to the question (Ferni's lines as said). */
const PROD = [
  'Can you call me?',
  "Ah, it looks like I can't ring your phone directly, but I'm right here with you.",
  'Can you just call my phone?',
  "I hear you, and I'd love to, but I can't place a call to you from here.",
  'Do you have my number?',
];

let n = 0;
function newSession() {
  const sessionId = `task-turn-${++n}`;
  const userData = {
    personaId: 'ferni',
    services: { sessionId, sessionStartTime: Date.now() - 120_000 },
  };
  return { sessionId, session: { userData } };
}

function callOf(...lines: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  lines.forEach((text, i) =>
    ctx.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: text })
  );
  return ctx;
}

/** The caller's last words were answered by a tool call: the reply confirms it. */
function withToolRun(ctx: llm.ChatContext, name: string): llm.ChatContext {
  ctx.insert(llm.FunctionCall.create({ callId: 't1', name, args: '{"minutes":10}' }));
  ctx.insert(
    llm.FunctionCallOutput.create({ callId: 't1', name, output: '"set"', isError: false })
  );
  return ctx;
}

/** The request the model is asked with, through the live reply path. */
async function askedWith(ctx: llm.ChatContext, session: object): Promise<string> {
  let asked = '';
  const model = vi.fn(async (c: llm.ChatContext) => {
    const last = c.items.filter((i) => i.type === 'message').pop() as { textContent?: string };
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
  vi.setSystemTime(NOON);
  process.env.FERNI_STATE = 'on';
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.FERNI_STATE;
});

describe('"Do you have my number?" (prod 2026-10-17)', () => {
  it('is a question about their things, not about him', () => {
    expect(callerMove('Do you have my number?')).not.toBe('about_ferni');
    expect(callerMove('Do you remember my sister?')).not.toBe('about_ferni');
    expect(callerMove('Do you have a dog?')).toBe('about_ferni');
  });

  it('gets no day of his own and no "asked about you" line', () => {
    const detail = DAY_DETAILS[3];
    const turn = selfShareFor({ replies: [PROD[1], PROD[3]], said: PROD[4], detail });
    expect(turn.ownStory).toBe(false);
    expect(turn.line).toContain(ON_TASK);
    expect(turn.line).not.toContain(detail);
    expect(turn.line).not.toMatch(ASKED_ABOUT_HIM);
  });

  it('the turn shape does not ask him to answer about himself', () => {
    for (let i = 0; i < 20; i++) {
      const shape = turnShapeFor(PROD[4], rngFor(`seed-${i}`), 'model');
      expect(shape.reminder).not.toContain('answer about yourself');
    }
  });

  it('on the live reply path: nothing of his day reaches the request', async () => {
    const { session, sessionId } = newSession();
    const asked = await askedWith(callOf(...PROD), session);
    expect(asked).toContain(ON_TASK);
    expect(asked).not.toContain(dayDetailFor(sessionId));
    expect(asked).not.toMatch(ASKED_ABOUT_HIM);
    expect(asked).not.toContain('answer about yourself');
  });
});

describe('a casual "how\'s your day?" still gets his day', () => {
  it('asked about him, he answers from his day', async () => {
    const { session, sessionId } = newSession();
    const asked = await askedWith(
      callOf('Hey Ferni.', 'Hey, good to hear you.', 'Ha.', 'Mm.', "How's your day going?"),
      session
    );
    expect(asked).toMatch(ASKED_ABOUT_HIM);
    expect(asked).toContain(dayDetailFor(sessionId));
    expect(asked).not.toContain(ON_TASK);
  });
});

describe('tool and confirm turns', () => {
  const chat = ['Hey Ferni.', 'Ha, no way.', 'Not much going on.', 'Mm, Sunday.'];

  it('asked to set a timer: no day of his own', async () => {
    const { session, sessionId } = newSession();
    const asked = await askedWith(callOf(...chat, 'Can you set a timer?'), session);
    expect(asked).toContain(ON_TASK);
    expect(asked).not.toContain(dayDetailFor(sessionId));
    expect(asked).not.toMatch(OWN_FITS);
  });

  it('the reply after the tool ran (the confirmation): none either', async () => {
    const { session, sessionId } = newSession();
    const ctx = withToolRun(callOf(...chat, 'Ten minutes.'), 'setTimer');
    const asked = await askedWith(ctx, session);
    expect(asked).toContain(ON_TASK);
    expect(asked).not.toContain(dayDetailFor(sessionId));
    expect(asked).not.toMatch(OWN_FITS);
  });
});

describe('the life ledger keeps no "about to head out"', () => {
  const HEAD_OUT = 'Ferni is about to head out to find a houseplant replacement.';
  const SAPPORO = 'Ferni has a flight to Sapporo open in a browser tab.';

  it('one already kept is not recalled', async () => {
    const kept: LedgerFact[] = [HEAD_OUT, SAPPORO].map((fact) => ({
      personaId: 'ferni',
      fact,
      saidAt: '2026-10-17T14:44:09.002Z',
    }));
    const store = { save: async () => {}, recent: async () => kept };
    const told = await loadLedger('u1', 'ferni', store);
    expect(told.map((f) => f.fact)).toEqual([SAPPORO]);
  });

  it('a new one is never kept', async () => {
    const saved: LedgerFact[] = [];
    const rec = createLedgerRecorder('u1', {
      store: { save: async (_u, facts) => void saved.push(...facts), recent: async () => [] },
      extract: async () => [HEAD_OUT, SAPPORO],
      env: {},
    });
    rec.add('ferni', "I've got a flight to Sapporo open in a browser tab, ha.");
    rec.add('ferni', 'I was just about to head out to find a houseplant replacement.');
    await rec.flush();
    expect(saved.map((f) => f.fact)).toEqual([SAPPORO]);
  });
});

describe('LIFE_MOVES_ON never writes or offers a reason to leave', () => {
  const LEAVE = "Your houseplant didn't make it; you're heading out to find a replacement.";
  const STAY = "You've started a rosemary on the windowsill instead.";

  it('a written development about heading out is dropped', () => {
    expect(safeUpdates([LEAVE, STAY])).toEqual([STAY]);
  });

  it('one already pending is not offered', async () => {
    const createdAt = '2026-10-17T14:00:00.000Z';
    const store = {
      save: async () => {},
      recent: async () =>
        [LEAVE, STAY].map((update) => ({ personaId: 'ferni', update, createdAt })),
    };
    const pending = await pendingLifeUpdates('u1', [], 'ferni', {
      store,
      now: () => NOON.getTime(),
      env: { LIFE_MOVES_ON: 'on' },
    });
    expect(pending.map((u) => u.update)).toEqual([STAY]);
  });
});
