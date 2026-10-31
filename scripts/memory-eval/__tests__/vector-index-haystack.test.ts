/**
 * RECALL_VECTOR_INDEX over a haystack of dynamic_facts: does the per-turn
 * nearest-facts search find a caller's fact that is older than the newest 300
 * recall loads, and does it cost anything when the fact is inside them?
 *
 * Each caller (recall-cases.json) is padded to 300 and 1,000 facts
 * (haystack-lib.ts buildHaystack, factDocs), with their own facts placed
 * oldest or newest. Each turn is the first of a fresh call through the real
 * createMemoryRecall (SEMANTIC_RECALL on), with RECALL_VECTOR_INDEX off and
 * on, reading the real firestoreRecallStore: its newest-300 query and its
 * findNearest (k = 8, cosine) run against an in-memory Firestore that sorts,
 * limits and does exact nearest neighbours, as the flat vector index does.
 * Every stored fact carries its vector, as after scripts/memory/backfill-fact-embeddings.ts.
 *
 * The turn is heard as an interim, the search lands, then the final: the
 * search is assumed back before the final transcript (it has 1.5 s in prod).
 *
 * haystack-bench.ts embeds every text with the production retrieval model and
 * runs the bench describe with HAYSTACK_VECTOR_INDEX_VECTORS set. The unit
 * describe runs the same arms with oracle vectors: a seeded random vector per
 * fact, and each turn the sum of the facts it is labelled for.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FieldValue } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';
import {
  buildHaystack,
  factDocs,
  haystackTurns,
  VECTOR_INDEX_SIZES,
  vectorIndexTexts,
  scoreHaystack,
  seededRandom,
  withCi,
  type HaystackCases,
  type HaystackScore,
  type MemoryKind,
  type Placement,
} from '../haystack-lib.js';
import type { BenchCaller } from '../recall-bench-lib.js';

// Each caller's dynamic_facts; every other collection the hook reads is empty.
const fs = vi.hoisted(() => {
  const facts = new Map<string, Array<Record<string, unknown>>>();
  const nearestAsked: number[] = [];
  type Row = Record<string, unknown>;
  const result = (rows: Row[]) => ({ docs: rows.map((d) => ({ data: () => d })) });
  const cos = (a: number[], b: number[]) => {
    let dot = 0, na = 0, nb = 0; // prettier-ignore
    a.forEach((x, i) => ((dot += x * (b[i] ?? 0)), (na += x * x), (nb += (b[i] ?? 0) ** 2)));
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  };
  const array = (v: unknown) => (v as { toArray?: () => number[] } | undefined)?.toArray?.();
  const query = (rows: Row[]): Record<string, unknown> => ({
    orderBy: (field: string, dir = 'asc') =>
      query([...rows].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (dir === 'desc' ? -1 : 1))), // prettier-ignore
    where: () => query([]),
    limit: (n: number) => query(rows.slice(0, n)),
    get: async () => result(rows),
    doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }),
    // Exact nearest neighbours by cosine, as a flat vector index answers.
    findNearest: (o: {
      vectorField: string;
      queryVector: number[];
      limit: number;
      distanceResultField: string;
    }) => {
      // prettier-ignore
      nearestAsked.push(o.limit);
      const scored = rows.flatMap((d) => {
        const v = array(d[o.vectorField]);
        return v ? [{ d, sim: cos(o.queryVector, v) }] : [];
      });
      scored.sort((a, b) => b.sim - a.sim);
      return { get: async () => result(scored.slice(0, o.limit).map(({ d, sim }) => ({ ...d, [o.distanceResultField]: 1 - sim }))) }; // prettier-ignore
    },
  });
  const db = {
    collection: (root: string) => ({
      doc: (id: string) => ({
        collection: (name: string) =>
          query(root === 'bogle_users' && name === 'dynamic_facts' ? (facts.get(id) ?? []) : []),
      }),
    }),
  };
  return { db, facts, nearestAsked };
});
vi.mock('../../../src/utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));

import { createMemoryRecall } from '../../../src/agents/multi-agent/memory-recall-hook.js';
import { factId, type RecallFact } from '../../../src/memory/recall/session-recall.js';
import type { RetrievalEmbedder } from '../../../src/memory/recall/semantic-recall.js';
import { EMBEDDING_TASK, storedFactText } from '../../../src/memory/recall/stored-fact-vectors.js';

const PLACEMENTS: Placement[] = ['targets-oldest', 'targets-newest'];

type Vectors = {
  model: string;
  document: Record<string, number[]>;
  query: Record<string, number[]>;
};

function loadCases(): { callers: BenchCaller[]; cases: HaystackCases } {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')); // prettier-ignore
  return { callers: (read('recall-cases.json') as { callers: BenchCaller[] }).callers, cases: read('fixtures/haystack-cases.json') as HaystackCases }; // prettier-ignore
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/** The facts injected for one turn, the first of a fresh call: heard as an interim, then the final. */
async function turnFacts(
  userId: string,
  userName: string,
  said: string,
  vectorIndex: boolean,
  embed: RetrievalEmbedder,
  model: string
): Promise<RecallFact[]> {
  const recall = createMemoryRecall({ userId, userName, semantic: true, vectorIndex, embeddingModel: Promise.resolve(model), embed, episodes: false, summaries: false }); // prettier-ignore
  await recall.ready;
  await settle(); // the call-start index
  const facts: RecallFact[] = [];
  const take = (note: string | null) => note && facts.push(...(recall.lastPick()?.facts ?? []));
  take(recall.noteFor(said, { final: false }));
  await settle(); // the turn's embedding, and with the flag on its nearest-facts search
  await settle();
  take(recall.noteFor(said));
  return facts;
}

type ArmScore = { size: number; placement: Placement; arm: 'off' | 'on'; score: HaystackScore };

/** Both arms at every size and placement, over every caller's turns. */
async function runArms(
  callers: BenchCaller[],
  cases: HaystackCases,
  vectors: Vectors,
  sizes = VECTOR_INDEX_SIZES
) {
  const lookup = (table: Record<string, number[]>, t: string) => {
    const v = table[t];
    if (!v) throw new Error(`no vector for "${t}"`);
    return v;
  };
  const embed: RetrievalEmbedder = async (texts, role) => texts.map((t) => lookup(role === 'query' ? vectors.query : vectors.document, t)); // prettier-ignore
  const out: ArmScore[] = [];
  for (const size of sizes)
    for (const placement of PLACEMENTS) {
      const kinds = new Map<string, MemoryKind>();
      const byFact = new Map<string, string>();
      const users = callers.map((caller) => {
        const userId = `${caller.name}@${size}-${placement}`;
        const store = buildHaystack(caller, cases, size);
        for (const m of store) kinds.set(m.id, m.kind);
        const docs = factDocs(caller.name, store, placement).map(({ id, doc }) => {
          byFact.set(`${userId}#${factId({ entity: String(doc.entityName), key: String(doc.key), value: String(doc.value), confidence: 1 })}`, id); // prettier-ignore
          // As the fact writer stores it (dynamic/fact-embeddings.ts).
          return { ...doc, embedding: FieldValue.vector(lookup(vectors.document, storedFactText(doc))), embeddingModel: vectors.model, embeddingTask: EMBEDDING_TASK }; // prettier-ignore
        });
        fs.facts.set(userId, docs);
        return { caller, userId };
      });
      for (const arm of ['off', 'on'] as const) {
        const outcomes = [];
        for (const { caller, userId } of users)
          for (const turn of haystackTurns(caller, cases)) {
            const facts = await turnFacts(userId, caller.name, turn.text, arm === 'on', embed, vectors.model); // prettier-ignore
            const found = [...new Set(facts.map((f) => byFact.get(`${userId}#${factId(f)}`) ?? `unknown:${factId(f)}`))]; // prettier-ignore
            outcomes.push({ turn, found });
          }
        out.push({ size, placement, arm, score: scoreHaystack(outcomes, (id) => kinds.get(id) ?? 'generic') }); // prettier-ignore
      }
    }
  return out;
}

function table(rows: ArmScore[]): string {
  const lines = [
    '### RECALL_VECTOR_INDEX: facts older than the newest 300\n',
    "Each turn is the first of a fresh call through createMemoryRecall (SEMANTIC_RECALL on), reading firestoreRecallStore over an in-memory Firestore: off = the newest 300 facts only; on = also findNearest k = 8 over all of them (exact, as the flat index). targets = where the caller's own labelled and update facts sit by extractedAt. recall = labelled facts that reached the injected note (target recall@injected); precision = labelled share of facts injected; small talk / backchannel = share of those turns that got any fact; near = wrong facts about the same person/pet/place. 95% Wilson intervals.\n", // prettier-ignore
    '| facts | targets | vector index | sent | precision | recall | small talk | backchannel | wrong: near / generic / other labelled | stale on update |', // prettier-ignore
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { size, placement, arm, score: s } of rows) {
    const smallTalk = withCi(s.negativesSent - s.backchannelsSent, s.negatives - s.backchannels);
    lines.push(`| ${size} | ${placement.replace('targets-', '')} | ${arm} | ${s.sent} | ${withCi(s.right, s.sent)} | ${withCi(s.found, s.labelled)} | ${smallTalk} | ${withCi(s.backchannelsSent, s.backchannels)} | ${s.wrong.near} / ${s.wrong.generic} / ${s.wrong.labelled + s.wrong.fresh} | ${s.staleSent}/${s.updates} |`); // prettier-ignore
  }
  return lines.join('\n');
}

const vectorsFile = process.env.HAYSTACK_VECTOR_INDEX_VECTORS;

describe.skipIf(!vectorsFile)('haystack bench: vector index', () => {
  it('scores RECALL_VECTOR_INDEX off and on at each size and placement', async () => {
    const vectors = JSON.parse(readFileSync(vectorsFile ?? '', 'utf8')) as Vectors;
    const { callers, cases } = loadCases();
    const report = table(await runArms(callers, cases, vectors));
    console.log(`\n${report}`);
    if (process.env.HAYSTACK_VECTOR_INDEX_OUT) writeFileSync(process.env.HAYSTACK_VECTOR_INDEX_OUT, report); // prettier-ignore
  }, 3_600_000);
});

describe('vector index arm (oracle vectors)', () => {
  const { callers, cases } = loadCases();
  /**
   * Every text shares one direction, as real embeddings sit well above zero
   * similarity, plus half as much of its own seeded random one; a turn's own
   * part is the sum of the facts it is labelled for (small talk: its own).
   */
  function oracle(): Vectors {
    const unit = (v: number[]) => {
      const norm = Math.hypot(...v); // once per vector, not once per element
      return v.map((x) => x / norm);
    };
    const random = (text: string) => {
      const next = seededRandom([...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
      return unit(Array.from({ length: 768 }, () => next() * 2 - 1));
    };
    const shared = random('shared');
    const embedding = (own: number[]) => shared.map((x, i) => x + 0.5 * (own[i] ?? 0));
    const texts = vectorIndexTexts(callers, cases);
    const own = new Map(texts.document.map((t) => [t, random(t)]));
    const document = Object.fromEntries([...own].map(([t, v]) => [t, embedding(v)]));
    const textOf = new Map<string, string>();
    for (const caller of callers)
      for (const { id, doc } of factDocs(
        caller.name,
        buildHaystack(caller, cases, 1000),
        'targets-oldest'
      ))
        // prettier-ignore
        textOf.set(`${caller.name}|${id}`, storedFactText(doc));
    const query: Record<string, number[]> = {};
    for (const caller of callers)
      for (const turn of haystackTurns(caller, cases)) {
        const about = turn.expect.map((id) => own.get(textOf.get(`${caller.name}|${id}`) ?? ''));
        if (about.some((v) => !v)) throw new Error(`no fact for ${turn.expect.join()}`);
        const sum = (about.length ? about : [random(turn.text)]) as number[][];
        query[turn.text] = embedding(unit(sum.reduce((a, v) => a.map((x, i) => x + (v[i] ?? 0)))));
      }
    return { model: 'oracle-embedding', document, query };
  }

  it('off misses facts older than the newest 300; on finds them; both find them when newest', async () => {
    fs.nearestAsked.length = 0;
    const rows = await runArms(callers, cases, oracle(), [1000]);
    const at = (placement: Placement, arm: 'off' | 'on') =>
      rows.find((r) => r.placement === placement && r.arm === arm)?.score as HaystackScore;
    const [oldOff, oldOn, newOff, newOn] = [at('targets-oldest', 'off'), at('targets-oldest', 'on'), at('targets-newest', 'off'), at('targets-newest', 'on')]; // prettier-ignore
    expect(oldOff.labelled).toBeGreaterThan(50);
    // Past the window the snapshot never holds them: nothing labelled can be recalled.
    expect(oldOff.found).toBe(0);
    // The nearest-facts search brings them back.
    expect(oldOn.found / oldOn.labelled).toBeGreaterThan(0.6);
    // Inside the window both arms find them, and the search adds nothing wrong.
    expect(newOff.found / newOff.labelled).toBeGreaterThan(0.6);
    expect(newOn.found).toBeGreaterThanOrEqual(newOff.found);
    expect(newOn.sent - newOn.right).toBeLessThanOrEqual(newOff.sent - newOff.right);
    // The search ran through firestoreRecallStore.nearest with k = 8.
    expect(fs.nearestAsked.length).toBeGreaterThan(0);
    expect(new Set(fs.nearestAsked)).toEqual(new Set([8]));
  }, 120_000);
});
