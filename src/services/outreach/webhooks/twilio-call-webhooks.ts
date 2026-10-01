/**
 * Twilio call status and voicemail webhooks.
 * Extracted from twilio-webhooks.ts.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { updateDeliveryStatus } from '../delivery/delivery-tracker.js';
import { handleCallStatus, handleMachineDetection } from '../sip-bridge.js';
import { findContactByPhone, markContactResponded } from '../../contacts/optimal-timing.js';
import { escapeXml } from './twilio-webhook-helpers.js';
import { validateTwilioSignature } from './twilio-signature.js';
import type { TwilioCallStatusPayload } from './twilio-webhook-types.js';

const log = getLogger().child({ module: 'twilio-webhooks' });

// ============================================================================
// CALL STATUS WEBHOOK
// ============================================================================

/**
 * Handle call status webhook from Twilio
 *
 * Statuses: queued, initiated, ringing, in-progress, completed, busy, failed, no-answer, canceled
 */
export async function handleCallStatusWebhook(
  payload: TwilioCallStatusPayload,
  signature?: string,
  url?: string | string[]
): Promise<{ success: boolean; twiml?: string }> {
  // ALWAYS validate Twilio signature (skip only in test environment with explicit flag)
  const skipValidation =
    process.env.SKIP_TWILIO_VALIDATION === 'true' && process.env.NODE_ENV === 'test';
  if (!skipValidation) {
    if (!signature || !url) {
      log.warn({ callSid: payload.CallSid }, 'Missing Twilio signature or URL');
      return { success: false };
    }
    const isValid = validateTwilioSignature(
      signature,
      url,
      payload as unknown as Record<string, string>
    );
    if (!isValid) {
      log.warn({ callSid: payload.CallSid }, 'Invalid Twilio signature');
      return { success: false };
    }
  }

  const { CallSid, CallStatus, CallDuration, AnsweredBy } = payload;

  log.info({ CallSid, CallStatus, CallDuration, AnsweredBy }, '📞 Call status webhook');

  // Update SIP bridge
  handleCallStatus(CallSid, CallStatus);

  // Handle machine detection
  if (AnsweredBy) {
    const isHuman = AnsweredBy === 'human';
    handleMachineDetection(CallSid, isHuman ? 'human' : 'machine');
  }

  // Update delivery tracker
  let deliveryStatus: 'sent' | 'delivered' | 'responded' | 'failed' = 'sent';
  switch (CallStatus) {
    case 'in-progress':
      deliveryStatus = 'delivered'; // Call was answered
      break;
    case 'completed':
      deliveryStatus = 'responded'; // Call was completed
      break;
    case 'busy':
    case 'failed':
    case 'no-answer':
      deliveryStatus = 'failed';
      break;
  }

  updateDeliveryStatus(CallSid, deliveryStatus);

  // =========================================================================
  // ML TIMING LEARNING - If call was answered/completed, it's a "response"
  // =========================================================================
  if (deliveryStatus === 'responded' || deliveryStatus === 'delivered') {
    try {
      const contactLookup = await findContactByPhone(payload.To);
      if (contactLookup) {
        const mlResult = await markContactResponded(
          contactLookup.userId,
          contactLookup.contactId,
          new Date()
        );

        if (mlResult.updated) {
          log.info(
            {
              contactId: contactLookup.contactId,
              contactName: contactLookup.contactName,
              callStatus: CallStatus,
            },
            '📊 ML timing model updated - contact answered call'
          );
        }
      }
    } catch (mlError) {
      // Don't fail the webhook if ML tracking fails
      log.warn(
        { error: String(mlError), to: payload.To },
        'Failed to update ML timing for call response'
      );
    }
  }

  return { success: true };
}

// ============================================================================
// VOICEMAIL WEBHOOK
// ============================================================================

/**
 * Handle answering machine detection
 * Returns TwiML for leaving voicemail
 */
export async function handleVoicemailWebhook(
  payload: TwilioCallStatusPayload,
  voicemailMessage: string
): Promise<{ twiml: string }> {
  const { CallSid, AnsweredBy } = payload;

  log.info({ CallSid, AnsweredBy }, '📝 Voicemail detection');

  // Generate TwiML for voicemail
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">${escapeXml(voicemailMessage)}</Say>
  <Hangup/>
</Response>`;

  return { twiml };
}
