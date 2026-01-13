/**
 * Proactive Outreach Module
 *
 * Agent-to-User proactive communication:
 * - Reminders, follow-ups, check-ins
 * - Scheduled messages via SMS, email, voice
 * - Accountability and celebration outreach
 *
 * This is for the AGENT reaching out TO THE USER.
 * For user reaching out to their contacts, see: communication/outreach/
 */
export { setUserContactInfo, getUserContactInfo, canReachUser, textUser, emailUser, callUser, scheduleText, scheduleEmail, scheduleCall, proactiveOutreachTools, initializeProactiveOutreach, type UserContactInfo, type OutreachRequest, } from './service.js';
export { saveContactInfoDef, scheduleReminderDef, sendImmediateOutreachDef, callUserDef, getAgentToUserOutreachDefinitions, } from './agent-to-user.js';
import { getAgentToUserOutreachDefinitions } from './agent-to-user.js';
export declare const getOutreachDefinitions: typeof getAgentToUserOutreachDefinitions;
export default getAgentToUserOutreachDefinitions;
//# sourceMappingURL=index.d.ts.map