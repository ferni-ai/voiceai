/**
 * A phone-verification code goes straight to the number being verified (never
 * a user lookup), only to North American numbers that never sent STOP, inside
 * limits checked and recorded in one transaction, and counts as sent only when
 * the provider took it. Refusals about someone else's number are quiet.
 */
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ all: [] as unknown[][], errors: [] as unknown[][] }));
vi.mock('../../../utils/safe-logger.js', () => {
  const keep = (...args: unknown[]) => void logged.all.push(args);
  const error = (...args: unknown[]) => {
    logged.all.push(args);
    logged.errors.push(args);
  };
  const logger = { debug: keep, info: keep, warn: keep, error };
  return { createLogger: () => logger, getLogger: () => ({ ...logger, child: () => logger }) };
});

import { phoneHash } from '../checkin-replies.js';
import {
  codeText,
  firestoreAtomically,
  ipBucket,
  reserveConfirmTry,
  textVerificationCode,
  type Atomically,
  type CodeTextDeps,
} from '../verification-text.js';

const ENV = { LOG_HASH_SECRET: 'test-secret' };
const START = Date.parse('2026-10-18T16:00:00Z');
const N = '+12125550100';

/** The same reads and writes as Firestore, one at a time; `stopped`: hashes that sent STOP. */
function memoryAtomically(store: Map<string, string[]>, stopped: Set<string>): Atomically {
  return async (keys, optOutHash, decide) => {
    const recent = Object.fromEntries(keys.map((k) => [k, store.get(k) ?? []]));
    const { result, write } = decide(recent, stopped.has(optOutHash));
    for (const [k, v] of Object.entries(write ?? {})) store.set(k, v);
    return result;
  };
}

function deps(over: Partial<CodeTextDeps> = {}) {
  const store = new Map<string, string[]>();
  const stopped = new Set<string>();
  let clock = START;
  const d: CodeTextDeps = {
    env: ENV,
    atomically: memoryAtomically(store, stopped),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => new Date(clock),
    ...over,
  };
  return { d, store, stopped, advance: (ms: number) => void (clock += ms) };
}
const makeCode = () => vi.fn(async (_e164: string) => '123456');
const ask = (d: CodeTextDeps, user = 'uid-1', phone = N, ip?: string) =>
  textVerificationCode(user, phone, makeCode(), d, ip);
const num = (i: number) => `+1212555${String(1000 + i)}`;

describe('textVerificationCode', () => {
  it('texts the code to the number given, in plain words, and only then is it sent', async () => {
    const { d } = deps();
    const make = makeCode();
    expect(await textVerificationCode('uid-1', '(212) 555-0100', make, d)).toEqual({ sent: true });
    expect(make).toHaveBeenCalledWith(N);
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: N,
        body: 'Your Ferni code is 123456. It expires in 10 minutes.',
      })
    );
    expect(codeText('1')).not.toMatch(/[—\u{1F300}-\u{1FAFF}☀-➿]/u); // no em dash, no emoji
  });

  it('a send the provider refused is not "sent"', async () => {
    const { d } = deps({ send: vi.fn(async () => ({ success: false, error: `bad ${N}` })) });
    expect(await ask(d)).toEqual({ sent: false, reason: 'send-failed' });
  });

  it('only North American numbers (no SMS pumping to premium routes abroad)', async () => {
    const { d } = deps();
    for (const abroad of [
      '+447700900123',
      '+2348012345678',
      '12',
      '+18765550100',
      '+19005550100',
    ]) {
      expect(await ask(d, 'uid-1', abroad)).toEqual({ sent: false, reason: 'invalid-number' });
    }
    expect(d.send).not.toHaveBeenCalled();
  });

  it("the user's own limits: one a minute and five an hour, across numbers", async () => {
    const { d, advance } = deps();
    expect(await ask(d)).toEqual({ sent: true });
    advance(30_000);
    expect(await ask(d, 'uid-1', num(1))).toMatchObject({ reason: 'too-soon' });
    for (let i = 0; i < 4; i++) {
      advance(61_000);
      expect(await ask(d, 'uid-1', num(10 + i))).toEqual({ sent: true });
    }
    advance(61_000);
    expect(await ask(d, 'uid-1', num(20))).toMatchObject({ reason: 'too-many' });
    advance(60 * 60 * 1000);
    expect(await ask(d)).toEqual({ sent: true });
  });

  it('a number has one ceiling for every request (1 a minute, 5 an hour), refused quietly', async () => {
    const { d, advance } = deps();
    expect(await ask(d, 'u0', N)).toEqual({ sent: true });
    advance(20_000);
    expect(await ask(d, 'u1', N)).toEqual({ sent: false, reason: 'quiet' }); // no first-request exemption
    for (let i = 2; i < 6; i++) {
      advance(61_000);
      expect(await ask(d, `u${i}`, N)).toEqual({ sent: true });
    }
    advance(61_000);
    expect(await ask(d, 'owner', N)).toEqual({ sent: false, reason: 'quiet' }); // the 6th this hour
    expect(d.send).toHaveBeenCalledTimes(5);
    advance(60 * 60 * 1000);
    expect(await ask(d, 'owner', N)).toEqual({ sent: true }); // the owner can retry within the hour
  });

  it('the (user, number) pair: three an hour, quietly', async () => {
    const { d, advance } = deps();
    for (let i = 0; i < 3; i++) {
      expect(await ask(d, 'a', N)).toEqual({ sent: true });
      advance(61_000);
    }
    expect(await ask(d, 'a', N)).toEqual({ sent: false, reason: 'quiet' });
  });

  it('probing costs the prober: a quiet refusal still uses their own budget', async () => {
    const { d, stopped, advance } = deps();
    stopped.add(phoneHash(N, ENV) ?? '');
    expect(await ask(d, 'prober', N, '203.0.113.7')).toEqual({ sent: false, reason: 'quiet' });
    advance(30_000);
    expect(await ask(d, 'prober', num(1), '203.0.113.7')).toMatchObject({ reason: 'too-soon' });
    for (let i = 0; i < 9; i++) await ask(d, `p${i}`, N, '203.0.113.7'); // all quiet
    expect(await ask(d, 'fresh', num(2), '203.0.113.7')).toMatchObject({ reason: 'too-many' });
  });

  it('a quiet refusal stores no code (STOP, the number ceiling, the pair limit) and logs last four only', async () => {
    const stoppedCase = deps();
    stoppedCase.stopped.add(phoneHash(N, ENV) ?? '');
    const ceiling = deps();
    await ask(ceiling.d, 'a', N);
    ceiling.advance(20_000);
    const pair = deps();
    for (let i = 0; i < 3; i++) {
      await ask(pair.d, 'a', N);
      pair.advance(61_000 * 5); // apart enough for the number's own limits
    }
    for (const [d, user] of [
      [stoppedCase.d, 'uid-1'],
      [ceiling.d, 'b'],
      [pair.d, 'a'],
    ] as const) {
      const make = makeCode();
      logged.all.length = 0;
      expect(await textVerificationCode(user, N, make, d)).toEqual({
        sent: false,
        reason: 'quiet',
      });
      expect(make).not.toHaveBeenCalled(); // no usable code exists for a number we never texted
      const all = JSON.stringify(logged.all);
      expect(all).toContain('refused quietly');
      expect(all).not.toContain('2125550100');
    }
    expect(stoppedCase.d.send).not.toHaveBeenCalled();
  });

  it('confirm tries are limited per (user, number): five an hour', async () => {
    const { d, advance } = deps();
    for (let i = 0; i < 5; i++) expect(await reserveConfirmTry('uid-a', N, d)).toBe('ok');
    expect(await reserveConfirmTry('uid-a', '(212) 555-0100', d)).toBe('locked');
    expect(await reserveConfirmTry('uid-b', N, d)).toBe('ok'); // another user
    expect(await reserveConfirmTry('uid-a', num(1), d)).toBe('ok'); // another number
    advance(60 * 60 * 1000);
    expect(await reserveConfirmTry('uid-a', N, d)).toBe('ok');
  });

  it('twenty a day to one number raises an alert but never refuses', async () => {
    const { d, advance } = deps();
    logged.errors.length = 0;
    for (let i = 0; i < 21; i++) {
      expect(await ask(d, `user-${i}`, N)).toEqual({ sent: true });
      advance(13 * 60 * 1000); // under the number's 5 an hour
    }
    expect(
      logged.errors.some(([, msg]) => String(msg).includes('one number asked for often'))
    ).toBe(true);
  });

  it('per IP: ten an hour, with IPv6 grouped by its /64', async () => {
    const { d } = deps();
    for (let i = 0; i < 10; i++) {
      const ip = `2001:db8:abcd:12::${(i + 1).toString(16)}`;
      expect(await ask(d, `user-${i}`, num(i), ip)).toEqual({ sent: true });
    }
    expect(await ask(d, 'user-x', num(50), '2001:db8:abcd:12:ffff::9')).toMatchObject({
      reason: 'too-many',
    });
    expect(await ask(d, 'user-y', num(51), '2001:db8:abcd:13::1')).toEqual({ sent: true }); // another /64
    expect(ipBucket('2001:0db8:abcd:0012:0000:0000:0000:0001')).toBe('2001:db8:abcd:12::/64');
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('the global breaker alerts at 500 an hour and refuses only at 2000', async () => {
    const { d, store } = deps();
    store.set(
      'global',
      Array.from({ length: 499 }, () => new Date(START - 1000).toISOString())
    );
    logged.errors.length = 0;
    expect(await ask(d)).toEqual({ sent: true }); // the 500th: alert, still sent
    expect(logged.errors.some(([, msg]) => String(msg).includes('global hourly volume high'))).toBe(
      true
    );
    const many = (n: number) =>
      Array.from({ length: n }, () => new Date(START - 1000).toISOString());
    store.set('global', many(1000));
    expect(await ask(d, 'uid-3', num(4))).toEqual({ sent: true }); // past the alert, under the ceiling
    store.set('global', many(2000));
    expect(await ask(d, 'uid-2', num(3))).toEqual({ sent: false, reason: 'unavailable' });
    expect(logged.errors.some(([, msg]) => String(msg).includes('global hourly ceiling'))).toBe(
      true
    );
    expect(d.send).toHaveBeenCalledTimes(2);
  });

  it('without the hash secret (STOP unreadable) nothing goes', async () => {
    const { d } = deps({ env: {} });
    expect(await ask(d)).toMatchObject({ reason: 'unavailable' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('never logs the code or the full number, sent or not', async () => {
    logged.all.length = 0;
    await ask(deps().d);
    await ask(deps({ send: vi.fn(async () => ({ success: false, error: `to ${N}` })) }).d);
    expect(logged.all.length).toBeGreaterThan(1);
    const all = JSON.stringify(logged.all);
    expect(all).not.toContain('123456');
    expect(all).not.toContain('2125550100');
    expect(all).toContain('0100'); // last four only
  });
});

describe('firestoreAtomically: check and record in one transaction', () => {
  /** Enough of Firestore's optimistic transactions: a read through tx is checked at commit. */
  function fakeDb() {
    const docs = new Map<string, { data?: Record<string, unknown>; version: number }>();
    const tick = () =>
      new Promise<void>((r) => {
        setTimeout(r, 0);
      });
    const ref = (id: string) => ({
      id,
      // The snapshot is taken when asked and arrives later, as over the network.
      get: async () => {
        const d = docs.get(id);
        await tick();
        return { exists: !!d?.data, data: () => d?.data };
      },
    });
    const db = {
      collection: () => ({ doc: (id: string) => ref(id) }),
      async runTransaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
        for (;;) {
          const seen = new Map<string, number>();
          const writes = new Map<string, Record<string, unknown>>();
          const tx = {
            get: async (r: { id: string }) => {
              seen.set(r.id, docs.get(r.id)?.version ?? 0);
              return ref(r.id).get();
            },
            set: (r: { id: string }, data: Record<string, unknown>) => void writes.set(r.id, data),
          };
          const result = await fn(tx as never);
          if ([...seen].some(([id, v]) => (docs.get(id)?.version ?? 0) !== v)) continue; // retry
          for (const [id, data] of writes)
            docs.set(id, { data, version: (docs.get(id)?.version ?? 0) + 1 });
          return result;
        }
      },
    };
    return db;
  }

  it('two requests at once send one code', async () => {
    const db = fakeDb();
    const { d } = deps({ atomically: firestoreAtomically(() => db as never) });
    const both = await Promise.all([ask(d), ask(d)]);
    expect(both).toContainEqual({ sent: true });
    expect(both).toContainEqual({ sent: false, reason: 'too-soon' });
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});

describe('number abuse: several accounts at one number ceiling', () => {
  /** Fills the number's hour (5 sends, a minute apart) so every later request hits its ceiling. */
  async function crowded() {
    const made = deps();
    const alert = vi.fn();
    made.d.alert = alert;
    for (let i = 0; i < 5; i++) {
      await ask(made.d, `filler-${i}`, N);
      made.advance(61_000);
    }
    logged.all.length = 0;
    return { ...made, alert };
  }
  const contention = () => logged.all.filter(([, msg]) => msg === 'verify_phone_number_contention');

  it('three distinct accounts at the ceiling raise one alert, with the last four only', async () => {
    const { d, alert, advance } = await crowded();
    for (const who of ['x', 'y', 'z']) {
      expect(await ask(d, who, N)).toEqual({ sent: false, reason: 'quiet' }); // refusals unchanged
      advance(61_000);
    }
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith({
      phoneLast4: '0100',
      distinctAccounts: 3,
      windowMs: 3_600_000,
    });
    expect(contention()).toHaveLength(1);
    expect(JSON.stringify(logged.all)).not.toContain('2125550100');
  });

  it('two accounts raise none, and one account repeating counts once', async () => {
    const { d, alert, advance } = await crowded();
    for (const who of ['x', 'y', 'x', 'y', 'x']) {
      await ask(d, who, N);
      advance(61_000);
    }
    expect(alert).not.toHaveBeenCalled();
    expect(contention()).toHaveLength(0);
  });

  it('stored requesters are hashes, never uids', async () => {
    const { d, store, advance } = await crowded();
    await ask(d, 'uid-secret-1', N);
    advance(61_000);
    const stored = JSON.stringify(
      [...store.entries()].filter(([k]) => k.startsWith('contention:'))
    );
    expect(stored).not.toContain('uid-secret-1');
    expect(stored).toMatch(/[0-9a-f]{16}\|/);
  });

  it('one alert per number per hour, then again after the hour', async () => {
    const { d, alert, advance } = await crowded();
    for (const who of ['a', 'b', 'c', 'd', 'e']) {
      await ask(d, who, N);
      advance(61_000);
    }
    expect(alert).toHaveBeenCalledTimes(1); // 4th and 5th accounts don't alert again
    advance(60 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      await ask(d, `filler2-${i}`, N);
      advance(61_000);
    }
    for (const who of ['f', 'g', 'h']) {
      await ask(d, who, N);
      advance(61_000);
    }
    expect(alert).toHaveBeenCalledTimes(2);
  });
});
