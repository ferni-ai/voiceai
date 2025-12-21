/**
 * Contact Management System
 *
 * "Better Than Human" contact management that enables:
 * - Multi-channel communication (email, SMS, phone)
 * - Contact groups (Family, Close Friends, Work)
 * - Deeply personalized batch messaging
 * - Recency and relationship tracking
 * - Holiday and occasion awareness
 * - Proactive outreach suggestions
 *
 * @module services/contacts
 */

// Types
export * from './types.js';

// Core Services
export {
  // Contact CRUD
  getContacts,
  getContact,
  upsertContact,
  searchContacts,
  getContactContext,
  // Interaction tracking
  recordInteraction,
  // Follow-up management
  setFollowUp,
  completeFollowUp,
  // Insights
  getRelationshipInsights,
  getContactsNeedingAttention,
  // Cache
  clearCache as clearContactCache,
} from './contact-relationship-service.js';

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
} from './contact-groups.js';

// Personalized Outreach
export {
  buildOutreachContext,
  generatePersonalizedMessage,
  previewBatchMessages,
  sendBatchMessages,
  getOutreachSuggestions,
} from './personalized-outreach.js';

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
} from './rich-email-templates.js';

// Gift Suggestions
export {
  generateGiftRecommendations,
  recordGiftGiven,
  getPastGifts,
  giftSuggestions,
} from './gift-suggestions.js';

// Optimal Timing ML
export {
  getTimingProfile,
  recordOutcome,
  getTimingRecommendation,
  getBatchTimingRecommendations,
  groupByOptimalTime,
  optimalTiming,
} from './optimal-timing.js';

// Proactive Outreach Nudges
export {
  generateNudges,
  buildNudgeContext,
  formatNudgeAsSuggestion,
  getTopNudgeForMention,
  getOverdueFrequentContacts,
  outreachNudges,
} from './outreach-nudges.js';

// Google Contacts Import
export {
  importGoogleContacts,
  syncGoogleContacts,
  getGoogleContactsAuthUrl,
  exchangeGoogleContactsCode,
} from './google-contacts-import.js';

// Voice Message Service
export {
  generateVoiceAudio,
  sendVoiceMessageMMS,
  generateVoiceMessageScript,
  getVoiceDeliveryOptions,
  sendBatchVoiceMessages,
} from './voice-message-service.js';

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
} from './gift-tracking-service.js';

// Default export for convenient importing
import contactRelationshipService from './contact-relationship-service.js';
import contactGroups from './contact-groups.js';
import personalizedOutreach from './personalized-outreach.js';
import { emailTemplates } from './rich-email-templates.js';
import { giftSuggestions } from './gift-suggestions.js';
import { optimalTiming } from './optimal-timing.js';
import { outreachNudges } from './outreach-nudges.js';

export default {
  ...contactRelationshipService,
  ...contactGroups,
  ...personalizedOutreach,
  emailTemplates,
  giftSuggestions,
  optimalTiming,
  outreachNudges,
};
