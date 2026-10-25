/**
 * #2367 / #2385 through the real writers (commitments, journal, tools, corrections): each one is called with a credential the caller
 * said and the document it writes is checked. Only Firestore is faked; every document any
 * writer sends to it is recorded. All values are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as unknown[]);
const reads = vi.hoisted(() => ({ exists: true }));
const fakeDb = vi.hoisted(() => {
  const record = async (doc: unknown) => {
    written.push(doc);
    return { id: 'doc-1', update: record };
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
    get: async () => ({ empty: true, exists: reads.exists, docs: [], data: () => ({}) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        set: (_ref: unknown, doc: unknown) => written.push(doc),
        get: async () => ({ exists: false }),
      }),
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
    static vector = (v: number[]) => v;
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

import { recordCallerCommitments } from '../services/superhuman/after-call-commitments.js';
import { rememberGoodbyePlan } from '../services/superhuman/commitment-follow-up.js';
import { saveCommitment } from '../services/trust-systems/commitment-tracking.js';
import { addJournalEntry } from '../services/stores/journal-store.js';
import { productivityExecutor } from '../agents/shared/tool-executors/productivity-executor.js';
import { memoryExecutor } from '../agents/shared/tool-executors/memory-executor.js';
import { executeLegacyFallback } from '../agents/shared/tool-executors/legacy-fallback-executor.js';
import { firestoreRepairStore } from '../agents/personas/friend-repair-store.js';
import { getJournalService } from '../services/journal/index.js';
import { saveCommitment as keepCommitment } from '../services/superhuman/commitment-keeper.js';
import { settleAwaitingAnswers } from '../services/trust-systems/commitment-follow-through.js';
import { createOpenLoop } from '../services/superhuman/semantic-intelligence/open-loops.js';
import { getConversationHistoryService } from '../services/stores/conversation-history.js';
import {
  recordCorrection,
  recordImplicitPreference,
} from '../services/superhuman/user-corrections.js';
import { recordSharedMoment as recordJoke } from '../services/superhuman/inside-joke-memory.js';
import { recordSharedMoment } from '../intelligence/context-builders/relationship/deep-relationship.js';
import { startStoryCapture } from '../services/superhuman/event-story-capture.js';
import { FirestoreVectorStore } from '../memory/firestore-vector-store/core.js';
import { withoutCredentials } from '../memory/firestore-vector-store/helpers.js';
import { createErrandStore } from '../services/stores/errand-store.js';
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
  reads.exists = true;
  vi.stubEnv('SPOKEN_CREDENTIAL_FILTER', 'on'); // off by default on main; these test redaction
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('every tool, commitment and journal writer stores no credential', () => {
  it('a commitment from the after-call capture', async () => {
    const added: unknown[] = [];
    const sink = {
      openTexts: async () => [],
      add: async (_u: string, d: unknown) => void added.push(d),
    };
    await recordCallerCommitments(
      [
        {
          subjectKind: 'self',
          attribute: 'commitment',
          value: 'send Sam the password',
          confidence: 0.9,
          source: { quote: "I'm going to text Sam that my password is hunter2" },
        },
      ],
      { userId: 'user-1', sessionId: 'session-1', now: Date.now() },
      { sink, forgotten: async () => [], env: { COACH_COMMITMENT_CAPTURE: 'on' } }
    );
    written.push(...added);
    expectNoSecret();
  });

  it('a goodbye plan kept as a commitment', async () => {
    await rememberGoodbyePlan('user-1', "text Sam the gate code, it's 4821", async (_u, d) => {
      written.push(d);
    });
    expect(stored()).not.toContain('4821');
    expect(stored()).toContain('[redacted]');
  });

  it('a tracked commitment', async () => {
    const now = new Date();
    await saveCommitment({
      id: 'c1',
      userId: 'user-1',
      content: 'text Sam that my password is hunter2',
      type: 'explicit',
      status: 'active',
      createdAt: now,
      lastMentioned: now,
      followUpDate: null,
      followUpType: 'gentle',
      originalContext: SAID,
      progressNotes: [{ date: now, note: 'door code is 4821' }],
    } as never);
    expectNoSecret();
  });

  it('a journal entry in the journal store', async () => {
    await addJournalEntry('user-1', { content: `Today ${SAID}`, source: 'app' } as never);
    expectNoSecret();
  });

  it('a journal entry from the journal tool', async () => {
    await productivityExecutor.execute('addJournal', { entry: SAID, mood: 'ok' }, ctx);
    expectNoSecret();
  });

  it('a fact the caller asked Ferni to remember, and its update', async () => {
    await memoryExecutor.execute('rememberAboutUser', { fact: SAID }, ctx);
    await memoryExecutor.execute(
      'updateMemory',
      { oldFact: 'gate code is 1234', newFact: 'the gate code is 4821 now' },
      ctx
    );
    expectNoSecret();
  });

  it('the legacy remember tool', async () => {
    await executeLegacyFallback('rememberAboutUser', { fact: SAID }, ctx);
    await executeLegacyFallback(
      'updateMemory',
      { oldFact: 'gate code is 1234', newFact: 'the gate code is 4821 now' },
      ctx
    );
    expectNoSecret();
    expect(stored()).toContain('the gate code is [redacted] now');
  });

  it('a correction the caller made to Ferni', async () => {
    await firestoreRepairStore.add('user-1', {
      ferniSaid: 'your door code is 1234',
      said: 'no, the door code is 4821',
      right: 'the door code is 4821',
      wrong: 'the door code is 1234',
      at: new Date().toISOString(),
      supersededFactIds: [],
    } as never);
    expectNoSecret();
  });

  it('a journal entry from the journal service', async () => {
    vi.stubEnv('JOURNAL_ONE_STORE', 'off'); // its own Firestore write; the one store is tested above
    await getJournalService().createEntry('user-1', {
      content: `Today ${SAID}`,
      source: 'digital_twin',
      agentId: 'twin-1',
    } as never);
    expectNoSecret();
  });

  it('a commitment the commitment keeper saves', async () => {
    await keepCommitment({
      userId: 'user-1',
      statement: "I'm going to text Sam that my password is hunter2",
      summary: 'text Sam that my password is hunter2',
      type: 'intention',
      emotionalWeight: 0.3,
    } as never);
    expect(stored()).not.toContain('hunter2');
    expect(stored()).toContain('[redacted]');
  });
});

describe('the writers the #2425 review found store no credential', () => {
  it('the answer to a commitment follow-up', async () => {
    await settleAwaitingAnswers('user-1', `yes I did it, ${SAID}`, [
      {
        id: 'c1',
        content: 'change the door code',
        awaitingAnswer: true,
        followUpAskedAt: new Date(),
      },
    ]);
    expectNoSecret();
  });

  it('an open loop', async () => {
    await createOpenLoop('user-1', {
      type: 'intention',
      content: SAID,
      context: SAID,
    } as never);
    expectNoSecret();
  });

  it('a conversation session from the web app', async () => {
    await getConversationHistoryService().recordSession('user-1', {
      personaId: 'ferni',
      duration: 5,
      highlights: [SAID],
      transcript: SAID,
    } as never);
    expectNoSecret();
  });

  it('a correction and an implicit preference', async () => {
    await recordCorrection('user-1', {
      whatFerniSaid: 'your door code is 1234',
      whatUserCorrected: SAID,
      correctInformation: SAID,
    });
    await recordImplicitPreference('user-1', {
      preference: 'prefers texts',
      evidence: [SAID],
      confidence: 0.4,
    } as never);
    expectNoSecret();
  });

  it('a shared moment, both writers', async () => {
    await recordJoke('user-1', 'inside_joke' as never, SAID, SAID, ['door'], SAID);
    await recordSharedMoment('user-1', { type: 'phrase', content: SAID, whatTheySaid: SAID });
    expectNoSecret();
  });

  it('an event story', async () => {
    reads.exists = false; // no stored profile yet
    await startStoryCapture('user-1', `party where ${SAID}`, 'party', '2026-10-22');
    expectNoSecret();
  });

  it('a vector document, with an embedding of the old text dropped', async () => {
    const doc = {
      id: 'v1',
      text: SAID,
      embedding: [0.5],
      metadata: { source: 'memory', note: SAID },
    };
    const clean = withoutCredentials(doc);
    expect(clean.embedding).toBeUndefined();
    expect(JSON.stringify(clean)).not.toContain('4821');
    const store = new FirestoreVectorStore();
    Object.assign(store as object, { _initialized: true, db: fakeDb, useFallback: false });
    await store.addDocument(doc);
    expectNoSecret();
  });

  it('an errand goal', async () => {
    await createErrandStore(fakeDb as never, () => 'e1').create(
      { userId: 'user-1', goal: SAID, constraints: {} } as never,
      new Date(),
      1
    );
    expectNoSecret();
  });
});
