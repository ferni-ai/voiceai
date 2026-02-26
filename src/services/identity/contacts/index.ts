/**
 * Identity / Contacts Bounded Context
 *
 * Consolidates all contact-related services:
 * - Core contact CRUD (contacts-management)
 * - Contact onboarding (detecting user contact info from conversation)
 * - Relationship management (contact-relationship-service)
 * - Contact groups, gift suggestions, outreach, etc.
 *
 * @module identity/contacts
 */

// Core contacts CRUD & management
export * from './contacts-management.js';
export { default as contactsManagement } from './contacts-management.js';

// Contact onboarding (info detection, prompts)
export * from './contact-onboarding.js';
export { default as contactOnboarding } from './contact-onboarding.js';

// Relationship management services (from contacts/ directory)
// NOTE: Explicit re-exports to avoid naming conflicts with contacts-management.
// contacts-management has getContact(id) and searchContacts(userId, query) for basic CRUD.
// contact-relationship-service has getContact and searchContacts for relationship-aware ops.
// We alias the relationship-service versions to avoid collision.
export {
  // Contact relationship CRUD (aliased to avoid conflict with contacts-management)
  getContacts,
  getContact as getRelationshipContact,
  upsertContact,
  searchContacts as searchRelationshipContacts,
  getContactContext,
  recordInteraction,
  setFollowUp,
  completeFollowUp,
  getRelationshipInsights,
  getContactsNeedingAttention,
  clearCache as clearContactCache,
} from '../../contacts/contact-relationship-service.js';

// Contact Groups
export {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  addToGroup,
  removeFromGroup,
  deleteGroup,
  initializeDefaultGroups,
  getContactGroups,
  getGroupsForOccasion,
  clearCache as clearGroupCache,
} from '../../contacts/contact-groups.js';

// Personalized Outreach
export {
  buildOutreachContext,
  generatePersonalizedMessage,
  previewBatchMessages,
  sendBatchMessages,
  getOutreachSuggestions,
} from '../../contacts/personalized-outreach.js';

// Rich Email Templates
export {
  christmasTemplate,
  newYearTemplate,
  birthdayTemplate,
  thanksgivingTemplate,
  checkInTemplate,
  sympathyTemplate,
  congratulationsTemplate,
  anniversaryTemplate,
  getTemplateForOccasion,
  generatePlainTextVersion,
  emailTemplates,
} from '../../contacts/rich-email-templates.js';

// Gift Suggestions
export {
  generateGiftRecommendations,
  recordGiftGiven,
  getPastGifts,
  giftSuggestions,
} from '../../contacts/gift-suggestions.js';

// Optimal Timing ML
export {
  getTimingProfile,
  recordOutcome,
  getTimingRecommendation,
  getBatchTimingRecommendations,
  groupByOptimalTime,
  optimalTiming,
} from '../../contacts/optimal-timing.js';

// Proactive Outreach Nudges
export {
  generateNudges,
  buildNudgeContext,
  formatNudgeAsSuggestion,
  getTopNudgeForMention,
  getOverdueFrequentContacts,
  outreachNudges,
} from '../../contacts/outreach-nudges.js';

// Google Contacts Import
export {
  importGoogleContacts,
  syncGoogleContacts,
  getGoogleContactsAuthUrl,
  exchangeGoogleContactsCode,
} from '../../contacts/google-contacts-import.js';

// Voice Message Service
export {
  generateVoiceAudio,
  sendVoiceMessageMMS,
  generateVoiceMessageScript,
  getVoiceDeliveryOptions,
  sendBatchVoiceMessages,
} from '../../contacts/voice-message-service.js';

// Gift Tracking Service
export {
  recordGift,
  getGiftHistory,
  getAllGifts,
  updateGiftReaction,
  generateGiftSuggestions,
  getUpcomingGiftOccasions,
  getGiftAnalytics,
  clearGiftCache,
} from '../../contacts/gift-tracking-service.js';

// Types
export type * from '../../contacts/types.js';
