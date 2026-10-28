/**
 * MINOR_CARE in a process that never ran the purge (the API server): Memory Lane still drops what
 * a held call wrote, by the stored windows (minor_care_holds, #2879).
 *
 * Before: the window check was set only when minor-care-purge.ts loaded, and only voice workers
 * load it, so /api/memories served whatever a failed scrub left. Here the purge module can't load
 * at all; the memories route module and Memory Lane run for real, with only Firestore faked.
 * Synthetic uids and words only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, SENTINEL } from '../../../tests/helpers/snippet-leak.js';

type Json = Record<string, unknown>;
const fs = vi.hoisted(() => {
  const docs = new Map<string, Json>();
  const fail = { match: null as RegExp | null, hang: null as RegExp | null };
  const reads: string[] = [];
  const ref = (path: string): Json =>
    new Proxy(
      {
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id: string) => ref(`${path}/${id}`),
        get: async () => {
          reads.push(path);
          if (fail.hang?.test(path)) await new Promise(() => {}); // never answers
          if (fail.match?.test(path)) throw new Error('14 UNAVAILABLE: fake outage');
          const rows = [...docs].filter(([p]) => p.startsWith(`${path}/`));
          return {
            exists: docs.has(path),
            data: () => docs.get(path),
            empty: rows.length === 0,
            docs: rows.map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })),
          };
        },
      } as Json,
      { get: (t, k) => (k in t ? t[k as string] : k === 'then' ? undefined : () => ref(path)) }
    );
  return { docs, fail, reads, db: ref('') };
});
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));
vi.mock('../../superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<Json>()),
  getFirestoreDb: () => fs.db,
}));
// The proof that nothing here leans on the purge: importing it fails the test
vi.mock('../../../agents/voice-agent/minor-care-purge.js', () => {
  throw new Error('the purge module was loaded');
});

import '../../../api/routes/memories.js';
import { loadMemories } from '../index.js';
import { loadSharedMoments } from '../../superhuman/inside-joke-memory.js';
import { HELD_READ_TIMEOUT_MS } from '../../../utils/held-window-check.js';

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
let n = 0;
const uid = () => `HwApi${++n}kQ4vX8pLm2RtZ`;
function seed(u: string, id: string, writtenMs: number, content: string) {
  fs.docs.set(`/bogle_users/${u}/memory_highlights/${id}`, {
    userId: u,
    content,
    type: 'milestone',
    sourceType: 'milestone_reached',
    occurredAt: iso(Date.now() - 10 * DAY), // the event: long before either write
    createdAt: iso(writtenMs),
    updatedAt: iso(writtenMs),
  });
}

beforeEach(() => {
  fs.fail.match = fs.fail.hang = null;
  fs.reads.length = 0;
  vi.stubEnv('MINOR_CARE', 'on');
});

describe('Memory Lane in a process without the purge', () => {
  it('drops a capture written inside a stored held window; keeps the rest', async () => {
    const u = uid();
    const start = Date.now() - 60_000;
    fs.docs.set(`/minor_care_holds/${u}`, {
      windows: [{ start, end: Date.now() - 1000, scrubbed: false }], // the scrub failed
    });
    seed(u, 'held', start + 5000, SENTINEL);
    seed(u, 'legacy', start + 6000, SENTINEL); // an old doc with no createdAt: its last write counts
    delete fs.docs.get(`/bogle_users/${u}/memory_highlights/legacy`)!.createdAt;
    seed(u, 'older', Date.now() - 30 * DAY, 'the heron at the lake that would not stop staring');
    const memories = await loadMemories(u);
    expect(memories.map((m) => m.id)).toEqual(['older']);
    expect(leakedPieces(memories)).toEqual([]);
  });

  it('a user with no stored window gets everything; an unreadable one, nothing', async () => {
    const u = uid();
    seed(u, 'recent', Date.now() - 5000, SENTINEL);
    expect((await loadMemories(u)).map((m) => m.id)).toEqual(['recent']);
    const v = uid();
    seed(v, 'recent', Date.now() - 5000, SENTINEL);
    fs.fail.match = /minor_care_holds/;
    expect(await loadMemories(v)).toEqual([]); // fails closed
  });
});

// The #2906 verifier's point 5: the windows were read at most once a minute, so a "none" read just
// before another process stored a window (and its scrub failed) served the held item for up to 60 s.
describe('a window stored in another process right after this one read none', () => {
  const joke = (u: string, id: string, at: number, essence: string) =>
    fs.docs.set(`/bogle_users/${u}/shared_moments/${id}`, {
      type: 'inside_joke',
      essence,
      createdAt: at,
    });
  const storeWindow = (u: string, start: number) =>
    fs.docs.set(`/minor_care_holds/${u}`, {
      windows: [{ start, end: Date.now(), scrubbed: false }],
    });

  it('the next read, within the minute, serves nothing held (Memory Lane and inside jokes)', async () => {
    const u = uid();
    expect(await loadMemories(u)).toEqual([]); // read the windows: none
    expect(await loadSharedMoments(u)).toEqual([]);
    const start = Date.now() - 2000; // then the voice process held, purged, and its scrub failed
    seed(u, 'held', start + 1000, SENTINEL);
    joke(u, 'j-held', start + 1000, SENTINEL);
    storeWindow(u, start);
    expect(leakedPieces(await loadMemories(u))).toEqual([]);
    expect(leakedPieces(await loadSharedMoments(u))).toEqual([]);
  });

  it('the windows unreadable after a "none" read: nothing held, not the stale none', async () => {
    const u = uid();
    expect(await loadMemories(u)).toEqual([]);
    expect(await loadSharedMoments(u)).toEqual([]);
    seed(u, 'held', Date.now() - 1000, SENTINEL);
    joke(u, 'j-held', Date.now() - 1000, SENTINEL);
    fs.fail.match = /minor_care_holds/;
    expect(await loadMemories(u)).toEqual([]);
    expect(await loadSharedMoments(u)).toEqual([]);
  });

  it(`a windows read that never answers: nothing, after ${HELD_READ_TIMEOUT_MS} ms`, async () => {
    const u = uid();
    seed(u, 'held', Date.now() - 1000, SENTINEL);
    joke(u, 'j-held', Date.now() - 1000, SENTINEL);
    fs.fail.hang = /minor_care_holds/;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const lane = loadMemories(u);
      const jokes = loadSharedMoments(u);
      await vi.advanceTimersByTimeAsync(HELD_READ_TIMEOUT_MS);
      expect(await lane).toEqual([]);
      expect(await jokes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('adults: everything served, one windows read per request; MINOR_CARE off reads none', async () => {
    const u = uid();
    seed(u, 'recent', Date.now() - 5000, 'we finally fixed the porch light together');
    joke(u, 'j-recent', Date.now() - 5000, 'the porch light that only works upside down');
    for (let i = 0; i < 3; i++) {
      expect((await loadMemories(u)).map((m) => m.id)).toEqual(['recent']);
      expect((await loadSharedMoments(u)).map((m) => m.id)).toEqual(['j-recent']);
    }
    expect(fs.reads.filter((p) => p === `/minor_care_holds/${u}`)).toHaveLength(6);
    vi.stubEnv('MINOR_CARE', 'off');
    fs.reads.length = 0;
    expect((await loadMemories(u)).map((m) => m.id)).toEqual(['recent']);
    expect((await loadSharedMoments(u)).map((m) => m.id)).toEqual(['j-recent']);
    expect(fs.reads.filter((p) => p.startsWith('/minor_care_holds'))).toEqual([]);
  });
});
