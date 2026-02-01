/**
 * Background Task Executors
 *
 * Executors handle specific types of background tasks.
 * Each executor is specialized for a particular persona's domain.
 */

// Research executor (Peter's domain)
export {
  executeResearchTask,
  queueResearchTask,
  type ResearchRequest,
  type ResearchResult,
  type ResearchFinding,
} from './research-executor.js';

// Reservation executor (Jordan's domain)
export {
  executeReservationTask,
  queueReservationTask,
  type ReservationRequest,
  type ReservationResult,
} from './reservation-executor.js';

// Habit reminder executor (Maya's domain)
export {
  executeHabitReminder,
  queueHabitReminder,
  type HabitReminderRequest,
  type HabitReminderResult,
} from './habit-reminder-executor.js';

// Follow-up executor (Alex's domain)
export {
  executeFollowup,
  queueFollowup,
  type FollowupRequest,
  type FollowupResult,
} from './followup-executor.js';

// Call executor (Ferni's domain)
export { executeCall, queueCall, type CallRequest, type CallResult } from './call-executor.js';
