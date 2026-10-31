/**
 * Every tool that sends the owner a message the model wrote goes through
 * ownerMessagePolicy (owner-message-policy.ts). Flag off, and for a verified
 * caller, nothing changes. With UNVERIFIED_OWNER_MESSAGE_FILTER on, an
 * unverified call may still message the owner at the address on file, but
 * filtered, with the footer, and at most twice; a refusal sends nothing and
 * reads no store. Mocked at the edges: profile store, timing model, senders.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  logged: vi.fn((..._a: unknown[]) => undefined),
}));

vi.mock('../../../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<typeof import('../../../../../utils/safe-logger.js')>();
  const logger: Record<string, unknown> = { info: edges.logged, warn: vi.fn(), error: vi.fn() };
  Object.assign(logger, { debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: () => logger });
  return { ...real, getLogger: () => logger };
});
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

import type { Tool, ToolContext, ToolDefinition } from '../../../../registry/types.js';
import { definitions as schedulingDefs } from '../../../scheduling/index.js';
import { getTelephonyToolDefinitions } from '../../../telephony/index.js';
import { getAgentToUserOutreachDefinitions } from '../agent-to-user.js';
import { setCallUserPort, type CallUserPort } from '../call-user-port.js';
import {
  UNVERIFIED_CAP_REFUSAL,
  UNVERIFIED_CONTENT_REFUSAL,
  UNVERIFIED_FOOTER,
  UNVERIFIED_NOTHING_SENT_REFUSAL,
  ownerMessagePolicy,
  ownerMessageTool,
  type OwnerMessage,
  type OwnerMessageDecision,
} from '../owner-message-policy.js';

const ctx: ToolContext = { userId: OWNER.id, agentId: 'ferni', agentDisplayName: 'Ferni' };
/** A LiveKit run's options: the call session's userData. A fresh object is a fresh call. */
const call = (userData: Record<string, unknown>) => ({ ctx: { userData } });
const verified = () => call({ userId: OWNER.id, verifiedCaller: true });
/** A live call's session data: session-manager's services carry its id. A fresh one is a fresh call. */
let calls = 0;
const unverified = () =>
  call({ userId: OWNER.id, verifiedCaller: false, services: { sessionId: `session-AJ_t${++calls}-1700000000000` } }); // prettier-ignore

const port = {
  verifiedPhone: vi.fn(async (..._a: unknown[]) => OWNER.phone),
  verifiedEmail: vi.fn(async (..._a: unknown[]) => OWNER.email),
  textOwner: vi.fn(async (..._a: unknown[]) => ({ sent: true })),
  call: vi.fn(async (..._a: unknown[]) => ({ success: true, status: 'initiated' })),
};

/** Each tool in the policy, arguments that send, and whether its message is spoken. */
const TOOLS: Array<[string, Record<string, unknown>, 'text' | 'spoken']> = [
  ['sendImmediateOutreach', { message: 'hi', method: 'sms' }, 'text'],
  ['sendImmediateOutreach', { message: 'hi', method: 'email' }, 'text'],
  ['sendImmediateOutreach', { message: 'hi', method: 'call' }, 'spoken'],
  ['scheduleProactiveReminder', { message: 'hi', when: 'in 2 hours' }, 'text'],
  ['callUser', { reason: 'check in', message: 'hi' }, 'spoken'],
  ['sendMessageNow', { message: 'hi' }, 'text'],
  ['scheduleMessage', { message: 'hi', when: 'in 2 hours' }, 'text'],
  ['scheduleCall', { message: 'hi', when: 'in 2 hours' }, 'spoken'],
  ['scheduleEmail', { subject: 's', message: 'hi', when: 'in 2 hours' }, 'text'],
  ['scheduleAtBestTime', { message: 'hi', contactName: 'Pat Example', channel: 'text' }, 'text'],
];

function tool(id: string, as: ToolContext = ctx): Tool {
  const all: ToolDefinition[] = [
    ...schedulingDefs,
    ...getAgentToUserOutreachDefinitions(),
    ...getTelephonyToolDefinitions(),
  ];
  return all.find((d) => d.id === id)!.create(as);
}
const run = (id: string, args: Record<string, unknown>, opts: unknown) =>
  tool(id).execute({ ...args, ...STRANGER }, opts as never);

const senders = [edges.sms, edges.email, edges.reminder, port.textOwner, port.call];
/** The refusals the policy logged (other modules log through the same logger). */
const refusals = () => edges.logged.mock.calls.filter((c) => String(c[1]).startsWith('Owner message refused')); // prettier-ignore
const sends = (): number => senders.reduce((n, f) => n + f.mock.calls.length, 0);
const storeReads = (): number =>
  [edges.getProfile, edges.timing, port.verifiedPhone, port.verifiedEmail].reduce(
    (n, f) => n + f.mock.calls.length,
    0
  );
/** Every message and address that went out, as the senders saw it. */
function delivered(): { to: unknown[]; said: string[] } {
  const reminders = edges.reminder.mock.calls.map((c) => c[0] as Record<string, string>);
  const calls = port.call.mock.calls.map((c) => c[0] as Record<string, string>);
  return {
    to: [
      ...port.textOwner.mock.calls.map((c) => c[0]),
      ...edges.email.mock.calls.map((c) => c[0]),
      ...calls.map((c) => c.phoneNumber),
      ...reminders.map((r) => r.deliveryAddress),
    ],
    said: [
      ...port.textOwner.mock.calls.map((c) => String(c[1])),
      ...edges.email.mock.calls.map((c) => String(c[2])),
      ...calls.map((c) => c.message),
      ...reminders.map((r) => r.message),
    ],
  };
}

beforeEach(() => {
  vi.stubEnv('TOOLS_REAL_CALL_USER', 'on'); // the real callUser path, read per run
  setCallUserPort(port as CallUserPort);
});
afterEach(() => {
  setCallUserPort(undefined);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('flag off (the default): exactly as before', () => {
  it('hands the same arguments and options straight to the tool and returns its reply', async () => {
    const execute = vi.fn(async (..._a: unknown[]) => 'the reply');
    const def = { id: 'sendMessageNow', create: () => ({ execute }) } as unknown as ToolDefinition;
    const args = { message: 'visit example.com', ...STRANGER };
    const opts = unverified();
    await expect(
      ownerMessageTool(def)
        .create(ctx)
        .execute(args, opts as never)
    ).resolves.toBe('the reply');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toBe(args);
    expect(execute.mock.calls[0][1]).toBe(opts);
  });

  it.each(TOOLS)('%s sends for an unverified call, unfiltered, with no footer or limit', async (id, args) => {
    const opts = unverified();
    for (let i = 0; i < 3; i++) await run(id, { ...args, message: 'call 555-555-0123' }, opts);
    expect(sends()).toBe(3);
    expect(delivered().said.every((s) => !s.includes(UNVERIFIED_FOOTER))).toBe(true);
    expect(refusals()).toHaveLength(0);
  }); // prettier-ignore
});

describe('flag on', () => {
  beforeEach(() => vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'on'));

  it.each(TOOLS)('%s: a verified caller is unchanged (no filter, footer or limit)', async (id, args) => {
    const opts = verified();
    for (let i = 0; i < 3; i++) await run(id, { ...args, message: 'visit example.com' }, opts);
    expect(sends()).toBe(3);
    expect(delivered().said.every((s) => !s.includes(UNVERIFIED_FOOTER))).toBe(true);
  }); // prettier-ignore

  it.each(TOOLS)('%s: an unverified call sends to the address on file only', async (id, args, kind) => {
    await expect(run(id, args, unverified())).resolves.not.toMatch(/once you're in the app/);
    const { to, said } = delivered();
    expect(sends()).toBe(1);
    expect(to).toHaveLength(1);
    expect([OWNER.id, OWNER.phone, OWNER.email]).toContain(to[0]); // never STRANGER
    expect(said[0].includes(`hi\n\n${UNVERIFIED_FOOTER}`)).toBe(kind === 'text');
  }); // prettier-ignore

  it.each(TOOLS)('%s: refused content sends nothing and reads no store', async (id, args) => {
    for (const message of ['go to example.com', 'call 555 555 0123', 'what is your PIN']) {
      await expect(run(id, { ...args, message }, unverified())).resolves.toBe(
        UNVERIFIED_CONTENT_REFUSAL
      );
    }
    expect(sends()).toBe(0);
    expect(storeReads()).toBe(0);
  });

  it('checks the email subject too', async () => {
    const args = { subject: 'verify your account', message: 'hi', when: 'in 2 hours' };
    await expect(run('scheduleEmail', args, unverified())).resolves.toBe(
      UNVERIFIED_CONTENT_REFUSAL
    );
    expect(sends()).toBe(0);
  });

  it('checks every model-written field: subject, body and contact name', async () => {
    const when = 'in 2 hours';
    const runs: Array<[string, Record<string, unknown>]> = [
      ['scheduleEmail', { subject: 'see example dot shop', message: 'hi', when }],
      ['scheduleEmail', { subject: 'hi', message: 'see example[.]top', when }],
      ['scheduleAtBestTime', { message: 'hi', contactName: 'example . xyz', channel: 'text' }],
    ];
    for (const [id, args] of runs) {
      await expect(run(id, args, unverified())).resolves.toBe(UNVERIFIED_CONTENT_REFUSAL);
    }
    expect(sends() + storeReads()).toBe(0);
  });

  it('two sends per unverified call, across tools; a new call starts again', async () => {
    const opts = unverified();
    await run('sendMessageNow', { message: 'hi' }, opts);
    await run('callUser', { reason: 'check in' }, opts);
    const third = await run('scheduleMessage', { message: 'hi', when: 'in 2 hours' }, opts);
    expect(third).toBe(UNVERIFIED_CAP_REFUSAL);
    expect(UNVERIFIED_CAP_REFUSAL).toBe(
      "That's all I can send from this call. I can send more once you're in the app."
    );
    expect(sends()).toBe(2);
    await run('sendMessageNow', { message: 'hi' }, unverified());
    expect(sends()).toBe(3);
  });

  it.each([
    ['missing', { userId: OWNER.id }],
    ['the string "true"', { userId: OWNER.id, verifiedCaller: 'true' }],
    ['the number 1', { userId: OWNER.id, verifiedCaller: 1 }],
    ['an object', { userId: OWNER.id, verifiedCaller: {} }],
    ['true for someone else', { userId: 'other-uid', verifiedCaller: true }],
  ])('a verified bit that is %s counts as unverified', async (_, userData) => {
    const reply = await run('sendMessageNow', { message: 'go to example.com' }, call(userData));
    expect(reply).toBe(UNVERIFIED_CONTENT_REFUSAL);
    expect(sends()).toBe(0);
  });

  it.each(['anon:fixture', 'unknown', 'onbehalf:fixture'])(
    'no account (%s): nothing is sent or read',
    async (id) => {
      const as = { ...ctx, userId: id };
      const opts = call({ userId: id, verifiedCaller: true });
      const reply = await tool('sendMessageNow', as).execute({ message: 'hi' }, opts as never);
      expect(reply).toBe(UNVERIFIED_NOTHING_SENT_REFUSAL);
      expect(sends() + storeReads()).toBe(0);
    }
  );

  it('no call session to count against: nothing is sent or read', async () => {
    await expect(run('sendMessageNow', { message: 'hi' }, {})).resolves.toBe(
      UNVERIFIED_NOTHING_SENT_REFUSAL
    );
    expect(sends() + storeReads()).toBe(0);
  });

  it('an allowed send the tool does not deliver: logged as delivery_failed, slot still spent', async () => {
    port.textOwner.mockResolvedValueOnce({
      sent: false,
      reason: 'quiet hours at example.com',
    } as never);
    const opts = call({ userId: OWNER.id, services: { sessionId: 'sess-2' } });
    const reply = await run('sendImmediateOutreach', { message: 'hi', method: 'sms' }, opts);
    expect(reply).toMatch(/^I didn't text you/);
    const undelivered = edges.logged.mock.calls.filter((c) =>
      String(c[1]).includes('not delivered')
    );
    expect(undelivered).toHaveLength(1);
    const [fields, msg] = undelivered[0] as [Record<string, unknown>, string];
    expect(fields).toEqual({
      tool: 'sendImmediateOutreach',
      userId: OWNER.id,
      sessionId: 'sess-2',
      reason: 'delivery_failed',
    });
    expect(JSON.stringify([fields, msg])).not.toMatch(/hi|quiet|example/);
    await run('sendMessageNow', { message: 'hi' }, opts);
    await expect(run('sendMessageNow', { message: 'hi' }, opts)).resolves.toBe(
      UNVERIFIED_CAP_REFUSAL
    );
  });

  it('a delivered send logs nothing', async () => {
    await run('sendMessageNow', { message: 'hi' }, unverified());
    expect(edges.logged.mock.calls.filter((c) => String(c[1]).includes('not delivered'))).toHaveLength(0); // prettier-ignore
  });

  it('counts per voice session id, whatever userData object a tool path builds', async () => {
    const callA = () => call({ userId: OWNER.id, services: { sessionId: 'session-AJ_cap-1' } });
    await run('sendMessageNow', { message: 'hi' }, callA());
    await run('sendMessageNow', { message: 'hi' }, callA());
    await expect(run('sendMessageNow', { message: 'hi' }, callA())).resolves.toBe(
      UNVERIFIED_CAP_REFUSAL
    );
    expect(sends()).toBe(2);
  });

  it('the emergency number goes out to an unverified caller', async () => {
    const reply = await run('sendMessageNow', { message: 'If you are in danger, call 911' }, unverified()); // prettier-ignore
    expect(reply).not.toMatch(/once you're in the app/);
    expect(delivered().said[0]).toContain('call 911');
  });

  it('a crisis line goes out to an unverified caller', async () => {
    const reply = await run('sendMessageNow', { message: "If you're in crisis, call or text 988 right now" }, unverified()); // prettier-ignore
    expect(reply).not.toMatch(/once you're in the app/);
    expect(delivered().said[0]).toContain('call or text 988 right now');
  });

  it('a call with no session id and no live session behind it: no_session, nothing sent', async () => {
    const routed = call({ userId: OWNER.id, sessionId: undefined }); // what the executor builds without an id
    await expect(run('sendMessageNow', { message: 'hi' }, routed)).resolves.toBe(UNVERIFIED_NOTHING_SENT_REFUSAL); // prettier-ignore
    const liveWithoutId = call({ userId: OWNER.id, services: {} });
    await expect(run('sendMessageNow', { message: 'hi' }, liveWithoutId)).resolves.not.toMatch(/in the app/); // prettier-ignore
    expect(sends()).toBe(1);
  });

  it('logs each refusal with ids and a reason code, never the text', async () => {
    const opts = call({ userId: OWNER.id, services: { sessionId: 'sess-1' } });
    await run('sendMessageNow', { message: 'go to example.com' }, opts);
    expect(refusals()).toHaveLength(1);
    const [fields, msg] = refusals()[0] as [Record<string, unknown>, string];
    expect(fields).toEqual({
      tool: 'sendMessageNow',
      userId: OWNER.id,
      sessionId: 'sess-1',
      reason: 'address_token',
    });
    expect(JSON.stringify([fields, msg])).not.toContain('example');
  });

  describe('ownerMessagePolicy: the one decision, typed', () => {
    const decide = (over: Partial<OwnerMessage>): OwnerMessageDecision =>
      ownerMessagePolicy({ tool: 't', ownerId: OWNER.id, opts: unverified(), texts: ['hi'], spoken: false, ...over }); // prettier-ignore

    it('verified: unchanged; unverified: allowed with the footer, none when spoken', () => {
      expect(decide({ opts: verified() })).toEqual({ outcome: 'unchanged' });
      expect(decide({})).toEqual({ outcome: 'unverified_allowed', footer: UNVERIFIED_FOOTER });
      expect(decide({ spoken: true })).toEqual({ outcome: 'unverified_allowed', footer: null });
    });

    it('names the reason for each refusal', () => {
      const reasons = [
        decide({ texts: ['pat@example.com'] }),
        decide({ texts: ['example.com'] }),
        decide({ texts: ['555 555 0123'] }),
        decide({ texts: ['your password'] }),
        decide({ ownerId: 'anon:fixture' }),
        decide({ opts: {} }),
      ].map((d) => (d.outcome === 'refused' ? d.reason : d.outcome));
      expect(reasons).toEqual(['charset', 'address_token', 'digits', 'credential_ask', 'no_account', 'no_session']); // prettier-ignore
    });
  });
});
