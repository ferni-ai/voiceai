import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'http';
import { allowedInvokers, verifySchedulerRequest, type IdTokenVerifier } from '../scheduler-auth.js';

const req = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as IncomingMessage;

const env = { GOOGLE_CLOUD_PROJECT: 'johnb-2025' };
const SCHEDULER = 'scheduler-invoker@johnb-2025.iam.gserviceaccount.com';

describe('verifySchedulerRequest', () => {
  it('refuses a request with no token (the hole found on 2026-09-27)', async () => {
    const result = await verifySchedulerRequest(req(), '/api/jobs/memory-consolidation', { env });
    expect(result).toEqual({ ok: false, reason: 'missing bearer token' });
  });

  it("accepts the scheduler's token for this job's URL", async () => {
    let audiences: string[] = [];
    const verify: IdTokenVerifier = async (_t, aud) => {
      audiences = aud;
      return { email: SCHEDULER, email_verified: true };
    };
    const result = await verifySchedulerRequest(req('Bearer tok'), '/api/jobs/memory-consolidation', {
      env,
      verify,
    });
    expect(result).toEqual({ ok: true, caller: SCHEDULER });
    expect(audiences).toContain('https://app.ferni.ai/api/jobs/memory-consolidation');
  });

  it('refuses a valid Google token from anyone else', async () => {
    const verify: IdTokenVerifier = async () => ({ email: 'someone@gmail.com', email_verified: true });
    const result = await verifySchedulerRequest(req('Bearer tok'), '/api/jobs/memory-decay', {
      env,
      verify,
    });
    expect(result).toMatchObject({ ok: false, reason: 'caller not allowed: someone@gmail.com' });
  });

  it('refuses a token that fails verification', async () => {
    const verify: IdTokenVerifier = async () => {
      throw new Error('Wrong recipient, payload audience != requiredAudience');
    };
    const result = await verifySchedulerRequest(req('Bearer forged'), '/api/jobs/memory-decay', {
      env,
      verify,
    });
    expect(result.ok).toBe(false);
  });

  it('can be switched off for local development only by explicit env', async () => {
    const result = await verifySchedulerRequest(req(), '/api/jobs/memory-decay', {
      env: { SCHEDULED_JOBS_AUTH: 'off' },
    });
    expect(result.ok).toBe(true);
  });
});

describe('allowedInvokers', () => {
  it('defaults to the project scheduler account and honours an explicit list', () => {
    expect(allowedInvokers(env)).toEqual([SCHEDULER]);
    expect(allowedInvokers({ SCHEDULER_INVOKER_EMAILS: ' A@x.com , b@y.com ' })).toEqual([
      'a@x.com',
      'b@y.com',
    ]);
  });
});
