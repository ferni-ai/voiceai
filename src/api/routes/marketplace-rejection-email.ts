/**
 * Marketplace Admin - rejection email
 *
 * Tells a publisher their submission was not published, with the reason and
 * any reviewer feedback. Used by marketplace-admin.ts.
 *
 * @module api/routes/marketplace-rejection-email
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  sendEmail,
  isEmailDeliveryAvailable,
  generatePersonaEmailHTML,
} from '../../services/outreach/delivery/email-delivery.js';

const log = getLogger().child({ module: 'marketplace-admin' });

/**
 * Send rejection email to the publisher
 */
export async function sendRejectionEmail(
  publisherEmail: string,
  publisherName: string,
  itemName: string,
  reason: string,
  feedback?: string,
  adminId?: string
): Promise<boolean> {
  if (!isEmailDeliveryAvailable()) {
    log.warn(
      { publisherEmail, itemName },
      'Email delivery not available, skipping rejection email'
    );
    return false;
  }

  try {
    let emailBody = `Thank you for submitting "${itemName}" to the Ferni Marketplace.`;
    emailBody += `\n\nAfter careful review, we've decided not to publish your submission at this time.`;
    emailBody += `\n\n**Reason:** ${reason}`;

    if (feedback) {
      emailBody += `\n\n**Feedback from our team:**\n${feedback}`;
    }

    emailBody += `\n\nWe encourage you to address the feedback and resubmit. Our team is here to help you create something amazing.`;
    emailBody += `\n\nIf you have questions, please reach out to marketplace-support@ferni.ai.`;

    const result = await sendEmail({
      to: publisherEmail,
      toName: publisherName,
      subject: `Update on your Ferni Marketplace submission: ${itemName}`,
      body: emailBody,
      personaId: 'ferni',
      userId: adminId || 'marketplace-admin',
      outreachId: `marketplace-rejection-${Date.now()}`,
      preheader: 'Your marketplace submission needs some changes',
      html: generatePersonaEmailHTML('ferni', {
        body: emailBody,
        userName: publisherName,
        ctaText: 'Review Submission Guidelines',
        ctaUrl: 'https://ferni.ai/developers/marketplace-guidelines',
        footerNote: 'This is an automated message from the Ferni Marketplace review team.',
      }),
    });

    if (result.success) {
      log.info(
        {
          publisherEmail,
          itemName,
          messageId: result.messageId,
        },
        'Rejection email sent'
      );
    } else {
      log.error({ publisherEmail, error: result.error }, 'Failed to send rejection email');
    }

    return result.success;
  } catch (error) {
    log.error({ error: String(error), publisherEmail }, 'Error sending rejection email');
    return false;
  }
}
