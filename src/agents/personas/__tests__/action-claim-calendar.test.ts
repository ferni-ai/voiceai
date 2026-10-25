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
  withActionClaimCheck(Promise.resolve(stream), { items }, tools, undefined, {
    ACTION_CLAIM_STREAM: 'on',
  });

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
    // Nothing came before the claim, so its line opens the reply with no "though" (sweep 2026-10-21).
    expect(text).toBe("It isn't booked yet. Should I go ahead and book it? Anything else?");
  });

  it('a calendar read before the claim is not a create: the claim is still held (#1547 sequence)', async () => {
    const items = [
      ASK,
      result(
        'getCalendarToday',
        JSON.stringify(
          "No calendar is connected yet, so I can't see your calendar. Want me to help you connect one?"
        )
      ),
    ];
    const parts = ["I've got that on your calendar for tomorrow at noon. ", 'Anything else?'];
    const text = await textOf(
      await check(streamOf(...parts), items, toolsWith('getCalendarToday', 'createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).toContain("It isn't booked yet. Should I go ahead and book it?");
  });

  it('a not-connected read under any calendar tool name is a refusal, not a booking', async () => {
    const reply = JSON.stringify(
      "No calendar is connected yet, so I can't see your calendar. Want me to help you connect one?"
    );
    for (const name of ['calendar_list_events', 'quickCalendar']) {
      const items = [ASK, result(name, reply)];
      const parts = ["I've got that on your calendar for tomorrow at noon. "];
      const text = await textOf(
        await check(streamOf(...parts), items, toolsWith(name, 'createCalendarEvent'))
      );
      expect(text).not.toMatch(/on your calendar/);
      expect(text).toContain("That didn't go through, so it isn't booked.");
    }
  });

  it('a create called later in the same reply: the claim is replaced, in order', async () => {
    const parts = [
      chunk('Sure. '),
      chunk("I've got that on your calendar. "),
      chunk('Enjoy. '),
      toolCall('createCalendarEvent'),
    ];
    const text = await textOf(
      await check(streamOf(...parts), [ASK], toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).toContain("It's saved to Ferni's own list, not your calendar.");
    expect(text.indexOf('Sure.')).toBeLessThan(text.indexOf("It's saved"));
    expect(text.indexOf("It's saved")).toBeLessThan(text.indexOf('Enjoy.'));
  });

  it("a create that saved only to Ferni's own list (not connected) is reported as not booked", async () => {
    const items = [
      ASK,
      result(
        'createCalendarEvent',
        JSON.stringify(
          'Saved "Lunch with Sam, 2026-10-18, 12:00" to Ferni\'s own list. It isn\'t on your calendar, since none is connected.'
        )
      ),
    ];
    const parts = ["I've got that on your calendar for tomorrow at noon. "];
    const text = await textOf(
      await check(streamOf(...parts), items, toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).toContain("It's saved to Ferni's own list, not your calendar.");
    expect(text).not.toContain("That didn't go through");
  });

  it('a booking tool that is not a calendar create releases its claim, not the calendar line', async () => {
    const parts = [
      chunk("I've booked the table at Nobu for you. "),
      toolCall('bookRestaurant'),
      chunk('Enjoy. '),
    ];
    const text = await textOf(
      await check(streamOf(...parts), [ASK], toolsWith('bookRestaurant', 'createCalendarEvent'))
    );
    expect(text).toContain("I've booked the table at Nobu for you.");
    expect(text).not.toContain("Ferni's own list");
  });

  it('a connected read reply that mentions the calendar passes through unchanged', async () => {
    const parts = ["I've got three things on your calendar tomorrow. ", 'Standup is at nine.'];
    const text = await textOf(
      await check(streamOf(...parts), [ASK], toolsWith('getCalendarWeek', 'createCalendarEvent'))
    );
    expect(text).toBe("I've got three things on your calendar tomorrow. Standup is at nine.");
  });

  // Known trade-off (#1547 review): a read-style "I've got it on your calendar" after a read is
  // held as a booking claim, because the guard cannot tell a read answer from a booking. The
  // caller hears the honest line instead of the claim.
  it('known trade-off: a read-style "got it on your calendar" after a read is held as a booking claim', async () => {
    const items = [
      ASK,
      result(
        'getCalendarToday',
        JSON.stringify(
          "No calendar is connected yet, so I can't see your calendar. Want me to help you connect one?"
        )
      ),
    ];
    const text = await textOf(
      await check(
        streamOf("Yep, I've got it on your calendar at three. "),
        items,
        toolsWith('getCalendarToday', 'createCalendarEvent')
      )
    );
    expect(text).toContain("It isn't booked yet. Should I go ahead and book it?");
  });
});
