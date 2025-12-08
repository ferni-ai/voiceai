/**
 * Outreach Webhook Routes
 *
 * Handles incoming webhooks from:
 * - Twilio (SMS status, inbound SMS, call status)
 * - SendGrid/Resend (email events)
 * - Push notification interactions
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  handleSMSStatusWebhook,
  handleInboundSMSWebhook,
  handleCallStatusWebhook,
  handleSendGridWebhook,
  handleResendWebhook,
  handleOpenTracking,
  handleClickTracking,
} from '../services/outreach/webhooks/index.js';
import { handlePushInteraction } from '../services/outreach/delivery/push-notifications.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

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

function sendPixel(res: ServerResponse): void {
  // 1x1 transparent GIF
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(pixel);
}

function sendRedirect(res: ServerResponse, url: string): void {
  res.writeHead(302, { Location: url });
  res.end();
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
 * - POST /api/outreach/webhooks/sendgrid
 * - POST /api/outreach/webhooks/resend
 * - GET  /api/outreach/webhooks/email/open
 * - GET  /api/outreach/webhooks/email/click
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
    // EMAIL WEBHOOKS
    // ========================================================================

    // SendGrid Webhook
    if (webhookPath === '/sendgrid' && method === 'POST') {
      const { body, rawBody } = await parseBody(req);
      const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
      const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;

      const events = Array.isArray(body) ? body : [body];
      const result = await handleSendGridWebhook(
        events as Parameters<typeof handleSendGridWebhook>[0],
        signature,
        timestamp,
        rawBody
      );

      sendJSON(res, 200, { success: result.success, processed: result.processed });
      return true;
    }

    // Resend Webhook
    if (webhookPath === '/resend' && method === 'POST') {
      const { body, rawBody } = await parseBody(req);
      const signature = req.headers['svix-signature'] as string;
      const webhookId = req.headers['svix-id'] as string;
      const timestamp = req.headers['svix-timestamp'] as string;

      const result = await handleResendWebhook(
        body as unknown as Parameters<typeof handleResendWebhook>[0],
        signature,
        webhookId,
        timestamp,
        rawBody
      );

      sendJSON(res, 200, { success: result.success });
      return true;
    }

    // Email Open Tracking Pixel
    if (webhookPath === '/email/open' && method === 'GET') {
      const url = new URL(req.url || '', `https://${req.headers.host}`);
      const messageId = url.searchParams.get('mid');

      if (messageId) {
        const userAgent = req.headers['user-agent'];
        const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
        await handleOpenTracking(messageId, userAgent, ip);
      }

      sendPixel(res);
      return true;
    }

    // Email Click Tracking Redirect
    if (webhookPath === '/email/click' && method === 'GET') {
      const url = new URL(req.url || '', `https://${req.headers.host}`);
      const messageId = url.searchParams.get('mid');
      const encodedUrl = url.searchParams.get('url');

      if (messageId && encodedUrl) {
        const userAgent = req.headers['user-agent'];
        const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
        const originalUrl = await handleClickTracking(messageId, encodedUrl, userAgent, ip);
        sendRedirect(res, originalUrl);
      } else {
        sendRedirect(res, 'https://ferni.ai');
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

