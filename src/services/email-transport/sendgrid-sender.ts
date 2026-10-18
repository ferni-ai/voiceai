/**
 * SendGrid adapter for the email port (v3 mail/send): the request the existing
 * call sites build by hand, behind the port so a Gmail adapter can replace it.
 *
 * @module services/email-transport/sendgrid-sender
 */

import type { EmailSender, EmailSendResult } from '../../types/email-sender.js';
import { redactAddresses, unsubscribeHeaders } from './mime.js';

export const SENDGRID_SEND_URL = 'https://api.sendgrid.com/v3/mail/send';

export interface SendGridSenderConfig {
  apiKey: string;
  from: string;
  fromName: string;
}

export function createSendGridSender(
  config: SendGridSenderConfig,
  deps: { fetch?: typeof fetch } = {}
): EmailSender {
  const doFetch = deps.fetch ?? (async (...args) => fetch(...args));
  const fail = (error: string, extra: Partial<EmailSendResult> = {}): EmailSendResult => ({
    ok: false,
    provider: 'sendgrid',
    error,
    ...extra,
  });

  return {
    provider: 'sendgrid',
    isConfigured: () => !!config.apiKey,
    async send(email) {
      if (!config.apiKey) return fail('SENDGRID_API_KEY is not set');
      try {
        const to = (Array.isArray(email.to) ? email.to : [email.to]).map((address) => ({
          email: address,
          name: email.toName,
        }));
        const content = [
          ...(email.text ? [{ type: 'text/plain', value: email.text }] : []),
          ...(email.html ? [{ type: 'text/html', value: email.html }] : []),
        ];
        const headers = unsubscribeHeaders(email);
        const res = await doFetch(SENDGRID_SEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to }],
            from: { email: email.from ?? config.from, name: email.fromName ?? config.fromName },
            reply_to: email.replyTo ? { email: email.replyTo } : undefined,
            subject: email.subject,
            content,
            attachments: email.attachments?.map((a) => ({
              content: a.content,
              filename: a.filename,
              type: a.contentType,
              disposition: 'attachment',
            })),
            headers: Object.keys(headers).length ? headers : undefined,
            categories: email.tags,
            custom_args: email.metadata,
            tracking_settings: email.tracking && {
              open_tracking: { enable: email.tracking.opens ?? false },
              click_tracking: { enable: email.tracking.clicks ?? false },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          return fail(
            `SendGrid ${res.status}: ${redactAddresses(await res.text()).slice(0, 300)}`,
            {
              status: res.status,
              retryable: res.status === 429 || res.status >= 500,
            }
          );
        }
        return {
          ok: true,
          provider: 'sendgrid',
          status: res.status,
          messageId: res.headers.get('x-message-id') ?? undefined,
        };
      } catch (err) {
        return fail(`SendGrid error: ${redactAddresses((err as Error).message)}`, {
          retryable: true,
        });
      }
    },
  };
}
