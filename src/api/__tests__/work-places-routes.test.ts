/**
 * /api/memory/me/work and /api/memory/me/places — auth, ownership,
 * validation, edits and deletes (fake Firestore).
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
vi.mock('../../services/important-dates/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/important-dates/index.js')>()),
  upsertImportantDate: vi.fn(async () => ({ success: true, data: { id: 'd', status: 'created' } })),
  deleteImportantDate: vi.fn(async () => ({ success: true, data: { deleted: true } })),
}));
vi.mock('../../services/personal-insights/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/personal-insights/index.js')>()),
  getPeople: vi.fn(async () => [
    {
      id: 'person_dana',
      kind: 'person',
      name: 'Dana',
      aliases: ['Dana'],
      relationship: 'manager',
      group: 'work',
    },
    { id: 'person_sam', kind: 'person', name: 'Sam', aliases: ['Sam'], group: 'friend' },
  ]),
}));

const { handleWorkPlacesRoutes, isWorkPlacesRoute } = await import('../work-places-routes.js');
const { upsertLifeItem } = await import('../../services/work-and-places/index.js');

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
  const handled = await handleWorkPlacesRoutes(req, res, path);
  return { ...captured, handled };
}

const A = 'alice';
const B = 'bob';

beforeEach(() => {
  fake = createFakeFirestore();
});

describe('work & places routes', () => {
  it('claims only its own paths', async () => {
    expect(isWorkPlacesRoute('/api/memory/me/work')).toBe(true);
    expect(isWorkPlacesRoute('/api/memory/me/places/place_x')).toBe(true);
    expect(isWorkPlacesRoute('/api/memory/me/workouts')).toBe(false);
    expect((await call('GET', '/api/memory/me')).handled).toBe(false);
  });

  it('requires an identity', async () => {
    expect((await call('GET', '/api/memory/me/work')).status).toBe(401);
  });

  it('lists work with colleagues from the people model, and places with linked companions', async () => {
    await upsertLifeItem(A, {
      area: 'work',
      kind: 'job',
      subject: 'Acme',
      employer: 'Acme',
      status: 'current',
      source: 'stated',
      confidence: 0.9,
    });
    await upsertLifeItem(A, {
      area: 'places',
      kind: 'trip',
      subject: 'Lisbon',
      place: 'Lisbon',
      status: 'planned',
      startDate: '2099-05-01',
      withPeople: ['Sam', 'my sister'],
      source: 'stated',
      confidence: 0.9,
    });
    const work = await call('GET', '/api/memory/me/work', { uid: A });
    expect(work.status).toBe(200);
    expect(work.body.items).toEqual([
      expect.objectContaining({ employer: 'Acme', status: 'current' }),
    ]);
    expect(work.body.colleagues).toEqual([
      { id: 'person_dana', name: 'Dana', relationship: 'manager' },
    ]);
    const places = await call('GET', '/api/memory/me/places', { uid: A });
    expect((places.body.items as Array<{ withPeople: unknown }>)[0].withPeople).toEqual([
      { name: 'Sam', personId: 'person_sam' },
      { name: 'my sister' },
    ]);
    // Bob sees none of it.
    expect((await call('GET', '/api/memory/me/places', { uid: B })).body.items).toEqual([]);
  });

  it('creates, edits and deletes; other users get 404', async () => {
    const created = await call('POST', '/api/memory/me/places', {
      uid: A,
      body: { kind: 'favorite', title: 'Blue Bottle', category: 'cafe' },
    });
    expect(created.status).toBe(201);
    const item = created.body.item as { id: string; userEdited: boolean; place: string };
    expect(item).toMatchObject({ userEdited: true, place: 'Blue Bottle' });

    expect(
      (await call('PATCH', `/api/memory/me/places/${item.id}`, { uid: B, body: { title: 'x' } }))
        .status
    ).toBe(404);
    expect((await call('DELETE', `/api/memory/me/places/${item.id}`, { uid: B })).status).toBe(404);

    const edited = await call('PATCH', `/api/memory/me/places/${item.id}`, {
      uid: A,
      body: { title: 'Blue Bottle (Hayes Valley)', notes: 'Their Saturday spot' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.item).toMatchObject({
      title: 'Blue Bottle (Hayes Valley)',
      notes: 'Their Saturday spot',
    });

    const cleared = await call('PATCH', `/api/memory/me/places/${item.id}`, {
      uid: A,
      body: { notes: null },
    });
    expect((cleared.body.item as { notes?: string }).notes).toBeUndefined();

    expect((await call('DELETE', `/api/memory/me/places/${item.id}`, { uid: A })).body).toEqual({
      deleted: true,
    });
    expect((await call('DELETE', `/api/memory/me/places/${item.id}`, { uid: A })).status).toBe(404);
  });

  it('validates bodies and ids', async () => {
    const bad = async (body: unknown) =>
      (await call('POST', '/api/memory/me/work', { uid: A, body })).status;
    expect(await bad({ kind: 'trip', title: 'Lisbon' })).toBe(400); // a place kind on the work route
    expect(await bad({ kind: 'job' })).toBe(400);
    expect(await bad({ kind: 'job', employer: 'Acme', startDate: 'last spring' })).toBe(400);
    expect(await bad({ kind: 'job', employer: 'Acme', status: 'planned' })).toBe(400);
    expect(
      await bad({
        kind: 'job',
        employer: 'Acme',
        role: 'Designer',
        status: 'past',
        startDate: '2019-04',
      })
    ).toBe(201);

    const job = (await call('GET', '/api/memory/me/work', { uid: A })).body.items as Array<{
      id: string;
    }>;
    const patch = (body: unknown) =>
      call('PATCH', `/api/memory/me/work/${job[0].id}`, { uid: A, body });
    expect((await patch({ status: 'planned' })).status).toBe(400);
    expect((await patch({ startDate: 'soon' })).status).toBe(400);
    expect((await patch({ title: 42 })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect(
      (
        await call('PATCH', '/api/memory/me/work/place_0123456789abcdef01234567', {
          uid: A,
          body: { title: 'x' },
        })
      ).status
    ).toBe(404);
    expect((await call('DELETE', '/api/memory/me/work/../../facts', { uid: A })).status).toBe(404);
    expect((await call('PUT', '/api/memory/me/work', { uid: A })).status).toBe(405);
  });
});
