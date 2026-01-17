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
 * - GET /api/contacts/groups - List groups
 * - POST /api/contacts/groups - Create group
 * - GET /api/contacts/nudges - Get outreach suggestions
 *
 * @module api/contacts-routes
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
  getContacts,
  getContact,
  upsertContact,
  recordInteraction,
  getContactsNeedingAttention,
  getRelationshipInsights,
  searchContacts,
  getInteractionHistory,
  getInteractionStats,
  getTopicsToDiscuss,
  type InteractionType,
} from '../services/contacts/contact-relationship-service.js';
import {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
} from '../services/contacts/contact-groups.js';
import {
  buildNudgeContext,
  getOverdueFrequentContacts,
} from '../services/contacts/outreach-nudges.js';

const log = createLogger({ module: 'ContactsAPI' });

// ============================================================================
// HANDLER FUNCTIONS
// ============================================================================

async function listContacts(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const contacts = await getContacts(userId);
    sendJSON(res, { contacts, count: contacts.length });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list contacts');
    sendError(res, 'Failed to load contacts', 500);
  }
}

async function searchContactsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const query = parsedUrl.searchParams.get('q') || '';
  if (!query || query.length < 2) {
    sendError(res, 'Search query must be at least 2 characters', 400);
    return;
  }

  try {
    const matches = await searchContacts(userId, query);
    sendJSON(res, { contacts: matches });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to search contacts');
    sendError(res, 'Search failed', 500);
  }
}

async function getContactHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const contact = await getContact(userId, contactId);
    if (!contact) {
      sendError(res, 'Contact not found', 404);
      return;
    }
    sendJSON(res, { contact });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get contact');
    sendError(res, 'Failed to load contact', 500);
  }
}

async function createContact(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<Record<string, unknown>>(req);
  if (body === null || body === undefined) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  const name = body.name as string | undefined;
  const email = body.email as string | undefined;
  const phone = body.phone as string | undefined;

  if (!name) {
    sendError(res, 'Name is required', 400);
    return;
  }

  try {
    const contactId = email || phone || `manual_${Date.now()}`;
    const contact = await upsertContact(userId, {
      name,
      contactId,
      email,
      phone,
      relationship: body.relationship as
        | 'family'
        | 'friend'
        | 'colleague'
        | 'acquaintance'
        | 'professional'
        | 'other'
        | undefined,
      notes: body.notes as string | undefined,
      importantDates: body.importantDates as
        | Array<{
            date: string;
            type: 'birthday' | 'anniversary' | 'memorial' | 'custom';
            label?: string;
          }>
        | undefined,
    });

    log.info({ userId, contactId: contact.id, name }, 'Contact created');
    sendJSON(res, { contact }, 201);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create contact');
    sendError(res, 'Failed to create contact', 500);
  }
}

async function updateContact(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<Record<string, unknown>>(req);
  if (body === null || body === undefined) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  try {
    const existing = await getContact(userId, contactId);
    if (!existing) {
      sendError(res, 'Contact not found', 404);
      return;
    }

    const contact = await upsertContact(userId, {
      ...existing,
      ...body,
      id: existing.id,
      contactId: existing.contactId,
    } as Parameters<typeof upsertContact>[1]);

    log.info({ userId, contactId: contact.id }, 'Contact updated');
    sendJSON(res, { contact });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update contact');
    sendError(res, 'Failed to update contact', 500);
  }
}

async function addImportantDate(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<{ date?: string; type?: string; label?: string }>(req);
  if (body === null || body === undefined) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  const { date, type, label } = body;

  if (!date || !type) {
    sendError(res, 'Date and type are required', 400);
    return;
  }

  // Validate date format (MM-DD or YYYY-MM-DD)
  const dateRegex = /^(\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/;
  if (!dateRegex.test(date)) {
    sendError(res, 'Date must be in MM-DD or YYYY-MM-DD format', 400);
    return;
  }

  // Validate type
  const validTypes = ['birthday', 'anniversary', 'memorial', 'custom'];
  if (!validTypes.includes(type)) {
    sendError(res, 'Type must be birthday, anniversary, memorial, or custom', 400);
    return;
  }

  try {
    const contact = await getContact(userId, contactId);
    if (!contact) {
      sendError(res, 'Contact not found', 404);
      return;
    }

    const existingDates = contact.importantDates || [];
    const newDate = {
      date,
      type: type as 'birthday' | 'anniversary' | 'memorial' | 'custom',
      label: label || type,
    };

    const updated = await upsertContact(userId, {
      ...contact,
      importantDates: [...existingDates, newDate],
    });

    log.info({ userId, contactId, dateType: type }, 'Important date added');
    sendJSON(res, { contact: updated });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add important date');
    sendError(res, 'Failed to add date', 500);
  }
}

async function recordInteractionHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<Record<string, unknown>>(req);
  if (body === null || body === undefined) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  try {
    // Map UI-friendly types to InteractionType
    const typeMap: Record<string, string> = {
      gift: 'gift_given',
      card_letter: 'card_sent',
      social_media: 'social_dm',
      in_person: 'visit',
      shared_activity: 'activity',
      financial: 'split_bill',
    };
    const requestType = (body.type as string) || 'other';
    const mappedType = typeMap[requestType] || requestType;

    const interaction = {
      contactId,
      userId,
      date: new Date(),
      type: mappedType as
        | 'email'
        | 'call'
        | 'text'
        | 'meeting'
        | 'video_call'
        | 'voice_message'
        | 'instant_message'
        | 'social_like'
        | 'social_comment'
        | 'social_dm'
        | 'social_tag'
        | 'social_share'
        | 'hangout'
        | 'dinner'
        | 'party'
        | 'activity'
        | 'trip'
        | 'visit'
        | 'gift_given'
        | 'gift_received'
        | 'card_sent'
        | 'card_received'
        | 'thank_you_sent'
        | 'thank_you_received'
        | 'money_lent'
        | 'money_borrowed'
        | 'money_repaid'
        | 'split_bill'
        | 'attended_event'
        | 'milestone_shared'
        | 'photo_shared'
        | 'recommendation'
        | 'introduction'
        | 'favor_done'
        | 'favor_received'
        | 'other',
      direction: (body.direction as 'inbound' | 'outbound') || 'outbound',
      summary: body.summary as string | undefined,
      topics: body.topics as string[] | undefined,
      sentiment: body.sentiment as 'positive' | 'neutral' | 'negative' | undefined,
    };

    await recordInteraction(userId, interaction);

    sendJSON(res, { recorded: true, interaction });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record interaction');
    sendError(res, 'Failed to record interaction', 500);
  }
}

/**
 * Get interaction history for a contact
 *
 * "Better Than Human" - Perfect memory of every interaction
 */
async function getInteractionHistoryHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
  const type = parsedUrl.searchParams.get('type') as InteractionType | null;
  const sinceParam = parsedUrl.searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : undefined;

  try {
    const history = await getInteractionHistory(userId, contactId, {
      limit,
      type: type || undefined,
      since,
    });

    sendJSON(res, {
      interactions: history,
      count: history.length,
      contactId,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get interaction history');
    sendError(res, 'Failed to load interaction history', 500);
  }
}

/**
 * Get interaction statistics for a contact
 *
 * "Better Than Human" - Pattern recognition no human can match
 */
async function getInteractionStatsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const stats = await getInteractionStats(userId, contactId);
    sendJSON(res, { stats, contactId });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get interaction stats');
    sendError(res, 'Failed to load interaction statistics', 500);
  }
}

/**
 * Get topics to bring up in conversation
 *
 * "Better Than Human" - Remember what matters to them
 */
async function getTopicsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const topics = await getTopicsToDiscuss(userId, contactId);
    sendJSON(res, { topics, contactId });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get topics');
    sendError(res, 'Failed to load topics', 500);
  }
}

// Groups
async function listGroups(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const groups = await getGroups(userId);
    sendJSON(res, { groups });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list groups');
    sendError(res, 'Failed to load groups', 500);
  }
}

async function createGroupHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<{
    name?: string;
    description?: string;
    members?: string[];
  }>(req);
  if (body === null || body === undefined) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  const { name, description, members } = body;

  if (!name) {
    sendError(res, 'Group name is required', 400);
    return;
  }

  try {
    const group = await createGroup(userId, {
      name,
      description,
      members: members || [],
    });

    log.info({ userId, groupId: group.id, name }, 'Contact group created');
    sendJSON(res, { group }, 201);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create group');
    sendError(res, 'Failed to create group', 500);
  }
}

async function updateGroupHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  groupId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const body = await parseBody<Record<string, unknown>>(req);
  if (body === null || body === undefined) {
    sendError(res, 'Invalid request body', 400);
    return;
  }

  try {
    const group = await updateGroup(userId, groupId, body as Parameters<typeof updateGroup>[2]);
    if (group === null || group === undefined) {
      sendError(res, 'Group not found', 404);
      return;
    }
    sendJSON(res, { group });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update group');
    sendError(res, 'Failed to update group', 500);
  }
}

async function deleteGroupHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  groupId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    // Check if group exists first
    const existing = await getGroup(userId, groupId);
    if (!existing) {
      sendError(res, 'Group not found', 404);
      return;
    }
    await deleteGroup(userId, groupId);
    sendJSON(res, { deleted: true });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to delete group');
    sendError(res, 'Failed to delete group', 500);
  }
}

// Insights & Nudges
async function getInsights(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const [insights, needsAttention, overdueFrequent] = await Promise.all([
      getRelationshipInsights(userId),
      getContactsNeedingAttention(userId, 5),
      getOverdueFrequentContacts(userId),
    ]);

    sendJSON(res, {
      insights,
      needsAttention: needsAttention.map((c) => ({
        id: c.id,
        name: c.name,
        daysSinceContact: Math.floor(
          (Date.now() - new Date(c.lastInteraction).getTime()) / (1000 * 60 * 60 * 24)
        ),
      })),
      overdueFrequent,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get insights');
    sendError(res, 'Failed to get insights', 500);
  }
}

async function getNudges(req: IncomingMessage, res: ServerResponse, parsedUrl: URL): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const nudgeContext = await buildNudgeContext(userId);

    sendJSON(res, {
      nudges: nudgeContext.nudges,
      summary: nudgeContext.summary,
      upcomingDates: nudgeContext.upcomingDates,
      upcomingHolidays: nudgeContext.upcomingHolidays,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get nudges');
    sendError(res, 'Failed to get outreach suggestions', 500);
  }
}

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
