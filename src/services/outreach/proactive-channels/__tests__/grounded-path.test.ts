/**
 * Grounded check-ins end to end: the per-minute scheduler handler → the
 * proactive run → the pondering doc, the cited call's summary and the
 * caller's own turns → the planner → a note in the app and the outreach log.
 * Firestore is in memory; Firebase Auth and Twilio are stubbed at the SDK edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: string[] = [];

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// The cohort store (cohort-flags.ts) and the opt-out stores (opt-outs.ts) read the same
// in-memory Firestore; cohortReadFails breaks only the cohort collections.
let cohortReadFails = false;
const COHORT_COLLECTIONS = new Set(['feature_cohorts', 'feature_flag_overrides']);
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => {
    const db = pathFirestore(docs);
    return {
      ...db,
      collection: (name: string) => {
        if (cohortReadFails && COHORT_COLLECTIONS.has(name)) throw new Error('firestore down');
        return db.collection(name);
      },
    };
  },
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
// A working model that would turn the follow-up into a pre-event line.
vi.mock('../../../llm-utils.js', () => ({
  callLLM: vi.fn(async () => 'Good luck at the open mic on Wednesday! Feeling ready?'),
}));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { itemId } = await import('../pondered-triggers.js');

const SETH = 'seth-uid';
const U = `bogle_users/${SETH}`;
const SESSION_START = Date.parse('2026-10-11T20:00:00Z');
const CALL_END = Date.parse('2026-10-11T20:15:00Z');
// Wednesday 17:05 in New York: the evening of the demo.
const DEMO_EVENING = new Date('2026-10-14T21:05:00Z');
const DEMO_Q = 'How did the bluegrass demo go?';

function seed(followUps: Array<Record<string, unknown>>) {
  docs.set(U, {
    name: 'Seth Ford',
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(CALL_END).toISOString(),
    // Texts on and a verified phone: a grounded check-in still stays in the app.
    outreachPreferences: { channels: ['sms'] },
  });
  docs.set(`${U}/predictive_intelligence/pondering`, { followUps, thinkingOf: [] });
  docs.set(`${U}/summaries/s1`, {
    sessionId: `session-AJ_x-${SESSION_START}`,
    timestamp: new Date(CALL_END).toISOString(),
  });
  docs.set(`${U}/conversations/conv_${SESSION_START + 900}_ab`, { turnCount: 3 });
  const turns: Array<[string, string]> = [
    ['assistant', 'Any fun plans this week? Ferni loves a fiddle.'],
    ['user', "I'm playing the bluegrass demo at the open mic on Wednesday"],
    ['assistant', 'Stripe interview prep sounds intense.'],
  ];
  turns.forEach(([role, content], i) =>
    docs.set(`${U}/conversations/conv_${SESSION_START + 900}_ab/turns/t${i}`, { role, content })
  );
}
const notes = () => [...docs.entries()].filter(([p]) => p.startsWith(`${U}/pending_messages/`));
const log = (id: string) => docs.get(`${U}/proactive_outreach_log/grounded:${id}`);

async function run(): Promise<{ status: string; channel?: string; sourceId?: string }> {
  let body = '';
  const res = { writeHead: () => res, setHeader: () => undefined, end: (b: string) => (body = b) };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
  return (JSON.parse(body) as { proactive: { users: Array<{ status: string }> } }).proactive
    .users[0];
}

beforeEach(() => {
  // Phone-keyed opt-outs are read under this key; without it nothing is texted.
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  texts.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(DEMO_EVENING);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
  process.env.OUTREACH_PONDERED_NOTES = 'on';
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
  delete process.env.OUTREACH_PONDERED_NOTES;
  delete process.env.OUTREACH_GROUNDED_CHECKINS;
  delete process.env.COHORT_FLAGS;
  cohortReadFails = false;
});

describe('grounded check-ins', () => {
  it("asks about the demo the evening of it, in the app, citing the caller's words", async () => {
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    expect(notes()).toHaveLength(0);

    const result = await run();
    expect(result).toMatchObject({ status: 'sent', channel: 'in_app' });
    // The planned question as written: the model never rewrites it.
    expect(notes().map(([, d]) => d.text)).toEqual(['Hey Seth, how did the bluegrass demo go?']);
    expect(texts).toEqual([]);
    const id = itemId('s1', DEMO_Q);
    expect(log(id)).toMatchObject({
      kind: 'follow_up',
      channel: 'in_app',
      text: 'Hey Seth, how did the bluegrass demo go?',
      textSource: 'template',
      reason: `you said "I'm playing the bluegrass demo at the open mic on Wednesday" on 2026-10-11`,
    });
    // Once only.
    expect((await run()).status).toBe('idle');
    expect(notes()).toHaveLength(1);
  });

  it('sends nothing with OUTREACH_PONDERED_NOTES unset, though the grounded kill switch is on', async () => {
    delete process.env.OUTREACH_PONDERED_NOTES;
    process.env.OUTREACH_GROUNDED_CHECKINS = 'on'; // its default: not this feature's switch
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    expect((await run()).status).toBe('idle');
    expect(notes()).toHaveLength(0);
  });

  it("sends to a person whose own cohort flags turn it on, and not to anyone else's", async () => {
    delete process.env.OUTREACH_PONDERED_NOTES;
    process.env.COHORT_FLAGS = 'on';
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    docs.set('feature_cohorts/friends', {
      enabled: true,
      members: ['someone-else'],
      flags: { OUTREACH_PONDERED_NOTES: 'on' },
    });
    expect((await run()).status).toBe('idle');

    docs.set('feature_cohorts/friends', {
      enabled: true,
      members: ['someone-else', SETH],
      flags: { OUTREACH_PONDERED_NOTES: 'on' },
    });
    expect(await run()).toMatchObject({ status: 'sent', channel: 'in_app' });
    expect(notes()).toHaveLength(1);
  });

  it('sends to a person through their own override, too', async () => {
    delete process.env.OUTREACH_PONDERED_NOTES;
    process.env.COHORT_FLAGS = 'on';
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    docs.set(`feature_flag_overrides/${SETH}`, { flags: { OUTREACH_PONDERED_NOTES: 'on' } });
    expect(await run()).toMatchObject({ status: 'sent', channel: 'in_app' });
  });

  it("a failed flag read skips this minute's follow-ups, not the user's whole run", async () => {
    delete process.env.OUTREACH_PONDERED_NOTES;
    process.env.COHORT_FLAGS = 'on';
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    // A promise Ferni made after the call ("I'll check in about the move"): due today.
    docs.set(`${U}/ferni_commitments/p1`, {
      type: 'check_in',
      commitment: "I'll check in about the move",
      relatedTopic: 'the move',
      madeAt: new Date(DEMO_EVENING.getTime() - 20 * 3600_000).toISOString(),
      outcome: 'open',
    });
    cohortReadFails = true;
    expect(await run()).toMatchObject({ status: 'sent', sourceId: 'promise:p1' });
    expect(
      docs.get(`${U}/proactive_outreach_log/grounded:${itemId('s1', DEMO_Q)}`)
    ).toBeUndefined();
  });

  it('ignores a cohort flag unless COHORT_FLAGS is on', async () => {
    delete process.env.OUTREACH_PONDERED_NOTES;
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    docs.set(`feature_flag_overrides/${SETH}`, { flags: { OUTREACH_PONDERED_NOTES: 'on' } });
    expect((await run()).status).toBe('idle');
    expect(notes()).toHaveLength(0);
  });

  it('sends nothing before it is due', async () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    expect((await run()).status).toBe('idle');
  });

  // As logCrisisSignal writes it (human-transfer/index.ts), `daysAgo` days before the demo evening.
  function crisisSignal(id: string, daysAgo: number, signals: Record<string, unknown>) {
    const at = new Date(DEMO_EVENING.getTime() - daysAgo * 86_400_000).toISOString();
    docs.set(`${U}/crisis_signals/${id}`, { timestamp: at, signals, sessionId: 'session-x' });
  }

  it('sends nothing within the quiet window after a crisis-level signal', async () => {
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    crisisSignal('c1', 2, { suicidalIdeation: true, severity: 8 });
    expect((await run()).status).toBe('idle');
    expect(notes()).toHaveLength(0);
  });

  it('a minor signal, or a crisis before the window, does not hold it back', async () => {
    seed([{ text: DEMO_Q, when: '2026-10-14', basis: 's1' }]);
    crisisSignal('m1', 1, { anxietyDisorder: true, severity: 3 });
    crisisSignal('c-old', 20, { suicidalIdeation: true, severity: 8 });
    expect(await run()).toMatchObject({ status: 'sent', channel: 'in_app' });
    expect(notes()).toHaveLength(1);
  });

  it('sends nothing about what only Ferni said', async () => {
    seed([{ text: 'How did the Stripe interview go?', when: '2026-10-14', basis: 's1' }]);
    expect((await run()).status).toBe('idle');
    expect(notes()).toHaveLength(0);
  });
});
