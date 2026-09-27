/**
 * Only Cloud Scheduler may run scheduled jobs.
 *
 * /api/jobs/* ran memory consolidation, knowledge-graph insights, outreach
 * and deletions for any caller: an unauthenticated POST to
 * https://app.ferni.ai/api/jobs/memory-consolidation ran the job across every
 * user (found 2026-09-27). Scheduler jobs already send a Google-signed OIDC
 * token for scheduler-invoker@johnb-2025; this verifies it.
 *
 * Accepted: a Google ID token whose audience is this job's URL (or the
 * service origin) and whose email is in SCHEDULER_INVOKER_EMAILS
 * (comma-separated; default scheduler-invoker@<GOOGLE_CLOUD_PROJECT>).
 * SCHEDULED_JOBS_AUTH=off disables the check for local development.
 *
 * @module api/scheduled-jobs/scheduler-auth
 */

import type { IncomingMessage } from 'http';
import { OAuth2Client } from 'google-auth-library';

export interface IdTokenPayload {
  email?: string;
  email_verified?: boolean;
  aud?: string | string[];
}

/** Verifies a Google ID token for the given audiences; injectable for tests. */
export type IdTokenVerifier = (token: string, audiences: string[]) => Promise<IdTokenPayload | null>;

const client = new OAuth2Client();

const googleVerifier: IdTokenVerifier = async (token, audiences) => {
  const ticket = await client.verifyIdToken({ idToken: token, audience: audiences });
  return (ticket.getPayload() as IdTokenPayload | undefined) ?? null;
};

export type SchedulerAuthResult = { ok: true; caller: string } | { ok: false; reason: string };

export function allowedInvokers(env: Record<string, string | undefined> = process.env): string[] {
  const listed = env.SCHEDULER_INVOKER_EMAILS?.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (listed?.length) return listed;
  const project = env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
  return [`scheduler-invoker@${project}.iam.gserviceaccount.com`];
}

/** Public origins the scheduler addresses; the audience must be one of these plus the path. */
function jobAudiences(path: string, env: Record<string, string | undefined>): string[] {
  const origins = (env.SCHEDULED_JOBS_ORIGINS || 'https://app.ferni.ai')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return origins.flatMap((o) => [`${o}${path}`, o]);
}

export async function verifySchedulerRequest(
  req: IncomingMessage,
  path: string,
  opts: { env?: Record<string, string | undefined>; verify?: IdTokenVerifier } = {}
): Promise<SchedulerAuthResult> {
  const env = opts.env ?? process.env;
  if (env.SCHEDULED_JOBS_AUTH === 'off') return { ok: true, caller: 'auth-disabled' };

  const header = req.headers.authorization;
  const token = typeof header === 'string' && /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '') : '';
  if (!token) return { ok: false, reason: 'missing bearer token' };

  let payload: IdTokenPayload | null;
  try {
    payload = await (opts.verify ?? googleVerifier)(token, jobAudiences(path, env));
  } catch (error) {
    return { ok: false, reason: `invalid token: ${String(error).slice(0, 120)}` };
  }
  const email = payload?.email?.toLowerCase();
  if (!email || payload?.email_verified === false) return { ok: false, reason: 'token has no verified email' };
  if (!allowedInvokers(env).includes(email)) return { ok: false, reason: `caller not allowed: ${email}` };
  return { ok: true, caller: email };
}
