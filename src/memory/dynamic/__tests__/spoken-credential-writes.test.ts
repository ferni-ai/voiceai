/**
 * SPOKEN_CREDENTIAL_FILTER (#2367) through the writers of dynamic_facts: deep extraction
 * (Firestore and the vector index), the after-call sweep, and the caller's corrections.
 * On, a door code, a wifi password and a PIN are not written while an age and a house
 * number are; off, everything is written as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({
  sets: [] as Array<{ path: string; data: Record<string, unknown> }>,
  vector: [] as Array<{ metadata: Record<string, unknown> }>,
  info: [] as unknown[][],
}));

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: () => undefined,
    info: (...args: unknown[]) => seen.info.push(args),
    warn: () => undefined,
    error: () => undefined,
  };
  return { createLogger: () => logger, getLogger: () => logger };
});

vi.mock('../async-events-config.js', () => ({ safeOnEvent: () => () => undefined }));

vi.mock('../../../utils/firestore-utils.js', () => {
  const ref = (path: string) => ({
    path,
    collection: (c: string) => ({ doc: (id = 'auto') => ref(`${path}/${c}/${id}`) }),
  });
  return {
    getFirestoreDb: () => ({
      collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
      batch: () => ({
        set: (r: { path: string }, data: Record<string, unknown>) =>
          seen.sets.push({ path: r.path, data }),
        commit: async () => undefined,
      }),
    }),
    cleanForFirestore: <T>(o: T) => o,
    sanitizeFirestoreDocId: (s: string) => s.replace(/\//g, '-'),
  };
});

vi.mock('../../firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({
    initialize: async () => undefined,
    addDocuments: async (docs: Array<{ metadata: Record<string, unknown> }>) => {
      seen.vector.push(...docs);
      return docs.map((_, i) => `v${i}`);
    },
  }),
}));

import { DeepExtractionWorker, type ExtractedFact } from '../deep-extraction-worker.js';
import { sweepCall, type SweepStore } from '../fact-sweep.js';
import { correctRemembered, type MemoryControlStore } from '../../recall/memory-control.js';

const fact = (key: string, value: string): ExtractedFact => ({
  entityName: 'User',
  factType: 'attribute',
  key,
  value,
  confidence: 0.9,
});

const SAID = [
  fact('door_code', '4821'),
  fact('wifi_password', 'sunshine42'),
  fact('pin', '9087'),
  fact('age', '34'),
  fact('house_number', '1517'),
];
const ALL_VALUES = ['4821', 'sunshine42', '9087', '34', '1517'];
const ORDINARY = ['34', '1517'];

const job = {
  jobId: 'job-1',
  userId: 'user-1',
  sessionId: 'session-1',
  turnNumber: 3,
  transcript: 'door code is 4821, wifi password sunshine42, pin 9087, I am 34, I live at 1517',
  timestamp: new Date('2026-10-21T12:00:00Z'),
  priority: 'normal' as const,
  fastCaptureHints: {
    mentionedEntities: [],
    emotionSignals: [],
    topicHints: [],
    dateSignals: [],
    relationshipSignals: [],
  },
};

async function extractAndPersist(): Promise<{ firestore: string[]; vector: string[] }> {
  const worker = new DeepExtractionWorker({ batchTurns: 1 });
  await worker['persistExtraction'](
    job.userId,
    {
      entities: [],
      facts: SAID,
      relationships: [],
      categories: [],
      importanceScore: 0.9,
      shouldPersist: true,
    },
    job
  );
  return {
    firestore: seen.sets
      .filter((s) => s.path.includes('/dynamic_facts/'))
      .map((s) => String(s.data.value)),
    vector: seen.vector
      .filter((d) => d.metadata.category === 'fact')
      .map((d) => String(d.metadata.factValue)),
  };
}

async function sweep(): Promise<string[]> {
  const added: string[] = [];
  const store: SweepStore = {
    facts: async () => [],
    add: async (_u, docs) => {
      added.push(...docs.map((d) => String(d.data.value)));
      return docs.length;
    },
  };
  await sweepCall(
    {
      userId: job.userId,
      sessionId: job.sessionId,
      startedAt: job.timestamp,
      lines: ['the door code is 4821', 'wifi password is sunshine42', 'my pin is 9087'],
    },
    { llm: async () => JSON.stringify(SAID), store, now: job.timestamp }
  );
  return added;
}

function controlStore(key: string, value = 'old') {
  const written: Array<Record<string, unknown>> = [];
  const forgotten: string[] = [];
  const old: Record<string, unknown> = { entityName: 'User', key, value, confidence: 0.9 };
  const store: MemoryControlStore = {
    facts: async () => [{ id: 'f1', data: old }],
    fact: async () => old,
    copies: async () => [{ id: 'f1', data: old }],
    forgotten: async () => [],
    forget: async (_u, id, _d, at) => {
      forgotten.push(id);
      old.forgottenAt = at;
    },
    correct: async (_u, _wrong, right) => {
      written.push(right.data);
    },
  };
  return { store, written, forgotten };
}

beforeEach(() => {
  seen.sets.length = 0;
  seen.vector.length = 0;
  seen.info.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SPOKEN_CREDENTIAL_FILTER on', () => {
  beforeEach(() => {
    vi.stubEnv('SPOKEN_CREDENTIAL_FILTER', 'on');
  });

  it('deep extraction writes the age and house number, not the door code, wifi password or PIN', async () => {
    const { firestore, vector } = await extractAndPersist();
    expect(firestore.sort()).toEqual([...ORDINARY].sort());
    expect(vector.sort()).toEqual([...ORDINARY].sort());
  });

  it('logs the drop once per write as a count and categories, never the key or value', async () => {
    await extractAndPersist();
    const drops = seen.info.filter((a) => a[1] === 'Did not store a spoken credential');
    expect(drops).toEqual([
      [
        {
          writer: 'extraction',
          count: 3,
          categories: { 'access-code': 1, password: 1, pin: 1 },
        },
        'Did not store a spoken credential',
      ],
    ]);
    const logged = JSON.stringify(drops);
    for (const secret of ['4821', 'sunshine42', '9087', 'door_code', 'wifi_password', 'user-1']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('the after-call sweep adds the age and house number only', async () => {
    expect((await sweep()).sort()).toEqual([...ORDINARY].sort());
  });

  it('logs the sweep drops as the sweep', async () => {
    await sweep();
    const drops = seen.info.filter((a) => a[1] === 'Did not store a spoken credential');
    expect(drops.map((a) => (a[0] as { writer: string }).writer)).toEqual(['sweep']);
  });

  it('a correction that is a code is not kept, and forgets the fact it corrects', async () => {
    const door = controlStore('door_code', '4821');
    const result = await correctRemembered('user-1', 'f1', '5512', door.store);
    expect(result).toEqual({ kind: 'not-kept', reason: 'credential' });
    expect(door.written).toEqual([]);
    // the old code goes the way the forget button takes it, not left stored
    expect(door.forgotten).toEqual(['f1']);
    // trying again finds nothing to correct, so the app shows "not found", not a loop
    expect(await correctRemembered('user-1', 'f1', '5512', door.store)).toEqual({
      kind: 'not-found',
    });
  });

  it('an ordinary correction is written as before', async () => {
    const age = controlStore('age');
    const kept = await correctRemembered('user-1', 'f1', '35', age.store);
    expect(kept.kind).toBe('corrected');
    expect(age.written.map((d) => d.value)).toEqual(['35']);
    expect(age.forgotten).toEqual([]);
  });
});

describe('SPOKEN_CREDENTIAL_FILTER off (the kill switch)', () => {
  beforeEach(() => {
    vi.stubEnv('SPOKEN_CREDENTIAL_FILTER', 'off');
  });

  it('deep extraction writes every fact, as on main', async () => {
    const { firestore, vector } = await extractAndPersist();
    expect(firestore.sort()).toEqual([...ALL_VALUES].sort());
    expect(vector.sort()).toEqual([...ALL_VALUES].sort());
    expect(seen.info.filter((a) => a[1] === 'Did not store a spoken credential')).toEqual([]);
  });

  it('the after-call sweep adds every fact', async () => {
    expect((await sweep()).sort()).toEqual([...ALL_VALUES].sort());
  });

  it('a correction to a door code is written, and nothing is forgotten outside it', async () => {
    const door = controlStore('door_code', '4821');
    expect((await correctRemembered('user-1', 'f1', '5512', door.store)).kind).toBe('corrected');
    expect(door.written.map((d) => d.value)).toEqual(['5512']);
    expect(door.forgotten).toEqual([]);
  });
});
