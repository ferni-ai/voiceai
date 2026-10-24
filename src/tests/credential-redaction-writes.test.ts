/**
 * #2367 / #2385 through the real writers: each one is called with a credential the caller
 * said and the document it writes is checked. Only Firestore is faked; every document any
 * writer sends to it is recorded. All values are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as unknown[]);
const fakeDb = vi.hoisted(() => {
  const record = async (doc: unknown) => {
    written.push(doc);
    return { id: 'doc-1' };
  };
  const node: Record<string, unknown> = {};
  Object.assign(node, {
    id: 'doc-1',
    collection: () => node,
    doc: () => node,
    where: () => node,
    orderBy: () => node,
    limit: () => node,
    select: () => node,
    set: record,
    add: record,
    update: record,
    get: async () => ({ empty: true, exists: true, docs: [], data: () => ({}) }),
    batch: () => ({
      set: (_ref: unknown, doc: unknown) => written.push(doc),
      update: (_ref: unknown, doc: unknown) => written.push(doc),
      commit: async () => undefined,
    }),
  });
  return node;
});
const fakeFirestore = vi.hoisted(() => {
  class FieldValue {
    static increment = () => new FieldValue();
    static serverTimestamp = () => new FieldValue();
    static delete = () => new FieldValue();
  }
  class Timestamp {
    static fromDate = (d: Date) => d;
    static now = () => new Date();
  }
  class Firestore {
    constructor() {
      return fakeDb;
    }
  }
  return { FieldValue, Timestamp, Firestore, getFirestore: () => fakeDb };
});
vi.mock('firebase-admin/firestore', () => fakeFirestore);
vi.mock('@google-cloud/firestore', () => fakeFirestore);
vi.mock('../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => fakeDb,
}));
vi.mock('../services/superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => fakeDb,
}));
vi.mock('../memory/embeddings.js', () => ({ embed: async () => [0.1] }));
vi.mock('../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async () => undefined }),
}));
vi.mock('../memory/summarizer.js', () => ({
  summarizeConversation: async () => ({
    text: 'They said the door code is 4821',
    keyMoments: ['my password is hunter2'],
  }),
}));
vi.mock('../memory/advanced-retrieval.js', () => ({
  getConversationPrimingMemories: () =>
    Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, content: 'x', emotionalWeight: 0.5 })),
}));
vi.mock('../memory/memory-consolidator.js', () => ({
  getMemoryConsolidator: () => ({
    runConsolidationPass: async () => ({
      consolidated: [{ id: 'c1', topic: 'home', consolidatedContent: 'the door code is 4821' }],
    }),
  }),
}));
vi.mock('../memory/human-signal-extractor.js', () => ({ extractHumanSignals: () => null }));
vi.mock('../memory/cross-persona/shared-memory-api.js', () => ({
  storeMemory: async () => undefined,
  PERSONA_MEMORY_INTERESTS: {},
}));
vi.mock('../services/data-layer/integrations/index.js', () => ({
  indexCommitment: () => undefined,
  deindexCommitment: () => undefined,
}));

import { sanitizeExtractionResult } from '../memory/dynamic/extraction-vector-docs.js';
import { markSummarized, persistTurn } from '../services/memory/realtime-memory.js';
import { FirestoreStore } from '../memory/storage/firestore-store.js';
import { saveCommitment } from '../services/trust-systems/commitment-tracking.js';
import { createEntity, createMention, updateEntity } from '../memory/entity-store/storage.js';
import { promoteSessionToFirestore } from '../memory/dynamic/stm-promotion.js';
import { recordTurn } from '../memory/dynamic/stm-buffer.js';
import type { FastCaptureResult } from '../memory/dynamic/fast-capture.js';
import { SummarizationWorker } from '../workers/summarization-worker.js';
import type { ToolExecutionContext } from '../agents/shared/tool-executors/types.js';

const SECRETS = ['4821', 'hunter2', '4111', '078-05-1120'];
const SAID = 'the door code is 4821 and my password is hunter2, card 4111 1111 1111 1111';

/** Every document written since the test began, as one string. */
const stored = (): string => JSON.stringify(written);

function expectNoSecret(): void {
  expect(written.length).toBeGreaterThan(0);
  for (const secret of SECRETS) expect(stored()).not.toContain(secret);
  expect(stored()).toContain('[redacted]');
}

const ctx: ToolExecutionContext = { userId: 'user-1', sessionId: 'session-1', personaId: 'ferni' };
const log = { debug: () => undefined };

beforeEach(() => {
  written.length = 0;
  vi.stubEnv('SPOKEN_CREDENTIAL_FILTER', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('every memory writer stores no credential', () => {
  it('deep extraction and the sweep: entity attributes and fact values', () => {
    const out = sanitizeExtractionResult(
      {
        entities: [
          {
            name: 'Sam',
            type: 'person',
            attributes: { gate_code: '4821', note: SAID },
            confidence: 1,
          },
        ],
        facts: [
          {
            entityName: 'user',
            factType: 'state',
            key: 'note',
            value: `Sam said ${SAID}`,
            confidence: 1,
          },
        ],
        relationships: [],
      },
      'user-1',
      log,
      null
    );
    written.push(out.entities, out.facts);
    expectNoSecret();
    expect(out.entities[0]?.attributes).not.toHaveProperty('gate_code');
  });

  it('a transcript turn', async () => {
    await persistTurn('user-1', 'conv-1', { role: 'user', content: SAID, timestamp: new Date() });
    expectNoSecret();
    expect(stored()).toContain('the door code is [redacted]');
  });

  it('a call summary on the call and on the profile', async () => {
    await markSummarized('user-1', 'conv-1', `They shared ${SAID}`);
    expectNoSecret();
  });

  it('a summary in the summaries store', async () => {
    const store = new FirestoreStore();
    Object.assign(store as object, { db: fakeDb, _initialized: true }); // initialized, on the fake
    await store.saveSummary('user-1', {
      id: 's1',
      sessionId: 'session-1',
      timestamp: new Date(),
      duration: 60,
      turnCount: 4,
      mainTopics: ['home'],
      keyPoints: [`They said ${SAID}`],
      emotionalArc: 'calm',
    } as never);
    expectNoSecret();
  });

  it('an entity and a mention in the entity store', async () => {
    await createEntity('user-1', { name: 'Sam', type: 'person', notes: SAID } as never);
    await createMention('user-1', { entityId: 'e1', context: SAID, transcript: SAID } as never);
    expectNoSecret();
  });

  it('entity and mention fields set after the spread (topics, aliases, facts) are redacted too', async () => {
    await createEntity('user-1', {
      name: 'Sam',
      type: 'person',
      topics: ['the door code is 4821'],
      aliases: ['my password is hunter2'],
    } as never);
    await createMention('user-1', {
      entityId: 'e1',
      topics: ['card 4111 1111 1111 1111'],
      facts: ['the door code is 4821'],
    } as never);
    expectNoSecret();
  });

  it('a summary from the summarization worker', async () => {
    const worker = new SummarizationWorker();
    const run = worker as unknown as { summarizeConversation: (job: unknown) => Promise<unknown> };
    await run.summarizeConversation({
      jobId: 'j1',
      type: 'conversation',
      userId: 'user-1',
      conversationId: 'conv-1',
      turns: [{ role: 'user', content: SAID }],
    });
    await worker.stop();
    expect(stored()).not.toContain('4821');
    expect(stored()).not.toContain('hunter2');
    expect(stored()).toContain('[redacted]');
  });

  it('an entity update in the entity store', async () => {
    await updateEntity('user-1', 'e1', { notes: SAID } as never);
    expectNoSecret();
  });

  it('the last thing said about an entity, promoted at the end of the call', async () => {
    const capture = {
      mentionedEntities: [{ name: 'Sam', type: 'person', context: SAID, confidence: 0.9 }],
      emotionSignals: [],
      topicHints: [],
      dateSignals: [],
      relationshipSignals: [],
      linkingSignals: [],
      asyncJobId: null,
      captureTimeMs: 1,
    } as unknown as FastCaptureResult;
    for (let turn = 0; turn < 3; turn++) recordTurn('stm-1', 'user-1', capture, SAID, turn);
    const result = await promoteSessionToFirestore('stm-1', 'user-1', {
      minMentionCount: 1,
      minImportanceScore: 0,
    });
    expect(result.entitiesPromoted).toBe(1);
    expectNoSecret();
  });

  it('a consolidated memory from the summarization worker', async () => {
    const worker = new SummarizationWorker();
    const run = worker as unknown as {
      consolidateMemoriesAsync: (job: unknown) => Promise<unknown>;
    };
    await run.consolidateMemoriesAsync({
      jobId: 'j2',
      type: 'memory_consolidation',
      userId: 'user-1',
    });
    await worker.stop();
    expect(stored()).toContain('the door code is [redacted]');
    expect(stored()).not.toContain('4821');
  });
});
