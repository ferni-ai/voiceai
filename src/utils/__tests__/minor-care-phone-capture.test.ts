/**
 * MINOR_CARE=on, an anonymous phone caller (anon:<id>, never a verified owner) who says
 * "I'm only 14." Dev call AJ_bcFfLpBzdEW8 (2026-10-24): detection fired on that turn
 * ('MINOR_CARE likely minor' 15:44:12.873Z), yet the per-turn capture pipeline kept storing.
 * process-turn.ts and turn-handler.ts call these writers without asking memoryHeld, so the
 * hold has to live in each writer, at write time: fastCapture's deep-extraction queue, the
 * deep extraction worker (12 dynamic_facts, 8 dynamic_entities), knowledge capture (4
 * entity-store entities) and the relationship network (Riley, Jess).
 *
 * The writers #2729 missed hold the same way: corrections and implicit preferences, stated
 * preferences, data capture (entity store, contacts, contact_relationships), FRIEND_REPAIR,
 * the relationship engine and personality profile behind recordUnifiedMoment and Creative You
 * topics. (The BTH signal writer, bth_signals, was deleted in memory v2 C5a: nothing read it.)
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
          return ref(`${path}/auto`);
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
  capturePersonEntity: async (userId: string) =>
    void written.push(`entity_store/${userId}/capture`),
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
// Corrections: the admin Firestore and the semantic index are storage.
vi.mock('../firebase-admin-app.js', async (orig) => ({
  ...(await orig<object>()),
  getAdminFirestore: () => fakeDb,
}));
vi.mock('../../services/data-layer/hooks/learning-hooks.js', () => ({
  onUserCorrectionChange: async (userId: string) => void written.push(`semantic/${userId}`),
  onImplicitPreferenceChange: async (userId: string) => void written.push(`semantic/${userId}`),
}));
// Data capture: the contact stores are storage.
vi.mock('../../services/contacts.js', () => ({
  findContact: async () => null,
  updateContact: () => undefined,
  createContact: async (userId: string) => {
    written.push(`contacts/${userId}`);
    return { id: 'c1' };
  },
}));
vi.mock('../../services/contacts/contact-relationship-service.js', () => ({
  upsertContact: async (userId: string) => void written.push(`contact_relationships/${userId}`),
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
  userHeld,
  writeHeld,
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
import { recordCallerCorrection } from '../../agents/processors/turn-processor/caller-correction.js';
import { userCorrections } from '../../services/superhuman/user-corrections.js';
import { storeUserPreferences } from '../../services/user-preferences-store.js';
import { extractPreferences } from '../../intelligence/tracking/preferences.js';
import { processDataCapture } from '../../intelligence/data-capture/index.js';
import { recordFriendRepair, type RepairStore } from '../../agents/personas/friend-repair.js';
import { recordUnifiedMoment } from '../../personality/bridge/personality-bridge.js';
import {
  clearAllRelationshipEngines,
  getRelationshipEngine,
  initializeRelationship,
} from '../../intelligence/relationship/index.js';
import { createPersonalityService } from '../../personality/v2/index.js';
import { recordConversationTopics } from '../../services/creative-you/conversation-integration.js';
import { getCreativeYouPersistence } from '../../services/creative-you/persistence.js';

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
  clearAllRelationshipEngines();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Fire-and-forget writers: wait for the write when one is expected, else a moment for none. */
async function settled(userId: string, expectWrite: boolean): Promise<string[]> {
  if (expectWrite) await vi.waitFor(() => expect(storedFor(userId).length).toBeGreaterThan(0));
  else
    await new Promise((r) => {
      setTimeout(r, 25);
    });
  return storedFor(userId);
}

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

  // No session reaches savePerson and a placeholder id is never bound to one, so userHeld can't
  // see a minor behind it: with the flag on, a placeholder id keeps no person at all.
  it.each(['on', 'off'])(
    'a placeholder id keeps no person while MINOR_CARE is %s',
    async (flag) => {
      vi.stubEnv('MINOR_CARE', flag);
      await recordMention('anonymous', { name: 'Jess', type: 'acquaintance', context: RILEY });
      const people = written.filter((p) => p.includes('/relationship_network/'));
      if (flag === 'on') expect(people).toEqual([]);
      else expect(people.length).toBe(1);
    }
  );

  it.each(CASES)('a correction of Ferni keeps nothing when held (%s)', async (c) => {
    const { sessionId, userId } = phoneCall(c);
    const said = 'Actually, Riley is my best friend, not Jess.';
    await recordCallerCorrection(userId, said, 'So Jess is your best friend?', 'ferni', sessionId);
    if (c === 'held') expect(storedFor(userId)).toEqual([]);
    else expect(storedFor(userId).join()).toContain(`bogle_users/${userId}/corrections`);
  });

  it.each(CASES)('an implicit preference keeps nothing when held (%s)', async (c) => {
    const { userId } = phoneCall(c);
    // turn-learning.ts's detectImplicitPreferences writes through this
    await userCorrections.recordImplicitPreference(userId, {
      preference: 'i usually text riley after school',
      category: 'other',
      evidence: ['I usually text Riley after school.'],
      confidence: 0.7,
    });
    if (c === 'held') expect(storedFor(userId)).toEqual([]);
    else expect(storedFor(userId).join()).toContain(`${userId}/implicit_preferences`);
  });

  it.each(CASES)('a stated preference keeps nothing when held (%s)', async (c) => {
    const { userId } = phoneCall(c);
    const preferences = extractPreferences("I'm allergic to peanuts and I love the Eagles.");
    expect(preferences.length).toBeGreaterThan(0);
    await storeUserPreferences(userId, preferences);
    if (c === 'held') expect(storedFor(userId)).toEqual([]);
    else expect(storedFor(userId)).toContain(`/user_preferences/${userId}`);
  });

  it('writeHeld: session, user or placeholder id, and only with the flag on', () => {
    const { sessionId, userId } = phoneCall('held');
    expect(writeHeld(undefined, sessionId)).toBe(true); // the session
    expect(writeHeld(userId)).toBe(true); // any of this user's sessions
    expect(writeHeld('anonymous')).toBe(true); // a placeholder no session binds
    expect(writeHeld('uid_someone_else', 'session-other')).toBe(false);
    vi.stubEnv('MINOR_CARE', 'off');
    expect(writeHeld('anonymous', sessionId)).toBe(false);
  });

  it('a placeholder id keeps no stated preference while MINOR_CARE is on', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    await storeUserPreferences('anonymous', extractPreferences('I love the Eagles.'));
    expect(written.filter((p) => p.includes('/user_preferences/'))).toEqual([]);
  });

  it.each(CASES)('data capture saves no person or contact when held (%s)', async (c) => {
    const { sessionId, userId } = phoneCall(c);
    const transcript = "My mom's number is 555-123-4567.";
    const result = await processDataCapture({ transcript, userId, sessionId });
    const stored = await settled(userId, c !== 'held');
    if (c === 'held') {
      expect(stored).toEqual([]);
      expect(result.suggestedAcknowledgment).toBeUndefined(); // no "I'll remember" either
    } else {
      expect(stored).toEqual(expect.arrayContaining([`entity_store/${userId}/capture`]));
      await vi.waitFor(() => expect(storedFor(userId)).toContain(`contacts/${userId}`));
      await vi.waitFor(() =>
        expect(storedFor(userId)).toContain(`contact_relationships/${userId}`)
      );
    }
  });

  it.each(CASES)('FRIEND_REPAIR keeps no correction when held (%s)', async (c) => {
    const { sessionId, userId } = phoneCall(c);
    vi.stubEnv('FRIEND_REPAIR', 'on');
    const store: RepairStore = {
      facts: async () => [],
      add: async (uid) => (written.push(`bogle_users/${uid}/corrections`), 'c1'),
      retire: async () => undefined,
      recent: async () => [],
    };
    const ferni = ['So your sister in Denver is getting married, that is huge.'];
    const said = "Ha, no, it's my brother in Denver, not my sister.";
    const id = await recordFriendRepair({ userId, said, ferni, callId: sessionId }, store);
    if (c === 'held') expect([id, storedFor(userId)]).toEqual([null, []]);
    else expect(storedFor(userId)).toEqual([`bogle_users/${userId}/corrections`]);
  });

  it.each(CASES)('the relationship engine keeps no moment when held (%s)', async (c) => {
    const { userId } = phoneCall(c);
    await initializeRelationship(userId, 'ferni');
    await recordUnifiedMoment({
      userId,
      personaId: 'ferni',
      type: 'vulnerability',
      message: RILEY,
    });
    const moments = getRelationshipEngine(userId, 'ferni')?.getMemory().sharedMoments ?? [];
    expect(moments.length).toBe(c === 'held' ? 0 : 1);
  });

  it.each(CASES)('the personality profile is not saved when held (%s)', async (c) => {
    const { userId } = phoneCall(c);
    // personality-context.ts and recordUnifiedMoment both record through this service
    await createPersonalityService().recordMoment({ userId, personaId: 'ferni', message: RILEY });
    const profiles = storedFor(userId).filter((p) => p.includes('/personality_profiles/'));
    if (c === 'held') expect(profiles).toEqual([]);
    else expect(profiles.length).toBe(1);
  });

  it.each(['on', 'off'])(
    'a placeholder id keeps no personality profile or engine moment (MINOR_CARE=%s)',
    async (flag) => {
      // A held call with a placeholder id: never bound to a session, so userHeld misses it
      const sessionId = `session-AJ_placeholder${++n}-1792856630903`;
      vi.stubEnv('MINOR_CARE', flag);
      heldAfter(sessionId, "I'm only 14.", { userId: 'anonymous' });
      expect([memoryHeld(sessionId), userHeld('anonymous')]).toEqual([flag === 'on', false]);
      await initializeRelationship('anonymous', 'ferni');
      await recordUnifiedMoment({
        userId: 'anonymous',
        personaId: 'ferni',
        type: 'vulnerability',
        message: RILEY,
      });
      const moments = getRelationshipEngine('anonymous', 'ferni')?.getMemory().sharedMoments;
      const profiles = written.filter((p) => p.includes('/anonymous/personality_profiles/'));
      expect([moments?.length, profiles.length]).toEqual(flag === 'on' ? [0, 0] : [1, 1]);
    }
  );

  it.each(CASES)('Creative You keeps no topic when held (%s)', async (c) => {
    const { sessionId, userId } = phoneCall(c);
    vi.spyOn(getCreativeYouPersistence(), 'saveTopicHistory').mockImplementation(
      async (uid: string) => void written.push(`topic_history/${uid}`)
    );
    recordConversationTopics(userId, ['friendship', 'school'], sessionId);
    const stored = await settled(userId, c !== 'held');
    expect(stored).toEqual(c === 'held' ? [] : [`topic_history/${userId}`]);
  });

  it('the note tells Ferni not to promise to remember', () => {
    // On the dev call Ferni said "I will remember Riley, Jess, and Lincoln High for next time."
    expect(MINOR_CARE_NOTE).toMatch(/never (?:say|promise) you'll remember/i);
  });
});
