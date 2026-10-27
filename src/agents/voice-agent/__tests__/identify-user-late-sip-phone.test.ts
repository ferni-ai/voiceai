/**
 * MINOR_CARE_SHARED_HOLD: identifyUser binds a phone caller's number even when the SIP participant
 * joins after identification ends, which is what both dev soak phone calls did (2026-10-26:
 * identification done at 23:12:28.157, SIP caller in the room at 28.479). Read once, nothing was
 * bound, so the held call wrote no phone# record and texts to that number weren't held.
 *
 * The real identifyUser, minor-care and purge modules run; only the hold store is faked.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';

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
const { bindSessionUser, noteCallerWords, resetMinorCare, sessionPhone } =
  await import('../../../utils/minor-care.js');
const { setHoldStore } = await import('../../../services/outreach/minor-care-shared-hold.js');
const { phoneHoldId } = await import('../../../services/outreach/checkin-replies.js');

const PHONE = '+15550001234'; // synthetic
const PHONE_WATCH_MS = 30_000; // caller-recognition.ts
const sip = (attributes: Record<string, string> = { 'sip.phoneNumber': PHONE }) => ({
  identity: 'sip_caller',
  attributes,
});

/** A LiveKit room's shape: remote participants plus its join and attribute events. */
class FakeRoom extends EventEmitter {
  remoteParticipants = new Map<string, ReturnType<typeof sip>>();
  join(p = sip()): void {
    this.remoteParticipants.set(p.identity, p);
    this.emit('participantConnected', p);
  }
}

const writes: string[] = [];
let seq = 0;

beforeAll(async () => {
  await import('../minor-care-purge.js'); // registers the shared-hold listeners
});
beforeEach(() => {
  resetMinorCare();
  writes.length = 0;
  setHoldStore({ heldUntil: async () => undefined, write: async (id) => void writes.push(id) });
  setGlobalStore(store);
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'synthetic-test-secret');
  vi.stubEnv('CALLER_RECOGNITION', 'off'); // the soak's dev and prod setting
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

async function identify(room: FakeRoom) {
  const sessionId = `call-${++seq}`;
  const r = await identifyUser({ room: room as unknown as Room, sessionId });
  return { sessionId, userId: r.userId! };
}

describe('identifyUser binds the caller number whenever the SIP caller joins', () => {
  it('a SIP caller who joins after identification ends still gets the number bound', async () => {
    const room = new FakeRoom();
    const { sessionId } = await identify(room);
    expect(sessionPhone(sessionId)).toBeUndefined(); // not in the room yet
    room.join();
    expect(sessionPhone(sessionId)).toBe(PHONE);
    expect(room.listenerCount('participantConnected')).toBe(0); // stops once bound
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
  });

  it('a number that lands in a later attributes update is bound too', async () => {
    const room = new FakeRoom();
    const { sessionId } = await identify(room);
    const p = sip({});
    room.join(p); // joined without sip.phoneNumber
    expect(sessionPhone(sessionId)).toBeUndefined();
    p.attributes['sip.phoneNumber'] = PHONE;
    room.emit('participantAttributesChanged', { 'sip.phoneNumber': PHONE }, p);
    expect(sessionPhone(sessionId)).toBe(PHONE);
  });

  it('a held call whose caller joins late writes the phone# record when the number arrives', async () => {
    const room = new FakeRoom();
    const { sessionId, userId } = await identify(room);
    bindSessionUser(sessionId, userId);
    noteCallerWords(sessionId, "I'm 14 years old");
    await settle();
    expect(writes).toEqual([userId]); // held, number unknown
    room.join();
    await settle();
    expect(writes).toEqual([userId, phoneHoldId(PHONE)]);
    expect(phoneHoldId(PHONE)).toMatch(/^phone#[0-9a-f]{64}$/);
  });

  it('a late caller who is never held writes nothing for the number', async () => {
    const room = new FakeRoom();
    const { sessionId, userId } = await identify(room);
    bindSessionUser(sessionId, userId);
    room.join();
    noteCallerWords(sessionId, 'my daughter is 14 and I am calling about her');
    await settle();
    expect(sessionPhone(sessionId)).toBe(PHONE);
    expect(writes).toEqual([]);
  });

  it('an early SIP caller is unchanged: bound at once, no listener left, one write each', async () => {
    const room = new FakeRoom();
    room.join();
    const { sessionId, userId } = await identify(room);
    expect(sessionPhone(sessionId)).toBe(PHONE);
    expect(room.listenerCount('participantConnected')).toBe(0);
    bindSessionUser(sessionId, userId);
    noteCallerWords(sessionId, "I'm 14 years old");
    await settle();
    expect(writes).toEqual([userId, phoneHoldId(PHONE)]);
  });

  it('does not delay the greeting: resolves with no caller in the room, and stops listening later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const room = new FakeRoom();
    const started = performance.now();
    const { sessionId } = await identify(room); // would hang here if the watch were awaited
    const tookMs = performance.now() - started;
    expect(tookMs).toBeLessThan(1000);
    expect(room.listenerCount('participantConnected')).toBe(1);
    vi.advanceTimersByTime(PHONE_WATCH_MS);
    expect(room.listenerCount('participantConnected')).toBe(0);
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
    room.join();
    expect(sessionPhone(sessionId)).toBeUndefined(); // past the window: nothing listens
  });

  it('a web call (a room with no events, no SIP caller) binds nothing and throws nothing', async () => {
    const r = await identifyUser({ room: {} as Room, sessionId: 'web-1' });
    expect(r.userId).toMatch(/^anon:/);
    expect(sessionPhone('web-1')).toBeUndefined();
  });
});
