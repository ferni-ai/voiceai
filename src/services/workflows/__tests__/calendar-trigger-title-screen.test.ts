/**
 * #3349: an invite's title is whatever its sender typed. With OWNER_OUTREACH_STORED_TEXT_SCREEN
 * on, the pre-meeting push (15 minutes before) runs the title, the attendee's name and the past
 * topics through the owner-outreach screen (storedTextForOwner): a refused title gives a neutral
 * line, a refused name drops the "Meeting with" line, a refused past topic is dropped. Off, the
 * push reads exactly as on main. No log line carries the title, flag on or off.
 * Runs through runCalendarTriggerCheck with only the stores and push sending faked; all data is
 * fictional (555-01xx numbers, made-up names).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as string[]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record = (level: string) => (...args: unknown[]) => void logged.push(`${level} ${JSON.stringify(args)}`); // prettier-ignore
  const capture = (): import('../../../utils/safe-logger.js').FallbackLogger => ({
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child: () => capture(),
  });
  return { ...real, createLogger: capture, getLogger: capture, safeLog: capture, default: capture };
});

const query = () => {
  const q = { where: () => q, get: async () => ({ docs: [], size: 0, empty: true }) };
  return q;
};
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({ collectionGroup: query, collection: query }),
}));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collectionGroup = query;
  },
}));
vi.mock('../../outreach/unified-delivery.js', () => ({
  getChannelStatus: async () => ({ push: { available: true } }),
}));
vi.mock('../../identity/google-calendar-token-store.js', () => ({
  listTokenUsers: async () => ['owner-uid'],
}));
vi.mock('../../stores/workflow-store.js', () => ({ getActiveWorkflows: async () => [] }));

const NOW = new Date('2026-11-23T15:00:00Z');
const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * 60_000);
interface FakeEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
}
let events: FakeEvent[] = [];
vi.mock('../../calendar/unified-calendar-store.js', () => ({ getEvents: async () => events }));
let briefing: unknown = null;
vi.mock('../../calendar/meeting-memory-service.js', () => ({
  enrichPreMeetingBriefing: async () => briefing,
}));
const sendNotification = vi.fn(async (_userId: string, _payload: unknown) => true);
vi.mock('../../push-notifications.js', () => ({
  getPushNotificationsService: () => ({ sendNotification }),
}));

const { runCalendarTriggerCheck } = await import('../calendar-trigger-worker.js');

const PHISH = 'Your account is locked, call 555-0100 now';
const PHISH_TOPIC = 'text them the verification code';
const PHISH_NAME = 'Text me your bank PIN';
let eventN = 0;
const inFifteen = (title: string): FakeEvent => ({
  id: `evt-${++eventN}`,
  title,
  startTime: at(15),
  endTime: at(45),
});
const met = (name: string, pastTopics: string[]) => ({
  relationshipContext: [{ displayName: name, attendeeEmail: 'jordan@example.com' }],
  pastTopics,
});

/** The one push the check sent: its title and body. */
async function push(screen: string | undefined): Promise<{ title: unknown; body: unknown }> {
  if (screen) vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', screen);
  sendNotification.mockClear();
  await runCalendarTriggerCheck();
  expect(sendNotification).toHaveBeenCalledTimes(1);
  const payload = sendNotification.mock.calls[0][1] as { title: unknown; body: unknown };
  return { title: payload.title, body: payload.body };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logged.length = 0;
  briefing = null;
  delete process.env.OWNER_OUTREACH_STORED_TEXT_SCREEN;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('screen on: the pre-meeting push', () => {
  it('a scam invite title gives the neutral push, and the refusal names no title', async () => {
    events = [inFifteen(PHISH)];
    expect(await push('on')).toEqual({
      title: '📅 Meeting soon',
      body: 'You have a meeting in 15 minutes',
    });
    expect(logged.join('\n')).toContain('callback_scam');
  });

  it('an ordinary title goes through unchanged', async () => {
    events = [inFifteen('Dentist with Dr. Imani Okafor')];
    expect(await push('on')).toEqual({
      title: '📅 Dentist with Dr. Imani Okafor soon',
      body: 'Dentist with Dr. Imani Okafor starts in 15 minutes',
    });
  });

  it('a refused past topic is dropped; the next one is the hint', async () => {
    events = [inFifteen('Roadmap review')];
    briefing = met('Jordan Vale', [PHISH_TOPIC, 'the Q3 roadmap']);
    expect((await push('on')).body).toBe('Meeting with Jordan Vale in 15 min. Last time: the Q3 roadmap'); // prettier-ignore
  });

  it('a refused name drops the "Meeting with" line', async () => {
    events = [inFifteen('Roadmap review')];
    briefing = met(PHISH_NAME, ['the Q3 roadmap']);
    expect((await push('on')).body).toBe('Roadmap review starts in 15 minutes');
  });
});

describe('screen off or unset: the push reads exactly as on main', () => {
  it.each(['off', undefined])('OWNER_OUTREACH_STORED_TEXT_SCREEN=%s', async (screen) => {
    events = [inFifteen(PHISH)];
    expect(await push(screen)).toEqual({
      title: `📅 ${PHISH} soon`,
      body: `${PHISH} starts in 15 minutes`,
    });
    events = [inFifteen('')];
    expect(await push(screen)).toEqual({
      title: '📅 Meeting soon',
      body: 'Meeting starts in 15 minutes',
    });
    events = [inFifteen(PHISH)];
    briefing = met(PHISH_NAME, [PHISH_TOPIC, 'the Q3 roadmap']);
    expect(await push(screen)).toEqual({
      title: `📅 ${PHISH} soon`,
      body: `Meeting with ${PHISH_NAME} in 15 min. Last time: ${PHISH_TOPIC}`,
    });
  });
});

describe('logs carry the event id, never its title', () => {
  it.each(['on', 'off'])('screen %s: push, reminder, start and end lines', async (screen) => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', screen);
    const PRIVATE = 'Oncology follow-up with Dr. Okafor';
    events = [
      { id: `soon-${screen}`, title: PRIVATE, startTime: at(15), endTime: at(45) },
      { id: `now-${screen}`, title: PRIVATE, startTime: at(0.5), endTime: at(30) },
      { id: `done-${screen}`, title: PRIVATE, startTime: at(-31), endTime: at(-1) },
    ]; // ids differ per run: the worker sends and logs each trigger once
    await runCalendarTriggerCheck();
    for (const [what, id] of [
      ['Pre-meeting push notification sent', `soon-${screen}`],
      ['Calendar reminder triggered', `soon-${screen}`],
      ['Calendar event started trigger', `now-${screen}`],
      ['Calendar event ended trigger', `done-${screen}`],
    ]) {
      const line = logged.find((l) => l.includes(what) && l.includes(`"eventId":"${id}"`));
      expect(line, what).toBeDefined();
    }
    expect(logged.join('\n')).not.toContain(PRIVATE);
  });
});
