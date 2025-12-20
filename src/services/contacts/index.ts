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

// Default export for convenient importing
import contactRelationshipService from './contact-relationship-service.js';
import contactGroups from './contact-groups.js';
import personalizedOutreach from './personalized-outreach.js';

export default {
  ...contactRelationshipService,
  ...contactGroups,
  ...personalizedOutreach,
};
