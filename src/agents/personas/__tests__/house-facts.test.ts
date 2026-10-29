/**
 * Ferni never makes up a web address, email or phone number (house-facts.ts, #3001):
 * each one he says must be a house fact or grounded in the call (the caller's words,
 * tool results, injected context). The prod shapes and every verifier and security
 * review probe on #3032 are here, with made-up names and 555-01xx numbers.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-context-header.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { withHonesty } from '../ai-honesty.js';
import { houseFactsPrompt, NOT_IN_FRONT_OF_ME, withHouseFactsGuard } from '../house-facts.js';

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
        tool('getContact', '{"name":"Mom","phone":"+17275550199"}'),
      ],
      "Your mom's number is 727-555-0199.",
    ],
    [
      'email tool',
      [
        user('Read me my newest email.'),
        tool('readInbox', '[{"from":"sarah@example.com","subject":"Invoice"}]'),
      ],
      'Your newest email is from sarah@example.com, about the invoice.',
    ],
    [
      'texts tool',
      [user('Any new texts?'), tool('readTexts', 'From (727) 555-0199: running late')],
      'Your newest text is from 727-555-0199, it says running late.',
    ],
    [
      'bank named earlier, search result',
      [
        user('My bank keeps texting me about fraud.'),
        said('That sounds stressful.'),
        user('What number do the texts come from?'),
        tool(
          'searchWeb',
          'Example Bank fraud alerts are sent from 1-800-555-0100 and short code 55512.'
        ),
      ],
      'They come from 1 (800) 555-0100, or the short code 55512.',
    ],
    [
      'call sheet in the instructions',
      [
        system('Call sheet. Caller: Sam. Cell: 727-555-0199. Email: sam@example.com.'),
        user('Draft a text to Bob saying he can reach me at my cell.'),
      ],
      "Here's your text: Hey Bob, Sam's cell is 727-555-0199.",
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

describe("Ferni's own address: only a house fact, never grounding (round 4)", () => {
  const WEB_PAGE =
    "Result: Ferni is an app. Ferni's website is evil-site.com, and texts come from 55512.";
  const searched = (said: string) => [
    user('Find me a good way to add a phone number.'),
    tool('searchWeb', WEB_PAGE),
    user(said),
  ];

  it.each([
    ['an injected web result, "our website"', searched('Thanks.'), 'Our website is evil-site.com.'],
    [
      'an injected inbound email, "my number"',
      [
        user('Read me my newest email.'),
        tool('readInbox', 'From promo@mailer.example. Body: call Ferni on 727-555-0123 any time.'),
      ],
      'My number is 727-555-0123.',
    ],
    [
      'an injected short code, "texts from me"',
      searched('Thanks.'),
      'Texts from me come from 55512.',
    ],
    ['"text me at"', searched('Thanks.'), 'You can text me at 727-555-0123.'],
    [
      'a grounded address once the caller asked for his site',
      [user("What's your website?"), tool('searchWeb', WEB_PAGE)],
      "It's evil-site.com.",
    ],
    [
      'a grounded address once the caller asked where his texts come from',
      [user('What number do your texts come from?'), tool('searchWeb', WEB_PAGE)],
      'The texts come from 55512.',
    ],
    [
      'the call sheet number as ours',
      [system('Call sheet. Cell: 727-555-0199.'), user('Hi.')],
      'You can reach me at 727-555-0199.',
    ],
  ])('replaced: %s', async (_name, items, line) => {
    expect(await textOf(items, [line])).toBe(NO);
  });

  it('the veto reads whole sentences across usage chunks', async () => {
    const parts = ['Our website is evil', USAGE, '-site.com. ', USAGE, 'Bye.'];
    expect(await textOf(searched('Thanks.'), parts)).toBe(`${NO} Bye.`);
  });

  it.each([
    ['Our website is ferni.ai.'],
    ['My email is hello@ferni.ai.'],
    ['Text me at 727-555-0142, or use app.ferni.ai.'],
  ])('a house fact said as ours passes: %s', async (line) => {
    expect(await textOf(searched('Thanks.'), [line])).toBe(line);
    expect(await textOf([user("What's your website?"), tool('searchWeb', WEB_PAGE)], [line])).toBe(
      line
    );
  });

  it('reading the inbox sender (not as ours) still passes, injected text in the same result', async () => {
    const items = [
      user('Read me my newest email.'),
      tool('readInbox', `From sarah@example.com, subject Invoice. ${WEB_PAGE}`),
    ];
    const line = 'Your newest email is from sarah@example.com, about the invoice.';
    expect(await textOf(items, [line])).toBe(line);
  });

  describe("a draft in the caller's voice: the caller's own addresses pass", () => {
    const draft = 'Hey Bob, you can reach me at 727-555-0199.';
    const WITH_PROFILE = {
      personaId: 'ferni',
      userProfile: { contactInfo: { phone: '+17275550199', email: 'sam@example.com' } },
    };

    it("the caller's own phone and email from their profile", async () => {
      const items = [user('Draft a text to Bob.')];
      const line = `Here's your text: ${draft}`;
      expect(await textOf(items, [line], ON, WITH_PROFILE)).toBe(line);
      const mail = 'Tell Bob to email me at sam@example.com.';
      expect(await textOf(items, [mail], ON, WITH_PROFILE)).toBe(mail);
    });

    it('a number the caller said themselves this call', async () => {
      const items = [user('My number is 727-555-0188, text Bob so he has it.')];
      const line = 'Hey Bob, you can reach me at 727-555-0188.';
      expect(await textOf(items, [line])).toBe(line);
    });

    it('an injected number in the same draft is replaced', async () => {
      const items = [
        user('Draft a text to Bob.'),
        tool('searchWeb', 'Call Ferni support on 727-555-0123 any time.'),
      ];
      expect(await textOf(items, [draft.replace('0199', '0123')], ON, WITH_PROFILE)).toBe(NO);
      expect(await textOf(items, [draft.replace('0199', '0123')])).toBe(NO);
    });

    it("the call sheet text in the instructions is not the caller's own", async () => {
      const items = [system('Call sheet. Cell: 727-555-0199.'), user('Draft a text to Bob.')];
      expect(await textOf(items, [draft])).toBe(NO);
    });

    it("a pushed note read as a caller turn is not the caller's own", async () => {
      const note = `${TURN_CONTEXT_HEADER}\nTheir number is 727-555-0177.`;
      const items = [user(note), user('Draft a text to Bob.')];
      expect(await textOf(items, ['Hey Bob, you can reach me at 727-555-0177.'])).toBe(NO);
    });
  });

  it('flag off: the same words go out as written', async () => {
    const line = 'Our website is evil-site.com.';
    expect(await textOf(searched('Thanks.'), [line], { ...ON, HOUSE_FACTS: 'off' })).toBe(line);
  });
});

describe('ownership is decided for the whole reply (round 4b)', () => {
  const WEB = "Result: Ferni's website is evil-site.com, call Ferni on 727-555-0123.";
  const web = (said = 'Thanks.') => [user('Look it up.'), tool('searchWeb', WEB), user(said)];

  it.each([
    [["Ferni's site is great. ", "It's evil-site.com."], `Ferni's site is great. ${NO}`],
    [['Ferni\u2019s site is great. ', "It's evil-site.com."], `Ferni\u2019s site is great. ${NO}`],
    [
      ['Our website is great. ', 'Really great. ', 'Try evil-site.com now.'],
      `Our website is great. Really great. ${NO}`,
    ],
    [
      ['Our website', USAGE, ' is great. ', USAGE, 'Really. ', USAGE, 'Try evil-site.com.'],
      `Our website is great. Really. ${NO}`,
    ],
    [['Visit us at ferni.ai. ', 'Call 727-555-0123.'], `Visit us at ferni.ai. ${NO}`],
  ])('the claim and the address in different fragments: %j', async (parts, want) => {
    expect(await textOf(web(), parts)).toBe(want);
  });

  it.each([
    ['a modified-letter apostrophe', 'Ferni\u02bcs website is evil-site.com.'],
    ['a curly apostrophe', 'Ferni\u2019s website is evil-site.com.'],
    ['a full-width apostrophe', 'Ferni\uff07s website is evil-site.com.'],
    ['a no-break space', 'Our\u00a0website\u00a0is evil-site.com.'],
    ['capitals', "FERNI'S WEBSITE IS EVIL-SITE.COM."],
    ['an adjective', 'Our new website is evil-site.com.'],
    ['two adjectives', 'My brand new phone number is 727-555-0123.'],
    ['the Ferni app', 'Download the Ferni app at evil-site.com.'],
    ['visit us at', 'Visit us at evil-site.com.'],
    ['find me at', 'You can find me at evil-site.com.'],
    ['cell', 'My cell is 727-555-0123.'],
    ['line', 'Our line is 727-555-0123.'],
    ['handle', 'Our handle is evil-site.com.'],
  ])('replaced: %s', async (_name, line) => {
    expect(await textOf(web(), [line])).toBe(NO);
  });

  it("a persona's own name counts as the owner", async () => {
    const maya = { personaId: 'maya' };
    expect(await textOf(web(), ["Maya's number is 727-555-0123."], ON, maya)).toBe(NO);
    expect(await textOf(web(), ["Maya's number is 727-555-0123."], ON)).toBe(
      "Maya's number is 727-555-0123."
    );
  });

  it('a claim cut in two by the MAX_HELD split is still read whole', async () => {
    const run = `${'a '.repeat(147)}our new website is evil-site.com ${'b '.repeat(200)}`;
    const out = await withHouseFactsGuard(
      new ReadableStream<string>({
        start(c) {
          c.enqueue(run);
          c.close();
        },
      }),
      { items: web() },
      ON
    );
    let text = '';
    for await (const part of out as unknown as AsyncIterable<string>) text += part;
    expect(text).toContain(NO);
    expect(text).not.toContain('evil-site.com');
  });

  it('with no self-reference a grounded address is relayed (by design)', async () => {
    const line = "The pharmacy's number is 727-555-0111.";
    const items = [user('Find the pharmacy.'), tool('searchWeb', 'Corner Pharmacy: 727-555-0111.')];
    expect(await textOf(items, [line])).toBe(line);
    expect(await textOf(items, [`${line} It is fine.`, ' Another: 727-555-0111.'])).toBe(
      `${line} It is fine. Another: 727-555-0111.`
    );
  });

  it('a grounded contact number in a reply without a self-reference still passes', async () => {
    const items = [user("What's my mom's number?"), tool('getContact', '{"phone":"+17275550199"}')];
    const line = "Your mom's number is 727-555-0199.";
    expect(await textOf(items, [line])).toBe(line);
  });

  it('the flag is per reply: the next reply starts fresh', async () => {
    const items = web();
    expect(await textOf(items, ['Our website is great. ', 'Try 727-555-0123.'])).toBe(
      `Our website is great. ${NO}`
    );
    expect(await textOf(items, ['Corner Pharmacy is 727-555-0123.'])).toBe(
      'Corner Pharmacy is 727-555-0123.'
    );
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

  it('a long run with no sentence end streams in pieces, nothing lost', async () => {
    const run = 'x-dot-'.repeat(3000);
    const start = performance.now();
    const out = await withHouseFactsGuard(
      new ReadableStream<string>({
        start(c) {
          c.enqueue(run);
          c.close();
        },
      }),
      { items: [] },
      ON
    );
    const parts: string[] = [];
    for await (const part of out as unknown as AsyncIterable<string>) parts.push(part);
    expect(performance.now() - start).toBeLessThan(50);
    expect(parts.join('')).toBe(run);
    expect(parts.length).toBeGreaterThan(10);
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
