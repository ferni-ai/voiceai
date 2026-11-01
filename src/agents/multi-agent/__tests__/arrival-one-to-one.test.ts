/**
 * HANDOFF_ARRIVAL_ONE_TO_ONE (#2503): an arriving teammate talks to one caller, not a room.
 * Synthetic group-address arrival lines of the shape the issue describes (a greeting plus
 * "everyone", and "listening in"), through the real prepareBriefing with the flag off (as
 * today) and on; only the models are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const log: Record<string, unknown> = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
  log.child = () => log;
  return { createLogger: () => log, getLogger: () => log };
});

import { prepareBriefing, type BriefInput } from '../handoff-brief.js';
import { clearArrivals } from '../arrival-reason.js';
import { ARRIVAL_ONE_TO_ONE, oneToOneLine } from '../handoff-arrival.js';

const NOW = new Date('2026-10-22T03:24:00Z'); // 11:24 p.m. in New York
const OFF = {};
const ON = { HANDOFF_ARRIVAL_ONE_TO_ONE: 'on' };

const askedByName: BriefInput = {
  fromName: 'Ferni',
  toName: 'Alex',
  toPersonaId: 'alex-chen',
  turns: [
    { speaker: 'caller', text: 'Long day. Anyway.' },
    { speaker: 'persona', text: 'Sounds like it. Want to unload a bit?' },
    { speaker: 'caller', text: 'Can I talk to Alex?' },
  ],
  remembered: [],
  timeZone: 'America/New_York',
  userName: 'Sam',
  callId: 'call-2503',
};

/** The first line and the director's cue, with `said` as the director's line */
async function arrive(said: string, env: Record<string, string>) {
  const actor = vi.fn(async (..._args: unknown[]) => said);
  const out = await prepareBriefing(askedByName, 'Hey Sam, good to be here.', {
    writer: async () => undefined,
    actor,
    env,
    now: NOW,
  });
  return { line: out.firstLine, cue: String(actor.mock.calls[0]?.[1] ?? '') };
}

afterEach(() => clearArrivals());

describe('the arrival on a one-to-one call', () => {
  const GROUP_LINE = "Hi everyone, good evening. I'm right here, listening in.";

  it('off: the group line is said as written, and the cue is unchanged', async () => {
    const off = await arrive(GROUP_LINE, OFF);
    expect(off.line).toBe(GROUP_LINE);
    expect(off.cue).toContain("you're here and listening");
    expect(off.cue).not.toContain(ARRIVAL_ONE_TO_ONE.trim());
  });

  it('on: the cue says one person, drops "here and listening", and the line is cut', async () => {
    const on = await arrive(GROUP_LINE, ON);
    expect(on.cue).toContain('This is a one-to-one call with one person');
    expect(on.cue).not.toContain("you're here and listening");
    expect(on.line).toBe("Hi, good evening. I'm right here, listening.");
  });

  it('on: a second group line loses "everyone" and keeps the rest', async () => {
    const on = await arrive("Hello everyone, good evening. I'm ready whenever you are.", ON);
    expect(on.line).toBe("Hello, good evening. I'm ready whenever you are.");
  });
});

describe('oneToOneLine', () => {
  it.each([
    ['Hey everyone.', 'Hey.'],
    ['Evening all, rough day?', 'Evening, rough day?'],
    ['Good evening, everyone.', 'Good evening.'],
    ['Hi guys! Sam, what is up?', 'Hi! Sam, what is up?'],
    ["Hey Sam, I'm joining the call now.", "Hey Sam, I'm here now."],
    ['I was listening in, sorry.', 'I was listening, sorry.'],
  ])('%s -> %s', (line, expected) => {
    expect(oneToOneLine(line)).toBe(expected);
  });

  it.each([
    'Hey, all good?',
    'Hey Sam, everyone has days like that.',
    'Morning, Sam. All of it sounds heavy.',
  ])('keeps "%s" (the group word is not an address there)', (line) => {
    expect(oneToOneLine(line)).toBe(line);
  });
});
