/**
 * Semantic recall across two calls, through the real write and read paths:
 * call 1's facts are built by the deep-extraction writer and Ferni's own story
 * by the life-ledger recorder; call 2 reads them back through the Firestore
 * recall store and the per-turn hook. Only the database and the embedding
 * model are fakes.
 */
import { describe, expect, it, vi } from 'vitest';

// An in-memory Firestore: bogle_users/{uid}/{collection}, newest-first ordering.
const fs = vi.hoisted(() => {
  const data = new Map<string, Array<Record<string, unknown>>>();
  const query = (rows: Array<Record<string, unknown>>) => ({
    orderBy: (field: string) =>
      query([...rows].sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')))),
    limit: (n: number) => ({
      get: async () => ({ docs: rows.slice(0, n).map((d) => ({ data: () => d })) }),
    }),
  });
  const db = {
    collection: () => ({
      doc: (uid: string) => ({ collection: (name: string) => query(data.get(`${uid}/${name}`) ?? []) }),
    }),
  };
  return { data, db };
});
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));

import { createMemoryRecall } from '../memory-recall-hook.js';
import { buildExtractionFirestoreWritePayloads } from '../../../memory/dynamic/extraction-firestore-docs.js';
import { contentWords } from '../../../memory/recall/session-recall.js';
import type { RetrievalEmbedder } from '../../../memory/recall/semantic-recall.js';
import {
  createLedgerRecorder,
  type LedgerFact,
  type LedgerStore,
} from '../../personas/life-ledger.js';

/**
 * A stand-in for the embedding model: texts about the same thing share an
 * axis, whatever words they use. (The live check against Vertex is
 * semantic-recall-live.test.ts.)
 */
const TOPICS: Array<[string, RegExp]> = [
  ['errands', /book flights|ought to get sorted|before the weekend/i],
  ['reading', /history book|reading/i],
  ['craft', /pottery|clay/i],
  ['pet', /retriever|pup/i],
];
const embed: RetrievalEmbedder = async (texts) =>
  texts.map((t) => {
    const hit = TOPICS.findIndex(([, re]) => re.test(t));
    return [...TOPICS.map((_, i) => (i === hit ? 1 : 0.05)), 0.05, 0.05, 0.05, 0.05];
  });
const settle = () => new Promise((r) => setTimeout(r, 0));
const noLog = { debug: () => undefined };

function memoryLedger(): LedgerStore & { rows: LedgerFact[] } {
  const rows: LedgerFact[] = [];
  return {
    rows,
    async save(_u, facts) {
      rows.push(...facts);
    },
    async recent(_u, personaId, limit) {
      return rows
        .filter((f) => f.personaId === personaId)
        .sort((a, b) => b.saidAt.localeCompare(a.saidAt))
        .slice(0, limit);
    },
  };
}

/** Call 1: what the extraction worker writes for the caller's plans and dog. */
function seedCallOne(uid: string): void {
  const payloads = buildExtractionFirestoreWritePayloads(
    uid,
    {
      entities: [],
      relationships: [],
      facts: [
        {
          entityName: 'user',
          factType: 'event',
          key: 'travel_plan',
          value: 'needs to book flights to Lisbon for the wedding',
          confidence: 0.9,
        },
        { entityName: 'Biscuit', factType: 'attribute', key: 'breed', value: 'golden retriever', confidence: 0.9 },
      ],
    },
    { sessionId: 'call-1', turnNumber: 4 },
    '2026-10-09T18:00:00.000Z',
    noLog
  );
  fs.data.set(`${uid}/dynamic_facts`, payloads.facts);
}

/** Speak one user turn the way the SDK reports it: an interim, then the final. */
async function userTurn(recall: ReturnType<typeof createMemoryRecall>, interim: string, final: string) {
  const notes = [recall.noteFor(interim)];
  await settle(); // the interim's embedding lands while they are still talking
  notes.push(recall.noteFor(final));
  recall.newTurn();
  return notes.filter(Boolean).join('\n');
}

const QUESTION = 'anything I ought to get sorted before the weekend?';

describe('semantic recall across calls', () => {
  it('finds a fact from call 1 by a question that shares no words with it', async () => {
    seedCallOne('u-flights');
    const fact = 'needs to book flights to Lisbon for the wedding';
    // The premise: keyword recall has nothing to go on.
    const shared = [...contentWords(QUESTION)].filter((w) => contentWords(`travel_plan ${fact}`).has(w));
    expect(shared).toEqual([]);

    const keywordOnly = createMemoryRecall({ userId: 'u-flights', semantic: false, embed });
    await keywordOnly.ready;
    keywordOnly.noteFor('hey there');
    keywordOnly.newTurn();
    expect(await userTurn(keywordOnly, 'anything I ought to get', QUESTION)).not.toContain(fact);

    const semantic = createMemoryRecall({ userId: 'u-flights', semantic: true, embed });
    await semantic.ready;
    await settle(); // the call-start index
    semantic.noteFor('hey there');
    semantic.newTurn();
    const note = await userTurn(semantic, 'anything I ought to get sorted', QUESTION);
    expect(note).toContain(fact);
    expect(note).not.toContain('golden retriever');
  });

  it("puts Ferni's own story from call 1 in call 2's first note", async () => {
    const ledger = memoryLedger();
    const call1 = createLedgerRecorder('u-story', {
      store: ledger,
      extract: async () => ['Ferni has been reading an old history book about the silk road'],
      now: () => Date.parse('2026-10-09T18:00:00Z'),
    });
    call1.add('ferni', "Honestly I've been reading this old history book about the silk road traders.");
    expect(await call1.flush()).toBe(1);

    const call2 = createMemoryRecall({ userId: 'u-story', ledgerStore: ledger, semantic: true, embed });
    await call2.ready;
    expect(call2.noteFor("hey, it's me again")).toContain(
      'Ferni has been reading an old history book about the silk road'
    );
  });

  it('brings back an older story, past the first note, when the talk turns to it', async () => {
    const ledger = memoryLedger();
    ledger.rows.push({
      personaId: 'ferni',
      fact: 'Ferni has been reading an old history book about the silk road',
      saidAt: '2026-09-01T18:00:00.000Z',
    });
    for (let i = 0; i < 10; i++) {
      ledger.rows.push({
        personaId: 'ferni',
        fact: `Ferni repotted plant number ${i} on the porch`,
        saidAt: `2026-10-0${i % 9}T18:00:00.000Z`,
      });
    }
    const story = 'silk road';
    for (const semantic of [false, true]) {
      const recall = createMemoryRecall({ userId: `u-old-${semantic}`, ledgerStore: ledger, semantic, embed });
      await recall.ready;
      await settle();
      expect(recall.noteFor('hey, good to hear you')).not.toContain(story);
      recall.newTurn();
      const later = await userTurn(recall, 'what was that thing you were reading', 'what was that thing you were reading again');
      if (semantic) expect(later).toContain(story);
      else expect(later).not.toContain(story);
    }
  });

  it('brings back an older open thread when the talk turns to it', async () => {
    fs.data.set(
      'u-threads/summaries',
      ['Ask how the move went', 'Ask about the new job', 'Check on the sore knee', 'Ask how the pottery class went'].map(
        (item, i) => ({ timestamp: `2026-10-0${9 - i}T10:00:00Z`, followUpItems: [item] })
      )
    );
    const recall = createMemoryRecall({ userId: 'u-threads', semantic: true, embed });
    await recall.ready;
    await settle();
    expect(recall.noteFor('hi')).not.toContain('pottery');
    recall.newTurn();
    expect(await userTurn(recall, "I've been getting my hands into clay", "I've been getting my hands into clay again")).toContain(
      'Ask how the pottery class went'
    );
  });

  it('never waits on a slow embedder: the note is keyword recall, at once', async () => {
    seedCallOne('u-slow');
    let queries = 0;
    const hung: RetrievalEmbedder = (_texts, role) => {
      if (role === 'query') queries++;
      return new Promise(() => undefined); // never answers
    };
    const recall = createMemoryRecall({ userId: 'u-slow', semantic: true, embed: hung });
    await recall.ready; // the snapshot doesn't wait for the index either
    recall.noteFor('hey there');
    recall.newTurn();
    const started = performance.now();
    const note = recall.noteFor("how's Biscuit doing these days, anything I ought to get sorted?");
    const ms = performance.now() - started;
    expect(queries).toBe(1); // the turn's embedding was started, and is still pending
    expect(note).toContain('golden retriever'); // keyword recall still works
    expect(note).not.toContain('book flights'); // semantic-only results just miss this turn
    expect(ms).toBeLessThan(20);
  });
});
