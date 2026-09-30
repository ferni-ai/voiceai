/**
 * Outreach API: phone verification and contact info endpoints.
 * Extracted from outreach.routes.ts.
 */

import {
  createVerificationCode,
  verifyCode,
} from '../../services/trust-and-identity/verification-store.js';
import { getLogger } from '../../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from '../helpers.js';
import type { OutreachRouteContext } from './types.js';

const log = getLogger().child({ module: 'outreach-handler' });

export async function handleContactRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route } = ctx;

  // ========================================================================
  // TEST ENDPOINTS (dev only)
  // ========================================================================

  // POST /api/outreach/verify-phone - Send verification code
  if (route === '/verify-phone' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { phone, userId } = body as { phone: string; userId?: string };

    if (!phone) {
      sendJsonResponse(res, 400, { success: false, error: 'phone is required' });
      return true;
    }

    // Use userId or phone as identifier
    const identifier = userId || `phone:${phone}`;

    try {
      // Create verification code in persistent store
      const { code, expiresAt } = await createVerificationCode(identifier, phone);

      // Send via Twilio
      const { textUser } = await import('../../tools/domains/proactive/outreach/index.js');
      await textUser(
        phone,
        `Your Ferni code is ${code}. Just making sure it's really you! 💚`,
        'ferni'
      );

      log.info({ phone: phone.slice(-4), expiresAt }, 'Sent verification code');
      sendJsonResponse(res, 200, { success: true, message: 'Verification code sent' });
    } catch (error) {
      log.error({ error, phone: phone.slice(-4) }, 'Failed to send verification code');
      sendJsonResponse(res, 500, { success: false, error: 'Failed to send code' });
    }
    return true;
  }

  // POST /api/outreach/verify-phone/confirm - Verify the code
  if (route === '/verify-phone/confirm' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { phone, code, userId } = body as { phone: string; code: string; userId?: string };

    if (!phone || !code) {
      sendJsonResponse(res, 400, { success: false, error: 'phone and code are required' });
      return true;
    }

    // Use userId or phone as identifier (same as when creating)
    const identifier = userId || `phone:${phone}`;

    try {
      // Verify using persistent store
      const result = await verifyCode(identifier, code);

      if (result.valid) {
        log.info({ phone: phone.slice(-4) }, 'Phone verified');
        sendJsonResponse(res, 200, { success: true, message: 'Phone verified' });
      } else {
        // Map reason to user-friendly message
        const errorMessages: Record<string, string> = {
          expired: 'Code expired. Please request a new one.',
          invalid: 'Invalid code. Please check and try again.',
          max_attempts: 'Too many attempts. Please request a new code.',
          not_found: 'No verification pending for this number.',
        };
        const errorMessage = errorMessages[result.reason] || 'Verification failed';
        sendJsonResponse(res, 400, { success: false, error: errorMessage });
      }
    } catch (error) {
      log.error({ error, phone: phone.slice(-4) }, 'Verification error');
      sendJsonResponse(res, 500, { success: false, error: 'Verification failed' });
    }
    return true;
  }

  // POST /api/outreach/contact - Set user contact info
  if (route === '/contact' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { userId, phone, email, preferredMethod, timezone } = body as {
      userId: string;
      phone?: string;
      email?: string;
      preferredMethod?: 'sms' | 'email' | 'call';
      timezone?: string;
    };

    if (!userId) {
      sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

    if (!phone && !email) {
      sendJsonResponse(res, 400, {
        success: false,
        error: 'At least phone or email is required',
      });
      return true;
    }

    // Import the outreach tools
    const { setUserContactInfo } = await import('../../tools/domains/proactive/outreach/index.js');

    await setUserContactInfo(userId, { phone, email, preferredMethod, timezone });

    log.info({ userId, hasPhone: !!phone, hasEmail: !!email }, 'Contact info set');
    sendJsonResponse(res, 200, { success: true, message: 'Contact info saved' });
    return true;
  }

  return false;
}
