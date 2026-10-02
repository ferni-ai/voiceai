/**
 * /api/memory/me/story and /api/memory/me/beliefs — auth, ownership,
 * validation, consent, edits and deletes (fake Firestore).
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
vi.mock('../../services/important-dates/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/important-dates/index.js')>()),
  upsertImportantDate: vi.fn(async () => ({ success: true, data: { id: 'd', status: 'created' } })),
  deleteImportantDate: vi.fn(async () => ({ success: true, data: { deleted: true } })),
}));
vi.mock('../../services/personal-insights/index.js', () => ({
  getPeople: async () => [],
  findPerson: () => null,
}));
vi.mock('../../services/work-and-places/index.js', () => ({ listLifeItems: async () => [] }));

const { handleLifeStoryRoutes, isLifeStoryRoute } = await import('../life-story-routes.js');
const consent = await import('../../services/memory-consent/index.js');

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  opts: { uid?: string; body?: unknown } = {}
): Promise<Captured & { handled: boolean }> {
  const raw = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = opts.uid ? { 'x-firebase-uid': opts.uid } : {};
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
  const handled = await handleLifeStoryRoutes(req, res, path);
  return { ...captured, handled };
}

const A = 'alice';
const B = 'bob';
const STORY = '/api/memory/me/story';
const BELIEFS = '/api/memory/me/beliefs';

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
});

describe('life story routes', () => {
  it('claims only its own paths', () => {
    expect(isLifeStoryRoute(STORY)).toBe(true);
    expect(isLifeStoryRoute(`${BELIEFS}/belief_x`)).toBe(true);
    expect(isLifeStoryRoute('/api/memory/me/stories')).toBe(false);
  });

  it('401 without an identity', async () => {
    expect((await call('GET', STORY)).status).toBe(401);
  });

  it('adds, corrects and forgets a story; values too', async () => {
    const created = await call('POST', STORY, {
      uid: A,
      body: { kind: 'story', title: 'Building a treehouse with my brother', period: 'age 9' },
    });
    expect(created.status).toBe(201);
    const item = created.body.item as { id: string; title: string; source: string };
    expect(item).toMatchObject({ title: 'Building a treehouse with my brother', source: 'user' });

    const value = await call('POST', STORY, { uid: A, body: { kind: 'value', title: 'Honesty' } });
    expect(value.status).toBe(201);
    expect(value.body.item).toMatchObject({ label: 'honesty', category: 'authenticity' });

    const list = await call('GET', STORY, { uid: A });
    expect((list.body.items as unknown[]).length).toBe(1);
    expect((list.body.values as unknown[]).length).toBe(1);

    const edited = await call('PATCH', `${STORY}/${item.id}`, {
      uid: A,
      body: { title: 'The treehouse', date: '1998' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.item).toMatchObject({
      title: 'The treehouse',
      date: '1998',
      userEdited: true,
    });

    const valueId = (value.body.item as { id: string }).id;
    const editedValue = await call('PATCH', `${STORY}/${valueId}`, {
      uid: A,
      body: { title: 'being honest' },
    });
    expect(editedValue.body.item).toMatchObject({ label: 'being honest', userEdited: true });

    expect((await call('DELETE', `${STORY}/${item.id}`, { uid: A })).body).toEqual({
      deleted: true,
    });
    expect((await call('DELETE', `${STORY}/${valueId}`, { uid: A })).body).toEqual({
      deleted: true,
    });
    const after = await call('GET', STORY, { uid: A });
    expect(after.body.items).toEqual([]);
    expect(after.body.values).toEqual([]);
  });

  it("another user's ids are 404", async () => {
    const created = await call('POST', STORY, {
      uid: A,
      body: { kind: 'origin', title: 'Grew up in Ohio' },
    });
    const id = (created.body.item as { id: string }).id;
    expect(
      (await call('PATCH', `${STORY}/${id}`, { uid: B, body: { title: 'Nope' } })).status
    ).toBe(404);
    expect((await call('DELETE', `${STORY}/${id}`, { uid: B })).status).toBe(404);
    expect((await call('DELETE', `${BELIEFS}/${id}`, { uid: A })).status).toBe(404); // wrong area
  });

  it('400 on invalid bodies', async () => {
    expect(
      (await call('POST', STORY, { uid: A, body: { kind: 'nope', title: 'x y' } })).status
    ).toBe(400);
    expect(
      (
        await call('POST', STORY, {
          uid: A,
          body: { kind: 'story', title: 'ok story', date: '1998-13' },
        })
      ).status
    ).toBe(400);
    expect((await call('PATCH', `${STORY}/story_abcdef123456`, { uid: A, body: {} })).status).toBe(
      400
    );
  });

  it('beliefs: 409 while the switch is off; works once it is on', async () => {
    const off = await call('GET', BELIEFS, { uid: A });
    expect(off.body).toMatchObject({ enabled: false, items: [] });
    expect(
      (await call('POST', BELIEFS, { uid: A, body: { kind: 'faith', title: 'Quaker' } })).status
    ).toBe(409);

    await consent.setCategoryConsent(A, 'beliefs', true, 'page');
    const created = await call('POST', BELIEFS, {
      uid: A,
      body: { kind: 'faith', title: 'Quaker' },
    });
    expect(created.status).toBe(201);
    const id = (created.body.item as { id: string }).id;
    expect(id.startsWith('belief_')).toBe(true);
    const edited = await call('PATCH', `${BELIEFS}/${id}`, {
      uid: A,
      body: { detail: 'Goes to Meeting on Sundays' },
    });
    expect(edited.body.item).toMatchObject({
      detail: 'Goes to Meeting on Sundays',
      userEdited: true,
    });
    expect((await call('GET', BELIEFS, { uid: A })).body).toMatchObject({ enabled: true });
    expect((await call('DELETE', `${BELIEFS}/${id}`, { uid: A })).body).toEqual({ deleted: true });
  });
});
