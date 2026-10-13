/**
 * POST /api/auth/migrate writes only into the verified caller's own account.
 *
 * It used to take the target uid from the body with no token, so anyone could
 * overwrite any user's profile. The real auth middleware runs here; only token
 * verification, rate limiting and the profile store are faked.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryStore } from '../../memory/storage/in-memory-store.js';
import { createUserProfile } from '../../types/user-profile.js';

// One store for the file: user-migration caches the store it gets first.
// Each test uses its own users so they can't see each other's writes.
const store = { current: new InMemoryStore() };

// "tok-<name>" verifies as uid-<name> padded to a real uid's length.
const uidOf = (name: string) => `uid-${name}`.padEnd(28, '0');
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? {
          uid: `uid-${token.slice(4)}`.padEnd(28, '0'),
          email: `${token.slice(4)}@example.com`,
          claims: {},
        }
      : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store.current }));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));

const { handleMigrationRoutes } = await import('../migration-routes.js');

let seq = 0;
const freshDevice = () => `device_${Date.now()}_t${++seq}`;

async function migrate(
  body: Record<string, unknown>,
  token?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  // A Readable buffers the body until the handler reads it, after auth
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: '/api/auth/migrate',
    method: 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  let text = '';
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    writeHead(s: number) {
      status = s;
      return this;
    },
    setHeader: () => {},
    end(b?: string) {
      text = b ?? '';
    },
  };
  await handleMigrationRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    '/api/auth/migrate'
  );
  return { status: status || res.statusCode, body: text ? JSON.parse(text) : {} };
}

async function seed(id: string, name: string, extra: Record<string, unknown> = {}): Promise<void> {
  await store.current.saveProfile({ ...createUserProfile(id, name), ...extra });
}

describe('POST /api/auth/migrate ownership', () => {
  beforeEach(async () => {
    await seed(uidOf('bob'), 'Bob');
  });

  it('rejects a request with no token and leaves the named account alone', async () => {
    const { status } = await migrate({ deviceId: freshDevice(), firebaseUid: uidOf('bob') });
    expect(status).toBe(401);
    expect((await store.current.getProfile(uidOf('bob')))?.name).toBe('Bob');
  });

  it("refuses mallory's token writing into bob's account", async () => {
    const deviceId = freshDevice();
    await seed(`device:${deviceId}`, 'Mallory');
    const { status } = await migrate({ deviceId, firebaseUid: uidOf('bob') }, 'tok-mallory');
    expect(status).toBe(403);
    expect((await store.current.getProfile(uidOf('bob')))?.name).toBe('Bob');
    expect(await store.current.getProfile(uidOf('mallory'))).toBeNull();
  });

  it("moves the caller's device profile into the caller's own account", async () => {
    const deviceId = freshDevice();
    await seed(`device:${deviceId}`, 'Alice on her phone');
    const { status, body } = await migrate({ deviceId }, 'tok-alice');
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, profileAction: 'created' });
    const alice = await store.current.getProfile(uidOf('alice'));
    expect(alice?.name).toBe('Alice on her phone');
    expect(alice?.linkedIdentifiers).toContain(`device:${deviceId}`);
    expect((await store.current.getProfile(uidOf('bob')))?.name).toBe('Bob');
  });

  it("never resets an owner's existing profile when the device has no data", async () => {
    await seed(uidOf('dana'), 'Dana');
    const { status, body } = await migrate({ deviceId: freshDevice() }, 'tok-dana');
    expect(status).toBe(200);
    expect(body).toMatchObject({ profileAction: 'none' });
    expect((await store.current.getProfile(uidOf('dana')))?.name).toBe('Dana');
  });

  it('refuses a device already migrated to someone else, even after a restart', async () => {
    const deviceId = freshDevice();
    await seed(`device:${deviceId}`, 'Bob on his phone', {
      customData: { migratedTo: uidOf('bob') },
    });
    const { status } = await migrate({ deviceId }, 'tok-erin');
    expect(status).toBe(400);
    expect(await store.current.getProfile(uidOf('erin'))).toBeNull();
  });
});
