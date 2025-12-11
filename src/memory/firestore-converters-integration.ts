/**
 * Firestore Converters Integration
 *
 * This module provides type-safe Firestore converters that can be used
 * alongside or as a replacement for the existing hydrate/serialize methods.
 *
 * Benefits of using these converters:
 * - Type-safe document conversion with Zod validation
 * - Automatic Firestore Timestamp → Date conversion
 * - Branded type support for IDs (UserId, SessionId, etc.)
 * - Consistent error handling
 *
 * @module memory/firestore-converters-integration
 */

import { z } from 'zod';
import {
  convertDatesForFirestore,
  convertTimestampsToDate,
  createFirestoreConverter,
  createGoalConverter,
  createMemoryConverter,
  createNestedUpdate,
  createPartialUpdate,
  createSessionConverter,
  createUserProfileConverter,
  safeParseFromFirestore,
  toBrandedId,
  validateForFirestore,
} from '../types/firestore/index.js';
import { getLogger } from '../utils/safe-logger.js';

// Re-export all converter utilities for convenient access
export {
  convertDatesForFirestore,
  convertTimestampsToDate,
  createFirestoreConverter,
  createGoalConverter,
  createMemoryConverter,
  createNestedUpdate,
  createPartialUpdate,
  createSessionConverter,
  createUserProfileConverter,
  safeParseFromFirestore,
  toBrandedId,
  validateForFirestore,
};

// ============================================================================
// ENHANCED CONVERTERS FOR COMMON TYPES
// ============================================================================

/**
 * User Profile Converter
 *
 * Usage:
 * ```typescript
 * const converter = getUserProfileConverter();
 * const docRef = db.collection('users').doc(userId).withConverter(converter);
 * const profile = (await docRef.get()).data();
 * ```
 */
export const getUserProfileConverter = createUserProfileConverter;

/**
 * Goal Converter
 */
export const getGoalConverter = createGoalConverter;

/**
 * Memory Converter
 */
export const getMemoryConverter = createMemoryConverter;

/**
 * Session Converter
 */
export const getSessionConverter = createSessionConverter;

// ============================================================================
// CUSTOM SCHEMA CONVERTERS
// ============================================================================

/**
 * Create a converter for conversation summaries
 */
const ConversationSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string().optional(),
  timestamp: z.date(),
  summary: z.string(),
  topics: z.array(z.string()).default([]),
  emotionalHighlights: z.array(z.string()).default([]),
  followUpItems: z.array(z.string()).default([]),
  personaId: z.string().optional(),
  durationMinutes: z.number().optional(),
  turnCount: z.number().optional(),
});

export type ConversationSummaryDoc = z.infer<typeof ConversationSummarySchema>;

export function getConversationSummaryConverter() {
  return createFirestoreConverter(ConversationSummarySchema);
}

/**
 * Create a converter for key moments
 */
const KeyMomentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  timestamp: z.date(),
  summary: z.string(),
  emotionalWeight: z.enum(['minor', 'moderate', 'significant', 'major']),
  themes: z.array(z.string()).default([]),
  followUpNeeded: z.boolean().default(false),
  followUpDate: z.date().optional(),
  personaId: z.string().optional(),
});

export type KeyMomentDoc = z.infer<typeof KeyMomentSchema>;

export function getKeyMomentConverter() {
  return createFirestoreConverter(KeyMomentSchema);
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Safely migrate a document from raw Firestore data to a typed object
 *
 * @example
 * ```typescript
 * const result = safelyMigrateDocument(
 *   rawData,
 *   UserProfileSchema,
 *   'users',
 *   docId
 * );
 * if (result.success) {
 *   // Use result.data (typed as UserProfile)
 * } else {
 *   // Handle result.error
 * }
 * ```
 */
export function safelyMigrateDocument<T>(
  rawData: unknown,
  schema: z.ZodSchema<T>,
  collection: string,
  docId: string
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const log = getLogger();

  // First convert any Firestore timestamps to dates
  const converted = convertTimestampsToDate(rawData);

  // Then parse with the schema
  const result = schema.safeParse(converted);

  if (!result.success) {
    log.warn(
      {
        collection,
        docId,
        errors: result.error.issues.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
      'Document validation failed during migration'
    );
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data };
}

/**
 * Batch validate documents from a collection query
 *
 * @returns Valid documents and a list of invalid document IDs
 */
export function validateBatchDocuments<T>(
  docs: Array<{ id: string; data: unknown }>,
  schema: z.ZodSchema<T>
): {
  valid: T[];
  invalidIds: string[];
} {
  const valid: T[] = [];
  const invalidIds: string[] = [];

  for (const doc of docs) {
    const result = safeParseFromFirestore(doc.data, schema);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidIds.push(doc.id);
    }
  }

  return { valid, invalidIds };
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/**
 * Example: Using converters with native Firestore SDK
 *
 * ```typescript
 * import { Firestore } from '@google-cloud/firestore';
 * import { getUserProfileConverter } from './firestore-converters-integration.js';
 *
 * const db = new Firestore();
 * const converter = getUserProfileConverter();
 *
 * // Read with type safety
 * const docRef = db.collection('users').doc(userId).withConverter(converter);
 * const snapshot = await docRef.get();
 * const profile = snapshot.data(); // TypeScript knows this is UserProfile | undefined
 *
 * // Write with automatic date conversion
 * await docRef.set({
 *   id: userId,
 *   name: 'Test User',
 *   createdAt: new Date(),
 *   // ... other fields
 * });
 *
 * // Partial updates
 * const updates = createPartialUpdate({
 *   name: 'New Name',
 *   updatedAt: new Date(),
 * });
 * await docRef.update(updates);
 *
 * // Nested updates
 * const nestedUpdates = createNestedUpdate('preferences', {
 *   theme: 'dark',
 *   language: 'en',
 * });
 * await docRef.update(nestedUpdates);
 * ```
 */

/**
 * Example: Validating data before writing
 *
 * ```typescript
 * import { validateForFirestore } from './firestore-converters-integration.js';
 * import { UserProfileSchema } from '../types/user-profile.js';
 *
 * const userData = { name: 'Test', age: 25 };
 * const validation = validateForFirestore(userData, UserProfileSchema);
 *
 * if (validation.valid) {
 *   await docRef.set(validation.data);
 * } else {
 *   console.error('Validation errors:', validation.errors);
 * }
 * ```
 */

/**
 * Example: Using branded IDs
 *
 * ```typescript
 * import { toBrandedId } from './firestore-converters-integration.js';
 *
 * // Convert string ID to branded type
 * const userId = toBrandedId('user_123', 'UserId');
 * const sessionId = toBrandedId('session_456', 'SessionId');
 *
 * // TypeScript ensures you can't mix up ID types
 * function getUserById(id: UserId): Promise<UserProfile | null> { ... }
 * getUserById(userId); // ✅ Works
 * getUserById(sessionId); // ❌ Type error!
 * ```
 */
