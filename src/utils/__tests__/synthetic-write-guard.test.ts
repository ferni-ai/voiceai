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

  it('lets updates of existing docs through (update/tx.update preconditions)', () => {
    const claim = {
      ...update('bogle_users/test-user-1/reminders/r1'),
      currentDocument: { exists: true },
    };
    expect(refusedOwner(claim, {})).toBeNull();
    const createOnly = { ...update('bogle_users/test-user-1'), currentDocument: { exists: false } };
    expect(refusedOwner(createOnly, {})).toBe('test-user-1');
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

describe('what counts as prod: the project in the written document, nothing else', () => {
  const write = (project: string) =>
    update('bogle_users/test-user-1', {}, `projects/${project}/databases/(default)/documents`);

  it.each([
    ['the prod agent', { NODE_ENV: 'production', AGENT_NAME: 'voice-agent' }],
    [
      'the ferni-dev agent, which also writes to johnb-2025',
      { NODE_ENV: 'production', AGENT_NAME: 'voice-agent-lkcloud' },
    ],
    [
      'a local process with prod data opted in',
      { NODE_ENV: 'development', ALLOW_PRODUCTION_DATA: '1' },
    ],
    ['a process whose env names another project', { GOOGLE_CLOUD_PROJECT: 'ferni-dev' }],
  ])('refuses a johnb-2025 write from %s', (_who, env) => {
    expect(refusedOwner(write('johnb-2025'), env)).toBe('test-user-1');
  });

  it('lets the same write through to any other project, even from a production process', () => {
    const env = { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: 'johnb-2025' };
    for (const project of ['ferni-dev', 'ferni-test-no-gcp', 'demo-project']) {
      expect(refusedOwner(write(project), env), project).toBeNull();
    }
  });
});

describe('prefix-only matching: real ids are never refused', () => {
  const REAL_IDS = [
    'AbCdEfGhIjKlMnOpQrStUvWxYz12', // Firebase uid
    'device:3f2a9c1e-7b4d-4e2a-9f1c-0d8e6b5a4c3b',
    'device:test-rig-1', // device: is real; only device:cli- is the CLI
    'phone:+14155550100',
    'phone:+15555550100', // phone: owner ids are real; only phone_mappings rows for +1555 are not
    'family_8f2a1c',
    'sponsored_5d3e9b',
    'auth:google:113546789012345678901',
    'auth:apple:000123.abc.0456',
    'anon:3f2a',
    // contain a harness prefix, but not at the start
    'abc-test-123',
    'x-voice-eval-y',
    'my-e2e-run',
    'a-flow-test-1',
    'zctx-e2e-1',
    'device:abc-cli-1',
    'Test-user-1', // case matters
  ];

  it.each(REAL_IDS)('lets %s write, by path and by owner field', (id) => {
    expect(refusedOwner(update(`bogle_users/${id}/memories/m1`), {})).toBeNull();
    expect(refusedOwner(update(`users/${id}`), {})).toBeNull();
    expect(refusedOwner(update('vectors/v1', { userId: id }), {})).toBeNull();
    expect(syntheticOwnerPrefix(id)).toBeNull();
  });
});

describe('installSyntheticWriteGuard', () => {
  function fakeClass() {
    const request = vi.fn(async () => ({ writeResults: [] }));
    return { cls: { prototype: { request } as Record<string | symbol, unknown> }, request };
  }

  it('refuses a commit made only of harness writes, without sending it', async () => {
    const { cls, request } = fakeClass();
    installSyntheticWriteGuard({}, [cls]);
    const send = cls.prototype.request as (...a: unknown[]) => Promise<unknown>;
    const commit = send('commit', {
      writes: [update('bogle_users/test-user-1'), update('users/test-user-1/x/y')],
    });
    await expect(commit).rejects.toBeInstanceOf(SyntheticWriteRefusedError);
    await expect(commit).rejects.toMatchObject({ code: 7, owner: 'test-user-1' });
    expect(request).not.toHaveBeenCalled();
  });

  it('sends a commit that mixes real and harness writes, whole (it is atomic)', async () => {
    const { cls, request } = fakeClass();
    installSyntheticWriteGuard({}, [cls]);
    const send = cls.prototype.request as (...a: unknown[]) => Promise<unknown>;
    const writes = [update('bogle_users/RealUid/r/1'), update('bogle_users/test-user-1/r/2')];
    await send('commit', { writes });
    expect(request).toHaveBeenCalledWith('commit', { writes });
  });

  it("sends a sweep's claim transaction on a harness user's reminder (update of an existing doc)", async () => {
    const { cls, request } = fakeClass();
    installSyntheticWriteGuard({}, [cls]);
    const send = cls.prototype.request as (...a: unknown[]) => Promise<unknown>;
    const claim = {
      ...update('bogle_users/voice-eval-x-20261018120000-abcd/reminders/r1', { status: 'sending' }),
      currentDocument: { exists: true },
    };
    await send('commit', { transaction: 'tx-1', writes: [claim] });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('batchWrite sends the real writes and answers each harness write PERMISSION_DENIED in place', async () => {
    const request = vi.fn(async (_m: string, req: { writes: unknown[] }) => ({
      writeResults: req.writes.map((_, i) => ({ updateTime: `t${i}` })),
      status: req.writes.map(() => ({ code: 0 })),
    }));
    const cls = { prototype: { request } as Record<string | symbol, unknown> };
    installSyntheticWriteGuard({}, [cls]);
    const send = cls.prototype.request as (...a: unknown[]) => Promise<unknown>;
    const real1 = update('bogle_users/RealUid/r/1');
    const real2 = update('bogle_users/OtherUid/r/2');
    const response = (await send('batchWrite', {
      writes: [real1, update('bogle_users/e2e-1/r/3'), real2],
    })) as { writeResults: unknown[]; status: Array<{ code: number }> };
    expect(request).toHaveBeenCalledWith('batchWrite', { writes: [real1, real2] });
    expect(response.status.map((st) => st.code)).toEqual([0, 7, 0]);
    expect(response.writeResults).toEqual([{ updateTime: 't0' }, {}, { updateTime: 't1' }]);
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
      // update() requires the doc to exist, so it passes this guard; the test
      // setup's own refusal (gcp-test-guard, downstream) is what stops it here.
      const claim = db.collection('bogle_users').doc('flow-test-1').update({ status: 'sending' });
      await expect(claim).rejects.not.toBeInstanceOf(SyntheticWriteRefusedError);
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
