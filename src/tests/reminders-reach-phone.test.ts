/**
 * A reminder asked for in conversation reaches a phone-first user by text,
 * at the number on their account, when ASSISTANT_ACTIONS_REAL=on.
 *
 * Runs setReminder → createReminder → Firestore → the deliver-reminders job →
 * deliverReminder, with only the outside world stubbed: Firestore (in memory),
 * the SMS sender, calendar sync, and the promise ledger.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../services/scheduling/__tests__/fake-firestore.js';

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    userId: string;
    collection: string;
    data: Record<string, unknown>;
  }>,
  users: {} as Record<string, Record<string, unknown>>,
  texts: [] as Array<{ to: string; message: string }>,
}));

vi.mock('../services/superhuman/firestore-utils.js', async () => {
  const { fakeFirestore: fake } =
    await import('../services/scheduling/__tests__/fake-firestore.js');
  return {
    getFirestoreDb: () => {
      const db = fake(state.rows as Row[]);
      const inner = db.collection();
      return {
        ...db,
        collection: () => ({
          doc: (uid: string) => ({
            ...inner.doc(uid),
            get: async () => ({ exists: uid in state.users, data: () => state.users[uid] }),
          }),
        }),
      };
    },
  };
});
vi.mock('../services/communication-service.js', () => ({
  sendReminder: async (to: string, message: string) => {
    state.texts.push({ to, message });
    return 'sent';
  },
  sendSMS: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock('../services/calendar/calendar-bridge.js', () => {
  const ok = async () => ({ success: true });
  return {
    syncReminderToCalendar: ok,
    syncScheduledCallToCalendar: ok,
    syncScheduledEmailToCalendar: ok,
    syncScheduledTextToCalendar: ok,
    removeCalendarSyncedItem: ok,
  };
});
vi.mock('../services/data-layer/hooks/index.js', () => ({ onReminderChange: async () => {} }));
vi.mock('../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: async () => {},
  settleReminderPromise: async () => {},
  sweepOverduePromises: async () => ({}),
}));
vi.mock('../services/outreach/unified-delivery.js', () => ({
  getChannelStatus: async () => ({
    sms: { available: true },
    voice_call: { available: true },
    email: { available: true },
    push: { available: false },
    in_app: { available: true },
  }),
  saveInAppMessage: async () => ({ success: true }),
}));

import { getToolDefinitions } from '../tools/domains/productivity/index.js';
import { NO_NUMBER_TO_TEXT } from '../tools/domains/productivity/reminders.js';
import { deliverDueReminders } from '../services/scheduling/reminder-delivery-job.js';
import type { ToolContext } from '../tools/registry/types.js';

const PHONE_USER = 'phone:+15551234567';
const WEB_USER = 'web-user-1';

async function setReminder(userId: string, args: Record<string, unknown>): Promise<string> {
  const defs = await getToolDefinitions();
  const def = defs.find((d) => d.id === 'setReminder')!;
  const tool = def.create({ userId, agentId: 'ferni' } as ToolContext) as unknown as {
    execute: (a: object, o: unknown) => Promise<string>;
  };
  return tool.execute({ message: 'take the bread out', when: 'in 30 minutes', ...args }, {});
}

const stored = (userId: string) =>
  state.rows.filter((r) => r.collection === 'reminders' && r.userId === userId).map((r) => r.data);

const soon = () => new Date(Date.now() + 31 * 60_000);

beforeEach(() => {
  state.rows = [];
  state.users = {};
  state.texts = [];
});
afterEach(() => {
  delete process.env.ASSISTANT_ACTIONS_REAL;
});

describe('flag on', () => {
  beforeEach(() => {
    process.env.ASSISTANT_ACTIONS_REAL = 'on';
  });

  it('a phone-first user is texted at their own number, never one the model passes', async () => {
    state.users[PHONE_USER] = {};
    const reply = await setReminder(PHONE_USER, {
      deliveryMethod: 'sms',
      deliveryAddress: '+19998887777',
    });
    expect(reply).toMatch(/I'll text you/);
    expect(stored(PHONE_USER)).toEqual([
      expect.objectContaining({ deliveryMethod: 'sms', deliveryAddress: '+15551234567' }),
    ]);

    const run = await deliverDueReminders({ now: soon() });
    expect(run).toMatchObject({ delivered: 1, rerouted: 0 });
    expect(state.texts).toEqual([{ to: '+15551234567', message: 'take the bread out' }]);
  });

  it('a phone-first user is texted even when they just said "remind me"', async () => {
    const reply = await setReminder(PHONE_USER, {});
    expect(reply).toMatch(/I'll text you/);
    expect(stored(PHONE_USER)[0]).toMatchObject({ deliveryMethod: 'sms' });
  });

  it('asking for a text with no verified number says so and stores nothing', async () => {
    // contactInfo.phone is model-written, so it is not a verified number.
    state.users[WEB_USER] = { contactInfo: { phone: '+15550000000' } };
    const reply = await setReminder(WEB_USER, { deliveryMethod: 'sms' });
    expect(reply).toBe(NO_NUMBER_TO_TEXT);
    expect(stored(WEB_USER)).toEqual([]);
  });

  it('a web user who has not turned texts on gets it in the app, and is told so', async () => {
    state.users[WEB_USER] = { linkedIdentifiers: ['phone:+15557654321'] };
    const reply = await setReminder(WEB_USER, {});
    expect(reply).toMatch(/I'll remind you in the app/);
    expect(stored(WEB_USER)[0]).toMatchObject({
      deliveryMethod: 'voice_message',
      deliveryAddress: `voice:${WEB_USER}`,
    });
  });

  it('a web user who turned texts on is texted at their linked number', async () => {
    state.users[WEB_USER] = {
      linkedIdentifiers: ['auth:google:x', 'phone:+15557654321'],
      outreachPreferences: { enabled: true, channels: ['sms'] },
    };
    await setReminder(WEB_USER, {});
    expect(stored(WEB_USER)[0]).toMatchObject({
      deliveryMethod: 'sms',
      deliveryAddress: '+15557654321',
    });
  });
});

describe('flag off (today)', () => {
  it("a web user's reminder goes in-app even with a linked phone, and nothing is texted", async () => {
    state.users[WEB_USER] = {
      linkedIdentifiers: ['phone:+15557654321'],
      outreachPreferences: { enabled: true, channels: ['sms'] },
    };
    const reply = await setReminder(WEB_USER, {});
    expect(reply).toMatch(/^Got it! I'll remind you in 30 minutes/);
    expect(stored(WEB_USER)[0]).toMatchObject({ deliveryMethod: 'voice_message' });
    const run = await deliverDueReminders({ now: soon() });
    expect(run).toMatchObject({ delivered: 1, rerouted: 1 });
    expect(state.texts).toEqual([]);
  });
});
