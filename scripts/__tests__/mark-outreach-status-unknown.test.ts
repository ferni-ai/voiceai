/**
 * The outreach-status repair: a dry run writes nothing, --apply needs the
 * project named, and only attempts with no message (the old orchestrator's
 * writes) are marked 'unknown', keeping what they said.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  markUnknown,
  runMode,
  statusUntrusted,
} from '../migrations/mark-outreach-status-unknown.js';

type Doc = { id: string; data: Record<string, unknown> };

function fakeDb(docs: Doc[]) {
  const update = vi.fn();
  const commit = vi.fn(async () => undefined);
  const query = (after?: string) => ({
    startAfter: (doc: { id: string }) => query(doc.id),
    get: async () => {
      const start = after ? docs.findIndex((d) => d.id === after) + 1 : 0;
      const got = docs
        .slice(start, start + 400)
        .map((d) => ({ id: d.id, ref: { id: d.id }, data: () => d.data }));
      return { empty: got.length === 0, docs: got };
    },
  });
  const db = {
    collectionGroup: () => ({ select: () => ({ limit: () => query() }) }),
    batch: () => ({ update, commit }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, update, commit };
}

const docs: Doc[] = [
  { id: 'old-1', data: { status: 'delivered' } },
  { id: 'old-2', data: { status: 'delivered', message: '  ' } },
  { id: 'new-1', data: { status: 'failed', message: 'hey, how did it go?' } },
  { id: 'done-1', data: { status: 'unknown' } },
];

describe('mark-outreach-status-unknown', () => {
  it('distrusts only attempts with no message that are not marked yet', () => {
    expect(docs.map((d) => statusUntrusted(d.data))).toEqual([true, true, false, false]);
  });

  it('applies only with --apply and the project named', () => {
    expect(runMode(['node', 's'], 'p1')).toBe('dry-run');
    expect(runMode(['node', 's', '--apply'], 'p1')).toBe('refused');
    expect(runMode(['node', 's', '--apply', '--confirm-project=p1'], 'p1')).toBe('apply');
  });

  it('counts without writing on a dry run', async () => {
    const { db, update, commit } = fakeDb(docs);
    await expect(markUnknown(db, false)).resolves.toEqual({
      scanned: 4,
      untrusted: 2,
      byRecordedStatus: { delivered: 2 },
      marked: 0,
    });
    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("marks them 'unknown' on --apply, keeping the recorded status", async () => {
    const { db, update } = fakeDb(docs);
    await expect(markUnknown(db, true)).resolves.toMatchObject({ marked: 2 });
    expect(update).toHaveBeenCalledWith(
      { id: 'old-1' },
      { status: 'unknown', recordedStatus: 'delivered' }
    );
    expect(update).toHaveBeenCalledTimes(2);
  });
});
