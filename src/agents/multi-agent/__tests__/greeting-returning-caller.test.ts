/**
 * RETURNING_CALLER in the call: the hello (directedGreeting), the model's
 * call-start line (firstTalkNote, used by agent-setup), the per-turn note
 * (returningCallerTurnNote, used by turn-request: the caller's stated name and
 * "forget me"), on top of the call-start lookup and end-of-call write. Firestore is
 * an in-memory fake behind the real store; the logger is a recorder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  /** Writes each collection refuses next (Infinity: every one); 'tx': transactions. */
  const fail: Record<string, number> = {};
  const refuse = (c: string): void => {
    if ((fail[c] ?? 0) <= 0) return;
    fail[c] -= 1;
    throw new Error('unavailable');
  };
  const doc = (c: string, id: string) => ({
    get: async () => ({ exists: docs.has(`${c}/${id}`), data: () => docs.get(`${c}/${id}`) }),
    set: async (d: Record<string, unknown>) => {
      refuse(c);
      docs.set(`${c}/${id}`, d);
    },
    delete: async () => {
      refuse(c);
      docs.delete(`${c}/${id}`);
    },
  });
  const db = {
    collection: (c: string) => ({ doc: (id: string) => doc(c, id) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      refuse('tx');
      return fn({
        get: async (ref: ReturnType<typeof doc>) => ref.get(),
        set: (ref: ReturnType<typeof doc>, d: Record<string, unknown>) => void ref.set(d),
        delete: (ref: ReturnType<typeof doc>) => void ref.delete(),
      });
    },
  };
  const logged: Array<[string, unknown]> = [];
  const logger = (): Record<string, unknown> => {
    const at =
      (level: string) =>
      (...args: unknown[]) =>
        void logged.push([level, args.at(-1)]);
    const l: Record<string, unknown> = {};
    for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) l[level] = at(level);
    l.child = () => l;
    return l;
  };
  return { docs, fail, db, logged, logger };
});
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => h.db,
}));
vi.mock('../../../utils/safe-logger.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createLogger: () => h.logger(),
  getLogger: () => h.logger(),
  safeLog: () => h.logger(),
}));
const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

const { directedGreeting, firstTalkNote, GREETING_DIRECTION } =
  await import('../greeting-direction.js');
const { startReturningCaller } = await import('../../voice-agent-entry/caller-recognition.js');
const { recordReturningCallAfterCall } =
  await import('../../voice-agent-entry/returning-caller-register.js');
const { statedName } = await import('../../personas/name-correction.js');
const rc = await import('../../../services/identity/returning-caller.js');

const NUMBER = '+15551234567';
const CALLERS = 'returning_callers';
const ERASURES = 'returning_caller_erasures';
/** Every call here carries the signed attestation A a lookup needs (caller-recognition.ts). */
const ATTESTED = { signedAttestation: async () => 'A' as const };
type Request = { direction: string; facts: Record<string, string> };
/** What the greeting is told: its direction and facts (the understudy line varies by design). */
const pick = ({ direction, facts }: Request): Request => ({ direction, facts });
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;
const nameIn = (w: string, a: string): string | null => statedName(w, undefined, a);
/** The per-turn note for the caller's words after Ferni's line. */
const turn = (sessionId: string, words: string, agentLast = 'Hey there.'): string =>
  rc.returningCallerTurnNote(sessionId, words, agentLast, nameIn);

function roomWith(phone: string) {
  const participant = { identity: 'sip_x', attributes: { 'sip.phoneNumber': phone } };
  return {
    remoteParticipants: new Map([['sip_x', participant]]),
    on: () => undefined,
    off: () => undefined,
  } as never;
}

const start = async (sessionId: string): Promise<void> =>
  startReturningCaller(roomWith(NUMBER), sessionId, `anon:${sessionId}`, ATTESTED);
const end = async (sessionId: string, callerLine = "I'm Dana."): Promise<void> =>
  recordReturningCallAfterCall({
    userId: `anon:${sessionId}`,
    sessionId,
    turns: [
      { role: 'assistant', content: "Hey, who's this?" },
      { role: 'user', content: callerLine },
    ],
    summary: { mainTopics: ['Learning guitar'] },
    startedAt: new Date(),
  });
const record = (): Record<string, unknown> | undefined =>
  [...h.docs.entries()].find(([k]) => k.startsWith(`${CALLERS}/`))?.[1];
const erasures = (): number => [...h.docs.keys()].filter((k) => k.startsWith(ERASURES)).length;
/** Dana's first call: her name and a topic are kept. */
async function seed(): Promise<void> {
  await start('seed');
  await end('seed', "Hi, I'm Dana. I've been learning guitar.");
  expect(record()).toMatchObject({ firstName: 'Dana', summary: 'learning guitar' });
}

beforeEach(() => {
  h.docs.clear();
  for (const k of Object.keys(h.fail)) delete h.fail[k];
  h.logged.length = 0;
  directedText.mockClear();
  rc.clearReturningCallers();
  rc.registerMinorSignal(() => false);
  process.env.RETURNING_CALLER = 'on';
  process.env.LOG_HASH_SECRET = 'test-secret';
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.RETURNING_CALLER;
  delete process.env.LOG_HASH_SECRET;
});

describe('a call from a number someone called from before', () => {
  it('greets every looked-up call the same, record or not, and keeps the name out of context', async () => {
    await start('first');
    await directedGreeting('first', 'ferni', {});
    const without = { ...pick(lastRequest()), note: firstTalkNote('first') };
    await end('first', "Hi, I'm Dana. I've been learning guitar.");

    await startReturningCaller(roomWith('(555) 123-4567'), 'second', 'anon:second', ATTESTED);
    await directedGreeting('second', 'ferni', {});
    const withRecord = { ...pick(lastRequest()), note: firstTalkNote('second') };
    expect(withRecord).toEqual(without);
    expect(withRecord.direction).toMatch(/who've I got\?/);
    expect(withRecord.direction).not.toMatch(/from this number|from you again/);
    expect(turn('second', 'Hello?')).toBe('');
    expect(turn('second', 'Yes.', "Hey, who've I got?")).toBe('');
    for (const leak of ['Dana', 'guitar']) expect(JSON.stringify(withRecord)).not.toContain(leak);
  });

  it('a wrong name then the right one: never confirmed, and the record is held', async () => {
    await seed();
    await start('guess');
    expect(turn('guess', "I'm Sarah.")).toBe('');
    expect(turn('guess', "Sorry, I'm Dana.")).toBe('');
    await end('guess', "I'm Dana.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1 });
    expect((record()?.deniedUntil as Date).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  it('the cooldown blocks the next call: nothing surfaced, nothing refreshed', async () => {
    await seed();
    await start('guess');
    turn('guess', "I'm Sarah.");
    await vi.waitFor(() => expect(record()?.deniedUntil).toBeDefined());
    await start('next');
    expect(rc.returningCallerFor('next')).toBeUndefined();
    expect(turn('next', "I'm Dana.")).toBe('');
    await end('next', "I'm Dana.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1, summary: 'learning guitar' });
  });

  it('counts wrong names per number, across calls at once or apart: after three, never surfaced', async () => {
    await seed();
    await Promise.all([start('g1'), start('g2')]); // both read the record before either guess
    expect(turn('g1', "I'm Sarah.")).toBe('');
    expect(turn('g2', "I'm Maria.")).toBe('');
    await vi.waitFor(() => expect(record()?.failedGuesses).toBe(2));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 86_400_000); // the cooldown is over, the record is not
    await start('g3');
    expect(turn('g3', "I'm Jo.")).toBe('');
    await vi.waitFor(() => expect(record()?.failedGuesses).toBe(3));
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    await start('g4');
    expect(turn('g4', "I'm Dana.")).toBe('');
    await end('g4', "I'm Dana.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1, failedGuesses: 3 });
  });

  it('a cooldown that cannot be stored holds the number here: nothing surfaced or refreshed', async () => {
    await seed();
    await start('w1');
    h.fail.tx = 1;
    expect(turn('w1', "I'm Sarah.")).toBe('');
    await vi.waitFor(
      () =>
      expect(h.logged.some(([, m]) => String(m).startsWith('Returning caller denial cooldown not stored'))).toBe(true) // prettier-ignore
    );
    expect(record()).not.toHaveProperty('deniedUntil');
    await start('w2');
    expect(turn('w2', "I'm Dana.")).toBe('');
    await end('w2', "I'm Dana.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1 });
  });

  it('confirms only on the name they state, then gives the topic hint and refreshes her record', async () => {
    await seed();
    await start('self');
    expect(turn('self', "It's Dana.", "Hey, good to hear from you again, who's this?")).toBe(
      "They told you they're Dana, who called you before. Last time you talked about learning guitar. That is all you remember about them: don't claim to remember more, and don't recite it back; let them bring it up."
    );
    expect(turn('self', 'Doing ok.')).toMatch(/learning guitar/);
    await end('self', "Hi, I'm Dana.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 2 });
  });

  it('a bare "yes" never confirms or refreshes the record', async () => {
    await seed();
    await start('yes');
    expect(turn('yes', 'Yes, it is.', 'Is this Dana?')).toBe('');
    expect(turn('yes', 'Yeah.')).toBe('');
    await end('yes', 'Just calling to chat.');
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1, summary: 'learning guitar' });
  });

  it('a cooldown set by another call since this one started holds the write too', async () => {
    await seed();
    await start('early');
    expect(turn('early', "I'm Dana.")).toMatch(/learning guitar/);
    await start('other');
    turn('other', "I'm Sarah.");
    await vi.waitFor(() => expect(record()?.deniedUntil).toBeDefined());
    await end('early', "I'm Dana.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1 });
  });

  it('a different name, even after a match, revokes it: no hint, no write', async () => {
    await seed();
    await start('sam');
    expect(turn('sam', "I'm Dana.")).toMatch(/learning guitar/);
    expect(turn('sam', "Actually I'm Sam, I was kidding.")).toBe('');
    expect(turn('sam', "I'm Dana.")).toBe('');
    await vi.waitFor(() => expect(record()?.deniedUntil).toBeDefined());
    await end('sam', "I'm Sam.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1, summary: 'learning guitar' });
  });

  it('never confirmed: no topic hint, and her record is not refreshed', async () => {
    await seed();
    await start('quiet');
    expect(turn('quiet', 'Hi, what is up?')).toBe('');
    await end('quiet', 'Just chatting.');
    expect(record()).toMatchObject({ callCount: 1 });
  });

  it('leaves the greeting unchanged with the flag off, and a verified user alone', async () => {
    await seed();
    process.env.RETURNING_CALLER = 'off';
    await start('off');
    await directedGreeting('off', 'ferni', {});
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
    expect(firstTalkNote('off')).toMatch(/^This is your first conversation/);
    process.env.RETURNING_CALLER = 'on';
    await startReturningCaller(roomWith(NUMBER), 'acct', 'firebase-uid-123', ATTESTED);
    await directedGreeting('acct', 'ferni', { userName: 'Seth', userId: 'firebase-uid-123' });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
    expect(lastRequest().facts['their name']).toBe('Seth');
  });
});

describe('"forget me"', () => {
  it('stores a tombstone, confirms only once it is stored, and never rewrites it', async () => {
    await seed();
    await start('k2');
    expect(turn('k2', "Wait, you don't remember me?")).toBe('');
    expect(turn('k2', 'Actually, please forget me.')).toBe(rc.FORGETTING_NOTE);
    await vi.waitFor(() => expect(record()?.forgotten).toBe(true));
    expect(record()).not.toHaveProperty('firstName');
    expect(record()).not.toHaveProperty('summary');
    expect(turn('k2', 'Please forget me.')).toBe(rc.FORGOTTEN_NOTE);
    expect(rc.returningCallerFor('k2')).toBeUndefined();
    await end('k2');
    expect(record()).toMatchObject({ forgotten: true, callCount: 0 });

    await start('k3'); // the next call loads nothing and writes nothing back
    expect(rc.returningCallerFor('k3')).toBeUndefined();
    await end('k3', "Hi, I'm Dana again.");
    expect(record()).not.toHaveProperty('firstName');
  });

  it('says the same whether or not a tombstone was already stored for the number', async () => {
    await start('n1'); // nothing stored for this number yet
    expect(turn('n1', 'Please forget me.')).toBe(rc.FORGETTING_NOTE);
    await vi.waitFor(() => expect(record()?.forgotten).toBe(true));
    expect(turn('n1', 'Please forget me.')).toBe(rc.FORGOTTEN_NOTE);
    await end('n1');

    await start('n2'); // a tombstone is stored now: the reply must not show it
    expect(turn('n2', 'Please forget me.')).toBe(rc.FORGETTING_NOTE);
    await vi.waitFor(() => expect(turn('n2', 'Please forget me.')).toBe(rc.FORGOTTEN_NOTE));
  });

  it('retries a tombstone write that fails, then confirms', async () => {
    await seed();
    await start('r2');
    h.fail[CALLERS] = 1;
    expect(turn('r2', 'Please forget me.')).toBe(rc.FORGETTING_NOTE);
    await vi.waitFor(() => expect(record()?.forgotten).toBe(true));
    expect(turn('r2', 'Please forget me.')).toBe(rc.FORGOTTEN_NOTE);
    expect(erasures()).toBe(0);
  });

  it('tombstone keeps failing: a pending-erase marker holds every worker, which retries', async () => {
    await seed();
    await start('f2');
    h.fail[CALLERS] = Infinity;
    expect(turn('f2', 'Please forget me.')).toBe(rc.FORGETTING_NOTE);
    await end('f2'); // waits for the retries, then the marker
    expect(erasures()).toBe(1);
    expect(record()?.firstName).toBe('Dana'); // the store never took the tombstone
    expect(h.logged).toContainEqual([
      'warn',
      'Returning caller not yet cleared: pending-erase marker stored',
    ]);
    expect(rc.FORGETTING_NOTE).not.toMatch(/is now/);

    rc.clearReturningCallers(); // another worker, or a restart: no in-process memory
    rc.registerMinorSignal(() => false);
    await start('f3');
    expect(rc.returningCallerFor('f3')).toBeUndefined();
    expect(turn('f3', 'Please forget me.')).toBe(rc.FORGETTING_NOTE);
    await end('f3', "I'm Dana.");
    expect(record()?.firstName).toBe('Dana');

    h.fail[CALLERS] = 0; // the store recovers: a fresh worker's next call start clears it
    rc.clearReturningCallers();
    rc.registerMinorSignal(() => false);
    await start('f4');
    expect(rc.returningCallerFor('f4')).toBeUndefined();
    await vi.waitFor(() => expect(record()?.forgotten).toBe(true));
    await vi.waitFor(() => expect(erasures()).toBe(0));
  }, 20_000);

  it('marker write fails too: logs a fixed error, and this worker still holds the number', async () => {
    await seed();
    await start('e2');
    h.fail[CALLERS] = Infinity;
    h.fail[ERASURES] = Infinity;
    turn('e2', 'Please forget me.');
    await end('e2');
    expect(h.logged).toContainEqual([
      'error',
      'Returning caller erase failed: neither the tombstone nor the pending-erase marker was stored',
    ]);
    await start('e3');
    expect(rc.returningCallerFor('e3')).toBeUndefined();
  }, 20_000);

  it('a tombstone stored by another call since this one started wins at write time', async () => {
    await seed();
    await start('early');
    expect(turn('early', "I'm Dana.")).toMatch(/learning guitar/);
    await start('later');
    turn('later', 'Please forget me.');
    await vi.waitFor(() => expect(record()?.forgotten).toBe(true));
    await end('early');
    expect(record()).toMatchObject({ forgotten: true, callCount: 0 });
  });

  it('a pending-erase marker found at write time stores the tombstone, not the record', async () => {
    await seed();
    await start('m1');
    expect(turn('m1', "I'm Dana.")).toMatch(/learning guitar/);
    const [key] = [...h.docs.keys()].filter((k) => k.startsWith(CALLERS));
    h.docs.set(`${ERASURES}/${key.split('/')[1]}`, { expireAt: new Date(Date.now() + 60_000) });
    await end('m1', "I'm Dana.");
    expect(record()).toMatchObject({ forgotten: true, callCount: 0 });
    expect(record()).not.toHaveProperty('firstName');
    expect(erasures()).toBe(0);
  });

  it('a number forgotten in this process is never written, even by a confirmed caller', async () => {
    await seed();
    await start('p1');
    expect(turn('p1', "I'm Dana.")).toMatch(/learning guitar/);
    await start('p2');
    h.fail[CALLERS] = Infinity;
    h.fail[ERASURES] = Infinity;
    turn('p2', 'Please forget me.');
    await end('p2'); // nothing stored anywhere: only this process holds the number
    h.fail[CALLERS] = 0;
    h.fail[ERASURES] = 0;
    await end('p1', "I'm Dana.");
    expect(record()).toMatchObject({ firstName: 'Dana', callCount: 1 });
  }, 20_000);

  it('hears a request not to be remembered, not a hope to be', () => {
    for (const ask of [
      'Please forget me.',
      "Don't remember me, ok?",
      'Can you forget about me',
      'Delete my number.',
      "I don't want you to remember me",
    ]) {
      expect(rc.asksToBeForgotten(ask)).toBe(true);
    }
    for (const hope of [
      "You don't remember me?",
      'Did you forget me?',
      "Don't forget me!",
      'forget me not',
      'I forgot my keys',
    ]) {
      expect(rc.asksToBeForgotten(hope)).toBe(false);
    }
  });
});
