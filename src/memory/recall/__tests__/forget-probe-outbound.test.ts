/**
 * Forget probe, outbound and third-party readers: what Ferni texts the caller, or says in a call
 * to someone else, with "Biscuit" forgotten. Each real reader runs over an in-memory Firestore
 * holding one Biscuit memory and one Denver memory; forget-probe-kit.ts holds the expectation,
 * read from the reader's registry row (forget-readers.ts). Fictional caller and contact only.
 */
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { createNestedFirestore } from '../../../tests/helpers/nested-firestore.js';
import { expectProbe } from './forget-probe-kit.js';

const h = vi.hoisted(() => ({
  topics: ['Biscuit'] as string[] | null,
  crafted: [] as unknown[],
  calls: [] as unknown[],
  fs: undefined as unknown as ReturnType<typeof createNestedFirestore>,
}));

vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: async () => h.topics,
}));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => h.fs.db }));
vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => h.fs.db,
}));
vi.mock('../../../services/human-transfer/crisis-signals.js', async (original) => ({
  ...(await original<typeof import('../../../services/human-transfer/crisis-signals.js')>()),
  hadCrisisWithin: async () => false,
}));
vi.mock('../../../services/platform/cohort-flags.js', async (original) => ({
  ...(await original<typeof import('../../../services/platform/cohort-flags.js')>()),
  flagForUser: async () => undefined,
}));
vi.mock('../../../services/calendar/calendar-service.js', () => ({
  getEventsForDay: async () => [],
}));
vi.mock('../../../services/contacts/contact-relationship-service.js', async (original) => ({
  ...(await original<
    typeof import('../../../services/contacts/contact-relationship-service.js')
  >()),
  searchContacts: async () => [
    {
      id: 'contact-ana',
      userId: 'member-probe',
      contactId: 'contact-ana',
      name: 'Ana',
      phone: '5550142',
      topics: [{ topic: 'Biscuit the dog is sick' }, { topic: 'the move to Denver' }],
      recentContext: [],
      interactionCount: 3,
      firstInteraction: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
  ],
  recordInteraction: async () => undefined,
}));
vi.mock('../../../tools/domains/communication/outreach/message-crafting.js', () => ({
  craftPersonalizedMessage: async (input: { recentTopics: string[] }) => {
    h.crafted.push(input);
    return `Hi Ana, thinking of you: ${input.recentTopics.join('; ')}`;
  },
}));
vi.mock('../../../services/outreach/conversational-calls.js', () => ({
  makeConversationalCall: async (ctx: unknown) => {
    h.calls.push(ctx);
    return { status: 'initiating' };
  },
}));
vi.mock('../../../utils/consent-port.js', async (original) => ({
  ...(await original<typeof import('../../../utils/consent-port.js')>()),
  thirdPartyRefusal: async () => null,
}));

import { collectTriggers } from '../../../services/outreach/proactive-channels/triggers.js';
import { readDay } from '../../../services/outreach/morning-brief/default-deps.js';
import { createUnifiedOutreachTool } from '../../../tools/domains/communication/outreach/unified-outreach.js';

const USER = 'member-probe';
const NOW = new Date('2026-11-10T19:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const root = `bogle_users/${USER}`;

beforeEach(() => {
  h.fs = createNestedFirestore();
  h.topics = ['Biscuit'];
  h.crafted = [];
  h.calls = [];
});
afterEach(() => vi.unstubAllEnvs());

describe.each([true, false])('outbound readers, FORGET_EVERY_READER %s', (flagOn) => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', flagOn ? 'on' : 'off'));

  it("'thirdParty.outreachTopics': what Ferni says in a call to a contact", async () => {
    const tool = createUnifiedOutreachTool({
      userId: USER,
      agentId: 'ferni',
    } as never) as unknown as {
      execute: (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;
    };
    await tool.execute(
      { contact: 'Ana', purpose: 'see how she is doing', preferredChannel: 'conversation' },
      {}
    );
    const said = JSON.stringify([h.crafted, h.calls]);
    expectProbe('thirdParty.outreachTopics', said, flagOn);
  });

  it("'outbound.promiseTriggers': the \"I said I'd check in about X\" text", async () => {
    const madeAt = new Date(NOW.getTime() - 2 * DAY).toISOString();
    const promise = { type: 'check_in', outcome: 'open', madeAt, commitment: 'check in' };
    h.fs.store.set(`${root}/ferni_commitments/p1`, { ...promise, relatedTopic: "Biscuit's vet visit" }); // prettier-ignore
    h.fs.store.set(`${root}/ferni_commitments/p2`, { ...promise, relatedTopic: 'the Denver move' });
    const triggers = await collectTriggers(USER, { now: NOW, localHour: 15 });
    const said = triggers
      .filter((t) => t.kind === 'promise')
      .map((t) => t.text)
      .join('\n');
    expectProbe('outbound.promiseTriggers', said, flagOn);
  });

  it("'outbound.reminderTriggers': the missed-reminder own-up text", async () => {
    const at = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    h.fs.store.set(`${root}/reminders/r1`, { status: 'missed', scheduledFor: at, message: 'Call the vet about Biscuit' }); // prettier-ignore
    h.fs.store.set(`${root}/reminders/r2`, { status: 'missed', scheduledFor: at, message: 'Book movers for Denver' }); // prettier-ignore
    const triggers = await collectTriggers(USER, { now: NOW, localHour: 15 });
    const said = triggers
      .filter((t) => t.kind === 'reminder')
      .map((t) => t.text)
      .join('\n');
    expectProbe('outbound.reminderTriggers', said, flagOn);
  });

  it("'outbound.briefReminders': reminders in the morning brief", async () => {
    const at = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString();
    h.fs.store.set(`${root}/reminders/r1`, { status: 'pending', scheduledFor: at, message: 'Give Biscuit his pills' }); // prettier-ignore
    h.fs.store.set(`${root}/reminders/r2`, { status: 'pending', scheduledFor: at, message: 'Call the Denver landlord' }); // prettier-ignore
    const day = await readDay(USER, {}, 'Etc/UTC', NOW, { FORGET_EVERY_READER: flagOn ? 'on' : 'off' }); // prettier-ignore
    expectProbe('outbound.briefReminders', day.reminders.join('\n'), flagOn);
  });

  it("'outbound.briefTasks': tasks in the morning brief", async () => {
    const tasks = [
      { title: 'Pick up Biscuit from the groomer', status: 'pending' },
      { title: 'Pack boxes for Denver', status: 'pending' },
    ];
    const user = { productivityData: { tasks } };
    const day = await readDay(USER, user, 'Etc/UTC', NOW, { FORGET_EVERY_READER: flagOn ? 'on' : 'off' }); // prettier-ignore
    expectProbe('outbound.briefTasks', day.tasks.join('\n'), flagOn);
  });
});
