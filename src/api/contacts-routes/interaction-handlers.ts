/**
 * Contacts API: interaction recording, history, stats and topics handlers.
 * Extracted from contacts-routes.ts.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { getUserId, parseBody, sendError, sendJSON } from '../helpers.js';
import {
  recordInteraction,
  getInteractionHistory,
  getInteractionStats,
  getTopicsToDiscuss,
  type InteractionType,
} from '../../services/contacts/contact-relationship-service.js';

const log = createLogger({ module: 'ContactsAPI' });

export async function recordInteractionHandler(
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
export async function getInteractionHistoryHandler(
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
export async function getInteractionStatsHandler(
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
export async function getTopicsHandler(
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
