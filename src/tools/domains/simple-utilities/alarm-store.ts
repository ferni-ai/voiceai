/**
 * Where alarms are kept: Firestore when it is there, an in-memory copy when it is not.
 *
 * When Firestore is there but a save or delete fails, the change goes to the in-memory copy and
 * the write reports success, so the tool says the alarm was set, deleted or snoozed. The next
 * read is Firestore's, so a deleted alarm is still there and a new one is missing
 * (ALARM_WRITES_TRUTHFUL, #4262). Off: as before. On: the write rejects with the in-memory copy
 * untouched, and `alarmSaved` tells the tool the change was not made.
 *
 * @module simple-utilities/alarm-store
 */

import { flagOn } from '../../../config/env-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

export type AlarmRepeat = 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface Alarm {
  id: string;
  userId: string;
  label: string;
  time: string; // HH:MM in 24-hour format
  repeat: AlarmRepeat;
  customDays?: number[]; // 0-6 for Sunday-Saturday
  enabled: boolean;
  snoozedUntil?: number; // Timestamp if snoozed
  createdAt: number;
  updatedAt: number;
}

// In-memory fallback
const alarmStore = new Map<string, Alarm[]>();

/** An alarm change that did not reach Firestore (ALARM_WRITES_TRUTHFUL on). */
class AlarmNotSavedError extends Error {
  constructor() {
    super('ALARM_WRITES_TRUTHFUL: the alarm change was not saved');
    this.name = 'AlarmNotSavedError';
  }
}

/** With the flag on, a failed Firestore write rejects instead of falling back to memory. */
function failedWrite(userId: string, error: unknown, message: string): void {
  if (!flagOn('ALARM_WRITES_TRUTHFUL')) {
    log.warn({ error: String(error), userId }, message);
    return;
  }
  log.warn({ userId, reason: 'alarm_write_failed' }, 'ALARM_WRITES_TRUTHFUL');
  throw new AlarmNotSavedError();
}

/** Awaits an alarm write: false when it was not saved, true when it was. Other errors throw. */
export async function alarmSaved(write: Promise<unknown>): Promise<boolean> {
  try {
    await write;
    return true;
  } catch (error) {
    if (error instanceof AlarmNotSavedError) return false;
    throw error;
  }
}

export async function loadAlarms(userId: string): Promise<Alarm[]> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('alarms')
        .where('enabled', '==', true)
        .get();

      return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot): Alarm => ({
        id: doc.id,
        ...(doc.data() as Omit<Alarm, 'id'>),
      }));
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available for alarms');
  }

  // Fallback to in-memory
  return alarmStore.get(userId) || [];
}

export async function saveAlarm(userId: string, alarm: Alarm): Promise<Alarm> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const ref = db.collection('bogle_users').doc(userId).collection('alarms').doc(alarm.id);
      await ref.set(cleanForFirestore(alarm));
      log.info({ alarmId: alarm.id, userId }, 'Alarm saved to Firestore');
      return alarm;
    }
  } catch (error) {
    failedWrite(userId, error, 'Firestore not available, using in-memory');
  }

  // Fallback to in-memory
  const userAlarms = alarmStore.get(userId) || [];
  const existingIndex = userAlarms.findIndex((a) => a.id === alarm.id);
  if (existingIndex >= 0) {
    userAlarms[existingIndex] = alarm;
  } else {
    userAlarms.push(alarm);
  }
  alarmStore.set(userId, userAlarms);

  return alarm;
}

export async function deleteAlarm(userId: string, alarmId: string): Promise<boolean> {
  try {
    const db = getFirestoreDb();
    if (db) {
      await db.collection('bogle_users').doc(userId).collection('alarms').doc(alarmId).delete();
      log.info({ alarmId, userId }, 'Alarm deleted from Firestore');
      return true;
    }
  } catch (error) {
    failedWrite(userId, error, 'Firestore delete failed');
  }

  // Fallback to in-memory
  const userAlarms = alarmStore.get(userId) || [];
  const filtered = userAlarms.filter((a) => a.id !== alarmId);
  alarmStore.set(userId, filtered);
  return true;
}

/** Deletes the alarms one after another; returns how many were not deleted (0 with the flag off). */
export async function deleteAlarms(userId: string, alarms: Alarm[]): Promise<number> {
  return alarms.reduce(
    async (kept, alarm) =>
      (await kept) + ((await alarmSaved(deleteAlarm(userId, alarm.id))) ? 0 : 1),
    Promise.resolve(0)
  );
}
