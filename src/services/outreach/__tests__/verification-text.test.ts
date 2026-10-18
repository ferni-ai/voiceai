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
  textVerificationCode,
  type Atomically,
  type CodeTextDeps,
} from '../verification-text.js';

const ENV = { LOG_HASH_SECRET: 'test-secret' };
const START = Date.parse('2026-10-18T16:00:00Z');
const N = '+15555550100';

/** The same reads and writes as Firestore, run one at a time. */
function memoryAtomically(store: Map<string, string[]>): Atomically {
  return async (keys, decide) => {
    const recent = Object.fromEntries(keys.map((k) => [k, store.get(k) ?? []]));
    const { result, write } = decide(recent);
    for (const [k, v] of Object.entries(write ?? {})) store.set(k, v);
    return result;
  };
}

function deps(over: Partial<CodeTextDeps> = {}) {
  const store = new Map<string, string[]>();
  let clock = START;
  const d: CodeTextDeps = {
    env: ENV,
    isOptedOut: vi.fn(async () => false),
    atomically: memoryAtomically(store),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => new Date(clock),
    ...over,
  };
  return { d, store, advance: (ms: number) => void (clock += ms) };
}
const makeCode = () => vi.fn(async (_e164: string) => '123456');
const ask = (d: CodeTextDeps, user = 'uid-1', phone = N, ip?: string) =>
  textVerificationCode(user, phone, makeCode(), d, ip);

describe('textVerificationCode', () => {
  it('texts the code to the number given, in plain words, and only then is it sent', async () => {
    const { d } = deps();
    const make = makeCode();
    expect(await textVerificationCode('uid-1', '(555) 555-0100', make, d)).toEqual({ sent: true });
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
    for (const abroad of ['+447700900123', '+2348012345678', '12']) {
      expect(await ask(d, 'uid-1', abroad)).toEqual({ sent: false, reason: 'invalid-number' });
    }
    expect(d.send).not.toHaveBeenCalled();
  });

  it("the user's own limits: one a minute and five an hour, across numbers", async () => {
    const { d, advance } = deps();
    expect(await ask(d)).toEqual({ sent: true });
    advance(30_000);
    expect(await ask(d, 'uid-1', '+15555550111')).toMatchObject({ reason: 'too-soon' });
    for (let i = 0; i < 4; i++) {
      advance(61_000);
      expect(await ask(d, 'uid-1', `+1555555012${i}`)).toEqual({ sent: true });
    }
    advance(61_000);
    expect(await ask(d, 'uid-1', '+15555550199')).toMatchObject({ reason: 'too-many' });
    advance(60 * 60 * 1000);
    expect(await ask(d)).toEqual({ sent: true });
  });

  it("someone hammering a number can't use up its owner's budget; the pair limit is quiet", async () => {
    const { d, advance } = deps();
    for (let i = 0; i < 3; i++) {
      expect(await ask(d, 'attacker', N)).toEqual({ sent: true });
      advance(61_000);
    }
    expect(await ask(d, 'attacker', N)).toEqual({ sent: false, reason: 'quiet' });
    expect(await ask(d, 'owner', N)).toEqual({ sent: true }); // the owner still gets their code
  });

  it('twenty a day to one number raises an alert but never refuses', async () => {
    const { d, advance } = deps();
    for (let i = 0; i < 21; i++) {
      expect(await ask(d, `user-${i}`, N)).toEqual({ sent: true });
      advance(5 * 60 * 1000);
    }
    expect(
      logged.errors.some(([, msg]) => String(msg).includes('one number asked for often'))
    ).toBe(true);
  });

  it('per IP: twenty an hour, whoever asks', async () => {
    const { d } = deps();
    for (let i = 0; i < 20; i++) {
      expect(await ask(d, `user-${i}`, `+1555555${String(1000 + i)}`, '203.0.113.7')).toEqual({
        sent: true,
      });
    }
    expect(await ask(d, 'user-x', '+15555552000', '203.0.113.7')).toMatchObject({
      reason: 'too-many',
    });
    expect(await ask(d, 'user-x', '+15555552000', '198.51.100.9')).toEqual({ sent: true });
  });

  it('a global cap opens the circuit (logged as an error) before any send', async () => {
    const { d, store } = deps();
    store.set(
      'global',
      Array.from({ length: 500 }, () => new Date(START - 1000).toISOString())
    );
    logged.errors.length = 0;
    expect(await ask(d)).toEqual({ sent: false, reason: 'unavailable' });
    expect(d.send).not.toHaveBeenCalled();
    expect(logged.errors.some(([, msg]) => String(msg).includes('global hourly cap'))).toBe(true);
  });

  it('a number that sent STOP: quiet, no code made, nothing sent', async () => {
    const stopped = phoneHash(N, ENV);
    const { d } = deps({ isOptedOut: vi.fn(async (h: string) => h === stopped) });
    const make = makeCode();
    expect(await textVerificationCode('uid-1', N, make, d)).toEqual({
      sent: false,
      reason: 'quiet',
    });
    expect(make).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
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
    expect(all).not.toContain('5555550100');
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
