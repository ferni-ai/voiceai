/**
 * SCHEDULE_CALL_WHO: scheduleCall only rings the caller's own verified phone.
 *
 * The turn shape: the caller says "Can you schedule a call to my mom Priya at
 * six to wish her happy birthday?", and the model calls scheduleCall with the
 * birthday words and "in 2 hours". Main rings the caller then and plays those
 * words to them. With the flag on, the model also says whom the call is for,
 * and a call for anyone but the caller schedules nothing and writes nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '+18015550100';

const sent = vi.hoisted(() => ({
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
  promise: vi.fn(async (..._a: unknown[]) => undefined),
  dial: vi.fn(),
}));

vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: sent.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: sent.promise,
  recordReminderPromise: sent.promise,
}));
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => ({ contactInfo: {} }) }),
}));

import type { ToolContext } from '../../../registry/types.js';
import { setCallUserPort } from '../../proactive/outreach/call-user-port.js';
import { definitions } from '../index.js';
import { TOOL_REFUSAL } from '../../../../agents/personas/action-claims.js';
import { otherPerson, scheduleCallDescription } from '../schedule-call-who.js';

const ctx: ToolContext = {
  userId: 'uid-schedule-who',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
};
const call = { ctx: { userData: { userId: ctx.userId, userName: 'Riley Testing' } } };
const BIRTHDAY = { message: 'Happy birthday, Mom! Love you.', when: 'in 2 hours' };

const DEF = definitions.find((d) => d.id === 'scheduleCall');
if (!DEF) throw new Error('scheduleCall is not in the scheduling domain');
const tool = () => DEF.create(ctx);
const run = async (args: Record<string, unknown>): Promise<string> =>
  String(await tool().execute(args, call));
const shape = (): Record<string, unknown> =>
  (tool() as unknown as { parameters: { shape: Record<string, unknown> } }).parameters.shape;
const describedAs = (): string => (tool() as unknown as { description: string }).description;
/** main's scheduleCall description (scheduling/index.ts before SCHEDULE_CALL_WHO). */
const MAIN_DESCRIPTION = `Schedule a phone call for later.
Use when the user says things like:
- "Call me at 2pm to remind me about the meeting"
- "Give me a wake-up call tomorrow at 7am"
- "Call me tonight if I haven't worked out by 8pm"

The call will play a voice message when answered.`;
const writes = (): number =>
  sent.reminder.mock.calls.length + sent.promise.mock.calls.length + sent.dial.mock.calls.length;

/** What main does for this turn (no `who`): the reply and every write, recorded. */
async function asMain(): Promise<{ reply: string; reminders: unknown[]; promises: unknown[] }> {
  const reply = await run(BIRTHDAY);
  const out = {
    reply,
    reminders: [...sent.reminder.mock.calls],
    promises: [...sent.promise.mock.calls],
  };
  vi.clearAllMocks();
  return out;
}
async function sameAsMain(who: string | undefined): Promise<void> {
  const main = await asMain();
  const reply = await run({ ...BIRTHDAY, ...(who === undefined ? {} : { who }) });
  expect(reply).toBe(main.reply);
  expect(reply).toContain("I'll call you on");
  expect(sent.reminder.mock.calls).toEqual(main.reminders);
  expect(sent.promise.mock.calls).toEqual(main.promises);
  expect(
    sent.reminder.mock.calls.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress)
  ).toEqual([OWNER]);
}

const SOMEONE_ELSE = ['my mom Priya', 'Alex', 'Riley from work', "Riley's boss", 'Riley Tester'];
const SELF = [
  undefined,
  '',
  'me',
  'Me',
  'myself',
  'I',
  'my phone',
  'my cell',
  'Riley',
  'Riley Testing',
  'riley testing.',
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-06T15:00:00Z') });
  setCallUserPort({
    verifiedPhone: async () => OWNER,
    verifiedEmail: async () => undefined,
    textOwner: vi.fn(async () => ({ sent: true })),
    call: sent.dial,
  } as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setCallUserPort(undefined);
  vi.clearAllMocks();
});

describe('SCHEDULE_CALL_WHO on: a scheduled call for someone else is never rung to the caller', () => {
  beforeEach(() => vi.stubEnv('SCHEDULE_CALL_WHO', 'on'));

  it.each(SOMEONE_ELSE)('who %j: nothing is scheduled and nothing is written', async (who) => {
    const reply = await run({ ...BIRTHDAY, who });
    expect(writes()).toBe(0);
    expect(reply).toBe(
      `Nothing was scheduled: this tool only rings the caller's own phone, so it can't call ${who}. ` +
        'Tell the caller that plainly and kindly, in your own words.'
    );
    expect(reply).toMatch(TOOL_REFUSAL); // the action-claim guard reads it as nothing done
    expect(reply).not.toMatch(/I can call|remind you|right now/i); // no offer, for anyone
  });

  it.each(SELF)('who %j (the caller): scheduled exactly as main does', sameAsMain);

  it('the model is told to say whom the call is for', () => {
    expect(Object.keys(shape())).toEqual(['message', 'when', 'who']);
  });

  it('the description says it rings only the caller', () => {
    expect(describedAs()).toBe(scheduleCallDescription());
    expect(describedAs().startsWith(MAIN_DESCRIPTION)).toBe(true);
    expect(describedAs()).toContain("It only ever rings the caller's own phone");
  });
});

describe('SCHEDULE_CALL_WHO off: the tool as main has it', () => {
  it('no `who` parameter', () => {
    expect(Object.keys(shape())).toEqual(['message', 'when']);
  });

  it("the description is main's, word for word", () => {
    expect(describedAs()).toBe(MAIN_DESCRIPTION);
  });

  it.each([...SOMEONE_ELSE, ...SELF])(
    'who %j sent anyway: ignored, the caller is rung exactly as main does',
    sameAsMain
  );
});

describe('otherPerson', () => {
  it('names someone else; the caller, their whole own name or nothing is undefined', () => {
    expect(otherPerson('my sister')).toBe('my sister');
    expect(otherPerson('  Priya!  ')).toBe('Priya');
    expect(otherPerson('the caller')).toBeUndefined();
    expect(otherPerson('')).toBeUndefined();
    expect(otherPerson(42)).toBeUndefined();
    expect(otherPerson('Riley', ['riley testing'])).toBeUndefined();
    expect(otherPerson('Riley Testing', ['riley testing'])).toBeUndefined();
    expect(otherPerson('Riley from work', ['riley testing'])).toBe('Riley from work');
    expect(otherPerson('Riley', [])).toBe('Riley');
  });
});
