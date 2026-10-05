/**
 * Every way Ferni tells the user she'll do something later is a promise that
 * ends kept or missed, through the real tools and the real every-minute job
 * (Firestore and the SMS/email/call senders are the only fakes):
 * - the scheduling tools (text, call, email, best time) and the scheduling
 *   executor's text/call/email ("I'll text you on Monday…");
 * - Alex's scheduleCall ("I'll remind you 15 minutes before!");
 * - quick capture ("I'll remind you when the time comes");
 * - scheduleFollowUp ("I'll circle back tomorrow about…").
 *
 * Before: these set a reminder (or nothing) and recorded no promise, so none
 * of them could ever count for or against "I follow through".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedNestedFirestore as fs } from './helpers/nested-firestore.js';

vi.mock('firebase-admin/firestore', async () => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    getFirestore: () => sharedNestedFirestore.db,
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
  };
});
vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});
vi.mock('../services/superhuman/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../services/superhuman/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});
// External senders only: Twilio SMS, SendGrid email, the outbound call.
const sent = vi.fn(async (_to: string, _text: string) => 'Reminder sent');
vi.mock('../services/communication-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/communication-service.js')>()),
  sendReminder: (to: string, text: string) => sent(to, text),
  sendEmail: (to: string, _subject: string, text: string) => sent(to, text),
}));
vi.mock('../services/voice/voice-call.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/voice/voice-call.js')>()),
  callWithPersonaVoice: async (to: string, text: string) => {
    await sent(to, text);
    return { success: true, callSid: 'CA_test', message: 'calling' };
  },
}));
vi.mock('../services/outreach/unified-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/outreach/unified-delivery.js')>()),
  getChannelStatus: async () => ({
    sms: { available: true },
    voice_call: { available: true },
    email: { available: true },
    push: { available: false },
    in_app: { available: true },
  }),
}));
vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  return { ...actual, llm: { ...actual.llm, tool: <T>(config: T) => config } };
});

const scheduling = await import('../tools/domains/scheduling/index.js');
const { schedulingExecutor } =
  await import('../agents/shared/tool-executors/scheduling-executor.js');
const { createCommunicationTools } =
  await import('../tools/domains/communication/communication-tools.js');
const { quickCaptureDef } = await import('../tools/domains/simple-utilities/essentials-tools.js');
const { scheduleFollowUpDef } = await import('../tools/domains/proactive/index.js');
const { setUserContactInfo } = await import('../tools/domains/proactive/outreach/index.js');
const { deliverDueReminders } = await import('../services/scheduling/reminder-delivery-job.js');
const { trackFerniCommitments } =
  await import('../services/superhuman/semantic-intelligence/integration.js');
const { clearCommitmentCache } =
  await import('../services/superhuman/semantic-intelligence/ferni-commitments.js');

const UID = 'sam';
const PHONE = '+18015550123';
const START = new Date('2026-09-28T15:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ctx = { userId: UID, agentId: 'ferni' } as never;

type Exec = { execute: (params: Record<string, unknown>, opts?: unknown) => Promise<unknown> };
const promises = () => fs.docsIn(`bogle_users/${UID}/ferni_commitments`);

async function domainTool(id: string): Promise<Exec> {
  const defs = await scheduling.getToolDefinitions();
  return defs.find((d) => d.id === id)?.create(ctx) as unknown as Exec;
}

interface Path {
  name: string;
  make: () => Promise<unknown>;
  promise: RegExp;
}

const REMINDER_PATHS: Path[] = [
  {
    name: 'scheduling: text me later',
    make: async () =>
      (await domainTool('scheduleMessage')).execute({ message: 'stretch', when: 'in 2 hours' }),
    promise: /^I'll text you: stretch$/,
  },
  {
    name: 'scheduling: call me later',
    make: async () =>
      (await domainTool('scheduleCall')).execute({ message: 'wake up', when: 'in 2 hours' }),
    promise: /^I'll call you: wake up$/,
  },
  {
    name: 'scheduling: email me later',
    make: async () =>
      (await domainTool('scheduleEmail')).execute({
        subject: 'Renew passport',
        message: 'It expires in May',
        when: 'in 2 hours',
      }),
    promise: /^I'll email you: Renew passport$/,
  },
  {
    name: 'scheduling: at the best time',
    make: async () =>
      (await domainTool('scheduleAtBestTime')).execute({
        message: 'ask Sarah about dinner',
        contactName: 'Sarah',
        channel: 'text',
      }),
    promise: /^I'll text you: ask Sarah about dinner$/,
  },
  {
    name: 'executor: scheduleText',
    make: async () =>
      schedulingExecutor.execute(
        'scheduleText',
        { message: 'drink water', when: 'in 2 hours' },
        {
          userId: UID,
          personaId: 'ferni',
        }
      ),
    promise: /^I'll text you: drink water$/,
  },
  {
    name: 'executor: scheduleCall',
    make: async () =>
      schedulingExecutor.execute(
        'scheduleCall',
        { recipient: 'Mom', when: 'in 2 hours' },
        {
          userId: UID,
          personaId: 'ferni',
        }
      ),
    promise: /^I'll call you: Time to call Mom$/,
  },
  {
    name: 'executor: scheduleEmail',
    make: async () =>
      schedulingExecutor.execute(
        'scheduleEmail',
        { subject: 'Taxes', body: 'File them', when: 'in 2 hours' },
        { userId: UID, personaId: 'ferni' }
      ),
    promise: /^I'll email you: Taxes$/,
  },
  {
    name: "Alex's scheduleCall: remind me 15 minutes before",
    make: async () =>
      createCommunicationTools().scheduleCall.execute(
        { contact: 'Dr. Lee', purpose: 'test results', dateTime: 'in 3 hours', duration: 30 },
        { ctx: { userData: { userId: UID, userProfile: { contactInfo: { phone: PHONE } } } } }
      ),
    promise: /^I'll remind you: Call with Dr\. Lee in 15 minutes!/,
  },
  {
    name: 'quick capture: a reminder',
    make: async () =>
      (quickCaptureDef.create(ctx) as unknown as Exec).execute({
        thought: 'remind me to call the bank', // no time said: tomorrow at 9am
        urgency: 'soon',
      }),
    promise: /^I'll remind you: remind me to call the bank$/,
  },
];

/** The one promise made, and when its reminder is due. */
async function theReminderPromise(path: Path): Promise<{ id: string; due: Date }> {
  await path.make();
  const all = promises();
  expect(all).toHaveLength(1);
  const [p] = all;
  expect(p).toMatchObject({ type: 'remind', outcome: 'open', fulfilled: false });
  expect(String(p.commitment)).toMatch(path.promise);
  const reminder = fs.store.get(`bogle_users/${UID}/reminders/${String(p.reminderId)}`);
  return { id: String(p.id), due: new Date(String(reminder?.scheduledFor)) };
}

beforeEach(async () => {
  fs.store.clear();
  clearCommitmentCache();
  sent.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  await setUserContactInfo(UID, { phone: PHONE, email: 'sam@example.com', timezone: 'Etc/UTC' });
});

describe('every scheduled promise ends kept or missed', () => {
  it.each(REMINDER_PATHS)('$name: made → delivered → kept', async (path) => {
    const { id, due } = await theReminderPromise(path);

    const run = await deliverDueReminders({ now: new Date(due.getTime() + 60_000) });
    expect(run).toMatchObject({ delivered: 1, promiseErrors: 0 });
    expect(sent).toHaveBeenCalledTimes(path.name.startsWith('quick capture') ? 0 : 1);
    expect(promises()[0]).toMatchObject({ id, outcome: 'kept', fulfilled: true });
  });

  it.each(REMINDER_PATHS)('$name: past due and never sent → missed', async (path) => {
    const { id, due } = await theReminderPromise(path);

    // The job didn't run until three hours after: too late to send, so it's a miss.
    await deliverDueReminders({ now: new Date(due.getTime() + 3 * HOUR) });
    expect(sent).not.toHaveBeenCalled();
    expect(promises()[0]).toMatchObject({
      id,
      outcome: 'missed',
      violated: true,
      fulfilled: false,
    });
  });
});

describe('"I\'ll circle back tomorrow" (scheduleFollowUp) is a check-in promise', () => {
  const followUp = async () =>
    (scheduleFollowUpDef.create(ctx) as unknown as Exec).execute({
      topic: 'the job interview',
      when: 'tomorrow',
    });

  it('made → asked about in a later call → kept', async () => {
    expect(String(await followUp())).toMatch(/circle back tomorrow/);
    expect(promises()[0]).toMatchObject({
      type: 'check_in',
      outcome: 'open',
      commitment: "I'll check in about the job interview",
      dueBy: new Date(START.getTime() + 2 * DAY).toISOString(),
    });

    vi.setSystemTime(new Date(START.getTime() + DAY));
    await trackFerniCommitments(UID, 'Hey! How did the job interview go?', {});
    expect(promises()[0]).toMatchObject({ outcome: 'kept', fulfilled: true });
  });

  it('past due with no follow-up → missed', async () => {
    await followUp();
    const run = await deliverDueReminders({ now: new Date(START.getTime() + 2 * DAY + 60_000) });
    expect(run.promises).toMatchObject({ overdue: 1, missed: 1 });
    expect(promises()[0]).toMatchObject({ outcome: 'missed', violated: true });
  });
});

describe('scheduleAtBestTime says what it actually does', () => {
  it('reminds the user (not the contact), and says so in its description and reply', async () => {
    const def = (await scheduling.getToolDefinitions()).find((d) => d.id === 'scheduleAtBestTime');
    expect(def?.description).toMatch(/calls the user; she never messages the contact/);

    const tool = await domainTool('scheduleAtBestTime');
    const said = await tool.execute({ message: 'dinner?', contactName: 'Sarah', channel: 'text' });
    expect(String(said)).toMatch(/I'll text you on \*\*.+\*\* to reach out to Sarah/);
    // What it does today: one text, to the user's own number.
    expect(fs.docsIn(`bogle_users/${UID}/reminders`)).toEqual([
      expect.objectContaining({ deliveryMethod: 'sms', deliveryAddress: PHONE }),
    ]);
  });
});
