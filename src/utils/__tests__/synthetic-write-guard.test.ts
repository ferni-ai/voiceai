/**
 * Production refuses writes for test, eval and CLI harness owners, at the one
 * layer every Firestore write passes (Firestore.prototype.request).
 */
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import {
  installSyntheticWriteGuard,
  refusedOwner,
  SyntheticWriteRefusedError,
} from '../synthetic-write-guard.js';
import { isSyntheticUserId, syntheticOwnerPrefix } from '../synthetic-user.js';

const PROD = 'projects/johnb-2025/databases/(default)/documents';
const update = (path: string, fields: Record<string, string> = {}, project = PROD) => ({
  update: {
    name: `${project}/${path}`,
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])),
  },
});

describe('refusedOwner', () => {
  it('refuses every harness owner under bogle_users and users', () => {
    for (const owner of [
      'voice-eval-story-20261018-abcd',
      'e2e-test-1',
      'flow-test-17',
      'test-user-123',
      'ctx-e2e-9',
      'device:cli-1760000000',
    ]) {
      expect(refusedOwner(update(`bogle_users/${owner}/memories/m1`), {}), owner).toBe(owner);
      expect(refusedOwner(update(`users/${owner}`), {}), owner).toBe(owner);
    }
  });

  it('lets real people, anon: callers and devices write', () => {
    for (const owner of ['AbCdEfGhIjKlMnOpQrStUvWxYz12', 'anon:3f2a', 'device:9f3a-uuid']) {
      expect(refusedOwner(update(`bogle_users/${owner}/memories/m1`), {}), owner).toBeNull();
    }
  });

  it('refuses documents whose owner field names a harness user', () => {
    expect(refusedOwner(update('vectors/v1', { userId: 'test-user-1' }), {})).toBe('test-user-1');
    expect(refusedOwner(update('alarms/a1', { user_id: 'e2e-x' }), {})).toBe('e2e-x');
    expect(refusedOwner(update('vectors/v2', { userId: 'RealUid123' }), {})).toBeNull();
    const vector = update('vectors/v3');
    Object.assign(vector.update.fields, {
      metadata: { mapValue: { fields: { userId: { stringValue: 'voice-eval-x' } } } },
    });
    expect(refusedOwner(vector, {})).toBe('voice-eval-x');
  });

  it('refuses phone_mappings rows for +1555 numbers only', () => {
    expect(refusedOwner(update('phone_mappings/+15551234567'), {})).toBe('+15551234567');
    expect(refusedOwner(update('phone_mappings/+14155550100'), {})).toBeNull();
  });

  it('always lets deletes through, and ignores other projects and the emulator', () => {
    expect(refusedOwner({ delete: `${PROD}/bogle_users/test-user-1` }, {})).toBeNull();
    const emulator = { FIRESTORE_EMULATOR_HOST: 'localhost:8080' };
    expect(refusedOwner(update('bogle_users/test-user-1'), emulator)).toBeNull();
    const dev = 'projects/ferni-dev/databases/(default)/documents';
    expect(refusedOwner(update('bogle_users/test-user-1', {}, dev), {})).toBeNull();
  });

  it('checks transform-only writes too', () => {
    const write = { transform: { document: `${PROD}/bogle_users/e2e-1/stats/s` } };
    expect(refusedOwner(write, {})).toBe('e2e-1');
  });

  it('PROD_EVAL_WRITES=voice-eval lets voice-eval owners through, and nothing else', () => {
    const env = { PROD_EVAL_WRITES: 'voice-eval' };
    expect(refusedOwner(update('bogle_users/voice-eval-sam/memories/m'), env)).toBeNull();
    expect(refusedOwner(update('bogle_users/test-user-1'), env)).toBe('test-user-1');
    expect(refusedOwner(update('bogle_users/e2e-1'), { PROD_EVAL_WRITES: 'e2e' })).toBe('e2e-1');
    expect(refusedOwner(update('bogle_users/voice-eval-sam'), { PROD_EVAL_WRITES: 'on' })).toBe(
      'voice-eval-sam'
    );
  });
});

describe('installSyntheticWriteGuard', () => {
  function fakeClass() {
    const request = vi.fn(async () => ({ writeResults: [] }));
    return { cls: { prototype: { request } as Record<string | symbol, unknown> }, request };
  }

  it('rejects a commit holding a harness write without sending it', async () => {
    const { cls, request } = fakeClass();
    installSyntheticWriteGuard({}, [cls]);
    const send = cls.prototype.request as (...a: unknown[]) => Promise<unknown>;
    const commit = send('commit', {
      writes: [update('bogle_users/RealUid'), update('bogle_users/test-user-1')],
    });
    await expect(commit).rejects.toBeInstanceOf(SyntheticWriteRefusedError);
    await expect(commit).rejects.toMatchObject({ code: 7, owner: 'test-user-1' });
    expect(request).not.toHaveBeenCalled();
  });

  it('sends real writes, deletes and reads unchanged, and wraps only once', async () => {
    const { cls, request } = fakeClass();
    installSyntheticWriteGuard({}, [cls]);
    installSyntheticWriteGuard({}, [cls]);
    const send = cls.prototype.request as (...a: unknown[]) => Promise<unknown>;
    await send('commit', { writes: [update('bogle_users/RealUid')] });
    await send('batchWrite', { writes: [{ delete: `${PROD}/bogle_users/test-user-1` }] });
    await send('getDocument', { name: `${PROD}/bogle_users/test-user-1` });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('stops a real client writing a harness user to production', async () => {
    // Node's require: the test setup's vi.mock replaces the ESM import with a fake.
    const { Firestore } = createRequire(import.meta.url)(
      '@google-cloud/firestore'
    ) as typeof import('@google-cloud/firestore');
    installSyntheticWriteGuard({});
    const db = new Firestore({ projectId: 'johnb-2025' });
    // Past the test setup's own refusal (gcp-test-guard), which fires first;
    // the write is then refused at request(), before anything is sent.
    (db as unknown as { initializeIfNeeded: () => Promise<void> }).initializeIfNeeded =
      async () => {};
    try {
      const write = db
        .collection('bogle_users')
        .doc('flow-test-1')
        .collection('x')
        .doc('y')
        .set({ a: 1 });
      await expect(write).rejects.toBeInstanceOf(SyntheticWriteRefusedError);
      const viaField = db
        .collection('vectors')
        .doc('v')
        .set({ metadata: { userId: 'device:cli-1' } });
      await expect(viaField).rejects.toMatchObject({ owner: 'device:cli-1' });
    } finally {
      await db.terminate();
    }
  });
});

describe('synthetic owner prefixes', () => {
  it('match the harness ids, never anon: or real ids', () => {
    expect(syntheticOwnerPrefix('ctx-e2e-1')).toBe('ctx-e2e-');
    expect(syntheticOwnerPrefix('anon:1')).toBeNull();
    expect(syntheticOwnerPrefix('AbCdEfGhIjKlMnOpQrStUvWxYz12')).toBeNull();
    expect(isSyntheticUserId('test-user-1')).toBe(true);
    expect(isSyntheticUserId('device:cli-1')).toBe(true);
    expect(isSyntheticUserId('device:debug-1')).toBe(true);
  });
});
