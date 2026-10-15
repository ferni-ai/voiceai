/**
 * GET /api/contacts/insights and /api/contacts/nudges, and the one answer every people
 * route gives when a contact store can't be read.
 *
 * Both stores used to swallow a failed Firestore read and return [], so a failure showed
 * as "nobody here" and "no suggestions". These routes answer 503 instead, which the
 * panels show as "Something unexpected happened. Want to try again?".
 *
 * @module api/contact-overview-handlers
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  getRelationshipInsights,
  loadContacts,
} from '../services/contacts/contact-relationship-service.js';
import { buildNudgeContext } from '../services/contacts/outreach-nudges.js';
import { PeopleUnavailableError } from '../services/contacts/people-list.js';
import { buildRelationshipInsightsView } from '../services/contacts/relationship-insights-view.js';
import { getUserId, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'ContactsAPI' });

/** 503 when the contacts couldn't be read, the route's own 500 for anything else */
export function sendContactsError(res: ServerResponse, error: unknown, message: string): void {
  if (error instanceof PeopleUnavailableError) {
    log.error({ error: error.reason }, 'Contacts could not be read');
    res.setHeader('Retry-After', '30');
    return sendError(res, 'Contacts are unavailable right now', 503);
  }
  log.error({ error: String(error) }, message);
  sendError(res, message, 500);
}

/** This user's contact_relationships, or PeopleUnavailableError */
async function readableContacts(userId: string) {
  const loaded = await loadContacts(userId);
  if (!loaded.ok) throw new PeopleUnavailableError(loaded.error);
  return loaded.contacts;
}

export async function getInsights(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) return sendError(res, 'Unauthorized', 401);

  try {
    // Exactly what the web Relationship Insights dashboard reads.
    const [contacts, insights] = await Promise.all([
      readableContacts(userId),
      getRelationshipInsights(userId),
    ]);
    sendJSON(res, buildRelationshipInsightsView(contacts, insights));
  } catch (error) {
    sendContactsError(res, error, 'Failed to get insights');
  }
}

export async function getNudges(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) return sendError(res, 'Unauthorized', 401);

  try {
    // The nudges read the same store; a failed read must not look like "no suggestions"
    await readableContacts(userId);
    const nudgeContext = await buildNudgeContext(userId);
    sendJSON(res, {
      nudges: nudgeContext.nudges,
      summary: nudgeContext.summary,
      upcomingDates: nudgeContext.upcomingDates,
      upcomingHolidays: nudgeContext.upcomingHolidays,
    });
  } catch (error) {
    sendContactsError(res, error, 'Failed to get outreach suggestions');
  }
}
