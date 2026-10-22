/**
 * Gmail adapter for the email port: users.messages.send as the ferni.ai
 * Workspace mailbox, authorized keylessly (gmail-auth.ts).
 *
 * Retries: a 401 re-mints the token once; 429/403 rate limits and 5xx back off
 * exponentially (honouring Gmail's "Retry after"); a wait longer than a minute
 * (the daily sending limit) holds all sends until then instead of retrying.
 *
 * @module services/email-transport/gmail-sender
 */

import type { EmailSender, EmailSendResult, OutgoingEmail } from '../../types/email-sender.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createGmailTokenSource, runtimeAccessToken, type GmailAuthDeps } from './gmail-auth.js';
import { buildMimeMessage, redactAddresses, toBase64Url } from './mime.js';
import { createDailySendQuota } from './send-quota.js';

const log = createLogger({ module: 'email-gmail' });

export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const MAX_ATTEMPTS = 4;
const LONGEST_INLINE_WAIT_MS = 60_000;
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

export interface GmailSenderConfig {
  /** The From address: the mailbox itself or one of its send-as aliases. */
  from: string;
  fromName: string;
  /** The Workspace user the mailer impersonates (JWT `sub`). */
  mailbox: string;
  mailerServiceAccount: string;
  dailyLimit: number;
}

export interface GmailSenderDeps extends GmailAuthDeps {
  sleep: (ms: number) => Promise<void>;
}

interface GmailError {
  error?: { message?: string; errors?: Array<{ reason?: string }> };
}

/** When Gmail says to retry: its "Retry after <ISO time>" message, else the Retry-After header. */
function retryAt(message: string, header: string | null, nowMs: number): number | null {
  const iso = /Retry after (\S+?Z)/.exec(message)?.[1];
  if (iso !== undefined && !Number.isNaN(Date.parse(iso))) return Date.parse(iso);
  const seconds = header !== null ? Number(header) : NaN;
  return Number.isFinite(seconds) ? nowMs + seconds * 1000 : null;
}

type Next =
  | { kind: 'remint' }
  | { kind: 'fail'; message: string }
  | { kind: 'hold'; until: number; message: string }
  | { kind: 'retry'; waitMs: number };

/** What to do after a failed send: re-mint, give up, hold all sends, or wait and retry. */
async function nextStep(res: Response, attempt: number, nowMs: number): Promise<Next> {
  if (res.status === 401 && attempt === 0) return { kind: 'remint' };
  const body = (await res.json().catch(() => ({}))) as GmailError;
  const message = body.error?.message ?? '';
  const reasons = (body.error?.errors ?? []).map((e) => e.reason ?? '');
  const rateLimited =
    res.status === 429 || (res.status === 403 && reasons.some((r) => RATE_REASONS.has(r)));
  if (!rateLimited && res.status < 500)
    return {
      kind: 'fail',
      message: `gmail ${res.status}: ${redactAddresses(message).slice(0, 300)}`,
    };

  const backoff = Math.min(1000 * 2 ** attempt, 8000);
  const until = rateLimited ? retryAt(message, res.headers.get('retry-after'), nowMs) : null;
  if (until === null) return { kind: 'retry', waitMs: backoff };
  if (until - nowMs > LONGEST_INLINE_WAIT_MS)
    return {
      kind: 'hold',
      until,
      message: `gmail rate limit: ${redactAddresses(message).slice(0, 200)}`,
    };
  return { kind: 'retry', waitMs: Math.max(until - nowMs, backoff) };
}

export function createGmailSender(
  config: GmailSenderConfig,
  overrides: Partial<GmailSenderDeps> = {}
): EmailSender {
  const deps: GmailSenderDeps = {
    fetch: overrides.fetch ?? (async (...args) => fetch(...args)),
    runtimeToken: overrides.runtimeToken ?? runtimeAccessToken,
    now: overrides.now ?? Date.now,
    sleep:
      overrides.sleep ??
      (async (ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        })),
  };
  const tokens = createGmailTokenSource(config.mailerServiceAccount, config.mailbox, deps);
  const quota = createDailySendQuota(config.dailyLimit, deps.now);
  const fail = (error: string, extra: Partial<EmailSendResult> = {}): EmailSendResult => ({
    ok: false,
    provider: 'gmail',
    error,
    ...extra,
  });

  async function send(email: OutgoingEmail): Promise<EmailSendResult> {
    const blocked = quota.blockedReason();
    if (blocked) return fail(blocked, { retryable: true });

    let raw: string;
    try {
      raw = toBase64Url(
        buildMimeMessage(email, { address: config.from, name: email.fromName ?? config.fromName })
      );
    } catch (err) {
      return fail(`invalid email: ${(err as Error).message}`);
    }

    let lastStatus = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await deps.fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await tokens.get()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
      if (res.ok) {
        quota.record();
        const { id } = (await res.json()) as { id?: string };
        return { ok: true, provider: 'gmail', messageId: id, status: res.status };
      }

      lastStatus = res.status;
      const next = await nextStep(res, attempt, deps.now());
      if (next.kind === 'remint') tokens.invalidate();
      else if (next.kind === 'fail') return fail(next.message, { status: res.status });
      else if (next.kind === 'hold') {
        quota.blockUntil(next.until);
        log.warn(
          { until: new Date(next.until).toISOString(), sentToday: quota.sentToday() },
          'gmail send limit hit; holding sends'
        );
        return fail(next.message, { status: res.status, retryable: true });
      } else if (attempt < MAX_ATTEMPTS - 1) await deps.sleep(next.waitMs);
    }
    return fail(`gmail send failed after ${MAX_ATTEMPTS} attempts`, {
      status: lastStatus,
      retryable: true,
    });
  }

  return {
    provider: 'gmail',
    isConfigured: () => !!config.mailbox && !!config.mailerServiceAccount && !!config.from,
    async send(email) {
      try {
        return await send(email);
      } catch (err) {
        log.error({ error: redactAddresses(String(err)) }, 'gmail send threw');
        return fail(`gmail send error: ${redactAddresses((err as Error).message)}`, {
          retryable: true,
        });
      }
    },
  };
}
