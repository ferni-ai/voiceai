/**
 * REMINDER_SMS_DEFAULT=on: a reminder the user asks to get by text is stored
 * for the verified number on their account (never a number the model passes)
 * and delivered through the guarded sender, so STOP and quiet hours hold it.
 * No verified number: it stays in the app and Ferni says so. Off: unchanged.
 *
 * Runs setReminder → createReminder → Firestore → the deliver-reminders job →
 * reminder-texts → sendGuardedText, with only the outside world stubbed:
 * Firestore (in memory), the guarded sender's store and Twilio, the legacy
 * SMS sender, calendar sync and the promise ledger.
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
  /** Through the old, unguarded sendReminder. */
  legacyTexts: [] as Array<{ to: string; message: string }>,
  /** Through the guarded sender's Twilio send. */
  guarded: [] as Array<{ to: string; body: string }>,
  optedOut: false,
  /** The guarded sender's clock: noon in New York unless a test moves it. */
  now: new Date('2026-10-14T16:00:00.000Z'),
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
vi.mock('../services/outreach/guarded-text.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/outreach/guarded-text.js')>();
  return {
    ...real,
    defaultTextDeps: () => ({
      env: { LOG_HASH_SECRET: 'test-secret' },
      store: {
        forUser: async () => [],
        add: async () => 'rec-1',
        sponsoredPhone: async () => undefined,
        userDoc: async (uid: string) => state.users[uid],
        legacySmsChannels: async () => undefined,
        forPhoneHash: async () => [],
        isOptedOut: async () => state.optedOut,
      },
      authPhone: async () => undefined,
      send: async (m: { to: string; body: string }) => {
        state.guarded.push({ to: m.to, body: m.body });
        return { success: true, messageId: 'SM1' };
      },
      now: () => state.now,
    }),
  };
});
vi.mock('../services/communication-service.js', () => ({
  sendReminder: async (to: string, message: string) => {
    state.legacyTexts.push({ to, message });
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
import { KEPT_IN_APP_NO_NUMBER } from '../tools/domains/productivity/reminders.js';
import { deliverDueReminders as runJob } from '../services/scheduling/reminder-delivery-job.js';
import { reminderTextSender } from '../services/outreach/reminder-texts.js';
import type { ToolContext } from '../tools/registry/types.js';

const WEB_USER = 'web-user-1';
const VERIFIED = '+15557654321';
const MODEL_NUMBER = '+19998887777';

async function setReminder(args: Record<string, unknown>): Promise<string> {
  const def = (await getToolDefinitions()).find((d) => d.id === 'setReminder')!;
  const tool = def.create({ userId: WEB_USER, agentId: 'ferni' } as ToolContext) as unknown as {
    execute: (a: object, o: unknown) => Promise<string>;
  };
  return tool.execute({ message: 'take the bread out', when: 'in 30 minutes', ...args }, {});
}

const stored = () =>
  state.rows
    .filter((r) => r.collection === 'reminders' && r.userId === WEB_USER)
    .map((r) => r.data);
const soon = () => new Date(Date.now() + 31 * 60_000);
/** The job as its route runs it (reminder-jobs.ts): the guarded sender only when the flag is on. */
const deliverDueReminders = (opts: { now: Date }) =>
  runJob({ ...opts, textOwnReminder: reminderTextSender() });

beforeEach(() => {
  state.rows = [];
  state.users = { [WEB_USER]: { linkedIdentifiers: [`phone:${VERIFIED}`] } };
  state.legacyTexts = [];
  state.guarded = [];
  state.optedOut = false;
  state.now = new Date('2026-10-14T16:00:00.000Z');
});
afterEach(() => {
  delete process.env.REMINDER_SMS_DEFAULT;
});

describe('REMINDER_SMS_DEFAULT on', () => {
  beforeEach(() => {
    process.env.REMINDER_SMS_DEFAULT = 'on';
  });

  it('a text reminder is stored for the verified phone, never the number the model passes', async () => {
    const reply = await setReminder({ deliveryMethod: 'sms', deliveryAddress: MODEL_NUMBER });
    expect(reply).toMatch(/sent by text\./);
    expect(stored()).toEqual([
      expect.objectContaining({ deliveryMethod: 'sms', deliveryAddress: VERIFIED }),
    ]);
  });

  it('it is delivered through the guarded sender, not the old one', async () => {
    await setReminder({ deliveryMethod: 'sms' });
    const run = await deliverDueReminders({ now: soon() });
    expect(run).toMatchObject({ delivered: 1, rerouted: 0 });
    expect(state.guarded).toEqual([
      { to: VERIFIED, body: "It's Ferni. You asked me to remind you: take the bread out" },
    ]);
    expect(state.legacyTexts).toEqual([]);
  });

  it('after STOP it is not texted, and goes to the app instead', async () => {
    await setReminder({ deliveryMethod: 'sms' });
    state.optedOut = true;
    const run = await deliverDueReminders({ now: soon() });
    expect(run).toMatchObject({ delivered: 1, rerouted: 1 });
    expect(state.guarded).toEqual([]);
    expect(state.legacyTexts).toEqual([]);
  });

  it('in quiet hours it is not texted, and goes to the app instead', async () => {
    await setReminder({ deliveryMethod: 'sms' });
    state.now = new Date('2026-10-14T07:00:00.000Z'); // 3 AM in New York
    stored()[0].timezone = 'America/New_York';
    const run = await deliverDueReminders({ now: soon() });
    expect(run).toMatchObject({ delivered: 1, rerouted: 1 });
    expect(state.guarded).toEqual([]);
  });

  it('with no verified phone it stays in the app and says so honestly', async () => {
    // contactInfo.phone is model-written, so it is not a verified number.
    state.users[WEB_USER] = { contactInfo: { phone: MODEL_NUMBER } };
    const reply = await setReminder({ deliveryMethod: 'sms', deliveryAddress: MODEL_NUMBER });
    expect(reply).toMatch(/sent as a message in the Ferni app\./);
    expect(reply).toContain(KEPT_IN_APP_NO_NUMBER);
    expect(stored()).toEqual([
      expect.objectContaining({
        deliveryMethod: 'voice_message',
        deliveryAddress: `voice:${WEB_USER}`,
      }),
    ]);
  });

  it('a text reminder to someone else (already said yes to) is not redirected to the owner', async () => {
    await setReminder({ deliveryMethod: 'sms' });
    stored()[0].deliveryAddress = MODEL_NUMBER;
    await deliverDueReminders({ now: soon() });
    expect(state.guarded).toEqual([]);
    expect(state.legacyTexts).toEqual([{ to: MODEL_NUMBER, message: 'take the bread out' }]);
  });
});

describe('REMINDER_SMS_DEFAULT off (today)', () => {
  it('an sms reminder with no address still asks for a number, and nothing is texted', async () => {
    const reply = await setReminder({ deliveryMethod: 'sms' });
    expect(reply).toBe('I need a phone number to send the reminder. What should I use?');
    expect(stored()).toEqual([]);
  });

  it('an in-app reminder is unchanged', async () => {
    const reply = await setReminder({});
    expect(reply).toMatch(/sent as a message in the Ferni app\./);
    expect(reply).not.toContain(KEPT_IN_APP_NO_NUMBER);
    await deliverDueReminders({ now: soon() });
    expect(state.guarded).toEqual([]);
    expect(state.legacyTexts).toEqual([]);
  });
});
