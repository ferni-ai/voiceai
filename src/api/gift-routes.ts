/**
 * Gift Tracking API Routes
 *
 * "Better Than Human" gift tracking - Never forget a gift, never repeat one!
 *
 * Routes:
 * - GET /api/gifts - List all gifts for user
 * - GET /api/gifts/:contactId - Get gift history for a contact
 * - POST /api/gifts - Record a new gift
 * - PUT /api/gifts/:giftId - Update a gift (e.g., reaction)
 * - GET /api/gifts/:contactId/suggestions - Get AI-powered gift suggestions
 * - GET /api/gifts/upcoming - Get upcoming gift occasions
 * - GET /api/gifts/analytics - Get gift analytics
 *
 * @module api/gift-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import {
  getUserId,
  handleCorsPreflightIfNeeded,
  parseBody,
  sendError,
  sendJSON,
} from './helpers.js';
import {
  recordGift,
  getGiftHistory,
  getAllGifts,
  updateGiftReaction,
  generateGiftSuggestions,
  getUpcomingGiftOccasions,
  getGiftAnalytics,
  type Gift,
} from '../services/contacts/gift-tracking-service.js';
import { recordInteraction } from '../services/contacts/contact-relationship-service.js';

const log = createLogger({ module: 'GiftAPI' });

// ============================================================================
// HANDLER FUNCTIONS
// ============================================================================

/**
 * List all gifts for the user
 */
async function listGifts(req: IncomingMessage, res: ServerResponse, parsedUrl: URL): Promise<void> {
  const userId = await getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const gifts = await getAllGifts(userId);
    sendJSON(res, { gifts, count: gifts.length });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list gifts');
    sendError(res, 'Failed to load gifts', 500);
  }
}

/**
 * Get gift history for a specific contact
 */
async function getContactGiftHistory(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = await getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const history = await getGiftHistory(userId, contactId);
    sendJSON(res, history);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get gift history');
    sendError(res, 'Failed to load gift history', 500);
  }
}

/**
 * Record a new gift
 */
async function createGift(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = await getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<{
    contactId: string;
    contactName: string;
    direction: 'given' | 'received';
    item: string;
    description?: string;
    occasion: string;
    price?: number;
    reaction?: Gift['reaction'];
    notes?: string;
    tags?: string[];
  }>(req);

  if (!body) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  const { contactId, contactName, direction, item, occasion } = body;

  if (!contactId || !contactName || !direction || !item || !occasion) {
    sendError(res, 'contactId, contactName, direction, item, and occasion are required', 400);
    return;
  }

  try {
    const gift = await recordGift(userId, {
      contactId,
      contactName,
      direction,
      item,
      description: body.description,
      occasion,
      date: new Date(),
      price: body.price,
      reaction: body.reaction,
      notes: body.notes,
      tags: body.tags,
    });

    // Also record as an interaction for the contact
    await recordInteraction(userId, {
      contactId,
      userId,
      date: new Date(),
      type: direction === 'given' ? 'gift_given' : 'gift_received',
      direction: direction === 'given' ? 'outbound' : 'inbound',
      summary: `${direction === 'given' ? 'Gave' : 'Received'} ${item} for ${occasion}`,
      sentiment: 'positive',
      linkedGiftId: gift.id,
      amount: body.price,
    });

    log.info({ userId, giftId: gift.id, contactId, direction, occasion }, 'Gift recorded');

    sendJSON(res, { gift }, 201);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record gift');
    sendError(res, 'Failed to record gift', 500);
  }
}

/**
 * Update a gift (e.g., add reaction)
 */
async function updateGift(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  giftId: string
): Promise<void> {
  const userId = await getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<{
    reaction?: Gift['reaction'];
    notes?: string;
  }>(req);

  if (!body) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  try {
    if (body.reaction) {
      const gift = await updateGiftReaction(userId, giftId, body.reaction);
      if (!gift) {
        sendError(res, 'Gift not found', 404);
        return;
      }
      sendJSON(res, { gift });
    } else {
      sendError(res, 'No updates provided', 400);
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update gift');
    sendError(res, 'Failed to update gift', 500);
  }
}

/**
 * Get AI-powered gift suggestions for a contact
 */
async function getGiftSuggestions(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = await getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const occasion = parsedUrl.searchParams.get('occasion') || 'birthday';
  const minBudget = parsedUrl.searchParams.get('minBudget');
  const maxBudget = parsedUrl.searchParams.get('maxBudget');

  const budget =
    minBudget && maxBudget
      ? { min: parseInt(minBudget, 10), max: parseInt(maxBudget, 10) }
      : undefined;

  try {
    const suggestions = await generateGiftSuggestions(userId, contactId, occasion, budget);
    sendJSON(res, { suggestions, occasion, budget });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate gift suggestions');
    sendError(res, 'Failed to generate suggestions', 500);
  }
}

/**
 * Get upcoming gift occasions
 */
async function getUpcomingOccasions(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = await getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const daysAhead = parseInt(parsedUrl.searchParams.get('days') || '30', 10);

  try {
    const occasions = await getUpcomingGiftOccasions(userId, daysAhead);
    sendJSON(res, { occasions, daysAhead });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get upcoming occasions');
    sendError(res, 'Failed to load upcoming occasions', 500);
  }
}

/**
 * Get gift analytics
 */
async function getAnalytics(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = await getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const analytics = await getGiftAnalytics(userId);
    sendJSON(res, analytics);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get gift analytics');
    sendError(res, 'Failed to load analytics', 500);
  }
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

export async function handleGiftRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/gifts routes
  if (!pathname.startsWith('/api/gifts')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  const method = req.method || 'GET';

  // GET /api/gifts - List all gifts
  if (pathname === '/api/gifts' && method === 'GET') {
    await listGifts(req, res, parsedUrl);
    return true;
  }

  // POST /api/gifts - Create gift
  if (pathname === '/api/gifts' && method === 'POST') {
    await createGift(req, res, parsedUrl);
    return true;
  }

  // GET /api/gifts/upcoming - Upcoming occasions
  if (pathname === '/api/gifts/upcoming' && method === 'GET') {
    await getUpcomingOccasions(req, res, parsedUrl);
    return true;
  }

  // GET /api/gifts/analytics - Gift analytics
  if (pathname === '/api/gifts/analytics' && method === 'GET') {
    await getAnalytics(req, res, parsedUrl);
    return true;
  }

  // Routes with ID parameter
  const idMatch = pathname.match(/^\/api\/gifts\/([^/]+)(\/.*)?$/);
  if (idMatch) {
    const id = idMatch[1];
    const subPath = idMatch[2] || '';

    // Skip special routes already handled
    if (id === 'upcoming' || id === 'analytics') {
      return false;
    }

    // GET /api/gifts/:contactId - Gift history for contact
    if (method === 'GET' && !subPath) {
      await getContactGiftHistory(req, res, parsedUrl, id);
      return true;
    }

    // PUT /api/gifts/:giftId - Update gift
    if (method === 'PUT' && !subPath) {
      await updateGift(req, res, parsedUrl, id);
      return true;
    }

    // GET /api/gifts/:contactId/suggestions - Gift suggestions
    if (method === 'GET' && subPath === '/suggestions') {
      await getGiftSuggestions(req, res, parsedUrl, id);
      return true;
    }
  }

  // 404 for unmatched gift routes
  sendError(res, 'Not found', 404);
  return true;
}

export default handleGiftRoutes;
