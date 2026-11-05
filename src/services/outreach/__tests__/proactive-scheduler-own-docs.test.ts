/**
 * bogle_users/{uid}/scheduled_outreach holds two kinds of doc: the UI
 * process's proactive scheduler (messages to the user) and
 * scheduled-multi-outreach (messages to the user's contacts). The proactive
 * scheduler loads that subcollection at startup and delivers to the user, so
 * it must only pick up its own docs. Real writers, real loader, real
 * scheduler loop, one fake Firestore behind both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

// One array for the whole file: scheduled-multi-outreach caches its client.
const rows: Row[] = [];
const sendPushNotification = vi.fn(async () => ({ success: true }));
const sendSMS = vi.fn(async () => ({ success: true }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fakeFirestore(rows);
    }
  },
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => null }),
}));
vi.mock('../../data-layer/hooks/misc-hooks.js', () => ({ onScheduledOutreachChange: vi.fn() }));
vi.mock('../delivery/push-notifications.js', () => ({ sendPushNotification }));
vi.mock('../delivery/sms-delivery.js', () => ({ sendSMS }));

const multi = await import('../scheduled-multi-outreach.js');

const PAST = new Date(Date.now() - 60 * 60 * 1000);

async function writeBothShapes(): Promise<{ proactiveId: string; multiId: string }> {
  const proactive = await import('../proactive-scheduler.js');
  const { id: proactiveId } = await proactive.scheduleOutreach('u1', 'check_in', 'how did it go?', {
    scheduledFor: PAST,
    context: { trigger: 'test' },
  });
  await vi.waitFor(() => expect(rows.some((r) => r.id === proactiveId)).toBe(true));

  const multiId = await multi.scheduleOutreach(
    'u1',
    'ferni',
    {
      contact: 'mom',
      purpose: 'birthday',
      channel: 'text',
      message: 'Happy birthday, Mom!',
      resolvedContactId: 'c1',
      resolvedContactName: 'Mom',
      resolvedPhone: '+18015550123',
    },
    PAST
  );
  // Worst case: a writer that stores scheduledFor as an ISO string, which the
  // proactive loader can parse and would treat as due.
  const multiRow = rows.find((r) => r.id === multiId)!;
  multiRow.data.scheduledFor = PAST.toISOString();
  return { proactiveId, multiId };
}

/** A fresh module instance, as in a newly started UI process. */
async function freshScheduler() {
  vi.resetModules();
  return import('../proactive-scheduler.js');
}

beforeEach(() => {
  // The multi-outreach fixture is a send to a contact later, which needs the founder's opt-in.
  vi.stubEnv('SCHEDULED_OUTREACH_THIRD_PARTY', 'on');
  rows.length = 0;
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  (await import('../proactive-scheduler.js')).stopScheduler();
});

describe('proactive scheduler only loads its own scheduled_outreach docs', () => {
  it('tags its writes with its source and the multi-outreach docs carry none', async () => {
    const { proactiveId, multiId } = await writeBothShapes();
    const { PROACTIVE_OUTREACH_SOURCE } = await import('../proactive-scheduler.js');

    expect(rows.find((r) => r.id === proactiveId)!.data.source).toBe(PROACTIVE_OUTREACH_SOURCE);
    expect(rows.find((r) => r.id === multiId)!.data.source).toBeUndefined();
  });

  it('loads the proactive doc and skips the third-party doc', async () => {
    const { proactiveId, multiId } = await writeBothShapes();
    expect(rows.filter((r) => r.data.status === 'pending')).toHaveLength(2);

    const scheduler = await freshScheduler();
    expect(scheduler.getPendingOutreach('u1')).toEqual([]);
    await scheduler.loadPendingOutreach();

    const ids = scheduler.getPendingOutreach('u1').map((o) => o.id);
    expect(ids).toEqual([proactiveId]);
    expect(ids).not.toContain(multiId);
  });

  it('never delivers the contact message to the user', async () => {
    await writeBothShapes();

    const scheduler = await freshScheduler();
    await scheduler.loadPendingOutreach();
    scheduler.startScheduler({ checkIntervalMs: 5 });

    await vi.waitFor(() => expect(sendPushNotification).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    scheduler.stopScheduler();

    expect(sendPushNotification).toHaveBeenCalledTimes(1);
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', body: 'how did it go?' })
    );
    const bodies = sendPushNotification.mock.calls.map((c) => (c as unknown[])[0]);
    expect(JSON.stringify(bodies)).not.toContain('Happy birthday, Mom!');
    expect(sendSMS).not.toHaveBeenCalled();
  });
});
