/**
 * ARRIVAL_LINE_GROUNDED's reason (arrival-reason.ts): a teammate's first line names why the
 * caller came, never re-asks it, and never repeats an earlier arrival line on the call. Each
 * case runs the real prepareBriefing with the flag off (prod and dev today) and on; only the
 * models are stubbed. Shapes from the sweeps of 2026-10-21 (bh-01 dev; bh-17, bh-05,
 * handoff-every-teammate prod).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const log: Record<string, unknown> = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
  log.child = () => log;
  return { createLogger: () => log, getLogger: () => log };
});

import { NO_TOPIC, prepareBriefing, type BriefInput, type BriefTurn } from '../handoff-brief.js';
import {
  clearArrivals,
  reasonInTheirWords,
  repeatsEarlier,
  withoutReask,
} from '../arrival-reason.js';

const ON = { ARRIVAL_LINE_GROUNDED: 'on' };
const OFF = { ARRIVAL_LINE_GROUNDED: 'off' };
const NOW = new Date('2026-10-21T13:02:00Z'); // 9 a.m. in New York
const caller = (text: string): BriefTurn => ({ speaker: 'caller', text });
const persona = (text: string): BriefTurn => ({ speaker: 'persona', text });

const brief = (turns: BriefTurn[], over: Partial<BriefInput> = {}): BriefInput => ({
  fromName: 'Ferni',
  toName: 'Nayan',
  toPersonaId: 'nayan-patel',
  turns,
  remembered: [],
  timeZone: 'America/New_York',
  userName: 'Sam',
  callId: 'call-1',
  ...over,
});

/** The first line and the director's cue, with `said` as the director's line. */
async function arrive(input: BriefInput, said: string, env: Record<string, string>) {
  const actor = vi.fn(async (..._args: unknown[]) => said);
  const out = await prepareBriefing(input, 'Hello. Good to sit with you.', {
    writer: async () => undefined,
    actor,
    env,
    now: NOW,
  });
  return { line: out.firstLine, brief: out.brief, cue: String(actor.mock.calls[0]?.[1] ?? '') };
}

afterEach(() => clearArrivals());

// bh-17: the caller said what it's about, then asked for Nayan in a line of its own
const LAWYER = [
  caller(
    "Hey Ferni, I've been a lawyer for 10 years, and lately, I feel like none of it means anything."
  ),
  persona("Ten years is a long time to carry water for something that's starting to feel empty."),
  caller("I don't want to quit on a whim. I just want to think it through."),
  caller('Can I talk to Nayan?'),
];

describe('the reason reaches the arrival line (bh-17)', () => {
  it('off: the director is told they only asked by name, and given the hour', async () => {
    const off = await arrive(brief(LAWYER), "Good morning, Sam. I'm here, and I'm listening.", OFF);
    expect(off.cue).toContain(NO_TOPIC);
    expect(off.cue).toContain('their time');
    expect(off.line).toBe("Good morning, Sam. I'm here, and I'm listening.");
  });

  it('on: the cue carries their words and asks to name them, not the hour', async () => {
    const on = await arrive(brief(LAWYER), "Good morning, Sam. I'm here, and I'm listening.", ON);
    expect(on.cue).not.toContain(NO_TOPIC);
    expect(on.cue).toContain('quit on a whim');
    expect(on.cue).toContain('lawyer for 10 years');
    expect(on.cue).toContain('names it');
    expect(on.cue).not.toContain('their time');
    expect(on.brief).toContain('Why they came to you: In their words: "I don\'t want to quit');
  });

  it('on: a hello that names nothing becomes their reason in their own words', async () => {
    const on = await arrive(brief(LAWYER), "Good morning, Sam. I'm here, and I'm listening.", ON);
    expect(on.line).toBe(
      "Ferni said you've been a lawyer for 10 years, and lately, you feel like none of it means anything."
    );
  });

  it("on: the director's own line is kept when it names the reason", async () => {
    const said =
      "A lawyer for 10 years, and lately none of it means anything. I'm glad you called.";
    expect((await arrive(brief(LAWYER), said, ON)).line).toBe(said);
  });

  it('on: a late or dropped director line still names the reason, not a canned hello', async () => {
    const out = await prepareBriefing(brief(LAWYER), 'Hello. Good to sit with you.', {
      writer: async () => undefined,
      actor: () => new Promise<string | undefined>(() => {}), // never answers
      budgetMs: 20,
      env: ON,
      now: NOW,
    });
    expect(out.firstLine).toMatch(/^Ferni said you've been a lawyer/);
    const off = await prepareBriefing(brief(LAWYER), 'Hello. Good to sit with you.', {
      writer: async () => undefined,
      actor: () => new Promise<string | undefined>(() => {}),
      budgetMs: 20,
      env: OFF,
      now: NOW,
    });
    expect(off.firstLine).toBeUndefined(); // the canned hello plays
  });
});

// bh-05: the caller said it twice; Maya asked again
const SNOOZE = [
  caller(
    "Hey Ferni, I've hit snooze like 5 times every morning this week, and I've been late to work every day."
  ),
  caller('I start at 8 and I keep rolling in at 8:20. Can I talk to Maya?'),
];
const MAYA = { toName: 'Maya', toPersonaId: 'maya-santos', callId: 'call-2' };

describe('never re-asks what they already said (bh-05)', () => {
  it("off: Maya's re-ask is said as written", async () => {
    const said = "Hey Sam, I'm here. Mornings can be so tough, what's going on?";
    expect((await arrive(brief(SNOOZE, MAYA), said, OFF)).line).toBe(said);
  });

  it('on: the re-ask goes, and a line left naming nothing is their reason', async () => {
    const said = "Hey Sam, I'm here. Mornings can be so tough, what's going on?";
    expect((await arrive(brief(SNOOZE, MAYA), said, ON)).line).toBe(
      "Ferni said you've hit snooze like 5 times every morning this week, and you've been late to work every day."
    );
  });

  it('on: the re-ask goes, and a line that names the reason is kept', async () => {
    const said = "Snooze 5 times every morning and late to work every day. What's going on?";
    expect((await arrive(brief(SNOOZE, MAYA), said, ON)).line).toBe(
      'Snooze 5 times every morning and late to work every day.'
    );
  });
});

describe('never repeats an earlier arrival line on the call (handoff-every-teammate)', () => {
  const NAYAN_TURNS = [
    caller("Hi Alex, thanks. Can I talk to Jordan now? I'm planning a birthday."),
    caller('Hey Jordan. Okay, last one. Can I talk to Naya?'),
  ];
  const NAYAN_LINE = 'Hi Sam, Nayan here. The birthday, I hear.';
  const FERNI_LINE = "Hey Sam, I'm here. The birthday is all set."; // the same line again
  const BACK_TURNS = [
    ...NAYAN_TURNS,
    persona(NAYAN_LINE),
    caller('Hi Nayan, the birthday is all set. Can you take me back to Ferni?'),
  ];
  const BACK = { fromName: 'Nayan', toName: 'Ferni', toPersonaId: 'ferni', callId: 'call-3' };

  async function returnToFerni(env: Record<string, string>, callId = 'call-3') {
    const nayan = await arrive(brief(NAYAN_TURNS, { callId: 'call-3' }), NAYAN_LINE, env);
    expect(nayan.line).toBe(NAYAN_LINE);
    return arrive(brief(BACK_TURNS, { ...BACK, callId }), FERNI_LINE, env);
  }

  it("off: Ferni says Nayan's arrival line over again", async () => {
    expect((await returnToFerni(OFF)).line).toBe(FERNI_LINE);
  });

  it('on: the cue lists the earlier opener and the repeat is not said', async () => {
    const back = await returnToFerni(ON);
    expect(back.cue).toContain(`Teammates already opened this call with "${NAYAN_LINE}"`);
    expect(back.line).toBeUndefined(); // the canned line plays, not the repeat
  });

  it('on: another call never sees this call’s arrival lines', async () => {
    expect((await returnToFerni(ON, 'call-4')).line).toBe(FERNI_LINE);
  });
});

describe('a line dropped as invented still names the reason (dev bh-01)', () => {
  // Dev 2026-10-21: the director named the reason, the claim filter dropped it over
  // "trying" and "actually" ("invented": true), and the canned hello played.
  const EQUITY = [
    caller("I got a job offer from a startup in Denver. It pays one forty, I'm at one fifteen."),
    caller("I can't tell if the equity is worth anything. Can I talk to Peter?"),
  ];
  const PETER = { toName: 'Peter', toPersonaId: 'peter-john', callId: 'call-6' };
  const said =
    "Hey Sam, good evening. Sounds like you're trying to figure out if that Denver startup equity is actually worth anything.";

  it('off: dropped, so the canned hello plays', async () => {
    expect((await arrive(brief(EQUITY, PETER), said, OFF)).line).toBeUndefined();
  });

  it('on: their reason in their own words instead', async () => {
    expect((await arrive(brief(EQUITY, PETER), said, ON)).line).toBe(
      "Ferni said you can't tell if the equity is worth anything."
    );
  });
});

describe('no reason in the brief: as before', () => {
  it('the same line on and off, with the hour, and no cue to name a reason', async () => {
    const turns = [caller('Hey Ferni, quick one. Can I talk to Nayan?')];
    const off = await arrive(brief(turns), "Hi Sam, it's Nayan. I'm here.", OFF);
    const on = await arrive(
      brief(turns, { callId: 'call-5' }),
      "Hi Sam, it's Nayan. I'm here.",
      ON
    );
    expect(on.line).toBe("Hi Sam, it's Nayan. I'm here.");
    expect(on.line).toBe(off.line);
    expect(on.cue).toContain('their time');
    expect(on.cue).not.toContain('names it');
  });
});

describe('the helpers', () => {
  it('hands back only statements about the caller, cut to length', () => {
    expect(reasonInTheirWords(['Do you think I should quit my job at the firm?'], 'Ferni')).toBe(
      undefined
    ); // a question
    expect(
      reasonInTheirWords(['You always make the commute sound worse than it is.'], 'Ferni')
    ).toBe(undefined); // about Ferni
    expect(
      reasonInTheirWords(
        [
          'I am trying to decide whether to move back home to Ohio to be near my sister, because my mom is getting older and the rent here keeps climbing every year.',
        ],
        'Ferni'
      )
    ).toBe(
      'Ferni said you are trying to decide whether to move back home to Ohio to be near your sister.'
    );
  });

  it('hands back a reason given with the ask, about the teammate who hears it (handoff-maya)', () => {
    expect(
      reasonInTheirWords(
        ["Hey Ferni. I'd like to talk to Maya about building a morning routine."],
        'Ferni'
      )
    ).toBe('Ferni said you wanted to talk about building a morning routine.');
    expect(reasonInTheirWords(['Hi Nayan, that is all I needed.'], 'Nayan')).toBeUndefined();
  });

  it('cuts only re-asks and knows a repeat from a new line', () => {
    expect(withoutReask("Hi. What's up?")).toBe('Hi.');
    expect(withoutReask("Hi. That's a lot to carry.")).toBe("Hi. That's a lot to carry.");
    expect(
      repeatsEarlier('Early start for a birthday, huh?', ['You are up early for a birthday.'])
    ).toBe(true);
    expect(repeatsEarlier('Ten years is a long time.', ['You are up early for a birthday.'])).toBe(
      false
    );
  });
});
