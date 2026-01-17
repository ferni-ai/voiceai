/**
 * CEO Coaching Facade
 *
 * Re-exports types and storage functions from the ceo-coaching domain
 * for use by context builders and other layers.
 */

// Re-export types
export type {
  CEOWin,
  CEOEnergy,
  CEODecision,
  CEOPriority,
  CEOBlocker,
  CEOIdea,
  CEOFocusSession,
  CEOJournalEntry,
  CEOGratitude,
  CEOReflection,
  CEOWeeklyReview,
  CEOCoachingState,
  CEOToolContext,
} from '../domains/ceo-coaching/types.js';

// Re-export storage functions
export {
  saveWin,
  getRecentWins,
  logEnergy,
  getEnergyTrend,
  getRecentEnergyEntries,
  logGratitude,
  getRecentGratitude,
  saveJournalEntry,
  trackDecision,
  updateDecision,
  getPendingDecisions,
  addPriority,
  getPriorities,
  completePriority,
  reorderPriorities,
  addBlocker,
  resolveBlocker,
  getActiveBlockers,
  captureIdea,
  getRecentIdeas,
  startFocusSession,
  endFocusSession,
  getActiveFocusSession,
  saveDailyReflection,
  saveWeeklyReview,
  getCEOCoachingState,
} from '../domains/ceo-coaching/storage.js';
