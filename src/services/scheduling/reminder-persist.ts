/**
 * The Firestore writes behind "Saved" and "cancelled" (REMINDER_WRITES_TRUTHFUL).
 *
 * Reminders are delivered by a job that reads Firestore, so a reminder that
 * only reached this process's memory never goes off, and one whose cancel never
 * reached Firestore still does. Before this flag, both writes swallowed a
 * failure and setReminder / cancelReminder still said "Saved" or "cancelled".
 *
 * Each write records what happened to the reminder ('saved', 'no-db' or
 * 'failed'). With the flag on, the scheduler keeps a reminder only when its
 * write is saved, and the tools speak from that record. Off, both writes run
 * and log exactly as before and nothing reads the record.
 */
import { flagOn } from '../../config/env-flag.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import { onReminderChange } from '../data-layer/hooks/index.js';
import type { ScheduledReminder } from './reminder-scheduler.js';

/** What the last Firestore write did. 'no-db': there was no database, memory only. */
export type ReminderWrite = 'saved' | 'no-db' | 'failed';

const lastWrite = new WeakMap<ScheduledReminder, ReminderWrite>();

export function reminderWritesTruthfulOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('REMINDER_WRITES_TRUTHFUL', env);
}

/** The last write for this reminder object, if this process made one. */
export function reminderWrite(reminder: ScheduledReminder): ReminderWrite | undefined {
  return lastWrite.get(reminder);
}

/** The slice of Firestore these writes use; the scheduler hands in its database. */
interface ReminderDocRef {
  set(data: Record<string, unknown>): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
}
interface ReminderFirestore {
  collection(name: string): {
    doc(id: string): { collection(name: string): { doc(id: string): ReminderDocRef } };
  };
}
type ReminderDb = () => Promise<ReminderFirestore | null>;

async function reminderDoc(
  db: ReminderDb,
  userId: string,
  id: string
): Promise<ReminderDocRef | null> {
  const firestore = await db();
  return firestore?.collection('bogle_users').doc(userId).collection('reminders').doc(id) ?? null;
}

/** Persist a new reminder for cross-session durability, then index it to semantic memory. */
export async function saveReminderDoc(
  reminder: ScheduledReminder,
  db: ReminderDb
): Promise<ReminderWrite> {
  let write: ReminderWrite = 'no-db';
  try {
    const doc = await reminderDoc(db, reminder.userId, reminder.id);
    if (doc) {
      await doc.set(
        cleanForFirestore({
          ...reminder,
          scheduledFor: reminder.scheduledFor.toISOString(),
          createdAt: reminder.createdAt.toISOString(),
        })
      );
      write = 'saved';
      getLogger().info(
        { reminderId: reminder.id, userId: reminder.userId },
        '📅 Reminder saved to Firestore'
      );
      void onReminderChange(
        reminder.userId,
        reminder.id,
        {
          title: reminder.message,
          description: reminder.context,
          scheduledFor: reminder.scheduledFor.toISOString(),
          recurrence: 'none',
          priority: undefined,
          status: reminder.status === 'pending' ? 'pending' : 'completed',
        },
        'create'
      );
    }
  } catch (error) {
    write = 'failed';
    getLogger().warn(
      { error: String(error) },
      'Firestore not available for reminders, using in-memory'
    );
  }
  lastWrite.set(reminder, write);
  return write;
}

/** Mark a reminder cancelled in Firestore. */
export async function saveReminderCancel(
  reminder: ScheduledReminder,
  db: ReminderDb
): Promise<ReminderWrite> {
  let write: ReminderWrite = 'no-db';
  try {
    const doc = await reminderDoc(db, reminder.userId, reminder.id);
    if (doc) {
      await doc.update({ status: 'cancelled' });
      write = 'saved';
    }
  } catch (error) {
    write = 'failed';
    getLogger().warn(
      { error: String(error), reminderId: reminder.id },
      'Failed to update reminder status in Firestore'
    );
  }
  lastWrite.set(reminder, write);
  return write;
}
