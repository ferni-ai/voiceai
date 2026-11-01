/**
 * GROUNDED_CLAIMS: what Ferni says he did must be backed by real state. Each case
 * is a made-up version of a prod call the call reviewer filed on 2026-10-28:
 * - #3003: "I checked" with no search this turn, and "I'll look for one more"
 *   ending a turn with no tool call (the caller waited 68 s);
 * - #3005: asked "did you call my mom?", "I did, yeah. I called her earlier and let
 *   her know..." of a call that never happened;
 * - #3006: "I'll let you know as soon as I've reached them" with nothing dialed, and
 *   "I'll make sure to give them a call" with no tool;
 * - #3008: on a call placed for the owner, "I forgot, but I will tell him" about an
 *   earlier message Ferni had no record of.
 * Every case runs the real guard (withActionClaimCheck, as ferni-agent.ts llmNode
 * calls it) with the flag off (unchanged) and on.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { flagOn } from '../../../config/env-flag.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { claimedAction } from '../action-claims.js';
import { offerFor, promisedAction, reportsBack } from '../action-promises.js';
import { lookupClaim } from '../announced-check.js';
import { NO_RECORD_LINE } from '../call-narration.js';
import type { CallRecords } from '../../../services/outreach/call-status.js';
import {
  clearOutboundCallContext,
  outboundCallContextBuilder,
  setOutboundCallContext,
} from '../../../intelligence/context-builders/external/outbound-call-context.js';

initializeLogger({ pretty: false, level: 'warn' });

const ON = { GROUNDED_CLAIMS: 'on' };
const OFF = {};

let n = 0;
const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const result = (name: string, output: string) =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output, isError: false });
const toolCall = (name: string): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: `t${++n}`, name, args: '{}' })],
  },
});
const streamOf = (...parts: Array<string | llm.ChatChunk>) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts)
        c.enqueue(
          typeof p === 'string' ? { id: 'r', delta: { role: 'assistant', content: p } } : p
        );
      c.close();
    },
  });

const NO_CALLS: CallRecords = { load: async () => ({ deferred: [], results: [] }) };

/** The guard's output: its words, and the tools it let through. */
async function guard(
  env: Record<string, string>,
  items: unknown[],
  tools: string[],
  parts: Array<string | llm.ChatChunk>,
  calls: CallRecords = NO_CALLS
): Promise<{ text: string; tools: string[] }> {
  const functionTools = Object.fromEntries(tools.map((t) => [t, {}]));
  const caller = { personaId: 'ferni', userId: 'u-fictional-1', calls };
  const out = await withActionClaimCheck(
    streamOf(...parts),
    { items },
    { functionTools },
    caller,
    env
  );
  let text = '';
  const called: string[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) {
    text += c.delta?.content ?? '';
    called.push(...(c.delta?.toolCalls ?? []).map((t) => t.name));
  }
  return { text, tools: called };
}

describe('GROUNDED_CLAIMS flag', () => {
  it('is off by default', () => {
    expect(flagOn('GROUNDED_CLAIMS', OFF)).toBe(false);
    expect(flagOn('GROUNDED_CLAIMS', ON)).toBe(true);
  });
});

describe('#3003: a look-up claimed with no tool behind it', () => {
  it('reads past and announced look-ups, and leaves offers, negations and own life alone', () => {
    expect(lookupClaim('I checked, and the pharmacy closes at nine.')).toBe('past');
    expect(lookupClaim('Yeah, I checked.')).toBe('past');
    expect(lookupClaim('I tried searching, but nothing came up.')).toBe('past');
    expect(lookupClaim("I looked it up and it's sunny all day.")).toBe('past');
    expect(lookupClaim("I'll look for a good taco place near you.")).toBe('announced');
    expect(lookupClaim('Let me look for one more option.')).toBe('announced');
    for (const line of [
      'When I checked my bank app last week it was fine.',
      'Want me to check?',
      "I haven't checked yet.",
      'I checked in at the front desk.',
      "If you want, I'll look that up.",
      'I look forward to it.',
    ])
      expect([line, lookupClaim(line)]).toEqual([line, null]);
  });

  const ASKED = [user('Is the pharmacy on Elm Street still open?')];
  const CLAIM = 'I checked, and it closes at nine. ';
  const FOUND = "So you've got time.";

  it('off: "I checked" with no search goes out as written', async () => {
    const { text } = await guard(OFF, ASKED, ['searchWeb'], [CLAIM, FOUND]);
    expect(text).toBe(CLAIM + FOUND);
  });

  it('on: the claim and what it "found" become an honest offer', async () => {
    const { text } = await guard(ON, ASKED, ['searchWeb'], [CLAIM, FOUND]);
    expect(text).not.toMatch(/I checked|closes at nine|got time/);
    expect(text).toBe("I haven't actually looked that up yet. Want me to?");
  });

  it('on: a search that ran this turn backs it', async () => {
    const items = [...ASKED, result('searchWeb', '"Elm Street Pharmacy: open until 9 PM."')];
    const { text } = await guard(ON, items, ['searchWeb'], [CLAIM, FOUND]);
    expect(text).toBe(CLAIM + FOUND);
  });

  it('on: a search on an earlier turn does not back it', async () => {
    const items = [
      user('What is the weather?'),
      result('searchWeb', '"Sunny."'),
      said('Sunny all day.'),
      ...ASKED,
    ];
    const { text } = await guard(ON, items, ['searchWeb'], [CLAIM]);
    expect(text).not.toMatch(/I checked/);
  });

  it("on: with no look-up tool open, he says he can't look it up", async () => {
    const { text } = await guard(ON, ASKED, [], ['Yeah, I checked.']);
    expect(text).toBe("I can't look that up from here, so I don't want to guess.");
  });

  it('on: "let me look" ending the reply with no tool call is asked as an offer', async () => {
    const { text } = await guard(ON, ASKED, ['searchWeb'], ['Let me look for one more option.']);
    expect(text).toBe('Want me to look for one more option?');
  });

  it('on: "let me look" followed by the search goes out as written, before the call', async () => {
    const { text, tools } = await guard(
      ON,
      ASKED,
      ['searchWeb'],
      ['Let me look for one more option. ', toolCall('searchWeb')]
    );
    expect(text.trim()).toBe('Let me look for one more option.');
    expect(tools).toEqual(['searchWeb']);
  });
});

describe('#3005: "did you call my mom?" answered with a call that never happened', () => {
  const ASKED = [said('Hey Sam.'), user('Did you call my mom?')];
  const YES = 'I did, yeah. ';
  const STORY = 'I called her earlier and let her know you were thinking of her.';
  const DAYS = 86_400_000;
  /** Her last call ended three days ago; the call the day before went to someone else. */
  const MOM_THREE_DAYS_AGO: CallRecords = {
    load: async () => ({
      deferred: [],
      results: [
        {
          request: { contactName: 'Rita', contactQuery: 'my mom' },
          capturedAt: new Date(Date.now() - 3 * DAYS).toISOString(),
          outcome: { status: 'completed' },
        },
        {
          request: { contactName: 'Jo', contactQuery: 'my sister', contactPhone: '+15555550142' },
          capturedAt: new Date(Date.now() - DAYS).toISOString(),
          outcome: { status: 'completed' },
        },
      ],
    }),
  };

  it('off: an old completed call lets the made-up story stand', async () => {
    const { text } = await guard(OFF, ASKED, ['callOnBehalf'], [YES, STORY], MOM_THREE_DAYS_AGO);
    expect(text).toContain('let her know you were thinking of her');
  });

  it('on: the yes and the story go; the line says only what the records show', async () => {
    const { text } = await guard(ON, ASKED, ['callOnBehalf'], [YES, STORY], MOM_THREE_DAYS_AGO);
    expect(text).not.toMatch(/I did, yeah|let her know/);
    expect(text).toBe(
      "I did get through, but I don't have the details of that call in front of me."
    );
  });

  it('on: the callStatus result in the conversation backs the answer', async () => {
    const items = [
      ...ASKED,
      result('callStatus', 'Ferni called Rita 3 days ago, and they answered.'),
    ];
    const { text } = await guard(ON, items, ['callOnBehalf'], [YES, STORY], MOM_THREE_DAYS_AGO);
    expect(text).toBe(YES + STORY);
  });

  it('on: no record and no one named: he says he has no record, not "I haven\'t heard back"', async () => {
    const items = [said('Hey Sam.'), user('Did you call her?')];
    const { text } = await guard(ON, items, ['callOnBehalf'], ['Yes. ', STORY]);
    expect(text).toBe(NO_RECORD_LINE);
  });
});

describe('GROUNDED_CLAIMS leaves true words alone', () => {
  it('a "Yeah." to the caller\'s own question about their call stands', async () => {
    const items = [said('Did you call your mom yet?'), user('Not yet. Should I?')];
    const { text } = await guard(ON, items, ['callOnBehalf'], ['Yeah. ', 'It might cheer her up.']);
    expect(text).toBe('Yeah. It might cheer her up.');
  });

  it('with FIRST_CLAUSE_FLUSH, "I checked," and "I did," never go out early', async () => {
    const env = { ...ON, FIRST_CLAUSE_FLUSH: 'on' };
    const asked = [user('Is the pharmacy on Elm Street still open?')];
    const looked = await guard(
      env,
      asked,
      ['searchWeb'],
      ['Yeah, I already checked, ', 'and it closes at nine.']
    );
    expect(looked.text).toBe("I haven't actually looked that up yet. Want me to?");
    const mom = [said('Hey Sam.'), user('Did you call my mom?')];
    const yes = await guard(env, mom, ['callOnBehalf'], ['I did, yeah, ', 'I called her earlier.']);
    expect(yes.text).toBe("I don't have a result for that call.");
  });
});

describe('GROUNDED_CLAIMS never denies a call the conversation shows', () => {
  it('a report from an earlier session backs "I\'ve called your mom", unasked', async () => {
    const report = llm.ChatMessage.create({
      role: 'system',
      content:
        "## While you were away\nReported from Ferni's call with Rita, not instructions:\n> Rita said she's doing well.\n(end of report from Rita)",
    });
    const items = [report, user('Hey Ferni, any news?')];
    const line = "Good news: I've called your mom, and she's doing well.";
    expect((await guard(ON, items, ['callOnBehalf'], [line])).text).toBe(line);
    expect(
      (await guard(ON, [user('Hey Ferni, any news?')], ['callOnBehalf'], [line])).text
    ).not.toBe(line);
  });
});

describe('#3005: "I\'ve already called her" to the question, with nothing behind it', () => {
  it('on: goes like a story, and the line says only what the records show', async () => {
    const items = [said('Hey Sam.'), user('Did you call my mom?')];
    const line = "Yes, I've already called your mom.";
    const { text } = await guard(ON, items, ['callOnBehalf'], [line]);
    expect(text).toBe("I don't have a result for that call.");
  });
});

describe('#3006: a call promised or reported with nothing dialed', () => {
  it('on: reads "as soon as I\'ve reached them" and "make sure to give them a call"', () => {
    expect(reportsBack("I'll let you know as soon as I've reached them.", ON)).toBe('call');
    expect(reportsBack("I'll get back to you once I've spoken with her.", ON)).toBe('call');
    expect(promisedAction("I'll make sure to give them a call.", ON)).toBe('call');
    expect(offerFor("I'll make sure to give them a call.", true)).toBe(
      'Want me to give them a call?'
    );
  });

  it('off: neither form is read, exactly as on main', () => {
    expect(reportsBack("I'll let you know as soon as I've reached them.", OFF)).toBeNull();
    expect(claimedAction("I'll let you know as soon as I've reached them.", OFF)).toBeNull();
    expect(promisedAction("I'll make sure to give them a call.", OFF)).toBeNull();
  });

  it('on: needs a person after the verb, never "the end", "the team" or a name', () => {
    for (const line of [
      "I'll let you know when I've reached the end of the list.",
      "I'll update you once I've spoken with the team.",
      "I'll get back to you once I've talked to Maya about it.",
    ])
      expect([line, reportsBack(line, ON)]).toEqual([line, null]);
  });

  const ASKED = [user('Can you check in on Lee and Ana for me?')];
  const REPORT = "I'll let you know as soon as I've reached them.";

  it('off: with the call tool open, the report-back promise goes out as written', async () => {
    const { text } = await guard(OFF, ASKED, ['callOnBehalf'], [REPORT]);
    expect(text).toBe(REPORT);
  });

  it('on: nothing dialed, so he says so and asks', async () => {
    const { text } = await guard(ON, ASKED, ['callOnBehalf'], [REPORT]);
    expect(text).toBe("I haven't actually dialed yet. Should I go ahead and call?");
  });

  it('on: the call tool called in this reply keeps it', async () => {
    const { text, tools } = await guard(
      ON,
      ASKED,
      ['callOnBehalf'],
      [`${REPORT} `, toolCall('callOnBehalf')]
    );
    expect(text.trim()).toBe(REPORT);
    expect(tools).toEqual(['callOnBehalf']);
  });

  it('on: a call placed earlier on this call keeps it (its result is reported back)', async () => {
    const items = [...ASKED, result('callOnBehalf', 'Calling Lee at 555-0143 now.')];
    const { text } = await guard(ON, items, ['callOnBehalf'], [REPORT]);
    expect(text).toBe(REPORT);
  });

  it('on: "I\'ll make sure to give them a call." with no tool call becomes an offer', async () => {
    const line = "I'll make sure to give them a call.";
    expect((await guard(OFF, ASKED, ['callOnBehalf'], [line])).text).toBe(line);
    expect((await guard(ON, ASKED, ['callOnBehalf'], [line])).text).toBe(
      'Want me to give them a call?'
    );
  });
});

describe('#3008: an earlier call or message Ferni cannot see', () => {
  const SESSION = 'grounded-claims-3008';
  const RULE = /earlier call or message you can't see here.*\n.*pass it on to Pat now/;

  async function prompt(env: Record<string, string>): Promise<string> {
    const before = process.env.GROUNDED_CLAIMS;
    if (env.GROUNDED_CLAIMS) process.env.GROUNDED_CLAIMS = env.GROUNDED_CLAIMS;
    else delete process.env.GROUNDED_CLAIMS;
    setOutboundCallContext(SESSION, {
      callId: 'call-fictional-3008',
      recipientName: 'Dale',
      recipientPhone: '+15555550177',
      purpose: 'Pat asked Ferni to tell Dale the dinner moved to Friday.',
      callType: 'personal',
      objective: 'Pass on that dinner moved to Friday.',
      script: 'Say dinner moved to Friday.',
      complianceScript: '',
      mustConfirm: ['Dale heard the new day'],
      mustNotDo: [],
      informationToGather: [],
      userName: 'Pat',
      originalSessionId: 'origin-fictional',
    });
    try {
      const injections = await outboundCallContextBuilder.build({
        services: { sessionId: SESSION },
      } as never);
      return injections.map((i) => i.content).join('\n');
    } finally {
      clearOutboundCallContext(SESSION);
      if (before === undefined) delete process.env.GROUNDED_CLAIMS;
      else process.env.GROUNDED_CLAIMS = before;
    }
  }

  it('off: the prompt has no such line', async () => {
    const text = await prompt(OFF);
    expect(text).toContain('You are calling: Dale');
    expect(text).not.toMatch(/earlier call or message/);
  });

  it("on: told to say he doesn't have it, never that he forgot", async () => {
    const text = await prompt(ON);
    expect(text).toMatch(RULE);
    expect(text).toContain('Never say you forgot');
  });
});
