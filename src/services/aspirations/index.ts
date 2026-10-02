/**
 * Aspirations — one store for the spectrum someday-dream → goal → habit.
 *
 * Store:      upsertAspiration, listAspirations, getAspiration, saveAspiration,
 *             findByLegacyId, deleteAspiration
 * Edits:      createUserAspiration, editAspiration, parsePatch, parseCreate
 * Habits:     recordCheckIn, validateCheckIn, getHabitPatterns
 * Capture:    captureFromUtterance, onConversationSummarized
 * Session:    getAspirationsForSession
 * Lifecycle:  exportAspirations, deleteAspirationsFor, deleteAllAspirations
 *
 * @module services/aspirations
 */

export * from './types.js';
export {
  aspirationIdFor,
  normalizeAspirationTitle,
  titlesOverlap,
  ASPIRATION_ID_PATTERN,
} from './identity.js';
export {
  upsertAspiration,
  listAspirations,
  getAspiration,
  saveAspiration,
  findByLegacyId,
  deleteAspiration,
  type TombstoneReason,
} from './store.js';
export {
  createUserAspiration,
  editAspiration,
  parsePatch,
  parseCreate,
  type NewUserAspiration,
} from './edits.js';
export { recordCheckIn, validateCheckIn, applyCheckIn } from './check-ins.js';
export { getHabitPatterns, type HabitPattern } from './patterns.js';
export {
  captureFromUtterance,
  onConversationSummarized,
  type CaptureResult,
  type SummaryInput,
  type SummaryTurn,
} from './capture.js';
export { getAspirationsForSession, type SessionAspirations } from './session-block.js';
export {
  exportAspirations,
  deleteAspirationsFor,
  deleteAllAspirations,
  findAspirations,
  toExport,
  type ExportedAspiration,
} from './lifecycle.js';
export { computeStreak, isDueOn, isStreakAtRisk, todayIn } from './habit-math.js';
export { migrateLegacyAspirations } from './legacy-migration.js';
