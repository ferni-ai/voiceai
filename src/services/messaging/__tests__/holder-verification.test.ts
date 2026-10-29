/**
 * A sponsored identity's holder proves the number is theirs with a texted
 * code: only the identity's sponsor can start it, only a hash of the code is
 * kept, the holder's reply from that phone sets phoneVerifiedAt, and only
 * then does the number count as theirs for outbound.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import { memoryConsentStore } from './memory-consent.js';
import { memorySendLedger } from './memory-send-ledger.js';
import {
  handleHolderVerifyRoute,
  recordHolderCode,
  startHolderVerification,
  type HolderIdentity,
  type HolderVerificationDeps,
} from '../holder-verification.js';
import { writeOptOut } from '../consent.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { sponsoredPhoneOf } from '../../outreach/user-reach.js';

const MOM = '+12025550133';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
let now = new Date('2026-10-18T16:00:00Z');
let identities: Map<string, HolderIdentity>;
let sent: Array<[string, string]>;
let consent: ReturnType<typeof memoryConsentStore>;
let ledger: ReturnType<typeof memorySendLedger>;

/** A merge write, where null removes the field (as holderOf reads a stored null). */
function merge(id: string, patch: Record<string, unknown>): void {
  const next = { ...identities.get(id) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  identities.set(id, next as unknown as HolderIdentity);
}

const deps = (over: Partial<HolderVerificationDeps> = {}): HolderVerificationDeps => ({
  env,
  now: () => now,
  byId: async (id) => identities.get(id),
  byPhone: async (p) => [...identities.values()].find((i) => i.phoneNumber === p),
  // read, decide and write with no await between: atomic, like a Firestore transaction
  transact: async (id, decide) => {
    const step = decide(identities.get(id));
    if (step.patch) merge(id, step.patch);
    return step.ok;
  },
  sponsorName: async () => 'Seth',
  ledger: ledger.ledger,
  send: async (to, body) => (sent.push([to, body]), true),
  code: () => '482913',
  consent: { env, store: consent.store, now: () => now },
  ...over,
});

beforeEach(() => {
  now = new Date('2026-10-18T16:00:00Z');
  consent = memoryConsentStore();
  ledger = memorySendLedger();
  sent = [];
  identities = new Map([
    ['sponsored_mom', { id: 'sponsored_mom', sponsorUserId: 'seth', phoneNumber: MOM }],
  ]);
});
afterEach(() => vi.unstubAllEnvs());

describe('startHolderVerification', () => {
  it("texts the holder a code; stores only the code's hash", async () => {
    expect(await startHolderVerification('sponsored_mom', 'seth', deps())).toEqual({
      started: true,
      phoneLast4: '0133',
    });
    expect(sent).toEqual([[MOM, expect.stringContaining('Reply with 482913')]]);
    expect(JSON.stringify(identities.get('sponsored_mom'))).not.toContain('482913');
  });

  it("only the identity's own sponsor can start it", async () => {
    expect(await startHolderVerification('sponsored_mom', 'user-b', deps())).toEqual({
      started: false,
      reason: 'not-found',
    });
    expect(sent).toHaveLength(0);
  });

  it('one code per 10 minutes; never to a number that opted out; off without the flag', async () => {
    await startHolderVerification('sponsored_mom', 'seth', deps());
    expect((await startHolderVerification('sponsored_mom', 'seth', deps())).started).toBe(false);
    identities.set('sponsored_mom', {
      id: 'sponsored_mom',
      sponsorUserId: 'seth',
      phoneNumber: MOM,
    });
    await writeOptOut(phoneHash(MOM, env) as string, 'sms', 'inbound-sms', deps().consent);
    expect(await startHolderVerification('sponsored_mom', 'seth', deps())).toEqual({
      started: false,
      reason: 'opted-out',
    });
    expect(
      await startHolderVerification(
        'sponsored_mom',
        'seth',
        deps({ env: { LOG_HASH_SECRET: 'x' } })
      )
    ).toEqual({
      started: false,
      reason: 'pipeline-off',
    });
    expect(sent).toHaveLength(1);
  });
});

describe('recordHolderCode', () => {
  it("the right code from that phone verifies it; only then is it the account's own", async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'on');
    await startHolderVerification('sponsored_mom', 'seth', deps());
    expect(sponsoredPhoneOf(identities.get('sponsored_mom') as never)).toBeUndefined();
    expect(await recordHolderCode(MOM, ' 482913 ', deps())).toBe(true);
    const mom = identities.get('sponsored_mom') as HolderIdentity;
    expect(mom.phoneVerifiedAt).toBe(now.toISOString());
    expect(mom.holderVerification).toBeUndefined();
    expect(sponsoredPhoneOf(mom as never)).toBe(MOM);
  });

  it('a wrong code counts a try; five end the code, so the right one no longer works', async () => {
    await startHolderVerification('sponsored_mom', 'seth', deps());
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      expect(await recordHolderCode(MOM, '000000', deps())).toBe(false);
    }
    expect(await recordHolderCode(MOM, '482913', deps())).toBe(false);
    expect(identities.get('sponsored_mom')?.phoneVerifiedAt).toBeUndefined();
  });

  it('a number that texted STOP after the code went out is not verified by the code', async () => {
    await startHolderVerification('sponsored_mom', 'seth', deps());
    await writeOptOut(phoneHash(MOM, env) as string, 'sms', 'inbound-sms', deps().consent);
    expect(await recordHolderCode(MOM, '482913', deps())).toBe(false);
    expect(identities.get('sponsored_mom')?.phoneVerifiedAt).toBeUndefined();
  });

  it('an expired code, or the code from another number, verifies nothing', async () => {
    await startHolderVerification('sponsored_mom', 'seth', deps());
    expect(await recordHolderCode('+12025550199', '482913', deps())).toBe(false);
    now = new Date(now.getTime() + 16 * 60 * 1000);
    expect(await recordHolderCode(MOM, '482913', deps())).toBe(false);
    expect(identities.get('sponsored_mom')?.phoneVerifiedAt).toBeUndefined();
  });
});

describe('the code is bound to the number it went to (sponsor swaps the number)', () => {
  const VICTIM = '+12025550177';
  const OLD = '+12025550144';
  const mom = () => identities.get('sponsored_mom') as HolderIdentity;

  it('the number changed between start and reply: the code from the old number proves nothing', async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'on');
    await startHolderVerification('sponsored_mom', 'seth', deps());
    expect(sent).toEqual([[MOM, expect.any(String)]]);
    // The swap lands, but the pending code is still on the doc (the race the update route loses)
    identities.set('sponsored_mom', { ...mom(), phoneNumber: VICTIM });
    expect(mom().holderVerification).toBeDefined();
    // The lookup still maps the old number to this identity (a stale cache)
    const stale = deps({ byPhone: async (p) => (p === MOM ? mom() : undefined) });
    expect(await recordHolderCode(MOM, '482913', stale)).toBe(false);
    expect(mom().phoneVerifiedAt).toBeUndefined();
    expect(sponsoredPhoneOf(mom() as never)).toBeUndefined();
  });

  it('a stale phone-to-identity cache never verifies the number the identity is at now', async () => {
    // The identity is at the victim's number; the cache still maps the sponsor's
    // number to it, and a pending code exists for the victim's number.
    await startHolderVerification('sponsored_mom', 'seth', deps());
    identities.set('sponsored_mom', { ...mom(), phoneNumber: VICTIM });
    const stale = deps({ byPhone: async () => mom() });
    expect(await recordHolderCode(MOM, '482913', stale)).toBe(false);
    expect(await recordHolderCode(MOM, '000000', stale)).toBe(false);
    // no proof, and not even a try counted against the victim's doc
    expect(mom().phoneVerifiedAt).toBeUndefined();
    expect(mom().holderVerification?.tries).toBe(0);
  });

  it('a pending code bound to an older number is rejected, even from the number on the doc', async () => {
    await startHolderVerification('sponsored_mom', 'seth', deps());
    const pending = mom().holderVerification as NonNullable<HolderIdentity['holderVerification']>;
    expect(pending.phoneHash).toBe(phoneHash(MOM, env));
    // Same code, same doc number, but the code went to another number
    merge('sponsored_mom', { holderVerification: { ...pending, phoneHash: phoneHash(OLD, env) } });
    expect(await recordHolderCode(MOM, '482913', deps())).toBe(false);
    expect(mom().phoneVerifiedAt).toBeUndefined();
  });

  it('start writes no code when the stored number is not the one it would text', async () => {
    // start read the identity at MOM, but the doc now holds the victim's number
    identities.set('sponsored_mom', { ...mom(), phoneNumber: VICTIM });
    const staleRead = deps({ byId: async () => ({ ...mom(), phoneNumber: MOM }) });
    expect(await startHolderVerification('sponsored_mom', 'seth', staleRead)).toEqual({
      started: false,
      reason: 'phone-changed',
    });
    expect(sent).toHaveLength(0);
    expect(mom().holderVerification).toBeUndefined();
  });

  it('with the number unchanged, the reply still verifies', async () => {
    await startHolderVerification('sponsored_mom', 'seth', deps());
    expect(await recordHolderCode(MOM, '482913', deps())).toBe(true);
    expect(mom().phoneVerifiedAt).toBe(now.toISOString());
    expect(mom().holderVerification).toBeUndefined();
  });
});

describe('POST /api/sponsored-identities/:id/verify-phone', () => {
  const send = vi.fn((_r: ServerResponse, _s: number, _d: unknown) => undefined);
  const req = { method: 'POST' } as never;
  it("acts for the signed-in sponsor only: another user's request is a 404 and texts nothing", async () => {
    await handleHolderVerifyRoute(
      req,
      {} as never,
      '/sponsored_mom/verify-phone',
      'user-b',
      send,
      deps()
    );
    expect(send).toHaveBeenLastCalledWith(expect.anything(), 404, expect.anything());
    await handleHolderVerifyRoute(
      req,
      {} as never,
      '/sponsored_mom/verify-phone',
      'seth',
      send,
      deps()
    );
    expect(send).toHaveBeenLastCalledWith(
      expect.anything(),
      200,
      expect.objectContaining({ started: true })
    );
    expect(sent).toHaveLength(1);
  });
});
