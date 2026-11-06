/**
 * Outreach Webhook Routes
 *
 * Handles incoming webhooks from:
 * - Twilio (SMS status, inbound SMS, call status)
 * - Push notification interactions
 *
 * No email event webhooks: email goes out through the ferni.ai Workspace mailbox
 * only (Seth, 2026-10-27, #2947), which has no delivery-event callback, and no
 * email carries an open pixel or tracked link.
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  handleSMSStatusWebhook,
  handleInboundSMSWebhook,
  handleCallStatusWebhook,
  isSignedInboundSms,
} from '../services/outreach/webhooks/index.js';
import { handlePushInteraction } from '../services/outreach/delivery/push-notifications.js';
import { recordCheckinReply } from '../services/outreach/checkin-replies.js';
import { recordInboundSmsConsent } from '../services/messaging/consent.js';
import { recordContactYes } from '../services/messaging/consent-grants.js';
import { recordHolderCode } from '../services/messaging/holder-verification.js';
import {
  smsCrisisReply,
  smsCrisisReplyFor,
  smsReplyTwiml,
  withCrisisReply,
} from '../services/outreach/sms-crisis-screen.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { isSignedByTwilio, twilioSignedUrl } from './twilio-callback-signature.js';

const log = getLogger().child({ module: 'outreach-webhook-routes' });

// ============================================================================
// TYPES
// ============================================================================

interface ParsedRequest {
  body: Record<string, unknown>;
  rawBody: string;
}

// ============================================================================
// REQUEST PARSING
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<ParsedRequest> {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    req.on('data', (chunk: Buffer) => {
      rawBody += chunk.toString();
    });
    req.on('end', () => {
      try {
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('application/json')) {
          resolve({ body: JSON.parse(rawBody || '{}'), rawBody });
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(rawBody);
          const body: Record<string, string> = {};
          params.forEach((value, key) => {
            body[key] = value;
          });
          resolve({ body, rawBody });
        } else {
          resolve({ body: {}, rawBody });
        }
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** The public URL Twilio signed this request over; undefined makes the handler refuse it. */
function signedUrl(req: IncomingMessage, pathname: string, body: Record<string, unknown>) {
  return twilioSignedUrl(req, req.url || pathname, body as Record<string, string>) ?? undefined;
}

function sendTwiML(res: ServerResponse, twiml: string): void {
  res.writeHead(200, { 'Content-Type': 'application/xml' });
  res.end(twiml);
}

type InboundSms = Parameters<typeof handleInboundSMSWebhook>[0];

/**
 * One step after the crisis screen: a throw is logged (the step and the error's
 * class only, never a number or the words) and the text is still answered.
 */
async function afterScreen<T>(
  step: string,
  crisis: boolean,
  run: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : typeof error;
    log.warn({ step, crisis, errorClass }, 'Inbound SMS step failed; the reply still goes out');
    return undefined;
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle outreach webhook routes
 *
 * Routes:
 * - POST /api/outreach/webhooks/twilio/sms-status
 * - POST /api/outreach/webhooks/twilio/sms-inbound
 * - POST /api/outreach/webhooks/twilio/call-status
 * - POST /api/outreach/webhooks/twilio/conversational-call-status
 * - POST /api/outreach/webhooks/push/interaction
 */
export async function handleOutreachWebhookRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method?.toUpperCase() || 'GET';
  const webhookPath = pathname.replace('/api/outreach/webhooks', '');

  log.debug({ method, path: webhookPath }, 'Webhook route');

  try {
    // ========================================================================
    // TWILIO WEBHOOKS
    // ========================================================================

    // Conversational call status (Twilio statusCallback from conversational-calls.ts):
    // retries, voicemail and completion for scheduled_calls
    if (webhookPath === '/twilio/conversational-call-status' && method === 'POST') {
      const { body } = await parseBody(req);
      const params = body as Record<string, string>;
      if (!isSignedByTwilio(req, req.url || pathname, params)) {
        log.warn({ path: webhookPath }, 'Missing or invalid Twilio signature');
        sendJSON(res, 403, { error: 'Invalid signature' });
        return true;
      }
      const { handleCallStatusUpdate } =
        await import('../services/outreach/conversational-calls.js');
      await handleCallStatusUpdate(
        params as unknown as Parameters<typeof handleCallStatusUpdate>[0]
      );
      sendJSON(res, 200, { success: true });
      return true;
    }

    // SMS Status Webhook
    if (webhookPath === '/twilio/sms-status' && method === 'POST') {
      const { body } = await parseBody(req);
      const signature = req.headers['x-twilio-signature'] as string;
      const fullUrl = signedUrl(req, pathname, body);

      const result = await handleSMSStatusWebhook(
        body as unknown as Parameters<typeof handleSMSStatusWebhook>[0],
        signature,
        fullUrl
      );

      if (result.twiml) {
        sendTwiML(res, result.twiml);
      } else {
        sendJSON(res, result.success ? 200 : 400, { success: result.success });
      }
      return true;
    }

    // Inbound SMS Webhook
    if (webhookPath === '/twilio/sms-inbound' && method === 'POST') {
      const { body } = await parseBody(req);
      const signature = req.headers['x-twilio-signature'] as string;
      const fullUrl = signedUrl(req, pathname, body);

      const payload = body as unknown as InboundSms;
      const text = String(body.Body ?? '');
      // SMS_CRISIS_SCREEN: only a signed text reaches the (paid) classifier. The
      // screen runs first and never rejects, so a crisis reply never waits on, or
      // is lost to, anything below: each later step is caught and the reply is sent.
      const signed = isSignedInboundSms(payload, signature, fullUrl);
      // The screen never rejects by contract; if it ever did, the text is still answered.
      const crisis = signed
        ? ((await afterScreen('screen', false, () => smsCrisisReply(text))) ?? null)
        : null;
      let twiml = crisis ? smsReplyTwiml(crisis) : undefined;
      const result = await afterScreen('handler', !!crisis, () =>
        handleInboundSMSWebhook(payload, signature, fullUrl)
      );
      if (result) twiml = result.twiml;
      // A "call me" text keeps its call; the one crisis text says so (Seth, 2026-11-06).
      if (crisis) twiml = withCrisisReply(twiml, smsCrisisReplyFor(result?.called), text);
      if (signed) {
        const crisisRead = !!crisis;
        await afterScreen('checkin', crisisRead, () =>
          recordCheckinReply(body.From, body.Body, body.MessageSid)
        );
        // MESSAGING_PIPELINE: STOP/START from any text lands in the one consent record.
        await afterScreen('consent', crisisRead, () =>
          recordInboundSmsConsent(body.From, body.Body)
        );
        await afterScreen('contactYes', crisisRead, () =>
          recordContactYes(body.From, body.Body, body.MessageSid)
        ); // a YES to the last text, an ask
        await afterScreen('holderCode', crisisRead, () => recordHolderCode(body.From, body.Body));
      }

      // Empty TwiML: no reply.
      sendTwiML(res, twiml ?? '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      return true;
    }

    // Call Status Webhook
    if (webhookPath === '/twilio/call-status' && method === 'POST') {
      const { body } = await parseBody(req);
      const signature = req.headers['x-twilio-signature'] as string;
      const fullUrl = signedUrl(req, pathname, body);

      const result = await handleCallStatusWebhook(
        body as unknown as Parameters<typeof handleCallStatusWebhook>[0],
        signature,
        fullUrl
      );

      if (result.twiml) {
        sendTwiML(res, result.twiml);
      } else {
        sendJSON(res, 200, { success: true });
      }
      return true;
    }

    // ========================================================================
    // PUSH NOTIFICATION WEBHOOKS
    // ========================================================================

    // Push Interaction
    if (webhookPath === '/push/interaction' && method === 'POST') {
      const { body } = await parseBody(req);
      const { messageId, interaction, actionId } = body as {
        messageId: string;
        interaction: 'opened' | 'actioned';
        actionId?: string;
      };

      if (messageId && interaction) {
        handlePushInteraction(messageId, interaction, actionId);
        sendJSON(res, 200, { success: true });
      } else {
        sendJSON(res, 400, { error: 'Missing messageId or interaction' });
      }
      return true;
    }

    // Route not found
    return false;
  } catch (error) {
    log.error({ error, path: webhookPath }, 'Webhook handler error');
    sendJSON(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default handleOutreachWebhookRoutes;
