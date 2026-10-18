/**
 * The turnCount repair: a dry run writes nothing, --apply needs the project
 * named, and a broken turnCount becomes the size of the conversation's turns.
 */
import { describe, expect, it, vi } from 'vitest';
import { needsRepair, repairTurnCounts, runMode } from '../migrations/fix-turncount-operand.js';

type Conv = { id: string; turnCount: unknown; turns: number };

function fakeDb(convs: Conv[]) {
  const update = vi.fn(async () => undefined);
  const page = (after?: string) => {
    const start = after ? convs.findIndex((c) => c.id === after) + 1 : 0;
    return convs.slice(start, start + 500).map((c) => ({
      id: c.id,
      get: () => c.turnCount,
      ref: {
        id: c.id,
        update: (data: unknown) => update(c.id, data),
        collection: () => ({
          count: () => ({ get: async () => ({ data: () => ({ count: c.turns }) }) }),
        }),
      },
    }));
  };
  const query = (after?: string) => ({
    startAfter: (doc: { id: string }) => query(doc.id),
    get: async () => {
      const docs = page(after);
      return { empty: docs.length === 0, docs };
    },
  });
  const db = { collectionGroup: () => ({ select: () => ({ limit: () => query() }) }) };
  return { db: db as unknown as FirebaseFirestore.Firestore, update };
}

const convs: Conv[] = [
  { id: 'ok', turnCount: 12, turns: 12 },
  { id: 'operand', turnCount: { operand: 1 }, turns: 9 },
  { id: 'missing', turnCount: undefined, turns: 3 },
];

describe('fix-turncount-operand', () => {
  it('repairs anything that is not a finite number', () => {
    expect([12, 0, { operand: 1 }, '7', Number.NaN, undefined].map(needsRepair)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it('applies only with --apply and the project named', () => {
    expect(runMode(['node', 's'], 'p1')).toBe('dry-run');
    expect(runMode(['node', 's', '--apply', '--confirm-project=nope'], 'p1')).toBe('refused');
    expect(runMode(['node', 's', '--apply', '--confirm-project=p1'], 'p1')).toBe('apply');
  });

  it('counts without writing on a dry run', async () => {
    const { db, update } = fakeDb(convs);
    await expect(repairTurnCounts(db, false)).resolves.toEqual({
      scanned: 3,
      broken: 2,
      repaired: 0,
      turnsCounted: 12,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('sets turnCount to the number of turns on --apply', async () => {
    const { db, update } = fakeDb(convs);
    await expect(repairTurnCounts(db, true)).resolves.toMatchObject({ repaired: 2 });
    expect(update.mock.calls).toEqual([
      ['operand', { turnCount: 9 }],
      ['missing', { turnCount: 3 }],
    ]);
  });
});
