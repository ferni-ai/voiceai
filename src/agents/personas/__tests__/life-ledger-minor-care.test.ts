/**
 * MINOR_CARE: the life ledger (bogle_users/{uid}/persona_told) stores nothing for a held caller.
 * Its extractor can keep the caller's own details as the persona's (the 2026-10-26 dev soak's
 * adult run stored the caller's job), and it had no hold check. An adult's call still stores.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLedgerRecorder, type LedgerFact, type LedgerStore } from '../life-ledger.js';
import { bindSessionUser, noteCallerWords, resetMinorCare } from '../../../utils/minor-care.js';

vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async () => ({
    generateContent: async () => ({ response: { text: () => '' } }),
  }),
}));

const LINE = 'My neighbor finally fixed the fence after the storm.';

function memoryStore(): LedgerStore & { saved: LedgerFact[] } {
  const saved: LedgerFact[] = [];
  return { saved, save: async (_u, facts) => void saved.push(...facts), recent: async () => [] };
}

async function flushFor(userId: string, sessionId: string) {
  const store = memoryStore();
  const rec = createLedgerRecorder(userId, {
    store,
    sessionId,
    extract: async () => ["Ferni's neighbor finally fixed the fence"],
  });
  rec.add('ferni', LINE);
  return { saved: await rec.flush(), store };
}

beforeEach(() => {
  resetMinorCare();
  vi.stubEnv('MINOR_CARE', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('life ledger under MINOR_CARE', () => {
  it("a held call (hold known only by the call's session) stores nothing", async () => {
    noteCallerWords('call-teen', "I'm 14 years old"); // never bound to the user: session only
    const { saved, store } = await flushFor('uid-teen', 'call-teen');
    expect(saved).toBe(0);
    expect(store.saved).toEqual([]);
  });

  it("a held user's other call stores nothing either", async () => {
    bindSessionUser('call-a', 'uid-teen');
    noteCallerWords('call-a', "I'm 14 years old");
    const { saved } = await flushFor('uid-teen', 'call-b');
    expect(saved).toBe(0);
  });

  it("an adult's call still stores what he said about himself", async () => {
    noteCallerWords('call-adult', 'my son is 14 and I am calling about him');
    const { saved, store } = await flushFor('uid-adult', 'call-adult');
    expect(saved).toBe(1);
    expect(store.saved.map((f) => f.fact)).toEqual(["Ferni's neighbor finally fixed the fence"]);
  });

  it('MINOR_CARE off: a caller who said they are 14 is stored as before', async () => {
    vi.stubEnv('MINOR_CARE', 'off');
    noteCallerWords('call-off', "I'm 14 years old");
    expect((await flushFor('uid-off', 'call-off')).saved).toBe(1);
  });
});
