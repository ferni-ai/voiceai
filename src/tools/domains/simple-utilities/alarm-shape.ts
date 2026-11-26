/**
 * ALARM_ONE_SHAPE (#4316): how a stored alarm document reads as an Alarm.
 *
 * The chat path used to save its own document (`active: true`, the time as said, `recurring`, no
 * `enabled`), which the store's `enabled == true` query never returned. With the flag on, chat
 * saves through the voice tool's path (alarm-tools.ts createAlarm), and the store reads every
 * alarm document, so the old chat documents still in Firestore read as set alarms here, on read.
 * Nothing is rewritten in place: a document only changes when its owner snoozes it.
 *
 * @module simple-utilities/alarm-shape
 */

import { flagOn, type Env } from '../../../config/env-flag.js';

import type { Alarm, AlarmRepeat } from './alarm-tools.js';

export const alarmOneShape = (env?: Env): boolean => flagOn('ALARM_ONE_SHAPE', env);

/** The voice tool's parsers, passed in so this module needs nothing else from alarm-tools. */
export interface AlarmParsers {
  time: (input: string) => { time: string; error?: string };
  repeat: (input: string) => { repeat: AlarmRepeat; customDays?: number[]; error?: string };
}

const HHMM = /^\d{2}:\d{2}$/;

/** A string field, or undefined. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/**
 * A document in chat's old shape (no `enabled`) as the Alarm the voice tool would have saved: set
 * unless `active` is false, the time as HH:MM, the repeat from `recurring`. Null when it is off or
 * its time can't be read, so it stays unlisted, as before.
 */
function fromOldShape(
  id: string,
  data: Record<string, unknown>,
  parse: AlarmParsers
): Alarm | null {
  const raw = str(data.time);
  if (data.active === false || raw === undefined) return null;
  const time = HHMM.test(raw) ? { time: raw } : parse.time(raw);
  if (time.error) return null;
  const repeat = parse.repeat(str(data.recurring) ?? 'once');
  return {
    id,
    userId: str(data.userId) ?? '',
    label: str(data.label) || 'Alarm',
    time: time.time,
    repeat: repeat.error ? 'once' : repeat.repeat,
    customDays: repeat.error ? undefined : repeat.customDays,
    enabled: true,
    snoozedUntil: num(data.snoozedUntil),
    createdAt: num(data.createdAt) ?? 0,
    updatedAt: num(data.updatedAt) ?? 0,
  };
}

/** A document with `enabled: true`, read as main's `enabled == true` query reads it. */
const isSet = (doc: Record<string, unknown>): doc is Record<string, unknown> & Alarm =>
  doc.enabled === true;

/**
 * The set alarms among a user's stored documents. A document with `enabled` reads as the store
 * always read it; one without is read by fromOldShape.
 */
export function storedAlarms(
  docs: ReadonlyArray<{ id: string; data: () => Record<string, unknown> }>,
  parse: AlarmParsers
): Alarm[] {
  return docs.flatMap((doc) => {
    const data = doc.data();
    if (typeof data.enabled !== 'boolean') return fromOldShape(doc.id, data, parse) ?? [];
    const stored = { id: doc.id, ...data };
    return isSet(stored) ? [stored] : [];
  });
}
