/**
 * The app's email transport: Gmail as the ferni.ai Workspace mailbox. It is the
 * only one; Ferni has no other email provider (Seth, 2026-10-27, #2947).
 *
 *   EMAIL_FROM         From address (default hello@ferni.ai)
 *   EMAIL_FROM_NAME    From display name (default Ferni)
 *   EMAIL_MAILBOX      Workspace user Gmail sends as, the JWT `sub` (default EMAIL_FROM).
 *                      Set it when EMAIL_FROM is an alias of another user.
 *   EMAIL_MAILER_SA    Service account with domain-wide delegation (default ferni-mailer@johnb-2025)
 *   EMAIL_DAILY_LIMIT  Sends per UTC day per instance before holding (default 1800, Workspace allows ~2000)
 *
 * Setup: docs/runbooks/email-via-workspace.md.
 *
 * @module services/email-transport
 */

import { configuredEmailFrom } from '../../config/house-facts.js';
import type { EmailSender } from '../../types/email-sender.js';
import { createGmailSender, type GmailSenderDeps } from './gmail-sender.js';

export { buildMimeMessage, toBase64Url } from './mime.js';
export type {
  EmailAttachment,
  EmailSender,
  EmailSendResult,
  OutgoingEmail,
} from '../../types/email-sender.js';

export const DEFAULT_MAILER_SA = 'ferni-mailer@johnb-2025.iam.gserviceaccount.com';
type Env = Record<string, string | undefined>;

export function createEmailSenderFromEnv(
  env: Env = process.env,
  deps: Partial<GmailSenderDeps> = {}
): EmailSender {
  const from = configuredEmailFrom(env) ?? 'hello@ferni.ai';
  const limit = Number.parseInt(env.EMAIL_DAILY_LIMIT ?? '', 10);
  return createGmailSender(
    {
      from,
      fromName: env.EMAIL_FROM_NAME?.trim() || 'Ferni',
      mailbox: env.EMAIL_MAILBOX?.trim() || from,
      mailerServiceAccount: env.EMAIL_MAILER_SA?.trim() || DEFAULT_MAILER_SA,
      dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 1800,
    },
    deps
  );
}

let shared: EmailSender | null = null;

/** The process-wide sender (one token cache and one daily counter). */
export function getEmailSender(): EmailSender {
  shared ??= createEmailSenderFromEnv();
  return shared;
}

/** Tests only: replace the shared sender (a fake transport), or pass null to re-read env. */
export function setEmailSenderForTests(sender: EmailSender | null): void {
  shared = sender;
}

/** Tests only: forget the shared sender so the next call re-reads env. */
export function resetEmailSenderForTests(): void {
  shared = null;
}
