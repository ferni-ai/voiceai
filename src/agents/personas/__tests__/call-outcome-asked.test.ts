/**
 * A new call: the caller asks how a call Ferni was asked to make on an earlier
 * call went (call-narration.ts, through action-claim-guard.ts). Dev replay
 * 2026-10-18 (paraphrased): asked "how did it go with my dad?", Ferni said he
 * had called, the dad was watching a game, and he "did say to tell you he's
 * fine". The call had been requested earlier and no result existed.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { withActionClaimCheck } from '../action-claim-guard.js';
import {
  askedCallLine,
  callAskedAbout,
  narratesCallOutcome,
  UNHEARD_LINE,
} from '../call-narration.js';
import type { CallRecords } from '../../../services/outreach/call-status.js';

initializeLogger({ pretty: false, level: 'warn' });

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const streamOf = (...parts: string[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
      c.close();
    },
  });

const NOW = Date.now();
const iso = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();
const DAD = { kind: 'on_behalf', request: { contactName: 'Fred', contactQuery: 'my dad' } };

/** Records as call-status.ts reads them; `reads` counts lookups. */
function records(deferred: object[] = [], results: object[] = []) {
  const store = {
    reads: 0,
    async load() {
      store.reads += 1;
      return {
        deferred: deferred as Array<Record<string, unknown>>,
        results: results as Array<Record<string, unknown>>,
      };
    },
  };
  return store satisfies CallRecords & { reads: number };
}

async function reply(items: unknown[], calls: CallRecords, ...parts: string[]): Promise<string> {
  const tools = { functionTools: { callOnBehalf: {} } };
  const caller = { personaId: 'ferni', userId: 'u1', calls };
  const out = await withActionClaimCheck(streamOf(...parts), { items }, tools, caller, {});
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>)
    text += c.delta?.content ?? '';
  return text;
}

// A new call: nothing about the call is in this conversation but the question.
const ASKED = [said('Hey Sam, good to hear you.'), user('Hey. So how did it go with my dad?')];
const STORY =
  "I called Fred, he's watching a game with a sore knee, but he did say to tell you he's fine. ";
const AFTER = 'Anything else on your mind?';

describe('asked about an earlier requested call, in a new call', () => {
  it('a stored request with no result: the story is dropped and where it stands is said', async () => {
    const calls = records([{ ...DAD, status: 'placing', createdAt: iso(-3_600_000) }]);
    const text = await reply(ASKED, calls, STORY, AFTER);
    expect(text).not.toMatch(/watching a game|tell you he's fine|I called Fred/);
    expect(text).toContain(UNHEARD_LINE);
    expect(text).toContain(AFTER);
    expect(calls.reads).toBe(1);
  });

  it('a held request: says it has not been made and when it is set', async () => {
    const at = iso(2 * 3_600_000);
    const calls = records([
      { ...DAD, status: 'pending', scheduledFor: at, timezone: 'America/New_York' },
    ]);
    const text = await reply(ASKED, calls, STORY);
    expect(text).not.toMatch(/watching a game/);
    expect(text).toMatch(/^I haven't made that call yet\. It's set for .+ their time\.$/);
  });

  it('a failed call: says it did not get through', async () => {
    const calls = records(
      [],
      [{ request: DAD.request, capturedAt: iso(-60_000), outcome: { status: 'no_answer' } }]
    );
    expect(await reply(ASKED, calls, STORY)).toBe(askedCallLine({ state: 'failed' }));
  });

  it('no call to them on record: no result to tell', async () => {
    expect(await reply(ASKED, records(), STORY)).toBe("I don't have a result for that call.");
  });

  it('a completed result: the story stands', async () => {
    const calls = records(
      [],
      [{ request: DAD.request, capturedAt: iso(-60_000), outcome: { status: 'completed' } }]
    );
    expect(await reply(ASKED, calls, STORY, AFTER)).toBe(`${STORY}${AFTER}`);
  });

  it("the caller's own story stands", async () => {
    const own = [
      said('Hey Sam.'),
      user("I called my dad this morning and he said he's fine, just watching a game."),
    ];
    const line = "He said he's fine? That's good to hear. ";
    const calls = records();
    expect(await reply(own, calls, line, AFTER)).toBe(`${line}${AFTER}`);
    expect(calls.reads).toBe(0);
  });

  it('nothing asked about a call: no lookup, words untouched', async () => {
    const calls = records();
    const items = [said('Hey Sam.'), user('Long day at work, honestly.')];
    expect(await reply(items, calls, "I'm sorry, that sounds rough. ")).toBe(
      "I'm sorry, that sounds rough. "
    );
    expect(calls.reads).toBe(0);
  });
});

describe('the caller asks about a call', () => {
  it.each([
    ['how did it go with my dad?', 'dad'],
    ["How'd it go with Fred?", 'fred'],
    ['did you call my mom?', 'mom'],
    ['Did you reach my father?', 'dad'],
    ['did you get ahold of my sister', 'sister'],
    ['What did my brother say?', 'brother'],
    ['how did the call with my mother go', 'mom'],
  ])('%j asks about %s', (words, person) => {
    expect(callAskedAbout(words)).toEqual({ person });
  });

  it.each(['did you call him?', 'what did he say?'])('%j asks, naming no one', (words) => {
    expect(callAskedAbout(words)).toEqual({});
  });

  it.each(['what did you say?', 'how was your day?', 'I called my dad today.', 'how did it go?'])(
    '%j does not ask about one',
    (words) => {
      expect(callAskedAbout(words)).toBeNull();
    }
  );
});

describe('more ways of telling how a call went', () => {
  it.each([
    'I called Fred.',
    'I called your dad and he picked up.',
    'I finally reached him.',
    'I talked to Fred for a while.',
    'I spoke with your mom.',
    'He did say to tell you he is fine.',
    'She also said to tell you hi.',
    "He said he's fine.",
    'Fred says she was out.',
    'Your dad wanted me to tell you he loves you.',
  ])('%j tells how a call went', (sentence) => {
    expect(narratesCallOutcome(sentence, false)).toBe(true);
  });

  it.each([
    "It says it's sunny out.",
    'I called it a day early.',
    'Did he say he was fine?',
    'I reached out to see how you are.',
  ])('%j does not', (sentence) => {
    expect(narratesCallOutcome(sentence, false)).toBe(false);
  });
});
