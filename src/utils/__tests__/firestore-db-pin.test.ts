/**
 * Every Firestore RPC, reads included, is checked against the process's
 * database (FIRESTORE_DATABASE, or '(default)'): a client bound elsewhere is
 * reported (FIRESTORE_DB_PIN=report, the default) or refused (refuse).
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FirestoreDatabaseMismatchError,
  firestoreDbPinMode,
  installFirestoreDbPin,
  type FirestoreDbMismatch,
} from '../firestore-db-pin.js';

type Rpc = (this: unknown, method: string, ...rest: unknown[]) => Promise<unknown>;

interface FakeClass {
  prototype: Record<string | symbol, unknown>;
}

const clientOf = (cls: FakeClass, databaseId: string): object =>
  Object.assign(Object.create(cls.prototype) as object, { databaseId });

function fakeClient(databaseId: string) {
  const request = vi.fn(async () => ({ writeResults: [] }));
  const requestStream = vi.fn(async () => 'stream');
  const cls: FakeClass = { prototype: { request, requestStream } };
  const client = clientOf(cls, databaseId);
  const proto = cls.prototype as { request: Rpc; requestStream: Rpc };
  return {
    cls,
    request,
    requestStream,
    write: () => proto.request.call(client, 'commit', { writes: [] }, 'tag'),
    read: () => proto.requestStream.call(client, 'runQuery', false, {}, 'tag'),
  };
}

function setup(env: Record<string, string>, databaseId = '(default)') {
  const fake = fakeClient(databaseId);
  const lines: FirestoreDbMismatch[] = [];
  installFirestoreDbPin(env, [{ Firestore: fake.cls }], (m) => lines.push(m));
  return { ...fake, lines };
}

const DEV = { FIRESTORE_DATABASE: 'ferni-dev' };

describe('firestoreDbPinMode', () => {
  it('is report unless FIRESTORE_DB_PIN says refuse or off', () => {
    expect(firestoreDbPinMode({})).toBe('report');
    expect(firestoreDbPinMode({ FIRESTORE_DB_PIN: 'nonsense' })).toBe('report');
    expect(firestoreDbPinMode({ FIRESTORE_DB_PIN: ' Refuse ' })).toBe('refuse');
    expect(firestoreDbPinMode({ FIRESTORE_DB_PIN: 'OFF' })).toBe('off');
  });
});

describe('installFirestoreDbPin', () => {
  afterEach(() => vi.useRealTimers());

  it("report: a '(default)' client in a ferni-dev process logs the write and still sends it", async () => {
    const { write, request, lines } = setup(DEV);
    await expect(write()).resolves.toEqual({ writeResults: [] });
    expect(request).toHaveBeenCalledWith('commit', { writes: [] }, 'tag');
    expect(lines).toEqual([
      expect.objectContaining({
        event: 'FIRESTORE_DB_MISMATCH',
        mode: 'report',
        expected: 'ferni-dev',
        actual: '(default)',
        method: 'commit',
        site: expect.stringContaining('firestore-db-pin.test.ts'),
      }),
    ]);
  });

  it('report: checks reads too (requestStream)', async () => {
    const { read, requestStream, lines } = setup(DEV);
    await expect(read()).resolves.toBe('stream');
    expect(requestStream).toHaveBeenCalledWith('runQuery', false, {}, 'tag');
    expect(lines).toEqual([
      expect.objectContaining({ mode: 'report', actual: '(default)', method: 'runQuery' }),
    ]);
  });

  it('refuse: rejects the write and the read without sending them, and logs', async () => {
    const { write, read, request, requestStream, lines } = setup({
      ...DEV,
      FIRESTORE_DB_PIN: 'refuse',
    });
    const refusedWrite = write();
    await expect(refusedWrite).rejects.toBeInstanceOf(FirestoreDatabaseMismatchError);
    await expect(refusedWrite).rejects.toMatchObject({
      code: 7,
      expected: 'ferni-dev',
      actual: '(default)',
      method: 'commit',
    });
    await expect(read()).rejects.toMatchObject({ code: 7, method: 'runQuery' });
    expect(request).not.toHaveBeenCalled();
    expect(requestStream).not.toHaveBeenCalled();
    expect(lines.map((l) => [l.mode, l.method])).toEqual([
      ['refuse', 'commit'],
      ['refuse', 'runQuery'],
    ]);
  });

  it('prod reports a stray named-database client: expected is (default) when unset', async () => {
    const { write, lines } = setup({}, 'ferni-dev');
    await write();
    expect(lines).toEqual([
      expect.objectContaining({ expected: '(default)', actual: 'ferni-dev' }),
    ]);
  });

  it('matching databases log nothing and send everything', async () => {
    const dev = setup({ ...DEV, FIRESTORE_DB_PIN: 'refuse' }, 'ferni-dev');
    await dev.write();
    await dev.read();
    const prod = setup({ FIRESTORE_DB_PIN: 'refuse' }, '(default)');
    await prod.write();
    await prod.read();
    expect([...dev.lines, ...prod.lines]).toEqual([]);
    expect(dev.request).toHaveBeenCalledTimes(1);
    expect(dev.requestStream).toHaveBeenCalledTimes(1);
    expect(prod.request).toHaveBeenCalledTimes(1);
    expect(prod.requestStream).toHaveBeenCalledTimes(1);
  });

  it('logs a call site once, counts its repeats, logs each distinct site, and refuses every call', async () => {
    const { cls, request, lines } = setup({ ...DEV, FIRESTORE_DB_PIN: 'refuse' });
    const client = clientOf(cls, '(default)');
    const rpc = cls.prototype.request as Rpc;
    for (let i = 0; i < 5; i++) await expect(rpc.call(client, 'commit')).rejects.toThrow();
    expect(lines).toHaveLength(1);
    await expect(rpc.call(client, 'commit')).rejects.toThrow(); // a second call site
    expect(lines).toHaveLength(2);
    expect(lines[0]?.site).not.toBe(lines[1]?.site);
    // The four repeats of the first site were not logged, but they were counted.
    expect(lines[1]?.suppressed).toBe(4);
    expect(request).not.toHaveBeenCalled();
  });

  it('caps lines per minute and counts what it suppressed in the next line', async () => {
    vi.useFakeTimers();
    const { cls, lines } = setup(DEV);
    const client = clientOf(cls, '(default)');
    const send = (method: string) => (cls.prototype.request as Rpc).call(client, method, {});
    for (let i = 0; i < 25; i++) await send(`m${i}`);
    expect(lines).toHaveLength(20);
    vi.advanceTimersByTime(60_000);
    await send('after-window');
    expect(lines).toHaveLength(21);
    expect(lines.at(-1)).toMatchObject({ method: 'after-window', suppressed: 5 });
  });

  it('FIRESTORE_DB_PIN=off disables the check', async () => {
    const { write, read, request, requestStream, lines } = setup({
      ...DEV,
      FIRESTORE_DB_PIN: 'off',
    });
    await write();
    await read();
    expect(lines).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(requestStream).toHaveBeenCalledTimes(1);
  });

  it('wraps a class only once', async () => {
    const { cls, write, request, lines } = setup(DEV);
    installFirestoreDbPin(DEV, [{ Firestore: cls }], (m) => lines.push(m));
    await write();
    expect(request).toHaveBeenCalledTimes(1);
    expect(lines).toHaveLength(1);
  });

  it("refuses a real '(default)' client's write and read in a ferni-dev process", async () => {
    // Node's require: the test setup's vi.mock replaces the ESM import with a fake.
    const { Firestore } = createRequire(import.meta.url)(
      '@google-cloud/firestore'
    ) as typeof import('@google-cloud/firestore');
    const saved = { db: process.env.FIRESTORE_DATABASE, pin: process.env.FIRESTORE_DB_PIN };
    process.env.FIRESTORE_DATABASE = 'ferni-dev';
    process.env.FIRESTORE_DB_PIN = 'refuse';
    installFirestoreDbPin();
    const stray = new Firestore({ projectId: 'demo-pin' });
    const dev = new Firestore({ projectId: 'demo-pin', databaseId: 'ferni-dev' });
    for (const db of [stray, dev]) {
      // Past the test setup's own refusal (gcp-test-guard), which fires first here.
      (db as unknown as { initializeIfNeeded: () => Promise<void> }).initializeIfNeeded =
        async () => {};
    }
    const mismatch = { name: 'FirestoreDatabaseMismatchError', code: 7, actual: '(default)' };
    try {
      await expect(stray.collection('c').doc('d').set({ a: 1 })).rejects.toMatchObject({
        ...mismatch,
        method: 'commit',
      });
      await expect(stray.collection('c').doc('d').get()).rejects.toMatchObject({
        ...mismatch,
        method: 'batchGetDocuments',
      });
      // A ferni-dev client passes the pin; the test setup's guard then stops it.
      await expect(dev.collection('c').doc('d').get()).rejects.not.toMatchObject({
        name: 'FirestoreDatabaseMismatchError',
      });
    } finally {
      await Promise.all([stray.terminate(), dev.terminate()]);
      for (const [key, value] of [
        ['FIRESTORE_DATABASE', saved.db],
        ['FIRESTORE_DB_PIN', saved.pin],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  it('names each real-SDK writer by its own app line, though set() commits after an await', async () => {
    const sdk = createRequire(import.meta.url)(
      '@google-cloud/firestore'
    ) as typeof import('@google-cloud/firestore');
    // The transport, stubbed beneath the pin: nothing leaves the process.
    const ts = { seconds: 1, nanos: 0 };
    const transport = vi.fn(async () => ({
      writeResults: [{ updateTime: ts }],
      commitTime: ts,
      transaction: Buffer.from('tx'),
    }));
    class Probe extends sdk.Firestore {}
    Object.assign(Probe.prototype, { request: transport });
    const lines: FirestoreDbMismatch[] = [];
    const saved = process.env.FIRESTORE_DATABASE;
    process.env.FIRESTORE_DATABASE = 'ferni-dev';
    installFirestoreDbPin(
      process.env,
      [
        {
          Firestore: Probe as unknown as FakeClass,
          WriteBatch: sdk.WriteBatch as unknown as FakeClass,
        },
      ],
      (m) => lines.push(m)
    );
    const db = new Probe({ projectId: 'demo-pin' });
    (db as unknown as { initializeIfNeeded: () => Promise<void> }).initializeIfNeeded =
      async () => {};
    const writerA = async () => db.doc('a/1').set({ x: 1 });
    const writerB = async () => db.collection('b').doc('2').update({ y: 2 });
    const writerC = async () => {
      const batch = db.batch();
      batch.set(db.doc('c/3'), { z: 3 });
      return batch.commit();
    };
    const writerD = async () => db.runTransaction(async (tx) => tx.set(db.doc('d/4'), { w: 4 }));
    try {
      await writerA();
      await writerB();
      await writerC();
      await writerD();
      await writerA(); // a repeat: counted, not logged
      await writerA();
      const commits = lines.filter((l) => l.method === 'commit');
      expect(commits).toHaveLength(4);
      for (const line of commits) expect(line.site).toMatch(/firestore-db-pin\.test\.ts:\d+/);
      expect(new Set(commits.map((l) => l.site)).size).toBe(4);
      expect(transport).toHaveBeenCalled();
      await db.doc('e/5').delete(); // a fifth site carries the repeats
      expect(lines.at(-1)).toMatchObject({ method: 'commit', suppressed: 2 });
    } finally {
      await db.terminate();
      if (saved === undefined) delete process.env.FIRESTORE_DATABASE;
      else process.env.FIRESTORE_DATABASE = saved;
    }
  });

  it('names the app line of a real-SDK query, though runQuery is sent from a .then()', async () => {
    const sdk = createRequire(import.meta.url)(
      '@google-cloud/firestore'
    ) as typeof import('@google-cloud/firestore');
    // Transport and init, stubbed beneath the pin: nothing leaves the process.
    class QueryProbe extends sdk.Firestore {}
    const transport = vi.fn(async () => 'never sent');
    Object.assign(QueryProbe.prototype, {
      requestStream: transport,
      initializeIfNeeded: async () => {},
    });
    const lines: FirestoreDbMismatch[] = [];
    const env = { ...DEV, FIRESTORE_DB_PIN: 'refuse' };
    installFirestoreDbPin(env, [{ Firestore: QueryProbe as unknown as FakeClass }], (m) =>
      lines.push(m)
    );
    const db = new QueryProbe({ projectId: 'demo-pin' });
    try {
      await expect(db.collection('q').where('a', '==', 1).get()).rejects.toMatchObject({
        name: 'FirestoreDatabaseMismatchError',
        method: 'runQuery',
      });
      expect(transport).not.toHaveBeenCalled();
      // It used to say "unknown": the SDK sends runQuery after initializeIfNeeded()
      // resolves, so no app frame is on the stack by then.
      expect(lines).toEqual([
        expect.objectContaining({
          method: 'runQuery',
          site: expect.stringMatching(/firestore-db-pin\.test\.ts:\d+/),
        }),
      ]);
    } finally {
      await db.terminate();
    }
  });

  it("firebase-admin's getFirestore() uses the same client class the pin patches", () => {
    const fromHere = createRequire(import.meta.url);
    const fromAdmin = createRequire(fromHere.resolve('firebase-admin'));
    const mine = fromHere('@google-cloud/firestore') as typeof import('@google-cloud/firestore');
    const admins = fromAdmin('@google-cloud/firestore') as typeof import('@google-cloud/firestore');
    // If this ever splits, realFirestoreModules() lists both copies and both get pinned.
    expect(admins.Firestore).toBe(mine.Firestore);
    expect(admins.WriteBatch).toBe(mine.WriteBatch);
  });
});
