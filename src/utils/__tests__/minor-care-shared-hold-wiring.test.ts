/**
 * MINOR_CARE_SHARED_HOLD wiring in the voice agent (minor-care-purge.ts): a session newly held for
 * its user writes the shared record, and the held call's end refreshes it. The real purge module
 * runs; only the hold store is faked.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, bindSessionUser, noteCallerWords, resetMinorCare } from '../minor-care.js';
import { setHoldStore, type HoldStore } from '../../services/outreach/minor-care-shared-hold.js';
import { phoneHoldId } from '../../services/outreach/checkin-replies.js';
import { rememberCallerPhone } from '../../agents/voice-agent-entry/caller-recognition.js';

const PHONE = '+15551234567';
const room = (phone: string) =>
  ({ remoteParticipants: new Map([['c', { attributes: { 'sip.phoneNumber': phone } }]]) }) as never;

const writes: Array<[string, { heldUntil: number; v: number }]> = [];
const store: HoldStore = {
  heldUntil: async () => undefined,
  write: async (userId, record) => void writes.push([userId, record]),
};
let purgeHeldUser: (userId: string, sessionId?: string) => void;

beforeAll(async () => {
  ({ purgeHeldUser } = await import('../../agents/voice-agent/minor-care-purge.js'));
});
beforeEach(() => {
  resetMinorCare();
  setHoldStore(store);
  writes.length = 0;
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
});
afterEach(() => vi.unstubAllEnvs());

const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

describe('MINOR_CARE_SHARED_HOLD in the voice agent', () => {
  it('a session newly held for its user writes { heldUntil, v } once', async () => {
    const before = Date.now();
    bindSessionUser('s1', 'u1');
    noteCallerWords('s1', "I'm 15 years old");
    noteCallerWords('s1', 'anyway');
    await settle();
    expect(writes.map(([id]) => id)).toEqual(['u1']);
    expect(writes[0]![1].v).toBe(1);
    expect(writes[0]![1].heldUntil).toBeGreaterThanOrEqual(before + IDLE_MS);
  });

  it("a phone call's hold is written for the caller's number too (its hash, never the number)", async () => {
    bindSessionUser('call-1', 'anon:abc');
    rememberCallerPhone('call-1', room(PHONE));
    noteCallerWords('call-1', "I'm 15 years old");
    await settle();
    expect(writes.map(([id]) => id)).toEqual(['anon:abc', phoneHoldId(PHONE)]);
    expect(phoneHoldId(PHONE)).toMatch(/^phone#[0-9a-f]{64}$/);
  });

  it('a phone: account is held under its number as well', async () => {
    bindSessionUser('call-2', `phone:${PHONE}`);
    noteCallerWords('call-2', "I'm 15 years old");
    await settle();
    expect(writes.map(([id]) => id)).toEqual([`phone:${PHONE}`, phoneHoldId(PHONE)]);
  });

  it("the held call ending refreshes the records, the number's too", async () => {
    rememberCallerPhone('call-1', room(PHONE));
    purgeHeldUser('anon:abc', 'call-1');
    await settle();
    expect(writes.map(([id]) => id)).toEqual(['anon:abc', phoneHoldId(PHONE)]);
  });

  it('a phone call that never sounded under 18 writes nothing for its number (or anyone)', async () => {
    bindSessionUser('call-3', 'anon:def');
    rememberCallerPhone('call-3', room(PHONE));
    noteCallerWords('call-3', 'my son is 15 and I am calling about him');
    await settle();
    expect(writes).toEqual([]);
  });

  it('a web call (no SIP number): only the user', async () => {
    rememberCallerPhone('web-1', {
      remoteParticipants: new Map([['p', { attributes: {} }]]),
    } as never);
    bindSessionUser('web-1', 'u1');
    noteCallerWords('web-1', "I'm 15 years old");
    await settle();
    expect(writes.map(([id]) => id)).toEqual(['u1']);
  });

  it('flag off: nothing written', async () => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off');
    bindSessionUser('s1', 'u1');
    noteCallerWords('s1', "I'm 15 years old");
    purgeHeldUser('u1');
    await settle();
    expect(writes).toEqual([]);
  });
});
