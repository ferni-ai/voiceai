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
} from '../services/outreach/webhooks/index.js';
import { handlePushInteraction } from '../services/outreach/delivery/push-notifications.js';
import { recordCheckinReply } from '../services/outreach/checkin-replies.js';
import { recordInboundSmsConsent } from '../services/messaging/consent.js';
import { recordContactYes } from '../services/messaging/consent-grants.js';
import { recordHolderCode } from '../services/messaging/holder-verification.js';
import { smsCrisisReply, withCrisisReply } from '../services/outreach/sms-crisis-screen.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { isSignedByTwilio } from './twilio-callback-signature.js';

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

function sendTwiML(res: ServerResponse, twiml: string): void {
  res.writeHead(200, { 'Content-Type': 'application/xml' });
  res.end(twiml);
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
      const fullUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;

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
      const fullUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;

      const result = await handleInboundSMSWebhook(
        body as unknown as Parameters<typeof handleInboundSMSWebhook>[0],
        signature,
        fullUrl
      );
      // SMS_CRISIS_SCREEN: only a signed text reaches the (paid) classifier; never rejects.
      const crisis = result.success ? await smsCrisisReply(String(body.Body ?? '')) : null;
      if (crisis) result.twiml = withCrisisReply(result.twiml, crisis, String(body.Body ?? ''));
      // success is false only when the Twilio signature failed; never throws.
      if (result.success) {
        await recordCheckinReply(body.From, body.Body, body.MessageSid);
        // MESSAGING_PIPELINE: STOP/START from any text lands in the one consent record.
        await recordInboundSmsConsent(body.From, body.Body);
        await recordContactYes(body.From, body.Body, body.MessageSid); // a YES to the last text, an ask
        await recordHolderCode(body.From, body.Body); // a sponsored holder confirming their phone
      }

      if (result.twiml) {
        sendTwiML(res, result.twiml);
      } else {
        // Empty TwiML response (no reply)
        sendTwiML(res, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
      return true;
    }

    // Call Status Webhook
    if (webhookPath === '/twilio/call-status' && method === 'POST') {
      const { body } = await parseBody(req);
      const signature = req.headers['x-twilio-signature'] as string;
      const fullUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;

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
