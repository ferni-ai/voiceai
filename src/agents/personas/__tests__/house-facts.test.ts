/**
 * Ferni never makes up his own website or the address his texts and emails come
 * from (house-facts.ts, #3001). The prod shapes are rewritten with made-up names
 * ("glowfriend", "mindmeadow") and 555-01xx numbers.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { withActionClaimCheck } from '../action-claim-guard.js';
import { withHonesty } from '../ai-honesty.js';
import {
  houseFactsPrompt,
  inventsHouseFact,
  NOT_IN_FRONT_OF_ME,
  withHouseFactsGuard,
} from '../house-facts.js';

initializeLogger({ pretty: false, level: 'warn' });

const ON = {
  HOUSE_FACTS: 'on',
  TWILIO_PHONE_NUMBER: '+17275550142',
  EMAIL_FROM: 'hello@ferni.ai',
};
const FACTS = {
  website: 'ferni.ai',
  webApp: 'app.ferni.ai',
  textsFrom: '+17275550142',
  emailFrom: 'hello@ferni.ai',
};
const ASKS_SITE = 'What website do I use to verify my phone number?';
const ASKS_SENDER = 'And what address do the texts come from?';

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
const toolCall: llm.ChatChunk = {
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: 'x', name: 'searchWeb', args: '{}' })],
  },
};
function streamOf(...parts: Array<string | llm.ChatChunk>): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === 'string' ? chunk(p) : p);
      c.close();
    },
  });
}

/** The reply as it leaves the real llmNode path (withActionClaimCheck), words joined. */
async function spoken(
  callerSaid: string,
  parts: Array<string | llm.ChatChunk>,
  env: Record<string, string> = ON
): Promise<{ text: string; chunks: llm.ChatChunk[] }> {
  const items = [llm.ChatMessage.create({ role: 'user', content: callerSaid })];
  const out = await withActionClaimCheck(
    Promise.resolve(streamOf(...parts)),
    { items },
    { functionTools: {} },
    undefined,
    env
  );
  const chunks: llm.ChatChunk[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) chunks.push(c);
  return { text: chunks.map((c) => c.delta?.content ?? '').join(''), chunks };
}

describe('withActionClaimCheck with HOUSE_FACTS', () => {
  const REPLY = ['Sure! Just head to mind', 'meadow.com and tap verify. ', 'Anything else?'];

  it('off: an invented website goes out as written (the prod bug)', async () => {
    const { text } = await spoken(ASKS_SITE, REPLY, { ...ON, HOUSE_FACTS: 'off' });
    expect(text).toContain('mindmeadow.com');
    expect(text).not.toContain(NOT_IN_FRONT_OF_ME);
  });

  it('on: the invented website is replaced by the honest line, the rest stays', async () => {
    const { text, chunks } = await spoken(ASKS_SITE, REPLY);
    expect(text).not.toContain('mindmeadow');
    expect(text).toBe(`Sure! ${NOT_IN_FRONT_OF_ME} Anything else?`);
    expect(chunks.every((c) => c.id === 'r')).toBe(true);
  });

  it.each([
    'You can verify it at glowfriend dot ai.',
    "It's talk-dot-com, then tap verify.",
    'Go to heartbeam.ai and sign in.',
    'Oh, definitely dot com.',
    "It's glowfriend.am, I'm sure of it.",
  ])('on, caller asked for the site: "%s" is replaced', async (line) => {
    const { text } = await spoken(ASKS_SITE, [line]);
    expect(text).toBe(NOT_IN_FRONT_OF_ME);
  });

  it.each([
    'They come from alerts at glowfriend dot ai.',
    'Texts come from notification@glowfriend.ai.',
    'They come from 727-555-0199.',
  ])('on, caller asked for the sender: "%s" is replaced', async (line) => {
    const { text } = await spoken(ASKS_SENDER, [line]);
    expect(text).toBe(NOT_IN_FRONT_OF_ME);
  });

  it('says the honest line once however many sentences it replaces', async () => {
    const { text } = await spoken(ASKS_SITE, [
      'Try glowfriend.ai. ',
      'Or maybe heartbeam.ai. ',
      'One of those.',
    ]);
    expect(text).toBe(`${NOT_IN_FRONT_OF_ME} One of those.`);
  });

  it.each([
    [ASKS_SITE, 'Open app.ferni.ai, then the menu, under How I reach you.'],
    [ASKS_SITE, 'Our website is https://www.ferni.ai, and the app is at app dot ferni dot ai.'],
    [ASKS_SENDER, 'Texts come from (727) 555-0142, and email from hello at ferni dot ai.'],
    [ASKS_SENDER, 'Email comes from hello@ferni.ai.'],
  ])('lets the true facts through, written or said: "%s" / "%s"', async (asked, line) => {
    expect((await spoken(asked, [line])).text).toBe(line);
  });

  it.each([
    'Go to verify.ferni.ai.',
    'Go to ferni.ai.glowfriend.com.',
    'Email comes from notifications@ferni.ai.',
    'Head to verify dot ferni dot ai.',
  ])('replaces a lookalike of a true fact: "%s"', async (line) => {
    expect((await spoken(ASKS_SITE, [line])).text).toBe(NOT_IN_FRONT_OF_ME);
  });

  it('replaces an address Ferni gives as his own even when nobody asked', async () => {
    const { text } = await spoken('How was your day?', ['Good! Our website is glowfriend.ai.']);
    expect(text).toBe(`Good! ${NOT_IN_FRONT_OF_ME}`);
  });

  it.each([
    ['Any good recipe sites?', 'Try seriouseats.com for that.'],
    ['Text my sister at 727-555-0199.', "I'll text 727-555-0199, okay?"],
    ['Email Sam for me.', 'Is sam at example dot com the right one?'],
  ])('leaves other people\'s addresses alone: "%s" / "%s"', async (asked, line) => {
    expect((await spoken(asked, [line])).text).toBe(line);
  });

  it('with no number configured, any sender number is replaced', async () => {
    const { TWILIO_PHONE_NUMBER: _unset, ...noNumber } = ON;
    const { text } = await spoken(ASKS_SENDER, ['They come from 727-555-0142.'], noNumber);
    expect(text).toBe(NOT_IN_FRONT_OF_ME);
  });

  it('checks the words before a tool call and passes the call through', async () => {
    const { text, chunks } = await spoken(ASKS_SITE, ['Try glowfriend.ai.', toolCall]);
    expect(text).toBe(NOT_IN_FRONT_OF_ME);
    expect(chunks.some((c) => (c.delta?.toolCalls?.length ?? 0) > 0)).toBe(true);
  });
});

describe('inventsHouseFact', () => {
  it('needs an address: a sentence about the site with none passes', () => {
    expect(inventsHouseFact('Our website has a menu.', true, FACTS)).toBe(false);
    expect(inventsHouseFact('Our website is glowfriend.ai.', false, FACTS)).toBe(true);
  });
});

describe('no catastrophic backtracking (#3032 review)', () => {
  /** Best of three, so a busy CI box doesn't fail it; backtracking takes minutes, not ms. */
  const ms = (run: () => unknown): number => {
    const times: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      run();
      times.push(performance.now() - start);
    }
    return Math.min(...times);
  };

  it.each([
    ['hyphen run then a said dot', `${'a-'.repeat(5000)}dot com`],
    ['repeated -dot-', 'x-dot-'.repeat(3000)],
    ['repeated written dots', 'a.'.repeat(5000)],
  ])('%s: checked in under 50 ms', (_name, text) => {
    expect(ms(() => inventsHouseFact(text, true, FACTS))).toBeLessThan(50);
    expect(ms(() => inventsHouseFact(`Our website is ${text}`, false, FACTS))).toBeLessThan(50);
  });

  it('a long run with no sentence end streams through in pieces, nothing lost', async () => {
    const text = 'x-dot-'.repeat(3000);
    const start = performance.now();
    const out = await withHouseFactsGuard(
      new ReadableStream<string>({
        start(c) {
          c.enqueue(text);
          c.close();
        },
      }),
      { items: [] },
      ON
    );
    const parts: string[] = [];
    for await (const part of out as unknown as AsyncIterable<string>) parts.push(part);
    expect(performance.now() - start).toBeLessThan(50);
    expect(parts.join('')).toBe(text);
    // Decided a piece at a time, so the buffer never holds the whole run.
    expect(parts.length).toBeGreaterThan(10);
  });

  it('a long caller message is read in under 50 ms', async () => {
    const items = [llm.ChatMessage.create({ role: 'user', content: 'what website '.repeat(1000) })];
    const start = performance.now();
    const out = await withHouseFactsGuard(streamOf('Fine.'), { items }, ON);
    for await (const _part of out as unknown as AsyncIterable<unknown>) void _part;
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe('the prompt (withHonesty, as prompt-loader.ts builds it)', () => {
  const RULE = 'If someone sincerely asks whether you are an AI, say yes.';

  it('off: the honesty rule is unchanged', () => {
    expect(withHonesty(RULE, { ...ON, HOUSE_FACTS: 'off' })).toBe(RULE);
  });

  it('on: it states the true website, sender number and email, and forbids inventing one', () => {
    const prompt = withHonesty(RULE, ON);
    expect(prompt.startsWith(RULE)).toBe(true);
    expect(prompt).toContain("Ferni's website is ferni.ai");
    expect(prompt).toContain('app.ferni.ai');
    expect(prompt).toContain('Texts from Ferni come from 727-555-0142.');
    expect(prompt).toContain('Email from Ferni comes from hello@ferni.ai.');
    expect(prompt).toContain('under How I reach you');
    expect(prompt).toMatch(/Never make up a web address/);
  });

  it('names an unset fact as unknown instead of stating one', () => {
    const prompt = houseFactsPrompt({ website: 'ferni.ai' });
    expect(prompt).toContain("You don't know which number Ferni's texts come from.");
    expect(prompt).toContain("You don't know which address Ferni's email comes from.");
  });
});
