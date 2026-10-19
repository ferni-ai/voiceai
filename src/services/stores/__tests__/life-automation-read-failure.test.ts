/**
 * A failed Firestore read must never be taken for "no routines yet".
 *
 * getLifeAutomationData answered null on a read error, the stores turned that into
 * empty defaults, GET /api/life-automation/workflows answered 200 [], and the next
 * createWorkflow saved [new] over every routine the person had. Now the read failure
 * propagates: the route answers 500 and the write is refused, so the stored routines
 * survive. The same read-change-save shape is in the meal, document and subscription
 * stores, which refuse too.
 *
 * Firestore is an in-memory fake (one users/{uid}/life_automation/{domain} document per
 * path) whose reads can be made to fail; the stores, the adapter and the route are real.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  failReads: false,
}));

vi.mock('../../../utils/firestore-utils.js', () => {
  const docRef = (path: string) => ({
    get: async () => {
      if (fs.failReads) throw new Error('14 UNAVAILABLE: read failed');
      return { exists: fs.docs.has(path), data: () => fs.docs.get(path) };
    },
    set: async (data: Record<string, unknown>) => {
      fs.docs.set(path, { ...fs.docs.get(path), ...data });
    },
  });
  const collection = (path: string): unknown => ({
    doc: (id: string) => ({
      ...docRef(`${path}/${id}`),
      collection: (sub: string) => collection(`${path}/${id}/${sub}`),
    }),
  });
  return {
    getFirestoreDb: () => ({ collection }),
    cleanForFirestore: <T>(data: T) => data,
    recordDegradation: vi.fn(),
  };
});
vi.mock('../../../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u-1', isAdmin: false })),
}));

const { createWorkflow, getWorkflowData } = await import('../workflow-store.js');
const { getMealData } = await import('../meal-store.js');
const { getDocumentData } = await import('../document-store.js');
const { getSubscriptionData } = await import('../subscription-store.js');
const { handleLifeAutomationRoutes } = await import('../../../api/life-automation-routes.js');

const WORKFLOWS_DOC = 'users/u-1/life_automation/workflows';
const existing = [
  { id: 'wf_morning', name: 'Morning routine', userId: 'u-1', status: 'active', runCount: 3 },
  { id: 'wf_evening', name: 'Wind down', userId: 'u-1', status: 'active', runCount: 9 },
];

async function listWorkflows(): Promise<{ status: number; body: string }> {
  let status = 0;
  let body = '';
  const res = {
    writeHead: (code: number) => ((status = code), res),
    setHeader: () => undefined,
    end: (chunk?: string) => {
      body = chunk ?? '';
    },
  };
  const url = new URL('http://x/api/life-automation/workflows');
  const req = { method: 'GET', headers: {} } as IncomingMessage;
  await handleLifeAutomationRoutes(req, res as unknown as ServerResponse, url.pathname, url);
  return { status, body };
}

beforeEach(() => {
  fs.docs.clear();
  fs.docs.set(WORKFLOWS_DOC, { userId: 'u-1', workflows: existing, executions: [] });
  fs.failReads = false;
});

describe('life automation stores when the Firestore read fails', () => {
  it('lists the stored routines while reads work', async () => {
    const res = await listWorkflows();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).workflows.map((w: { id: string }) => w.id)).toEqual([
      'wf_morning',
      'wf_evening',
    ]);
  });

  it('answers 500, not an empty list, when the read fails', async () => {
    fs.failReads = true;
    const res = await listWorkflows();
    expect(res.status).toBe(500);
    expect(res.body).not.toContain('"workflows":[]');
  });

  it('refuses to create a routine over a failed read, so the stored routines survive', async () => {
    fs.failReads = true;
    await expect(
      createWorkflow('u-1', { name: 'New one', trigger: { type: 'manual' }, actions: [] } as never)
    ).rejects.toThrow('read failed');

    fs.failReads = false;
    const ids = (await getWorkflowData('u-1')).workflows.map((w) => w.id);
    expect(ids).toEqual(['wf_morning', 'wf_evening']);
  });

  it('appends to the stored routines once reads work again', async () => {
    await createWorkflow('u-1', {
      name: 'New one',
      trigger: { type: 'manual' },
      actions: [],
    } as never);
    const names = (fs.docs.get(WORKFLOWS_DOC)?.workflows as Array<{ name: string }>).map(
      (w) => w.name
    );
    expect(names).toEqual(['Morning routine', 'Wind down', 'New one']);
  });

  it.each([
    ['meals', getMealData],
    ['documents', getDocumentData],
    ['subscriptions', getSubscriptionData],
  ] as const)('the %s store refuses too, instead of returning empty defaults', async (_, read) => {
    fs.failReads = true;
    await expect(read('u-1')).rejects.toThrow('read failed');
  });
});
