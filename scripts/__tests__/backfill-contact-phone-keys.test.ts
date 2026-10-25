/**
 * The phoneKeys backfill: a dry run writes nothing, --apply needs the project
 * named, and each contact gets exactly its numbers as E.164 keys.
 */
import { describe, expect, it, vi } from 'vitest';
import { backfill, phoneKeysUpdate, runMode } from '../migrations/backfill-contact-phone-keys.js';

type Doc = { id: string; data: Record<string, unknown> };

function fakeDb(docs: Doc[]) {
  const update = vi.fn();
  const commit = vi.fn(async () => undefined);
  const page = (after?: string) => {
    const start = after ? docs.findIndex((d) => d.id === after) + 1 : 0;
    return docs
      .slice(start, start + 300)
      .map((d) => ({ id: d.id, ref: { id: d.id }, data: () => d.data }));
  };
  const query = (after?: string) => ({
    startAfter: (doc: { id: string }) => query(doc.id),
    get: async () => {
      const got = page(after);
      return { empty: got.length === 0, docs: got };
    },
  });
  const db = {
    collection: () => ({ orderBy: () => ({ limit: () => query() }) }),
    batch: () => ({ update, commit }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, update, commit };
}

const docs: Doc[] = [
  { id: 'a', data: { phones: [{ number: '(512) 555-0100' }] } },
  { id: 'b', data: { phones: [{ number: '+15125550101' }], phoneKeys: ['+15125550101'] } },
  { id: 'c', data: { phones: [] } },
];

describe('backfill-contact-phone-keys', () => {
  it('wants E.164 keys, and nothing for a contact that already has them', () => {
    expect(phoneKeysUpdate(docs[0]!.data)).toEqual(['+15125550100']);
    expect(phoneKeysUpdate(docs[1]!.data)).toBeNull();
    expect(phoneKeysUpdate(docs[2]!.data)).toEqual([]);
  });

  it('applies only with --apply and the project named', () => {
    expect(runMode(['node', 's'], 'p1')).toBe('dry-run');
    expect(runMode(['node', 's', '--apply'], 'p1')).toBe('refused');
    expect(runMode(['node', 's', '--apply', '--confirm-project=p2'], 'p1')).toBe('refused');
    expect(runMode(['node', 's', '--apply', '--confirm-project=p1'], 'p1')).toBe('apply');
  });

  it('counts without writing on a dry run', async () => {
    const { db, update, commit } = fakeDb(docs);
    await expect(backfill(db, false)).resolves.toEqual({
      scanned: 3,
      needUpdate: 2,
      withoutPhone: 1,
      updated: 0,
    });
    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('writes each missing key set on --apply', async () => {
    const { db, update } = fakeDb(docs);
    await expect(backfill(db, true)).resolves.toMatchObject({ updated: 2 });
    expect(update).toHaveBeenCalledWith({ id: 'a' }, { phoneKeys: ['+15125550100'] });
    expect(update).toHaveBeenCalledWith({ id: 'c' }, { phoneKeys: [] });
  });
});
