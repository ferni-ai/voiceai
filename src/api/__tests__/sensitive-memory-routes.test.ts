/**
 * /api/memory/me/consent, /health, /mood — auth, ownership, validation,
 * consent flow and category deletion (fake Firestore).
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
vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../services/memory-control/index.js', () => ({
  listMemories: async () => ({ ok: true, value: { facts: [], people: [] } }),
  deleteFact: async () => ({ ok: true, value: { deleted: true } }),
}));

const { handleSensitiveMemoryRoutes } = await import('../sensitive-memory-routes.js');
const consent = await import('../../services/memory-consent/index.js');
const health = await import('../../services/health-memory/index.js');
const prefs = await import('../../services/user-preferences/index.js');

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  opts: { uid?: string; body?: unknown } = { uid: 'user-1' }
): Promise<Captured & { handled: boolean }> {
  const raw = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = opts.uid ? { 'x-firebase-uid': opts.uid } : {};
  const captured: Captured = { status: 0, body: {} };
  const res = {
    headersSent: false,
    writeHead: (status: number) => {
      captured.status = status;
      return res;
    },
    setHeader: () => res,
    end: (data?: string) => {
      captured.body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
    },
  } as unknown as ServerResponse;
  const handled = await handleSensitiveMemoryRoutes(req, res, path.split('?')[0]!);
  return { ...captured, handled };
}

const U = { uid: 'user-1' };

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  prefs.clearPreferenceCache();
  health.clearMoodBuffers();
  consent.resetCategoryStores();
});

describe('sensitive memory routes', () => {
  it('ignores other paths and requires an identity', async () => {
    expect((await call('GET', '/api/memory/me')).handled).toBe(false);
    expect((await call('GET', '/api/memory/me/healthy')).handled).toBe(false);
    expect((await call('GET', '/api/memory/me/consent', {})).status).toBe(401);
  });

  it('consent: off by default, the upfront yes, then a per-category switch', async () => {
    const first = await call('GET', '/api/memory/me/consent');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      consent: { answeredAt: null, categories: { health: { enabled: false } } },
      stored: { health: 0, finances: 0, beliefs: 0 },
    });
    expect((first.body.safetyExceptions as unknown[])[0]).toMatchObject({ kind: 'allergies' });

    const yes = await call('PUT', '/api/memory/me/consent', { ...U, body: { agreeAll: true } });
    expect(yes.body).toMatchObject({
      consent: {
        categories: {
          health: { enabled: true },
          finances: { enabled: true },
          beliefs: { enabled: true },
        },
      },
    });
    const off = await call('PUT', '/api/memory/me/consent', {
      ...U,
      body: { categories: { beliefs: false } },
    });
    expect(off.body).toMatchObject({
      consent: { categories: { health: { enabled: true }, beliefs: { enabled: false } } },
    });
    expect((await call('PUT', '/api/memory/me/consent', { ...U, body: {} })).status).toBe(400);
    expect(
      (
        await call('PUT', '/api/memory/me/consent', {
          ...U,
          body: { categories: { politics: true } },
        })
      ).status
    ).toBe(400);
  });

  it("health: lists, edits and deletes only the caller's items; shows the allergy exception", async () => {
    await consent.setCategoryConsent('user-1', 'health', true, 'page');
    const { item } = await health.upsertHealthItem('user-1', {
      kind: 'condition',
      subject: 'asthma',
      text: 'Has asthma',
      confidence: 0.9,
      source: 'explicit',
    });
    await prefs.upsertPreference('user-1', {
      domain: 'food',
      key: 'allergy:peanuts',
      value: 'peanuts',
      source: 'explicit',
      confidence: 1,
    });

    const list = await call('GET', '/api/memory/me/health');
    expect(list.body).toMatchObject({
      enabled: true,
      items: [{ id: item!.id, text: 'Has asthma' }],
    });
    expect(
      (list.body.safety as { allergies: Array<{ item: string }> }).allergies[0]?.item
    ).toContain('peanut');

    // Another user can't see or touch it
    expect((await call('GET', '/api/memory/me/health', { uid: 'user-2' })).body.items).toEqual([]);
    expect(
      (await call('DELETE', `/api/memory/me/health/${item!.id}`, { uid: 'user-2' })).status
    ).toBe(404);

    const edit = await call('PATCH', `/api/memory/me/health/${item!.id}`, {
      ...U,
      body: { text: 'Mild asthma' },
    });
    expect(edit.body.item).toMatchObject({ text: 'Mild asthma', userEdited: true });
    expect(
      (await call('PATCH', `/api/memory/me/health/${item!.id}`, { ...U, body: { text: '' } }))
        .status
    ).toBe(400);

    expect((await call('DELETE', `/api/memory/me/health/${item!.id}`)).body).toEqual({
      deleted: true,
    });
    expect((await call('DELETE', `/api/memory/me/health/${item!.id}`)).status).toBe(404);
  });

  it("mood: lists the timeline with an insight and deletes a conversation's entry", async () => {
    await consent.setCategoryConsent('user-1', 'health', true, 'page');
    health.recordMoodSample('user-1', 'sess-1', { mood: 'happy', intensity: 0.7 });
    await health.flushMoodTimeline('user-1', 'conv-1');
    const list = await call('GET', '/api/memory/me/mood');
    expect(list.body).toMatchObject({ enabled: true, timeline: [{ id: 'sess-1' }] });
    expect((await call('DELETE', '/api/memory/me/mood/conv-1')).body).toEqual({ deleted: true });
    expect((await call('DELETE', '/api/memory/me/mood/conv-1')).status).toBe(404);
  });

  it("deleting a category's data after switching it off", async () => {
    await consent.setCategoryConsent('user-1', 'health', true, 'page');
    await health.upsertHealthItem('user-1', {
      kind: 'condition',
      subject: 'asthma',
      text: 'Has asthma',
      confidence: 0.9,
      source: 'explicit',
    });
    await call('PUT', '/api/memory/me/consent', { ...U, body: { categories: { health: false } } });
    const view = await call('GET', '/api/memory/me/consent');
    expect((view.body.stored as Record<string, number>).health).toBe(1);
    const del = await call('DELETE', '/api/memory/me/consent/health/data');
    expect(del.body).toMatchObject({ deleted: 1 });
    expect((await call('DELETE', '/api/memory/me/consent/politics/data')).status).toBe(404);
    expect((await call('GET', '/api/memory/me/consent/health/data')).status).toBe(405);
  });
});
