/**
 * A contact group stays with its owner and its own document, whatever a request sends.
 *
 * PUT /api/contacts/groups/:id used to spread the request body over the stored group, so
 * server-owned fields (`id`, `userId`, `createdAt`) could be overwritten, and deleteGroup
 * used the id it was given as a document path without checking it belonged to the user.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

type Doc = Record<string, unknown>;

const store = vi.hoisted(() => ({
  docs: [] as Doc[],
  writes: [] as Array<{ id: string; data: Doc }>,
  deletes: [] as string[],
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return {
        doc: (id: string) => ({
          set: async (data: Doc) => {
            store.writes.push({ id, data });
          },
          delete: async () => {
            store.deletes.push(id);
            store.docs = store.docs.filter((d) => d.id !== id);
          },
        }),
        where: (field: string, _op: string, value: unknown) => ({
          get: async () => ({
            docs: store.docs
              .filter((d) => d[field] === value)
              .map((d) => ({ data: () => ({ ...d }) })),
          }),
        }),
      };
    }
  },
}));

vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u1', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

import { handleContactsRoutes } from '../api/contacts-routes.js';
import {
  clearCache,
  deleteGroup,
  getGroups,
  updateGroup,
} from '../services/contacts/contact-groups.js';

const CREATED = '2026-01-01T00:00:00.000Z';

async function put(groupId: string, body: unknown): Promise<number> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'PUT';
  req.headers = { 'x-firebase-uid': 'u1' };
  let status = 200;
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code;
    }),
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  const path = `/api/contacts/groups/${groupId}`;
  await handleContactsRoutes(req, res, path, new URL(`http://localhost${path}`));
  return status;
}

beforeEach(() => {
  clearCache();
  store.writes.length = 0;
  store.deletes.length = 0;
  store.docs = [
    {
      id: 'g1',
      userId: 'u1',
      name: 'Family',
      members: ['c1'],
      occasionPreferences: { birthdays: true },
      createdAt: CREATED,
      updatedAt: CREATED,
    },
    {
      id: 'other-group',
      userId: 'other',
      name: 'Theirs',
      members: [],
      occasionPreferences: {},
      createdAt: CREATED,
      updatedAt: CREATED,
    },
  ];
});

describe('PUT /api/contacts/groups/:id', () => {
  it("can't change the group's owner or id, and saves to the group's own document", async () => {
    expect(await put('g1', { userId: 'other', id: 'other-group', name: 'x' })).toBe(200);

    expect(store.writes.map((w) => w.id)).toEqual(['g1']);
    expect(store.writes[0].data).toMatchObject({
      id: 'g1',
      userId: 'u1',
      name: 'x',
      members: ['c1'],
      createdAt: CREATED,
    });
    const [mine] = await getGroups('u1');
    expect(mine).toMatchObject({ id: 'g1', userId: 'u1', name: 'x' });
  });

  it('a blank name is refused, and nothing is saved', async () => {
    expect(await put('g1', { name: '  ' })).toBe(400);
    expect(store.writes).toEqual([]);
  });
});

describe('contact-groups service', () => {
  it('updateGroup keeps id, owner and createdAt even if a caller passes them', async () => {
    const updated = await updateGroup('u1', 'g1', {
      name: 'y',
      userId: 'other',
      id: 'other-group',
      createdAt: new Date(0),
    } as unknown as Parameters<typeof updateGroup>[2]);

    expect(updated).toMatchObject({ id: 'g1', userId: 'u1', name: 'y' });
    expect(store.writes.map((w) => w.id)).toEqual(['g1']);
    expect(store.writes[0].data).toMatchObject({ id: 'g1', userId: 'u1', createdAt: CREATED });
  });

  it("deleteGroup never deletes a group the user doesn't own", async () => {
    await deleteGroup('u1', 'other-group');
    expect(store.deletes).toEqual([]);
  });

  it("deleteGroup deletes the user's own group", async () => {
    await deleteGroup('u1', 'g1');
    expect(store.deletes).toEqual(['g1']);
    expect(await getGroups('u1')).toEqual([]);
  });
});
