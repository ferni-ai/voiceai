/**
 * What clients may do to the analytics, marketplace and developer collections,
 * checked against the Firestore emulator running the repo's firestore.rules.
 * Skips unless FIRESTORE_EMULATOR_HOST is set.
 *
 *   firebase emulators:exec --only firestore:ferni-dev --project demo-test \
 *     "pnpm vitest run -c vitest.config.unit.ts scripts/firestore-rules/__tests__/rules-lockdown.emulator.test.ts"
 *
 * Talks to the emulator's REST API with unsigned ID tokens (the emulator accepts
 * `alg: none`); `Bearer owner` is the emulator superuser (the Admin SDK path,
 * which bypasses rules) and seeds the documents. Same approach as
 * scripts/firestore-rules/check-bogle-users.mjs.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-test';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
// One run's documents never collide with an earlier run's.
const RUN = `r${Date.now().toString(36)}`;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid: string, provider = 'custom', claims: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    user_id: uid,
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    firebase: { sign_in_provider: provider },
    ...claims,
  })}.`;
}

const AUTH = {
  root: 'Bearer owner',
  anon: `Bearer ${token('anon1', 'anonymous')}`,
  u1: `Bearer ${token('u1')}`,
  service: `Bearer ${token('svc', 'custom', { service_account: true })}`,
} as const;
type Who = keyof typeof AUTH;

type Json = string | number | boolean | { [k: string]: Json };
function val(v: Json): unknown {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'string') return { stringValue: v };
  return {
    mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) },
  };
}

async function call(
  who: Who,
  method: 'GET' | 'PATCH' | 'DELETE',
  path: string,
  data?: Record<string, Json>,
  opts: { mask?: string[]; mustNotExist?: boolean } = {}
): Promise<number> {
  const q = new URLSearchParams();
  for (const m of opts.mask ?? []) q.append('updateMask.fieldPaths', m);
  if (opts.mustNotExist) q.set('currentDocument.exists', 'false');
  const qs = q.toString() ? `?${q}` : '';
  const res = await fetch(`${BASE}/${path}${qs}`, {
    method,
    headers: { Authorization: AUTH[who], 'Content-Type': 'application/json' },
    body: data
      ? JSON.stringify({
          fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, val(v)])),
        })
      : undefined,
  });
  await res.text();
  return res.status;
}
const get = (who: Who, path: string) => call(who, 'GET', path);
const create = (who: Who, path: string, data: Record<string, Json>) =>
  call(who, 'PATCH', path, data, { mustNotExist: true });
const update = (who: Who, path: string, data: Record<string, Json>, mask: string[]) =>
  call(who, 'PATCH', path, data, { mask });
const seed = async (path: string, data: Record<string, Json>) =>
  expect(await call('root', 'PATCH', path, data), `seed ${path}`).toBe(200);

describe.skipIf(!HOST)('firestore.rules lockdown (Firestore emulator)', () => {
  const feedback = `optimization_feedback/${RUN}-f1`;
  const tool = `marketplace_tools/${RUN}-t1`;
  const install = `marketplace_installations/${RUN}-i1`;
  const webhook = `developer_webhooks/${RUN}-w1`;

  beforeAll(async () => {
    await seed(feedback, { userId: 'u2', sessionId: 's1', userMessage: 'private words' });
    await seed(tool, {
      name: 'tool',
      publisher: { id: 'u1', name: 'u1' },
      verification: { verified: false, trustLevel: 'unverified' },
    });
    await seed(install, { userId: 'u1', itemId: 't1', enabled: true });
    await seed(webhook, { publisherId: 'u1', url: 'https://example.com/hook' });
  });

  describe('analytics data', () => {
    it('denies an anonymous user reading optimization_feedback', async () => {
      expect(await get('anon', feedback)).toBe(403);
      expect(await get('anon', 'optimization_feedback')).toBe(403); // list
    });

    it('denies an anonymous user writing optimization_feedback and learning_signals', async () => {
      expect(await create('anon', `optimization_feedback/${RUN}-f2`, { userId: 'x' })).toBe(403);
      expect(await create('anon', `learning_signals/${RUN}-l1`, { signal: 'x' })).toBe(403);
    });

    it('still lets a service-account token read it (control: the denial is the rule)', async () => {
      expect(await get('service', feedback)).toBe(200);
    });
  });

  describe('marketplace', () => {
    it('denies the owner setting verification.verified on their tool', async () => {
      const body = { verification: { verified: true } };
      expect(await update('u1', tool, body, ['verification.verified'])).toBe(403);
    });

    it('denies the owner changing the publisher of their tool', async () => {
      expect(await update('u1', tool, { publisher: { id: 'u2' } }, ['publisher.id'])).toBe(403);
    });

    it('allows the owner a normal field update', async () => {
      expect(await update('u1', tool, { name: 'renamed' }, ['name'])).toBe(200);
    });

    it('denies creating a tool that is already verified, allows an unverified one', async () => {
      const base = { name: 'n', publisher: { id: 'u1' } };
      expect(
        await create('u1', `marketplace_tools/${RUN}-t2`, {
          ...base,
          verification: { verified: true, trustLevel: 'verified' },
        })
      ).toBe(403);
      expect(
        await create('u1', `marketplace_tools/${RUN}-t3`, {
          ...base,
          verification: { verified: false, trustLevel: 'unverified' },
        })
      ).toBe(200);
    });

    it('denies a publisher verifying their own profile', async () => {
      const pub = `marketplace_publishers/u1`;
      await call('root', 'DELETE', pub);
      expect(await create('u1', pub, { name: 'p', verified: true })).toBe(403);
      expect(await create('u1', pub, { name: 'p', verified: false })).toBe(200);
      expect(await update('u1', pub, { verified: true }, ['verified'])).toBe(403);
      expect(await update('u1', pub, { name: 'q' }, ['name'])).toBe(200);
    });

    it('denies rewriting an installation userId, allows enable/disable', async () => {
      expect(await update('u1', install, { userId: 'u2' }, ['userId'])).toBe(403);
      expect(await update('u1', install, { enabled: false }, ['enabled'])).toBe(200);
    });
  });

  describe('developer platform', () => {
    it('denies a client creating a developer_webhooks doc', async () => {
      const body = { publisherId: 'u1', url: 'https://example.net/hook' };
      expect(await create('u1', `developer_webhooks/${RUN}-w2`, body)).toBe(403);
    });

    it('denies the owner updating or deleting their webhook, keeps owner read', async () => {
      expect(await update('u1', webhook, { url: 'https://example.org' }, ['url'])).toBe(403);
      expect(await call('u1', 'DELETE', webhook)).toBe(403);
      expect(await get('u1', webhook)).toBe(200);
    });
  });
});
