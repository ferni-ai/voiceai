/**
 * Contacts API: group, insight and nudge handlers.
 * Extracted from contacts-routes.ts.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { getUserId, parseBody, sendError, sendJSON } from '../helpers.js';
import {
  getContactsNeedingAttention,
  getRelationshipInsights,
} from '../../services/contacts/contact-relationship-service.js';
import {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
} from '../../services/contacts/contact-groups.js';
import {
  buildNudgeContext,
  getOverdueFrequentContacts,
} from '../../services/contacts/outreach-nudges.js';

const log = createLogger({ module: 'ContactsAPI' });

// Groups
export async function listGroups(
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

export async function createGroupHandler(
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

export async function updateGroupHandler(
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

export async function deleteGroupHandler(
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
export async function getInsights(
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

export async function getNudges(
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
