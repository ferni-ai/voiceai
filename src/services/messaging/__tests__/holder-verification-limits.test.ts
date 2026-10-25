/**
 * The holder-verification text can't be used to flood or pump a number: the
 * gap and the daily caps live in a ledger keyed by the number's hash, checked
 * and written in one transaction, so parallel starts, deleting and recreating
 * the identity, and burning the code's five tries don't reset them.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';
import { memorySendLedger } from './memory-send-ledger.js';
import {
  recordHolderCode,
  startHolderVerification,
  type HolderIdentity,
  type HolderVerificationDeps,
} from '../holder-verification.js';
import {
  HOLDER_SENDS,
  NUMBER_DAILY_CAP,
  SPONSOR_DAILY_CAP,
  phoneLedgerId,
} from '../holder-send-ledger.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { ERASED_STORES, storeLabel } from '../../platform/user-stores.js';

const MOM = '+12025550133';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const ELEVEN_MIN = 11 * 60 * 1000;
let now: Date;
let identities: Map<string, HolderIdentity>;
let sent: Array<[string, string]>;
let ledger: ReturnType<typeof memorySendLedger>;

const pause = async (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

/** Identity reads and writes each take `latencyMs`, like Firestore round trips. */
function deps(latencyMs = 0): HolderVerificationDeps {
  const consent = memoryConsentStore();
  return {
    env,
    now: () => now,
    byId: async (id) => (await pause(latencyMs), identities.get(id)),
    byPhone: async (p) => [...identities.values()].find((i) => i.phoneNumber === p),
    save: async (id, patch) => {
      await pause(latencyMs);
      const cur = identities.get(id);
      if (!cur) return;
      const next: Record<string, unknown> = { ...cur };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      identities.set(id, next as HolderIdentity & Record<string, unknown>);
    },
    sponsorName: async () => 'Seth',
    ledger: ledger.ledger,
    send: async (to, body) => (sent.push([to, body]), true),
    code: () => '482913',
    consent: { env, store: consent.store, now: () => now },
  };
}

const mom = (id = 'sponsored_mom', phoneNumber = MOM): HolderIdentity => ({
  id,
  sponsorUserId: 'seth',
  phoneNumber,
});

beforeEach(() => {
  now = new Date('2026-10-18T16:00:00Z');
  sent = [];
  identities = new Map([['sponsored_mom', mom()]]);
});

describe('holder verification send limits', () => {
  it('10 parallel starts against a store with latency send one text', async () => {
    ledger = memorySendLedger(5);
    const d = deps(5);
    const outs = await Promise.all(
      Array.from({ length: 10 }, async () => startHolderVerification('sponsored_mom', 'seth', d))
    );
    expect(outs.filter((o) => o.started)).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('deleting and recreating the identity never resets the number: at most the daily cap', async () => {
    ledger = memorySendLedger();
    for (let i = 0; i < NUMBER_DAILY_CAP + 3; i++) {
      identities.delete(`sponsored_mom_${i - 1}`);
      identities.set(`sponsored_mom_${i}`, mom(`sponsored_mom_${i}`));
      // eslint-disable-next-line no-await-in-loop
      await startHolderVerification(`sponsored_mom_${i}`, 'seth', deps());
      // an immediate retry, before the gap, is refused too
      // eslint-disable-next-line no-await-in-loop
      expect((await startHolderVerification(`sponsored_mom_${i}`, 'seth', deps())).started).toBe(
        false
      );
      now = new Date(now.getTime() + ELEVEN_MIN);
    }
    expect(sent).toHaveLength(NUMBER_DAILY_CAP);
    const record = ledger.docs.get(phoneLedgerId(phoneHash(MOM, env) as string));
    expect(record).toEqual({ lastSentAt: expect.any(String), day: '2026-10-18', count: 5 });
    expect(JSON.stringify(record)).not.toMatch(/0133|seth/);
  });

  it('one sponsor reaches at most 20 numbers a day', async () => {
    ledger = memorySendLedger();
    for (let i = 0; i < SPONSOR_DAILY_CAP + 5; i++) {
      const id = `sponsored_${i}`;
      identities.set(id, mom(id, `+1202555${String(1000 + i)}`));
      // eslint-disable-next-line no-await-in-loop
      await startHolderVerification(id, 'seth', deps());
    }
    expect(sent).toHaveLength(SPONSOR_DAILY_CAP);
  });

  it('five wrong tries end the code but not the gap: an immediate resend is refused', async () => {
    ledger = memorySendLedger();
    expect((await startHolderVerification('sponsored_mom', 'seth', deps())).started).toBe(true);
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      expect(await recordHolderCode(MOM, '000000', deps())).toBe(false);
    }
    expect(identities.get('sponsored_mom')?.holderVerification).toBeUndefined();
    expect(await startHolderVerification('sponsored_mom', 'seth', deps())).toEqual({
      started: false,
      reason: 'too-soon',
    });
    expect(sent).toHaveLength(1);
  });
});

describe('the send ledger and account erasure', () => {
  it("the sponsor's daily count is erased with their account", () => {
    expect(ERASED_STORES.map(storeLabel)).toContain(`${HOLDER_SENDS}/{uid}`);
  });
});
