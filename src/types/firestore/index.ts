/**
 * Firestore Module
 *
 * Type-safe Firestore utilities with branded types.
 *
 * @module types/firestore
 */

export {
  // Core converter
  createFirestoreConverter,
  type ConverterOptions,
  type FirestoreConverter,
  // Specialized converters
  createGoalConverter,
  createMemoryConverter,
  createOrganizationConverter,
  createSessionConverter,
  createUserProfileConverter,
  // Timestamp conversion
  convertDatesForFirestore,
  convertTimestampsToDate,
  // Branded ID conversion
  toBrandedId,
  // Batch helpers
  convertDocuments,
  prepareBatchData,
  // Partial update helpers
  createNestedUpdate,
  createPartialUpdate,
  // Validation helpers
  safeParseFromFirestore,
  validateForFirestore,
} from './converters.js';
