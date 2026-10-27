/**
 * MINOR_CARE_SHARED_HOLD: a call from a number a held call left on hold (minor_care_holds/phone#…)
 * is held from when the number is known, whether or not the caller says their age again. Every
 * phone call gets a fresh anon: id, so the dev soak (2026-10-27) saw a second, no-age call from a
 * held number write 89 docs: the API process honoured the phone# record, the voice agent never
 * read it.
 *
 * The real identifyUser, minor-care, purge and life-ledger modules run; only the hold store is
 * faked (keyed by the id the real phoneHoldId gives, the key shareHold writes).
 */
import { EventEmitter } from 'node:events';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async () => ({
    generateContent: async () => ({ response: { text: () => '' } }),
  }),
}));

const { setGlobalStore } = await import('../../../services/identity/user-identification.js');
const { identifyUser } = await import('../user-identification-handler.js');
const { bindSessionUser, memoryHeld, minorCareNote, resetMinorCare, writeHeld, MINOR_CARE_NOTE } =
  await import('../../../utils/minor-care.js');
const { setHoldStore } = await import('../../../services/outreach/minor-care-shared-hold.js');
const { phoneHoldId } = await import('../../../services/outreach/checkin-replies.js');
const { purgeHeldUser } = await import('../minor-care-purge.js'); // registers the listeners
const { recordedWhileHeld } = await import('../../../services/trust-systems/held-window.js');
const { createLedgerRecorder } = await import('../../personas/life-ledger.js');

const PHONE = '+15550001234'; // synthetic
const OTHER = '+15550009876'; // synthetic
const HOUR = 60 * 60 * 1000;
const sip = (phone = PHONE) => ({
  identity: 'sip_caller',
  attributes: { 'sip.phoneNumber': phone },
});

/** A LiveKit room's shape: remote participants plus its join and attribute events. */
class FakeRoom extends EventEmitter {
  remoteParticipants = new Map<string, ReturnType<typeof sip>>();
  join(p = sip()): void {
    this.remoteParticipants.set(p.identity, p);
    this.emit('participantConnected', p);
  }
}

/** minor_care_holds, by doc id. A read of any id throws while `failReads` is set. */
const holds = new Map<string, number>();
const reads: string[] = [];
let failReads = false;
let seq = 0;

beforeEach(() => {
  resetMinorCare();
  holds.clear();
  reads.length = 0;
  failReads = false;
  setHoldStore({
    heldUntil: async (id) => {
      reads.push(id);
      if (failReads) throw new Error('unavailable');
      return holds.get(id);
    },
    write: async () => undefined,
  });
  setGlobalStore(store);
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'synthetic-test-secret');
  vi.stubEnv('CALLER_RECOGNITION', 'off'); // the soak's dev and prod setting
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => setHoldStore());

const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

/** A held call left this number on hold until `until` (what shareHold wrote, keyed the same way). */
function seedHold(phone: string, until: number): void {
  const id = phoneHoldId(phone) ?? '';
  expect(id).toMatch(/^phone#[0-9a-f]{64}$/);
  holds.set(id, until);
}

/** A phone call that never states an age, as session-init runs it: identify, then bind the user. */
async function call(room: FakeRoom): Promise<{ sessionId: string; userId: string }> {
  const sessionId = `call-${++seq}`;
  const { userId = '' } = await identifyUser({ room: room as unknown as Room, sessionId });
  bindSessionUser(sessionId, userId);
  await settle();
  return { sessionId, userId };
}

/** The persona_told writer, as the call's end runs it: how many facts it stored. */
async function ledgerSaved(userId: string, sessionId: string): Promise<number> {
  const rec = createLedgerRecorder(userId, {
    store: { save: async () => undefined, recent: async () => [] },
    sessionId,
    extract: async () => ["Ferni's neighbor finally fixed the fence"],
  });
  rec.add('ferni', 'My neighbor finally fixed the fence after the storm.');
  return rec.flush();
}

const noAge = 'I had pizza for lunch and my dog is named Biscuit.';

function expectHeld(sessionId: string, userId: string) {
  expect(memoryHeld(sessionId)).toBe(true); // cleanup-handler's `held`: the end-of-call purge runs
  expect(writeHeld(userId, sessionId)).toBe(true); // every writer's check
  expect(minorCareNote(sessionId, noAge, { userId })).toBe(MINOR_CARE_NOTE);
}

describe('a call from a held number is held from the start (MINOR_CARE_SHARED_HOLD)', () => {
  it('held with no age said: no writes, the care note, and the ledger stores nothing', async () => {
    seedHold(PHONE, Date.now() + 5 * HOUR);
    const room = new FakeRoom();
    room.join(); // in the room at identification
    const { sessionId, userId } = await call(room);
    expect(userId).toMatch(/^anon:/); // a fresh id: only the number links it to the held call
    expect(reads).toEqual([phoneHoldId(PHONE)]);
    expectHeld(sessionId, userId);
    expect(await ledgerSaved(userId, sessionId)).toBe(0);
  });

  it('an expired hold does not hold', async () => {
    seedHold(PHONE, Date.now() - 1);
    const room = new FakeRoom();
    room.join();
    const { sessionId, userId } = await call(room);
    expect(reads).toEqual([phoneHoldId(PHONE)]);
    expect(memoryHeld(sessionId)).toBe(false);
    expect(writeHeld(userId, sessionId)).toBe(false);
    expect(await ledgerSaved(userId, sessionId)).toBe(1);
  });

  it('a different number does not hold', async () => {
    seedHold(PHONE, Date.now() + 5 * HOUR);
    const room = new FakeRoom();
    room.join(sip(OTHER));
    const { sessionId, userId } = await call(room);
    expect(reads).toEqual([phoneHoldId(OTHER)]);
    expect(phoneHoldId(OTHER)).not.toBe(phoneHoldId(PHONE));
    expect(memoryHeld(sessionId)).toBe(false);
    expect(await ledgerSaved(userId, sessionId)).toBe(1);
  });

  it('SHARED_HOLD off is unchanged: no read, not held, the ledger stores', async () => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    seedHold(PHONE, Date.now() + 5 * HOUR);
    const room = new FakeRoom();
    room.join();
    const { sessionId, userId } = await call(room);
    expect(reads).toEqual([]);
    expect(memoryHeld(sessionId)).toBe(false);
    expect(writeHeld(userId, sessionId)).toBe(false);
    expect(await ledgerSaved(userId, sessionId)).toBe(1);
  });

  it('a hold that cannot be read holds the call (fail closed)', async () => {
    failReads = true;
    const room = new FakeRoom();
    room.join();
    const { sessionId, userId } = await call(room);
    expect(reads).toEqual([phoneHoldId(PHONE)]);
    expectHeld(sessionId, userId);
    expect(await ledgerSaved(userId, sessionId)).toBe(0);
  });

  it('a SIP caller who joins after identification is held then, and the purge covers before', async () => {
    seedHold(PHONE, Date.now() + 5 * HOUR);
    const room = new FakeRoom();
    const startedAt = Date.now();
    const { sessionId, userId } = await call(room); // no caller in the room yet
    expect(reads).toEqual([]);
    expect(memoryHeld(sessionId)).toBe(false);
    const writtenBeforeBind = Date.now(); // e.g. a timer-flushed store, before the number was known
    room.join();
    await settle();
    expect(reads).toEqual([phoneHoldId(PHONE)]);
    expectHeld(sessionId, userId);
    expect(recordedWhileHeld(userId, writtenBeforeBind)).toBe(false);
    purgeHeldUser(userId, sessionId, startedAt); // what cleanup-handler runs when memoryHeld
    expect(recordedWhileHeld(userId, writtenBeforeBind)).toBe(true);
  });
});
