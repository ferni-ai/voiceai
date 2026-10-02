/**
 * Important dates — the canonical store for birthdays, anniversaries, events
 * and deadlines, plus reminders for them.
 *
 * Store API (detection and the memory-control service code against these):
 *   upsertImportantDate, listImportantDates, getUpcomingDates,
 *   deleteImportantDate, deleteImportantDatesFor, deleteAllImportantDates,
 *   exportImportantDates
 * Reminders:
 *   getRemindersForSession (session-start context), deliverDueDateReminders
 *   (scheduled job), getReminderSettings / updateReminderSettings
 *
 * @module services/important-dates
 */

export * from './types.js';
export { importantDateIdFor, importantDateKey, normalizeDateKey } from './identity.js';
export { parseSpokenDate, toStoredDate } from './date-parsing.js';
export {
  upsertImportantDate,
  listImportantDates,
  getImportantDate,
  deleteImportantDate,
  deleteImportantDatesFor,
  deleteAllImportantDates,
  exportImportantDates,
  type ExportedImportantDate,
  type TombstoneReason,
} from './store.js';
export { getUpcomingDates } from './upcoming.js';
export {
  createUserDate,
  editImportantDate,
  findImportantDates,
  parsePatch,
  type NewUserDate,
} from './user-edits.js';
export {
  getReminderSettings,
  updateReminderSettings,
  validateSettingsPatch,
  resolveTimeZone,
  type ReminderSettingsPatch,
} from './settings.js';
export {
  getRemindersForSession,
  type SessionReminder,
  type SessionReminders,
} from './session-reminders.js';
export { deliverDueDateReminders, type DateReminderRunResult } from './reminder-job.js';
export { rescheduleAllDates } from './reschedule.js';
