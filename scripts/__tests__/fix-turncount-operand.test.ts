/**
 * The turnCount repair: a dry run writes nothing, --apply needs the project
 * named, and a broken turnCount becomes the size of the conversation's turns.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  isUserConversation,
  needsRepair,
  repairTurnCounts,
  runMode,
} from '../migrations/fix-turncount-operand.js';

type Conv = { id: string; turnCount: unknown; turns: number; root?: string };

/** A conversation's ref: <root>/{uid}/conversations/{id}. */
const refParents = (root: string) => ({
  parent: { id: 'conversations', parent: { id: 'u1', parent: { id: root } } },
});

function fakeDb(convs: Conv[]) {
  const update = vi.fn(async (_id: string, _data: unknown) => undefined);
  const page = (after?: string) => {
    const start = after ? convs.findIndex((c) => c.id === after) + 1 : 0;
    return convs.slice(start, start + 500).map((c) => ({
      id: c.id,
      get: () => c.turnCount,
      ref: {
        ...refParents(c.root ?? 'bogle_users'),
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
  { id: 'text', turnCount: '7', turns: 7 },
  { id: 'elsewhere', turnCount: { operand: 1 }, turns: 4, root: 'group_sessions' },
];

describe('fix-turncount-operand', () => {
  it('repairs only the flattened increment shape', () => {
    expect(
      [
        { operand: 1 },
        { operand: 3, other: 1 },
        12,
        0,
        '7',
        Number.NaN,
        undefined,
        null,
        {},
        [],
      ].map(needsRepair)
    ).toEqual([true, true, false, false, false, false, false, false, false, false]);
  });

  it('only touches bogle_users/{uid}/conversations', () => {
    const ref = (root: string) =>
      refParents(root) as unknown as FirebaseFirestore.DocumentReference;
    expect(isUserConversation(ref('bogle_users'))).toBe(true);
    expect(isUserConversation(ref('group_sessions'))).toBe(false);
    const topLevel = { parent: { id: 'conversations', parent: null } };
    expect(isUserConversation(topLevel as unknown as FirebaseFirestore.DocumentReference)).toBe(
      false
    );
  });

  it('applies only with --apply and the project named', () => {
    expect(runMode(['node', 's'], 'p1')).toBe('dry-run');
    expect(runMode(['node', 's', '--apply', '--confirm-project=nope'], 'p1')).toBe('refused');
    expect(runMode(['node', 's', '--apply', '--confirm-project=p1'], 'p1')).toBe('apply');
  });

  it('counts without writing on a dry run', async () => {
    const { db, update } = fakeDb(convs);
    await expect(repairTurnCounts(db, false)).resolves.toEqual({
      scanned: 5,
      otherCollections: 1,
      broken: 1,
      repaired: 0,
      turnsCounted: 9,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('sets turnCount to the number of turns on --apply, keeping the old value', async () => {
    const { db, update } = fakeDb(convs);
    await expect(repairTurnCounts(db, true)).resolves.toMatchObject({ repaired: 1 });
    expect(update.mock.calls).toEqual([
      ['operand', { turnCount: 9, turnCountWas: { operand: 1 } }],
    ]);
  });
});
