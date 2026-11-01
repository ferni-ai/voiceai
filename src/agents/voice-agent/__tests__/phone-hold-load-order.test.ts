/**
 * MINOR_CARE_SHARED_HOLD: the check that holds a call from a held number is registered where the
 * number is bound (caller-recognition.ts), not by the end-of-call purge module, which only the
 * startup warmup loads first. Here the purge module is replaced by an inert stub and never loads,
 * and a call bound at its start is still held.
 */
import { EventEmitter } from 'node:events';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';

const purge = vi.hoisted(() => ({ loaded: false }));
vi.mock('../minor-care-purge.js', () => {
  purge.loaded = true;
  return { purgeHeldUser: vi.fn(), shareHold: vi.fn() };
});
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
const { memoryHeld, resetMinorCare } = await import('../../../utils/minor-care.js');
const { setHoldStore } = await import('../../../services/outreach/minor-care-shared-hold.js');
const { phoneHoldId } = await import('../../../services/outreach/checkin-replies.js');

const PHONE = '+15550001234'; // synthetic

class FakeRoom extends EventEmitter {
  remoteParticipants = new Map([
    ['sip_caller', { identity: 'sip_caller', attributes: { 'sip.phoneNumber': PHONE } }],
  ]);
}

beforeEach(() => {
  resetMinorCare();
  setGlobalStore(store);
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'synthetic-test-secret');
  vi.stubEnv('CALLER_RECOGNITION', 'off');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => setHoldStore());

describe('a held number is checked whatever the load order', () => {
  it('a call bound at its start is held with the purge module never loaded', async () => {
    const until = Date.now() + 60 * 60 * 1000;
    const key = phoneHoldId(PHONE);
    setHoldStore({
      heldUntil: async (id) => (id === key ? until : undefined),
      write: async () => undefined,
    });
    await identifyUser({ room: new FakeRoom() as unknown as Room, sessionId: 'early-call' });
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(purge.loaded).toBe(false);
    expect(memoryHeld('early-call')).toBe(true);
  });
});
