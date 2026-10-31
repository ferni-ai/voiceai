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

// Core service functions
export {
  // Contact management
  setUserContactInfo,
  getUserContactInfo,
  canReachUser,
  SAVED_NOT_VERIFIED,

  // Immediate outreach
  textUser,
  emailUser,
  callUser,

  // Scheduled outreach
  scheduleText,
  scheduleEmail,
  scheduleCall,

  // Tools for agents (old-style array)
  proactiveOutreachTools,

  // Initialization
  initializeProactiveOutreach,

  // Types
  type UserContactInfo,
  type OutreachRequest,
} from './service.js';

// New-style tool definitions
export {
  saveContactInfoDef,
  scheduleReminderDef,
  sendImmediateOutreachDef,
  callUserDef,
  getAgentToUserOutreachDefinitions,
} from './agent-to-user.js';

// Owner-only tools run only for a caller verified on this call
export { verifiedOwnerOnly, OWNER_NEEDS_VERIFICATION } from './verified-owner-only.js';

// Default export for domain loading
import { getAgentToUserOutreachDefinitions } from './agent-to-user.js';
export const getOutreachDefinitions = getAgentToUserOutreachDefinitions;
export default getAgentToUserOutreachDefinitions;
