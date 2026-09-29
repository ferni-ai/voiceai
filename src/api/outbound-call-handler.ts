/**
 * Outbound Call Handler
 *
 * "Ferni, call my mom": places a two-way call to one of the signed-in user's
 * own contacts (voice agent + LiveKit SIP via services/outreach/place-call).
 *
 * - POST /api/outbound-call/initiate  { contactId | contactName, purpose, personaId? }
 *     Verified user. The phone number comes from the user's contacts, never
 *     from the request (toll-fraud protection); admins may pass `phone`.
 *     Limited to 5 calls/hour per user.
 * - GET  /api/outbound-call/:callId   status of a call the caller placed
 * - GET  /api/outbound-call/active    all active calls (admin)
 * - GET  /api/outbound-call/health    configuration status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import { checkRateLimitAsync, requireAdmin, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseRequestBody, sendJsonResponse } from './helpers.js';
import { getOnBehalfCallOrchestrator } from '../services/outreach/on-behalf-call-orchestrator.js';
import { isTwoWayCallingConfigured, placeCallToContact } from '../services/outreach/place-call.js';
import { getContact, searchContacts } from '../services/contacts/contact-relationship-service.js';

const log = getLogger().child({ module: 'outbound-call-handler' });

const CALLS_PER_HOUR = 5;

interface InitiateBody {
  contactId?: string;
  contactName?: string;
  /** Admin only: dial a number that isn't in the caller's contacts */
  phone?: string;
  name?: string;
  purpose?: string;
  message?: string;
  personaId?: string;
}

export async function handleOutboundCallRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/outbound-call')) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;

  const method = req.method || 'GET';

  try {
    if (pathname === '/api/outbound-call/health' && method === 'GET') {
      const orchestrator = getOnBehalfCallOrchestrator();
      sendJsonResponse(res, 200, {
        status: orchestrator.isConfigured() ? 'ready' : 'not_configured',
        twoWayConversation: isTwoWayCallingConfigured(),
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    if (pathname === '/api/outbound-call/initiate' && method === 'POST') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      const body = ((await parseRequestBody(req)) ?? {}) as InitiateBody;
      const purpose = (body.purpose || body.message || '').trim();
      if (!purpose) {
        sendJsonResponse(res, 400, { error: 'What should Ferni say or ask? (purpose)' });
        return true;
      }

      // Resolve who to call from the caller's own contacts
      let contact: { id?: string; name: string; phone: string; relationship?: string } | null = null;
      const found = body.contactId
        ? await getContact(auth.userId, body.contactId)
        : body.contactName
          ? (await searchContacts(auth.userId, body.contactName))[0]
          : null;
      if (found?.phone) {
        contact = { id: found.id, name: found.name, phone: found.phone, relationship: found.relationship };
      } else if (body.phone && auth.isAdmin) {
        contact = { name: body.contactName || body.name || 'Contact', phone: body.phone };
      }

      if (!contact) {
        sendJsonResponse(res, 404, {
          error: body.phone
            ? 'Only contacts you have saved can be called'
            : "I couldn't find that contact with a phone number",
        });
        return true;
      }

      const limit = await checkRateLimitAsync(`outbound-call:${auth.userId}`, CALLS_PER_HOUR, 60 * 60 * 1000);
      if (!limit.allowed) {
        sendJsonResponse(res, 429, { error: 'Too many calls this hour. Try again later?' });
        return true;
      }

      const result = await placeCallToContact({
        userId: auth.userId,
        userName: auth.email?.split('@')[0],
        contact,
        purpose,
        personaId: body.personaId,
      });

      if (!result.success) {
        sendJsonResponse(res, 502, { success: false, error: "Couldn't place the call. Try again?" });
        return true;
      }

      log.info({ userId: auth.userId, callId: result.callId, mode: result.mode }, 'Outbound call placed');
      sendJsonResponse(res, 200, {
        success: true,
        callId: result.callId,
        mode: result.mode,
        contact: { id: contact.id, name: contact.name },
      });
      return true;
    }

    if (pathname === '/api/outbound-call/active' && method === 'GET') {
      const admin = await requireAdmin(req, res);
      if (!admin) return true;
      const calls = getOnBehalfCallOrchestrator().listActiveCalls();
      sendJsonResponse(res, 200, {
        count: calls.length,
        calls: calls.map((call) => ({
          id: call.id,
          status: call.status,
          userId: call.request.userId,
          contact: call.request.resolvedContact?.name,
          createdAt: call.createdAt,
        })),
      });
      return true;
    }

    const statusMatch = pathname.match(/^\/api\/outbound-call\/([\w-]+)$/);
    if (statusMatch && method === 'GET') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;
      const call = getOnBehalfCallOrchestrator().getActiveCall(statusMatch[1]);
      if (!call || (call.request.userId !== auth.userId && !auth.isAdmin)) {
        sendJsonResponse(res, 404, { error: 'Call not found' });
        return true;
      }
      sendJsonResponse(res, 200, {
        callId: call.id,
        status: call.status,
        contact: call.request.resolvedContact?.name,
        createdAt: call.createdAt,
        answeredAt: call.answeredAt,
        completedAt: call.completedAt,
        outcome: call.outcome,
      });
      return true;
    }

    sendJsonResponse(res, 404, { error: 'Not found' });
    return true;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Error handling outbound call route');
    sendJsonResponse(res, 500, { error: 'Internal server error' });
    return true;
  }
}
