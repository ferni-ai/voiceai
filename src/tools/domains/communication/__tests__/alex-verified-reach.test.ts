/**
 * The legacy Alex tools (setReminder, scheduleCall) texted the number the model
 * passed, or the model-written profile.contactInfo. They now reach only the
 * account's verified phone or email (call-user port), stored as 'verified-own'
 * so the guarded sender delivers them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const STRANGER = '+12125550199';
const OWNER = '+18015550100';

const h = vi.hoisted(() => ({
  reminder: vi.fn(async (r: Record<string, unknown>) => ({ id: 'r1', ...r })),
}));

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => ({ description: config.description, execute: config.execute })) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: h.reminder,
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: async () => undefined,
}));
vi.mock('../../../../services/communication-service.js', () => ({
  sendSMS: vi.fn(),
  sendEmail: vi.fn(),
}));

import { setCallUserPort } from '../../proactive/outreach/call-user-port.js';
import { createCommunicationTools } from '../communication-tools.js';

type Exec = { execute: (args: object, opts: unknown) => Promise<unknown> };
// What the session carries: a model-written profile phone and email.
const opts = {
  ctx: {
    userData: {
      userId: 'uid-alex',
      userProfile: { contactInfo: { phone: STRANGER, email: 'stranger@example.com' } },
    },
  },
};
const tools = () => createCommunicationTools() as unknown as Record<string, Exec>;
const withVerified = (phone?: string, email?: string) =>
  setCallUserPort({
    verifiedPhone: async () => phone,
    verifiedEmail: async () => email,
    call: vi.fn(),
  });

afterEach(() => {
  setCallUserPort(undefined);
  vi.clearAllMocks();
});

describe('legacy Alex setReminder', () => {
  it('with no verified reach, a saved or passed number gets nothing', async () => {
    withVerified(undefined, undefined);
    const text = String(
      await tools().setReminder.execute(
        { message: 'call mom', when: 'in 2 hours', deliveryMethod: 'sms', contact: STRANGER },
        opts
      )
    );
    await tools().setReminder.execute(
      { message: 'call mom', when: 'in 2 hours', deliveryMethod: 'email' },
      opts
    );
    expect(h.reminder).not.toHaveBeenCalled();
    expect(text).toContain('no verified phone number');
  });

  it('goes to the verified phone or email, marked verified-own', async () => {
    withVerified(OWNER, 'owner@example.com');
    await tools().setReminder.execute(
      { message: 'call mom', when: 'in 2 hours', deliveryMethod: 'sms', contact: STRANGER },
      opts
    );
    await tools().setReminder.execute(
      { message: 'call mom', when: 'in 2 hours', deliveryMethod: 'email' },
      opts
    );
    expect(h.reminder.mock.calls.map((c) => [c[0].deliveryAddress, c[0].addressSource])).toEqual([
      [OWNER, 'verified-own'],
      ['owner@example.com', 'verified-own'],
    ]);
  });
});

describe("legacy Alex scheduleCall's 15-minute reminder", () => {
  const args = { contact: 'Dr. Lee', purpose: 'results', dateTime: 'in 3 hours', duration: 30 };

  it('with no verified phone, no reminder text is set and none is promised', async () => {
    withVerified(undefined);
    const reply = String(await tools().scheduleCall.execute(args, opts));
    expect(h.reminder).not.toHaveBeenCalled();
    expect(reply).not.toContain("I'll remind you");
  });

  it('goes to the verified phone, marked verified-own', async () => {
    withVerified(OWNER);
    await tools().scheduleCall.execute(args, opts);
    expect(h.reminder).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryAddress: OWNER, addressSource: 'verified-own' })
    );
  });
});
