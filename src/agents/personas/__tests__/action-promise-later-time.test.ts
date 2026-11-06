/**
 * ACTION_PROMISE_KEPT_ON_SUCCESS, the later-time rule (round 2): only Ferni's
 * own promise or offer of a call or text can be set for later, and a sentence
 * that gives a crisis or emergency line is never touched.
 *
 * The turn: the caller asks for a call to Aunt June, reachOut returns its
 * read-back, and the reply around it is judged. With the flag on, Ferni's "I'll
 * call her tonight." is dropped (the yes dials now). Advice to the caller,
 * reported speech and safety guidance stand exactly as main has them.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { withActionClaimCheck } from '../action-claim-guard.js';

initializeLogger({ pretty: false, level: 'warn' });

const ON = { ACTION_PROMISE_KEPT_ON_SUCCESS: 'on' };
const OFF = {};

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const ran = (callId: string, name: string, output: string) => [
  llm.FunctionCall.create({ callId, name, args: '{}' }),
  llm.FunctionCallOutput.create({ callId, name, output, isError: false }),
];
const streamOf = (...parts: string[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
      c.close();
    },
  });
const OUTREACH = { functionTools: { reachOut: {}, createReminder: {} } };
async function reply(items: unknown[], env: Record<string, string>, ...parts: string[]) {
  const out = await withActionClaimCheck(streamOf(...parts), { items }, OUTREACH, undefined, env);
  const chunks: llm.ChatChunk[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) chunks.push(c);
  return chunks.map((c) => c.delta?.content ?? '').join('');
}

const PREVIEW_OUT =
  'NOT SENT YET. Read this to the caller word for word and ask if you should go ahead: ' +
  'a call to Aunt June at +18015550142, saying "Happy birthday, June!". ' +
  'Call reachOut again only after the caller says yes.';
const READ_BACK = [
  user('Call my aunt June tonight and wish her happy birthday.'),
  ...ran('r1', 'reachOut', PREVIEW_OUT),
];
const YES = [...READ_BACK, user('Yes.')];
const DISTRESS = [...READ_BACK, user("Actually, I don't want to be here anymore.")];
const LATER_LINE = "I can't set a call for later yet";

/** The four lines the round-1 verify saw dropped (#3499 issuecomment-6678505910). */
const SAFETY_LINES = [
  'If it gets worse tonight, please call or text 988 right away.',
  'You can call or text 988 any time, tonight or tomorrow.',
  'You can always text 988, day or night, tonight too.',
  'If the chest pain comes back tonight, call 911.',
];

describe('later-time rule: crisis and emergency guidance always stands', () => {
  const turns = { 'read-back': READ_BACK, yes: YES, distress: DISTRESS };
  for (const [name, items] of Object.entries(turns)) {
    it.each(SAFETY_LINES)(`${name} turn, flag on: %j stands as main has it`, async (said) => {
      const on = await reply(items, ON, said);
      expect(on).toContain(said);
      expect(on).not.toContain(LATER_LINE);
      expect(on).toBe(await reply(items, OFF, said));
    });
  }

  it('the 988 sentence stands beside the words around it', async () => {
    const said = ["I'm here with you. ", SAFETY_LINES[1]];
    expect(await reply(DISTRESS, ON, ...said)).toBe(await reply(DISTRESS, OFF, ...said));
  });

  // Ferni's own words, so only the safety skip keeps them (the mutant without it goes red).
  it.each([
    'I can call or text 988 with you tonight, if it gets worse.',
    'Want me to call the crisis line with you tonight?',
  ])('read-back turn, flag on: Ferni offering a crisis line, %j, stands', async (said) => {
    const on = await reply(READ_BACK, ON, said);
    expect(on).toBe(said);
    expect(on).toBe(await reply(READ_BACK, OFF, said));
  });
});

describe("later-time rule: only Ferni's own promise or offer is timed", () => {
  it.each([
    "She said she'd call you back tonight.",
    'Call her tonight if you like.',
    'You can text her tomorrow.',
    'Your cousin is calling her tonight too.',
    'If I were you, I would call her tonight.',
    'Honestly, calling her tonight might be easier for you.',
  ])('flag on: %j is not Ferni setting a call for later, so it is as main', async (said) => {
    const on = await reply(READ_BACK, ON, said);
    expect(on).toContain(said);
    expect(on).toBe(await reply(READ_BACK, OFF, said));
  });

  it.each([
    "I'll call her tonight.",
    'I can call her tonight.',
    'Let me call her at 9pm.',
    'Should I ring her tomorrow?',
    'Want me to give her a ring at 8pm?',
    'Calling her at eight.',
  ])('flag on: Ferni says %j, so the time is asked about', async (said) => {
    const text = await reply(READ_BACK, ON, said);
    expect(text).not.toContain(said);
    expect(text).toContain(LATER_LINE);
  });

  it('the yes turn: an offer for later is asked about too', async () => {
    const said = 'Want me to give her a ring at 8pm?';
    const text = await reply(YES, ON, said);
    expect(text).not.toContain(said);
    expect(text).toContain(LATER_LINE);
  });
});

describe('later-time rule: what is carried, where, and how soon', () => {
  it.each([
    "I'll call and say I'll be there at noon.",
    "I'll call her to say the bus comes at six.",
    "I'll call her and say you land at 6pm.",
    "I'll call her to tell her the bus comes at six.",
    "I'll call her, she's at 4 Elm Road.",
    "I'll call her in 5 minutes.",
    "I'll call her in ten minutes.",
    "I'll call her in a few minutes.",
  ])('flag on: %j sets no later time for the call, so it stands', async (said) => {
    const on = await reply(READ_BACK, ON, said);
    expect(on).toBe(said);
  });

  it.each([
    "I'll call her at half past eight.",
    "I'll call her in 11 minutes.",
    "I'll call her in fifteen minutes.",
  ])('flag on: %j is later, so the time is asked about', async (said) => {
    const text = await reply(READ_BACK, ON, said);
    expect(text).not.toContain(said);
    expect(text).toContain(LATER_LINE);
  });
});

describe('later-time rule: the line', () => {
  it('the whole reply: no leading "though", and a plain "remind you then"', async () => {
    expect(await reply(READ_BACK, ON, "I'll call her tonight.")).toBe(
      "I can't set a call for later yet. Should I call now, or remind you then?"
    );
  });

  it('after other words: "though" sets the line against them', async () => {
    const text = await reply(READ_BACK, ON, 'She will love that. ', "I'll call her tonight.");
    expect(text).toBe(
      "She will love that. I can't set a call for later yet, though. Should I call now, or remind you then?"
    );
  });
});
