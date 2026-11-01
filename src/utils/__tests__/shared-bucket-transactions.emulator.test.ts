/**
 * Transactions and the shared-bucket write guard, on the Firestore emulator.
 *
 * Round 2 of #2634 dropped a transaction's placeholder write and resolved: nothing
 * was sent, not even a rollback, so the transaction's read locks stayed held (a
 * member's write to a doc it had read stalled 62.5 s), and a sweep's dropped claim
 * read as done, so the item stayed pending and was delivered again every sweep.
 * A transactional commit with a placeholder write is now refused: the SDK rolls it
 * back, the locks go, and the sweep skips the item.
 *
 * Runs only with FIRESTORE_EMULATOR_HOST. The client names project johnb-2025 and
 * database (default), so the guard (installed with an env of its own, so the
 * emulator doesn't exempt it) treats it as production.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const holder = vi.hoisted(() => ({ db: undefined as unknown }));
const delivered = vi.hoisted(() => [] as string[]);

vi.mock('../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => holder.db,
}));
vi.mock('../../services/outreach/unified-delivery.js', () => ({
  getChannelStatus: vi.fn(async () => ({
    sms: { available: true },
    voice_call: { available: true },
    email: { available: true },
    push: { available: false },
    in_app: { available: true },
  })),
}));
vi.mock('../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  deliverReminderOutcome: vi.fn(async (r: { userId: string; id: string }) => {
    delivered.push(`${r.userId}/${r.id}`);
    return 'sent';
  }),
}));

const { installSyntheticWriteGuard } = await import('../synthetic-write-guard.js');
const { claimDueItems } = await import('../../services/scheduling/due-items.js');
const { deliverDueReminders } = await import('../../services/scheduling/reminder-delivery-job.js');

let db: FirestoreType;
const RUN = `r${Date.now()}`;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

describe.skipIf(!emulator)('transactions under a shared placeholder owner (emulator)', () => {
  beforeAll(async () => {
    const { Firestore } = createRequire(import.meta.url)(
      '@google-cloud/firestore'
    ) as typeof import('@google-cloud/firestore');
    db = new Firestore({ projectId: 'johnb-2025' });
    holder.db = db;
    // Seed before the guard is installed: the placeholder docs prod still holds.
    const due = { status: 'pending', scheduledFor: iso(-60_000), dueAt: iso(-60_000) };
    await db.doc(`bogle_users/anonymous/locks/${RUN}`).set({ n: 0 });
    await db.doc(`bogle_users/uid-member/locks/${RUN}`).set({ n: 0 });
    for (const owner of ['anonymous', 'uid-member']) {
      await db.doc(`bogle_users/${owner}/sweep_items_${RUN}/item`).set(due);
      await db.doc(`bogle_users/${owner}/reminders/rem_${RUN}`).set({
        ...due,
        userId: owner,
        message: 'take insulin',
        deliveryMethod: 'in_app',
        deliveryAddress: '',
        createdAt: iso(-86_400_000),
      });
    }
    installSyntheticWriteGuard({});
  });

  afterAll(async () => {
    await db?.terminate();
  });

  it('refuses the commit and releases its locks: a member write to a doc it read takes under 1 s', async () => {
    const member = db.doc(`bogle_users/uid-member/locks/${RUN}`);
    const placeholder = db.doc(`bogle_users/anonymous/locks/${RUN}`);
    const tx = db.runTransaction(async (t) => {
      await t.get(member); // read locks on both docs
      await t.get(placeholder);
      t.update(placeholder, { n: 1 });
    });
    await expect(tx).rejects.toMatchObject({ name: 'SyntheticWriteRefusedError' });

    const started = Date.now();
    await member.update({ n: 2 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect((await placeholder.get()).data()).toEqual({ n: 0 });
  }, 20_000);

  it("claimDueItems skips a placeholder item, claims the member's, and never claims the placeholder twice", async () => {
    const opts = {
      collection: `sweep_items_${RUN}`,
      dueField: 'dueAt',
      dueType: 'iso' as const,
      claimStatus: 'claimed',
      lateStatus: 'missed',
      lateAfterMs: 2 * 3_600_000,
    };
    const first = await claimDueItems(db as never, opts);
    expect(first.claimed.map((i) => i.userId)).toEqual(['uid-member']);
    expect(first.skipped).toBe(1);

    const second = await claimDueItems(db as never, opts);
    expect(second.claimed).toEqual([]); // the member's is claimed; the placeholder's never is
    expect(second.skipped).toBe(1);
    const left = await db.doc(`bogle_users/anonymous/sweep_items_${RUN}/item`).get();
    expect(left.data()?.status).toBe('pending');
  }, 20_000);

  it('the reminder sweep never delivers a placeholder reminder, on any run', async () => {
    delivered.length = 0;
    await deliverDueReminders({});
    await deliverDueReminders({});
    expect(delivered.filter((d) => d.endsWith(`rem_${RUN}`))).toEqual([
      `uid-member/rem_${RUN}`,
    ]);
  }, 20_000);
});
