/**
 * DELETE /api/contacts/:id: the panel's Remove button.
 *
 * Removes the person from both contact stores (services/contacts/person-removal.ts).
 * Someone this user doesn't have answers 404, whoever else has them.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { removePerson } from '../services/contacts/person-removal.js';
import { getUserId, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'ContactsAPI' });

export async function deletePersonHandler(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  contactId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) return sendError(res, 'Unauthorized', 401);

  try {
    const removed = await removePerson(userId, contactId);
    if (!removed) return sendError(res, 'Contact not found', 404);
    sendJSON(res, { deleted: true, ...removed });
  } catch (error) {
    log.error({ error: String(error), userId, contactId }, 'Failed to remove contact');
    sendError(res, 'Failed to remove contact', 500);
  }
}
