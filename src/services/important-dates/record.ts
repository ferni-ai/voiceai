/**
 * Building and validating important-date records (no I/O).
 *
 * @module services/important-dates/record
 */

import { parseStoredDate } from './date-math.js';
import {
  DEFAULT_REMINDER_OFFSETS,
  IMPORTANT_DATE_KINDS,
  MAX_REMINDER_OFFSET_DAYS,
  REMINDER_CHANNELS,
  type DateReminderRule,
  type ImportantDateInput,
  type ImportantDateKind,
  type ImportantDateRecord,
  type ReminderChannel,
} from './types.js';

export function defaultReminderRule(kind: ImportantDateKind, subtype?: string): DateReminderRule {
  // Memorial days get a single, gentle day-of note rather than a countdown.
  const offsets = subtype === 'memorial' ? [0] : [...DEFAULT_REMINDER_OFFSETS[kind]];
  return { enabled: true, offsets, custom: false };
}

export function isKind(value: unknown): value is ImportantDateKind {
  return typeof value === 'string' && IMPORTANT_DATE_KINDS.includes(value as ImportantDateKind);
}

export function validOffsets(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const out = new Set<number>();
  for (const v of value) {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > MAX_REMINDER_OFFSET_DAYS) {
      return null;
    }
    out.add(v as number);
  }
  return [...out].sort((a, b) => b - a);
}

export function validChannels(value: unknown): ReminderChannel[] | null {
  if (!Array.isArray(value)) return null;
  const out: ReminderChannel[] = [];
  for (const v of value) {
    if (!REMINDER_CHANNELS.includes(v as ReminderChannel)) return null;
    if (!out.includes(v as ReminderChannel)) out.push(v as ReminderChannel);
  }
  return out;
}

/** Returns an error message, or null when the input is usable. */
export function validateInput(input: ImportantDateInput): string | null {
  if (typeof input.key !== 'string' || !input.key.trim()) return 'key is required';
  if (typeof input.title !== 'string' || !input.title.trim()) return 'title is required';
  if (input.title.length > 200) return 'title is too long';
  if (!isKind(input.kind)) return 'unknown kind';
  if (input.source !== 'detected' && input.source !== 'user') return 'unknown source';
  if (typeof input.recurring !== 'boolean') return 'recurring must be true or false';
  const parts = typeof input.date === 'string' ? parseStoredDate(input.date) : null;
  if (!parts) return 'date must be YYYY-MM-DD or --MM-DD';
  if (!input.recurring && parts.year === undefined) return 'a one-off date needs a year';
  if (!Array.isArray(input.sourceConversationIds)) return 'sourceConversationIds must be a list';
  if (typeof input.confidence !== 'number' || Number.isNaN(input.confidence)) {
    return 'confidence must be a number';
  }
  return null;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function cleanIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
}

export function unionIds(a: readonly string[], b: readonly string[]): string[] {
  return cleanIds([...a, ...b]);
}

/** A fresh record from input (scheduling fields are filled in by the caller). */
export function newRecord(id: string, input: ImportantDateInput, now: string): ImportantDateRecord {
  return {
    id,
    key: input.key.trim(),
    title: input.title.trim(),
    date: input.date,
    recurring: input.recurring,
    ...(input.personId ? { personId: input.personId } : {}),
    kind: input.kind,
    ...(input.subtype ? { subtype: input.subtype } : {}),
    source: input.source,
    sourceConversationIds: cleanIds(input.sourceConversationIds),
    confidence: input.source === 'user' ? 1 : clamp01(input.confidence),
    ...(input.personaId ? { personaId: input.personaId } : {}),
    reminders: defaultReminderRule(input.kind, input.subtype),
    nextReminderAt: null,
    nextReminderKey: null,
    sentReminderKeys: [],
    createdAt: now,
    updatedAt: now,
    ...(input.source === 'user' ? { userEditedAt: now } : {}),
  };
}

/**
 * Merge an upsert into an existing record. The caller has already handled the
 * "detected never overwrites user" case.
 */
export function mergeRecord(
  existing: ImportantDateRecord,
  input: ImportantDateInput,
  now: string
): ImportantDateRecord {
  const kindChanged = existing.kind !== input.kind;
  const reminders =
    existing.reminders.custom || !kindChanged
      ? existing.reminders
      : defaultReminderRule(input.kind, input.subtype ?? existing.subtype);
  const isUser = input.source === 'user';
  const dateChanged = existing.date !== input.date || existing.recurring !== input.recurring;
  return {
    ...existing,
    key: input.key.trim(),
    title: input.title.trim(),
    date: input.date,
    recurring: input.recurring,
    ...(input.personId ? { personId: input.personId } : {}),
    kind: input.kind,
    ...(input.subtype ? { subtype: input.subtype } : {}),
    source: isUser ? 'user' : existing.source,
    sourceConversationIds: unionIds(existing.sourceConversationIds, input.sourceConversationIds),
    confidence: isUser ? 1 : Math.max(existing.confidence, clamp01(input.confidence)),
    ...(input.personaId && !existing.personaId ? { personaId: input.personaId } : {}),
    reminders,
    // A moved date starts its reminder history afresh.
    sentReminderKeys: dateChanged ? [] : existing.sentReminderKeys,
    updatedAt: now,
    ...(isUser ? { userEditedAt: now } : {}),
  };
}

/** Read a stored document defensively. */
export function recordFromDoc(
  id: string,
  data: Record<string, unknown>
): ImportantDateRecord | null {
  if (typeof data.date !== 'string' || !parseStoredDate(data.date)) return null;
  const kind = isKind(data.kind) ? data.kind : 'other';
  const r = (data.reminders ?? {}) as Partial<DateReminderRule>;
  const subtype = typeof data.subtype === 'string' ? data.subtype : undefined;
  const fallback = defaultReminderRule(kind, subtype);
  const channels = data.channels === undefined ? null : validChannels(data.channels);
  return {
    id,
    key: typeof data.key === 'string' ? data.key : id,
    title: typeof data.title === 'string' ? data.title : 'Important date',
    date: data.date,
    recurring: data.recurring === true,
    ...(typeof data.personId === 'string' ? { personId: data.personId } : {}),
    kind,
    ...(subtype ? { subtype } : {}),
    source: data.source === 'user' ? 'user' : 'detected',
    sourceConversationIds: Array.isArray(data.sourceConversationIds)
      ? cleanIds(data.sourceConversationIds as string[])
      : [],
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
    ...(typeof data.personaId === 'string' ? { personaId: data.personaId } : {}),
    reminders: {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : fallback.enabled,
      offsets: validOffsets(r.offsets) ?? fallback.offsets,
      custom: r.custom === true,
    },
    ...(channels ? { channels } : {}),
    nextReminderAt: typeof data.nextReminderAt === 'string' ? data.nextReminderAt : null,
    nextReminderKey: typeof data.nextReminderKey === 'string' ? data.nextReminderKey : null,
    sentReminderKeys: Array.isArray(data.sentReminderKeys)
      ? (data.sentReminderKeys as unknown[]).filter((k): k is string => typeof k === 'string')
      : [],
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date(0).toISOString(),
    ...(typeof data.userEditedAt === 'string' ? { userEditedAt: data.userEditedAt } : {}),
  };
}
