/**
 * POST /api/garden/admin/seed writes made-up founders, stories and milestones.
 * An admin key alone used to be enough, in any environment, against whatever
 * Firestore project the process reached. It now refuses unless the process is
 * non-production and pointed at the Firestore emulator.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  const snapshot = { exists: true, empty: false };
  const query = { get: vi.fn(async () => snapshot), limit: () => query };
  const collection = vi.fn(() => ({ doc: () => query, limit: () => query }));
  return { collection };
});
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => ({ collection: firestore.collection }),
}));

const { handleGardenRoutes } = await import('../api/garden-routes.js');

async function seed(adminKey: string): Promise<number> {
  const req = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: '/api/garden/admin/seed',
    headers: { 'x-admin-key': adminKey },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 200;
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  const path = '/api/garden/admin/seed';
  expect(await handleGardenRoutes(req, res, path, new URL(path, 'http://x'))).toBe(true);
  return status;
}

beforeEach(() => {
  vi.stubEnv('ADMIN_KEY', 'admin-secret');
  vi.stubEnv('K_SERVICE', '');
  firestore.collection.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/garden/admin/seed', () => {
  it('refuses in production even with the admin key, and writes nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'localhost:8080');

    expect(await seed('admin-secret')).toBe(403);
    expect(firestore.collection).not.toHaveBeenCalled();
  });

  it('refuses on Cloud Run', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('K_SERVICE', 'john-bogle-ui');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'localhost:8080');

    expect(await seed('admin-secret')).toBe(403);
    expect(firestore.collection).not.toHaveBeenCalled();
  });

  it('refuses outside the emulator, where it would reach the real project', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');

    expect(await seed('admin-secret')).toBe(403);
    expect(firestore.collection).not.toHaveBeenCalled();
  });

  it('still requires the admin key', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'localhost:8080');

    expect(await seed('wrong')).toBe(401);
    expect(firestore.collection).not.toHaveBeenCalled();
  });

  it('seeds the emulator for an admin in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'localhost:8080');

    expect(await seed('admin-secret')).toBe(200);
    expect(firestore.collection).toHaveBeenCalledWith('founder_stats');
  });
});
