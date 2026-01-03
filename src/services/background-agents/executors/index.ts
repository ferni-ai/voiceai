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
