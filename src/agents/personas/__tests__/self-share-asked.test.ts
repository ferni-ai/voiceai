/**
 * SELF_SHARE_WHEN_ASKED=on: Ferni's own day only when asked, never on his
 * first reply, each detail once a call and none from the caller's last three
 * calls. Asserted on the request the model is asked with, through the live
 * reply path (crisis-gate.ts -> turn-request.ts -> ferni-state.ts).
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { DAY_DETAILS, dayDetailFor } from '../ferni-self-share.js';
import {
  ASKED_NO_DETAIL,
  FIRST_REPLY_ASKED,
  pickDetail,
  detailPool,
  resetRecentDetails,
  UNASKED,
} from '../self-share-asked.js';
import { ABOUT_YOU } from '../turn-shape.js';

const NOON = new Date('2026-10-11T18:10:00Z');
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const SECOND_STORY = /share a small piece of it/;

let n = 0;
function newCall(userId?: string) {
  const sessionId = `asked-${++n}`;
  return {
    sessionId,
    session: {
      userData: {
        personaId: 'ferni',
        ...(userId ? { userId } : {}),
        services: { sessionId, sessionStartTime: Date.now() - 120_000 },
      },
    },
  };
}

/** Caller and Ferni lines alternating, starting and ending with the caller. */
function callOf(...lines: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  lines.forEach((text, i) =>
    ctx.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: text })
  );
  return ctx;
}

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

/** The day details (and only those) that ride a request. */
const detailsIn = (asked: string): string[] => DAY_DETAILS.filter((d) => asked.includes(d));

/** Three quiet turns in, then a question about him. */
const ASKED_LATER = ['Hey.', 'Hey, good to hear you.', 'Not much.', 'Ha, fair.'];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  process.env.FERNI_STATE = 'on';
  process.env.SELF_SHARE_WHEN_ASKED = 'on';
  resetRecentDetails();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.FERNI_STATE;
  delete process.env.SELF_SHARE_WHEN_ASKED;
});

describe('SELF_SHARE_WHEN_ASKED=on', () => {
  it('his first reply holds nothing of his day, even when asked how he is', async () => {
    const { session } = newCall('caller-first');
    const asked = await askedWith(callOf('Hey Ferni, how are you?'), session);
    expect(detailsIn(asked)).toEqual([]);
    expect(asked).toContain(FIRST_REPLY_ASKED);
    expect(asked).not.toContain(ABOUT_YOU);
  });

  it('an unknown caller who never asks hears nothing of his day', async () => {
    const { session } = newCall();
    const asked = await askedWith(
      callOf(...ASKED_LATER, 'Yeah, just a quiet Sunday around here.'),
      session
    );
    expect(detailsIn(asked)).toEqual([]);
    expect(asked).toContain(UNASKED);
    expect(asked).not.toContain("If something of your own fits, it's from today");
    expect(asked).not.toMatch(SECOND_STORY);
  });

  it('asked about him after the first reply: one detail', async () => {
    const { session } = newCall();
    const asked = await askedWith(callOf(...ASKED_LATER, 'What did you do today?'), session);
    expect(detailsIn(asked)).toHaveLength(1);
    expect(asked).toContain('They asked about you: answer from your day');
  });

  it('the same detail never twice in a call', async () => {
    const { session } = newCall();
    const first = await askedWith(callOf(...ASKED_LATER, 'What did you do today?'), session);
    const second = await askedWith(
      callOf(...ASKED_LATER, 'What did you do today?', 'Ha, a fox.', 'How was your weekend?'),
      session
    );
    expect(detailsIn(first)).toHaveLength(1);
    expect(detailsIn(second)).toHaveLength(1);
    expect(detailsIn(second)[0]).not.toBe(detailsIn(first)[0]);
  });

  it("none from the caller's last three calls (same worker)", async () => {
    const heard: string[] = [];
    for (let call = 0; call < 6; call++) {
      const { session } = newCall('caller-recent');
      const asked = await askedWith(callOf(...ASKED_LATER, 'What did you do today?'), session);
      const [detail] = detailsIn(asked);
      expect(detail).toBeDefined();
      expect(heard.slice(-3)).not.toContain(detail);
      heard.push(detail);
    }
  });

  it('a short "good" once every detail is spent for this call', () => {
    const pool = detailPool();
    const used = pool.map((d) => d.id);
    expect(pickDetail(pool, 'seed', used, new Set())).toBeUndefined();
    expect(ASKED_NO_DETAIL).toContain("say you're doing well");
  });
});

describe('SELF_SHARE_WHEN_ASKED off (default): unchanged', () => {
  beforeEach(() => {
    delete process.env.SELF_SHARE_WHEN_ASKED;
  });

  it('asked on his first reply: the call’s day detail, as before', async () => {
    const { session, sessionId } = newCall('caller-off');
    const asked = await askedWith(callOf('Hey Ferni, how are you?'), session);
    expect(asked).toContain(dayDetailFor(sessionId));
    expect(asked).toContain(ABOUT_YOU);
  });

  it('unasked, a few turns in: the offer of something of his own, as before', async () => {
    const { session, sessionId } = newCall();
    const asked = await askedWith(callOf(...ASKED_LATER, 'Yeah.'), session);
    expect(asked).toContain(
      `If something of your own fits, it's from today (${dayDetailFor(sessionId)})`
    );
    expect(asked).not.toContain(UNASKED);
  });
});
