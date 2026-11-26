/**
 * LIST_WRITES_TRUTHFUL (#4264): when Firestore is there but a list save fails, the list tools say
 * they couldn't, and the next read still shows the lists as they were. Off, as on main: the tools
 * report the change made. Real tools and the real list store over an in-memory Firestore whose
 * writes can be made to fail. Every name and item here is made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { failWrites: false };
  const depth = (p: string): number => p.split('/').length;
  const coll = (path: string): Record<string, unknown> => ({
    doc: (id: string) => doc(`${path}/${id}`),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([p]) => p.startsWith(`${path}/`) && depth(p) === depth(path) + 1)
          .filter(([, d]) => d[field] === value)
          .map(([p, d]) => ({ id: p.split('/').pop(), data: () => structuredClone(d) })),
      }),
    }),
  });
  const doc = (path: string): Record<string, unknown> => ({
    collection: (name: string) => coll(`${path}/${name}`),
    set: async (data: Record<string, unknown>) => {
      if (state.failWrites) throw new Error('write failed');
      docs.set(path, structuredClone(data));
    },
  });
  return { docs, state, db: { collection: (name: string) => coll(name) } };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fs.db,
}));

const tools = await import('../list-tools.js');
const store = await import('../list-store.js');

const COULDNT = /\bcouldn't\b/i;
let n = 0;
let uid = '';

beforeEach(async () => {
  uid = `riley-test-${++n}`;
  fs.state.failWrites = false;
  await store.saveList(uid, {
    id: 'list-hike',
    userId: uid,
    name: 'Hike Gear',
    type: 'packing',
    items: [
      { id: 'item-boots', text: 'trail boots', checked: false, addedAt: 1 },
      { id: 'item-map', text: 'paper map', checked: false, addedAt: 1 },
    ],
    createdAt: 1,
    updatedAt: 1,
    archived: false,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const on = (): void => {
  vi.stubEnv('LIST_WRITES_TRUTHFUL', 'on');
};

async function run(id: string, args: Record<string, unknown>): Promise<string> {
  const def = tools.listToolDefinitions.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const tool = def.create({ userId: uid } as never) as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return String(await tool.execute(args, {}));
}

/** What the next read shows: each list's name and its items, checked ones marked. */
const shown = async (): Promise<string[]> =>
  (await store.loadLists(uid))
    .map(
      (l) => `${l.name}: ${l.items.map((i) => (i.checked ? `[x] ${i.text}` : i.text)).join(', ')}`
    )
    .sort();
const BEFORE = ['Hike Gear: trail boots, paper map'];

const create = { name: 'Beach Reads', type: 'reading', items: ['a sea novel'] };
const add = { listName: 'hike gear', items: ['rain jacket'] };
const check = { listName: 'hike gear', item: 'boots' };
const remove = { listName: 'hike gear', item: 'map' };
const del = { listName: 'hike gear' };

describe('a failed list save, flag on', () => {
  beforeEach(() => {
    on();
    fs.state.failWrites = true;
  });

  it("createList says it couldn't, and the next read has no new list", async () => {
    expect(await run('createList', create)).toBe(
      `I couldn't save the "Beach Reads" list just now, so it isn't made yet. Want me to try again?`
    );
    expect(await shown()).toEqual(BEFORE);
  });

  it("addToList says it couldn't, and the item is not on the list", async () => {
    expect(await run('addToList', add)).toBe(
      "I couldn't add that to **Hike Gear** just now, so it isn't on the list yet. Want me to try again?"
    );
    expect(await shown()).toEqual(BEFORE);
  });

  it("checkOffItem says it couldn't, and the item is not checked", async () => {
    expect(await run('checkOffItem', check)).toBe(
      `I couldn't check off "trail boots" just now. It's still on your Hike Gear list.`
    );
    expect(await shown()).toEqual(BEFORE);
  });

  it("removeFromList says it couldn't, and the item is still there", async () => {
    expect(await run('removeFromList', remove)).toBe(
      `I couldn't remove "paper map" from **Hike Gear** just now. It's still there.`
    );
    expect(await shown()).toEqual(BEFORE);
  });

  it("deleteList says it couldn't, and the list is still there", async () => {
    expect(await run('deleteList', del)).toBe(
      `I couldn't delete the **"Hike Gear"** list just now. It's still there.`
    );
    expect(await shown()).toEqual(BEFORE);
  });
});

describe('off: the same failures, as on main', () => {
  beforeEach(() => {
    fs.state.failWrites = true;
  });

  it('every tool says the change was made, though the next read lacks it', async () => {
    expect(await run('createList', create)).toBe('📝 Created **"Beach Reads"** list with 1 item');
    expect(await run('addToList', add)).toBe('🧳 Added "rain jacket" to **Hike Gear**');
    expect(await run('checkOffItem', check)).toBe('🧳 ✓ **trail boots** checked off. 1 item left.');
    expect(await run('removeFromList', remove)).toBe('🧳 Removed "paper map" from **Hike Gear**');
    expect(await run('deleteList', del)).toBe('🧳 Deleted **"Hike Gear"** list.');
    expect(await shown()).toEqual(BEFORE);
  });
});

describe('flag on, healthy store', () => {
  beforeEach(on);

  it('createList and addToList save, and say so', async () => {
    expect(await run('createList', create)).not.toMatch(COULDNT);
    expect(await run('addToList', add)).not.toMatch(COULDNT);
    expect(await shown()).toEqual([
      'Beach Reads: a sea novel',
      'Hike Gear: trail boots, paper map, rain jacket',
    ]);
  });

  it('checkOffItem, removeFromList and deleteList save, and say so', async () => {
    expect(await run('checkOffItem', check)).not.toMatch(COULDNT);
    expect(await run('removeFromList', remove)).not.toMatch(COULDNT);
    expect(await shown()).toEqual(['Hike Gear: [x] trail boots']);
    expect(await run('deleteList', del)).not.toMatch(COULDNT);
    expect(await shown()).toEqual([]);
  });
});

describe('listSaved', () => {
  it('passes other errors through', async () => {
    await expect(store.listSaved(Promise.reject(new Error('other')))).rejects.toThrow('other');
  });
});
