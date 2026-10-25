/**
 * "I'll text him then" with no tool call (action-promises.ts, through
 * action-claim-guard.ts). Dev replay 2026-10-18: Ferni promised to text and
 * called nothing, and the guard let it stand.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { offerFor, promisedAction } from '../action-promises.js';

initializeLogger({ pretty: false, level: 'warn' });

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const preview = (name: string) =>
  llm.FunctionCallOutput.create({
    callId: 'c0',
    name,
    output: 'NOT SENT YET. Read this back and ask for a yes.',
    isError: false,
  });
type Part = string | { tool: string };
const streamOf = (...parts: Part[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) {
        if (typeof p === 'string') c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
        else
          c.enqueue({
            id: 'r',
            delta: {
              role: 'assistant',
              toolCalls: [llm.FunctionCall.create({ callId: 'c1', name: p.tool, args: '{}' })],
            },
          });
      }
      c.close();
    },
  });

const TOOLS = { functionTools: { quickText: {}, callOnBehalf: {} } };
async function reply(
  items: unknown[],
  ...parts: Part[]
): Promise<{ text: string; tools: string[] }> {
  const out = await withActionClaimCheck(streamOf(...parts), { items }, TOOLS, 'ferni', {});
  let text = '';
  const tools: string[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) {
    text += c.delta?.content ?? '';
    for (const call of c.delta?.toolCalls ?? []) tools.push(call.name);
  }
  return { text, tools };
}

const ASK = [said('Want to let your brother know?'), user("Yeah, he's waiting on me.")];

describe('a promise to act, with no tool call', () => {
  it('"I\'ll text him then." with no tool is asked as an offer', async () => {
    const { text, tools } = await reply(ASK, "Okay, I'll text him then. ", 'Talk soon!');
    expect(text).not.toContain("I'll text him");
    expect(text).toBe('Want me to text him? Talk soon!');
    expect(tools).toEqual([]);
  });

  it('with the tool called after it, the words stand', async () => {
    const { text, tools } = await reply(ASK, "Okay, I'll text him then. ", { tool: 'quickText' });
    expect(text).toBe("Okay, I'll text him then. ");
    expect(tools).toEqual(['quickText']);
  });

  it('with the tool called before it, the words stand', async () => {
    const { text } = await reply(ASK, { tool: 'quickText' }, "I'll send that now.");
    expect(text).toBe("I'll send that now.");
  });

  it('"I\'ll call her now." with no call is asked as an offer', async () => {
    const items = [user('Can you call my mom?')];
    expect((await reply(items, "Sure, I'll call her now.")).text).toBe('Want me to call her?');
  });

  it('with no tool of the kind open, says so instead of offering', async () => {
    const items = [user('Text my brother.')];
    const out = await withActionClaimCheck(
      streamOf("I'll text him then."),
      { items },
      { functionTools: { callOnBehalf: {} } },
      'ferni',
      {}
    );
    let text = '';
    for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>)
      text += c.delta?.content ?? '';
    expect(text).toMatch(/^I can't actually send messages for you/);
  });

  it('the read-back while the text waits for a yes stands', async () => {
    const items = [user('Text Dana that I am late.'), preview('quickText')];
    const line = "I'll text Dana that you're running late.";
    expect((await reply(items, line)).text).toBe(line);
  });
});

describe('what counts as a promise', () => {
  it.each([
    ["I'll text him then.", 'send'],
    ["I'll send that.", 'send'],
    ['Let me text your sister.', 'send'],
    ["Okay, I'll call her now.", 'call'],
    ["I'm going to give your dad a call.", 'call'],
    ["I'll shoot him a quick message.", 'send'],
  ])('%j promises %s', (sentence, kind) => {
    expect(promisedAction(sentence)).toBe(kind);
  });

  it.each([
    'Want me to text him?',
    "If you want, I'll text him.",
    "I'll text him once you tell me what to say.",
    "I won't call her.",
    "I'll call it a night soon.",
    "I'm sending you a big hug.",
    "I'll call you back.",
    "Last summer I'll never forget, I called my dad.",
  ])('%j is not', (sentence) => {
    expect(promisedAction(sentence)).toBeNull();
  });

  it.each([
    ["Okay, I'll text him then.", 'Want me to text him?'],
    ["I'll send that right away!", 'Want me to send that?'],
    ['Let me call your mom now, okay.', 'Want me to call your mom?'],
  ])('%j is offered as %j', (sentence, offer) => {
    expect(offerFor(sentence)).toBe(offer);
  });
});
