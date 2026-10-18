/**
 * RETURNING_CALLER on the live hooks: the call-start lookup
 * (startReturningCaller, run by identifyUser) and the end-of-call write (the
 * registered after-call task). Firestore is an in-memory fake behind the real
 * store; the logger is a recorder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const doc = (c: string, id: string) => ({
    get: async () => ({ exists: docs.has(`${c}/${id}`), data: () => docs.get(`${c}/${id}`) }),
    set: async (d: Record<string, unknown>) => void docs.set(`${c}/${id}`, d),
    delete: async () => void docs.delete(`${c}/${id}`),
  });
  const db = {
    collection: (c: string) => ({ doc: (id: string) => doc(c, id) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (ref: ReturnType<typeof doc>) => ref.get(),
        set: (ref: ReturnType<typeof doc>, d: Record<string, unknown>) => void ref.set(d),
        delete: (ref: ReturnType<typeof doc>) => void ref.delete(),
      }),
  };
  const logged: unknown[][] = [];
  const recorder = (): Record<string, unknown> => {
    const rec = (...args: unknown[]): void => void logged.push(args);
    const logger: Record<string, unknown> = { info: rec, warn: rec, error: rec, debug: rec };
    logger.trace = rec;
    logger.fatal = rec;
    logger.child = () => logger;
    return logger;
  };
  return { docs, db, logged, recorder };
});

vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => h.db,
}));
vi.mock('../../../utils/safe-logger.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createLogger: () => h.recorder(),
  getLogger: () => h.recorder(),
  safeLog: () => h.recorder(),
}));
const { startReturningCaller, rememberCallerRecognition } =
  await import('../caller-recognition.js');
const { recordReturningCallAfterCall, nameTheyGave } =
  await import('../returning-caller-register.js');
const { clearReturningCallers, registerMinorSignal, returningCallerFor } =
  await import('../../../services/identity/returning-caller.js');

const NUMBER = '+15551234567';
const ATTESTED = { signedAttestation: async () => 'A' as const };

function roomWith(phone: string) {
  const participant = { identity: 'sip_x', attributes: { 'sip.phoneNumber': phone } };
  return {
    remoteParticipants: new Map([['sip_x', participant]]),
    on: () => undefined,
    off: () => undefined,
  } as never;
}

async function endCall(sessionId: string, callerLine: string, topics: string[]): Promise<void> {
  await recordReturningCallAfterCall({
    userId: `anon:${sessionId}`,
    sessionId,
    turns: [
      { role: 'assistant', content: "Hey, who's this?" },
      { role: 'user', content: callerLine },
    ],
    summary: { mainTopics: topics },
    startedAt: new Date(),
  });
}

const stored = (): Record<string, unknown>[] => [...h.docs.values()];

beforeEach(() => {
  h.docs.clear();
  h.logged.length = 0;
  clearReturningCallers();
  registerMinorSignal(() => false);
  process.env.RETURNING_CALLER = 'on';
  process.env.LOG_HASH_SECRET = 'test-secret';
});
afterEach(() => {
  delete process.env.RETURNING_CALLER;
  delete process.env.LOG_HASH_SECRET;
});

describe('a returning unverified phone caller', () => {
  it('is found on their next call with the name they gave', async () => {
    await startReturningCaller(roomWith(NUMBER), 'call-1', 'anon:1', ATTESTED);
    expect(returningCallerFor('call-1')).toBeUndefined();
    await endCall('call-1', "Hi, I'm Dana. I've been learning guitar.", ['Learning guitar']);

    await startReturningCaller(roomWith('(555) 123-4567'), 'call-2', 'anon:2', ATTESTED);
    expect(returningCallerFor('call-2')).toEqual({
      firstName: 'Dana',
      summary: 'learning guitar',
      callCount: 1,
    });
  });

  it('keeps the number out of what is stored and logged, and counts calls', async () => {
    for (const id of ['a', 'b']) {
      await startReturningCaller(roomWith(NUMBER), id, `anon:${id}`, ATTESTED);
      await endCall(id, "It's Dana, by the way, call me back at 555 123 4567.", ['Guitar']);
    }
    const [key] = [...h.docs.keys()];
    expect(h.docs.size).toBe(1);
    expect(key).toMatch(/^returning_callers\/[0-9a-f]{64}$/);
    expect(stored()[0]).toMatchObject({ callCount: 2, firstName: 'Dana', summary: 'guitar' });
    const everything = JSON.stringify([[...h.docs.entries()], h.logged]);
    for (const form of ['5551234567', '555 123 4567', '555-123-4567']) {
      expect(everything).not.toContain(form);
    }
  });

  it('stores only the allow-listed fields, 30 days from the last call', async () => {
    await startReturningCaller(roomWith(NUMBER), 'f', 'anon:f', ATTESTED);
    await endCall('f', "I'm Dana and I'm 34, I live in Denver.", ['Turning 34', 'Denver trip']);
    const doc = stored()[0];
    expect(Object.keys(doc).sort()).toEqual(['callCount', 'expireAt', 'firstName', 'lastCallAt']);
    const days =
      ((doc.expireAt as Date).getTime() - (doc.lastCallAt as Date).getTime()) / 86_400_000;
    expect(days).toBe(30);
  });

  it('reads and writes nothing with the flag off', async () => {
    process.env.RETURNING_CALLER = 'off';
    await startReturningCaller(roomWith(NUMBER), 'off-1', 'anon:off-1', ATTESTED);
    await endCall('off-1', "I'm Dana.", ['Guitar']);
    expect(h.docs.size).toBe(0);
    expect(returningCallerFor('off-1')).toBeUndefined();
  });

  it('never touches a verified user or a proven owner', async () => {
    await startReturningCaller(roomWith(NUMBER), 'seed', 'anon:seed', ATTESTED);
    await endCall('seed', "I'm Dana.", ['Guitar']);
    await startReturningCaller(roomWith(NUMBER), 'acct', 'firebase-uid-123', ATTESTED);
    rememberCallerRecognition('known', { status: 'known', attestation: 'A', userId: 'u1' });
    await startReturningCaller(roomWith(NUMBER), 'known', 'anon:known', ATTESTED);
    for (const id of ['acct', 'known']) {
      expect(returningCallerFor(id)).toBeUndefined();
      await endCall(id, "I'm Sam.", ['Guitar']);
    }
    h.docs.forEach((d) => expect(d).toMatchObject({ firstName: 'Dana', callCount: 1 }));
  });

  it('loads nothing and writes nothing for a call without attestation A', async () => {
    await startReturningCaller(roomWith(NUMBER), 'seed', 'anon:seed', ATTESTED);
    await endCall('seed', "I'm Dana.", ['Guitar']);
    for (const level of ['B', 'C', null] as const) {
      const id = `spoof-${level ?? 'none'}`;
      await startReturningCaller(roomWith(NUMBER), id, `anon:${id}`, {
        signedAttestation: async () => level,
      });
      expect(returningCallerFor(id)).toBeUndefined();
      await endCall(id, "I'm Sam.", ['Cooking']);
    }
    expect(h.docs.size).toBe(1);
    h.docs.forEach((d) => expect(d).toMatchObject({ firstName: 'Dana', callCount: 1 }));
  });

  it('writes nothing until a minor-signal check is registered, or when it says minor', async () => {
    registerMinorSignal(null);
    await startReturningCaller(roomWith(NUMBER), 'm1', 'anon:m1', ATTESTED);
    await endCall('m1', "I'm Dana.", ['Guitar']);
    await startReturningCaller(roomWith(NUMBER), 'm2', 'anon:m2', ATTESTED);
    await endCall('m2', "I'm Dana.", ['Guitar']);
    expect(h.docs.size).toBe(0);
    const reasons = h.logged.filter((args) => String(args.at(-1)).includes('minor-signal'));
    expect(reasons).toEqual([['Returning caller not saved: no minor-signal check registered']]);
    registerMinorSignal((sessionId) => sessionId === 'm3');
    await startReturningCaller(roomWith(NUMBER), 'm3', 'anon:m3', ATTESTED);
    await endCall('m3', "I'm Dana.", ['Guitar']);
    expect(h.docs.size).toBe(0);
  });

  it('does nothing without the hash secret, and says why once', async () => {
    delete process.env.LOG_HASH_SECRET;
    await startReturningCaller(roomWith(NUMBER), 'n1', 'anon:n1', ATTESTED);
    await startReturningCaller(roomWith(NUMBER), 'n2', 'anon:n2', ATTESTED);
    await endCall('n1', "I'm Dana.", ['Guitar']);
    expect(h.docs.size).toBe(0);
    expect(returningCallerFor('n1')).toBeUndefined();
    const reasons = h.logged.filter((args) => String(args.at(-1)).includes('LOG_HASH_SECRET'));
    expect(reasons).toEqual([['Returning caller off: LOG_HASH_SECRET is not set']]);
  });
});

describe('nameTheyGave', () => {
  it('takes the last name the caller gave for themselves, not other words', () => {
    const turns = [
      { role: 'user', content: "I'm tired." },
      { role: 'assistant', content: "What's your name?" },
      { role: 'user', content: "It's Dana." },
      { role: 'user', content: 'My sister Jess says hi.' },
    ];
    expect(nameTheyGave(turns)).toBe('Dana');
    expect(nameTheyGave([{ role: 'user', content: "I'm Jess's mom." }])).toBeUndefined();
  });
});
