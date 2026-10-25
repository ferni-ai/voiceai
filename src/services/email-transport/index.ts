/**
 * The app's email transport, chosen by EMAIL_PROVIDER.
 *
 *   EMAIL_PROVIDER     'sendgrid' (default) | 'gmail'
 *   EMAIL_FROM         From address (default hello@ferni.ai); with SendGrid, SENDGRID_FROM_EMAIL wins
 *   EMAIL_FROM_NAME    From display name (default Ferni)
 *   EMAIL_MAILBOX      Workspace user Gmail sends as, the JWT `sub` (default EMAIL_FROM).
 *                      Set it when EMAIL_FROM is an alias of another user.
 *   EMAIL_MAILER_SA    Service account with domain-wide delegation (default ferni-mailer@johnb-2025)
 *   EMAIL_DAILY_LIMIT  Sends per UTC day per instance before holding (default 1800, Workspace allows ~2000)
 *
 * Setup for gmail: docs/runbooks/email-via-workspace.md.
 *
 * @module services/email-transport
 */

import type { EmailProviderName, EmailSender } from '../../types/email-sender.js';
import { createGmailSender, type GmailSenderDeps } from './gmail-sender.js';
import { createSendGridSender } from './sendgrid-sender.js';

export { buildMimeMessage, toBase64Url } from './mime.js';
export type {
  EmailAttachment,
  EmailSender,
  EmailSendResult,
  OutgoingEmail,
} from '../../types/email-sender.js';

export const DEFAULT_MAILER_SA = 'ferni-mailer@johnb-2025.iam.gserviceaccount.com';
type Env = Record<string, string | undefined>;

export function emailProvider(env: Env = process.env): EmailProviderName {
  return env.EMAIL_PROVIDER?.trim().toLowerCase() === 'gmail' ? 'gmail' : 'sendgrid';
}

export function createEmailSenderFromEnv(
  env: Env = process.env,
  deps: Partial<GmailSenderDeps> = {}
): EmailSender {
  const from = env.EMAIL_FROM?.trim() || 'hello@ferni.ai';
  const fromName = env.EMAIL_FROM_NAME?.trim() || 'Ferni';
  if (emailProvider(env) === 'gmail') {
    const limit = Number.parseInt(env.EMAIL_DAILY_LIMIT ?? '', 10);
    return createGmailSender(
      {
        from,
        fromName,
        mailbox: env.EMAIL_MAILBOX?.trim() || from,
        mailerServiceAccount: env.EMAIL_MAILER_SA?.trim() || DEFAULT_MAILER_SA,
        dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 1800,
      },
      deps
    );
  }
  const sendGridFrom = env.SENDGRID_FROM_EMAIL?.trim() || from;
  return createSendGridSender(
    { apiKey: env.SENDGRID_API_KEY?.trim() ?? '', from: sendGridFrom, fromName },
    deps
  );
}

let shared: EmailSender | null = null;

/** The process-wide sender (one token cache and one daily counter). */
export function getEmailSender(): EmailSender {
  shared ??= createEmailSenderFromEnv();
  return shared;
}

/** Tests only: forget the shared sender so the next call re-reads env. */
export function resetEmailSenderForTests(): void {
  shared = null;
}
