/**
 * ONBEHALF_WRITE_GATE: a call Ferni places for a member runs as `onbehalf:<callId>`,
 * and nothing about that session may be written under that id.
 *
 * The REAL session cleanup (handleSessionCleanup) and the REAL processTurn run
 * against a Firestore and a Redis cache that record the path of every write
 * (tests/helpers/write-recorder.ts); no writer is faked. The same paths run for
 * a member id as the control, and must still write: that is what makes "zero
 * writes" mean something. captureCallResult, the requester's record of the call,
 * must still write on_behalf_calls under the requester.
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
vi.mock('../../../memory/storage/redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => rec.redis,
  getRedisCacheAsync: async () => rec.redis,
}));

import { handleSessionCleanup, type CleanupContext } from '../cleanup-handler.js';
import { processTurn } from '../../processors/turn-processor/process-turn.js';
import { captureCallResult } from '../../../services/outreach/call-result-capture.js';
import {
  recordAgentMessage,
  recordUserMessage,
} from '../../../services/conversation-thread/thread-recorder.js';
import type { SessionServices } from '../../../services/types.js';
import type { PersonaConfig } from '../../../personas/types.js';

const BUDGET_MS = 60_000;
const CALLEE = 'onbehalf:test123';
const MEMBER = 'member-uid-7f3a';
// Not a member either, but outside this gate: it must keep writing, so widening the gate goes red.
const ANON = 'anon:caller-55e1';
const REQUESTER = 'requester-uid-9c1d';
// The callee gives a number and names someone: data capture, mentions and preferences all fire.
const SAID =
  "Sure, tell him my new number is 415-555-0137. I love gardening, and my friend Marjorie says hi. I'll call Robert tomorrow at 10am.";

/** Writes whose path names `id`, raw or as a sanitized doc id (':' becomes '_'). */
const under = (id: string): string[] =>
  rec.writes.filter((w) => w.includes(id) || w.includes(id.replace(':', '_')));
/** The same list with the id replaced, so a member's list compares with the callee's. */
const shape = (list: string[], id: string): string[] =>
  [
    ...new Set(list.map((w) => w.split(id).join('<id>').split(id.replace(':', '_')).join('<id>'))),
  ].sort();

let n = 0;
async function endSession(userId: string): Promise<void> {
  const ctx: CleanupContext = {
    sessionId: `gate-end-${++n}`,
    userId,
    services: {
      endSession: vi.fn(async () => undefined),
      sessionStartTime: Date.now() - 6 * 60_000,
    } as Partial<SessionServices> as SessionServices,
    sessionPersona: { id: 'ferni', name: 'Ferni' } as PersonaConfig,
    voiceHumanization: null,
    autoOptimizer: { endSession: vi.fn() },
    userData: { turnCount: 8, isTrialUser: false },
  };
  await handleSessionCleanup(ctx, BUDGET_MS);
}

async function turn(userId: string): Promise<void> {
  const sessionId = `gate-turn-${++n}`;
  const ctx = {
    userText: SAID,
    userData: { userId, turnCount: 3, recentTranscripts: [SAID] },
    services: { sessionId, userId },
    persona: { id: 'ferni', name: 'Ferni' },
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  };
  // The tail of a turn needs a live session; the writers under test run before it.
  await processTurn(ctx as never).catch(() => undefined);
}

/** Lets fire-and-forget writers finish: until `done` holds, then one more beat. */
async function settle(done: () => boolean): Promise<void> {
  await vi.waitFor(() => expect(done()).toBe(true), { timeout: 20_000, interval: 50 });
  await new Promise((r) => {
    setTimeout(r, 300);
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  rec.writes.length = 0;
});

// What each path wrote under `onbehalf:test123` before the gate (main 29c01b9d0), as shapes.
// The member control must still write every one of them, so "zero" can't come from a path
// that silently stopped running.
const CLEANUP_WRITERS = [
  /^set bogle_users\/<id>\/voice_sessions\//, // session summary
  /^set bogle_users\/<id>\/active_context\/current$/, // session summary: continuity
  /^set bogle_users\/<id>\/relationship_arc\/data$/, // relationship arc
  /^set user_seeds\/<id>/, // seed economy
  /^set bogle_users\/<id>\/persona_affinities\//, // session lifecycle
  /^redis\.delete presence:<id>$/, // session lifecycle
  /^redis\.set suppress_outreach:<id>$/, // session lifecycle
  /^set bogle_users\/<id>\/humanization\/comfort$/, // humanization state
  /^set bogle_users\/<id>\/deep_understanding\//, // deep understanding profiles
];
const TURN_WRITERS = [
  /^set bogle_users\/<id>\/relationship_network\//, // recordMention
  /^set entity_store\/<id>\/entities\//, // entity capture
  /^set entity_store\/<id>\/mentions\//,
];
const covers = (list: string[], writers: RegExp[]): RegExp[] =>
  writers.filter((w) => !list.some((x) => w.test(x)));

describe('ONBEHALF_WRITE_GATE', { timeout: BUDGET_MS + 30_000 }, () => {
  it('session cleanup writes nothing under onbehalf:; a member and an anon: caller still write', async () => {
    await endSession(CALLEE);
    await endSession(MEMBER);
    await endSession(ANON);
    expect(under(CALLEE)).toEqual([]);
    expect(covers(shape(under(MEMBER), MEMBER), CLEANUP_WRITERS)).toEqual([]);
    expect(covers(shape(under(ANON), ANON), CLEANUP_WRITERS)).toEqual([]);
  });

  it('processTurn writes nothing under onbehalf:, and the same writers still run for a member', async () => {
    await turn(CALLEE);
    await turn(ANON);
    await turn(MEMBER); // last: once its writes land, the callee's would have too
    await settle(() => covers(shape(under(MEMBER), MEMBER), TURN_WRITERS).length === 0);
    expect(under(CALLEE)).toEqual([]);
    expect(covers(shape(under(MEMBER), MEMBER), TURN_WRITERS)).toEqual([]);
    expect(covers(shape(under(ANON), ANON), TURN_WRITERS)).toEqual([]);
  });

  // Called per callee transcript (transcript-handler) and per Ferni reply (turn-observers),
  // each creating the thread on first use: the session-start gate alone left both writing.
  it('the thread recorder records nothing under onbehalf:; a member and an anon: caller still do', async () => {
    for (const userId of [CALLEE, MEMBER, ANON]) {
      const message = { userId, sessionId: `gate-thread-${++n}`, personaId: 'ferni' as const };
      await recordUserMessage({ ...message, content: SAID });
      await recordAgentMessage({ ...message, content: "I'll pass that on to him." });
    }
    expect(under(CALLEE)).toEqual([]);
    for (const id of [MEMBER, ANON]) {
      expect(shape(under(id), id)).toEqual(
        expect.arrayContaining([expect.stringMatching(/conversation_threads/)])
      );
    }
  });

  it('kill switch off: cleanup writes under the callee id again (the gate is what stops it)', async () => {
    vi.stubEnv('ONBEHALF_WRITE_GATE', 'off');
    await endSession(CALLEE);
    expect(covers(shape(under(CALLEE), CALLEE), CLEANUP_WRITERS)).toEqual([]);
  });

  it("captureCallResult still stores the call under the requester's on_behalf_calls", async () => {
    await captureCallResult(
      'call-gate-1',
      {
        callId: 'call-gate-1',
        status: 'completed',
        objectiveAchieved: true,
        outcome: 'She is going to church Sunday.',
      },
      {
        userId: REQUESTER,
        userName: 'Seth',
        userTimezone: 'America/New_York',
        originalSessionId: 'requester-session-1',
        contactQuery: 'mom',
        resolvedContact: { name: 'Mom', phone: '+14155550100', relationship: 'mom' },
        purpose: 'check in',
        objective: 'check_in',
        callType: 'personal',
        recordingConsent: false,
      }
    );
    expect(rec.writes).toContain(`set bogle_users/${REQUESTER}/on_behalf_calls/call-gate-1`);
    expect(under(CALLEE)).toEqual([]);
  });
});
