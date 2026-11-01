/**
 * The email port: what the app hands a mail transport, and what comes back.
 *
 * The one adapter, Gmail via the ferni.ai Workspace, lives in
 * src/services/email-transport/. Callers build an OutgoingEmail and check the
 * result; the app has no other email provider (Seth, 2026-10-27).
 *
 * @module types/email-sender
 */

/** A file attached to an email. `content` is base64. */
export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface OutgoingEmail {
  to: string | string[];
  /** Display name for a single recipient. */
  toName?: string;
  subject: string;
  /** At least one of text and html is required; send both when you have both. */
  text?: string;
  html?: string;
  /** Display name on the From line. The address comes from the transport's config. */
  fromName?: string;
  /** Ignored: Gmail always sends as its configured mailbox (EMAIL_FROM). */
  from?: string;
  replyTo?: string;
  /**
   * 'transactional' answers something the person did (approval, reminder, alert).
   * 'bulk' is anything they could opt out of (newsletter, outreach) and must carry `unsubscribe`.
   */
  kind: 'transactional' | 'bulk';
  /** Becomes List-Unsubscribe (and List-Unsubscribe-Post when `url` is https). */
  unsubscribe?: { url?: string; mailto?: string };
  attachments?: EmailAttachment[];
  /** Labels for logs; not sent in the message. */
  tags?: string[];
  /** Who and what the email is for (userId, trigger, sourceId); not sent in the message. */
  metadata?: Record<string, string>;
}

type EmailProviderName = 'gmail';

export interface EmailSendResult {
  ok: boolean;
  provider: EmailProviderName;
  messageId?: string;
  /** HTTP status of the provider's last answer, when there was one. */
  status?: number;
  error?: string;
  /** True when trying again later could succeed (rate limit, quota, 5xx). */
  retryable?: boolean;
}

export interface EmailSender {
  readonly provider: EmailProviderName;
  /** False when the transport is missing what it needs to send (mailbox, mailer account). */
  isConfigured: () => boolean;
  /** Never throws: a failure comes back as `{ ok: false, error }`. */
  send: (email: OutgoingEmail) => Promise<EmailSendResult>;
}
