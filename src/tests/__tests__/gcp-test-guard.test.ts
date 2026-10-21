/**
 * The guard in src/tests/setup.ts that keeps tests off real Google Cloud.
 *
 * The real clients come from Node's require, not import, so the setup file's
 * vi.mock of @google-cloud/firestore doesn't replace them: that is the path
 * firebase-admin takes, and the one these tests must prove is closed.
 */

import { createRequire } from 'node:module';
import { deleteApp, getApps } from 'firebase-admin/app';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import {
  NO_GCP_CREDENTIALS_PATH,
  RealGcpInTestError,
  TEST_GCP_PROJECT,
  guardRealFirestore,
  isolateGcpCredentials,
  type FirestoreClass,
} from '../gcp-test-guard.js';

const requireHere = createRequire(import.meta.url);
const requireFromAdmin = createRequire(requireHere.resolve('firebase-admin'));

type Doc = { get(): Promise<unknown> };
type Db = { collection(name: string): { doc(id: string): Doc }; terminate(): Promise<void> };

// The real firebase-admin, as production code gets it through getAdminFirestore().
vi.unmock('firebase-admin/app');
vi.unmock('firebase-admin/firestore');

describe('a real Firestore client in a test', () => {
  afterAll(async () => {
    await Promise.all(getApps().map((app) => deleteApp(app)));
  });

  it('refuses a read before it reaches the network', async () => {
    const { Firestore } = requireHere('@google-cloud/firestore') as {
      Firestore: new (settings: object) => Db;
    };
    const db = new Firestore({ projectId: 'ferni-guard-test-no-such-project' });

    await expect(db.collection('user_contacts').doc('x').get()).rejects.toBeInstanceOf(
      RealGcpInTestError
    );
    await db.terminate();
  });

  it('refuses a write to the production project through the copy firebase-admin loads', async () => {
    // What the marketplace store built in 2025-12: firebase-admin's Firestore, a real project id.
    const { Firestore } = requireFromAdmin('@google-cloud/firestore') as {
      Firestore: new (settings: object) => Db & {
        collection(name: string): { add(data: object): Promise<unknown> };
      };
    };
    const db = new Firestore({ projectId: 'johnb-2025' });

    await expect(
      db.collection('marketplace_installations').add({ userId: 'user123' })
    ).rejects.toBeInstanceOf(RealGcpInTestError);
    await db.terminate();
  });

  it('refuses a write made through firebase-admin, which vi.mock cannot see', async () => {
    const db = getAdminFirestore();

    await expect(
      db.collection('user_contacts').doc('guard-test').set({ userId: 'test-user-123' })
    ).rejects.toBeInstanceOf(RealGcpInTestError);
  });
});

describe('guardRealFirestore', () => {
  function fakeClient(): { Firestore: FirestoreClass; calls: string[] } {
    const calls: string[] = [];
    class Fake {
      initializeIfNeeded(): Promise<string> {
        calls.push('initializeIfNeeded');
        return Promise.resolve('sent');
      }
    }
    return { Firestore: Fake as unknown as FirestoreClass, calls };
  }

  it('lets requests through to the emulator', async () => {
    const { Firestore, calls } = fakeClient();
    guardRealFirestore({ FIRESTORE_EMULATOR_HOST: 'localhost:8080' }, [Firestore]);

    const client = new (Firestore as unknown as new () => { initializeIfNeeded(): unknown })();
    await expect(client.initializeIfNeeded()).resolves.toBe('sent');
    expect(calls).toEqual(['initializeIfNeeded']);
  });

  it('refuses without the emulator and never calls the real method', async () => {
    const { Firestore, calls } = fakeClient();
    guardRealFirestore({}, [Firestore]);

    const client = new (Firestore as unknown as new () => { initializeIfNeeded(): unknown })();
    await expect(client.initializeIfNeeded()).rejects.toBeInstanceOf(RealGcpInTestError);
    expect(calls).toEqual([]);
  });
});

describe('isolateGcpCredentials', () => {
  it('leaves no credentials for any Google client in the test process', async () => {
    const { GoogleAuth } = requireFromAdmin('google-auth-library') as {
      GoogleAuth: new () => { getClient(): Promise<unknown> };
    };

    // On a signed-in Mac this would otherwise resolve to the gcloud login.
    await expect(new GoogleAuth().getClient()).rejects.toThrow(NO_GCP_CREDENTIALS_PATH);
  });

  it('replaces credentials and every set project id with fakes', () => {
    const env: Record<string, string | undefined> = {
      GOOGLE_APPLICATION_CREDENTIALS: '/Users/dev/key.json',
      GOOGLE_CLOUD_PROJECT: 'johnb-2025',
      FIREBASE_CONFIG: '{"projectId":"johnb-2025"}',
    };
    isolateGcpCredentials(env);

    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe(NO_GCP_CREDENTIALS_PATH);
    expect(env.GOOGLE_CLOUD_PROJECT).toBe(TEST_GCP_PROJECT);
    expect(env.GCLOUD_PROJECT).toBeUndefined();
    expect(env.METADATA_SERVER_DETECTION).toBe('none');
    expect(env.FIREBASE_CONFIG).toBeUndefined();
  });

  it('changes nothing when the external suite opts in with ALLOW_PRODUCTION_DATA=1', () => {
    const env = {
      ALLOW_PRODUCTION_DATA: '1',
      EXTERNAL_TEST_SUITE: '1',
      GOOGLE_CLOUD_PROJECT: 'johnb-2025',
    };
    isolateGcpCredentials(env);

    expect(env.GOOGLE_CLOUD_PROJECT).toBe('johnb-2025');
    expect(env).not.toHaveProperty('GOOGLE_APPLICATION_CREDENTIALS');
  });

  it('ignores ALLOW_PRODUCTION_DATA=1 left in the shell outside the external suite', async () => {
    const env: Record<string, string | undefined> = {
      ALLOW_PRODUCTION_DATA: '1',
      GOOGLE_CLOUD_PROJECT: 'johnb-2025',
    };
    isolateGcpCredentials(env);
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe(NO_GCP_CREDENTIALS_PATH);
    expect(env.GOOGLE_CLOUD_PROJECT).toBe(TEST_GCP_PROJECT);

    class Fake {
      initializeIfNeeded(): Promise<string> {
        return Promise.resolve('sent');
      }
    }
    guardRealFirestore(env, [Fake as unknown as FirestoreClass]);
    await expect(new Fake().initializeIfNeeded()).rejects.toBeInstanceOf(RealGcpInTestError);
  });
});
