/**
 * Take Your Story's resource bounds, one test per way round them a reviewer found or could
 * find (#1263): every read goes through one BoundedReader on one budget per request, the
 * budget is charged before the work, and the per-person limit lives in Firestore.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EXPORT_BUDGET_LIMITS,
  ExportBudget,
  type ExportBudgetLimits,
} from '../../services/platform/bounded-reader.js';
import {
  countUserRecords,
  exportUserRecords,
} from '../../services/platform/user-records-export.js';

vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  getFirebaseUserOrThrow: async () => null, // no Firebase user: no proven phone profiles
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-export';

let server: Server;
let base: string;
let db: Firestore;
const id = () => `u-${Math.random().toString(36).slice(2)}`;
const budget = (over: Partial<ExportBudgetLimits> = {}) =>
  new ExportBudget({ ...EXPORT_BUDGET_LIMITS, ...over });

beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
  const { handleDataRoutes } = await import('../routes/data.js');
  const { rememberVerifiedUid } = await import('../rate-limit-identity.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const uid = req.headers['x-verified-uid']; // what the door verified, apart from the header
    rememberVerifiedUid(req, typeof uid === 'string' ? uid : null);
    void handleDataRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

async function seedDocs(path: string, n: number, bytesEach = 200): Promise<void> {
  const batch = db.batch();
  for (let i = 0; i < n; i++) {
    batch.set(db.doc(`${path}/d${String(i).padStart(3, '0')}`), {
      n: i,
      pad: 'x'.repeat(bytesEach),
    });
  }
  await batch.commit();
}

const spent = (b: ExportBudget) => ({
  docs: b.limits.maxDocs - b.docsLeft,
  reads: b.limits.maxReads - b.readsLeft,
});

describe('one reader, by construction', () => {
  it('user-records-export.ts makes no Firestore call of its own', () => {
    const file = fileURLToPath(
      new URL('../../services/platform/user-records-export.ts', import.meta.url)
    );
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const calls = code.match(
      /\.get\(|\.where\(|collection\(|\.doc\(|\.count\(|listCollections|runTransaction|getFirestore|firebase-admin/g
    );
    expect(calls).toBeNull();
  });
});

describe.skipIf(!emulator)('export bounds (Firestore emulator)', () => {
  it('reads page by page and returns every document', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 25);
    const pages: number[] = [];
    const records = await exportUserRecords(uid, budget({ maxPageDocs: 10 }), db, (label, n) => {
      if (label === 'users/{uid}/calendar_events') pages.push(n);
    });
    expect(pages).toEqual([10, 10, 5]);
    expect(records['users/{uid}/calendar_events']).toHaveLength(25);
  });

  it('exactly the doc cap is fine; one more is an error, not a cut-off file', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 20);
    await expect(exportUserRecords(uid, budget({ maxDocs: 20 }), db)).resolves.toBeDefined();
    await seedDocs(`users/${uid}/journal`, 1);
    await expect(exportUserRecords(uid, budget({ maxDocs: 20 }), db)).rejects.toMatchObject({
      reason: 'docs',
    });
  });

  it('pagination and other stores never restart the count: the cap is for the request', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 15);
    await seedDocs(`bogle_users/${uid}/summaries`, 15);
    const run = exportUserRecords(uid, budget({ maxDocs: 20, maxPageDocs: 4 }), db);
    await expect(run).rejects.toMatchObject({ reason: 'docs' });
  });

  it('bytes are reserved before a read, so a page of huge documents is never loaded', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 5, 200_000);
    const pages: number[] = [];
    const b = budget({ maxBytes: 1_200_000, maxDocBytes: 1_048_576, maxPageDocs: 100 });
    const run = exportUserRecords(uid, b, db, (label, n) => {
      if (label === 'users/{uid}/calendar_events') pages.push(n);
    });
    await expect(run).rejects.toMatchObject({ reason: 'bytes' });
    expect(pages).toEqual([1]); // one doc's worst case fitted; the next read was refused before it ran
  });

  it('a category named twice is read once, on the same budget', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 5);
    const { getDataExportService } = await import('../../services/data-export.js');
    const once = budget();
    await getDataExportService().exportData(uid, 'json', ['Records'], once);
    const twice = budget();
    await getDataExportService().exportData(uid, 'json', ['Records', 'Records', 'Records'], twice);
    expect(spent(twice)).toEqual(spent(once));
  });

  it('the CSV path spends the same budget and stops at the same cap', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 25);
    const { getDataExportService } = await import('../../services/data-export.js');
    const run = getDataExportService().exportData(uid, 'csv', ['Records'], budget({ maxDocs: 20 }));
    await expect(run).rejects.toMatchObject({ reason: 'docs' });
  });

  it('the count path is bounded too: reads and time', async () => {
    const uid = id();
    await expect(countUserRecords(uid, budget({ maxReads: 5 }), db)).rejects.toMatchObject({
      reason: 'reads',
    });
    await expect(countUserRecords(uid, budget({ deadlineMs: 0 }), db)).rejects.toMatchObject({
      reason: 'time',
    });
  });

  it('subcollections under an exported document are never read', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 1);
    await db.doc(`users/${uid}/calendar_events/d000/attachments/a1`).set({ big: 'nested-sub' });
    const b = budget();
    const records = await exportUserRecords(uid, b, db);
    expect(JSON.stringify(records)).not.toContain('nested-sub');
    expect(spent(b).docs).toBe(1);
  });

  it('JSON kept as a string is charged before it is parsed, and a huge one is left out', async () => {
    const uid = id();
    const inner = JSON.stringify({ items: Array.from({ length: 2_000 }, (_, i) => `item ${i}`) });
    const huge = JSON.stringify({ blob: 'y'.repeat(70 * 1024) });
    await db.doc(`users/${uid}/journal/j1`).set({ inner, huge, note: 'kept' });
    const roomy = await exportUserRecords(uid, budget(), db);
    const [row] = roomy['users/{uid}/journal'] as Array<Record<string, unknown>>;
    expect(row?.note).toBe('kept');
    expect(row).not.toHaveProperty('huge'); // over maxJsonStringBytes: never parsed
    // Room for the raw document but not for parsing its JSON string as well
    const raw = Buffer.byteLength(JSON.stringify({ inner, huge, note: 'kept' }));
    const tight = budget({ maxDocBytes: raw + 100, maxBytes: raw + 100 + inner.length / 2 });
    await expect(exportUserRecords(uid, tight, db)).rejects.toMatchObject({ reason: 'bytes' });
  });

  it('one export per person at a time, and refused attempts count', async () => {
    const uid = id();
    const { claimExport } = await import('../../services/platform/export-rate-limit.js');
    const release = await claimExport(uid, db);
    await expect(claimExport(uid, db)).rejects.toMatchObject({ reason: 'busy' });
    await release();
    await (
      await claimExport(uid, db)
    )(); // 3rd attempt (the busy one counted)
    await expect(claimExport(uid, db)).rejects.toMatchObject({ reason: 'rate' });
  });

  it('the route keys the limit on the verified uid, not the header a request names', async () => {
    const verified = id();
    const post = (named: string) =>
      fetch(`${base}/api/export`, {
        method: 'POST',
        headers: {
          'x-verified-uid': verified,
          'x-firebase-uid': named,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ format: 'json', categories: ['Records'] }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await post(id())).status); // a new name each time
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('a too-large export through the route is a clear 413 with a way forward', async () => {
    const uid = id();
    await seedDocs(`users/${uid}/calendar_events`, 25);
    const saved = EXPORT_BUDGET_LIMITS.maxDocs;
    (EXPORT_BUDGET_LIMITS as ExportBudgetLimits).maxDocs = 20;
    try {
      const res = await fetch(`${base}/api/export`, {
        method: 'POST',
        headers: {
          'x-verified-uid': uid,
          'x-firebase-uid': uid,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ format: 'json', categories: ['Records'] }),
      });
      expect(res.status).toBe(413);
      const body = (await res.json()) as { error: string; reason: string };
      expect(body.reason).toBe('docs');
      expect(body.error).toMatch(/too big.*Pick fewer.*hello@ferni\.ai/);
    } finally {
      (EXPORT_BUDGET_LIMITS as ExportBudgetLimits).maxDocs = saved;
    }
  });
  // Last: resetModules gives later tests a second copy of every module
  it('the limit is per verified person, in Firestore: a fresh process still refuses the 4th', async () => {
    const uid = id();
    const { claimExport } = await import('../../services/platform/export-rate-limit.js');
    for (let i = 0; i < 3; i++) await (await claimExport(uid, db))();
    vi.resetModules(); // a new process: nothing in memory
    const fresh = await import('../../services/platform/export-rate-limit.js');
    await expect(fresh.claimExport(uid, db)).rejects.toMatchObject({ reason: 'rate' });
  });
});
