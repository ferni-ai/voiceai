/**
 * Menu item 5, What's Ahead: an event the voice agent books shows in the calendar panel.
 * Write with createEvent from services/calendar/index.ts (what smart-calendar-tools.ts
 * calls), then GET /api/calendar/today and /api/calendar/week through the real route
 * handler, the paths calendar-view.ui.ts sends, on the Firestore emulator.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;

// src/tests/setup.ts fakes firebase-admin for every test; this file reads the emulator
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
process.env.GCLOUD_PROJECT ??= 'demo-menu-calendar';

let server: Server;
let base: string;
const id = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { getAdminApp } = await import('../../utils/firebase-admin-app.js');
  getAdminApp();
  const { handleCalendarRoutes } = await import('../calendar-routes/index.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleCalendarRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

async function get(uid: string, path: string) {
  const res = await fetch(`${base}${path}`, { headers: { 'x-firebase-uid': uid } });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

interface Overview {
  events?: Array<{ id: string; title: string; location: string | null }>;
}

describe.skipIf(!emulator)('calendar: voice writer -> panel route (Firestore emulator)', () => {
  it('an event booked in a call comes back from /api/calendar/today and /week', async () => {
    const uid = id();
    const { createEvent, clearUserCache } = await import('../../services/calendar/index.js');
    const start = new Date();
    start.setHours(Math.min(start.getHours() + 1, 22), 0, 0, 0);
    const created = await createEvent(uid, {
      title: 'Coffee with Dana',
      startTime: start,
      durationMinutes: 45,
      location: 'Blue Bottle',
    });
    // Drop the process cache so the read has to come from Firestore, as on another instance
    clearUserCache(uid);

    const today = await get(uid, '/api/calendar/today');
    expect(today.status).toBe(200);
    const todayEvents = (today.body.overview as Overview).events ?? [];
    expect(todayEvents).toContainEqual(
      expect.objectContaining({
        id: created.id,
        title: 'Coffee with Dana',
        location: 'Blue Bottle',
      })
    );

    clearUserCache(uid);
    const week = await get(uid, '/api/calendar/week');
    expect(week.status).toBe(200);
    expect(JSON.stringify(week.body.overview)).toContain('Coffee with Dana');
  });

  it("someone else's event never shows", async () => {
    const owner = id();
    const { createEvent, clearUserCache } = await import('../../services/calendar/index.js');
    await createEvent(owner, { title: 'Private dentist', startTime: new Date() });
    clearUserCache(owner);

    const other = await get(id(), '/api/calendar/today');
    expect(JSON.stringify(other.body)).not.toContain('Private dentist');
  });

  it('with no signed-in user the route answers 401, which the panel shows as signed out', async () => {
    const res = await fetch(`${base}/api/calendar/today`);
    expect(res.status).toBe(401);
  });
});
