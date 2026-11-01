/**
 * reachOut's email channel: which mailbox it goes from, and the send.
 *
 * GMAIL_SEND_AS_USER on (config/gmail-send-flag.ts) and the caller granted
 * "send email as me": the email goes from their own Gmail
 * (identity/gmail-send-as-user.ts), and the read-back says so. Otherwise it
 * goes from Ferni's mailbox exactly as before.
 *
 * The mailbox is fixed at the read-back (Planned.from) and the confirmed send
 * uses that one. A Gmail send that fails never falls back to Ferni's mailbox:
 * the caller asked for their own address. It says what went wrong and offers
 * Ferni's address, which the model can only use by calling reachOut again with
 * fromFerni (a new read-back and a new yes).
 *
 * The user is always the tool's session user (ToolContext.userId), never a
 * model argument, so only the caller's own grant is ever read.
 *
 * @module tools/domains/communication/outreach/outreach-email
 */

import {
  gmailSendFrom,
  sendAsUser,
  type GmailSendOutcome,
} from '../../../../services/identity/gmail-send-as-user.js';
import { sendEmail } from '../../../../services/outreach/delivery/email-delivery.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import type { OutreachResult } from './unified-outreach.js';

const log = createLogger({ module: 'outreach-email' });

/** Which mailbox: the caller's Gmail, or Ferni's (undefined: Ferni's, as before the flag). */
export type EmailFrom = 'gmail' | 'ferni';

const OFFER = "I can send it from Ferni's address instead if you'd like.";
/**
 * Every line starts "Nothing was sent:": that prefix is how the confirm gate
 * knows a send failed (confirm-thread.ts outcomeOf), so the model isn't told
 * it went out and a retry from Ferni's address isn't refused as "already placed".
 */
const NOT_SENT = 'Nothing was sent:';

/** What the caller hears when their Gmail didn't send. Nothing was sent from anywhere. */
const GMAIL_FAILED: Record<Exclude<GmailSendOutcome['status'], 'sent'>, string> = {
  not_connected: `${NOT_SENT} your Gmail isn't connected for sending anymore. ${OFFER}`,
  needs_reauth: `${NOT_SENT} Google says your Gmail connection needs renewing. You can reconnect "send email as me" in the app. ${OFFER}`,
  not_permitted: `${NOT_SENT} Google didn't let me send from your Gmail. ${OFFER}`,
  unreachable: `${NOT_SENT} I couldn't reach Gmail just now. I can try again in a bit. ${OFFER}`,
  rejected: `${NOT_SENT} Gmail turned that email down. ${OFFER}`,
  bad_address: `${NOT_SENT} that email address doesn't look right.`,
};

/**
 * The mailbox for an email to plan or send. `pinned` is the one already read
 * back (Planned.from), or 'ferni' when the caller chose Ferni's address.
 */
export async function emailSender(
  userId: string,
  pinned?: EmailFrom
): Promise<{ from?: EmailFrom; fromAddress?: string } | { error: string }> {
  if (pinned) return { from: pinned };
  try {
    const fromAddress = await gmailSendFrom(userId); // null: flag off or no grant
    return fromAddress ? { from: 'gmail', fromAddress } : {};
  } catch {
    log.warn({ userId: userId.substring(0, 8) }, 'Gmail send grant could not be read');
    return { error: `${NOT_SENT} I couldn't check your Gmail connection. ${OFFER}` };
  }
}

interface OutreachEmail {
  userId: string;
  contact: { name: string; email?: string };
  subject: string;
  message: string;
  personaId: string;
  outreachId: string;
  from?: EmailFrom;
}

/** Send reachOut's email from the mailbox that was read back (the caller records it). */
export async function sendOutreachEmail(e: OutreachEmail): Promise<OutreachResult> {
  const { contact, message } = e;
  const result = { channel: 'email' as const, message, contactName: contact.name };
  if (!contact.email) {
    const error = `I don't have ${contact.name}'s email. Should I try calling?`;
    return { ...result, success: false, error };
  }
  let sent: { success: boolean; error?: string };
  if (e.from === 'gmail') {
    // Read back as "from your Gmail": if that's switched off since, say so, never use Ferni's.
    const out = await sendAsUser(e.userId, {
      to: contact.email,
      subject: e.subject,
      body: message,
    });
    sent =
      out.status === 'sent'
        ? { success: true }
        : { success: false, error: GMAIL_FAILED[out.status] };
  } else {
    const { userId, personaId, outreachId, subject } = e;
    const to = contact.email;
    sent = await sendEmail({ to, subject, body: message, personaId, userId, outreachId });
  }
  if (!sent.success) return { ...result, success: false, error: sent.error || 'Email failed.' };
  const how = e.from === 'gmail' ? ' from your Gmail' : '';
  return { ...result, success: true, message: `📧 Emailed ${contact.name}${how}: "${message}"` };
}
