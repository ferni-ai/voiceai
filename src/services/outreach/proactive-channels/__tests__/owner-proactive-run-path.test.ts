/**
 * The owner's proactive run as prod had it on 2026-10-30: proactive check-ins,
 * pondered notes and pondering on through his own flag overrides only, no
 * allowlist, no global PONDERING, and no pondering job scheduled. Every
 * minute's run then found nothing to send and logged nothing at all. This pins
 * both halves: the run line explains a zero, and once the pondering poll runs,
 * the next minute sends the owner his note (and nobody else anything).
 * Firestore is in memory; Firebase Auth, Twilio and the model are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: string[] = [];
const runLines = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const logger = (): Record<string, unknown> => ({
    debug: vi.fn(),
    info: vi.fn((fields: Record<string, unknown>, msg?: string) => {
      if (typeof msg === 'string' && msg.endsWith('_RUN')) runLines.push({ ...fields, msg });
    }),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger(),
  });
  return {
    ...(await importOriginal<object>()),
    createLogger: logger,
    getLogger: logger,
    safeLog: logger,
  };
});
vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../../workflows/scheduled-actions.js', () => ({
  deliverDueScheduledActions: vi.fn(async () => ({ due: 0, delivered: 0 })),
}));
vi.mock('../../../data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: vi.fn(async () => undefined),
}));
vi.mock('../../../identity/firebase-auth.js', () => ({
  getFirebaseUser: vi.fn(async () => ({ phoneNumber: '+15555550123' })),
}));
vi.mock('../../delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ body }: { to: string; body: string }) => {
    texts.push(body);
    return { success: true, messageSid: 'SM1' };
  }),
}));
const DEMO_Q = 'How did the bluegrass demo go?';
vi.mock('../../../llm-utils.js', () => ({
  callLLM: vi.fn(async () =>
    JSON.stringify({
      followUps: [{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }],
      thinkingOf: [],
    })
  ),
}));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { handlePondering } = await import('../../../../api/scheduled-jobs/intelligence-jobs.js');
const { forgetFlagCache } = await import('../../../platform/cohort-flags.js');
const { callLLM } = await import('../../../llm-utils.js');

const OWNER = 'owner-uid';
const FAMILY = 'family-uid';
const SESSION_START = Date.parse('2026-10-11T20:00:00Z');
const CALL_END = Date.parse('2026-10-11T20:15:00Z');
/** 05:30 in New York: past every caller's night slot. */
const NIGHT_AFTER = new Date('2026-10-12T09:30:00Z');
/** Wednesday 17:05 in New York: the evening of the demo. */
const DEMO_EVENING = new Date('2026-10-14T21:05:00Z');

function seedCaller(uid: string) {
  const u = `bogle_users/${uid}`;
  docs.set(u, {
    name: 'Sam Tester',
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(CALL_END).toISOString(),
    outreachPreferences: { channels: ['sms'] },
  });
  docs.set(`${u}/summaries/s1`, {
    sessionId: `session-AJ_x-${SESSION_START}`,
    timestamp: new Date(CALL_END).toISOString(),
    mainTopics: ['bluegrass demo'],
    keyPoints: [
      'Sam is playing the bluegrass demo at the open mic on Wednesday',
      'Sam is nervous about the fiddle solo',
    ],
  });
  // Pondering needs more than one call to think over.
  docs.set(`${u}/summaries/s0`, {
    sessionId: 'session-AJ_y-1759860000000',
    timestamp: '2026-10-08T20:00:00.000Z',
    mainTopics: ['new job'],
    keyPoints: ['Sam started a new job at the library', 'Sam likes the new team'],
  });
  const conv = `${u}/conversations/conv_${SESSION_START + 900}_ab`;
  docs.set(conv, { turnCount: 2 });
  docs.set(`${conv}/turns/t0`, { role: 'assistant', content: 'Any fun plans this week?' });
  docs.set(`${conv}/turns/t1`, {
    role: 'user',
    content: "I'm playing the bluegrass demo at the open mic on Wednesday",
  });
}

const respond = () => {
  let body = '';
  const res = { writeHead: () => res, setHeader: () => undefined, end: (b: string) => (body = b) };
  return { res: res as never, body: () => JSON.parse(body) as Record<string, unknown> };
};

async function ponderAt(at: Date): Promise<void> {
  vi.setSystemTime(at);
  forgetFlagCache();
  await handlePondering(respond().res);
}

async function deliverAt(at: Date): Promise<void> {
  vi.setSystemTime(at);
  forgetFlagCache();
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    respond().res
  );
}

const lastRun = (msg: string) => runLines.filter((l) => l.msg === msg).at(-1);
const notes = (uid: string) =>
  [...docs.entries()]
    .filter(([p]) => p.startsWith(`bogle_users/${uid}/pending_messages/`))
    .map(([, d]) => d.text);

beforeEach(() => {
  docs.clear();
  texts.length = 0;
  runLines.length = 0;
  vi.mocked(callLLM).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('COHORT_FLAGS', 'on');
  // Phone-keyed opt-outs are read under this key; without it the run holds everything.
  vi.stubEnv('LOG_HASH_SECRET', 'test-hash-secret');
  vi.stubEnv('PROACTIVE_CHANNELS', 'on');
  vi.stubEnv('PROACTIVE_CHANNELS_USERS', '');
  vi.stubEnv('OUTREACH_PONDERED_NOTES', '');
  // Server PONDERING off: only people whose own flags turn it on are pondered.
  vi.stubEnv('PONDERING', '');
  vi.stubEnv('PONDERING_USERS', '');
  seedCaller(OWNER);
  seedCaller(FAMILY);
  docs.set(`feature_flag_overrides/${OWNER}`, {
    flags: { PROACTIVE_CHANNELS: 'on', OUTREACH_PONDERED_NOTES: 'on', PONDERING: 'on' },
  });
  // In a cohort, but with none of these flags: never pondered, noted or texted.
  docs.set('feature_cohorts/friends-and-family', { enabled: true, members: [FAMILY], flags: {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  forgetFlagCache();
});

describe("the owner's proactive run", () => {
  it('says why a minute sent nothing: one person looked at, no trigger, no world model', async () => {
    await deliverAt(DEMO_EVENING);
    expect(notes(OWNER)).toEqual([]);
    expect(lastRun('PROACTIVE_TICK_RUN')).toMatchObject({
      considered: 1,
      eligible: 0,
      sent: 0,
      skippedBy: { 'idle: no-trigger': 1 },
      worldModel: 'absent',
    });
  });

  it('once the pondering poll runs, the next minute sends the owner his note and nobody else anything', async () => {
    // Before: the prod state, no pondering doc, nothing to send.
    await deliverAt(DEMO_EVENING);
    expect(lastRun('PROACTIVE_TICK_RUN')).toMatchObject({ sent: 0 });

    await ponderAt(NIGHT_AFTER);
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(lastRun('PONDERING_RUN')).toMatchObject({ considered: 1, eligible: 1, sent: 1 });
    expect(docs.get(`bogle_users/${FAMILY}/predictive_intelligence/pondering`)).toBeUndefined();

    await deliverAt(new Date(DEMO_EVENING.getTime() + 60_000));
    expect(notes(OWNER)).toEqual(['Hey Sam, how did the bluegrass demo go?']);
    expect(lastRun('PROACTIVE_TICK_RUN')).toMatchObject({
      considered: 1,
      eligible: 1,
      sent: 1,
      skippedBy: {},
    });
    expect(notes(FAMILY)).toEqual([]);
    expect(texts).toEqual([]);

    // The minute after, the same note is not sent twice.
    await deliverAt(new Date(DEMO_EVENING.getTime() + 120_000));
    expect(notes(OWNER)).toHaveLength(1);
    expect(lastRun('PROACTIVE_TICK_RUN')).toMatchObject({ eligible: 0, sent: 0 });
  });

  it('logs a flag-off line when the server has PROACTIVE_CHANNELS off', async () => {
    vi.stubEnv('PROACTIVE_CHANNELS', '');
    await deliverAt(DEMO_EVENING);
    expect(lastRun('PROACTIVE_TICK_RUN')).toMatchObject({
      considered: 0,
      sent: 0,
      skippedBy: { 'flag-off': 1 },
    });
  });
});
