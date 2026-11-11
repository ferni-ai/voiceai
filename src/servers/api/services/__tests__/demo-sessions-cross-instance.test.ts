/**
 * Demo sessions are cached per UI server instance, and Cloud Run runs several.
 * A conversation write or a claim made from one instance's stale cache must not
 * undo what another instance already stored (#1759):
 * - a conversation write must not put `claimed: false` back over a claim;
 * - a claim must not put an empty conversation back over one another instance wrote,
 *   nor hand the user that empty conversation to migrate;
 * - two instances must not both claim the same demo.
 *
 * The fake store keeps one shared "Firestore" map and a cache per instance, and
 * models updateIfUnchanged the way Firestore does (re-read, check, field update).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoSession } from '../demo-sessions.js';

const remote = new Map<string, DemoSession>();
/** Runs inside updateIfUnchanged before its re-read: a write landing between a read and a write. */
let between: (() => void) | null = null;
const clone = (s: DemoSession): DemoSession => structuredClone(s);

function fakeStore() {
  const cache = new Map<string, DemoSession>();
  return {
    get: vi.fn(async (id: string) => {
      if (cache.has(id)) return cache.get(id)!;
      const doc = remote.get(id);
      if (doc) cache.set(id, clone(doc));
      return doc ? cache.get(id)! : null;
    }),
    load: vi.fn(async (id: string, options?: { fresh?: boolean }) => {
      if (!options?.fresh && cache.has(id)) return cache.get(id)!;
      const doc = remote.get(id);
      if (!doc) {
        cache.delete(id);
        return null;
      }
      cache.set(id, clone(doc));
      return cache.get(id)!;
    }),
    setImmediate: vi.fn(async (id: string, data: DemoSession) => {
      cache.set(id, data);
      remote.set(id, clone(data));
    }),
    updateIfUnchanged: vi.fn(
      async (id: string, unchanged: (c: DemoSession) => boolean, fields: Partial<DemoSession>) => {
        between?.();
        between = null;
        const doc = remote.get(id);
        if (!doc) return 'missing' as const;
        if (!unchanged(clone(doc))) return 'changed' as const;
        remote.set(id, { ...clone(doc), ...structuredClone(fields) });
        return 'updated' as const;
      }
    ),
    delete: vi.fn(async (id: string) => {
      cache.delete(id);
      remote.delete(id);
    }),
    shutdown: vi.fn(async () => undefined),
  };
}

vi.mock('../../../../services/persistence/index.js', () => ({
  createPersistenceStore: vi.fn(() => fakeStore()),
}));
vi.mock('../../../../utils/interval-manager.js', () => ({
  registerInterval: vi.fn(),
  clearNamedInterval: vi.fn(),
}));

type Service = typeof import('../demo-sessions.js');

/** A fresh copy of the module: its own cache, as a second UI server instance has. */
async function instance(): Promise<Service> {
  vi.resetModules();
  return import('../demo-sessions.js');
}

const ROOM = 'demo-demo_1_sam';

describe('demo sessions across instances (#1759)', () => {
  let a: Service;
  let b: Service;
  let claimToken: string;

  beforeEach(async () => {
    remote.clear();
    between = null;
    a = await instance();
    ({ claimToken } = await a.createDemoSession(ROOM, 'demo_1'));
    b = await instance();
  });

  it('a conversation write from a stale cache does not undo a claim made elsewhere', async () => {
    // Instance A cached the demo unclaimed; instance B claims it
    await b.getDemoSession(ROOM);
    expect(await b.claimDemoSession(claimToken, 'uid-sam')).toMatchObject({ success: true });

    const result = await a.updateDemoSessionConversation(ROOM, { topics: ['gardening'] });

    expect(remote.get(ROOM)).toMatchObject({ claimed: true, claimedBy: 'uid-sam' });
    expect(remote.get(ROOM)?.conversation.topics).toEqual([]);
    expect(result).toBe('claimed');
  });

  it('a conversation write changes only the conversation', async () => {
    const result = await a.updateDemoSessionConversation(ROOM, {
      topics: ['gardening'],
      userMood: 'curious',
    });

    expect(result).toBe('updated');
    expect(remote.get(ROOM)).toMatchObject({
      claimed: false,
      claimedBy: null,
      claimToken,
      conversation: { topics: ['gardening'], userMood: 'curious', highlights: [] },
    });
  });

  it('a conversation write merges onto what is stored, not onto a stale cache', async () => {
    // A caches the empty demo; B writes topics; A then writes highlights
    await a.getDemoSession(ROOM);
    await b.updateDemoSessionConversation(ROOM, { topics: ['gardening'] });

    const result = await a.updateDemoSessionConversation(ROOM, { highlights: ['new tomatoes'] });

    expect(remote.get(ROOM)?.conversation).toMatchObject({
      topics: ['gardening'],
      highlights: ['new tomatoes'],
    });
    expect(result).toBe('updated');
  });

  it('a claim from a stale cache keeps and returns the conversation stored elsewhere', async () => {
    await a.getDemoSession(ROOM);
    await b.updateDemoSessionConversation(ROOM, { topics: ['gardening'] });

    const claim = await a.claimDemoSession(claimToken, 'uid-sam');

    expect(claim.success).toBe(true);
    expect(claim.session?.conversation.topics).toEqual(['gardening']);
    expect(remote.get(ROOM)).toMatchObject({
      claimed: true,
      claimedBy: 'uid-sam',
      conversation: { topics: ['gardening'] },
    });
  });

  it('two instances cannot both claim the same demo', async () => {
    await b.getDemoSession(ROOM);
    expect((await a.claimDemoSession(claimToken, 'uid-sam')).success).toBe(true);

    const second = await b.claimDemoSession(claimToken, 'uid-other');

    expect(second.success).toBe(false);
    expect(remote.get(ROOM)).toMatchObject({ claimed: true, claimedBy: 'uid-sam' });
  });

  it('the same user claiming again from a stale cache is told it is already claimed', async () => {
    await b.getDemoSession(ROOM);
    await a.claimDemoSession(claimToken, 'uid-sam');

    const again = await b.claimDemoSession(claimToken, 'uid-sam');

    expect(again).toMatchObject({ success: true, alreadyClaimed: true });
  });

  it('a claim landing between the read and the write is not undone', async () => {
    between = () => Object.assign(remote.get(ROOM)!, { claimed: true, claimedBy: 'uid-sam' });

    const result = await a.updateDemoSessionConversation(ROOM, { topics: ['gardening'] });

    expect(remote.get(ROOM)).toMatchObject({ claimed: true, claimedBy: 'uid-sam' });
    expect(remote.get(ROOM)?.conversation.topics).toEqual([]);
    expect(result).toBe('claimed');
  });

  it('a conversation written between the read and the write is not overwritten', async () => {
    between = () => Object.assign(remote.get(ROOM)!.conversation, { topics: ['gardening'] });

    const result = await a.updateDemoSessionConversation(ROOM, { highlights: ['new tomatoes'] });

    expect(remote.get(ROOM)?.conversation.topics).toEqual(['gardening']);
    expect(result).toBe('failed');
  });

  it('a claim racing another claim between the read and the write loses', async () => {
    between = () => Object.assign(remote.get(ROOM)!, { claimed: true, claimedBy: 'uid-other' });

    const claim = await a.claimDemoSession(claimToken, 'uid-sam');

    expect(remote.get(ROOM)).toMatchObject({ claimed: true, claimedBy: 'uid-other' });
    expect(claim.success).toBe(false);
  });

  it('a claim returns a conversation written between its read and its write', async () => {
    between = () => Object.assign(remote.get(ROOM)!.conversation, { topics: ['gardening'] });

    const claim = await a.claimDemoSession(claimToken, 'uid-sam');

    expect(remote.get(ROOM)).toMatchObject({ claimed: true, claimedBy: 'uid-sam' });
    expect(claim.success).toBe(true);
    expect(claim.session?.conversation.topics).toEqual(['gardening']);
    expect(claim.session?.claimed).toBe(true);
  });

  it('a write to a demo deleted elsewhere reports missing and does not recreate it', async () => {
    await a.getDemoSession(ROOM);
    remote.delete(ROOM);

    const result = await a.updateDemoSessionConversation(ROOM, { topics: ['x'] });

    expect(remote.has(ROOM)).toBe(false);
    expect(result).toBe('missing');
  });
});
