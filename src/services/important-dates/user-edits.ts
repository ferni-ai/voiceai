/**
 * User-driven changes to important dates (web page and voice): create, edit,
 * change reminder offsets/channels, find by name. Every edit marks the date
 * as the user's (`source: 'user'`), so detection can't overwrite it.
 *
 * @module services/important-dates/user-edits
 */

import { failure, success, type Result } from '../../types/result.js';
import { parseStoredDate } from './date-math.js';
import { importantDateKey, normalizeDateKey } from './identity.js';
import { isKind, validChannels, validOffsets } from './record.js';
import {
  getImportantDate,
  listImportantDates,
  saveImportantDate,
  scheduleContextFor,
  upsertImportantDate,
  withSchedule,
} from './store.js';
import {
  ImportantDateError,
  type ImportantDateKind,
  type ImportantDatePatch,
  type ImportantDateRecord,
  type ReminderChannel,
} from './types.js';

type EditResult<T> = Promise<Result<T, ImportantDateError>>;

const invalid = (msg: string) => failure(new ImportantDateError('invalid_input', msg));

export interface NewUserDate {
  title: string;
  date: string;
  recurring: boolean;
  kind: ImportantDateKind;
  person?: string;
  personId?: string;
  reminderOffsets?: number[];
  remindersEnabled?: boolean;
  channels?: ReminderChannel[];
  personaId?: string;
  conversationId?: string;
}

/** Validate an unknown body as a patch (API boundary). */
export function parsePatch(body: unknown): Result<ImportantDatePatch, string> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const patch: ImportantDatePatch = {};
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 200) {
      return failure('title must be 1-200 characters');
    }
    patch.title = b.title.trim();
  }
  if (b.date !== undefined) {
    if (typeof b.date !== 'string' || !parseStoredDate(b.date)) {
      return failure('date must be YYYY-MM-DD or --MM-DD');
    }
    patch.date = b.date;
  }
  if (b.recurring !== undefined) {
    if (typeof b.recurring !== 'boolean') return failure('recurring must be true or false');
    patch.recurring = b.recurring;
  }
  if (b.kind !== undefined) {
    if (!isKind(b.kind)) return failure('unknown kind');
    patch.kind = b.kind;
  }
  if (b.remindersEnabled !== undefined) {
    if (typeof b.remindersEnabled !== 'boolean') return failure('remindersEnabled must be boolean');
    patch.remindersEnabled = b.remindersEnabled;
  }
  if (b.reminderOffsets !== undefined) {
    const offsets = validOffsets(b.reminderOffsets);
    if (!offsets) return failure('reminderOffsets must be up to 10 whole days (0-365)');
    patch.reminderOffsets = offsets;
  }
  if (b.channels !== undefined) {
    if (b.channels === null) patch.channels = null;
    else {
      const channels = validChannels(b.channels);
      if (!channels) return failure('channels must be conversation, push, sms or email');
      patch.channels = channels;
    }
  }
  return success(patch);
}

/** Apply a patch to a record (pure). Returns an error message when inconsistent. */
export function applyPatch(
  record: ImportantDateRecord,
  patch: ImportantDatePatch,
  now: string
): Result<ImportantDateRecord, string> {
  const next: ImportantDateRecord = {
    ...record,
    reminders: { ...record.reminders },
    source: 'user',
    confidence: 1,
    updatedAt: now,
    userEditedAt: now,
  };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.kind !== undefined) next.kind = patch.kind;
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.recurring !== undefined) next.recurring = patch.recurring;
  const parts = parseStoredDate(next.date);
  if (!parts) return failure('date must be YYYY-MM-DD or --MM-DD');
  if (!next.recurring && parts.year === undefined) return failure('a one-off date needs a year');
  if (next.date !== record.date || next.recurring !== record.recurring) next.sentReminderKeys = [];
  if (patch.remindersEnabled !== undefined) next.reminders.enabled = patch.remindersEnabled;
  if (patch.reminderOffsets !== undefined) {
    next.reminders.offsets = patch.reminderOffsets;
    next.reminders.custom = true;
    if (patch.reminderOffsets.length === 0) next.reminders.enabled = false;
  }
  if (patch.channels === null) delete next.channels;
  else if (patch.channels !== undefined) next.channels = patch.channels;
  return success(next);
}

export async function editImportantDate(
  userId: string,
  id: string,
  patch: ImportantDatePatch
): EditResult<ImportantDateRecord> {
  const current = await getImportantDate(userId, id);
  if (!current.success) return current;
  const ctx = await scheduleContextFor(userId);
  const applied = applyPatch(current.data, patch, ctx.now.toISOString());
  if (!applied.success) return invalid(applied.error);
  return saveImportantDate(userId, withSchedule(applied.data, ctx));
}

/** Create (or update, if the same key exists) a date the user told us about. */
export async function createUserDate(
  userId: string,
  input: NewUserDate
): EditResult<ImportantDateRecord> {
  const key = importantDateKey({ kind: input.kind, person: input.person, title: input.title });
  const upserted = await upsertImportantDate(userId, {
    key,
    title: input.title,
    date: input.date,
    recurring: input.recurring,
    kind: input.kind,
    source: 'user',
    sourceConversationIds: input.conversationId ? [input.conversationId] : [],
    confidence: 1,
    ...(input.personId ? { personId: input.personId } : {}),
    ...(input.personaId ? { personaId: input.personaId } : {}),
  });
  if (!upserted.success) return upserted;
  const { id, record } = upserted.data;
  const patch: ImportantDatePatch = {};
  if (input.reminderOffsets) patch.reminderOffsets = input.reminderOffsets;
  if (input.remindersEnabled !== undefined) patch.remindersEnabled = input.remindersEnabled;
  if (input.channels) patch.channels = input.channels;
  if (Object.keys(patch).length === 0 && record) return success(record);
  return editImportantDate(userId, id, patch);
}

/**
 * Find dates matching a spoken reference ("Sam's birthday", "the tax deadline").
 * Exact key/title matches first, then any date whose title or key contains all
 * the words.
 */
export async function findImportantDates(
  userId: string,
  query: string
): EditResult<ImportantDateRecord[]> {
  const listed = await listImportantDates(userId);
  if (!listed.success) return listed;
  const q = normalizeDateKey(query).replace(/\b(my|the|our|a|an|about|for|reminders?)\b/g, ' ');
  const words = q.split(' ').filter(Boolean);
  if (words.length === 0) return success([]);
  const hay = (r: ImportantDateRecord) => normalizeDateKey(`${r.title} ${r.key.replace(':', ' ')}`);
  const exact = listed.data.filter((r) => normalizeDateKey(r.title) === words.join(' '));
  if (exact.length > 0) return success(exact);
  return success(listed.data.filter((r) => words.every((w) => hay(r).includes(w))));
}
