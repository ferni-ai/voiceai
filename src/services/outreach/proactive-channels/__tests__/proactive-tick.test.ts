/**
 * Proactive check-ins end to end: the per-minute scheduler handler → the
 * run → triggers from Ferni's stored promises → the app's message panel →
 * the outreach log. Firestore is in memory; nothing else is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../../workflows/scheduled-actions.js', () => ({
  deliverDueScheduledActions: vi.fn(async () => ({ due: 0, delivered: 0 })),
}));
vi.mock('../../../data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: vi.fn(async () => undefined),
}));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');

const SETH = 'seth-uid';
const HOUR = 3600_000;
// 11:00 in New York.
const NOW = new Date('2026-10-12T15:00:00Z');

function seedUser(uid: string, extra: Record<string, unknown> = {}) {
  docs.set(`bogle_users/${uid}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    ...extra,
  });
}
function seedPromise(uid: string, id: string, p: Record<string, unknown>) {
  docs.set(`bogle_users/${uid}/ferni_commitments/${id}`, {
    id,
    userId: uid,
    type: 'check_in',
    commitment: "I'll check in about the move",
    context: 'the move',
    relatedTopic: 'the move',
    madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
    dueBy: new Date(NOW.getTime() + 6 * 24 * HOUR).toISOString(),
    fulfilled: false,
    outcome: 'open',
    ...p,
  });
}
const under = (prefix: string) =>
  [...docs.entries()].filter(([p]) => p.startsWith(prefix)).map(([, d]) => d);

async function runHandler(): Promise<Record<string, unknown>> {
  let body = '';
  const res = {
    writeHead: () => res,
    setHeader: () => undefined,
    end: (b: string) => void (body = b),
  };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
  return JSON.parse(body) as Record<string, unknown>;
}

beforeEach(() => {
  docs.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
});

describe('scheduler handler → proactive check-in', () => {
  it('flag off: nothing runs and the response is unchanged', async () => {
    delete process.env.PROACTIVE_CHANNELS;
    seedUser(SETH);
    seedPromise(SETH, 'p1', {});
    const body = await runHandler();
    expect(body.success).toBe(true);
    expect(body.proactive).toBeUndefined();
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(0);
  });

  it('keeps a check-in promise the next day with a note in the app, once', async () => {
    seedUser(SETH);
    seedPromise(SETH, 'p1', {});
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(0);

    const body = await runHandler();
    const notes = under(`bogle_users/${SETH}/pending_messages/`);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe(
      "Hey, it's Ferni. I said I'd check in about the move. How's it going?"
    );
    const [entry] = under(`bogle_users/${SETH}/proactive_outreach_log/`);
    expect(entry).toMatchObject({ channel: 'in_app', outcome: 'sent', kind: 'promise' });
    expect((body.proactive as { users: unknown[] }).users).toEqual([
      expect.objectContaining({ userId: SETH, status: 'sent', channel: 'in_app' }),
    ]);

    await runHandler();
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(1);
  });

  it('a user who switched outreach off hears nothing', async () => {
    seedUser(SETH, { outreachPreferences: { enabled: false } });
    seedPromise(SETH, 'p1', {});
    await runHandler();
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(0);
  });

  it('leaves users off the allowlist alone', async () => {
    seedUser('someone-else');
    seedPromise('someone-else', 'p1', {});
    await runHandler();
    expect(under('bogle_users/someone-else/pending_messages/')).toHaveLength(0);
  });

  it('says nothing when they have talked since the promise (Ferni asks in person)', async () => {
    seedUser(SETH, { lastContact: new Date(NOW.getTime() - 2 * HOUR).toISOString() });
    seedPromise(SETH, 'p1', {});
    await runHandler();
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(0);
  });

  it('waits until the next day: a promise made this morning is not chased tonight', async () => {
    seedUser(SETH);
    seedPromise(SETH, 'p1', { madeAt: new Date(NOW.getTime() - 3 * HOUR).toISOString() });
    await runHandler();
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(0);
  });

  it('"let me know how the interview goes" becomes "how did it go?" the evening after', async () => {
    seedUser(SETH);
    seedPromise(SETH, 'f1', {
      type: 'follow_up',
      commitment: 'Let me know how the interview goes',
      relatedTopic: 'the interview',
    });
    await runHandler(); // 11:00 New York: not evening yet
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(0);

    vi.setSystemTime(new Date('2026-10-12T22:00:00Z')); // 18:00 New York
    await runHandler();
    const notes = under(`bogle_users/${SETH}/pending_messages/`);
    expect(notes.map((n) => n.text)).toEqual(["Hey, it's Ferni. How did the interview go?"]);
  });

  it('dry run reports what would go out and writes nothing', async () => {
    seedUser(SETH);
    seedPromise(SETH, 'p1', {});
    let body = '';
    const res = { writeHead: () => res, end: (b: string) => void (body = b) };
    await handleDeliverScheduledActions(
      { url: '/api/jobs/deliver-scheduled-actions?dryRun=true' } as never,
      res as never
    );
    const users = (JSON.parse(body) as { proactive: { users: unknown[] } }).proactive.users;
    expect(users).toEqual([expect.objectContaining({ status: 'dry_run', sourceId: 'promise:p1' })]);
    expect(under(`bogle_users/${SETH}/pending_messages/`)).toHaveLength(0);
    expect(under(`bogle_users/${SETH}/proactive_outreach_log/`)).toHaveLength(0);
  });
});
