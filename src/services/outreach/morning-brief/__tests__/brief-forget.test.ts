/**
 * "Forget that" in the morning brief (FORGET_EVERY_READER): a reminder or a task about a
 * forgotten topic is left out and the rest of the brief still goes; a forgotten task doesn't
 * take one of the three task places. Off, the brief is read as before. With no topic source at
 * all, no reminder or task is listed (fails closed). A check that throws costs only the reminders
 * and tasks: the calendar still goes. Firestore is in memory; fictional caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../proactive-channels/__tests__/path-firestore.js';

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  topics: ['Biscuit'] as string[] | null,
  checkBreaks: false,
}));

const standup = {
  id: 'standup',
  title: 'Team standup',
  startTime: new Date('2026-11-10T15:00:00Z'),
  endTime: new Date('2026-11-10T15:15:00Z'),
  isAllDay: false,
  status: 'confirmed',
};
vi.mock('../../../calendar/calendar-service.js', () => ({
  getEventsForDay: async () => [standup],
}));
vi.mock('../../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => pathFirestore(h.docs),
}));
vi.mock('../../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => h.topics,
}));
// The forget read itself throwing, past its own timeout and fallback.
vi.mock('../../../../memory/recall/forget-topics-source.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../memory/recall/forget-topics-source.js')>(); // prettier-ignore
  return {
    ...real,
    topicsWithin: (...args: Parameters<typeof real.topicsWithin>) =>
      h.checkBreaks ? Promise.reject(new Error('forget read broke')) : real.topicsWithin(...args),
  };
});

const { readDay } = await import('../default-deps.js');
const { resetForgetTopicsSource } =
  await import('../../../../memory/recall/forget-topics-source.js');

const USER = 'member-brief-forget';
const NOW = new Date('2026-11-10T13:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600_000).toISOString();

const TASKS = [
  { id: 't1', title: 'Pick up Biscuit from the groomer', status: 'pending', dueDate: at(1) },
  { id: 't2', title: 'Pack boxes for Denver', status: 'pending', dueDate: at(2) },
  { id: 't3', title: 'Renew the library card', status: 'pending', dueDate: at(3) },
  { id: 't4', title: 'Water the ferns', status: 'pending', dueDate: at(4) },
];

function seed(): void {
  const root = `bogle_users/${USER}/reminders`;
  h.docs.set(`${root}/r1`, { status: 'pending', scheduledFor: at(2), message: 'Give Biscuit his pills' }); // prettier-ignore
  h.docs.set(`${root}/r2`, { status: 'pending', scheduledFor: at(3), message: 'Call the Denver landlord' }); // prettier-ignore
}

const brief = (flag: 'on' | 'off') =>
  readDay(USER, { productivityData: { tasks: TASKS } }, 'Etc/UTC', NOW, {
    FORGET_EVERY_READER: flag,
  });

beforeEach(() => {
  h.docs.clear();
  h.topics = ['Biscuit'];
  h.checkBreaks = false;
  resetForgetTopicsSource();
  seed();
});

describe('morning brief, FORGET_EVERY_READER on', () => {
  it('leaves out the reminder and task about a forgotten topic; the rest still go', async () => {
    const day = await brief('on');
    expect(day.reminders).toEqual(['Call the Denver landlord']);
    // The forgotten task gives its place to the fourth.
    expect(day.tasks).toEqual(['Pack boxes for Denver', 'Renew the library card', 'Water the ferns']); // prettier-ignore
    expect(day.refs?.reminders.map((r) => r?.ref)).toEqual(['r2']);
    expect(day.refs?.tasks.map((r) => r?.ref)).toEqual(['t2', 't3', 't4']);
  });

  it('with no topic source at all, lists no reminder or task (fails closed)', async () => {
    h.topics = null;
    const day = await brief('on');
    expect(day.reminders).toEqual([]);
    expect(day.tasks).toEqual([]);
  });

  it('when the check itself throws, leaves out reminders and tasks; the calendar still goes', async () => {
    h.checkBreaks = true;
    const day = await brief('on');
    expect(day.events.map((e) => e.title)).toEqual(['Team standup']);
    expect(day.reminders).toEqual([]);
    expect(day.tasks).toEqual([]);
  });
});

describe('morning brief, FORGET_EVERY_READER off', () => {
  it('reads every reminder and the first three tasks, as before', async () => {
    const day = await brief('off');
    expect(day.reminders).toEqual(['Give Biscuit his pills', 'Call the Denver landlord']);
    expect(day.tasks).toEqual([
      'Pick up Biscuit from the groomer',
      'Pack boxes for Denver',
      'Renew the library card',
    ]);
  });

  it('a broken forget read changes nothing', async () => {
    h.checkBreaks = true;
    const day = await brief('off');
    expect(day.events.map((e) => e.title)).toEqual(['Team standup']);
    expect(day.reminders).toEqual(['Give Biscuit his pills', 'Call the Denver landlord']);
  });
});
