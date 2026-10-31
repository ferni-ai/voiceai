/**
 * In-call scheduling tools read a time the caller said in the zone the call
 * settled (phone-parity.ts), never in the account profile's zone: on a call
 * from a number matched to an account, or placed for someone, the profile
 * isn't the caller's. A verified owner's call settles their profile zone, so
 * they still get it. Tool contexts don't always carry the session id, so the
 * user id's entry (set or cleared when the call settles) counts too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const zonesParsedIn = vi.hoisted(() => [] as Array<string | undefined>);

// The account's profile says Los Angeles; nothing here may use it.
vi.mock('../../../tools/domains/proactive/outreach/index.js', () => ({
  scheduleText: vi.fn(async () => ({ success: true, reminderId: 'r1' })),
  scheduleCall: vi.fn(async () => ({ success: true, reminderId: 'r1' })),
  scheduleEmail: vi.fn(async () => ({ success: true, reminderId: 'r1' })),
  textUser: vi.fn(),
  setUserContactInfo: vi.fn(),
  getUserContactInfo: vi.fn(async () => ({ timezone: 'America/Los_Angeles' })),
  verifiedOwnerOnly: (def: unknown) => def, // the verified-caller gate has its own tests
}));
vi.mock('../../../services/outreach/user-contact.js', () => ({
  getUserContactInfo: vi.fn(async () => ({ timezone: 'America/Los_Angeles' })),
}));
vi.mock('../../../services/scheduling/reminder-scheduler.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  parseNaturalTime: vi.fn((_when: string, zone?: string) => {
    zonesParsedIn.push(zone);
    return new Date(Date.now() + 86_400_000);
  }),
}));
vi.mock('../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: vi.fn(async () => undefined),
}));

const { forgetCallerTimeZone, rememberCallerTimeZone } =
  await import('../../../utils/caller-time-zone.js');
const { schedulingExecutor } = await import('../../shared/tool-executors/scheduling-executor.js');
const { definitions } = await import('../../../tools/domains/scheduling/index.js');

const NY = 'America/New_York';
type Exec = { execute: (args: Record<string, unknown>) => Promise<unknown> };

async function viaTool(ctx: { userId: string; sessionId?: string }): Promise<string | undefined> {
  zonesParsedIn.length = 0;
  const def = definitions.find((d) => d.id === 'scheduleMessage')!;
  const tool = def.create({ agentId: 'ferni', agentDisplayName: 'Ferni', ...ctx } as never);
  await (tool as unknown as Exec).execute({ message: 'hi', when: 'tomorrow at 9am' });
  return zonesParsedIn[0];
}

async function viaExecutor(
  ctx: { userId: string; sessionId?: string },
  fn = 'scheduleText'
): Promise<unknown> {
  zonesParsedIn.length = 0;
  const args = { message: 'hi', recipient: 'Mom', subject: 'hi', when: 'tomorrow at 9am' };
  await schedulingExecutor.execute(fn, args, ctx);
  return zonesParsedIn[0];
}

async function viaTools(ctx: { userId: string; sessionId?: string }): Promise<unknown[]> {
  const seen: unknown[] = [];
  for (const id of ['scheduleCall', 'scheduleEmail']) {
    zonesParsedIn.length = 0;
    const def = definitions.find((d) => d.id === id)!;
    const tool = def.create({ agentId: 'ferni', agentDisplayName: 'Ferni', ...ctx } as never);
    await (tool as unknown as Exec).execute({
      message: 'hi',
      subject: 'hi',
      when: 'tomorrow at 9am',
    });
    seen.push(zonesParsedIn[0]);
  }
  for (const fn of ['scheduleCall', 'scheduleEmail']) seen.push(await viaExecutor(ctx, fn));
  return seen;
}

describe("in-call scheduling uses the call's zone, never the profile's", () => {
  beforeEach(() => forgetCallerTimeZone('s-unverified', 'u-unverified', 's-owner', 'u-owner'));

  it.each([
    ['scheduleMessage tool', viaTool],
    ['scheduling executor', viaExecutor],
  ])('%s: a caller whose call settled no zone gets UTC, not the profile zone', async (_n, run) => {
    const utc = [undefined, 'Etc/UTC'];
    expect(utc).toContain(await run({ userId: 'u-unverified', sessionId: 's-unverified' }));
    expect(utc).toContain(await run({ userId: 'u-unverified' })); // context without a session id
  });

  it.each([
    ['scheduleMessage tool', viaTool],
    ['scheduling executor', viaExecutor],
  ])("%s: a verified owner's settled zone is used", async (_n, run) => {
    rememberCallerTimeZone(NY, 's-owner', 'u-owner'); // what settleCallerZone records
    expect(await run({ userId: 'u-owner', sessionId: 's-owner' })).toBe(NY);
    expect(await run({ userId: 'u-owner' })).toBe(NY);
  });

  it('call and email scheduling, tool and executor: never the profile zone', async () => {
    expect(await viaTools({ userId: 'u-unverified', sessionId: 's-unverified' })).not.toContain(
      'America/Los_Angeles'
    );
    rememberCallerTimeZone(NY, 's-owner', 'u-owner');
    expect(new Set(await viaTools({ userId: 'u-owner', sessionId: 's-owner' }))).toEqual(
      new Set([NY])
    );
  });
});
