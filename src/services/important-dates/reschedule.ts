/**
 * Re-plan every date's next reminder (after the user changes time zone, send
 * time or quiet hours).
 *
 * @module services/important-dates/reschedule
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  listImportantDates,
  saveImportantDate,
  scheduleContextFor,
  withSchedule,
} from './store.js';

const log = createLogger({ module: 'important-dates:reschedule' });

export async function rescheduleAllDates(userId: string): Promise<number> {
  const listed = await listImportantDates(userId);
  if (!listed.success) return 0;
  const ctx = await scheduleContextFor(userId);
  let changed = 0;
  for (const record of listed.data) {
    const next = withSchedule(record, ctx);
    if (
      next.nextReminderAt === record.nextReminderAt &&
      next.nextReminderKey === record.nextReminderKey
    ) {
      continue;
    }
    const saved = await saveImportantDate(userId, next);
    if (saved.success) changed++;
  }
  if (changed > 0) log.info({ userId, changed }, 'Date reminders rescheduled');
  return changed;
}
