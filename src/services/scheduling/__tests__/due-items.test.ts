/**
 * Due items are claimed once each, late ones are marked instead of claimed,
 * and a dry run changes nothing.
 */
import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { claimDueItems, type ClaimOptions } from '../due-items.js';
import { fakeFirestore, type Row } from './fake-firestore.js';

const NOW = new Date('2026-09-30T16:00:00.000Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const opts = (o: Partial<ClaimOptions> = {}): ClaimOptions => ({
  collection: 'scheduled_actions',
  dueField: 'scheduledFor',
  dueType: 'iso',
  claimStatus: 'sending',
  lateStatus: 'missed',
  lateAfterMs: 2 * HOUR,
  now: NOW,
  ...o,
});
const row = (id: string, data: Record<string, unknown>, collection = 'scheduled_actions'): Row => ({
  id,
  userId: 'u1',
  collection,
  data: { status: 'pending', ...data },
});
const db = (rows: Row[]) => fakeFirestore(rows) as unknown as Firestore;

describe('claimDueItems', () => {
  it('claims due items and leaves future ones pending', async () => {
    const rows = [
      row('due', { scheduledFor: iso(-60_000) }),
      row('later', { scheduledFor: iso(HOUR) }),
    ];
    const result = await claimDueItems(db(rows), opts());

    expect(result.due).toBe(1);
    expect(result.claimed.map((c) => c.id)).toEqual(['due']);
    expect(result.claimed[0].userId).toBe('u1');
    expect(rows.map((r) => r.data.status)).toEqual(['sending', 'pending']);
  });

  it('marks late items instead of claiming them', async () => {
    const rows = [row('stale', { scheduledFor: iso(-3 * HOUR) })];
    const result = await claimDueItems(db(rows), opts());

    expect(result).toMatchObject({ late: 1, claimed: [] });
    expect(rows[0].data.status).toBe('missed');
  });

  it('never claims the same item twice', async () => {
    const rows = [row('due', { scheduledFor: iso(-60_000) })];
    const first = await claimDueItems(db(rows), opts());
    const second = await claimDueItems(db(rows), opts());
    expect(first.claimed).toHaveLength(1);
    expect(second.due).toBe(0);
  });

  it('skips an item another run claimed between query and transaction', async () => {
    const rows = [row('due', { scheduledFor: iso(-60_000) })];
    const racing = fakeFirestore(rows);
    const tx = racing.runTransaction.bind(racing);
    racing.runTransaction = async (fn) => {
      rows[0].data.status = 'sending'; // the other run got there first
      return tx(fn);
    };
    const result = await claimDueItems(racing as unknown as Firestore, opts());
    expect(result).toMatchObject({ skipped: 1, claimed: [] });
  });

  it('works with Timestamp/Date due fields', async () => {
    const rows = [
      row('due', { scheduledFor: new Date(NOW.getTime() - 60_000) }, 'scheduled_outreach'),
      row('later', { scheduledFor: new Date(NOW.getTime() + HOUR) }, 'scheduled_outreach'),
    ];
    const result = await claimDueItems(
      db(rows),
      opts({ collection: 'scheduled_outreach', dueType: 'timestamp', claimStatus: 'executing' })
    );
    expect(result.claimed.map((c) => c.id)).toEqual(['due']);
    expect(rows[0].data.status).toBe('executing');
  });

  it('dry run reports without changing anything', async () => {
    const rows = [
      row('due', { scheduledFor: iso(-60_000) }),
      row('stale', { scheduledFor: iso(-3 * HOUR) }),
    ];
    const result = await claimDueItems(db(rows), opts({ dryRun: true }));
    expect(result).toMatchObject({ due: 2, late: 1 });
    expect(result.claimed.map((c) => c.id)).toEqual(['due']);
    expect(rows.map((r) => r.data.status)).toEqual(['pending', 'pending']);
  });
});
