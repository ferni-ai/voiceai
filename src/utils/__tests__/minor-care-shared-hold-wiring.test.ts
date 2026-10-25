/**
 * MINOR_CARE_SHARED_HOLD wiring in the voice agent (minor-care-purge.ts): a session newly held for
 * its user writes the shared record, and the held call's end refreshes it. The real purge module
 * runs; only the hold store is faked.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, bindSessionUser, noteCallerWords, resetMinorCare } from '../minor-care.js';
import { setHoldStore, type HoldStore } from '../../services/safety/minor-care-shared-hold.js';

const writes: Array<[string, { heldUntil: number; v: number }]> = [];
const store: HoldStore = {
  heldUntil: async () => undefined,
  write: async (userId, record) => void writes.push([userId, record]),
};
let purgeHeldUser: (userId: string) => void;

beforeAll(async () => {
  ({ purgeHeldUser } = await import('../../agents/voice-agent/minor-care-purge.js'));
});
beforeEach(() => {
  resetMinorCare();
  setHoldStore(store);
  writes.length = 0;
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
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

  it('the held call ending refreshes the record', async () => {
    purgeHeldUser('u1');
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
