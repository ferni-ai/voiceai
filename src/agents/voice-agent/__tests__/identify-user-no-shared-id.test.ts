/**
 * PRIVACY: identifyUser never leaves a caller without an id. A caller nobody
 * named got `undefined`, and every later `userId || 'anonymous'` put all of
 * them in one shared profile (bogle_users/anonymous), read back into the next
 * such call. Each gets their own per-call anon: id instead; a member keeps
 * their own.
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

async function idFor(jobMetadata: string | undefined): Promise<string | undefined> {
  return (await identifyUser({ jobMetadata, room, sessionId: `s-${++seq}` })).userId;
}

beforeEach(() => {
  vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
  setGlobalStore(store);
});
afterEach(() => vi.unstubAllEnvs());

describe('identifyUser gives every unnamed caller their own id', () => {
  it('two callers with no dispatch metadata get two different anon: ids', async () => {
    const first = await idFor(undefined);
    const second = await idFor(undefined);

    expect(first).toMatch(/^anon:/);
    expect(second).toMatch(/^anon:/);
    expect(first).not.toBe(second);
  });

  it('a caller whose metadata cannot be read gets an anon: id, not nothing', async () => {
    expect(await idFor('{not json')).toMatch(/^anon:/);
  });

  it("keeps a member's own id", async () => {
    expect(await idFor(JSON.stringify(signDispatch({ user_id: 'uid-member' }, SECRET)))).toBe(
      'uid-member'
    );
  });
});
