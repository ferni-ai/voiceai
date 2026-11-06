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
const RILEY = 'Riley Testing';
const callFor = (userName: string) => ({ ctx: { userData: { userId: ctx.userId, userName } } });
const BIRTHDAY = { message: 'Happy birthday, Mom! Love you.', when: 'in 2 hours' };

const DEF = definitions.find((d) => d.id === 'scheduleCall');
if (!DEF) throw new Error('scheduleCall is not in the scheduling domain');
const tool = () => DEF.create(ctx);
const run = async (args: Record<string, unknown>, owner = RILEY): Promise<string> =>
  String(await tool().execute(args, callFor(owner)));
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
async function asMain(owner: string): Promise<{
  reply: string;
  reminders: unknown[];
  promises: unknown[];
  dials: unknown[];
}> {
  const reply = await run(BIRTHDAY, owner);
  const out = {
    reply,
    reminders: [...sent.reminder.mock.calls],
    promises: [...sent.promise.mock.calls],
    dials: [...sent.dial.mock.calls],
  };
  vi.clearAllMocks();
  return out;
}
async function sameAsMain(who: string | undefined, owner = RILEY): Promise<void> {
  const main = await asMain(owner);
  const reply = await run({ ...BIRTHDAY, ...(who === undefined ? {} : { who }) }, owner);
  expect(reply).toBe(main.reply);
  expect(reply).toContain("I'll call you on");
  expect(sent.reminder.mock.calls).toEqual(main.reminders);
  expect(sent.promise.mock.calls).toEqual(main.promises);
  expect(sent.dial.mock.calls).toEqual(main.dials);
  expect(
    sent.reminder.mock.calls.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress)
  ).toEqual([OWNER]);
}

const SOMEONE_ELSE = [
  'my mom Priya',
  'Alex',
  'Riley from work',
  "Riley's boss",
  'Riley Tester',
  'my own mom',
  'my own boss',
  "my mom's phone",
  "priya's phone", // a possessive needs no capital
  'Dr. Patel',
  'the dentist',
  'my kids', // a plural relationship word
  // a number that isn't the caller's verified one
  '555-0199',
  '+1 801 555 0123',
  'Priya at 555-0199',
];
/** Owners whose names words() reshapes: an apostrophe dropped, a hyphen split. */
const OBRIEN = "Riley O'Brien";
const MARY_JANE = 'Mary-Jane Testing';
const WATSON = 'Mary-Jane Watson';
const JEAN_LUC = 'Jean-Luc Testard';
const SAM_LEE = 'Sam Lee';
const OWN_NAMES: Array<[string, string]> = [
  [OBRIEN, "Riley O'Brien"],
  [OBRIEN, 'Riley'],
  [OBRIEN, "Riley O'Brien's phone"],
  [MARY_JANE, 'Mary-Jane'],
  [MARY_JANE, 'Mary-Jane Testing'],
  // a hyphenated name written joined
  [MARY_JANE, 'MaryJane'],
  [MARY_JANE, 'MaryJane Testing'],
  [WATSON, 'MaryJane Watson'],
  [JEAN_LUC, 'JeanLuc Testard'],
  ['Anne-Marie Testing', 'AnneMarie Testing'],
  // the first half of a hyphenated first name: people shorten their own names
  [WATSON, 'Mary'],
  [JEAN_LUC, 'Jean'],
  [SAM_LEE, 'SAM'],
  [SAM_LEE, "Sam's phone"],
];
const NOT_OWN_NAMES: Array<[string, string]> = [
  [OBRIEN, "O'Brien's sister"],
  [OBRIEN, "Riley's boss"],
  [OBRIEN, 'Riley from work'],
  [MARY_JANE, "Mary-Jane's mom"],
  [WATSON, 'Jane'],
  [WATSON, "Mary's sister"],
  [SAM_LEE, 'Lee'],
  [SAM_LEE, 'Sam L'],
  [SAM_LEE, 'Sam Leeds'],
  [SAM_LEE, 'Samantha'],
  [SAM_LEE, "Sam Lee's mom"],
  [SAM_LEE, 'Sam from work'],
  ['Sam', 'Sam Lee'],
];
const SELF = [
  undefined,
  '',
  'me',
  'Me',
  'myself',
  'I',
  'my phone',
  'my cell',
  'my own',
  'my own phone',
  'my own number',
  // the same forms as words() reads them: punctuation, a hyphen, a curly apostrophe
  'me,',
  'myself,',
  'my phone,',
  'my cell-phone',
  'my’ phone',
  // paraphrases: only positive evidence of someone else refuses, so these ring as main does
  'my cellphone',
  'my mobile phone',
  'my phone number',
  'my own cell',
  'my own mobile',
  'mine',
  'me (the caller)',
  'Me (caller)',
  'My Cell Phone',
  'my home phone',
  // the caller's own verified number, matched digits-only, in any format
  OWNER,
  '(801) 555-0100',
  '801.555.0100',
  '1 801 555 0100',
  '555-0100',
  'me at +18015550100',
  // no words and no number
  '!!!',
  '42',
  'Riley🙂', // a symbol is not a name
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

  it.each(SELF)('who %j (the caller): scheduled exactly as main does', (who) => sameAsMain(who));

  it.each(OWN_NAMES)(
    'owner %j, who %j (their own name): scheduled exactly as main does',
    (owner, who) => sameAsMain(who, owner)
  );

  it.each(NOT_OWN_NAMES)(
    'owner %j, who %j: nothing is scheduled or written',
    async (owner, who) => {
      const reply = await run({ ...BIRTHDAY, who }, owner);
      expect(writes()).toBe(0);
      expect(reply).toContain(`so it can't call ${who}.`);
      expect(reply).toMatch(TOOL_REFUSAL);
    }
  );

  it('the model is told to say whom the call is for', () => {
    expect(Object.keys(shape())).toEqual(['message', 'when', 'who']);
  });

  it('the description says it rings only the caller', () => {
    expect(describedAs()).toBe(scheduleCallDescription());
    expect(describedAs().startsWith(MAIN_DESCRIPTION)).toBe(true);
    expect(describedAs()).toContain("It only ever rings the caller's own phone");
  });
});

describe('SCHEDULE_CALL_WHO on, no verified phone to compare a number to', () => {
  beforeEach(() => vi.stubEnv('SCHEDULE_CALL_WHO', 'on'));

  it.each(['555-0199', '(801) 555-0100'])('who %j: answered exactly as main does', async (who) => {
    const port = { verifiedPhone: async () => undefined, call: sent.dial };
    setCallUserPort(port as never);
    vi.stubEnv('SCHEDULE_CALL_WHO', 'off');
    const main = await run(BIRTHDAY);
    vi.stubEnv('SCHEDULE_CALL_WHO', 'on');
    const reply = await run({ ...BIRTHDAY, who });
    expect(reply).toBe(main);
    expect(reply).toContain("I can't call you yet");
    expect(writes()).toBe(0);
  });

  it('a verified-phone lookup that fails fails as on main, with nothing written', async () => {
    setCallUserPort({ verifiedPhone: async () => Promise.reject(new Error('down')) } as never);
    vi.stubEnv('SCHEDULE_CALL_WHO', 'off');
    await expect(run(BIRTHDAY)).rejects.toThrow('down');
    vi.stubEnv('SCHEDULE_CALL_WHO', 'on');
    await expect(run({ ...BIRTHDAY, who: '555-0199' })).rejects.toThrow('down');
    expect(writes()).toBe(0);
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
    (who) => sameAsMain(who)
  );

  it.each([...OWN_NAMES, ...NOT_OWN_NAMES])(
    'owner %j, who %j sent anyway: ignored, the caller is rung exactly as main does',
    (owner, who) => sameAsMain(who, owner)
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
    expect(otherPerson("Riley O'Brien", ['riley obrien'])).toBeUndefined();
    expect(otherPerson('Mary-Jane', ['mary jane testing'])).toBeUndefined();
    expect(otherPerson("Riley's boss", ['riley obrien'])).toBe("Riley's boss");
    expect(otherPerson('Riley Testing Jr', ['riley testing'])).toBe('Riley Testing Jr');
    // A number: someone else's only when it isn't the verified phone.
    expect(otherPerson('555-0199', [], OWNER)).toBe('555-0199');
    expect(otherPerson('(801) 555-0100', [], OWNER)).toBeUndefined();
    expect(otherPerson('+1 801 555 0100', [], '8015550100')).toBeUndefined();
    expect(otherPerson('555-0100', ['riley testing'])).toBeUndefined(); // no phone to compare to
    expect(otherPerson('42', [], OWNER)).toBeUndefined(); // not a phone number
    // No positive evidence of someone else: rung as main does.
    expect(otherPerson('alex', ['riley testing'])).toBeUndefined(); // no capital, no relation
    expect(otherPerson('?!', ['riley testing'])).toBeUndefined();
    expect(otherPerson('MaryJane', ['mary jane testing'])).toBeUndefined();
    expect(otherPerson('Jane', ['mary jane watson'])).toBe('Jane');
  });
});
