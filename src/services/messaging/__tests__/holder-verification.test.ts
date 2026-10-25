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

const deps = (over: Partial<HolderVerificationDeps> = {}): HolderVerificationDeps => ({
  env,
  now: () => now,
  byId: async (id) => identities.get(id),
  byPhone: async (p) => [...identities.values()].find((i) => i.phoneNumber === p),
  save: async (id, patch) => {
    const cur = identities.get(id) as HolderIdentity;
    const next = { ...cur } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    identities.set(id, next as unknown as HolderIdentity);
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
