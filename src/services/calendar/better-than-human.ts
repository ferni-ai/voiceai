/**
 * Better Than Human Calendar Services
 *
 * Exports all "better than human" calendar capabilities:
 * - Calendar Load Service (burnout risk detection)
 * - Ambient Calendar Awareness (real-time meeting awareness)
 * - Meeting Memory Service (relationship-enriched briefings)
 * - Recovery Protection (proactive time protection)
 *
 * @module calendar/better-than-human
 */

export {
  calendarLoadService,
  getCalendarLoadFactors,
  getCalendarBurnoutRiskFactors,
  getCalendarLoadSummary,
  type CalendarLoadFactors,
  type CalendarBurnoutFactor,
} from './calendar-load-service.js';

export {
  ambientCalendarAwareness,
  getAmbientCalendarContext,
  generateAmbientContextInjection,
  generateAmbientSummaryForUser,
  shouldInterruptForCalendar,
  type AmbientCalendarContext,
} from './ambient-calendar-awareness.js';

export {
  meetingMemoryService,
  getMeetingAttendeeContext,
  enrichPreMeetingBriefing,
  recordMeetingInteraction,
  updateContactNotes,
  type MeetingMemoryContext,
  type EnrichedBriefing,
} from './meeting-memory-service.js';

export {
  recoveryProtection,
  detectRecoveryNeeds,
  autoBlockRecoveryTime,
  findRecoveryOpportunities,
  getRecoverySuggestions,
  buildRecoveryContext,
  type RecoveryRecommendation,
  type RecoverySettings,
} from './recovery-protection.js';
