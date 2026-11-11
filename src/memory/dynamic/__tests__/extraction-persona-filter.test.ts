/**
 * Persona canon is never stored as the caller's facts (right-moment memory spec §5.3,
 * ruling 6). The extractor reads the whole call, so "I live in Wyoming", said by Ferni,
 * came back as "Ferni | location = lives in Wyoming" and was written to the caller's
 * dynamic_facts. With ENTITY_HYGIENE on, a fact whose subject is a persona (Ferni, or a
 * bare teammate name with no relationship the caller stated) is dropped at the one
 * chokepoint both writers share; with it off, nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ info: [] as unknown[][] }));

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: () => undefined,
    info: (...args: unknown[]) => seen.info.push(args),
    warn: () => undefined,
    error: () => undefined,
  };
  return { createLogger: () => logger, getLogger: () => logger };
});

import { sanitizeExtractionResult } from '../extraction-vector-docs.js';
import { buildExtractionFirestoreWritePayloads } from '../extraction-firestore-docs.js';
import { sweepCall, type SweepStore } from '../fact-sweep.js';
import type {
  ExtractedEntity,
  ExtractedFact,
  ExtractedRelationship,
  ExtractionResult,
} from '../deep-extraction-worker.js';

type Slice = Pick<ExtractionResult, 'entities' | 'facts' | 'relationships'>;

const log = { debug: () => undefined };

const entity = (name: string, attributes: Record<string, string> = {}): ExtractedEntity => ({
  name,
  type: 'person',
  attributes,
  confidence: 0.9,
});
const fact = (entityName: string, key: string, value: string): ExtractedFact => ({
  entityName,
  factType: 'attribute',
  key,
  value,
  confidence: 0.9,
});
const rel = (source: string, target: string, type: string): ExtractedRelationship => ({
  source,
  target,
  type,
  strength: 0.8,
  bidirectional: false,
});

function result(part: Partial<Slice>): Slice {
  return { entities: [], facts: [], relationships: [], ...part };
}

const FERNI_SAID = result({
  entities: [entity('Ferni'), entity('Priya', { relationship: 'sister' })],
  facts: [
    fact('Ferni', 'location', 'lives in Wyoming'),
    fact('User', 'home', 'Maplewood'),
    fact('Priya', 'job', 'teacher'),
  ],
});

const droppedLines = () =>
  seen.info.filter(([fields]) => (fields as { event?: string }).event === 'PERSONA_FACT_DROPPED');

beforeEach(() => {
  seen.info.length = 0;
  vi.stubEnv('ENTITY_HYGIENE', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('sanitizeExtractionResult, persona subjects (ENTITY_HYGIENE on)', () => {
  it('drops a Ferni self-statement and its entity row, and keeps the caller and their sister', () => {
    const out = sanitizeExtractionResult(FERNI_SAID, 'u1', log);
    expect(out.facts.map((f) => f.entityName)).toEqual(['User', 'Priya']);
    expect(out.entities.map((e) => e.name)).toEqual(['Priya']);
    expect(out.droppedPersona).toBe(1);
  });

  it('keeps a teammate-named friend whose entity row states the relationship', () => {
    const out = sanitizeExtractionResult(
      result({
        entities: [entity('Maya', { relationship: 'coworker' })],
        facts: [fact('Maya', 'job', 'nurse')],
      }),
      'u1',
      log
    );
    expect(out.facts).toHaveLength(1);
    expect(out.entities.map((e) => e.name)).toEqual(['Maya']);
    expect(out.droppedPersona).toBe(0);
  });

  it('keeps a teammate-named friend tied to the speaker by a relationship row', () => {
    const out = sanitizeExtractionResult(
      result({
        entities: [entity('Maya')],
        facts: [fact('Maya', 'job', 'nurse')],
        relationships: [rel('the speaker', 'Maya', 'professional')],
      }),
      'u1',
      log
    );
    expect(out.facts).toHaveLength(1);
    expect(out.entities.map((e) => e.name)).toEqual(['Maya']);
    expect(out.relationships).toHaveLength(1);
    expect(out.droppedPersona).toBe(0);
  });

  it('drops a bare teammate with no relationship', () => {
    const out = sanitizeExtractionResult(
      result({ entities: [entity('Maya')], facts: [fact('Maya', 'job', 'nurse')] }),
      'u1',
      log
    );
    expect(out.facts).toEqual([]);
    expect(out.entities).toEqual([]);
    expect(out.droppedPersona).toBe(1);
  });

  it('drops a teammate whose only relationship row ties them to someone else, or is unstated', () => {
    const out = sanitizeExtractionResult(
      result({
        entities: [entity('Alex', { relationship: 'acquaintance' })],
        facts: [fact('Alex', 'hobby', 'chess'), fact('Maya', 'job', 'nurse')],
        relationships: [rel('Marcus', 'Maya', 'friend')],
      }),
      'u1',
      log
    );
    expect(out.facts).toEqual([]);
    expect(out.droppedPersona).toBe(2);
  });

  it('drops Ferni even when the extractor gave him a relationship', () => {
    const out = sanitizeExtractionResult(
      result({
        entities: [entity('Ferni', { relationship: 'friend' })],
        facts: [fact('Ferni', 'favorite food', 'pancakes')],
        relationships: [rel('User', 'Ferni', 'friend')],
      }),
      'u1',
      log
    );
    expect(out.facts).toEqual([]);
    expect(out.entities).toEqual([]);
    expect(out.droppedPersona).toBe(1);
  });

  it('logs one PERSONA_FACT_DROPPED line with counts only, and none for the vector-doc pass', () => {
    sanitizeExtractionResult(FERNI_SAID, 'riley-test-uid', log);
    sanitizeExtractionResult(FERNI_SAID, 'riley-test-uid', log, null);
    const lines = droppedLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.[0]).toMatchObject({
      event: 'PERSONA_FACT_DROPPED',
      reason: 'persona',
      count: 1,
      entities: 1,
    });
    const text = JSON.stringify(lines[0]);
    for (const word of ['Ferni', 'Wyoming', 'location', 'Priya', 'Maplewood']) {
      expect(text).not.toContain(word);
    }
  });

  it('logs nothing when no persona fact was dropped', () => {
    sanitizeExtractionResult(result({ facts: [fact('User', 'home', 'Maplewood')] }), 'u1', log);
    expect(droppedLines()).toEqual([]);
  });
});

describe('ENTITY_HYGIENE off', () => {
  it('leaves the result unchanged: the same Firestore payloads as before, no log', () => {
    vi.stubEnv('ENTITY_HYGIENE', 'off');
    const out = sanitizeExtractionResult(FERNI_SAID, 'u1', log);
    expect(out.facts.map((f) => f.entityName)).toEqual(['Ferni', 'User', 'Priya']);
    expect(out.entities.map((e) => e.name)).toEqual(['Ferni', 'Priya']);
    expect(out.droppedPersona).toBe(0);

    const base = {
      extractedAt: '2026-10-31T00:00:00.000Z',
      sessionId: 's1',
      turnNumber: 2,
      source: 'deep_extraction',
      syncedToSpanner: false,
    };
    const payloads = buildExtractionFirestoreWritePayloads(
      'u1',
      FERNI_SAID,
      { sessionId: 's1', turnNumber: 2 },
      '2026-10-31T00:00:00.000Z',
      log
    );
    expect(JSON.stringify(payloads)).toBe(
      JSON.stringify({
        entities: [
          { ...base, name: 'Ferni', type: 'person', attributes: {}, confidence: 0.9 },
          {
            ...base,
            name: 'Priya',
            type: 'person',
            attributes: { relationship: 'sister' },
            confidence: 0.9,
          },
        ],
        facts: [
          {
            ...base,
            entityName: 'Ferni',
            factType: 'attribute',
            key: 'location',
            value: 'lives in Wyoming',
            confidence: 0.9,
          },
          {
            ...base,
            entityName: 'User',
            factType: 'attribute',
            key: 'home',
            value: 'Maplewood',
            confidence: 0.9,
          },
          {
            ...base,
            entityName: 'Priya',
            factType: 'attribute',
            key: 'job',
            value: 'teacher',
            confidence: 0.9,
          },
        ],
        relationships: [],
        dropped: { entities: 0, facts: 0, relationships: 0 },
      })
    );
    expect(droppedLines()).toEqual([]);
  });
});

describe('the after-call fact sweep', () => {
  function memoryStore() {
    const added: Array<{ id: string; data: Record<string, unknown> }> = [];
    const store: SweepStore = {
      facts: async () => [],
      add: async (_u, docs) => {
        added.push(...docs);
        return docs.length;
      },
    };
    return { store, added };
  }
  const sweep = (reply: ExtractedFact[], store: SweepStore) =>
    sweepCall(
      {
        userId: 'u1',
        sessionId: 's1',
        startedAt: new Date('2026-10-31T18:00:00Z'),
        lines: ['ferni was saying he lives out in wyoming', 'i live in maplewood'],
      },
      { llm: async () => JSON.stringify(reply), store }
    );

  it('drops a persona fact the sweep found, and keeps the caller own', async () => {
    const { store, added } = memoryStore();
    const n = await sweep(
      [fact('Ferni', 'location', 'lives in Wyoming'), fact('User', 'home', 'Maplewood')],
      store
    );
    expect(n).toBe(1);
    expect(added.map((d) => d.data.entityName)).toEqual(['User']);
  });

  it('keeps a teammate-named friend when a fact in the same window states the relation', async () => {
    const { store, added } = memoryStore();
    const relation: ExtractedFact = {
      ...fact('Maya', 'relation to user', "User's coworker"),
      factType: 'relationship',
    };
    await sweep([relation, fact('Maya', 'job', 'nurse'), fact('Jordan', 'job', 'pilot')], store);
    expect(added.map((d) => `${String(d.data.entityName)} ${String(d.data.key)}`)).toEqual([
      'Maya relation to user',
      'Maya job',
    ]);
  });

  it('with ENTITY_HYGIENE off, stores the persona fact as before', async () => {
    vi.stubEnv('ENTITY_HYGIENE', 'off');
    const { store, added } = memoryStore();
    await sweep(
      [fact('Ferni', 'location', 'lives in Wyoming'), fact('User', 'home', 'Maplewood')],
      store
    );
    expect(added.map((d) => d.data.entityName)).toEqual(['Ferni', 'User']);
  });
});
