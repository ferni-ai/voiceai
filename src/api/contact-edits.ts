/**
 * What an edit to a contact may change.
 *
 * PUT /api/contacts/:id used to spread the whole request body over the stored contact, so
 * a client could rewrite anything: its owner (`userId`, which moved the contact into
 * someone else's list), its scores, its history. And because the edit form left out
 * fields it had emptied, a phone number or a note could never be removed.
 *
 * The photo is a data URL stored inside the contact's Firestore document, which holds
 * at most 1 MiB. A bigger photo failed that write, the error was logged, and the client
 * still got a 200 while the photo lived only in one instance's cache. Now an oversized
 * photo is refused with a 413 before anything is written.
 */

import type { ServerResponse } from 'http';
import { sendError } from './helpers.js';

/** The fields a person edits; who owns a contact, its scores and its history are the server's */
export const EDITABLE_CONTACT_FIELDS = [
  'name',
  'relationship',
  'email',
  'phone',
  'howWeMet',
  'notes',
  'interests',
  'sensitiveTopics',
  'preferredChannel',
  'bestTimeToReach',
  'photo',
] as const;

/**
 * The edits in a request body, or null if it isn't an edit (not an object, or a name
 * that is missing or blank). An empty value (`''`, `null`, `[]`) removes that field:
 * it becomes undefined, which the contact store drops when it saves.
 */
export function contactEdits(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if ('name' in input && (typeof input.name !== 'string' || !input.name.trim())) return null;
  const edits: Record<string, unknown> = {};
  for (const key of EDITABLE_CONTACT_FIELDS) {
    if (!(key in input)) continue;
    const value = input[key];
    const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
    edits[key] = empty ? undefined : value;
  }
  return edits;
}

/** Longest photo data URL accepted, leaving room in the 1 MiB document for the rest. */
export const MAX_CONTACT_PHOTO_CHARS = 700 * 1024;

/**
 * True when the edits can be saved. Otherwise answers the request (400 for a body that
 * is not an edit, 413 for a photo over MAX_CONTACT_PHOTO_CHARS) and returns false.
 */
export function acceptedContactEdits(
  res: ServerResponse,
  edits: Record<string, unknown> | null
): edits is Record<string, unknown> {
  if (!edits) {
    sendError(res, 'Invalid request body', 400);
    return false;
  }
  const { photo } = edits;
  if (typeof photo === 'string' && photo.length > MAX_CONTACT_PHOTO_CHARS) {
    sendError(res, 'That photo is too large. Please choose a smaller one.', 413);
    return false;
  }
  return true;
}
