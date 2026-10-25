/**
 * Who the per-minute proactive run handles, and which number it texts, end to
 * end through the scheduler handler: the env allowlist plus people whose
 * cohort flags (feature_cohorts / feature_flag_overrides) turn
 * PROACTIVE_CHANNELS on, and the one verified-phone resolver (user-reach.ts).
 * Firestore is in memory; Firebase Auth, Twilio and the model are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const authUsers = new Map<string, { phoneNumber?: string }>();
const texts: Array<{ to: string; body: string }> = [];

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// The opt-out stores (opt-outs.ts) import the canonical module.
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// cohort-flags.ts reads Firestore through the utils module.
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
  getFirebaseUser: vi.fn(async (uid: string) => authUsers.get(uid) ?? null),
}));
// Proactive texts go through the guarded sender; Twilio is stubbed at its transport.
vi.mock('../../delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ to, body }: { to: string; body: string }) => {
    texts.push({ to, body });
    return { success: true, messageSid: 'SM1' };
  }),
}));
vi.mock('../../../llm-utils.js', () => ({ callLLM: vi.fn(async () => null) }));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { forgetFlagCache } = await import('../../../platform/cohort-flags.js');
const { isProactiveChannelsUser } = await import('../proactive-tick.js');

const LISTED = 'listed-uid';
const MINDY = 'cohort-uid';
const STRANGER = 'stranger-uid';
const AUTH_PHONE = '+15555550101';
const LINKED_PHONE = '+15555550102';
const MODEL_PHONE = '+15555550103';
const HOUR = 3600_000;
const NOW = new Date('2026-10-12T15:00:00Z'); // 11:00 in New York

function seedUser(uid: string, extra: Record<string, unknown> = {}) {
  docs.set(`bogle_users/${uid}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    outreachPreferences: { channels: ['sms'] },
    ...extra,
  });
  docs.set(`bogle_users/${uid}/ferni_commitments/p1`, {
    type: 'check_in',
    commitment: "I'll check in about the move",
    relatedTopic: 'the move',
    madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
    outcome: 'open',
  });
}
const override = (uid: string, value: 'on' | 'off') =>
  docs.set(`feature_flag_overrides/${uid}`, { flags: { PROACTIVE_CHANNELS: value } });

/** The user ids the run processed, or null when the run was off. */
async function processed(): Promise<string[] | null> {
  let body = '';
  const res = { writeHead: () => res, setHeader: () => undefined, end: (b: string) => (body = b) };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
  const out = JSON.parse(body) as { proactive?: { users: Array<{ userId: string }> } };
  return out.proactive ? out.proactive.users.map((u) => u.userId).sort() : null;
}

const ENV_KEYS = ['PROACTIVE_CHANNELS', 'PROACTIVE_CHANNELS_USERS', 'COHORT_FLAGS'];
beforeEach(() => {
  // Phone-keyed opt-outs are read under this key; without it nothing is texted.
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  authUsers.clear();
  texts.length = 0;
  forgetFlagCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.COHORT_FLAGS = 'on';
  for (const uid of [LISTED, MINDY, STRANGER]) seedUser(uid);
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('who the proactive run handles', () => {
  it('a person whose override turns PROACTIVE_CHANNELS on, and no one else', async () => {
    override(MINDY, 'on');
    expect(await processed()).toEqual([MINDY]);
    expect(await isProactiveChannelsUser(MINDY)).toBe(true);
    expect(await isProactiveChannelsUser(STRANGER)).toBe(false);
  });

  it('nobody while PROACTIVE_CHANNELS is off, override or not', async () => {
    delete process.env.PROACTIVE_CHANNELS;
    process.env.PROACTIVE_CHANNELS_USERS = LISTED;
    override(MINDY, 'on');
    expect(await processed()).toBeNull();
    expect(await isProactiveChannelsUser(MINDY)).toBe(false);
  });

  it("cohort members, unless their own override says 'off'", async () => {
    docs.set('feature_cohorts/friends', {
      enabled: true,
      members: [MINDY, STRANGER],
      flags: { PROACTIVE_CHANNELS: 'on' },
    });
    override(STRANGER, 'off');
    expect(await processed()).toEqual([MINDY]);
  });

  it('without COHORT_FLAGS, only the env allowlist', async () => {
    delete process.env.COHORT_FLAGS;
    process.env.PROACTIVE_CHANNELS_USERS = LISTED;
    override(MINDY, 'on');
    expect(await processed()).toEqual([LISTED]);
  });

  it('env-listed and cohort users together, each once', async () => {
    process.env.PROACTIVE_CHANNELS_USERS = `${LISTED},${MINDY}`;
    override(MINDY, 'on');
    expect(await processed()).toEqual([MINDY, LISTED].sort());
  });

  it('never writes the server env', async () => {
    override(MINDY, 'on');
    docs.set(`feature_flag_overrides/${MINDY}`, {
      flags: { PROACTIVE_CHANNELS: 'on', COACH_FOLLOW_THROUGH: 'on' },
    });
    const before = { ...process.env };
    await processed();
    expect({ ...process.env }).toEqual(before);
  });
});

describe('which number a proactive text goes to', () => {
  beforeEach(() => override(MINDY, 'on'));

  it('a phone proved in Settings (linkedIdentifiers) when Firebase Auth has none', async () => {
    seedUser(MINDY, { linkedIdentifiers: ['google:abc', `phone:${LINKED_PHONE}`] });
    await processed();
    expect(texts.map((t) => t.to)).toEqual([LINKED_PHONE]);
  });

  it('the Firebase Auth phone when the id and links have none', async () => {
    authUsers.set(MINDY, { phoneNumber: AUTH_PHONE });
    await processed();
    expect(texts.map((t) => t.to)).toEqual([AUTH_PHONE]);
  });

  it('never the profile phone the model writes', async () => {
    seedUser(MINDY, {
      phone: MODEL_PHONE,
      contactInfo: { timezone: 'America/New_York', phone: MODEL_PHONE },
    });
    await processed();
    expect(texts).toHaveLength(0);
    expect(docs.get(`bogle_users/${MINDY}/proactive_outreach_log/promise:p1`)).toMatchObject({
      channel: 'in_app',
      why: 'no verified phone',
    });
  });
});
