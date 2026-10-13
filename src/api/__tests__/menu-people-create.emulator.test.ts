/**
 * Adding someone in "People You've Told Me About" keeps their birthday and how you met.
 *
 * The add-person form sends both, and POST /api/contacts dropped both. Real route, real
 * Firestore (the emulator); the agent's read runs in its own module graph
 * (vi.resetModules), as the agent is its own process in production.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
if (emulator) {
  // The contact service picks its project from these
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-menu-people';
  process.env.GCLOUD_PROJECT = 'demo-menu-people';
}

// The door verifies the caller and binds x-firebase-uid; that is not what this tests
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: { headers: Record<string, string> }) => ({
    userId: req.headers['x-firebase-uid'],
    isAdmin: false,
  })),
  rateLimit: vi.fn(() => false),
}));

let server: Server;
let base: string;
const newUser = (): string => `menu-people-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleContactsRoutes } = await import('../contacts-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleContactsRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

async function call(uid: string, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** A birthday `days` from today, as the form's date input sends it (YYYY-MM-DD) */
function birthdayIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `1990-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const form = (birthday: string) => ({
  name: 'Lena Park',
  relationship: 'friend',
  birthday,
  howWeMet: 'Book club at the library',
  notes: 'Loves hiking',
});

describe.skipIf(!emulator)('Adding a person keeps their birthday (Firestore emulator)', () => {
  it('a birthday and how you met, sent from the form, read back from the panel list', async () => {
    const uid = newUser();
    const birthday = birthdayIn(40);
    expect((await call(uid, 'POST', '/api/contacts', form(birthday))).status).toBe(201);

    const { contacts } = (await call(uid, 'GET', '/api/contacts')).body as {
      contacts: Array<Record<string, unknown>>;
    };

    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      name: 'Lena Park',
      howWeMet: 'Book club at the library',
      notes: 'Loves hiking',
      importantDates: [{ date: birthday, type: 'birthday' }],
    });
  });

  it('the agent reads the birthday and how you met on its next call', async () => {
    const uid = newUser();
    const birthday = birthdayIn(40);
    await call(uid, 'POST', '/api/contacts', form(birthday));

    vi.resetModules();
    const agent = await import('../../services/contacts/contact-relationship-service.js');
    const [lena] = await agent.getContacts(uid);

    expect(lena).toMatchObject({
      howWeMet: 'Book club at the library',
      importantDates: [{ date: birthday, type: 'birthday' }],
    });
  });

  it('a birthday three days away becomes an upcoming date in the nudges', async () => {
    const uid = newUser();
    await call(uid, 'POST', '/api/contacts', form(birthdayIn(3)));

    const { upcomingDates } = (await call(uid, 'GET', '/api/contacts/nudges')).body as {
      upcomingDates: Array<Record<string, unknown>>;
    };

    expect(upcomingDates).toContainEqual(
      expect.objectContaining({ contactName: 'Lena Park', dateType: 'birthday', daysAway: 3 })
    );
  });

  it('a birthday that is not a date is refused, and nobody is saved', async () => {
    const uid = newUser();
    const refused = await call(uid, 'POST', '/api/contacts', form('next tuesday'));

    expect(refused.status).toBe(400);
    expect((await call(uid, 'GET', '/api/contacts')).body.contacts).toEqual([]);
  });
});
