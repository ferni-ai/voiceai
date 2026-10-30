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

import { isGmailSendAsUserEnabled } from '../../../../config/gmail-send-flag.js';
import {
  recordInteraction,
  type ContactRelationship,
} from '../../../../services/contacts/contact-relationship-service.js';
import {
  getGmailSendAddress,
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

/** What the caller hears when their Gmail didn't send. Nothing was sent from anywhere. */
const GMAIL_FAILED: Record<Exclude<GmailSendOutcome['status'], 'sent'>, string> = {
  not_connected: `Your Gmail isn't connected for sending anymore, so nothing was sent. ${OFFER}`,
  needs_reauth: `Google says your Gmail connection needs renewing, so nothing was sent. You can reconnect "send email as me" in the app. ${OFFER}`,
  not_permitted: `Google didn't let me send from your Gmail, so nothing was sent. ${OFFER}`,
  unreachable: `I couldn't reach Gmail just now, so nothing was sent. I can try again in a bit. ${OFFER}`,
  rejected: `Gmail turned that email down, so nothing was sent. ${OFFER}`,
  bad_address: "That email address doesn't look right, so nothing was sent.",
};

/**
 * The mailbox for an email to plan or send. `pinned` is the one already read
 * back (Planned.from), or 'ferni' when the caller chose Ferni's address.
 */
export async function emailSender(
  userId: string,
  pinned?: EmailFrom
): Promise<{ from?: EmailFrom; fromAddress?: string } | { error: string }> {
  if (!isGmailSendAsUserEnabled()) return pinned === 'gmail' ? { from: 'gmail' } : {};
  if (pinned) return { from: pinned };
  try {
    const fromAddress = await getGmailSendAddress(userId, true);
    return fromAddress ? { from: 'gmail', fromAddress } : {};
  } catch {
    log.warn({ userId: userId.substring(0, 8) }, 'Gmail send grant could not be read');
    return { error: `I couldn't check your Gmail connection, so nothing was sent. ${OFFER}` };
  }
}

interface OutreachEmail {
  userId: string;
  contact: ContactRelationship;
  subject: string;
  message: string;
  purpose: string;
  personaId: string;
  outreachId: string;
  from?: EmailFrom;
}

/** Send reachOut's email from the mailbox that was read back. */
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
    const out = isGmailSendAsUserEnabled()
      ? await sendAsUser(e.userId, { to: contact.email, subject: e.subject, body: message })
      : ({ status: 'not_connected' } as const);
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
  await recordInteraction(e.userId, {
    contactId: contact.id,
    userId: e.userId,
    date: new Date(),
    type: 'email',
    direction: 'outbound',
    summary: `Email: ${e.purpose}`,
  }).catch((err) =>
    log.debug(
      { error: String(err), contactId: contact.id },
      'Failed to record email interaction (non-fatal)'
    )
  );
  const how = e.from === 'gmail' ? ' from your Gmail' : '';
  return { ...result, success: true, message: `📧 Emailed ${contact.name}${how}: "${message}"` };
}
