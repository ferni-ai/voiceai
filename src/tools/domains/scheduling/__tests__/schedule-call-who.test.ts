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
import { otherPerson } from '../schedule-call-who.js';

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

  it.each(['my mom Priya', 'Priya', 'Mom', 'Marcus.'])(
    'who %j: nothing is scheduled, and it says so',
    async (who) => {
      const reply = await run({ ...BIRTHDAY, who });
      expect(sent.reminder).not.toHaveBeenCalled();
      expect(reply).toMatch(/^Nothing was scheduled: a scheduled call can only ring you/);
      expect(reply).toContain(`call ${who.replace(/\.$/, '')} yourself`);
      expect(reply).not.toContain("I'll call you");
    }
  );

  it.each([undefined, 'me', 'Me', 'myself', 'Riley', 'Riley Test'])(
    'who %j (the caller): the call is scheduled to their verified phone',
    async (who) => {
      const reply = await run({ ...BIRTHDAY, ...(who === undefined ? {} : { who }) });
      expect(rungTo()).toEqual([OWNER]);
      expect(reply).toContain("I'll call you on");
    }
  );

  it('the model is told to say whom the call is for', () => {
    expect(Object.keys(shape())).toEqual(['message', 'when', 'who']);
  });
});

describe('SCHEDULE_CALL_WHO off: the tool as main has it', () => {
  it('no `who` parameter', () => {
    expect(Object.keys(shape())).toEqual(['message', 'when']);
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
    expect(otherPerson('Riley', ['riley'])).toBeUndefined();
    expect(otherPerson('Riley', [])).toBe('Riley');
  });
});
