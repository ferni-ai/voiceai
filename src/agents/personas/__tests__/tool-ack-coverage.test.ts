/**
 * TOOL_ACK_WIDE: the tools the dead-air audit found silent (2026-10-22) get a
 * lead-in or "On it." before the call; with the flag off nothing changes.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { LEAD_INS, ON_IT, withoutPastLeadIns, withToolLeadIn } from '../tool-lead-in.js';

const ON = { TOOL_ACK_WIDE: 'on' };
const asked = (words: string) => ({
  items: [{ type: 'message', role: 'user', textContent: words }],
});
const call = (name: string) => ({ id: '1', delta: { role: 'assistant', toolCalls: [{ name }] } });

async function spokenBefore(tool: string, words: string, env: object, session: object = {}) {
  const input = new ReadableStream<object>({
    start(c) {
      c.enqueue(call(tool));
      c.close();
    },
  });
  const out: object[] = [];
  const stream = withToolLeadIn(input as never, asked(words) as never, session, env as never);
  for await (const chunk of stream as unknown as AsyncIterable<object>) out.push(chunk);
  expect(out.at(-1)).toEqual(call(tool)); // the tool call itself always goes through
  return out
    .map((c) => (c as { delta?: { content?: string } }).delta?.content ?? '')
    .join('')
    .trim();
}

describe('TOOL_ACK_WIDE tool coverage', () => {
  const calls = [
    ['callOnBehalf', 'Can you call my sister and ask about Sunday?'],
    ['callAndConverse', 'Call the restaurant and book a table for two.'],
    ['callUser', 'Call me back in a bit.'],
    ['saveContact', 'Add Dana as a new contact.'],
    ['manageContact', 'Delete the old number for Sam from my list.'],
  ] as const;

  it('flag off: calls, contact tools and marketData stay as before (no line)', async () => {
    for (const [tool, words] of calls) expect(await spokenBefore(tool, words, {}), tool).toBe('');
    expect(await spokenBefore('marketData', 'How is the stock market doing?', {})).toBe('');
    expect(await spokenBefore('getContactInfo', 'What is Dana’s number?', {})).toBe('');
  });

  it('flag on: a call or contact change the caller asked for gets "On it." and nothing that sounds done', async () => {
    const session = {};
    for (let round = 0; round < 3; round++) {
      for (const [tool, words] of calls) {
        expect(await spokenBefore(tool, words, ON, session), tool).toBe(ON_IT);
      }
    }
  });

  it('flag on: marketData and the contact look-ups the caller asked for get a look-up line', async () => {
    for (const [tool, words] of [
      ['marketData', 'How is the stock market doing?'],
      ['getContactInfo', 'Can you look up Dana’s number?'],
      ['searchContacts', 'Find who I know in Denver.'],
    ] as const) {
      expect(LEAD_INS as readonly string[], tool).toContain(await spokenBefore(tool, words, ON));
    }
  });

  it('flag on: a look-up the model makes unasked gets nothing', async () => {
    expect(await spokenBefore('getContactInfo', 'My brother and I used to be close.', ON)).toBe('');
  });

  it('flag on: never "Let me pull that up." after hard news', async () => {
    const words = 'My brother passed away last week. Can you look up his old number?';
    expect(await spokenBefore('getContactInfo', words, ON)).toBe('');
    expect(
      await spokenBefore(
        'searchContacts',
        'Find my contacts. I just got diagnosed with cancer.',
        ON
      )
    ).toBe('');
  });

  it('flag on: no "On it." after hard news either; Ferni goes straight to the read-back', async () => {
    expect(await spokenBefore('callOnBehalf', 'My mom died. Call my sister.', ON)).toBe('');
    expect(await spokenBefore('saveContact', 'Add the funeral home as a contact.', ON)).toBe('');
  });

  it('flag on: a call the model makes unasked (no request in the words) gets nothing', async () => {
    expect(await spokenBefore('callOnBehalf', 'I miss her so much lately.', ON)).toBe('');
  });

  it('"On it." is cut from later requests like the other acks', () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'Call my sister.' });
    ctx.addMessage({ role: 'assistant', content: ON_IT });
    ctx.insert(llm.FunctionCall.create({ callId: 'c', name: 'callOnBehalf', args: '{}' }));
    ctx.insert(
      llm.FunctionCallOutput.create({
        callId: 'c',
        name: 'callOnBehalf',
        output: 'ok',
        isError: false,
      })
    );
    ctx.addMessage({ role: 'user', content: 'Thanks!' });
    const texts = withoutPastLeadIns(ctx, ON).items.map(
      (i) => (i as { textContent?: string }).textContent
    );
    expect(texts).not.toContain(ON_IT);
  });
});
