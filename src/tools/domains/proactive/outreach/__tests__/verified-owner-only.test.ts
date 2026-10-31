/**
 * Tools that send the owner a message the model wrote run only for a caller the
 * server verified on this call (verified-owner-only.ts). Anyone else gets one
 * line, and nothing runs: no send, no schedule, no store read. A verified owner
 * is reached as before, at the verified phone or email on the account only.
 * Mocked at the edges: the profile store, the timing model, the senders.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const OWNER = { id: 'owner-uid', phone: '+15555550100', email: 'owner@example.com' };
const STRANGER = { phoneNumber: '+15555550199', to: '+15555550199', recipient: '+15555550199' };

const edges = vi.hoisted(() => ({
  getProfile: vi.fn(async (..._a: unknown[]) => ({ preferences: {} })),
  timing: vi.fn(async (..._a: unknown[]) => ({
    suggestedSendTime: new Date(Date.now() + 3_600_000),
    confidenceLevel: 'low',
  })),
  sms: vi.fn(async (..._a: unknown[]) => 'sent'),
  email: vi.fn(async (..._a: unknown[]) => 'sent'),
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
}));

vi.mock('../../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: edges.getProfile, saveProfile: vi.fn() }),
}));
vi.mock('../../../../../services/contacts/optimal-timing.js', () => ({
  getTimingRecommendation: edges.timing,
}));
vi.mock('../../../../../services/communication-service.js', () => ({
  sendSMS: edges.sms,
  sendEmail: edges.email,
}));
vi.mock('../../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: edges.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: async () => undefined,
  recordReminderPromise: async () => undefined,
}));

import type { ToolContext, ToolDefinition } from '../../../../registry/types.js';
import { definitions as schedulingDefs } from '../../../scheduling/index.js';
import { getTelephonyToolDefinitions } from '../../../telephony/index.js';
import { getAgentToUserOutreachDefinitions } from '../agent-to-user.js';
import { setCallUserPort, type CallUserPort } from '../call-user-port.js';
import { OWNER_NEEDS_VERIFICATION, ownerReach } from '../verified-owner-only.js';

const ctx: ToolContext = { userId: OWNER.id, agentId: 'ferni', agentDisplayName: 'Ferni' };

/** A LiveKit run's opts carrying the session's userData. */
const session = (userData: unknown) => ({ ctx: { userData } });
const VERIFIED_OWNER = session({ userId: OWNER.id, verifiedCaller: true });

const port = {
  verifiedPhone: vi.fn(async (..._a: unknown[]) => OWNER.phone),
  verifiedEmail: vi.fn(async (..._a: unknown[]) => OWNER.email),
  textOwner: vi.fn(async (..._a: unknown[]) => ({ sent: true })),
  call: vi.fn(async (..._a: unknown[]) => ({ success: true, status: 'initiated' })),
};

function toolsById(): Map<string, ToolDefinition> {
  vi.stubEnv('TOOLS_REAL_CALL_USER', 'on'); // the real callUser path, read per run
  const all = [
    ...schedulingDefs,
    ...getAgentToUserOutreachDefinitions(),
    ...getTelephonyToolDefinitions(),
  ];
  return new Map(all.map((d) => [d.id, d]));
}

/** Every gated tool, with arguments that would send something. */
const GATED: Array<[string, Record<string, unknown>]> = [
  ['sendImmediateOutreach', { message: 'hi', method: 'sms' }],
  ['sendImmediateOutreach', { message: 'hi', method: 'email' }],
  ['sendImmediateOutreach', { message: 'hi', method: 'call' }],
  ['scheduleProactiveReminder', { message: 'hi', when: 'in 2 hours' }],
  ['callUser', { reason: 'check in', message: 'hi' }],
  ['sendMessageNow', { message: 'hi' }],
  ['scheduleMessage', { message: 'hi', when: 'in 2 hours' }],
  ['scheduleCall', { message: 'hi', when: 'in 2 hours' }],
  ['scheduleEmail', { subject: 's', message: 'hi', when: 'in 2 hours' }],
  ['scheduleAtBestTime', { message: 'hi', contactName: 'Pat Example', channel: 'text' }],
];

const run = (id: string, args: Record<string, unknown>, opts: unknown) =>
  toolsById()
    .get(id)!
    .create(ctx)
    .execute({ ...args, ...STRANGER }, opts as never);

const sends = (): number =>
  [edges.sms, edges.email, edges.reminder, port.textOwner, port.call].reduce(
    (n, f) => n + f.mock.calls.length,
    0
  );
const storeReads = (): number =>
  [edges.getProfile, edges.timing, port.verifiedPhone, port.verifiedEmail].reduce(
    (n, f) => n + f.mock.calls.length,
    0
  );

afterEach(() => {
  setCallUserPort(undefined);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('ownerReach: only the owner, verified on this call', () => {
  it('is verified for the owner with the boolean true the server set', () => {
    expect(ownerReach(OWNER.id, VERIFIED_OWNER)).toEqual({ outcome: 'verified', id: OWNER.id });
  });

  it.each([
    ['missing', { userId: OWNER.id }],
    ['false', { userId: OWNER.id, verifiedCaller: false }],
    ['the string "true"', { userId: OWNER.id, verifiedCaller: 'true' }],
    ['the number 1', { userId: OWNER.id, verifiedCaller: 1 }],
  ])('needs verification when the bit is %s', (_, userData) => {
    expect(ownerReach(OWNER.id, session(userData))).toEqual({ outcome: 'needs_verification' });
  });

  it.each(['phone:+15555550100', 'device:fixture', 'anon:fixture', 'unknown'])(
    'needs verification for %s, even marked verified',
    (id) => {
      const opts = session({ userId: id, verifiedCaller: true });
      expect(ownerReach(id, opts)).toEqual({ outcome: 'needs_verification' });
    }
  );

  it('needs verification for someone else verified, and with no session at all', () => {
    const other = session({ userId: 'other-uid', verifiedCaller: true });
    expect(ownerReach(OWNER.id, other)).toEqual({ outcome: 'needs_verification' });
    expect(ownerReach(OWNER.id, {})).toEqual({ outcome: 'needs_verification' });
    expect(ownerReach(OWNER.id, undefined)).toEqual({ outcome: 'needs_verification' });
    expect(ownerReach('', session({ userId: '', verifiedCaller: true }))).toEqual({
      outcome: 'needs_verification',
    });
  });
});

describe('an unverified caller sends nothing and reads no store', () => {
  const UNVERIFIED: Array<[string, unknown]> = [
    ['no session', {}],
    ['the bit missing', session({ userId: OWNER.id })],
    ['the bit false', session({ userId: OWNER.id, verifiedCaller: false })],
    ['the bit "true"', session({ userId: OWNER.id, verifiedCaller: 'true' })],
    ['the bit 1', session({ userId: OWNER.id, verifiedCaller: 1 })],
    ['another verified caller', session({ userId: 'other-uid', verifiedCaller: true })],
  ];

  it.each(GATED)('%s refuses every unverified session', async (id, args) => {
    setCallUserPort(port as CallUserPort);
    for (const [, opts] of UNVERIFIED) {
      await expect(run(id, args, opts)).resolves.toBe(OWNER_NEEDS_VERIFICATION);
    }
    expect(sends()).toBe(0);
    expect(storeReads()).toBe(0);
  });

  it.each(['phone:+15555550100', 'device:fixture', 'anon:fixture', 'unknown'])(
    'a %s session marked verified sends nothing either',
    async (id) => {
      setCallUserPort(port as CallUserPort);
      const asCaller: ToolContext = { ...ctx, userId: id };
      const opts = session({ userId: id, verifiedCaller: true });
      for (const [tool, args] of GATED) {
        const reply = await toolsById()
          .get(tool)!
          .create(asCaller)
          .execute(args, opts as never);
        expect(reply).toBe(OWNER_NEEDS_VERIFICATION);
      }
      expect(sends()).toBe(0);
      expect(storeReads()).toBe(0);
    }
  );
});

describe('a verified owner is reached as before, only on the account', () => {
  it.each(GATED)('%s sends, to the verified address only', async (id, args) => {
    setCallUserPort(port as CallUserPort);
    const reply = await run(id, args, VERIFIED_OWNER);
    expect(reply).not.toBe(OWNER_NEEDS_VERIFICATION);
    expect(sends()).toBe(1);
    // Never the number or address the model put in the arguments.
    const reached = [
      ...port.textOwner.mock.calls.map((c) => c[0]),
      ...port.call.mock.calls.map((c) => (c[0] as { phoneNumber: string }).phoneNumber),
      ...edges.email.mock.calls.map((c) => c[0]),
      ...edges.reminder.mock.calls.map(
        (c) => (c[0] as { deliveryAddress: string }).deliveryAddress
      ),
    ];
    expect(reached).toHaveLength(1);
    expect([OWNER.id, OWNER.phone, OWNER.email]).toContain(reached[0]);
    expect(edges.sms).not.toHaveBeenCalled();
  });

  it('texts now keep their unasked quiet-hours semantics (askedNow unchanged)', async () => {
    setCallUserPort(port as CallUserPort);
    await run('sendImmediateOutreach', { message: 'hi', method: 'sms' }, VERIFIED_OWNER);
    await run('sendMessageNow', { message: 'hi' }, VERIFIED_OWNER);
    expect(port.textOwner.mock.calls.map((c) => c[2])).toEqual([
      { askedNow: false },
      { askedNow: true },
    ]);
  });
});
