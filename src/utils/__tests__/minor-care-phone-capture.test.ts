/**
 * MINOR_CARE=on, an anonymous phone caller (anon:<id>, never a verified owner) who says
 * "I'm only 14." Dev call AJ_bcFfLpBzdEW8 (2026-10-24): detection fired on that turn
 * ('MINOR_CARE likely minor' 15:44:12.873Z), yet the per-turn capture pipeline kept storing.
 * process-turn.ts and turn-handler.ts call these writers without asking memoryHeld, so the
 * hold has to live in each writer, at write time: fastCapture's deep-extraction queue, the
 * deep extraction worker (12 dynamic_facts, 8 dynamic_entities), knowledge capture (4
 * entity-store entities) and the relationship network (Riley, Jess).
 *
 * Each case runs the real writer with only storage faked, after the real detector read the
 * caller's words the way the phone path does (session-init binds the anon user,
 * transcript-handler calls heldAfter), and checks the same writer still stores for a verified
 * owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as string[]);

/** A fake Firestore that records every write path (src/tests/setup.ts mocks both getFirestoreDb paths). */
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        id: path.split('/').at(-1),
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: async () => void written.push(path),
        add: async () => {
          written.push(path);
          return { id: 'auto' };
        },
        update: async () => void written.push(path),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }) => void written.push(r.path);
  return Object.assign(ref(''), {
    batch: () => ({ set: tx, update: tx, delete: tx, commit: async () => undefined }),
  });
});

// Knowledge capture: the LLM extractor and the entity store are storage, so they're faked.
vi.mock('../../memory/knowledge-graph/extractors/index.js', () => ({
  extractEntities: async () => ({
    entities: [
      {
        name: 'Riley',
        type: 'person',
        relationship: 'best friend',
        attributes: {},
        confidence: 0.9,
      },
    ],
  }),
  extractFacts: async () => ({ facts: [] }),
  extractRelationships: async () => ({ relationships: [] }),
}));
vi.mock('../../memory/entity-store/integration.js', () => ({
  initializeEntityStore: async () => undefined,
  isEntityStoreReady: () => true,
}));
vi.mock('../../memory/entity-store/entity-resolver.js', () => ({
  resolvePerson: async (userId: string) => {
    written.push(`entity_store/${userId}/person`);
    return { entity: { id: 'e1', canonicalName: 'Riley' }, isNew: true };
  },
}));
vi.mock('../../memory/entity-store/storage.js', () => ({
  createEntity: async (userId: string) => {
    written.push(`entity_store/${userId}/entity`);
    return { id: 'e2' };
  },
  createMention: async () => undefined,
  upsertRelationship: async () => undefined,
}));
vi.mock('../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => null,
}));
vi.mock('../../services/data-layer/hooks/superhuman-hooks.js', () => ({
  onRelationshipNetworkChange: async () => undefined,
}));

import { getFirestoreDb } from '../firestore-utils.js';
import { getFirestoreDb as superhumanDb } from '../../services/superhuman/firestore-utils.js';
import {
  MINOR_CARE_NOTE,
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../minor-care.js';
import { fastCapture } from '../../memory/dynamic/fast-capture.js';
import {
  DeepExtractionWorker,
  type DeepExtractionJob,
} from '../../memory/dynamic/deep-extraction-worker.js';
import {
  captureTurn,
  initializeKnowledgeCapture,
} from '../../memory/knowledge-graph/services/knowledge-capture.js';
import { recordMention } from '../../services/superhuman/relationship-network.js';

type Case = 'held' | 'owner' | 'off';
const CASES: Case[] = ['held', 'owner', 'off'];
const RILEY = 'My best friend Riley and I had a fight today and I feel kind of awful.';
let n = 0;

/**
 * A phone call in the given state, read the way the phone path reads it: session-init binds the
 * anon user (session-init-handler.ts), then transcript-handler.ts runs heldAfter on the final
 * transcript. held: flag on; owner: a verified owner who said the same; off: flag off.
 */
function phoneCall(c: Case): { sessionId: string; userId: string } {
  n++;
  const sessionId = `session-AJ_phone${n}-1792856630903`;
  const userId = `anon:18818ea5-84db-455f-a625-${String(n).padStart(12, '0')}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm only 14.", { userId });
  // The precondition every case below rests on: held only when it should be.
  expect(memoryHeld(sessionId)).toBe(c === 'held');
  return { sessionId, userId };
}

function storedFor(userId: string): string[] {
  return written.filter((p) => p.includes(userId));
}

beforeEach(() => {
  vi.mocked(getFirestoreDb).mockReturnValue(fakeDb as never);
  vi.mocked(superhumanDb).mockReturnValue(fakeDb as never);
  written.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: an anonymous phone caller who said "I\'m only 14."', () => {
  it.each(CASES)('fastCapture queues no deep extraction when held (%s)', async (c) => {
    const { sessionId, userId } = phoneCall(c);
    const result = await fastCapture({ transcript: RILEY, userId, sessionId, turnNumber: 6 });
    if (c === 'held') expect(result.asyncJobId).toBeNull();
    else expect(result.asyncJobId).toEqual(expect.stringContaining(sessionId));
  });

  it.each(CASES)(
    'deep extraction queued before they said their age writes nothing once held (%s)',
    async (c) => {
      const { sessionId, userId } = phoneCall(c);
      const worker = new DeepExtractionWorker();
      const internals = worker as unknown as {
        getGeminiModel: () => Promise<unknown>;
        processJob: (j: DeepExtractionJob) => Promise<void>;
      };
      internals.getGeminiModel = async () => null; // hint-only extraction, no LLM
      await internals.processJob({
        jobId: `deep-${userId}-${sessionId}-6`,
        userId,
        sessionId,
        turnNumber: 6,
        transcript: RILEY,
        timestamp: new Date('2026-10-24T15:44:22Z'),
        priority: 'normal',
        fastCaptureHints: {
          mentionedEntities: [
            { name: 'Riley', type: 'person', context: 'best friend', confidence: 0.9 },
          ],
          emotionSignals: [],
          topicHints: ['friendship'],
          dateSignals: [],
          relationshipSignals: [],
        },
      });
      const entities = storedFor(userId).filter((p) => p.includes('/dynamic_entities/'));
      if (c === 'held') expect(storedFor(userId)).toEqual([]);
      else expect(entities.length).toBeGreaterThan(0);
    }
  );

  it.each(CASES)('knowledge capture stores no entity when held (%s)', async (c) => {
    const { sessionId, userId } = phoneCall(c);
    await initializeKnowledgeCapture();
    await captureTurn({ userId, sessionId, turnNumber: 6, transcript: RILEY });
    if (c === 'held') expect(storedFor(userId)).toEqual([]);
    else expect(storedFor(userId)).toContain(`entity_store/${userId}/person`);
  });

  it.each(CASES)('the relationship network keeps no new person when held (%s)', async (c) => {
    const { userId } = phoneCall(c);
    await recordMention(userId, { name: 'Jess', type: 'acquaintance', context: RILEY });
    const people = storedFor(userId).filter((p) => p.includes('/relationship_network/'));
    if (c === 'held') expect(people).toEqual([]);
    else expect(people.length).toBe(1);
  });

  it('the note tells Ferni not to promise to remember', () => {
    // On the dev call Ferni said "I will remember Riley, Jess, and Lincoln High for next time."
    expect(MINOR_CARE_NOTE).toMatch(/never (?:say|promise) you'll remember/i);
  });
});
