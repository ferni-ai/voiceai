import { afterEach, describe, expect, it, vi } from 'vitest';

// The real SDK (setup.ts swaps in a fake): parity is about what a real client does.
vi.mock('@google-cloud/firestore', (importOriginal) => importOriginal());

const { Firestore } = await import('@google-cloud/firestore');
const { isSharedFirestore, resolveSharedSettings, resetSharedFirestore, sharedFirestore } =
  await import('../shared-firestore.js');

const PROJECT = 'ferni-test-no-gcp';

afterEach(() => {
  resetSharedFirestore();
  vi.unstubAllEnvs();
});

describe('sharedFirestore', () => {
  it('one client per process for the same settings', () => {
    const a = sharedFirestore({ databaseId: '(default)' });
    expect(a).toBeInstanceOf(Firestore);
    expect(sharedFirestore({ databaseId: '(default)' })).toBe(a);
    expect(isSharedFirestore(a)).toBe(true);
    expect(isSharedFirestore(new Firestore({ databaseId: '(default)' }))).toBe(false);
  });

  it('an unset project and the env project share a client, as ADC resolves them', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', PROJECT);
    vi.stubEnv('GCLOUD_PROJECT', '');
    const unset = sharedFirestore({ databaseId: '(default)' });
    const fromEnv = sharedFirestore({
      databaseId: '(default)',
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    });
    expect(fromEnv).toBe(unset);
    expect(Reflect.get(unset, 'projectId')).toBe(PROJECT);
  });

  it('another project or database gets its own client, bound to it', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', PROJECT);
    const prod = sharedFirestore({ databaseId: '(default)' });
    const dev = sharedFirestore({ databaseId: 'ferni-dev' });
    const other = sharedFirestore({ databaseId: '(default)', projectId: 'another-project' });
    expect(dev).not.toBe(prod);
    expect(other).not.toBe(prod);
    expect(dev.databaseId).toBe('ferni-dev');
    expect(Reflect.get(other, 'projectId')).toBe('another-project');
  });

  it('a strict caller still throws on an undefined field; a lenient one drops it', async () => {
    const strict = sharedFirestore({ databaseId: '(default)', projectId: PROJECT });
    const lenient = sharedFirestore({
      databaseId: '(default)',
      projectId: PROJECT,
      ignoreUndefinedProperties: true,
    });
    expect(lenient).not.toBe(strict);
    expect(() => strict.doc('t/d').set({ a: 1, b: undefined })).toThrow(/undefined/);
    // Accepted, then refused by the test guard at the RPC: no validation error.
    await expect(lenient.doc('t/d').set({ a: 1, b: undefined })).rejects.not.toThrow(/undefined/);
  });

  it('FIRESTORE_SHARED_CLIENT=on: strict callers share the lenient client', () => {
    vi.stubEnv('FIRESTORE_SHARED_CLIENT', 'on');
    const lenient = sharedFirestore({ databaseId: '(default)', ignoreUndefinedProperties: true });
    expect(sharedFirestore({ databaseId: '(default)' })).toBe(lenient);
    expect(resolveSharedSettings({ databaseId: 'x' }).ignoreUndefinedProperties).toBe(true);
  });

  it('off by default: the strict settings stay strict', () => {
    expect(resolveSharedSettings({ databaseId: 'x' }, {}).ignoreUndefinedProperties).toBe(false);
    expect(resolveSharedSettings({ databaseId: 'x' }, { GCLOUD_PROJECT: 'p' }).projectId).toBe('p');
    expect(resolveSharedSettings({ databaseId: undefined }, {}).databaseId).toBe('(default)');
  });
});
