/**
 * identifyUser reports a caller as verified only when the real
 * identifyFromMetadata took a Priority 1 or 2 branch for a real account: a
 * signed user_id, or /token's firebase_uid for a signed-in (non-anonymous)
 * Firebase account. Everyone else, a forged unsigned user_id included, is not.
 * voice-agent-entry copies the result to userData.verifiedCaller for tools.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';
import { signDispatch } from '../../../services/outreach/on-behalf-dispatch.js';

const store = new InMemoryStore();
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));
vi.mock('../../../services/identity/identity-linking.js', () => ({
  autoLinkOnAuth: vi.fn(async () => undefined),
}));
vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({
  prefetchUserCommitments: vi.fn(async () => {}),
}));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: vi.fn(async () => ({})),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));

const { setGlobalStore } = await import('../../../services/identity/user-identification.js');
const { identifyUser } = await import('../user-identification-handler.js');

const SECRET = 'livekit-test-secret';
const room = {} as Room;
let seq = 0;

async function verifiedFor(metadata: Record<string, unknown>): Promise<boolean> {
  const result = await identifyUser({
    jobMetadata: JSON.stringify(metadata),
    room,
    sessionId: `s-${++seq}`,
  });
  return result.verified;
}

beforeEach(() => {
  vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
  setGlobalStore(store);
});
afterEach(() => vi.unstubAllEnvs());

describe('identifyUser verified', () => {
  it('is true for a user_id our server signed', async () => {
    expect(await verifiedFor(signDispatch({ user_id: 'uid-signed' }, SECRET))).toBe(true);
  });

  it("is true for /token's firebase_uid of a signed-in account", async () => {
    expect(await verifiedFor({ firebase_uid: 'uid-google', firebase_account: true })).toBe(true);
  });

  it('is false for an anonymous Firebase user, or a firebase_uid with no account marker', async () => {
    expect(await verifiedFor({ firebase_uid: 'uid-anon', firebase_account: false })).toBe(false);
    expect(await verifiedFor({ firebase_uid: 'uid-unmarked' })).toBe(false);
  });

  it('is false for a forged unsigned user_id, a session id or nobody at all', async () => {
    expect(await verifiedFor({ user_id: 'uid-forged' })).toBe(false);
    expect(await verifiedFor({ session_id: 'onbehalf:c1' })).toBe(false);
    expect(await verifiedFor({})).toBe(false);
  });
});
