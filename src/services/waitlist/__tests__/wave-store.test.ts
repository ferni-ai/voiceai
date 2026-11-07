/**
 * The wave doc writes that take a caller's summary (finishWave, recordSkip), against a
 * recording fake: an undefined summary field never reaches Firestore (it rejects one),
 * the status and timestamp are written as Dates, and a finished wave's lease is deleted.
 * The emulator suite (wave-store.emulator.test.ts) covers the transactions.
 */
import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { firestoreWaveStore } from '../wave-store.js';

type Doc = Record<string, unknown>;

/** Records each set() on `waitlist_waves`; `existing` is what a get() of a wave reads. */
function recordingDb(existing?: Doc) {
  const writes: Array<{ id: string; data: Doc; options: unknown }> = [];
  const doc = (id: string) => ({
    get: async () => ({ data: () => existing }),
    set: async (data: Doc, options?: unknown) => {
      writes.push({ id, data, options });
    },
  });
  const db = { collection: () => ({ doc }) } as unknown as Firestore;
  return { store: firestoreWaveStore(db), writes };
}

/** A summary whose optional fields the caller left unset, one of them nested. */
const SUMMARY = { admitted: 3, lapsed: 0, note: undefined, counts: { full: 1, member: undefined } };

/** Every key path in `d` whose value is undefined. */
const undefinedPaths = (d: Doc, at = ''): string[] =>
  Object.entries(d).flatMap(([k, v]) =>
    v === undefined
      ? [`${at}${k}`]
      : v && Object.getPrototypeOf(v) === Object.prototype
        ? undefinedPaths(v as Doc, `${at}${k}.`)
        : []
  );

describe('wave store: summary writes', () => {
  it('finishWave writes done, a finishedAt Date and deletes the lease, with no undefined field', async () => {
    const { store, writes } = recordingDb({ status: 'running' });
    await store.finishWave('w1', SUMMARY);
    expect(writes).toHaveLength(1);
    const [{ id, data, options }] = writes as [(typeof writes)[number]];
    expect(id).toBe('w1');
    expect(options).toEqual({ merge: true });
    expect(undefinedPaths(data)).toEqual([]);
    expect(data).toMatchObject({ admitted: 3, lapsed: 0, counts: { full: 1 }, status: 'done' });
    expect(data.finishedAt).toBeInstanceOf(Date);
    expect((data.leaseUntil as FieldValue).isEqual(FieldValue.delete())).toBe(true);
  });

  it('recordSkip writes skipped and a skippedAt Date, with no undefined field', async () => {
    const { store, writes } = recordingDb(undefined);
    await store.recordSkip('w2', SUMMARY);
    expect(writes).toHaveLength(1);
    const [{ id, data, options }] = writes as [(typeof writes)[number]];
    expect(id).toBe('w2');
    expect(options).toEqual({ merge: true });
    expect(undefinedPaths(data)).toEqual([]);
    expect(data).toMatchObject({ admitted: 3, lapsed: 0, counts: { full: 1 }, status: 'skipped' });
    expect(data.skippedAt).toBeInstanceOf(Date);
    expect('leaseUntil' in data).toBe(false);
  });

  it.each(['done', 'running'])('recordSkip never writes over a wave that is %s', async (status) => {
    const { store, writes } = recordingDb({ status });
    await store.recordSkip('w3', SUMMARY);
    expect(writes).toHaveLength(0);
  });
});
