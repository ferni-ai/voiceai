/**
 * Reminder settings: channels, quiet hours, time zone, send time.
 *
 * Stored at `bogle_users/{uid}/reminder_settings/default`. Missing fields fall
 * back to DEFAULT_REMINDER_SETTINGS; a missing time zone falls back to the
 * profile's (`contactInfo.timezone` / `timezone`) and then DEFAULT_TIME_ZONE.
 *
 * @module services/important-dates/settings
 */

import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { failure, success, type Result } from '../../types/result.js';
import { isValidTimeZone, parseClock } from './date-math.js';
import {
  DEFAULT_REMINDER_SETTINGS,
  DEFAULT_TIME_ZONE,
  ImportantDateError,
  REMINDER_CHANNELS,
  type QuietHours,
  type ReminderChannel,
  type ReminderSettings,
} from './types.js';

const log = createLogger({ module: 'important-dates:settings' });

export const SETTINGS_COLLECTION = 'reminder_settings';
export const SETTINGS_DOC = 'default';

export function settingsRef(db: Firestore, userId: string) {
  return db.collection('bogle_users').doc(userId).collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Normalise whatever is stored into a full settings object. */
export function settingsFromDoc(data: unknown): ReminderSettings {
  const d = asRecord(data);
  const ch = asRecord(d.channels);
  const channels = { ...DEFAULT_REMINDER_SETTINGS.channels };
  for (const c of REMINDER_CHANNELS) {
    if (typeof ch[c] === 'boolean') channels[c] = ch[c] as boolean;
  }
  const qh = asRecord(d.quietHours);
  const quietHours: QuietHours = {
    start:
      typeof qh.start === 'string' && parseClock(qh.start) !== null
        ? qh.start
        : DEFAULT_REMINDER_SETTINGS.quietHours.start,
    end:
      typeof qh.end === 'string' && parseClock(qh.end) !== null
        ? qh.end
        : DEFAULT_REMINDER_SETTINGS.quietHours.end,
  };
  const timeZone =
    typeof d.timeZone === 'string' && isValidTimeZone(d.timeZone) ? d.timeZone : undefined;
  const sendTime =
    typeof d.sendTime === 'string' && parseClock(d.sendTime) !== null
      ? d.sendTime
      : DEFAULT_REMINDER_SETTINGS.sendTime;
  return {
    channels,
    quietHours,
    ...(timeZone ? { timeZone } : {}),
    sendTime,
    ...(typeof d.updatedAt === 'string' ? { updatedAt: d.updatedAt } : {}),
  };
}

export async function getReminderSettings(userId: string): Promise<ReminderSettings> {
  const db = getFirestoreDb();
  if (!db) return { ...DEFAULT_REMINDER_SETTINGS };
  try {
    const snap = await settingsRef(db, userId).get();
    return settingsFromDoc(snap.exists ? snap.data() : undefined);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not read reminder settings');
    return { ...DEFAULT_REMINDER_SETTINGS };
  }
}

/** The profile's time zone, if the user has one on file. */
async function profileTimeZone(db: Firestore, userId: string): Promise<string | undefined> {
  try {
    const snap = await db.collection('bogle_users').doc(userId).get();
    const data = asRecord(snap.exists ? snap.data() : undefined);
    const candidates = [asRecord(data.contactInfo).timezone, data.timezone, data.timeZone];
    return candidates.find((tz): tz is string => typeof tz === 'string' && isValidTimeZone(tz));
  } catch {
    return undefined;
  }
}

/** The time zone reminders are computed in for this user. */
export async function resolveTimeZone(
  userId: string,
  settings?: ReminderSettings
): Promise<string> {
  const s = settings ?? (await getReminderSettings(userId));
  if (s.timeZone) return s.timeZone;
  const db = getFirestoreDb();
  return (db && (await profileTimeZone(db, userId))) || DEFAULT_TIME_ZONE;
}

export interface ReminderSettingsPatch {
  channels?: Partial<Record<ReminderChannel, boolean>>;
  quietHours?: Partial<QuietHours>;
  timeZone?: string | null;
  sendTime?: string;
}

/** Validate a settings patch from the API. */
export function validateSettingsPatch(input: unknown): Result<ReminderSettingsPatch, string> {
  const body = asRecord(input);
  const patch: ReminderSettingsPatch = {};
  if (body.channels !== undefined) {
    const ch = asRecord(body.channels);
    const out: Partial<Record<ReminderChannel, boolean>> = {};
    for (const [k, v] of Object.entries(ch)) {
      if (!REMINDER_CHANNELS.includes(k as ReminderChannel)) return failure(`unknown channel ${k}`);
      if (typeof v !== 'boolean') return failure(`channel ${k} must be true or false`);
      out[k as ReminderChannel] = v;
    }
    patch.channels = out;
  }
  if (body.quietHours !== undefined) {
    const qh = asRecord(body.quietHours);
    const out: Partial<QuietHours> = {};
    for (const k of ['start', 'end'] as const) {
      if (qh[k] === undefined) continue;
      if (typeof qh[k] !== 'string' || parseClock(qh[k] as string) === null) {
        return failure(`quietHours.${k} must be HH:MM`);
      }
      out[k] = qh[k] as string;
    }
    patch.quietHours = out;
  }
  if (body.timeZone !== undefined) {
    if (
      body.timeZone !== null &&
      (typeof body.timeZone !== 'string' || !isValidTimeZone(body.timeZone))
    ) {
      return failure('timeZone must be an IANA time zone');
    }
    patch.timeZone = body.timeZone as string | null;
  }
  if (body.sendTime !== undefined) {
    if (typeof body.sendTime !== 'string' || parseClock(body.sendTime) === null) {
      return failure('sendTime must be HH:MM');
    }
    patch.sendTime = body.sendTime;
  }
  return success(patch);
}

/** Apply a validated patch and return the resulting settings. */
export async function updateReminderSettings(
  userId: string,
  patch: ReminderSettingsPatch
): Promise<Result<ReminderSettings, ImportantDateError>> {
  const db = getFirestoreDb();
  if (!db) return failure(new ImportantDateError('storage_unavailable', 'Firestore not available'));
  try {
    const current = await getReminderSettings(userId);
    const next: ReminderSettings = {
      channels: { ...current.channels, ...(patch.channels ?? {}) },
      quietHours: { ...current.quietHours, ...(patch.quietHours ?? {}) },
      sendTime: patch.sendTime ?? current.sendTime,
      updatedAt: new Date().toISOString(),
    };
    const tz = patch.timeZone === undefined ? current.timeZone : patch.timeZone;
    if (tz) next.timeZone = tz;
    await settingsRef(db, userId).set(next);
    log.info({ userId, channels: next.channels }, 'Reminder settings saved');
    return success(next);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not save reminder settings');
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}
