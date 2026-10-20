/**
 * Pondered notes for a cohort, end to end through both scheduler handlers:
 * /api/jobs/pondering (ponder-job.ts) thinks over a cohort member's last call
 * and writes their pondering doc, then the per-minute
 * /api/jobs/deliver-scheduled-actions run (proactive-tick.ts) sends its
 * follow-up as a note in the app. The member's cohort turns on
 * OUTREACH_PONDERED_NOTES and not PROACTIVE_CHANNELS, so the note is all they
 * get. Firestore is in memory; Firebase Auth, Twilio and the model are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: string[] = [];

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// The pondering job and the cohort store (cohort-flags.ts) read through the utils module.
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
vi.mock('../../../communication-service.js', () => ({
  sendSMS: vi.fn(async (_to: string, body: string) => void texts.push(body)),
}));
// The pondering pass's answer, citing the latest call.
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

const MEMBER = 'member-uid';
const OUTSIDER = 'outsider-uid';
const SESSION_START = Date.parse('2026-10-11T20:00:00Z');
const CALL_END = Date.parse('2026-10-11T20:15:00Z');
/** 05:30 in New York: past every caller's night slot (02:00 to 05:00). */
const NIGHT_AFTER = new Date('2026-10-12T09:30:00Z');
/** Wednesday 17:05 in New York: the evening of the demo. */
const DEMO_EVENING = new Date('2026-10-14T21:05:00Z');

/** A caller with two real calls; in the latest they said they're playing the demo Wednesday. */
function seedCaller(uid: string) {
  const u = `bogle_users/${uid}`;
  docs.set(u, {
    name: 'Sam Tester',
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(CALL_END).toISOString(),
    // Texts on and a verified phone: a pondered note still stays in the app.
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

function cohort(flags: Record<string, string>) {
  docs.set('feature_cohorts/friends-and-family', { enabled: true, members: [MEMBER], flags });
}

const respond = () => {
  let body = '';
  const res = { writeHead: () => res, setHeader: () => undefined, end: (b: string) => (body = b) };
  return { res: res as never, body: () => JSON.parse(body) as Record<string, unknown> };
};

/** The hourly pondering poll, at `at`. */
async function ponderAt(at: Date): Promise<Record<string, unknown>> {
  vi.setSystemTime(at);
  const r = respond();
  await handlePondering(r.res);
  return r.body();
}

/** The per-minute run at `at`: who it handled and how. */
async function deliverAt(
  at: Date
): Promise<Array<{ userId: string; status: string; channel?: string }>> {
  vi.setSystemTime(at);
  forgetFlagCache();
  const r = respond();
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    r.res
  );
  const out = r.body() as { proactive?: { users: Array<{ userId: string; status: string }> } };
  return out.proactive?.users ?? [];
}

const pondering = (uid: string) => docs.get(`bogle_users/${uid}/predictive_intelligence/pondering`);
const notes = (uid: string) =>
  [...docs.entries()]
    .filter(([p]) => p.startsWith(`bogle_users/${uid}/pending_messages/`))
    .map(([, d]) => d.text);

beforeEach(() => {
  docs.clear();
  texts.length = 0;
  vi.mocked(callLLM).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  // The web server's env in prod (deploy-production.yml): no allowlist, no global notes flag.
  vi.stubEnv('PONDERING', 'on');
  vi.stubEnv('COHORT_FLAGS', 'on');
  vi.stubEnv('PROACTIVE_CHANNELS', 'on');
  vi.stubEnv('PROACTIVE_CHANNELS_USERS', '');
  vi.stubEnv('OUTREACH_PONDERED_NOTES', '');
  vi.stubEnv('PONDERING_USERS', '');
  seedCaller(MEMBER);
  seedCaller(OUTSIDER);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  forgetFlagCache();
});

describe('pondered notes for a cohort', () => {
  it('ponders a cohort member and sends the follow-up as a note in the app, and nothing else', async () => {
    cohort({ OUTREACH_PONDERED_NOTES: 'on' });
    expect(pondering(MEMBER)).toBeUndefined();

    const polled = await ponderAt(NIGHT_AFTER);
    expect(polled).toMatchObject({ success: true, stats: { status: 'ran', cohort: 1, stored: 1 } });
    expect(pondering(MEMBER)).toMatchObject({
      followUps: [{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }],
    });

    // A promise Ferni made is due too, but this member gets only pondered notes.
    docs.set(`bogle_users/${MEMBER}/ferni_commitments/p1`, {
      type: 'check_in',
      commitment: "I'll check in about the move",
      relatedTopic: 'the move',
      madeAt: new Date(DEMO_EVENING.getTime() - 20 * 3600_000).toISOString(),
      outcome: 'open',
    });
    const users = await deliverAt(DEMO_EVENING);
    expect(users).toEqual([
      expect.objectContaining({ userId: MEMBER, status: 'sent', channel: 'in_app' }),
    ]);
    expect(notes(MEMBER)).toEqual(['Hey Sam, how did the bluegrass demo go?']);
    expect(texts).toEqual([]);
    // Once only: the next minute has nothing for them.
    expect(await deliverAt(new Date(DEMO_EVENING.getTime() + 60_000))).toEqual([
      expect.objectContaining({ userId: MEMBER, status: 'idle' }),
    ]);
  });

  it('never ponders or notes a caller outside the cohort', async () => {
    cohort({ OUTREACH_PONDERED_NOTES: 'on' });
    expect(await ponderAt(NIGHT_AFTER)).toMatchObject({ stats: { cohort: 1, stored: 1 } });
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(pondering(OUTSIDER)).toBeUndefined();
    // Even with a pondering doc in place, they are not in the run.
    docs.set(`bogle_users/${OUTSIDER}/predictive_intelligence/pondering`, {
      followUps: [{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }],
    });
    const users = await deliverAt(DEMO_EVENING);
    expect(users.map((u) => u.userId)).toEqual([MEMBER]);
    expect(pondering(MEMBER)).toBeDefined();
    expect(notes(OUTSIDER)).toEqual([]);
    expect(
      [...docs.keys()].filter((p) =>
        p.startsWith(`bogle_users/${OUTSIDER}/proactive_outreach_log/`)
      )
    ).toEqual([]);
  });

  it('with PONDERING off, ponders nobody, calls no model and sends nothing', async () => {
    vi.stubEnv('PONDERING', '');
    cohort({ OUTREACH_PONDERED_NOTES: 'on' });
    expect(await ponderAt(NIGHT_AFTER)).toMatchObject({ stats: { status: 'off', cohort: 0 } });
    expect(callLLM).not.toHaveBeenCalled();
    expect(pondering(MEMBER)).toBeUndefined();
    expect((await deliverAt(DEMO_EVENING)).filter((u) => u.status === 'sent')).toEqual([]);
    expect(notes(MEMBER)).toEqual([]);
  });

  it('without OUTREACH_PONDERED_NOTES on their cohort, the pondering stays unsent', async () => {
    cohort({});
    await ponderAt(NIGHT_AFTER);
    expect(pondering(MEMBER)).toBeDefined();
    expect(await deliverAt(DEMO_EVENING)).toEqual([]);
    expect(notes(MEMBER)).toEqual([]);
  });

  it('with PROACTIVE_CHANNELS off on the server, the run sends nothing', async () => {
    cohort({ OUTREACH_PONDERED_NOTES: 'on' });
    await ponderAt(NIGHT_AFTER);
    vi.stubEnv('PROACTIVE_CHANNELS', '');
    expect(await deliverAt(DEMO_EVENING)).toEqual([]);
    expect(notes(MEMBER)).toEqual([]);
  });
});
