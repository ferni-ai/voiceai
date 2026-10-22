/**
 * The #1547 sequence with nothing connected, through the real calendar tools
 * and the real claim guard. Only the connection check and the store are stubbed.
 *
 * Synthetic: the caller asks what is on their calendar, then asks for lunch
 * tomorrow. Ferni must not say the lunch is on their calendar.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';
import { smartCalendarTools } from '../../../tools/domains/calendar/calendar-connection-gate.js';
import { withActionClaimCheck } from '../action-claim-guard.js';

initializeLogger({ pretty: false, level: 'warn' });

vi.mock('../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(async () => false),
}));
vi.mock('../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDayOverview: vi.fn(async () => ({ events: [], totalMeetings: 0 })),
  createEvent: vi.fn(async () => ({ id: 'e1' })),
}));

const toolFor = (id: string) => {
  const def = smartCalendarTools.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  return def.create({ userId: 'user-1', userTimeZone: 'UTC' } as never) as {
    execute: (params: unknown, options: unknown) => Promise<unknown>;
  };
};

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
let n = 0;
const output = (name: string, text: string) =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output: text, isError: false });
const toolsWith = (...names: string[]) => ({
  functionTools: Object.fromEntries(names.map((name) => [name, {}])),
});
const callChunk = (name: string): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: 'x', name, args: '{}' })],
  },
});
const textChunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});

async function replyText(
  parts: Array<string | llm.ChatChunk>,
  items: unknown[],
  tools: { functionTools: Record<string, unknown> }
): Promise<string> {
  const stream = new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === 'string' ? textChunk(p) : p);
      c.close();
    },
  });
  const guarded = await withActionClaimCheck(Promise.resolve(stream), { items }, tools, undefined, {
    ACTION_CLAIM_STREAM: 'on',
  });
  let out = '';
  for await (const c of guarded as unknown as AsyncIterable<llm.ChatChunk>)
    out += c.delta?.content ?? '';
  return out;
}

describe('#1547 sequence with nothing connected (real tools, real guard)', () => {
  it('the read says no calendar is connected, and the lunch claim is held', async () => {
    const read = await toolFor('getCalendarToday').execute({}, {});
    expect(String(read)).toMatch(/No calendar is connected/);
    expect(String(read)).not.toMatch(/clear/i);

    const items = [user("What's on my calendar today?"), output('getCalendarToday', String(read))];
    const text = await replyText(
      ["I've got that on your calendar for tomorrow at noon. ", 'Anything else?'],
      [...items, user('Add lunch with Sam tomorrow at noon.')],
      toolsWith('getCalendarToday', 'createCalendarEvent')
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).toContain("It isn't booked yet. Should I go ahead and book it?");
  });

  it("a create run in the same reply: the claim becomes the honest line, and the create says it is Ferni's list", async () => {
    const created = await toolFor('createCalendarEvent').execute(
      { title: 'Lunch with Sam', date: '2026-10-18', startTime: '12:00' },
      {}
    );
    expect(String(created)).toMatch(
      /Saved "Lunch with Sam, 2026-10-18, 12:00" to Ferni's own list/
    );
    expect(String(created)).toMatch(/isn't on your calendar/);

    const text = await replyText(
      ["I've got that on your calendar. ", callChunk('createCalendarEvent'), 'Enjoy.'],
      [user('Add lunch with Sam tomorrow at noon.')],
      toolsWith('createCalendarEvent')
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).toContain("It's saved to Ferni's own list, not your calendar.");
  });
});
