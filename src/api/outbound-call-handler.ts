/**
 * Outbound Call Handler
 *
 * HTTP handler for outbound call routes that works with the raw http server.
 * Provides endpoints to initiate and manage conversational outbound calls.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseRequestBody, sendJsonResponse } from './helpers.js';
import {
  getConversationalCallService,
  makeConversationalCall,
  isConversationalCallsConfigured,
  type OutboundCallContext,
  type CallResult,
} from '../services/outreach/conversational-calls.js';

const log = getLogger().child({ module: 'outbound-call-handler' });

/**
 * Handle outbound call API routes
 * @returns true if route was handled
 */
export async function handleOutboundCallRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/outbound-call')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method || 'GET';

  try {
    // GET /api/outbound-call/health
    if (pathname === '/api/outbound-call/health' && method === 'GET') {
      const configured = isConversationalCallsConfigured();
      sendJsonResponse(res, 200, {
        status: configured ? 'ready' : 'not_configured',
        conversationalCallsEnabled: configured,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // POST /api/outbound-call/initiate - Initiate a conversational call
    if (pathname === '/api/outbound-call/initiate' && method === 'POST') {
      const body = (await parseRequestBody(req)) as OutboundCallContext;

      // Basic validation
      if (!body.user?.phone || !body.user?.name) {
        sendJsonResponse(res, 400, {
          error: 'Missing required fields: user.phone and user.name',
        });
        return true;
      }

      if (!isConversationalCallsConfigured()) {
        sendJsonResponse(res, 503, {
          error: 'Conversational calls not configured',
          hint: 'Check TWILIO_* and LIVEKIT_* environment variables',
        });
        return true;
      }

      try {
        const call = await makeConversationalCall(body);

        sendJsonResponse(res, 200, {
          success: true,
          callId: call.id,
          status: call.status,
          twilioCallSid: call.twilioCallSid,
          livekitRoom: call.livekitRoomName,
        });
      } catch (error) {
        log.error({ error }, 'Failed to initiate call');
        sendJsonResponse(res, 500, {
          error: 'Failed to initiate call',
          details: String(error),
        });
      }
      return true;
    }

    // GET /api/outbound-call/active - Get all active calls
    if (pathname === '/api/outbound-call/active' && method === 'GET') {
      const service = getConversationalCallService();
      const calls: CallResult[] = service.getActiveCalls ? await service.getActiveCalls() : [];

      sendJsonResponse(res, 200, {
        count: calls.length,
        calls: calls.map((call) => ({
          id: call.id,
          status: call.status,
          userId: call.context?.user?.id,
          userName: call.context?.user?.name,
          persona: call.context?.persona,
          purpose: call.context?.trigger?.reason,
          startedAt: call.initiatedAt,
        })),
      });
      return true;
    }

    // Not found within our prefix
    sendJsonResponse(res, 404, { error: 'Not found' });
    return true;
  } catch (error) {
    log.error({ error, pathname }, 'Error handling outbound call route');
    sendJsonResponse(res, 500, { error: 'Internal server error' });
    return true;
  }
}
