/**
 * Contact Management API Routes
 *
 * REST API for managing contacts, groups, and important dates.
 * This enables the frontend to:
 * - Add/edit/delete contacts
 * - Manage contact groups (family, friends, etc.)
 * - Track important dates (birthdays, anniversaries)
 * - Get outreach suggestions
 *
 * Routes:
 * - GET /api/contacts - List all contacts
 * - POST /api/contacts - Create a contact
 * - GET /api/contacts/:id - Get a contact
 * - PUT /api/contacts/:id - Update a contact
 * - POST /api/contacts/:id/important-dates - Add important date
 * - DELETE /api/contacts/:id - Delete a contact (owner only)
 * - GET /api/contacts/groups - List groups
 * - POST /api/contacts/groups - Create group
 * - GET /api/contacts/nudges - Get outreach suggestions
 *
 * @module api/contacts-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError } from './helpers.js';
import {
  addImportantDate,
  createContact,
  deleteContactHandler,
  getContactHandler,
  listContacts,
  searchContactsHandler,
  updateContact,
} from './contacts-routes/contact-handlers.js';
import {
  getInteractionHistoryHandler,
  getInteractionStatsHandler,
  getTopicsHandler,
  recordInteractionHandler,
} from './contacts-routes/interaction-handlers.js';
import {
  createGroupHandler,
  deleteGroupHandler,
  getInsights,
  getNudges,
  listGroups,
  updateGroupHandler,
} from './contacts-routes/group-handlers.js';

const log = createLogger({ module: 'ContactsAPI' });

// ============================================================================
// MAIN ROUTER
// ============================================================================

export async function handleContactsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/contacts routes
  if (!pathname.startsWith('/api/contacts')) {
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

  // GET /api/contacts - List contacts
  if (pathname === '/api/contacts' && method === 'GET') {
    await listContacts(req, res, parsedUrl);
    return true;
  }

  // GET /api/contacts/search?q=name - Search contacts
  if (pathname === '/api/contacts/search' && method === 'GET') {
    await searchContactsHandler(req, res, parsedUrl);
    return true;
  }

  // POST /api/contacts - Create contact
  if (pathname === '/api/contacts' && method === 'POST') {
    await createContact(req, res, parsedUrl);
    return true;
  }

  // GET /api/contacts/groups - List groups
  if (pathname === '/api/contacts/groups' && method === 'GET') {
    await listGroups(req, res, parsedUrl);
    return true;
  }

  // POST /api/contacts/groups - Create group
  if (pathname === '/api/contacts/groups' && method === 'POST') {
    await createGroupHandler(req, res, parsedUrl);
    return true;
  }

  // GET /api/contacts/insights - Get insights
  if (pathname === '/api/contacts/insights' && method === 'GET') {
    await getInsights(req, res, parsedUrl);
    return true;
  }

  // GET /api/contacts/nudges - Get nudges
  if (pathname === '/api/contacts/nudges' && method === 'GET') {
    await getNudges(req, res, parsedUrl);
    return true;
  }

  // Routes with contact ID
  const contactMatch = pathname.match(/^\/api\/contacts\/([^/]+)(\/.*)?$/);
  if (
    contactMatch &&
    contactMatch[1] !== 'groups' &&
    contactMatch[1] !== 'search' &&
    contactMatch[1] !== 'insights' &&
    contactMatch[1] !== 'nudges'
  ) {
    const contactId = contactMatch[1];
    const subPath = contactMatch[2] || '';

    // GET /api/contacts/:id
    if (method === 'GET' && !subPath) {
      await getContactHandler(req, res, parsedUrl, contactId);
      return true;
    }

    // PUT /api/contacts/:id
    if (method === 'PUT' && !subPath) {
      await updateContact(req, res, parsedUrl, contactId);
      return true;
    }

    // DELETE /api/contacts/:id
    if (method === 'DELETE' && !subPath) {
      await deleteContactHandler(res, auth.userId, contactId);
      return true;
    }

    // POST /api/contacts/:id/important-dates
    if (method === 'POST' && subPath === '/important-dates') {
      await addImportantDate(req, res, parsedUrl, contactId);
      return true;
    }

    // POST /api/contacts/:id/interaction
    if (method === 'POST' && subPath === '/interaction') {
      await recordInteractionHandler(req, res, parsedUrl, contactId);
      return true;
    }

    // GET /api/contacts/:id/interactions - Interaction history
    if (method === 'GET' && subPath === '/interactions') {
      await getInteractionHistoryHandler(req, res, parsedUrl, contactId);
      return true;
    }

    // GET /api/contacts/:id/stats - Interaction statistics
    if (method === 'GET' && subPath === '/stats') {
      await getInteractionStatsHandler(req, res, parsedUrl, contactId);
      return true;
    }

    // GET /api/contacts/:id/topics - Topics to discuss
    if (method === 'GET' && subPath === '/topics') {
      await getTopicsHandler(req, res, parsedUrl, contactId);
      return true;
    }
  }

  // Routes with group ID
  const groupMatch = pathname.match(/^\/api\/contacts\/groups\/([^/]+)(\/.*)?$/);
  if (groupMatch) {
    const groupId = groupMatch[1];
    const subPath = groupMatch[2] || '';

    // PUT /api/contacts/groups/:id
    if (method === 'PUT' && !subPath) {
      await updateGroupHandler(req, res, parsedUrl, groupId);
      return true;
    }

    // DELETE /api/contacts/groups/:id
    if (method === 'DELETE' && !subPath) {
      await deleteGroupHandler(req, res, parsedUrl, groupId);
      return true;
    }
  }

  // 404 for unmatched contact routes
  sendError(res, 'Not found', 404);
  return true;
}

export default handleContactsRoutes;
