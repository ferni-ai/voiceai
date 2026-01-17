/**
 * Apple Sign In Server-to-Server Notification Endpoint
 *
 * Receives notifications from Apple about user account events.
 *
 * Endpoint: POST /api/apple/notifications
 *
 * Apple sends these notifications when:
 * - User revokes consent (consent-revoked)
 * - User deletes their Apple Account (account-delete)
 * - User disables email forwarding (email-disabled)
 * - User enables email forwarding (email-enabled)
 *
 * @see https://developer.apple.com/documentation/sign_in_with_apple/processing_changes_for_sign_in_with_apple_accounts
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';
import { processAppleNotification } from '../../../services/apple/apple-signin-notifications.js';

const log = createLogger({ module: 'apple-notifications-route' });

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Parse request body as text
 */
async function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle Apple notification webhook
 *
 * POST /api/apple/notifications
 *
 * Request body: JWT signed by Apple containing the notification payload
 * Response: 200 OK (Apple expects this)
 */
export async function handleAppleNotification(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Handle CORS preflight if needed (though Apple doesn't send these)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    // Read the raw JWT payload
    const rawPayload = await parseBody(req);

    if (!rawPayload) {
      log.warn('Empty notification payload received');
      // Still return 200 to acknowledge receipt
      sendJson(res, 200, { received: true, processed: false });
      return;
    }

    // Log notification receipt (without sensitive data)
    log.info({ payloadLength: rawPayload.length }, 'Apple notification received');

    // Process the notification
    const result = await processAppleNotification(rawPayload);

    if (result.success) {
      log.info(
        {
          eventType: result.eventType,
          action: result.action,
          hasUser: !!result.userId,
        },
        'Apple notification processed successfully'
      );
    } else {
      log.error({ error: result.error }, 'Failed to process Apple notification');
    }

    // Always return 200 OK to Apple
    // Apple will retry if we return an error, which we don't want for malformed notifications
    sendJson(res, 200, {
      received: true,
      processed: result.success,
      eventType: result.eventType,
    });
  } catch (error) {
    // Log the error but return 200 to prevent Apple from retrying
    log.error({ error: String(error) }, 'Error handling Apple notification');
    sendJson(res, 200, { received: true, processed: false, error: 'internal_error' });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleAppleNotification,
};
