/**
 * What an edit to a contact may change.
 *
 * PUT /api/contacts/:id used to spread the whole request body over the stored contact, so
 * a client could rewrite anything: its owner (`userId`, which moved the contact into
 * someone else's list), its scores, its history. And because the edit form left out
 * fields it had emptied, a phone number or a note could never be removed.
 */

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
