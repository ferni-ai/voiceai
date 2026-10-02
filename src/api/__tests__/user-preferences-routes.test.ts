/**
 * /api/memory/me/preferences — auth, ownership, validation (fake Firestore).
 */

import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../services/user-preferences/__tests__/fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));
vi.mock('../../memory/index.js', () => ({
  getDefaultStore: () => ({ getProfile: async () => null, saveProfile: async () => undefined }),
}));

const { handleUserPreferenceRoutes } = await import('../user-preferences-routes.js');
const { clearPreferenceCache } = await import('../../services/user-preferences/index.js');

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  opts: { uid?: string; deviceId?: string; body?: unknown } = {}
): Promise<Captured & { handled: boolean }> {
  const raw =
    opts.body === undefined
      ? ''
      : typeof opts.body === 'string'
        ? opts.body
        : JSON.stringify(opts.body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = {
    ...(opts.uid ? { 'x-firebase-uid': opts.uid } : {}),
    ...(opts.deviceId ? { 'x-user-id': opts.deviceId } : {}),
  };
  const captured: Captured = { status: 0, body: {} };
  const res = {
    writeHead: (status: number) => {
      captured.status = status;
      return res;
    },
    setHeader: () => res,
    end: (data?: string) => {
      captured.body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
    },
  } as unknown as ServerResponse;
  const handled = await handleUserPreferenceRoutes(req, res, path.split('?')[0]);
  return { ...captured, handled };
}

beforeEach(() => {
  fake = createFakeFirestore();
  clearPreferenceCache();
});

describe('preference routes', () => {
  it('ignores other paths', async () => {
    expect((await call('GET', '/api/memory/me')).handled).toBe(false);
    expect((await call('GET', '/api/memory/me/preferencesX')).handled).toBe(false);
  });

  it('requires an identity (verified uid or anonymous device id); a spoofed x-user-id is not enough', async () => {
    expect((await call('GET', '/api/memory/me/preferences')).status).toBe(401);
    expect(
      (await call('GET', '/api/memory/me/preferences', { deviceId: 'real-account-uid' })).status
    ).toBe(401);
    expect(
      (await call('GET', '/api/memory/me/preferences', { deviceId: 'device:abc123' })).status
    ).toBe(200);
  });

  it('create, list, edit, delete — all scoped to the caller', async () => {
    const created = await call('POST', '/api/memory/me/preferences', {
      uid: 'alice',
      body: { domain: 'conversation', key: 'responseLength', value: 'short' },
    });
    expect(created.status).toBe(201);
    const pref = created.body.preference as { id: string; userEdited: boolean; active: boolean };
    expect(pref).toMatchObject({ userEdited: true, active: true });

    const list = await call('GET', '/api/memory/me/preferences', { uid: 'alice' });
    expect((list.body.preferences as unknown[]).length).toBe(1);
    expect(list.body.updatedAt).toBeTruthy();

    // Bob cannot see, edit or delete Alice's preference
    expect(
      (
        (await call('GET', '/api/memory/me/preferences', { uid: 'bob' })).body
          .preferences as unknown[]
      ).length
    ).toBe(0);
    expect(
      (
        await call('PATCH', `/api/memory/me/preferences/${pref.id}`, {
          uid: 'bob',
          body: { value: 'long' },
        })
      ).status
    ).toBe(404);
    expect(
      (await call('DELETE', `/api/memory/me/preferences/${pref.id}`, { uid: 'bob' })).status
    ).toBe(404);

    const patched = await call('PATCH', `/api/memory/me/preferences/${pref.id}`, {
      uid: 'alice',
      body: { value: 'long' },
    });
    expect(patched.status).toBe(200);
    expect((patched.body.preference as { value: string }).value).toBe('long');

    const deleted = await call('DELETE', `/api/memory/me/preferences/${pref.id}`, { uid: 'alice' });
    expect(deleted.body).toEqual({ deleted: true });
    expect(fake.store.has(`bogle_users/alice/memory_tombstones/${pref.id}`)).toBe(true);
  });

  it('interests and media go through the same routes, filterable by domain', async () => {
    const interest = await call('POST', '/api/memory/me/preferences', {
      uid: 'alice',
      body: {
        domain: 'interests',
        key: 'interest:pottery',
        value: 'pottery',
        details: { level: 'serious', specifics: ['Tuesday class'] },
      },
    });
    expect(interest.status).toBe(201);
    await call('POST', '/api/memory/me/preferences', {
      uid: 'alice',
      body: {
        domain: 'media',
        key: 'show:Severance',
        value: 'Severance',
        details: { status: 'watching', progress: 'season 2' },
      },
    });
    const only = await call('GET', '/api/memory/me/preferences?domain=interests', { uid: 'alice' });
    expect((only.body.preferences as { key: string }[]).map((p) => p.key)).toEqual([
      'interest:pottery',
    ]);
    const id = (interest.body.preference as { id: string }).id;
    const patched = await call('PATCH', `/api/memory/me/preferences/${id}`, {
      uid: 'alice',
      body: { details: { level: 'casual' } },
    });
    expect(
      (patched.body.preference as { details: { level: string; specifics: string[] } }).details
    ).toMatchObject({ level: 'casual', specifics: ['Tuesday class'] });
  });

  it('validates bodies and ids', async () => {
    const bad = async (body: unknown) =>
      (await call('POST', '/api/memory/me/preferences', { uid: 'alice', body })).status;
    expect(await bad({ domain: 'conversation', key: 'responseLength', value: 'enormous' })).toBe(
      400
    );
    expect(await bad({ domain: 'secrets', key: 'x', value: 'y' })).toBe(400);
    expect(
      await bad({ domain: 'likes', key: 'food:tacos', value: 'tacos', sentiment: 'meh' })
    ).toBe(400);
    expect(
      await bad({
        domain: 'interests',
        key: 'interest:x',
        value: 'x',
        details: { level: 'god-tier' },
      })
    ).toBe(400);
    expect(await bad('not json')).toBe(400);
    expect(await bad([1, 2])).toBe(400);
    expect(
      (
        await call('PATCH', '/api/memory/me/preferences/../../etc', {
          uid: 'alice',
          body: { value: 'x' },
        })
      ).status
    ).toBe(404);
    expect(
      (
        await call('PATCH', '/api/memory/me/preferences/pref_000000000000000000000000', {
          uid: 'alice',
          body: {},
        })
      ).status
    ).toBe(400);
    expect((await call('PUT', '/api/memory/me/preferences', { uid: 'alice' })).status).toBe(405);
  });
});
