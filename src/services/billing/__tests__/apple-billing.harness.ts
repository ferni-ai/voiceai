/**
 * Shared harness for the App Store entitlement tests: in-memory stand-ins for
 * the only things mocked (Firestore, the profile store, the Firebase token
 * check) and a real HTTP server running the real Apple routes.
 *
 * Each test file wires the stand-ins in with vi.mock factories that import
 * this module, so the test and the mocked modules share the same state:
 *   vi.mock('../../../memory/store-factory.js', async () =>
 *     (await import('./apple-billing.harness.js')).fakeStoreModule());
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CompactSign, generateKeyPair } from 'jose';
import { vi } from 'vitest';

export interface FakeProfile {
  id: string;
  subscription?: Record<string, unknown>;
}

/** Profiles by uid, owner records by originalTransactionId, and write counts. */
export const profiles = new Map<string, FakeProfile>();
export const owners = new Map<string, Record<string, unknown>>();
export const state = { saves: 0, firestoreUp: true };

export function resetHarness(): void {
  profiles.clear();
  owners.clear();
  state.saves = 0;
  state.firestoreUp = true;
}

export function fakeStoreModule() {
  return {
    getStore: async () => ({
      getProfile: async (id: string) => profiles.get(id) ?? null,
      getOrCreateProfile: async (id: string) => {
        if (!profiles.has(id)) profiles.set(id, { id });
        return profiles.get(id);
      },
      saveProfile: async (p: FakeProfile) => {
        state.saves += 1;
        profiles.set(p.id, structuredClone(p));
      },
      listProfiles: async () => [...profiles.values()],
    }),
  };
}

/** Firestore's create()/get()/set()/where() on the ownership collection. */
export function fakeFirestoreModule() {
  const doc = (id: string) => ({
    create: async (data: Record<string, unknown>) => {
      if (owners.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      owners.set(id, data);
    },
    set: async (data: Record<string, unknown>) => void owners.set(id, data),
    get: async () => ({ data: () => owners.get(id) }),
  });
  const collection = () => ({
    doc,
    where: (field: string, _op: '==', value: unknown) => ({
      get: async () => ({
        docs: [...owners]
          .filter(([, data]) => data[field] === value)
          .map(([id]) => ({ id, ref: doc(id) })),
      }),
    }),
  });
  return { getFirestoreDb: () => (state.firestoreUp ? { collection } : null) };
}

/** Bearer tok-<uid> is a verified Firebase token for <uid>. */
export function fakeFirebaseAuthModule() {
  return {
    verifyFirebaseToken: async (token: string) =>
      token.startsWith('tok-') ? { uid: token.slice(4), claims: {}, isAnonymous: false } : null,
  };
}

export interface AppleServer {
  verify: (
    uid: string,
    receiptData: string,
    extra?: object
  ) => Promise<{ status: number; body: Record<string, unknown> }>;
  webhook: (signedPayload: string) => Promise<number>;
  close: () => Promise<void>;
}

/** Configure Apple for Sandbox with the test chain, then serve the real Apple routes. */
export async function startAppleServer(): Promise<AppleServer> {
  vi.stubEnv('APPLE_ISSUER_ID', 'issuer');
  vi.stubEnv('APPLE_KEY_ID', 'key');
  vi.stubEnv('APPLE_PRIVATE_KEY', 'unused-for-signed-transactions');
  vi.stubEnv('APPLE_ENVIRONMENT', 'Sandbox');
  vi.stubEnv('APPLE_BUNDLE_ID', 'com.ferni.app');
  vi.stubEnv('APPLE_ONLINE_CHECKS', 'false'); // no OCSP for a test chain
  const { handleAppleRoutes } = await import('../../../api/apple-iap-routes.js');
  const server: Server = createServer((req, res) => void handleAppleRoutes(req, res));
  await new Promise<void>((r) => {
    server.listen(0, r);
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    async verify(uid, receiptData, extra = {}) {
      const res = await fetch(`${base}/api/apple/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer tok-${uid}` },
        body: JSON.stringify({ receiptData, ...extra }),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    async webhook(signedPayload) {
      const res = await fetch(`${base}/api/apple/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedPayload }),
      });
      return res.status;
    },
    close: async () =>
      new Promise<void>((r) => {
        server.close(() => r());
      }),
  };
}

/** The same header (our test chain) and payload, re-signed by an attacker's key. */
export async function forge(jws: string): Promise<string> {
  const [header, payload] = jws.split('.');
  const { privateKey } = await generateKeyPair('ES256');
  return new CompactSign(Buffer.from(payload, 'base64url'))
    .setProtectedHeader(JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg: string })
    .sign(privateKey);
}

export const sub = (uid: string): Record<string, unknown> => profiles.get(uid)?.subscription ?? {};
export const time = (v: unknown): number => new Date(v as string).getTime();
