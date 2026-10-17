/**
 * "On your calendar" claims need a calendar create on this call (#1547).
 *
 * Synthetic paraphrase of the dev call: with no calendar connected, the caller
 * asked for lunch tomorrow and Ferni said it was on their calendar. The create
 * either never ran or only saved to Ferni's own list.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { claimedAction } from '../action-claims.js';

initializeLogger({ pretty: false, level: 'warn' });

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
const toolCall = (name: string): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: 'x', name, args: '{}' })],
  },
});
function streamOf(...parts: Array<string | llm.ChatChunk>): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === 'string' ? chunk(p) : p);
      c.close();
    },
  });
}
const textOf = async (stream: ReadableStream<llm.ChatChunk>): Promise<string> => {
  const out: llm.ChatChunk[] = [];
  for await (const c of stream as unknown as AsyncIterable<llm.ChatChunk>) out.push(c);
  return out.map((c) => c.delta?.content ?? '').join('');
};

const ASK = llm.ChatMessage.create({
  role: 'user',
  content: 'Can you add lunch with Sam tomorrow at noon?',
});
let n = 0;
const result = (name: string, output: string): llm.FunctionCallOutput =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output, isError: false });
const toolsWith = (...names: string[]) => ({
  functionTools: Object.fromEntries(names.map((name) => [name, {}])),
});
const check = (
  stream: ReadableStream<llm.ChatChunk>,
  items: unknown[],
  tools: { functionTools: Record<string, unknown> }
) =>
  withActionClaimCheck(
    Promise.resolve(stream),
    { items },
    tools,
    { ACTION_CLAIM_STREAM: 'on' }
  );

describe('calendar claims', () => {
  it('"I\'ve got that on your calendar" is a schedule claim', () => {
    expect(claimedAction("I've got that on your calendar for tomorrow at noon.")).toBe('schedule');
  });

  it('with the create tool open but never called, the claim is dropped and the reply asks first', async () => {
    const parts = ["I've got that on your calendar for tomorrow at noon. ", 'Anything else?'];
    const text = await textOf(
      await check(streamOf(...parts), [ASK], toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).toContain("It isn't booked yet, though. Should I go ahead and book it?");
  });

  it('a create called later in the same reply makes the claim stand', async () => {
    const parts = [chunk("I've got that on your calendar. "), toolCall('createCalendarEvent')];
    const text = await textOf(
      await check(streamOf(...parts), [ASK], toolsWith('createCalendarEvent'))
    );
    expect(text).toContain("I've got that on your calendar.");
    expect(text).not.toContain("isn't booked yet");
  });

  it('a create that saved only to Ferni\'s own list (not connected) is reported as not booked', async () => {
    const items = [
      ASK,
      result(
        'createCalendarEvent',
        JSON.stringify(
          "Nothing was added to a calendar, because none is connected. I saved it to Ferni's own list instead, not your calendar."
        )
      ),
    ];
    const parts = ["I've got that on your calendar for tomorrow at noon. "];
    const text = await textOf(
      await check(streamOf(...parts), items, toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).toContain("That didn't go through, so it isn't booked.");
  });
});
