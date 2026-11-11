/**
 * An anonymous try-first (demo) visitor, `device:demo_<ms>_<rand>`, was told "No account
 * needed": nothing from the call is kept. Not the words (turns), not the summary, not the
 * profile, not memory or the knowledge graph (entities, mentions, threads).
 *
 * The REAL session services (createSessionServices: profile, conversation, every turn,
 * end-of-call summary), the REAL session cleanup and the REAL processTurn run against a
 * Firestore and a Redis cache that record the path of every write
 * (tests/helpers/write-recorder.ts); no writer is faked. A signed-in member runs the same
 * paths as the control and must still write, so "zero writes" can't come from a path that
 * stopped running. Each path is checked without the others' gates where it can be (the
 * session is not bound to its caller unless the test says so), so each gate goes red alone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const rec = await vi.hoisted(async () => {
  const { createWriteRecorder } = await import('../../../tests/helpers/write-recorder.js');
  return createWriteRecorder();
});

vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  getFirestore: () => rec.db,
}));
vi.mock('@google-cloud/firestore', async (orig) => {
  const actual = await orig<object>();
  class Firestore {
    constructor() {
      return rec.db;
    }
  }
  return { ...actual, Firestore, default: { ...actual, Firestore } };
});
vi.mock('../../../utils/shared-firestore.js', async (orig) => ({
  ...(await orig<object>()),
  sharedFirestore: () => rec.db,
}));
vi.mock('../../../memory/storage/redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => rec.redis,
  getRedisCacheAsync: async () => rec.redis,
}));

import { handleSessionCleanup, type CleanupContext } from '../cleanup-handler.js';
import { processTurn } from '../../processors/turn-processor/process-turn.js';
import { createSessionServices } from '../../../services/session/session-manager.js';
import {
  recordAgentMessage,
  recordUserMessage,
} from '../../../services/conversation-thread/thread-recorder.js';
import { createPersistenceStore } from '../../../services/persistence/index.js';
import { notStored } from '../../../memory/storage/profile-save-guard.js';
import {
  bindSessionUser,
  IDLE_MS,
  memoryHeld,
  resetMinorCare,
  userHeld,
} from '../../../utils/minor-care.js';
import { isAnonymousDemoUser } from '../../../utils/synthetic-user.js';
import type { SessionServices } from '../../../services/types.js';
import type { PersonaConfig } from '../../../personas/types.js';

const BUDGET_MS = 60_000;
// As /demo-token mints it (routes/token.ts) and user-identification.ts prefixes it.
const DEMO = 'device:demo_1793560000000_k3x9q2';
const MEMBER = 'member-uid-4b7e';
// Fictional: the visitor names people, a number and a plan, so capture, mentions and
// preferences all fire.
const SAID =
  "Hi! My sister Marjorie Testwell and I are planning a trip, my number is 415-555-0137. I love gardening and I'll call Robert tomorrow at 10am.";

/** Writes whose path names `id`, raw or as a sanitized doc id (':' becomes '_'). */
const under = (id: string): string[] =>
  rec.writes.filter((w) => w.includes(id) || w.includes(id.replace(':', '_')));
const shape = (list: string[], id: string): string[] =>
  [
    ...new Set(list.map((w) => w.split(id).join('<id>').split(id.replace(':', '_')).join('<id>'))),
  ].sort();
const missing = (list: string[], writers: RegExp[]): RegExp[] =>
  writers.filter((w) => !list.some((x) => w.test(x)));

async function settle(done: () => boolean): Promise<void> {
  await vi.waitFor(() => expect(done()).toBe(true), { timeout: 20_000, interval: 50 });
  await new Promise((r) => {
    setTimeout(r, 300);
  });
}

let n = 0;

/** A call through the real session services: start, two turns, end. */
async function call(userId: string): Promise<void> {
  const services = await createSessionServices({ sessionId: `demo-call-${++n}`, userId });
  services.addTurn('user', SAID);
  services.addTurn('assistant', 'That sounds lovely. Where are you two headed?');
  await services.saveProfile().catch(() => undefined);
  await services.endSession();
}

async function endSession(userId: string): Promise<void> {
  const ctx: CleanupContext = {
    sessionId: `demo-end-${++n}`,
    userId,
    services: {
      endSession: vi.fn(async () => undefined),
      sessionStartTime: Date.now() - 6 * 60_000,
    } as Partial<SessionServices> as SessionServices,
    sessionPersona: { id: 'ferni', name: 'Ferni' } as PersonaConfig,
    voiceHumanization: null,
    autoOptimizer: { endSession: vi.fn() },
    userData: { turnCount: 8, isTrialUser: true },
  };
  await handleSessionCleanup(ctx, BUDGET_MS);
}

async function turn(userId: string): Promise<void> {
  const sessionId = `demo-turn-${++n}`;
  const ctx = {
    userText: SAID,
    userData: { userId, turnCount: 3, recentTranscripts: [SAID] },
    services: { sessionId, userId },
    persona: { id: 'ferni', name: 'Ferni' },
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  };
  await processTurn(ctx as never).catch(() => undefined); // the tail needs a live session
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetMinorCare();
  rec.writes.length = 0;
});

// What a call writes for a member: the conversation, every turn as it happens (raw words),
// the conversation's counters, and the cached profile.
const CALL_WRITERS = [
  /^set bogle_users\/<id>\/conversations\/conv_[^/]+$/,
  /^add bogle_users\/<id>\/conversations\/conv_[^/]+\/turns\//,
  /^update bogle_users\/<id>\/conversations\/conv_[^/]+$/,
  /^redis\.setCompressed profile:v1:<id>$/,
];
const CLEANUP_WRITERS = [
  /^set bogle_users\/<id>\/voice_sessions\//, // session summary
  /^set bogle_users\/<id>\/active_context\/current$/, // continuity
  /^set bogle_users\/<id>\/relationship_arc\/data$/,
  /^set user_seeds\/<id>/, // seeds
  /^set bogle_users\/<id>\/persona_affinities\//,
  /^set bogle_users\/<id>\/deep_understanding\//,
];
const TURN_WRITERS = [
  /^set bogle_users\/<id>\/relationship_network\//, // knowledge graph: people mentioned
  /^set entity_store\/<id>\/entities\//, // knowledge graph: entities
  /^set entity_store\/<id>\/mentions\//,
];

describe('anonymous try-first calls save nothing', { timeout: BUDGET_MS + 30_000 }, () => {
  it('the id /demo-token mints is the demo visitor; a member, anon: and a CLI device are not', () => {
    expect(isAnonymousDemoUser(DEMO)).toBe(true);
    expect(isAnonymousDemoUser(' DEVICE:DEMO_1_x')).toBe(true); // compared as comparableId gives it
    for (const id of [
      MEMBER,
      'anon:caller-1',
      'device:cli-1',
      'device:abc',
      'demo_1_x',
      undefined,
    ]) {
      expect(isAnonymousDemoUser(id)).toBe(false);
    }
  });

  it('session services: no conversation, turn or profile is written; a member gets all three', async () => {
    await call(DEMO);
    await call(MEMBER);
    await settle(() => missing(shape(under(MEMBER), MEMBER), CALL_WRITERS).length === 0);
    expect(under(DEMO)).toEqual([]);
    expect(missing(shape(under(MEMBER), MEMBER), CALL_WRITERS)).toEqual([]);
    expect(under(MEMBER).filter((w) => w.includes('/turns/'))).toHaveLength(2); // one per turn
  });

  it('session cleanup: no summary, continuity, arc, seeds or affinity; a member still writes them', async () => {
    await endSession(DEMO);
    await endSession(MEMBER);
    expect(under(DEMO)).toEqual([]);
    expect(missing(shape(under(MEMBER), MEMBER), CLEANUP_WRITERS)).toEqual([]);
  });

  it('processTurn: no knowledge-graph capture (entities, mentions, people); a member still captures', async () => {
    await turn(DEMO);
    await turn(MEMBER); // last: once its writes land, the visitor's would have too
    await settle(() => missing(shape(under(MEMBER), MEMBER), TURN_WRITERS).length === 0);
    expect(under(DEMO)).toEqual([]);
    expect(missing(shape(under(MEMBER), MEMBER), TURN_WRITERS)).toEqual([]);
  });

  it('the thread recorder records nothing for the visitor; a member still gets a thread', async () => {
    for (const userId of [DEMO, MEMBER]) {
      const message = { userId, sessionId: `demo-thread-${++n}`, personaId: 'ferni' as const };
      await recordUserMessage({ ...message, content: SAID });
      await recordAgentMessage({ ...message, content: 'Have a wonderful trip.' });
    }
    expect(under(DEMO)).toEqual([]);
    expect(shape(under(MEMBER), MEMBER)).toEqual(
      expect.arrayContaining([expect.stringMatching(/conversation_threads/)])
    );
  });

  it("the hold: a session bound to the visitor holds memory, and every store holds the visitor's writes", async () => {
    bindSessionUser('demo-bound-1', DEMO);
    bindSessionUser('member-bound-1', MEMBER);
    expect(memoryHeld('demo-bound-1')).toBe(true);
    expect(memoryHeld('member-bound-1')).toBe(false);
    expect(userHeld(DEMO)).toBe(true);
    expect(userHeld(MEMBER)).toBe(false);

    const store = createPersistenceStore<{ note: string }>({ collection: 'demo_hold_probe' });
    await store.setImmediate(DEMO, { note: 'planning a trip' });
    await store.setImmediate(MEMBER, { note: 'planning a trip' });
    expect(under(DEMO)).toEqual([]);
    expect(under(MEMBER).length).toBeGreaterThan(0);
  });

  it("a live visitor's binding outlasts the bounded session map; an idle one is evicted", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      bindSessionUser('demo-idle-1', 'device:demo_1793560000000_idle01');
      vi.setSystemTime(Date.now() + IDLE_MS + 1);
      bindSessionUser('demo-live-1', DEMO);
      for (let i = 0; i <= 5_000; i++) bindSessionUser(`filler-${i}`, `member-filler-${i}`);
      expect(memoryHeld('demo-live-1')).toBe(true); // still bound: every write stays held
      expect(memoryHeld('demo-idle-1')).toBe(false); // the eviction ran
    } finally {
      vi.useRealTimers();
    }
  });

  it('every profile save is refused for the visitor (the number they said never lands); a member saves', () => {
    expect(notStored({ id: DEMO } as never)).toBe(true);
    expect(notStored({ id: MEMBER } as never)).toBe(false);
  });
});
