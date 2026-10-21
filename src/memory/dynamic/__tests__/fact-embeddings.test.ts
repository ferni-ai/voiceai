import { describe, expect, it } from 'vitest';
import { FACT_VECTOR_DIMENSION, withFactEmbeddings } from '../fact-embeddings.js';
import { buildExtractionFirestoreWritePayloads } from '../extraction-firestore-docs.js';
import type { RetrievalEmbedder } from '../../recall/semantic-recall.js';
import { vectorOf } from '../../recall/stored-fact-vectors.js';

const noLog = { debug: () => undefined };
/** What the deep-extraction worker writes for two facts. */
const facts = buildExtractionFirestoreWritePayloads(
  'u1',
  {
    entities: [],
    relationships: [],
    facts: [
      {
        entityName: 'Biscuit',
        factType: 'attribute',
        key: 'breed',
        value: 'golden retriever',
        confidence: 0.9,
      },
      {
        entityName: 'user',
        factType: 'state',
        key: 'job',
        value: 'nurse at the clinic',
        confidence: 0.8,
      },
    ],
  },
  { sessionId: 's1', turnNumber: 3 },
  '2026-10-20T10:00:00.000Z',
  noLog
).facts;

const vectorFor = (i: number) =>
  Array.from({ length: FACT_VECTOR_DIMENSION }, (_, j) => (j === i ? 1 : 0.01));

function spyEmbed(make: (texts: string[]) => number[][] = (t) => t.map((_, i) => vectorFor(i))) {
  const calls: Array<{ texts: string[]; role: string }> = [];
  const embed: RetrievalEmbedder = async (texts, role) => {
    calls.push({ texts, role });
    return make(texts);
  };
  return { calls, embed };
}
const model = async () => 'text-embedding-005';

describe('withFactEmbeddings', () => {
  it('off: writes the facts exactly as before, with no embedding request', async () => {
    const { calls, embed } = spyEmbed();
    const out = await withFactEmbeddings(facts, { enabled: false, embed, model });
    expect(out).toBe(facts);
    expect(calls).toEqual([]);
  });

  it('on: one request for the batch, and each fact stored with its vector', async () => {
    const { calls, embed } = spyEmbed();
    const out = await withFactEmbeddings(facts, { enabled: true, embed, model });
    expect(calls).toEqual([
      {
        texts: ['Biscuit breed: golden retriever', 'they job: nurse at the clinic'],
        role: 'document',
      },
    ]);
    expect(out.map((d) => [d.embeddingModel, d.embeddingTask])).toEqual([
      ['text-embedding-005', 'RETRIEVAL_DOCUMENT'],
      ['text-embedding-005', 'RETRIEVAL_DOCUMENT'],
    ]);
    // The stored VectorValue reads back as the vector the model gave.
    expect(vectorOf(out[0].embedding)).toEqual(vectorFor(0));
    expect(vectorOf(out[1].embedding)).toEqual(vectorFor(1));
    expect(out.map((d) => d.value)).toEqual(facts.map((d) => d.value));
  });

  it('on: a failed request writes every fact without a vector, never dropping one', async () => {
    const embed: RetrievalEmbedder = async () => {
      throw new Error('quota');
    };
    const out = await withFactEmbeddings(facts, { enabled: true, embed, model });
    expect(out).toEqual(facts);
    expect(out.some((d) => 'embedding' in d)).toBe(false);
  });

  it('on: a vector of the wrong size is left off that fact only', async () => {
    const { embed } = spyEmbed((t) => [vectorFor(0), [0.1, 0.2]].slice(0, t.length));
    const out = await withFactEmbeddings(facts, { enabled: true, embed, model });
    expect(vectorOf(out[0].embedding)).toEqual(vectorFor(0));
    expect(out[1]).toEqual(facts[1]);
  });
});
