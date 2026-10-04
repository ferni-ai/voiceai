/**
 * Resolving a weekly prediction: the web's real request → the real server
 * handler → the real engagement store (only Firestore is faked) → the web's
 * real parsers.
 *
 * Before: the web posted `{ actuals: { result: n } }`. The store scores only
 * actuals named like a predicted metric ('Deep work hours'), so nothing
 * matched, it saved accuracy 0, and the UI still said "Result recorded!".
 * (Who may record actuals is covered in prediction-actuals-identity.test.ts.)
 */

import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory Firestore: just the calls the engagement store makes.
// ---------------------------------------------------------------------------
type Doc = Record<string, unknown>;
const docs = new Map<string, Doc>();

function docRef(path: string): unknown {
  return {
    id: path.split('/').pop(),
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path), id: path }),
    set: async (data: Doc, opts?: { merge?: boolean }) => {
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...data } : { ...data });
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}

function collectionRef(path: string): unknown {
  const query = (field?: string, limit = Infinity): unknown => ({
    orderBy: (f: string) => query(f, limit),
    limit: (n: number) => query(field, n),
    get: async () => {
      const rows = [...docs.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([, data]) => data)
        .sort((a, b) => String(b[field ?? 'id']).localeCompare(String(a[field ?? 'id'])))
        .slice(0, limit);
      return {
        empty: rows.length === 0,
        size: rows.length,
        docs: rows.map((d) => ({ data: () => d })),
      };
    },
  });
  return { doc: (id: string) => docRef(`${path}/${id}`), ...(query() as object) };
}

// The route resolves the caller through acting-user.ts -> requireAuth. Stand in
// for the verified token with the uid bindVerifiedIdentity would have bound
// (x-firebase-uid); no uid means no credentials (401).
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const uid = req.headers['x-firebase-uid'];
    if (typeof uid !== 'string' || !uid) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: uid, isAdmin: false };
  }),
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection(name: string): unknown {
      return collectionRef(name);
    }
  },
}));

// ---------------------------------------------------------------------------
// Transport: the web's apiPost, delivered to the real route handler as the API
// server would (bindVerifiedIdentity puts the token's uid in x-firebase-uid).
// ---------------------------------------------------------------------------
let signedInUid: string | null = 'alice';

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function callRoute(method: string, path: string, body?: unknown): Promise<Reply> {
  const reply: Reply = { status: 0, body: {} };
  const req = Readable.from(
    body === undefined ? [] : [JSON.stringify(body)]
  ) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: path,
    headers: { host: 'localhost', ...(signedInUid ? { 'x-firebase-uid': signedInUid } : {}) },
  });
  const res = {
    setHeader: vi.fn(),
    writeHead(status: number) {
      reply.status = status;
      return this;
    },
    end(chunk?: string) {
      if (chunk) reply.body = JSON.parse(chunk);
    },
  } as unknown as ServerResponse;
  const url = new URL(path, 'http://localhost');
  await handlePredictionsRoutes(req, res, url.pathname, url);
  return reply;
}

vi.mock('../../apps/web/src/utils/api.js', () => ({
  // Same body as the real apiPost: it adds the signed-in user's id.
  apiPost: async (path: string, body: Record<string, unknown>) => {
    const { status, body: data } = await callRoute('POST', path, { userId: signedInUid, ...body });
    const ok = status >= 200 && status < 300;
    return ok ? { ok, status, data } : { ok, status, error: String(data.error) };
  },
}));

const { handlePredictionsRoutes } = await import('../api/routes/predictions.js');
const { resetEngagementStore } = await import('../services/engagement/engagement-store.js');
const { submitPredictionActuals } =
  await import('../../apps/web/src/services/prediction-actuals.service.js');
const { toPredictionData, toneBand } =
  await import('../../apps/web/src/services/prediction-data.js');
const { toPredictionTrackerData } =
  await import('../../apps/web/src/services/prediction-tracker-data.js');

const DEEP_WORK = 'Deep work hours';
const MOOD = 'Mood average (1-10)';
const createdAt = new Date().toISOString();

function seed(uid: string, id: string, predictions: Record<string, number>): void {
  docs.set(`engagement_profiles/${uid}/predictions/${id}`, {
    id,
    weekOf: '2026-09-28',
    predictions,
    createdAt,
  });
}

function stored(uid: string, id: string): Doc | undefined {
  return docs.get(`engagement_profiles/${uid}/predictions/${id}`);
}

beforeEach(() => {
  docs.clear();
  resetEngagementStore();
  signedInUid = 'alice';
});

describe('resolving a prediction: web request → server score → web display', () => {
  it('scores a close guess as close, not 0%', async () => {
    seed('alice', 'pred_1', { [DEEP_WORK]: 7 });

    const outcome = await submitPredictionActuals('pred_1', { [DEEP_WORK]: 7.5 }).catch(
      (error: Error) => error
    );

    // Saved against the predicted metric, with a real score: 1 - 0.5/7.5.
    expect(stored('alice', 'pred_1')?.accuracy).toBe(93);
    expect(stored('alice', 'pred_1')?.actuals).toEqual({ [DEEP_WORK]: 7.5 });

    // The web gets the per-metric comparison it shows.
    expect(outcome).toEqual({
      accuracy: 93,
      metrics: [{ key: DEEP_WORK, predicted: 7, actual: 7.5, accuracy: 93 }],
    });
    expect(toneBand(93)).toBe('close');

    // The tracker's running accuracy is that real score.
    const { body } = await callRoute('GET', '/api/predictions');
    expect(toPredictionTrackerData(body)?.overallAccuracy).toBe(93);
    const [shown] = (body.predictions as Parameters<typeof toPredictionData>[0][]).map(
      toPredictionData
    );
    expect(shown).toMatchObject({
      status: 'resolved',
      accuracy: 93,
      metrics: [{ key: DEEP_WORK, predicted: 7, actual: 7.5 }],
    });
  });

  it('asks for every metric the prediction holds and scores each', async () => {
    seed('alice', 'pred_2', { [DEEP_WORK]: 10, [MOOD]: 6 });

    const score = await submitPredictionActuals('pred_2', { [DEEP_WORK]: 5, [MOOD]: 6 });

    expect(score.metrics).toEqual([
      { key: DEEP_WORK, predicted: 10, actual: 5, accuracy: 50 },
      { key: MOOD, predicted: 6, actual: 6, accuracy: 100 },
    ]);
    expect(score.accuracy).toBe(75);
    expect(toneBand(score.metrics[0].accuracy)).toBe('off');
    expect(toneBand(score.metrics[1].accuracy)).toBe('spotOn');
  });

  it('refuses actuals that match no predicted metric instead of saving 0%', async () => {
    seed('alice', 'pred_3', { [DEEP_WORK]: 7 });

    // The body the web used to send.
    const reply = await callRoute('POST', '/api/predictions/pred_3/actuals', {
      actuals: { result: 7.5 },
    });

    expect(reply.status).toBe(400);
    expect(stored('alice', 'pred_3')?.accuracy).toBeUndefined();
    expect(stored('alice', 'pred_3')?.completedAt).toBeUndefined();
    await expect(submitPredictionActuals('pred_3', { result: 7.5 })).rejects.toThrow();
  });
});
