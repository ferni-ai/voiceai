import { describe, expect, it } from 'vitest';
import {
  blocksGenericCheckIns,
  composeMessage,
  dueNow,
  groundingQuote,
  inFerniVoice,
  isGroundedCheckInsOn,
  planCheckIns,
  type CheckInItem,
  type PlanContext,
  type SourceCall,
} from '../grounded-checkin.js';

const TZ = 'America/New_York';
// Monday 11:00 in New York.
const NOW = new Date('2026-10-12T15:00:00Z');
// Sunday 16:15 in New York.
const LAST_CALL = Date.parse('2026-10-11T20:15:00Z');

const call: SourceCall = {
  date: '2026-10-11',
  endedAt: LAST_CALL,
  userLines: [
    "I'm playing the bluegrass demo at the open mic on Wednesday",
    'I went back to martial arts this week and my shoulders hate me',
    'my mail pile is still sitting there',
  ],
};

function ctx(over: Partial<PlanContext> = {}): PlanContext {
  return {
    now: NOW,
    timezone: TZ,
    name: 'Seth',
    lastTalkedAt: LAST_CALL,
    calls: new Map([['c1', call]]),
    sent: [],
    ...over,
  };
}
const item = (id: string, text: string, when?: string): CheckInItem => ({
  id,
  text,
  basis: 'c1',
  ...(when && { when }),
});

describe('the flag', () => {
  it('is on by default, so generic check-ins stay blocked with no env set', () => {
    expect(isGroundedCheckInsOn({})).toBe(true);
    expect(blocksGenericCheckIns({})).toBe(true);
    expect(isGroundedCheckInsOn({ OUTREACH_GROUNDED_CHECKINS: 'on' })).toBe(true);
    expect(isGroundedCheckInsOn({ OUTREACH_GROUNDED_CHECKINS: 'garbled' })).toBe(true);
  });

  it('only an explicit off brings back the generic check-ins', () => {
    expect(isGroundedCheckInsOn({ OUTREACH_GROUNDED_CHECKINS: 'off' })).toBe(false);
    expect(blocksGenericCheckIns({ OUTREACH_GROUNDED_CHECKINS: 'off' })).toBe(false);
    expect(blocksGenericCheckIns({ OUTREACH_GROUNDED_CHECKINS: 'false' })).toBe(false);
  });
});

describe('grounding', () => {
  it("quotes the caller's own line that shares the item's key words", () => {
    expect(groundingQuote('How did the bluegrass demo go?', call.userLines)).toBe(
      "I'm playing the bluegrass demo at the open mic on Wednesday"
    );
    expect(groundingQuote("How's the martial arts going?", call.userLines)).toContain(
      'martial arts'
    );
  });

  it('finds nothing for a thing the caller never said', () => {
    expect(groundingQuote('How did the Stripe interview go?', call.userLines)).toBeUndefined();
    // One shared word is not enough when the item names two.
    expect(groundingQuote('How did the bluegrass festival go?', call.userLines)).toBeUndefined();
    expect(groundingQuote('How are you?', call.userLines)).toBeUndefined();
  });

  it("never quotes the caller talking about Ferni's life as their own", () => {
    // The 2026-10-11 dry run grounded "How is your martial arts training going?" on this line.
    const aboutFerni = [
      'Oh, I meant your martial arts training.',
      'Do you still do martial arts training?',
    ];
    expect(groundingQuote('How is your martial arts training going?', aboutFerni)).toBeUndefined();
    expect(
      groundingQuote('How is the martial arts going?', ['martial arts tonight, finally'])
    ).toBeUndefined();
  });
});

describe("Ferni's voice", () => {
  it('turns the question into a short note to them', () => {
    expect(composeMessage('How did the bluegrass demo go?', 'Seth')).toBe(
      'Hey Seth, how did the bluegrass demo go?'
    );
    expect(composeMessage('Stripe still on for Friday?')).toBe('Hey, Stripe still on for Friday?');
  });

  it('refuses the stock phrases, two questions, and long notes', () => {
    expect(inFerniVoice('Just checking in, how did the demo go?')).toBe(false);
    expect(inFerniVoice('Thinking of you. How are things going?')).toBe(false);
    expect(inFerniVoice('How did the demo go? Did they like it?')).toBe(false);
    expect(inFerniVoice('The demo went well.')).toBe(false);
    expect(inFerniVoice(`How did ${'the very long '.repeat(10)}demo go?`)).toBe(false);
    expect(composeMessage('Did the demo go well? Was it fun?', 'Seth')).toBeUndefined();
  });
});

describe('planning the week', () => {
  it('sends a dated item the evening it is due, their time, with the quote', () => {
    const { planned, dropped } = planCheckIns(
      [item('a', 'How did the bluegrass demo go?', '2026-10-14')],
      ctx()
    );
    expect(dropped).toEqual([]);
    expect(planned).toEqual([
      {
        id: 'a',
        message: 'Hey Seth, how did the bluegrass demo go?',
        // 17:00 in New York.
        sendAt: new Date('2026-10-14T21:00:00Z'),
        quote: "I'm playing the bluegrass demo at the open mic on Wednesday",
        callDate: '2026-10-11',
        when: '2026-10-14',
      },
    ]);
  });

  it('holds an undated item for a few days without a call, then asks', () => {
    const { planned } = planCheckIns([item('m', "How's the martial arts going?")], ctx());
    expect(planned.map((p) => p.sendAt)).toEqual([new Date('2026-10-14T21:00:00Z')]);
  });

  it('no quote, no message', () => {
    const { planned, dropped } = planCheckIns(
      [item('s', 'How did the Stripe interview go?', '2026-10-13')],
      ctx()
    );
    expect(planned).toEqual([]);
    expect(dropped).toEqual([
      { id: 's', text: 'How did the Stripe interview go?', why: 'no quote from the caller' },
    ]);
    const missing = planCheckIns(
      [{ ...item('x', 'How did the bluegrass demo go?'), basis: 'zz' }],
      ctx()
    );
    expect(missing.dropped[0]?.why).toBe('no quote from the caller');
  });

  it('caps it at two a week and one a day', () => {
    const items = [
      item('d1', 'How did the bluegrass demo go?', '2026-10-13'),
      item('d2', 'How are your shoulders after martial arts?', '2026-10-13'),
      item('d3', 'Did the bluegrass demo crowd show up?', '2026-10-15'),
      item('d4', "How's the mail pile looking?", '2026-10-16'),
    ];
    const { planned, dropped } = planCheckIns(items, ctx());
    expect(planned.map((p) => p.id)).toEqual(['d1', 'd3']);
    expect(dropped.map((d) => [d.id, d.why])).toEqual([
      ['d2', 'one a day'],
      ['d4', 'weekly cap'],
    ]);
    // Sends from earlier in the week count too.
    const sent = [new Date('2026-10-11T14:00:00Z'), new Date('2026-10-12T13:00:00Z')];
    const after = planCheckIns(items.slice(2), ctx({ sent }));
    expect(after.planned).toEqual([]);
  });

  it('never right after a call, and never about a thing they have talked about since', () => {
    // They called at 11:00 the day of the demo: the 17:00 note would land six hours later.
    const justTalked = planCheckIns(
      [item('a', 'How did the bluegrass demo go?', '2026-10-14')],
      ctx({
        now: new Date('2026-10-14T16:00:00Z'),
        lastTalkedAt: Date.parse('2026-10-14T15:00:00Z'),
      })
    );
    expect(justTalked.dropped[0]?.why).toBe('talked in the last 12 hours');
    // Due Sunday 17:00; they called again at 19:00 that evening.
    const since = planCheckIns(
      [item('a', 'How did the bluegrass demo go?', '2026-10-11')],
      ctx({
        calls: new Map([['c1', { ...call, date: '2026-10-10' }]]),
        lastTalkedAt: Date.parse('2026-10-11T23:00:00Z'),
      })
    );
    expect(since.dropped[0]?.why).toBe('talked since, so it is for the call');
  });

  it('drops what is stale, misdated or past the week', () => {
    const quiet = ctx({ lastTalkedAt: Date.parse('2026-10-08T20:00:00Z') });
    const old = { ...call, date: '2026-10-08', endedAt: Date.parse('2026-10-08T20:00:00Z') };
    const why = (when: string, c = ctx()) =>
      planCheckIns([item('a', 'How did the bluegrass demo go?', when)], c).dropped[0]?.why;
    expect(why('2026-10-10', { ...quiet, calls: new Map([['c1', old]]) })).toBe(
      'the moment passed'
    );
    expect(why('2026-10-01')).toBe('dated before the call it came from');
    expect(why('2026-10-25')).toBe('not this week');
  });

  it('is due from its time until a day later', () => {
    const { planned } = planCheckIns(
      [item('a', 'How did the bluegrass demo go?', '2026-10-14')],
      ctx()
    );
    expect(dueNow(planned, new Date('2026-10-14T20:59:00Z'))).toEqual([]);
    expect(dueNow(planned, new Date('2026-10-14T21:05:00Z'))).toHaveLength(1);
    expect(dueNow(planned, new Date('2026-10-15T21:01:00Z'))).toEqual([]);
  });
});
