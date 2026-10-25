/**
 * email-delivery's sender when EMAIL_PROVIDER=gmail: hands the message to the
 * app's email port (services/email-transport, the ferni.ai Workspace mailbox).
 * Needs no initializeEmailDelivery() call and no SendGrid/Resend key.
 *
 * Gmail always sends from its configured mailbox; the persona shows in the
 * display name, as it does with SendGrid. Open/click tracking, categories and
 * custom args are SendGrid-only and are dropped by the Gmail adapter.
 *
 * @module services/outreach/delivery/workspace-email
 */

import { getEmailSender } from '../../email-transport/index.js';
import type { EmailDeliveryResult, EmailMessage } from './email-delivery.js';

export interface WorkspaceSendOptions {
  /** Persona display name, e.g. "Maya Santos". */
  personaName: string;
  /** Brand after "from" in the display name (default EMAIL_FROM_NAME, then Ferni). */
  brandName?: string;
  replyTo?: string;
}

/** Never throws: the port reports failures (addresses already redacted) as `ok: false`. */
export async function sendViaWorkspace(
  message: EmailMessage,
  html: string,
  text: string,
  options: WorkspaceSendOptions
): Promise<EmailDeliveryResult> {
  const brandName = options.brandName || process.env.EMAIL_FROM_NAME?.trim() || 'Ferni';
  const sent = await getEmailSender().send({
    to: message.to,
    toName: message.toName,
    subject: message.subject,
    html,
    text,
    fromName: `${options.personaName} from ${brandName}`,
    replyTo: options.replyTo || process.env.EMAIL_REPLY_TO?.trim() || undefined,
    kind: 'transactional',
    attachments: message.attachments,
    tags: message.tags,
    metadata: {
      userId: message.userId,
      outreachId: message.outreachId,
      personaId: message.personaId,
    },
  });
  if (!sent.ok) {
    return {
      success: false,
      status: sent.status !== undefined ? String(sent.status) : undefined,
      error: sent.error || `${sent.provider} send failed`,
    };
  }
  return { success: true, messageId: sent.messageId || `gm-${Date.now()}`, status: 'sent' };
}
