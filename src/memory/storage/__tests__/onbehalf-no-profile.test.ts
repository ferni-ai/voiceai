/**
 * The person on a call Ferni places for a member (`onbehalf:<callId>`) never signed up, so no
 * profile is ever stored for them and the number they say is never saved, with
 * ONBEHALF_WRITE_GATE on or off. The two real writers: the trial start
 * (getOrCreateProfile) and the identity hook that saves contact info a speaker gives
 * (setUserContactInfo). Both reach MemoryStore.saveProfile, which refuses the id.
 * A member is the control: the same two paths store their profile and number.
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
import { getDefaultStore } from '../in-memory-store.js';
import { getFirestoreStore } from '../firestore-store.js';
import type { MemoryStore } from '../store.js';
import { runTrialCheck } from '../../../agents/voice-agent/new-user-arc.js';
import {
  onSessionStart,
  onUserMessage,
} from '../../../services/trust-and-identity/voice-agent-integration.js';

// Fictional: the number a called person says out loud.
const SAID = 'Sure, my number is 555-555-0142, have him call me back.';

let n = 0;
/** A trial check and one spoken turn for `userId`, as the call's first turn runs them. */
async function callTurn(store: MemoryStore, userId: string): Promise<void> {
  setStore(store);
  const sessionId = `no-profile-${++n}`;
  await runTrialCheck(userId, { userProfile: null }, false, {
    isTrialUser: false,
    isFirstConversation: false,
    trialStatus: null,
  } as never);
  const meta = userId.startsWith('onbehalf:')
    ? { type: 'on_behalf_call', session_id: userId, callId: userId.slice(9) }
    : { firebase_uid: userId };
  await onSessionStart(sessionId, meta as never, null);
  await onUserMessage(sessionId, SAID, 0.5);
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

  it('the called person gets no profile and no saved number', async () => {
    arm();
    const store = getDefaultStore();
    await callTurn(store, `onbehalf:call-01${gate}`);
    expect(await store.getProfile(`onbehalf:call-01${gate}`)).toBeNull();
  });

  it('control: a member gets a profile with the number they gave', async () => {
    arm();
    const store = getDefaultStore();
    await callTurn(store, `member-01${gate}`);
    const profile = await store.getProfile(`member-01${gate}`);
    expect(profile?.contactInfo?.phone).toMatch(/5550142$/);
  });

  it('Firestore: nothing is written under bogle_users/onbehalf:', async () => {
    arm();
    await callTurn(getFirestoreStore(), `onbehalf:call-02${gate}`);
    expect(rec.writes.filter((w) => w.includes('onbehalf:'))).toEqual([]);
    await callTurn(getFirestoreStore(), `member-02${gate}`); // control: the capture sees writes
    expect(rec.writes).toContain(`set bogle_users/member-02${gate}`);
  });
});
