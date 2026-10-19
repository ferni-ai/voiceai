/**
 * loadPendingOutreach runs on every Cloud Run cold boot. It used to read every
 * pending scheduled_outreach doc in the database; it must now read a bounded,
 * soonest-due-first slice within the horizon.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';
import {
  PENDING_OUTREACH_HORIZON_MS,
  PENDING_OUTREACH_LOAD_LIMIT,
} from '../pending-outreach-query.js';

const rows: Row[] = [];
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../data-layer/hooks/misc-hooks.js', () => ({ onScheduledOutreachChange: vi.fn() }));

const HOUR = 60 * 60 * 1000;

function pending(id: string, scheduledFor: Date, extra: Record<string, unknown> = {}): Row {
  return {
    id,
    userId: 'u1',
    collection: 'scheduled_outreach',
    data: {
      id,
      userId: 'u1',
      type: 'check_in',
      message: id,
      status: 'pending',
      source: 'proactive-scheduler',
      scheduledFor: scheduledFor.toISOString(),
      createdAt: new Date().toISOString(),
      ...extra,
    },
  };
}

async function freshScheduler() {
  vi.resetModules();
  return import('../proactive-scheduler.js');
}

beforeEach(() => {
  rows.length = 0;
});

describe('loadPendingOutreach is bounded', () => {
  it('skips outreach beyond the horizon and loads what is due', async () => {
    const s = await freshScheduler();
    rows.push(
      pending('due', new Date(Date.now() - HOUR)),
      pending('tomorrow', new Date(Date.now() + 24 * HOUR)),
      pending('far', new Date(Date.now() + PENDING_OUTREACH_HORIZON_MS + 24 * HOUR)),
      pending('sent', new Date(Date.now() - HOUR), { status: 'sent' })
    );

    await s.loadPendingOutreach();

    const ids = s.getPendingOutreach('u1').map((o) => o.id);
    expect(ids.sort()).toEqual(['due', 'tomorrow']);
  });

  it('reads at most the limit, keeping the soonest due', async () => {
    const s = await freshScheduler();
    const n = PENDING_OUTREACH_LOAD_LIMIT + 5;
    // Inserted latest-first, so an unordered read would keep the wrong ones.
    for (let i = n - 1; i >= 0; i--) {
      rows.push(pending(`o${i}`, new Date(Date.now() + i * 60_000)));
    }

    await s.loadPendingOutreach();

    const ids = new Set(s.getPendingOutreach('u1').map((o) => o.id));
    expect(ids.size).toBe(PENDING_OUTREACH_LOAD_LIMIT);
    expect(ids.has('o0')).toBe(true);
    expect(ids.has(`o${n - 1}`)).toBe(false);
  });
});
