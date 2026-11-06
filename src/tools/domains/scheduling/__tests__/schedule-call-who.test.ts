/**
 * SCHEDULE_CALL_WHO: scheduleCall only rings the caller's own verified phone.
 *
 * The turn shape: the caller says "Can you schedule a call to my mom Priya at
 * six to wish her happy birthday?", and the model calls scheduleCall with the
 * birthday words and "at 6pm". Main rings the caller at six and plays those
 * words to them. With the flag on, the model also says whom the call is for,
 * and a call for anyone but the caller schedules nothing and says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '+18015550100';

const sent = vi.hoisted(() => ({
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
}));

vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: sent.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: async () => undefined,
  recordReminderPromise: async () => undefined,
}));
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => ({ contactInfo: {} }) }),
}));

import type { ToolContext } from '../../../registry/types.js';
import { setCallUserPort } from '../../proactive/outreach/call-user-port.js';
import { definitions } from '../index.js';
import { TOOL_REFUSAL } from '../../../../agents/personas/action-claims.js';
import { CRISIS_LINE_SPOKEN } from '../../../../services/safety/crisis-line-speech.js';
import { getCrisisResources } from '../../../../services/safety/crisis-response.js';
import { otherPerson, scheduleCallDescription } from '../schedule-call-who.js';

const ctx: ToolContext = {
  userId: 'uid-schedule-who',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
};
const call = { ctx: { userData: { userId: ctx.userId, userName: 'Riley Test' } } };
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
const rungTo = (): string[] =>
  sent.reminder.mock.calls.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress);

beforeEach(() => {
  setCallUserPort({
    verifiedPhone: async () => OWNER,
    verifiedEmail: async () => undefined,
    textOwner: vi.fn(async () => ({ sent: true })),
    call: vi.fn(),
  } as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setCallUserPort(undefined);
  vi.clearAllMocks();
});

describe('SCHEDULE_CALL_WHO on: a scheduled call for someone else is never rung to the caller', () => {
  beforeEach(() => vi.stubEnv('SCHEDULE_CALL_WHO', 'on'));

  it.each([
    ['my mom Priya', 'your mom Priya'],
    ['Priya', 'Priya'],
    ['Mom', 'Mom'],
    ['Marcus.', 'Marcus'],
  ])('who %j: nothing is scheduled, and it says so', async (who, said) => {
    const reply = await run({ ...BIRTHDAY, who });
    expect(sent.reminder).not.toHaveBeenCalled();
    // No "right now": an on-behalf call can wait for the call-hours window.
    expect(reply).toBe(
      `I can't set a call to ${said} for later yet. ` +
        `I can call ${said} for you, or remind you in 2 hours to give them a call.`
    );
    expect(reply).toMatch(TOOL_REFUSAL); // the action-claim guard reads it as nothing done
  });

  it.each(['Riley from work', 'Riley Testing', "Riley's boss"])(
    "who %j starts with the caller's name but is someone else: nothing is scheduled",
    async (who) => {
      const reply = await run({ ...BIRTHDAY, who });
      expect(sent.reminder).not.toHaveBeenCalled();
      expect(reply).toMatch(/^I can't set a call to .* for later yet\./);
    }
  );

  // Ferni can't dial these (services/safety/help-line-who.ts), so no "I can call 911".
  it.each([
    '911',
    '9-1-1',
    'the police',
    'an ambulance',
    'Emergency services',
    '311',
    '1-800-555-0100',
  ])('who %j: nothing is scheduled, and no call is offered', async (who) => {
    const reply = await run({ ...BIRTHDAY, who });
    expect(sent.reminder).not.toHaveBeenCalled();
    expect(reply).toBe(
      `Nothing was scheduled: ${who} is an emergency or service number, so the caller should dial it themselves.`
    );
    expect(reply).not.toMatch(/I can call|remind you/);
    expect(reply).toMatch(TOOL_REFUSAL);
  });

  const [LIFELINE, TEXT_LINE] = getCrisisResources('severe_distress');
  const POISON = getCrisisResources('substance_crisis')[1];
  // A crisis line: no call or reminder offered, and the caller gets the line to call or text.
  it.each([
    ['988', LIFELINE, `call or text ${LIFELINE.phone}`],
    ['the 988 lifeline', LIFELINE, `call or text ${LIFELINE.phone}`],
    [CRISIS_LINE_SPOKEN, LIFELINE, `call or text ${LIFELINE.phone}`],
    ['the suicide hotline', LIFELINE, `call or text ${LIFELINE.phone}`],
    ['the hotline', LIFELINE, `call or text ${LIFELINE.phone}`],
    ['the crisis team', LIFELINE, `call or text ${LIFELINE.phone}`],
    ['Samaritans', LIFELINE, `call or text ${LIFELINE.phone}`],
    ['741741', TEXT_LINE, `text HOME to ${TEXT_LINE.text?.replace(/\D/g, '')}`],
    ['a crisis text line', TEXT_LINE, `text HOME to ${TEXT_LINE.text?.replace(/\D/g, '')}`],
    ['poison control', POISON, `call ${POISON.phone}`],
    [POISON.phone ?? '', POISON, `call ${POISON.phone}`],
  ])(
    'who %j: nothing is scheduled, and the caller gets the line itself',
    async (who, line, how) => {
      const reply = await run({ ...BIRTHDAY, who });
      expect(sent.reminder).not.toHaveBeenCalled();
      expect(reply).toBe(
        `Nothing was scheduled: I can't place a call to ${who}. Say so plainly and kindly, ` +
          `and that the caller can reach ${line.name} any time, right now: ${how}.`
      );
      expect(reply).not.toMatch(/I can call|remind you/);
      expect(reply).toMatch(TOOL_REFUSAL);
    }
  );

  it.each(['my emergency contact Priya', 'Officer Marcus', 'the police station front desk'])(
    'who %j is a person or place, not a service: the usual line',
    async (who) => {
      expect(await run({ ...BIRTHDAY, who })).toMatch(/^I can't set a call to .* for later yet\./);
    }
  );

  it.each([
    ['at 6pm', 'remind you at 6pm'],
    ['6pm', 'remind you at 6pm'],
    ['tomorrow morning.', 'remind you tomorrow morning'],
    ['', 'remind you then'],
  ])('when %j is said back as %j', async (when, said) => {
    expect(await run({ message: 'Happy birthday!', when, who: 'Aunt June' })).toContain(said);
  });

  it.each([
    undefined,
    '',
    'me',
    'Me',
    'myself',
    'the user',
    'I',
    'my phone',
    'my cell',
    'Riley',
    'riley test',
    'Riley Test.',
  ])('who %j (the caller): the call is scheduled to their verified phone', async (who) => {
    const reply = await run({ ...BIRTHDAY, ...(who === undefined ? {} : { who }) });
    expect(rungTo()).toEqual([OWNER]);
    expect(reply).toContain("I'll call you on");
  });

  it('the model is told to say whom the call is for', () => {
    expect(Object.keys(shape())).toEqual(['message', 'when', 'who']);
  });

  it('the description says it rings only the caller', () => {
    expect(scheduleCallDescription()).toContain("It only ever rings the caller's own phone");
    expect(describedAs()).toBe(scheduleCallDescription());
  });
});

describe('SCHEDULE_CALL_WHO off: the tool as main has it', () => {
  it('no `who` parameter', () => {
    expect(Object.keys(shape())).toEqual(['message', 'when']);
  });

  it("the description is main's, word for word", () => {
    expect(describedAs()).toBe(MAIN_DESCRIPTION);
  });

  it('a `who` the model sends anyway is ignored, and the caller is rung as before', async () => {
    const reply = await run({ ...BIRTHDAY, who: 'Priya' });
    expect(rungTo()).toEqual([OWNER]);
    expect(reply).toContain("I'll call you on");
  });
});

describe('otherPerson', () => {
  it('names someone else; the caller, their own first name or nothing is undefined', () => {
    expect(otherPerson('my sister')).toBe('my sister');
    expect(otherPerson('  Priya!  ')).toBe('Priya');
    expect(otherPerson('the caller')).toBeUndefined();
    expect(otherPerson('')).toBeUndefined();
    expect(otherPerson(42)).toBeUndefined();
    expect(otherPerson('Riley', ['riley test'])).toBeUndefined();
    expect(otherPerson('Riley Test', ['riley test'])).toBeUndefined();
    expect(otherPerson('Riley from work', ['riley test'])).toBe('Riley from work');
    expect(otherPerson('Riley', [])).toBe('Riley');
  });
});
