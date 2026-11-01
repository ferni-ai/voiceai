/**
 * The person on a call Ferni places for a member (`onbehalf:<callId>`) never signed up: nothing
 * is stored for them, with ONBEHALF_WRITE_GATE on or off.
 *
 * - The call's first turn (trial check, then a spoken number): no trial, no contact saved, no
 *   profile, and no write under bogle_users/onbehalf: once outreach persistence flushes.
 * - Each line of defence alone: every MemoryStore backend's saveProfile (profile-save-guard.ts)
 *   and every persistence store (services/persistence), under bogle_users or a root collection.
 *
 * A member is the control each time: the same paths store their profile, number and data.
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
vi.mock('@google-cloud/firestore', async (orig) => {
  const actual = await orig<object>();
  class Firestore {
    constructor() {
      return rec.db;
    }
  }
  return { ...actual, Firestore, default: { ...actual, Firestore } };
});
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  getFirestore: () => rec.db,
}));
vi.mock('../redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => rec.redis,
  getRedisCacheAsync: async () => rec.redis,
}));

import { setStore } from '../store-factory.js';
import { getDefaultStore, InMemoryStore } from '../in-memory-store.js';
import { getFirestoreStore } from '../firestore-store.js';
import { PostgresStore } from '../postgres-store.js';
import type { MemoryStore } from '../store.js';
import { createUserProfile } from '../../../types/user-profile.js';
import { runTrialCheck } from '../../../agents/voice-agent/new-user-arc.js';
import {
  onSessionStart,
  onUserMessage,
} from '../../../services/trust-and-identity/voice-agent-integration.js';
import { initializeOutreachPersistence } from '../../../services/outreach/outreach-intelligence.js';
import { createPersistenceStore, flushAllStores } from '../../../services/persistence/index.js';

// Fictional: the number a called person says out loud.
const SAID = 'Sure, my number is 555-555-0142, have him call me back.';

let n = 0;
const metaFor = (userId: string) =>
  userId.startsWith('onbehalf:')
    ? { type: 'on_behalf_call', session_id: userId, callId: userId.slice(9) }
    : { firebase_uid: userId };

/** Four turns, the last a moment the phone ask waits for; whether that turn asks for a number. */
async function askedForNumber(userId: string): Promise<boolean> {
  const sessionId = `ask-${++n}`;
  await onSessionStart(sessionId, metaFor(userId), null);
  const lines = [
    'hey there',
    'not much, you?',
    'busy week',
    'Can you remind me to call mom tomorrow?',
  ];
  let asked = false;
  for (const line of lines) asked = (await onUserMessage(sessionId, line, 0.5)).shouldAskForPhone;
  return asked;
}
/** A trial check and one spoken turn for `userId`, as the call's first turn runs them. */
async function callTurn(store: MemoryStore, userId: string) {
  setStore(store);
  const sessionId = `no-profile-${++n}`;
  const trial = await runTrialCheck(userId, { userProfile: null }, false, {
    isTrialUser: false,
    isFirstConversation: false,
    trialStatus: null,
  });
  await onSessionStart(sessionId, metaFor(userId), null);
  const turn = await onUserMessage(sessionId, SAID, 0.5);
  return { trial, turn };
}

afterEach(() => {
  vi.unstubAllEnvs();
  rec.writes.length = 0;
});

describe.each(['on', 'off'])('ONBEHALF_WRITE_GATE=%s', { timeout: 60_000 }, (gate) => {
  const arm = (): void => {
    vi.stubEnv('ONBEHALF_WRITE_GATE', gate);
    vi.stubEnv('PERSIST_AGENT_PROFILES', 'true');
  };

  it('the called person: no trial, no contact saved, no profile', async () => {
    arm();
    const store = getDefaultStore();
    const { trial, turn } = await callTurn(store, `onbehalf:call-01${gate}`);
    expect(trial.isTrialUser).toBe(false);
    expect(turn.contactDetected).toBe(false);
    expect(turn.shouldAskForPhone).toBe(false);
    expect(await store.getProfile(`onbehalf:call-01${gate}`)).toBeNull();
  });

  it('the called person is never asked for a number; a member at the same moment is', async () => {
    arm();
    setStore(getDefaultStore());
    expect(await askedForNumber(`onbehalf:call-06${gate}`)).toBe(false);
    expect(await askedForNumber(`member-06${gate}`)).toBe(true);
  });

  it('control: a member gets a trial and a profile with the number they gave', async () => {
    arm();
    const store = getDefaultStore();
    const { trial, turn } = await callTurn(store, `member-01${gate}`);
    expect(trial.isTrialUser).toBe(true);
    expect(turn.contactDetected).toBe(true);
    const profile = await store.getProfile(`member-01${gate}`);
    expect(profile?.contactInfo?.phone).toMatch(/5550142$/);
  });

  it('Firestore, outreach persistence flushed: nothing under bogle_users/onbehalf:', async () => {
    arm();
    await initializeOutreachPersistence();
    await callTurn(getFirestoreStore(), `onbehalf:call-02${gate}`);
    await flushAllStores();
    expect(rec.writes.filter((w) => w.includes('onbehalf:'))).toEqual([]);
    await callTurn(getFirestoreStore(), `member-02${gate}`); // control: the capture sees writes
    await flushAllStores();
    expect(rec.writes).toContain(`set bogle_users/member-02${gate}`);
    expect(rec.writes.some((w) => w.includes(`member-02${gate}/outreach_data`))).toBe(true);
  });
});

describe('each guard alone', () => {
  it('in-memory saveProfile stores nothing for the called person', async () => {
    const store = new InMemoryStore();
    await store.saveProfile(createUserProfile('onbehalf:call-03'));
    expect(await store.getProfile('onbehalf:call-03')).toBeNull();
    await store.saveProfile(createUserProfile('member-03')); // control
    expect(await store.getProfile('member-03')).not.toBeNull();
  });

  it('firestore saveProfile writes nothing for the called person', async () => {
    const store = getFirestoreStore();
    await store.saveProfile(createUserProfile('onbehalf:call-03'));
    expect(rec.writes.filter((w) => w.includes('onbehalf:'))).toEqual([]);
    await store.saveProfile(createUserProfile('member-03')); // control
    expect(rec.writes.some((w) => w.includes('bogle_users/member-03'))).toBe(true);
  });

  it('postgres saveProfile sends no query for the called person', async () => {
    const store = new PostgresStore({ connectionString: 'postgresql://test@localhost:5432/test' });
    const query = vi.fn(async () => ({ rows: [] }));
    (store as unknown as { pool: unknown }).pool = { query };
    await store.saveProfile(createUserProfile('onbehalf:call-04'));
    expect(query).not.toHaveBeenCalled();
    await store.saveProfile(createUserProfile('member-04')); // control
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'a persistence store (root collection: %s) writes nothing for the called person',
    async (useRootCollection) => {
      const store = createPersistenceStore<{ x: number }>({
        collection: `zz_guard_${String(useRootCollection)}`,
        useRootCollection,
      });
      await store.setImmediate('onbehalf:call-05', { x: 1 });
      store.set('onbehalf:call-05', { x: 2 });
      await store.flush();
      expect(rec.writes.filter((w) => w.includes('onbehalf:'))).toEqual([]);
      await store.setImmediate('member-05', { x: 1 }); // control
      expect(rec.writes.some((w) => w.includes('member-05'))).toBe(true);
      await store.shutdown();
    }
  );
});
