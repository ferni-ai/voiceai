import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

// In-memory Firestore: collection -> doc id -> data
const { store } = vi.hoisted(() => ({
  store: new Map<string, Map<string, Record<string, unknown>>>(),
}));
const coll = (name: string) => store.get(name) ?? store.set(name, new Map()).get(name)!;
const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      get: async () => ({ exists: coll(name).has(id), data: () => coll(name).get(id) }),
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void coll(name).set(id, opts?.merge ? { ...coll(name).get(id), ...data } : data),
      update: async (data: Record<string, unknown>) =>
        void coll(name).set(id, { ...coll(name).get(id), ...data }),
    }),
  }),
};
vi.mock('firebase-admin', () => ({ default: { apps: [{}] } }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb, FieldValue: {} }));
vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false, requireAdmin: () => true }));

const { handleWaitlistRoutes } = await import('../waitlist-routes.js');
const { buildApprovalUrl, generateApprovalToken, WAITLIST_ADMIN_URL } =
  await import('../waitlist-approval-token.js');

const EMAIL = 'newcomer@example.com';
const REAL_SECRET = 'a'.repeat(64);
const docId = (e: string) => Buffer.from(e).toString('base64').replace(/[/+=]/g, '_');

/** The pre-fix scheme with the fallback that was published in this public repo. */
function legacyHardcodedToken(email: string): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return crypto
    .createHash('sha256')
    .update(`${email}:ferni-waitlist-2025:${day}`)
    .digest('hex')
    .substring(0, 32);
}

async function approve(token: string, email = EMAIL): Promise<{ status: number; body: string }> {
  const req = Object.assign(new EventEmitter(), {
    url: `/api/waitlist/approve/${token}?email=${encodeURIComponent(email)}`,
    method: 'GET',
    headers: { host: 'localhost' },
  });
  let status = 0;
  let body = '';
  const res = {
    writeHead: (s: number) => void (status = s),
    setHeader: () => {},
    end: (b: string) => void (body = b),
  };
  await handleWaitlistRoutes(req as never, res as never);
  return { status, body };
}

function seedPending(): void {
  coll('waitlist').set(docId(EMAIL), { email: EMAIL, status: 'pending' });
}

describe('waitlist one-click approval secret', () => {
  afterEach(() => {
    store.clear();
    vi.unstubAllEnvs();
  });

  it('refuses with 503 and approves nobody when the secret is unset', async () => {
    vi.stubEnv('WAITLIST_APPROVAL_SECRET', '');
    seedPending();
    const { status } = await approve(legacyHardcodedToken(EMAIL));
    expect(status).toBe(503);
    expect(coll('waitlist').get(docId(EMAIL))).toMatchObject({ status: 'pending' });
    expect(coll('user_profiles').has(docId(EMAIL))).toBe(false);
  });

  it('treats a too-short secret as unset', async () => {
    vi.stubEnv('WAITLIST_APPROVAL_SECRET', 'short');
    seedPending();
    expect((await approve(generateApprovalToken(EMAIL, 'short'))).status).toBe(503);
    expect(coll('user_profiles').has(docId(EMAIL))).toBe(false);
  });

  it('signs no link when the secret is unset, pointing at the admin page instead', () => {
    vi.stubEnv('WAITLIST_APPROVAL_SECRET', '');
    expect(buildApprovalUrl(EMAIL)).toBe(WAITLIST_ADMIN_URL);
  });

  it('approves with a token signed by the configured secret', async () => {
    vi.stubEnv('WAITLIST_APPROVAL_SECRET', REAL_SECRET);
    seedPending();
    const url = new URL(buildApprovalUrl(EMAIL));
    const token = url.pathname.split('/').pop() ?? '';
    const { status } = await approve(token, url.searchParams.get('email') ?? '');
    expect(status).toBe(200);
    expect(coll('waitlist').get(docId(EMAIL))).toMatchObject({ status: 'approved' });
    expect(coll('user_profiles').get(docId(EMAIL))).toMatchObject({
      foundingMember: true, // the founding-member perk replaced the 10-year partner grant
      subscription: expect.objectContaining({ tier: 'free' }),
    });
  });

  it('rejects a token minted with the old hardcoded fallback', async () => {
    vi.stubEnv('WAITLIST_APPROVAL_SECRET', REAL_SECRET);
    seedPending();
    expect((await approve(legacyHardcodedToken(EMAIL))).status).toBe(403);
    expect(coll('waitlist').get(docId(EMAIL))).toMatchObject({ status: 'pending' });
  });

  it('rejects a valid token replayed for a different email', async () => {
    vi.stubEnv('WAITLIST_APPROVAL_SECRET', REAL_SECRET);
    coll('waitlist').set(docId('other@example.com'), { status: 'pending' });
    const token = generateApprovalToken(EMAIL, REAL_SECRET);
    expect((await approve(token, 'other@example.com')).status).toBe(403);
  });
});
