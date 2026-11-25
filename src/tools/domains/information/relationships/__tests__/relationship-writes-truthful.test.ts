/**
 * RELATIONSHIP_WRITES_TRUTHFUL (#4265): when Firestore is there but a relationship save fails,
 * the relationship tools say they couldn't, and the next read still shows the relationship as it
 * was. Off, as on main: the tools say it was saved. Real tools and the real relationship store
 * over an in-memory Firestore whose writes can be made to fail. Every name here is made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { failWrites: false, failReads: false };
  const depth = (p: string): number => p.split('/').length;
  const coll = (path: string): Record<string, unknown> => ({
    doc: (id: string) => doc(`${path}/${id}`),
    get: async () => {
      if (state.failReads) throw new Error('read failed');
      return {
        docs: [...docs.entries()]
          .filter(([p]) => p.startsWith(`${path}/`) && depth(p) === depth(path) + 1)
          .map(([p, d]) => ({ id: p.split('/').pop(), data: () => structuredClone(d) })),
      };
    },
  });
  const doc = (path: string): Record<string, unknown> => ({
    collection: (name: string) => coll(`${path}/${name}`),
    get: async () => ({
      id: path.split('/').pop(),
      exists: docs.has(path),
      data: () => structuredClone(docs.get(path)),
    }),
    set: async (data: Record<string, unknown>) => {
      if (state.failWrites) throw new Error('write failed');
      docs.set(path, structuredClone(data));
    },
  });
  return { docs, state, db: { collection: (name: string) => coll(name) } };
});

vi.mock('firebase-admin/app', () => ({ getApps: () => [{}] }));
vi.mock('../../../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => fs.db,
}));

const { getRelationshipToolDefinitions } = await import('../index.js');
const store = await import('../storage.js');

const COULDNT = /\bcouldn't\b/i;
const NOT_SAVED = (name: string): string =>
  `I couldn't save that about ${name} just now, so nothing changed. Want me to try again?`;
let n = 0;
let uid = '';

beforeEach(async () => {
  uid = `riley-test-${++n}`;
  fs.state.failWrites = false;
  fs.state.failReads = false;
  await store.saveRelationship(uid, {
    id: 'rel-morgan',
    name: 'Morgan Vale',
    relationshipType: 'friend',
    interests: ['pottery'],
    favoriteTeams: [],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const on = (): void => {
  vi.stubEnv('RELATIONSHIP_WRITES_TRUTHFUL', 'on');
};

async function run(id: string, args: Record<string, unknown>): Promise<string> {
  const def = getRelationshipToolDefinitions().find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const tool = def.create({ userId: uid } as never) as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return String(await tool.execute(args, {}));
}

/** What the next read shows: each relationship's name, interests and teams. */
const shown = async (): Promise<string[]> =>
  (await store.getRelationships(uid))
    .map((r) => `${r.name} | ${r.interests.join(',')} | ${r.favoriteTeams.join(',')}`)
    .sort();
const BEFORE = ['Morgan Vale | pottery | '];
/** The stored last-contact field (null until a contact is recorded). */
const lastContact = (): unknown =>
  fs.docs.get(`users/${uid}/relationships/rel-morgan`)?.lastContact;

const add = { name: 'Quinn Harbor', relationshipType: 'colleague' };
const contact = { name: 'Morgan Vale' };
const interest = { name: 'Morgan Vale', interest: 'kayaking' };
const team = { name: 'Morgan Vale', team: 'Harbor Hawks' };

describe('a failed relationship save, flag on', () => {
  beforeEach(() => {
    on();
    fs.state.failWrites = true;
  });

  it("addRelationship says it couldn't, and the next read has no new person", async () => {
    expect(await run('addRelationship', add)).toBe(NOT_SAVED('Quinn Harbor'));
    expect(await shown()).toEqual(BEFORE);
  });

  it("recordContact says it couldn't, and no contact is stored", async () => {
    expect(await run('recordContact', contact)).toBe(NOT_SAVED('Morgan Vale'));
    expect(lastContact()).toBeNull();
  });

  it("addInterestToRelationship says it couldn't, and the interest is not stored", async () => {
    expect(await run('addInterestToRelationship', interest)).toBe(NOT_SAVED('Morgan Vale'));
    expect(await shown()).toEqual(BEFORE);
  });

  it('the in-memory copy is left alone too: a read that falls back to it shows the old state', async () => {
    expect(await run('addInterestToRelationship', interest)).toBe(NOT_SAVED('Morgan Vale'));
    fs.state.failReads = true;
    expect(await shown()).toEqual(BEFORE);
  });

  it("addFavoriteTeamToRelationship says it couldn't, and the team is not stored", async () => {
    expect(await run('addFavoriteTeamToRelationship', team)).toBe(NOT_SAVED('Morgan Vale'));
    expect(await shown()).toEqual(BEFORE);
  });
});

describe('off: the same failures, as on main', () => {
  beforeEach(() => {
    fs.state.failWrites = true;
  });

  it('every tool says it was saved, though the next read lacks it', async () => {
    expect(await run('addRelationship', add)).toBe("I've added Quinn Harbor as your colleague.");
    expect(await run('recordContact', contact)).toBe(
      "Great! I've noted that you connected with Morgan Vale. 💬"
    );
    expect(await run('addInterestToRelationship', interest)).toBe(
      `Got it! I've added "kayaking" to Morgan Vale's interests. This will help me with gift suggestions! 🎁`
    );
    expect(await run('addFavoriteTeamToRelationship', team)).toBe(
      "Got it! I've added the Harbor Hawks to Morgan Vale's favorite teams. I'll let you know when they play! 🏆"
    );
    expect(await shown()).toEqual(BEFORE);
    expect(lastContact()).toBeNull();
  });
});

describe('flag on, healthy store', () => {
  beforeEach(on);

  it('every tool saves, says so, and the next read shows it', async () => {
    expect(await run('addRelationship', add)).not.toMatch(COULDNT);
    expect(await run('recordContact', contact)).not.toMatch(COULDNT);
    expect(lastContact()).toBeInstanceOf(Date);
    expect(await run('addInterestToRelationship', interest)).not.toMatch(COULDNT);
    expect(await run('addFavoriteTeamToRelationship', team)).not.toMatch(COULDNT);
    expect(await shown()).toEqual([
      'Morgan Vale | pottery,kayaking | Harbor Hawks',
      'Quinn Harbor |  | ',
    ]);
  });
});

describe('notSaved', () => {
  it('passes other errors through', async () => {
    await expect(store.notSaved(Promise.reject(new Error('other')), 'Morgan')).rejects.toThrow(
      'other'
    );
  });
});
