/**
 * What an edit to a contact group may change.
 *
 * PUT /api/contacts/groups/:id used to hand the whole request body to updateGroup, which
 * spread it over the stored group. Fields the server owns (`id`, `userId`, `createdAt`)
 * could therefore be overwritten from a request. Same shape as the contact edit fixed in
 * contact-edits.ts; same fix: only the fields a person edits get through.
 */

/** The fields a person edits; a group's id, owner and timestamps are the server's */
export const EDITABLE_GROUP_FIELDS = [
  'name',
  'description',
  'members',
  'defaultChannel',
  'occasionPreferences',
] as const;

type EditableGroupField = (typeof EDITABLE_GROUP_FIELDS)[number];

const CHANNELS = new Set(['email', 'phone', 'sms', 'text', 'in-person']);
const OCCASIONS = ['christmas', 'newYear', 'birthdays', 'thanksgiving', 'anniversaries'] as const;

/** A validator's verdict that the request isn't a valid edit (undefined means "remove it") */
const INVALID = Symbol('invalid');

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptied(value: unknown): boolean {
  return value === null || value === '';
}

function occasionPreferences(value: unknown): Record<string, boolean> | typeof INVALID {
  if (!isPlainObject(value)) return INVALID;
  const prefs: Record<string, boolean> = {};
  for (const occasion of OCCASIONS) {
    if (!(occasion in value)) continue;
    if (typeof value[occasion] !== 'boolean') return INVALID;
    prefs[occasion] = value[occasion] as boolean;
  }
  return prefs;
}

const VALIDATORS: Record<EditableGroupField, (value: unknown) => unknown> = {
  name: (v) => (typeof v === 'string' && v.trim() ? v.trim() : INVALID),
  description: (v) => (isEmptied(v) ? undefined : typeof v === 'string' ? v : INVALID),
  defaultChannel: (v) =>
    isEmptied(v) ? undefined : typeof v === 'string' && CHANNELS.has(v) ? v : INVALID,
  members: (v) =>
    Array.isArray(v) && v.every((m) => typeof m === 'string' && m.length > 0)
      ? Array.from(new Set(v as string[]))
      : INVALID,
  occasionPreferences,
};

/**
 * The edits in a request body, or null if it isn't an edit: not an object, a name that is
 * present but blank or not a string, or an editable field of the wrong type. Unknown keys
 * are dropped. An emptied description or channel (`''`, `null`) removes that field.
 */
export function groupEdits(body: unknown): Record<string, unknown> | null {
  if (!isPlainObject(body)) return null;
  const edits: Record<string, unknown> = {};
  for (const key of EDITABLE_GROUP_FIELDS) {
    if (!(key in body)) continue;
    const value = VALIDATORS[key](body[key]);
    if (value === INVALID) return null;
    edits[key] = value;
  }
  return edits;
}
