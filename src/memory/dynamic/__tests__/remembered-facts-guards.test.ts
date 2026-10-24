/**
 * REMEMBER_TO_RECALL (#2514), round 2 of the eval review: what a caller asks Ferni to
 * remember never becomes an embedded fact when it holds a credential (by the 15
 * credential categories, credential-shapes.ts) or when the caller has no account, and
 * a fact remembered while a forget is reading lands unmarked but is never recalled
 * later in the same call (stored-fact-vectors.ts nearest reads topics forgotten here).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  rememberedFactDoc,
  rememberToRecall,
  type FactDocWrite,
  type RememberedFactStore,
} from '../remembered-facts.js';
import { useSecretModel } from '../../secret-check.js';
import { forgetTopic, type ForgetStore } from '../../recall/forget.js';
import { loadRecallSnapshot } from '../../recall/session-recall.js';
import {
  createStoredVectors,
  FACT_VECTOR_DIMENSION,
  type VectorRecallStore,
} from '../../recall/stored-fact-vectors.js';

const ON = { REMEMBER_TO_RECALL: 'on' };
const AT = '2026-01-01T00:00:00.000Z';

function memoryStore() {
  const facts = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async (_userId: string, docs: FactDocWrite[]) => {
    let made = 0;
    for (const d of docs) if (!facts.has(d.id) && facts.set(d.id, d.data)) made++;
    return made;
  });
  const store: RememberedFactStore = { create };
  return { facts, store, create };
}

// The model's secret read (remembered-facts-secret.test.ts) clears every fact here
beforeEach(() => useSecretModel(async () => '{"secret":false}'));
afterEach(() => vi.unstubAllEnvs());

/** One or more forms per credential category; none is in the eval lead's sweep. */
const CREDENTIALS: Record<string, string[]> = {
  password: ["User's Wi-Fi password is Oranges99", 'the password to my email is bluebird', 'password for netflix: Jenny8675'], // prettier-ignore
  'password-spelled': ['password is p a n c a k e s', 'my password is spelled B-L-U-E-1'],
  'access-code': ['the lockbox code is 3 3 1 9', 'storage unit code 6631'],
  'access-code-words': ['keypad code is five five two one'],
  pin: ['my bank pin is eight eight two two', 'PIN: 0000'],
  combination: ['bike lock combo 4-4-2-1', 'the lock combination is thirty two, ten, eight', 'locker combo is 12, 34, 56'], // prettier-ignore
  'one-time-code': ['the authentication code is 902 113', 'otp 448812'],
  'card-number': ['my mastercard number is 5555 5555 5555 4444', 'card 5105-1051-0510-5100'],
  'card-number-words': ['five five five five five five five five five five five five four four four four is my mastercard'], // prettier-ignore
  cvv: ['cvc is 4 5 6', 'the three digits on the back are 123 cvv'],
  ssn: ['social security 078-05-1120', 'ssn is two one nine zero nine nine nine nine nine', 'remember 078-05-1120'], // prettier-ignore
  bank: ['routing 021000021 account 123456789', 'IBAN DE89370400440532013000', 'send it to DE89370400440532013000'], // prettier-ignore
  'api-key-token': ['stripe key sk_live_51Habcdefghij', 'my secret key is 4c3b2a1d0e9f8g7h6i5j', 'it is ghp_1234567890abcdefABCD'], // prettier-ignore
  'security-answer': ['security answer: Rover', "my mom's maiden name is Garcia"],
  'government-id': ['passport no. 987654321', 'my drivers licence number is 123-456-789'],
};
const ORDINARY = [
  'the wifi password changed', 'my area code is 727', 'the promo code was SAVE20', 'I reset my pin yesterday',
  'my credit card limit is 5000', 'my phone is 212 555 0143', 'my api key expired', 'my maiden name is Lopez',
  'my password manager is 1Password', 'I got a security answer wrong', 'my visa interview is on June 12',
  'the score was 21 to 14', 'my car is a 2018 Honda with 45000 miles', 'pass the salt',
  'my password is on a sticky note', 'my password is too short',
]; // prettier-ignore

describe('a remembered credential is never kept for recall', () => {
  for (const [category, forms] of Object.entries(CREDENTIALS)) {
    it.each(forms)(`${category}: %s`, (fact) => {
      expect(rememberedFactDoc({ fact }, AT)).toBeNull();
    });
  }

  it.each(ORDINARY)('an ordinary fact is kept: %s', (fact) => {
    expect(rememberedFactDoc({ fact }, AT)).not.toBeNull();
  });
});

describe('only a member gets a remembered fact', () => {
  it.each(['', '  ', 'anonymous', 'Unknown', 'default', 'shared', 'anon:abc123', 'onbehalf:xyz'])(
    'owner %j: nothing written',
    async (userId) => {
      const { store, create } = memoryStore();
      expect(await rememberToRecall(userId, { fact: 'I ran 5k today' }, { store, env: ON })).toBe(false); // prettier-ignore
      expect(create).not.toHaveBeenCalled();
    }
  );

  it('a member is written (the gate is not refusing everyone)', async () => {
    const { store, create } = memoryStore();
    expect(await rememberToRecall('u-member', { fact: 'I ran 5k today' }, { store, env: ON })).toBe(true); // prettier-ignore
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('a fact remembered while a forget is reading is not recalled later in the call', () => {
  const DANA = 'my sister Dana is moving to Denver in June';
  const V = new Array<number>(FACT_VECTOR_DIMENSION).fill(0.1);
  const embedding = { enabled: true, embed: async (t: string[]) => t.map(() => V), model: async () => 'm' }; // prettier-ignore

  /** The call's recall (snapshot read at its start, the stored-vector search per turn) and a forget whose read we hold open. */
  async function interleave(userId: string) {
    const { facts, store } = memoryStore();
    const base: VectorRecallStore = {
      facts: async () => [],
      summaries: async () => [],
      forgotten: async () => [],
      nearest: async () => [...facts.values()],
    };
    const recall = createStoredVectors(base, userId, Promise.resolve('m'));
    await loadRecallSnapshot(recall.store, userId);
    let finishRead: (facts: []) => void = () => {};
    const forgetStore: ForgetStore = {
      facts: async () =>
        new Promise<[]>((resolve) => {
          finishRead = resolve;
        }),
      markForgotten: vi.fn(async () => {}),
      addTopic: async () => {},
      topics: async () => [],
    };
    // 1. the forget reads the caller's facts (forget.ts: the read before the marks)
    const forgetting = forgetTopic(userId, 'my sister Dana', forgetStore);
    // 2. while that read is open, the remember lands
    expect(await rememberToRecall(userId, { fact: DANA }, { store, env: ON, embedding })).toBe(true); // prettier-ignore
    // 3. the read returns without it, so nothing is marked; the forget completes
    finishRead([]);
    expect(await forgetting).toEqual({ kind: 'forgotten', marked: 0 });
    expect([...facts.values()][0]).not.toHaveProperty('forgottenAt');
    // 4. a later turn's stored-vector search finds the unmarked fact
    return (await recall.nearest(V)).map((i) => i.text);
  }

  it('REMEMBER_TO_RECALL on: the search leaves it out (topics forgotten in this call count)', async () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    expect(await interleave('u-race-1')).toEqual([]);
  });

  it('FORGET_EVERY_READER on: the same', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(await interleave('u-race-2')).toEqual([]);
  });

  it('both off: the search reads the topics the call started with, as on main', async () => {
    expect(await interleave('u-race-3')).toEqual([`they asked to remember: ${DANA}`]);
  });
});
