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
    expect(text).toBe("It isn't booked yet, though. Should I go ahead and book it? Anything else?");
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
    expect(text).toContain("It isn't booked yet, though.");
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

  it('a connected create saved only to the Ferni calendar (flag off) is reported as elsewhere', async () => {
    const items = [
      ASK,
      result(
        'createCalendarEvent',
        JSON.stringify(
          'Saved to the Ferni calendar only, not Google Calendar: "Lunch with Sam", Saturday, Oct 18, 12:00 PM your time, 60 minutes.'
        )
      ),
    ];
    const parts = ["I've got that on your calendar for tomorrow at noon. "];
    const text = await textOf(
      await check(streamOf(...parts), items, toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar for/);
    expect(text).toContain("It's saved to Ferni's own list, not your calendar.");
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
    expect(text).toContain("It isn't booked yet, though.");
  });
});

describe('calendar claims with CALENDAR_PROVIDER_WRITE (#1749)', () => {
  const ENV = { ACTION_CLAIM_STREAM: 'on', CALENDAR_PROVIDER_WRITE: 'on' };
  const checkOn = (
    stream: ReadableStream<llm.ChatChunk>,
    items: unknown[],
    tools: { functionTools: Record<string, unknown> }
  ) => withActionClaimCheck(Promise.resolve(stream), { items }, tools, undefined, ENV);

  it("a create later in the reply: the claim is dropped, not called Ferni's own list", async () => {
    const parts = [
      chunk('Sure. '),
      chunk("I've got that on your calendar. "),
      chunk('Enjoy. '),
      toolCall('createCalendarEvent'),
    ];
    const text = await textOf(
      await checkOn(streamOf(...parts), [ASK], toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar/);
    expect(text).not.toContain("Ferni's own list");
    expect(text).toContain('Sure.');
    expect(text).toContain('Enjoy.');
  });

  it('after a create that reached Google Calendar, the claim stands', async () => {
    const items = [
      ASK,
      result(
        'createCalendarEvent',
        JSON.stringify(
          'Added to your Google Calendar: "Lunch with Sam", Saturday, Oct 18, 12:00 PM your time, 60 minutes.'
        )
      ),
    ];
    const parts = ["I've got that on your calendar for tomorrow at noon. "];
    const text = await textOf(
      await checkOn(streamOf(...parts), items, toolsWith('createCalendarEvent'))
    );
    expect(text).toBe("I've got that on your calendar for tomorrow at noon. ");
  });

  it('after a Google write that failed, the claim is replaced by "didn\'t go through"', async () => {
    const items = [
      ASK,
      result(
        'createCalendarEvent',
        JSON.stringify(
          'I couldn\'t add "Lunch with Sam" to your Google Calendar, so it isn\'t on your calendar. Nothing was saved.'
        )
      ),
    ];
    const parts = ["I've got that on your calendar for tomorrow at noon. "];
    const text = await textOf(
      await checkOn(streamOf(...parts), items, toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar for/);
    expect(text).toContain("That didn't go through, so it isn't booked.");
  });

  it("a save to Ferni's list while Outlook is connected is reported as elsewhere", async () => {
    const items = [
      ASK,
      result(
        'createCalendarEvent',
        JSON.stringify(
          "Saved to Ferni's own list: \"Lunch with Sam\", Saturday, Oct 18, 12:00 PM your time, 60 minutes. It isn't on your calendar, since I can't add to Outlook yet."
        )
      ),
    ];
    const parts = ["I've got that on your calendar for tomorrow at noon. "];
    const text = await textOf(
      await checkOn(streamOf(...parts), items, toolsWith('createCalendarEvent'))
    );
    expect(text).not.toMatch(/on your calendar for/);
    expect(text).toContain("It's saved to Ferni's own list, not your calendar.");
  });
});
