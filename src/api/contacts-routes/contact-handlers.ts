/**
 * Contacts API: contact CRUD, search and important-date handlers.
 * Extracted from contacts-routes.ts.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { getUserId, parseBody, sendError, sendJSON } from '../helpers.js';
import {
  getContacts,
  getContact,
  upsertContact,
  deleteContact,
  searchContacts,
} from '../../services/contacts/contact-relationship-service.js';

const log = createLogger({ module: 'ContactsAPI' });

export async function listContacts(
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

export async function searchContactsHandler(
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

export async function getContactHandler(
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

export async function createContact(
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

export async function updateContact(
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

/**
 * DELETE /api/contacts/:id
 *
 * SECURITY: Uses the verified auth userId only (never a query/body userId),
 * and the lookup is scoped to that user's own contacts.
 */
export async function deleteContactHandler(
  res: ServerResponse,
  userId: string,
  contactId: string
): Promise<void> {
  try {
    const deleted = await deleteContact(userId, contactId);
    if (!deleted) {
      sendError(res, 'Contact not found', 404);
      return;
    }
    sendJSON(res, { deleted: true });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to delete contact');
    sendError(res, "Couldn't remove that contact", 500);
  }
}

export async function addImportantDate(
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
