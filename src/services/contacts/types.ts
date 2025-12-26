/**
 * Contact Management Types
 *
 * Re-exports contact types from the types layer for backward compatibility.
 * New code should import directly from '../../types/contacts.js'.
 *
 * @module services/contacts/types
 * @deprecated Import from '../../types/contacts.js' instead
 */

// Re-export all contact types from the types layer
export type {
  ChannelType,
  ContactChannel,
  ImportantDateType,
  DateSentiment,
  ContactImportantDate,
  RelationshipType,
  RelationshipSentiment,
  EnhancedContact,
  OccasionPreferences,
  ContactGroup,
  OutreachOccasion,
  OutreachTone,
  OutreachContext,
  PersonalizedMessage,
  BatchOutreachRequest,
  BatchOutreachResult,
  SuggestionType,
  OutreachSuggestion,
  BudgetRange,
} from '../../types/contacts.js';
