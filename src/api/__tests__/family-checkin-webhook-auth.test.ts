/**
 * Family check-in webhooks.
 *
 * POST /api/family-checkin/complete/:callId is gone. It took sponsorUserId and
 * a transcript from an unauthenticated body, wrote a call record under that
 * user, and could send them an urgent SMS. Nothing called it. It now falls
 * through to the static files, which answer 404.
 *
 * /status and /response (Twilio callbacks) check Twilio's signature whenever a
 * Twilio auth token is configured, and always in production. Before, they
 * checked only in production.
 */

import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const family = vi.hoisted(() => ({
  getCallRecordById: vi.fn(async () => null),
  completeCallRecord: vi.fn(async () => undefined),
  handleCheckinCallComplete: vi.fn(async () => undefined),
}));
vi.mock('../../services/family/proactive-family-checkin.js', () => ({
  getCallRecordById: family.getCallRecordById,
  completeCallRecord: family.completeCallRecord,
}));
vi.mock('../../services/family/family-checkin-caller.js', () => ({
  handleCheckinCallComplete: family.handleCheckinCallComplete,
}));

import { handleStaticRoutes } from '../../servers/api/static.js';
import { handleFamilyCheckinWebhookRoutes } from '../family-checkin-webhook-routes.js';

const TOKEN = 'test-twilio-auth-token';
/** Behind Firebase Hosting the request carries the run.app Host, not the public one. */
const HOST = 'john-bogle-ui-test.a.run.app';
/** The public origin the callback URL was built on (WEBHOOK_BASE_URL), which Twilio signs. */
const PUBLIC = 'https://checkin.ferni.example';

function sign(url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', TOKEN).update(data).digest('base64');
}

/** POST `path` through the family routes, then the static fallback, as the API server does. */
async function post(path: string, body: string, headers: Record<string, string> = {}) {
  const req = Object.assign(Readable.from([body]), {
    method: 'POST',
    url: path,
    headers: { host: HOST, ...headers },
  }) as unknown as IncomingMessage;
  let status = 0;
  const res = Object.assign(new PassThrough(), {
    headersSent: false,
    writeHead(code: number) {
      status = code;
      return res;
    },
    setHeader: () => res,
  });
  res.resume();
  const done = new Promise<void>((resolve) => {
    res.on('finish', () => resolve());
  });
  const handled = await handleFamilyCheckinWebhookRoutes(
    req,
    res as unknown as ServerResponse,
    path
  );
  if (!handled) handleStaticRoutes(req, res as unknown as ServerResponse, path);
  await done;
  return { status, handled };
}

let root = '';
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'family-checkin-'));
  vi.spyOn(process, 'cwd').mockReturnValue(root); // an empty dist: every static lookup misses
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/family-checkin/complete/:callId', () => {
  it('is gone: 404, and no call record or urgent SMS is triggered', async () => {
    const forged = JSON.stringify({
      sponsorUserId: 'victim-uid',
      transcript: [{ role: 'user', content: 'I fell and I cannot get up' }],
      familyMemberName: 'Doug',
      relationship: 'father',
    });
    const { status, handled } = await post('/api/family-checkin/complete/call-1', forged, {
      'content-type': 'application/json',
    });
    expect(handled).toBe(false);
    expect(status).toBe(404);
    expect(family.handleCheckinCallComplete).not.toHaveBeenCalled();
  });
});

describe('Twilio callbacks check the signature whenever a token is configured', () => {
  const fields = { CallSid: 'CA1', CallStatus: 'completed' };
  const form = new URLSearchParams(fields).toString();
  const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };

  for (const route of ['status', 'response']) {
    const path = `/api/family-checkin/${route}/call-1`;

    it(`/${route}: unsigned or forged is refused outside production too`, async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN);
      expect((await post(path, form, formHeaders)).status).toBe(403);
      const forged = { ...formHeaders, 'x-twilio-signature': 'not-a-signature' };
      expect((await post(path, form, forged)).status).toBe(403);
      expect(family.getCallRecordById).not.toHaveBeenCalled();
    });

    it(`/${route}: a valid Twilio signature is accepted`, async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN);
      vi.stubEnv('WEBHOOK_BASE_URL', PUBLIC);
      const signed = {
        ...formHeaders,
        'x-twilio-signature': sign(`${PUBLIC}${path}`, fields),
      };
      expect((await post(path, form, signed)).status).toBe(200);
      expect(family.getCallRecordById).toHaveBeenCalledTimes(1);
    });

    it(`/${route}: production with no token fails closed`, async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('TWILIO_AUTH_TOKEN', '');
      vi.stubEnv('WEBHOOK_BASE_URL', PUBLIC);
      const signed = {
        ...formHeaders,
        'x-twilio-signature': sign(`${PUBLIC}${path}`, fields),
      };
      expect((await post(path, form, signed)).status).toBe(403);
      expect(family.getCallRecordById).not.toHaveBeenCalled();
    });
  }
});
