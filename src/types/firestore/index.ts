/**
 * Firestore Module
 *
 * Type-safe Firestore utilities with branded types.
 *
 * @module types/firestore
 */

export {
  // Timestamp conversion
  convertDatesForFirestore,
  // Batch helpers
  convertDocuments,
  convertTimestampsToDate,
  // Core converter
  createFirestoreConverter,
  // Specialized converters
  createGoalConverter,
  createMemoryConverter,
  // Partial update helpers
  createNestedUpdate,
  createOrganizationConverter,
  createPartialUpdate,
  createSessionConverter,
  createUserProfileConverter,
  prepareBatchData,
  // Validation helpers
  safeParseFromFirestore,
  // Branded ID conversion
  toBrandedId,
  validateForFirestore,
  type ConverterOptions,
  type FirestoreConverter,
} from './converters.js';
