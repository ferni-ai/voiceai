/**
 * Calendar Webhook Routes
 *
 * Handles incoming webhook notifications from calendar providers.
 * These endpoints receive push notifications when calendar events change.
 *
 * Endpoints:
 * - POST /webhooks/calendar/google - Google Calendar push notifications
 * - POST /webhooks/calendar/outlook - Microsoft Outlook push notifications
 *
 * @module api/calendar-webhook-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import {
  handleWebhookNotification as handleGoogleNotification,
  type WebhookNotification,
} from '../services/calendar/webhooks/google-webhook.js';
import {
  handleWebhookNotification as handleOutlookNotification,
  getValidationResponse,
  type WebhookPayload,
} from '../services/calendar/webhooks/outlook-webhook.js';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

function sendOk(res: ServerResponse): void {
  res.writeHead(200);
  res.end();
}

function sendError(res: ServerResponse, status = 400): void {
  res.writeHead(status);
  res.end();
}

// ============================================================================
// GOOGLE WEBHOOK HANDLER
// ============================================================================

/**
 * Handle Google Calendar webhook
 * Google sends specific headers with notification info
 */
async function handleGoogleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Extract Google notification headers
  const channelId = req.headers['x-goog-channel-id'] as string;
  const resourceId = req.headers['x-goog-resource-id'] as string;
  const resourceState = req.headers['x-goog-resource-state'] as string;
  const channelToken = req.headers['x-goog-channel-token'] as string;
  const channelExpiration = req.headers['x-goog-channel-expiration'] as string;
  const messageNumber = req.headers['x-goog-message-number'] as string;

  // Validate required headers
  if (!channelId || !resourceId || !resourceState) {
    log.warn('Google webhook missing required headers');
    sendError(res, 400);
    return;
  }

  // Build notification object
  const notification: WebhookNotification = {
    channelId,
    resourceId,
    resourceState: resourceState as 'sync' | 'exists' | 'not_exists',
    channelToken,
    channelExpiration,
    messageNumber,
  };

  // Process the notification
  try {
    const result = await handleGoogleNotification(notification);

    if (result.success) {
      log.debug({ channelId, resourceState }, 'Google webhook processed');
    } else {
      log.warn({ channelId, resourceState }, 'Google webhook processing failed');
    }

    // Always return 200 to acknowledge receipt (even on failure)
    // Google will retry on non-200, which we want to avoid for known channels
    sendOk(res);
  } catch (error) {
    log.error({ error: String(error), channelId }, 'Error processing Google webhook');
    sendOk(res); // Still acknowledge to prevent retries
  }
}

// ============================================================================
// OUTLOOK WEBHOOK HANDLER
// ============================================================================

/**
 * Handle Microsoft Outlook webhook
 * Microsoft uses JSON body with validation token for subscription verification
 */
async function handleOutlookWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Collect body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');

  // Check for validation token in query string (subscription verification)
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const validationToken = url.searchParams.get('validationToken');

  if (validationToken) {
    // Microsoft subscription validation - echo back the token
    log.debug('Outlook webhook validation request');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(getValidationResponse(validationToken));
    return;
  }

  // Parse notification payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch (error) {
    log.warn({ error: String(error) }, 'Invalid Outlook webhook payload');
    sendError(res, 400);
    return;
  }

  // Process the notification
  try {
    const result = await handleOutlookNotification(payload);

    if (result.success) {
      log.debug({ synced: result.synced }, 'Outlook webhook processed');
    } else {
      log.warn('Outlook webhook processing failed');
    }

    // Always return 202 Accepted for notifications
    res.writeHead(202);
    res.end();
  } catch (error) {
    log.error({ error: String(error) }, 'Error processing Outlook webhook');
    res.writeHead(202); // Still acknowledge to prevent retries
    res.end();
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleCalendarWebhookRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith('/webhooks/calendar')) {
    return false;
  }

  // Google Calendar webhook
  if (pathname === '/webhooks/calendar/google' && req.method === 'POST') {
    await handleGoogleWebhook(req, res);
    return true;
  }

  // Microsoft Outlook webhook
  if (pathname === '/webhooks/calendar/outlook' && req.method === 'POST') {
    await handleOutlookWebhook(req, res);
    return true;
  }

  // Apple Calendar uses polling (CalDAV doesn't have native push)
  // See: src/services/calendar/polling/apple-polling.ts

  return false;
}

export default handleCalendarWebhookRoutes;
