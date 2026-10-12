/**
 * The invite turn's reply is checked after the model writes it: a sentence
 * naming a step for the caller is dropped, and a plain ask goes in if no
 * question is left. Through the real gatedReply; only the model is a fake.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ASKS } from '../commitment-invite.js';
import { checkInviteReply, suggestsStep } from '../commitment-invite-reply.js';
import { gatedReply } from '../crisis-gate.js';

const WORKING_CALL = [
  'Hey, not much. Busy week.',
  "I've been trying to figure out whether to ask my manager for a raise.",
  "I keep putting it off because I don't know how to bring it up.",
  "She's been pretty slammed lately.",
  'Yeah, the review cycle starts next month.',
  "Hm, that makes sense actually. I hadn't thought about it that way.",
];
const ENV = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off', OPENER_GATE: 'off' };

/** Lines Gemini wrote on invite turns offline (2026-10-12) that named a step for them. */
const HANDED = [
  'Well, looking through your old designs is a solid first step, so would you want to commit to finding just three of your favorite projects by tomorrow?',
  'How about we just look at opening that account?',
  'How about just writing down three bullet points of what you do best, and then leaving it at that for today?',
  "Like, what if you spent three days pretending you've decided?",
  'Do you want to try listing one or two of your favorite designs from this year?',
  'Write down three wins tonight.',
  'You could just send her a text tomorrow morning.',
];
const ASKED_FOR_THEIRS = [
  ...ASKS,
  'Is there one small thing you want to try before we talk again?',
  'How about something small, if anything, before we talk again?',
  'Do you want to try that tomorrow morning before we talk again?',
  'Three drafts on Thursday, that sounds like you.',
  'That makes sense, it really does.',
];

function ctx(said: readonly string[]): llm.ChatContext {
  const c = llm.ChatContext.empty();
  said.forEach((s, i) => {
    c.addMessage({ role: 'user', content: s });
    if (i < said.length - 1) c.addMessage({ role: 'assistant', content: 'Huh, okay.' });
  });
  return c;
}
const streamOf = (parts: string[]) =>
  new ReadableStream<string>({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    },
  });
async function spoken(said: readonly string[], parts: string[], session = { userData: undefined }) {
  const reply = await gatedReply(
    ctx(said),
    session,
    (async () => streamOf(parts)) as never,
    { wrap: (s: unknown) => s } as never,
    { env: ENV }
  );
  let text = '';
  for await (const chunk of reply as unknown as AsyncIterable<string>) text += chunk;
  return text;
}

beforeEach(() => {
  process.env.COMMITMENT_INVITE = 'on';
});
afterEach(() => {
  delete process.env.COMMITMENT_INVITE;
});

describe('which sentences name a step for them', () => {
  it.each(HANDED)('names one: %s', (line) => expect(suggestsStep(line)).toBe(true));
  it.each(ASKED_FOR_THEIRS)('asks for theirs: %s', (line) =>
    expect(suggestsStep(line)).toBe(false)
  );

  it('drops the step and asks plainly when no question is left', () => {
    const { text, changed } = checkInviteReply(`That makes sense. ${HANDED[0]}`, 2);
    expect(changed).toBe(true);
    expect(text).toBe(`That makes sense. ${ASKS[2]}`);
    expect(checkInviteReply(`Fair. ${ASKS[0]}`, 1)).toEqual({
      text: `Fair. ${ASKS[0]}`,
      changed: false,
    });
  });
});

describe('on the real reply path', () => {
  it('on the invite turn, a step named for them never reaches the caller', async () => {
    const out = await spoken(WORKING_CALL, [
      'Reporting is exactly it. ',
      'How about you write ',
      'down three wins tonight?',
    ]);
    expect(out).toContain('Reporting is exactly it.');
    expect(out).not.toMatch(/write down three wins/);
    expect(ASKS.some((a) => out.endsWith(a))).toBe(true);
  });

  it('a reply that asks for theirs streams through untouched', async () => {
    const parts = ['Yeah, that tracks. ', ASKS[3]];
    expect(await spoken(WORKING_CALL, parts)).toBe(parts.join(''));
  });

  it('off the invite turn, and with the flag off, nothing is checked', async () => {
    const parts = ['How about you write ', 'down three wins tonight?'];
    expect(await spoken(WORKING_CALL.slice(0, 3), parts)).toBe(parts.join(''));
    // The turn after the invite (the say-it-back) isn't held either.
    const session = { userData: undefined };
    await spoken(WORKING_CALL, ['Okay. ', ASKS[0]], session);
    const next = [...WORKING_CALL, "Yeah, I'll write three wins down Thursday."];
    expect(await spoken(next, parts, session)).toBe(parts.join(''));
    delete process.env.COMMITMENT_INVITE;
    expect(await spoken(WORKING_CALL, parts)).toBe(parts.join(''));
  });
});
