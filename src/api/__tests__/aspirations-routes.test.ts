import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeDb,
  type FakeDb,
} from '../../services/important-dates/__tests__/fake-firestore.js';

let db: FakeDb;
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import { handleAspirationsRoutes, isAspirationsRoute } from '../aspirations-routes.js';
import { resetMigrationCacheForTests } from '../../services/aspirations/legacy-migration.js';
import { setUserPreferencesModuleForTests } from '../../services/important-dates/boundaries-adapter.js';

interface Res {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  opts: { user?: string | null; body?: unknown; raw?: string } = {}
): Promise<Res & { handled: boolean }> {
  const payload = opts.raw ?? (opts.body === undefined ? '' : JSON.stringify(opts.body));
  const headers: Record<string, string> = {};
  if (opts.user !== null) headers['x-firebase-uid'] = opts.user ?? 'user-1';
  const req = Object.assign(Readable.from(payload ? [Buffer.from(payload)] : []), {
    method,
    url: path,
    headers,
  }) as unknown as IncomingMessage;
  const out: Res = { status: 0, body: {} };
  let text = '';
  const state = { headersSent: false };
  const res = {
    get headersSent() {
      return state.headersSent;
    },
    setHeader: () => undefined,
    writeHead(status: number) {
      out.status = status;
      state.headersSent = true;
      return res;
    },
    end(chunk?: string) {
      text = chunk ?? '';
    },
  } as unknown as ServerResponse;
  const handled = await handleAspirationsRoutes(req, res, path);
  out.body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { ...out, handled };
}

const BASE = '/api/memory/me/aspirations';

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  setUserPreferencesModuleForTests(null);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-03T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('aspirations routes', () => {
  it('only claims its own paths and needs a signed-in user', async () => {
    expect(isAspirationsRoute('/api/memory/me')).toBe(false);
    expect(isAspirationsRoute(BASE)).toBe(true);
    expect((await call('GET', '/api/memory/me/dates')).handled).toBe(false);
    expect((await call('GET', BASE, { user: null })).status).toBe(401);
  });

  it('creates, lists, edits, checks in and deletes', async () => {
    const dream = await call('POST', BASE, { body: { level: 'dream', title: 'live by the sea' } });
    expect(dream.status).toBe(201);
    const dreamId = (dream.body.aspiration as { id: string }).id;
    const goal = await call('POST', BASE, {
      body: { level: 'goal', title: 'buy a boat', parentId: dreamId, targetDate: '2026-12-01' },
    });
    const goalId = (goal.body.aspiration as { id: string }).id;
    const habit = await call('POST', BASE, {
      body: {
        level: 'habit',
        title: 'save $20',
        parentId: goalId,
        schedule: { frequency: 'weekdays' },
      },
    });
    expect(habit.status).toBe(201);
    const habitId = (habit.body.aspiration as { id: string }).id;
    expect(habit.body.aspiration).toMatchObject({
      level: 'habit',
      parentId: goalId,
      userEdited: true,
      confirmed: true,
      habit: { frequency: 'weekdays', dueToday: true, streak: 0 },
    });

    const listed = await call('GET', BASE);
    expect((listed.body.aspirations as unknown[]).length).toBe(3);
    expect(listed.body.timeZone).toBe('America/New_York');

    const patched = await call('PATCH', `${BASE}/${goalId}`, {
      body: { progress: 30, milestones: [{ title: 'pick a model' }], why: null },
    });
    expect(patched.body.aspiration).toMatchObject({
      progress: 30,
      milestones: [{ title: 'pick a model', done: false }],
    });

    const checked = await call('POST', `${BASE}/${habitId}/check-ins`, {
      body: { status: 'done', note: 'easy' },
    });
    expect(checked.body.aspiration).toMatchObject({
      habit: {
        streak: 1,
        dueToday: false,
        recentCheckIns: [{ date: '2026-06-03', status: 'done', note: 'easy' }],
      },
    });

    expect((await call('DELETE', `${BASE}/${goalId}`)).body).toEqual({ deleted: true });
    const after = await call('GET', BASE);
    const h = (after.body.aspirations as Array<{ id: string; parentId: string | null }>).find(
      (a) => a.id === habitId
    );
    expect(h?.parentId).toBeNull();
  });

  it('validates input', async () => {
    expect((await call('POST', BASE, { body: { level: 'wish', title: 'x' } })).status).toBe(400);
    expect((await call('POST', BASE, { body: { level: 'goal' } })).status).toBe(400);
    expect(
      (await call('POST', BASE, { body: { level: 'goal', title: 'x', schedule: {} } })).status
    ).toBe(400);
    expect((await call('POST', BASE, { raw: '{nope' })).status).toBe(400);
    const g = await call('POST', BASE, { body: { level: 'goal', title: 'learn to sail' } });
    const id = (g.body.aspiration as { id: string }).id;
    expect((await call('PATCH', `${BASE}/${id}`, { body: { status: 'finished' } })).status).toBe(
      400
    );
    expect((await call('PATCH', `${BASE}/${id}`, { body: { progress: 140 } })).status).toBe(400);
    const notHabit = await call('POST', `${BASE}/${id}/check-ins`, { body: { status: 'done' } });
    expect(notHabit.status).toBe(400);
    expect(
      (await call('POST', `${BASE}/${id}/check-ins`, { body: { status: 'maybe' } })).status
    ).toBe(400);
    const d = await call('POST', BASE, { body: { level: 'dream', title: 'sail the world' } });
    const dreamId = (d.body.aspiration as { id: string }).id;
    // A dream can't sit under a goal.
    expect((await call('PATCH', `${BASE}/${dreamId}`, { body: { parentId: id } })).status).toBe(
      400
    );
    expect((await call('PUT', `${BASE}/${id}`)).status).toBe(405);
    expect((await call('GET', `${BASE}/not-an-id`)).status).toBe(404);
  });

  it("never reaches another user's items", async () => {
    const mine = await call('POST', BASE, { body: { level: 'goal', title: 'learn to sail' } });
    const id = (mine.body.aspiration as { id: string }).id;
    expect(
      (await call('PATCH', `${BASE}/${id}`, { user: 'user-2', body: { title: 'x' } })).status
    ).toBe(404);
    expect((await call('DELETE', `${BASE}/${id}`, { user: 'user-2' })).status).toBe(404);
    const other = await call('GET', BASE, { user: 'user-2' });
    expect(other.body.aspirations).toEqual([]);
  });
});
