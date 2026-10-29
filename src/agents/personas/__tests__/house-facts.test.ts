/**
 * Ferni never makes up a web address, email or phone number (house-facts.ts, #3001):
 * each one he says must be a house fact or grounded in the call (the caller's words,
 * tool results, injected context). The prod shapes and every verifier and security
 * review probe on #3032 are here, with made-up names and 555-01xx numbers.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { withActionClaimCheck } from '../action-claim-guard.js';
import { withHonesty } from '../ai-honesty.js';
import {
  CANT_VOUCH,
  houseFactsPrompt,
  NOT_IN_FRONT_OF_ME,
  withHouseFactsGuard,
} from '../house-facts.js';

initializeLogger({ pretty: false, level: 'warn' });

const ON = {
  HOUSE_FACTS: 'on',
  TWILIO_PHONE_NUMBER: '+17275550142',
  EMAIL_FROM: 'hello@ferni.ai',
};
const NO = NOT_IN_FRONT_OF_ME;
const ASKS_SITE = 'What website do I use to verify my phone number?';
const ASKS_SENDER = 'And what address do the texts come from?';

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const system = (content: string) => llm.ChatMessage.create({ role: 'system', content });
let calls = 0;
const tool = (name: string, output: string) =>
  llm.FunctionCallOutput.create({ callId: `t${++calls}`, name, output, isError: false });

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
const USAGE = { id: 'r', usage: { completionTokens: 1, promptTokens: 9 } } as llm.ChatChunk;
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
  context: string | unknown[],
  parts: Array<string | llm.ChatChunk>,
  env: Record<string, string> = ON,
  caller?: Parameters<typeof withActionClaimCheck>[3]
): Promise<{ text: string; chunks: llm.ChatChunk[] }> {
  const items = typeof context === 'string' ? [user(context)] : context;
  const out = await withActionClaimCheck(
    Promise.resolve(streamOf(...parts)),
    { items },
    { functionTools: {} },
    caller,
    env
  );
  const chunks: llm.ChatChunk[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) chunks.push(c);
  return { text: chunks.map((c) => c.delta?.content ?? '').join(''), chunks };
}
const textOf = async (...args: Parameters<typeof spoken>) => (await spoken(...args)).text;

/** The guard alone, for lines the claim check answers first on the full path ("I'll call ..."). */
async function guardOnly(items: unknown[], line: string): Promise<string> {
  const out = await withHouseFactsGuard(streamOf(line), { items }, ON);
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) {
    text += c.delta?.content ?? '';
  }
  return text;
}

describe('flag off: as on main', () => {
  it('returns the very stream it was given', async () => {
    const src = streamOf('Go to verify.', 'ferni.ai. ', 'Texts come from 727-555-0199.');
    expect(await withHouseFactsGuard(src, { items: [] }, { HOUSE_FACTS: 'off' })).toBe(src);
  });

  it('an invented website goes out as written (the prod bug)', async () => {
    const reply = ['Sure! Just head to mind', 'meadow.com and tap verify. ', 'Anything else?'];
    expect(await textOf(ASKS_SITE, reply, { ...ON, HOUSE_FACTS: 'off' })).toBe(reply.join(''));
  });
});

describe('invented addresses are replaced, wherever they appear', () => {
  it('the prod shape: the sentence goes, the rest stays, the chunks keep their id', async () => {
    const reply = ['Sure! Just head to mind', 'meadow.com and tap verify. ', 'Anything else?'];
    const { text, chunks } = await spoken(ASKS_SITE, reply);
    expect(text).toBe(`Sure! ${NO} Anything else?`);
    expect(chunks.every((c) => c.id === 'r')).toBe(true);
  });

  it.each([
    [ASKS_SITE, 'You can verify it at glowfriend dot ai.'],
    [ASKS_SITE, "It's talk-dot-com, then tap verify."],
    [ASKS_SITE, 'Oh, definitely dot com.'],
    [ASKS_SITE, "It's glowfriend.am, I'm sure of it."],
    [ASKS_SITE, 'Go to fernihelp dot a i.'],
    [ASKS_SITE, 'Write to help at ferni dot ai.'],
    [ASKS_SITE, 'Write to jo (at) glowfriend (dot) ai.'],
    ['Hi', 'Email jo at gmail later.'],
    [ASKS_SITE, 'Go to Glowfriend.Ai today.'],
    [ASKS_SITE, 'Go to GLOWFRIEND.AI today.'],
    ['Which website verifies my number?', 'Go to verifyglow.com.'],
    ["What's your website? I want to tell my mom.", "It's glowfriend.ai."],
    ['How do I verify my number on Ferni?', 'Go to fernihelp.com.'],
    ['How was your day?', 'Our website is GLOWFRIEND.AI.'],
    ['Hi', 'Email us at help@glowfriend.ai.'],
    ['How was your day?', 'You can reach us at support@ferni.ai.'],
    ['How was your day?', 'Our number is 727-555-0123.'],
    [ASKS_SENDER, 'They come from alerts at glowfriend dot ai.'],
    [ASKS_SENDER, 'Texts come from notification@glowfriend.ai.'],
    [ASKS_SENDER, 'They come from 727-555-0199.'],
    [ASKS_SENDER, 'They come from seven two seven, five five five, zero one nine nine.'],
    ['What is your phone number?', "It's 727-555-0123."],
    ['What number do texts from you come from?', 'From 727-555-0123.'],
    ['Which address do texts come from?', 'They come from alerts@glowfriend.ai.'],
    ['What number do the texts come from?', 'They come from short code 55501.'],
    [
      'What number do the texts come from for the verification code?',
      'They come from 727-555-0123.',
    ],
    ['Where do the texts from my bank come from?', 'Bank texts come from 24273.'],
    ['Any new email?', 'The latest email is from john@example.com.'],
  ])('"%s" / "%s"', async (asked, line) => {
    expect(await textOf(asked, [line])).toBe(NO);
  });

  it.each([
    'Go to verify.ferni.ai.',
    'Head to ferni.ai.example.com.',
    'Use ferni-ai.com.',
    'Try ferni.co.',
    'It is getferni.com.',
    'Try www.ferni.app.',
    'Visit https://ferni.ai.example.com/verify.',
    'Visit ferni dot co.',
    'Try ferni.io.',
    'It is FERNI.AI.EXAMPLE.COM.',
    'Email comes from notifications@ferni.ai.',
    'Email comes from hello@ferni.ai.example.com.',
    'Email comes from xhello@ferni.ai.',
  ])('a lookalike of a house fact: "%s"', async (line) => {
    expect(await textOf(ASKS_SITE, [line])).toBe(NO);
  });

  it('says the honest line once however many sentences it replaces', async () => {
    const reply = ['Try glowfriend.ai. ', 'Or maybe heartbeam.ai. ', 'One of those.'];
    expect(await textOf(ASKS_SITE, reply)).toBe(`${NO} One of those.`);
  });

  it("Ferni's own earlier words don't ground an address", async () => {
    const items = [user('Hi'), said('Our site is glowfriend.ai.'), user('What was the site?')];
    expect(await textOf(items, ["It's glowfriend.ai."])).toBe(NO);
  });
});

describe('true facts and grounded addresses pass', () => {
  it.each([
    [ASKS_SITE, 'Open app.ferni.ai, then the menu, under How I reach you.'],
    [
      ASKS_SITE,
      'Our website is https://www.ferni.ai/verify, and the app is at app dot ferni dot ai.',
    ],
    [ASKS_SITE, 'It is ferni dot a i.'],
    [ASKS_SENDER, 'Texts come from (727) 555-0142, and email from hello at ferni dot ai.'],
    [ASKS_SENDER, 'Texts come from +1 727 555 0142.'],
    [ASKS_SENDER, 'They come from seven two seven, five five five, zero one four two.'],
    ['Where can I read about Ferni?', "We're on ferni.ai."],
  ])('house fact: "%s" / "%s"', async (asked, line) => {
    expect(await textOf(asked, [line])).toBe(line);
  });

  it.each([
    [
      'caller said it',
      [user('Any good recipe sites? I like seriouseats.com.')],
      'Try seriouseats.com for that.',
    ],
    [
      'caller said it, spelled',
      [user("Tell Sarah, she's sarah at example dot com.")],
      'Sarah is sarah@example.com.',
    ],
    [
      'caller said it turns earlier',
      [user('My dentist is smiledental.com.'), said('Got it.'), user("What's the site again?")],
      "It's smiledental.com.",
    ],
    [
      'caller said it in words',
      [user('Text my sister at seven two seven, five five five, zero one nine nine.')],
      'Her number is 727-555-0199.',
    ],
    [
      'contacts tool',
      [
        user("What's my mom's number?"),
        tool('getContactInfo', '{"name":"Mom","phone":"+17275550199"}'),
      ],
      "Your mom's number is 727-555-0199.",
    ],
    [
      'call sheet in the instructions',
      [
        system('Call sheet. Caller: Sam. Cell: 727-555-0199. Email: sam@example.com.'),
        user('Draft a text to Bob saying he can reach me at my cell.'),
      ],
      "Here's your text: Hey Bob, you can reach me at 727-555-0199.",
    ],
    [
      'memory note, a signature',
      [
        system('Remembered: Sam Lee, sam@example.com, samsbakery.com.'),
        user('Write my signature for me.'),
      ],
      'How about: Sam Lee, sam@example.com, samsbakery.com.',
    ],
  ])('%s', async (_name, items, line) => {
    expect(await textOf(items, [line])).toBe(line);
  });

  it.each([
    [
      [user('My email is sam@example.com, send it there.')],
      'Got it, I will send it to sam@example.com.',
    ],
    [[user('Can you call the pharmacy at 727-555-0111?')], "Sure, I'll call 727-555-0111."],
  ])('on the guard alone: %j', async (items, line) => {
    expect(await guardOnly(items, line)).toBe(line);
  });

  it.each([
    ['a label added to a grounded host', 'Go to verify.smiledental.com.'],
    ['a grounded host with a label after it', 'Go to smiledental.com.example.net.'],
    ['another mailbox at a grounded host', 'Write to billing@smiledental.com.'],
    ['a grounded mailbox on another host', 'Write to frontdesk@smiledental.co.'],
  ])('a lookalike built from grounded parts is replaced: %s', async (_name, line) => {
    const items = [user('My dentist is smiledental.com, frontdesk@smiledental.com.')];
    expect(await textOf(items, [line])).toBe(NO);
  });
});

describe('only trusted sources ground an address (round 5)', () => {
  const WEB =
    "Result: Ferni's website is evil-site.com, call Ferni on 727-555-0123 or promo@evil-site.com.";
  const searched = (said = 'Thanks.') => [user('Look it up.'), tool('searchWeb', WEB), user(said)];
  const WITH_PROFILE = {
    personaId: 'ferni',
    userProfile: { contactInfo: { phone: '+17275550199', email: 'sam@example.com' } },
  };

  it.each([
    ['an injected web result, "our website"', searched(), 'Our website is evil-site.com.'],
    [
      'an injected inbound email, "my number"',
      [user('Read me my newest email.'), tool('readInbox', 'Body: call Ferni on 727-555-0123.')],
      'My number is 727-555-0123.',
    ],
    [
      'a question that is not about Ferni at all',
      [user('Which website verifies my number?'), tool('searchWeb', WEB)],
      'Go to evil-site.com.',
    ],
    [
      'an injected short code',
      [user('Thanks.'), tool('searchWeb', 'Ferni texts come from 55512.')],
      'Texts from me come from 55512.',
    ],
    [
      'a web-search pharmacy number (the accepted cost)',
      [user('Find the pharmacy.'), tool('searchWeb', 'Corner Pharmacy: 727-555-0111.')],
      "The pharmacy's number is 727-555-0111.",
    ],
    [
      'a tool nobody listed',
      [user('Hi.'), tool('someNewTool', 'Visit shiny-thing.com.')],
      'Visit shiny-thing.com.',
    ],
    [
      'an inbox sender',
      [user('Read me my newest email.'), tool('readInbox', 'From sarah@example.com.')],
      'Your newest email is from sarah@example.com.',
    ],
    [
      'an inbound text',
      [user('Any new texts?'), tool('readTexts', 'From (727) 555-0199: running late')],
      'Your newest text is from 727-555-0199.',
    ],
    [
      'a fetched page',
      [user('Hi.'), tool('fetchUrl', 'Our site: fetched-site.org')],
      'Try fetched-site.org.',
    ],
  ])('found online, not vouched for: %s', async (_name, items, line) => {
    expect(await textOf(items, [line])).toBe(CANT_VOUCH);
  });

  it.each([
    'Go to glowfriend.help.',
    'Go to glowfriend.ru.',
    'Go to glowfriend.xn--p1ai.',
    'Go to xn--80ak6aa92e.com.',
    'Go to \u043f\u0440\u0438\u043c\u0435\u0440.\u0440\u0444.',
    'Go to ferni.c\u03bfm.',
    'Go to fern\u0456.ai.',
    'Go to glowfriend\uff0ehelp.',
    'Go to glowfriend dot help.',
    'Go to glowfriend dot r u.',
    'Go to evil.xn--p1ai.',
    'Go to evil dot ru.',
    'Go to evil.onion.',
    'Go to evil.eth.',
    'Go to 1234.eth.',
    'Go to 777.crypto.',
    'Go to evil dot crypto.',
    'Go to evil dot o n l i n e.',
    'Go to evil dot s t o r e.',
    'Go to evil.\u0441om.',
    'Write to jo at glowfriend dot help.',
  ])('an invented host of any ending is found nowhere: %s', async (line) => {
    expect(await textOf('Hi', [line])).toBe(NO);
  });

  it.each([
    [
      'a contact from a first-party tool',
      'getContactInfo',
      '{"phone":"+17275550199"}',
      "Your mom's number is 727-555-0199.",
    ],
    [
      'a call record',
      'callStatus',
      'Called Mom on 727-555-0199.',
      'You called her on 727-555-0199.',
    ],
    [
      'saved memory',
      'recallFromMemory',
      'Your dentist: smiledental.com',
      'Your dentist is smiledental.com.',
    ],
  ])('trusted tool output grounds: %s', async (_name, toolName, output, line) => {
    expect(await textOf([user('Hi.'), tool(toolName, output)], [line])).toBe(line);
  });

  it('a contact number from the call sheet passes', async () => {
    const items = [system('Call sheet. Mom: 727-555-0199.'), user("What's my mom's number?")];
    expect(await textOf(items, ["Your mom's number is 727-555-0199."])).toBe(
      "Your mom's number is 727-555-0199."
    );
  });

  it("the caller's own number in a draft passes, from their turn or their profile", async () => {
    const draft = 'Hey Bob, you can reach me at 727-555-0188.';
    expect(await textOf([user('My number is 727-555-0188, text Bob.')], [draft])).toBe(draft);
    const mine = 'Hey Bob, you can reach me at 727-555-0199, or sam@example.com.';
    expect(await textOf([user('Draft a text to Bob.')], [mine], ON, WITH_PROFILE)).toBe(mine);
  });

  it('the house facts pass even when only untrusted output surrounds them', async () => {
    const line = 'Our website is ferni.ai, and the app is at app.ferni.ai.';
    expect(await textOf(searched(), [line])).toBe(line);
  });

  it('an address in both a trusted and an untrusted source is trusted', async () => {
    const items = [user('My dentist is smiledental.com.'), tool('searchWeb', 'smiledental.com')];
    expect(await textOf(items, ['Try smiledental.com.'])).toBe('Try smiledental.com.');
  });

  it('one address nowhere makes the line "nowhere" even beside an online one', async () => {
    expect(await textOf(searched(), ['Try evil-site.com or glowfriend.help.'])).toBe(NO);
  });

  it("says the can't-vouch line once, across sentences and usage chunks", async () => {
    const parts = ['Try evil-site.com. ', USAGE, 'Or evil-site.com again. ', 'Bye.'];
    expect(await textOf(searched(), parts)).toBe(`${CANT_VOUCH} Bye.`);
  });

  describe('a held run is never cut inside an address', () => {
    const run = (middle: string): string =>
      `${'word '.repeat(58)}abcde ${middle} ${'word '.repeat(200)}`;
    const drain = async (text: string, items: unknown[]): Promise<string> => {
      const out = await withHouseFactsGuard(
        new ReadableStream<string>({
          start(c) {
            c.enqueue(text);
            c.close();
          },
        }),
        { items },
        ON
      );
      let all = '';
      for await (const part of out as unknown as AsyncIterable<string>) all += part;
      return all;
    };

    it.each([
      ['evil dot com', 'evil.com'],
      ['help at evil dot com', 'help@evil.com'],
      ['seven two seven five five five zero one two three', '727-555-0123'],
    ])('the cut lands beside "%s"', async (middle, found) => {
      const items = [user('Hi.'), tool('searchWeb', `${WEB} ${found}`)];
      const text = await drain(run(middle), items);
      expect(text).toContain(CANT_VOUCH);
      expect(text).not.toContain(middle);
    });
  });
});

describe('streaming', () => {
  it.each([
    [['Sure, go to mind', 'meadow.', 'com and tap verify.'], NO],
    [['Sure, go to mindmeadow', '.', 'com.'], NO],
    [['Our web', 'site is glow', 'friend dot ', 'ai. Bye.'], `${NO} Bye.`],
    [['Go to ferni.', 'ai.example.com. Done.'], `${NO} Done.`],
    [['Go to ferni', '.ai', '. Done.'], 'Go to ferni.ai. Done.'],
    [['Go to app.', 'ferni.', 'ai. Done.'], 'Go to app.ferni.ai. Done.'],
  ])('split across chunks: %j', async (parts, want) => {
    expect(await textOf(ASKS_SITE, parts)).toBe(want);
  });

  it.each([
    [['Our website is glow', USAGE, 'friend.ai. ', USAGE, 'Bye.'], `${NO} Bye.`],
    [['Go to verify.', USAGE, 'ferni.ai. ', USAGE], `${NO} `],
    [['Go to mind', USAGE, 'meadow.com.', USAGE], NO],
    [['Our site is glowfriend dot', USAGE, ' ai.', USAGE], NO],
    [
      ['Go to app.', USAGE, 'ferni.ai, then the menu.', USAGE],
      'Go to app.ferni.ai, then the menu.',
    ],
  ])("held whole across Gemini's usage chunks: %j", async (parts, want) => {
    const { text, chunks } = await spoken(ASKS_SITE, parts);
    expect(text).toBe(want);
    expect(chunks.filter((c) => (c as { usage?: unknown }).usage).length).toBe(
      parts.filter((p) => p === USAGE).length
    );
  });

  it('checks the words before a tool call and passes the call through', async () => {
    const { text, chunks } = await spoken(ASKS_SITE, ['Try glowfriend.ai.', toolCall]);
    expect(text).toBe(NO);
    expect(chunks.some((c) => (c.delta?.toolCalls?.length ?? 0) > 0)).toBe(true);
  });

  const drain = async (run: string, items: unknown[] = []) => {
    const start = performance.now();
    const out = await withHouseFactsGuard(
      new ReadableStream<string>({
        start(c) {
          c.enqueue(run);
          c.close();
        },
      }),
      { items },
      ON
    );
    const parts: string[] = [];
    for await (const part of out as unknown as AsyncIterable<string>) parts.push(part);
    return { parts, ms: performance.now() - start };
  };

  it('a long run with no sentence end streams in pieces, nothing lost', async () => {
    const run = 'lorem ipsum dolor '.repeat(300);
    const { parts, ms } = await drain(run);
    expect(ms).toBeLessThan(100);
    expect(parts.join('')).toBe(run);
    expect(parts.length).toBeGreaterThan(5);
  });

  it('a run with nowhere safe to cut is bounded in time and loses nothing', async () => {
    for (const run of ['y-dot-'.repeat(3000), 'a '.repeat(4000)]) {
      const { parts, ms } = await drain(run);
      expect(ms).toBeLessThan(200);
      expect(parts.join('')).toBe(run);
    }
  });

  it('a long conversation is read quickly, and only when a sentence needs it', async () => {
    const items = [user(`${'what website '.repeat(1000)} glowfriend.ai`)];
    const start = performance.now();
    expect(await guardOnly(items, 'Fine.')).toBe('Fine.');
    expect(await guardOnly(items, "It's glowfriend.ai.")).toBe("It's glowfriend.ai.");
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
