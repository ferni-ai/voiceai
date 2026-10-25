/**
 * strip-router-store-words.ts against the Firestore emulator, with the real client:
 * documents in the shape the router wrote until 2026-10-25 (words in them) are seeded in
 * every store the job covers, with one store over a page. A dry run counts them and
 * changes nothing; --apply without the matching --confirm-project refuses; the apply
 * strips every word field, keeps every other field, records lengths, deletes every learned
 * phrase (text or hash) and a tool profile's word-keyed vocabulary, and stamps expireAt from
 * each document's own time;
 * a rerun writes nothing. bogle_users/{uid}/corrections, a different store of the same
 * name, is left alone. Skips unless FIRESTORE_EMULATOR_HOST is set:
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm vitest run \
 *     scripts/migrations/__tests__/strip-router-store-words.emulator.test.ts
 */
import { FieldValue, Firestore, type DocumentData } from '@google-cloud/firestore';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../strip-router-store-words.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = `demo-strip-router-${Date.now().toString(36)}`;
const SENTINEL = 'tell my boss Priya I have a migraine again';
const MARCH = '2026-03-01T10:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;

let db: Firestore;
let logged: string[];

/** Every document in the project, by path, with its update time */
async function snapshot(): Promise<Record<string, { data: DocumentData; at: string }>> {
  const out: Record<string, { data: DocumentData; at: string }> = {};
  const walk = async (cols: FirebaseFirestore.CollectionReference[]): Promise<void> => {
    for (const col of cols) {
      for (const ref of await col.listDocuments()) {
        const snap = await ref.get();
        if (snap.exists) out[ref.path] = { data: snap.data() ?? {}, at: String(snap.updateTime) };
        await walk(await ref.listCollections());
      }
    }
  };
  await walk(await db.listCollections());
  return out;
}
const data = async (path: string) => (await db.doc(path).get()).data() ?? {};
const run = async (...flags: string[]) =>
  main(['node', 'strip', ...flags], db, FieldValue.delete());

describe.skipIf(!emulator)('strip-router-store-words on the emulator', () => {
  beforeAll(async () => {
    vi.stubEnv('GCLOUD_PROJECT', PROJECT);
    db = new Firestore({ projectId: PROJECT });
    const seed: Array<[string, DocumentData]> = [
      [
        'routing_events/r1',
        { userId: 'u-1', input: SENTINEL, selectedTool: 'weather', timestamp: MARCH },
      ],
      [
        'routing_events/clean',
        {
          userId: 'u-2',
          inputLength: 4,
          selectedTool: 'timer',
          timestamp: MARCH,
          expireAt: new Date('2026-04-01T00:00:00Z'),
        },
      ],
      ['routing_events/notime', { userId: 'u-2', input: SENTINEL }],
      [
        'semantic_router_corrections/c1',
        {
          userId: 'u-1',
          originalQuery: SENTINEL,
          normalizedQuery: SENTINEL.toLowerCase(),
          predictedArgs: { task: SENTINEL },
          actualArgs: { task: SENTINEL },
          conversationContext: [SENTINEL],
          userFeedback: SENTINEL,
          predictedTool: 'weather',
          actualTool: 'set_reminder',
          timestamp: MARCH,
        },
      ],
      [
        'semantic_routing_feedback/f1',
        { userId: 'u-1', inputText: SENTINEL, outcome: { success: true }, timestamp: MARCH },
      ],
      [
        'semantic_routing_corrections/u-1/corrections/k1',
        { userId: 'u-1', inputText: SENTINEL, correctTool: 'set_reminder', timestamp: MARCH },
      ],
      [
        'semantic_routing_corrections/u-2/corrections/k2',
        { userId: 'u-2', inputText: SENTINEL, correctTool: 'timer', timestamp: MARCH },
      ],
      [
        'semantic_routing_vocabulary/u-1',
        {
          userId: 'u-1',
          updatedAt: MARCH,
          phrases: [
            {
              phrase: SENTINEL.toLowerCase(),
              toolId: 'set_reminder',
              confidence: 0.5,
              usageCount: 2,
              source: 'implicit',
            },
            {
              phraseHash: 'already-hashed',
              toolId: 'timer',
              confidence: 0.9,
              usageCount: 1,
              source: 'explicit',
            },
          ],
        },
      ],
      [
        'semantic_router_community_patterns/p1',
        {
          incorrectTool: 'weather',
          correctTool: 'set_reminder',
          occurrenceCount: 3,
          keywords: ['priya', 'migraine'],
          queryPattern: SENTINEL,
          queryExamples: [{ query: SENTINEL, count: 1 }],
          updatedAt: MARCH,
        },
      ],
      // personalization.ts kept the caller's words and word pairs as vocabulary keys
      [
        'user_tool_profiles/u-1',
        {
          userId: 'u-1',
          toolBoosts: { set_reminder: 0.2 },
          vocabulary: { priya: 'send_message', 'bank pin': 'notes', '415-555-0187': 'call' },
          timePatterns: { '9': { set_reminder: 2 } },
          totalInteractions: 4,
        },
      ],
      ['user_tool_profiles/u-2', { userId: 'u-2', toolBoosts: { timer: 0.1 } }],
      // Another store named corrections: not the router's, never touched
      ['bogle_users/u-1/corrections/b1', { text: SENTINEL, inputText: SENTINEL, timestamp: MARCH }],
    ];
    // Over a page (400) in one store
    for (let i = 0; i < 405; i++) {
      seed.push([
        `semantic_routing_feedback/bulk${String(i).padStart(3, '0')}`,
        { userId: 'u-3', inputText: `${SENTINEL} ${i}`, timestamp: MARCH },
      ]);
    }
    for (let i = 0; i < seed.length; i += 400) {
      const batch = db.batch();
      for (const [path, d] of seed.slice(i, i + 400)) batch.set(db.doc(path), d);
      await batch.commit();
    }
  });

  beforeEach(() => {
    process.exitCode = undefined;
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logged.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation(
      (...a: unknown[]) => void logged.push(a.join(' '))
    );
  });

  it('a dry run prints only counts and writes nothing', async () => {
    const before = await snapshot();
    await run();
    expect(await snapshot()).toEqual(before);
    const out = logged.join('\n');
    expect(out).toContain('(DRY RUN)');
    expect(out).toContain(
      'routing_events: scanned 3, would strip words from 2, expireAt on 1 (1 with no readable time)'
    );
    expect(out).toContain(
      'semantic_router_corrections: scanned 1, would strip words from 1, expireAt on 1'
    );
    expect(out).toContain(
      'semantic_routing_feedback: scanned 406, would strip words from 406, expireAt on 406'
    );
    expect(out).toContain(
      'semantic_routing_corrections/*/corrections: scanned 2, would strip words from 2'
    );
    expect(out).toContain(
      'semantic_routing_vocabulary: scanned 1, would strip words from 1, expireAt on 1'
    );
    expect(out).toContain(
      'semantic_router_community_patterns: scanned 1, would strip words from 1, expireAt on 0'
    );
    expect(out).toContain('user_tool_profiles: scanned 2, would strip words from 1, expireAt on 0');
    expect(out).not.toMatch(/priya|migraine|u-1|u-2|r1|k1/i);
  });

  it('--apply without the matching --confirm-project refuses and writes nothing', async () => {
    const before = await snapshot();
    await run('--apply');
    expect(process.exitCode).toBe(1);
    await run('--apply', '--confirm-project=johnb-2025');
    expect(process.exitCode).toBe(1);
    expect(await snapshot()).toEqual(before);
  });

  it('--apply strips the words, keeps the rest, and a rerun writes nothing', async () => {
    const bogle = await data('bogle_users/u-1/corrections/b1');
    await run('--apply', `--confirm-project=${PROJECT}`);
    expect(process.exitCode).toBeUndefined();

    const all = await snapshot();
    const routerDocs = Object.entries(all).filter(([p]) => !p.startsWith('bogle_users/'));
    expect(JSON.stringify(routerDocs).toLowerCase()).not.toContain('priya');
    expect(all['bogle_users/u-1/corrections/b1']?.data).toEqual(bogle);

    const ts = (d: DocumentData) => (d.expireAt as FirebaseFirestore.Timestamp).toMillis();
    const r1 = await data('routing_events/r1');
    expect(r1).toMatchObject({
      userId: 'u-1',
      selectedTool: 'weather',
      inputLength: SENTINEL.length,
      timestamp: MARCH,
    });
    expect(ts(r1)).toBe(Date.parse(MARCH) + 30 * DAY);
    expect(ts(await data('routing_events/clean'))).toBe(Date.parse('2026-04-01T00:00:00Z'));
    expect(await data('routing_events/notime')).toEqual({
      userId: 'u-2',
      inputLength: SENTINEL.length,
    });

    const c1 = await data('semantic_router_corrections/c1');
    expect(Object.keys(c1).sort()).toEqual([
      'actualTool',
      'expireAt',
      'predictedTool',
      'queryLength',
      'timestamp',
      'userId',
    ]);
    expect(await data('semantic_routing_feedback/f1')).toMatchObject({
      inputLength: SENTINEL.length,
      outcome: { success: true },
    });
    expect(await data('semantic_routing_corrections/u-2/corrections/k2')).toMatchObject({
      correctTool: 'timer',
      inputLength: SENTINEL.length,
    });

    // Every learned phrase goes, the text and the hash: nothing derived from the words stays
    const vocab = await data('semantic_routing_vocabulary/u-1');
    expect(Object.keys(vocab).sort()).toEqual(['expireAt', 'updatedAt', 'userId']);
    expect(ts(vocab)).toBe(Date.parse(MARCH) + 30 * DAY);
    expect(await data('user_tool_profiles/u-1')).toEqual({
      userId: 'u-1',
      toolBoosts: { set_reminder: 0.2 },
      timePatterns: { '9': { set_reminder: 2 } },
      totalInteractions: 4,
    });
    expect(await data('user_tool_profiles/u-2')).toEqual({
      userId: 'u-2',
      toolBoosts: { timer: 0.1 },
    });
    expect(JSON.stringify(all)).not.toMatch(/already-hashed|bank pin|415-555-0187/);
    expect(await data('semantic_router_community_patterns/p1')).toEqual({
      incorrectTool: 'weather',
      correctTool: 'set_reminder',
      occurrenceCount: 3,
      updatedAt: MARCH,
    });
    expect(logged.join('\n')).toContain(
      'semantic_routing_feedback: scanned 406, stripped words from 406, expireAt on 406 (0 with no readable time), wrote 406'
    );

    const after = await snapshot();
    logged = [];
    await run('--apply', `--confirm-project=${PROJECT}`);
    expect(await snapshot()).toEqual(after);
    expect(logged.join('\n')).not.toMatch(/wrote [1-9]/);
  });
});
