/**
 * A rejected Firestore RPC logs one FIRESTORE_ERROR line (shape only, no ids
 * or values), deduped per call site per minute, and the caller still gets the
 * same error object. Success logs nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFirestoreDbPin } from '../firestore-db-pin.js';
import {
  indexUrlOf,
  pathTemplate,
  queryShape,
  type FirestoreErrorLine,
} from '../firestore-error-log.js';
import { SyntheticWriteRefusedError } from '../synthetic-write-guard.js';

type Rpc = (this: unknown, ...a: unknown[]) => Promise<unknown>;

const DOCS = 'projects/johnb-2025/databases/(default)/documents';
const UID = 'Xk3P9aQz7LmN2bVc8RtY1wEe';
const PHONE = '+15551234567';
const SECRET = 'my private words';
// A real link from prod logs (outreach: status, userId, scheduledFor).
const INDEX_URL =
  'https://console.firebase.google.com/v1/r/project/johnb-2025/firestore/indexes?create_composite=' +
  'Cktwcm9qZWN0cy9qb2huYi0yMDI1L2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9vdXRyZWFjaC9pbmRleGVzL18Q' +
  'ARoKCgZzdGF0dXMQARoKCgZ1c2VySWQQARoQCgxzY2hlZHVsZWRGb3IQARoMCghfX25hbWVfXxAB';

const QUERY = {
  parent: `${DOCS}/bogle_users/${UID}`,
  structuredQuery: {
    from: [{ collectionId: 'dynamic_facts' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: SECRET },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: `contacts.${PHONE}` },
              op: 'GREATER_THAN',
              value: { integerValue: '987654' },
            },
          },
        ],
      },
    },
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: { value: 7 },
  },
};
const COMMIT = {
  database: 'projects/johnb-2025/databases/(default)',
  writes: [
    {
      update: {
        name: `${DOCS}/bogle_users/${UID}/turns/turn-${UID}`,
        fields: { t: { stringValue: SECRET } },
      },
    },
  ],
};

const grpcError = (code: number, message: string) =>
  Object.assign(new Error(`${code} ${message}`), { code, details: message, metadata: {} });

/** Fake client whose RPCs settle with `outcome()`; calls are shaped like the SDK's. */
function setup(outcome: () => Promise<unknown>) {
  const original = vi.fn(async () => outcome());
  const proto: Record<string | symbol, unknown> = {
    initializeIfNeeded: vi.fn(async () => undefined),
    request: original,
    requestStream: original,
  };
  const client = Object.assign(Object.create(proto) as object, { databaseId: '(default)' });
  const lines: FirestoreErrorLine[] = [];
  installFirestoreDbPin(
    {},
    [{ Firestore: { prototype: proto } }],
    () => {},
    (l) => lines.push(l)
  );
  const rpc = (name: string) => proto[name] as Rpc;
  let n = 0;
  // Like Query.get(): the tag is noted synchronously, the RPC runs after an await.
  function fakeQueryGet(request: unknown = QUERY) {
    const tag = `tag${++n}`;
    return rpc('initializeIfNeeded')
      .call(client, tag)
      .then(() => rpc('requestStream').call(client, 'runQuery', false, request, tag));
  }
  function fakeCommit(request: unknown = COMMIT) {
    const tag = `tag${++n}`;
    return rpc('initializeIfNeeded')
      .call(client, tag)
      .then(() => rpc('request').call(client, 'commit', request, tag));
  }
  return { lines, original, fakeQueryGet, fakeCommit };
}

const leaks = (line: unknown) =>
  [UID, PHONE, '15551234567', SECRET, '987654'].filter((s) => JSON.stringify(line).includes(s));

describe('FIRESTORE_ERROR lines from the db-pin RPC wrapper', () => {
  afterEach(() => vi.useRealTimers());

  it('FAILED_PRECONDITION query: one line, shape and index link only, same error re-thrown', async () => {
    const error = grpcError(
      9,
      `FAILED_PRECONDITION: The query requires an index. You can create it here: ${INDEX_URL}`
    );
    const { lines, fakeQueryGet } = setup(() => Promise.reject(error));
    await expect(fakeQueryGet()).rejects.toBe(error);
    expect(lines).toEqual([
      {
        event: 'FIRESTORE_ERROR',
        code: 'FAILED_PRECONDITION',
        method: 'runQuery',
        path: 'bogle_users/:id/dynamic_facts',
        query:
          'where (status EQUAL AND contacts.:id GREATER_THAN) orderBy createdAt DESCENDING limit',
        callSite: expect.stringMatching(/fakeQueryGet .*firestore-error-log\.test\.ts/),
        database: '(default)',
        count: 1,
        indexUrl: INDEX_URL,
      },
    ]);
    expect(leaks(lines)).toEqual([]);
  });

  it('INVALID_ARGUMENT commit: one line, no ids, values or server message, same error re-thrown', async () => {
    const error = grpcError(
      3,
      `INVALID_ARGUMENT: Document "${COMMIT.writes[0]?.update.name}" is invalid`
    );
    const { lines, fakeCommit } = setup(() => Promise.reject(error));
    await expect(fakeCommit()).rejects.toBe(error);
    expect(lines).toEqual([
      expect.objectContaining({
        code: 'INVALID_ARGUMENT',
        method: 'commit',
        path: 'bogle_users/:id/turns',
        count: 1,
      }),
    ]);
    expect(lines[0]).not.toHaveProperty('query');
    expect(lines[0]).not.toHaveProperty('indexUrl');
    expect(leaks(lines)).toEqual([]);
  });

  it('logs a repeat at most once a minute, counting the ones it skipped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const error = grpcError(9, 'FAILED_PRECONDITION: The query requires an index.');
    const { lines, fakeQueryGet } = setup(() => Promise.reject(error));
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose: one call at a time
      await expect(fakeQueryGet()).rejects.toBe(error);
    }
    expect(lines).toHaveLength(1);
    vi.setSystemTime(Date.now() + 60_000);
    await expect(fakeQueryGet()).rejects.toBe(error);
    expect(lines.map((l) => l.count)).toEqual([1, 3]);
  });

  it('success logs nothing and returns the same result', async () => {
    const result = { writeResults: [] };
    const { lines, fakeQueryGet, fakeCommit, original } = setup(async () => result);
    await expect(fakeQueryGet()).resolves.toBe(result);
    await expect(fakeCommit()).resolves.toBe(result);
    expect(original).toHaveBeenCalledTimes(2);
    expect(lines).toEqual([]);
  });

  it('does not log the synthetic-write guard refusing a write (it logs its own line)', async () => {
    const refusal = new SyntheticWriteRefusedError('synthetic-user');
    const { lines, fakeCommit } = setup(() => Promise.reject(refusal));
    await expect(fakeCommit()).rejects.toBe(refusal);
    expect(lines).toEqual([]);
  });
});

describe('shape helpers', () => {
  it('collection groups, batch gets and multi-collection commits', () => {
    const group = {
      parent: DOCS,
      structuredQuery: { from: [{ collectionId: 'scheduled_outreach', allDescendants: true }] },
    };
    expect(pathTemplate(group)).toBe('**/scheduled_outreach');
    expect(queryShape(group)).toBe('all');
    expect(pathTemplate({ documents: [`${DOCS}/bogle_users/${UID}`] })).toBe('bogle_users');
    const writes = ['a', 'b', 'c', 'd'].map((c) => ({ delete: `${DOCS}/${c}/x1` }));
    expect(pathTemplate({ writes })).toBe('a,b,c,+1');
    expect(pathTemplate({ name: 'projects/p/databases/d' })).toBe('-');
  });

  it('keeps only the known index link and drops one whose fields look like ids', () => {
    expect(indexUrlOf(`here: ${INDEX_URL}\nand more "${UID}"`)).toBe(INDEX_URL);
    const idField = Buffer.from(`\x0a\x10collectionGroups/c\x1a\x10contacts.${PHONE}`).toString(
      'base64'
    );
    const url = `https://console.firebase.google.com/v1/r/project/p/firestore/indexes?create_composite=${idField}`;
    expect(indexUrlOf(url)).toBe('dropped: id-like field in index');
    expect(indexUrlOf('https://evil.example/indexes?create_composite=abc')).toBeUndefined();
  });
});
