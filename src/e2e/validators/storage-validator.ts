/**
 * Storage Validator
 *
 * Validates Firestore writes against expected patterns.
 */

import { resolvePath } from '../context-factory.js';
import { validateFieldMatchers } from './api-validator.js';
import type {
  StorageExpectation,
  StorageValidationResult,
  E2ETestContext,
} from '../types.js';

// ============================================================================
// Storage Validation
// ============================================================================

/**
 * Validate that expected documents exist in Firestore.
 */
export async function validateStorage(
  ctx: E2ETestContext,
  expectations: StorageExpectation[],
  documentId?: string
): Promise<StorageValidationResult[]> {
  const results: StorageValidationResult[] = [];

  for (const expectation of expectations) {
    const result = await validateSingleStorage(ctx, expectation, documentId);
    results.push(result);
  }

  return results;
}

/**
 * Validate a single storage expectation.
 */
async function validateSingleStorage(
  ctx: E2ETestContext,
  expectation: StorageExpectation,
  documentId?: string
): Promise<StorageValidationResult> {
  const resolvedPath = resolvePath(expectation.path, ctx.userId, documentId);
  const errors: string[] = [];
  let actualData: Record<string, unknown> | undefined;
  let found = false;

  try {
    // Parse the path to determine if it's a collection or document
    const pathParts = resolvedPath.split('/');
    const isDocument = pathParts.length % 2 === 0;

    if (isDocument) {
      // Direct document path
      const docRef = ctx.firestore.doc(resolvedPath);
      const doc = await docRef.get();
      found = doc.exists;
      actualData = found ? (doc.data() as Record<string, unknown>) : undefined;
    } else {
      // Collection path - check if any documents exist
      const collectionRef = ctx.firestore.collection(resolvedPath);
      const snapshot = await collectionRef.limit(1).get();
      found = !snapshot.empty;

      if (found && snapshot.docs[0]) {
        actualData = snapshot.docs[0].data() as Record<string, unknown>;
      }
    }

    // Validate existence
    if (expectation.exists && !found) {
      errors.push(`Expected document at "${resolvedPath}" to exist, but it was not found`);
    } else if (!expectation.exists && found) {
      errors.push(`Expected document at "${resolvedPath}" to NOT exist, but it was found`);
    }

    // If document exists, validate fields
    if (found && actualData) {
      // Check required fields
      if (expectation.requiredFields) {
        for (const field of expectation.requiredFields) {
          if (!(field in actualData)) {
            errors.push(`Required field "${field}" missing at "${resolvedPath}"`);
          }
        }
      }

      // Check field matchers
      if (expectation.fieldMatchers) {
        const matcherErrors = validateFieldMatchers(
          actualData,
          expectation.fieldMatchers,
          resolvedPath
        );
        errors.push(...matcherErrors);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Error validating storage at "${resolvedPath}": ${errorMessage}`);
    ctx.log.error('Storage validation error', { path: resolvedPath, error: errorMessage });
  }

  return {
    path: resolvedPath,
    found,
    passed: errors.length === 0,
    actualData,
    errors,
  };
}

// ============================================================================
// Collection Queries
// ============================================================================

/**
 * Query a Firestore collection and return matching documents.
 */
export async function queryCollection(
  ctx: E2ETestContext,
  collectionPath: string,
  filters?: { field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown }[]
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  try {
    const resolvedPath = resolvePath(collectionPath, ctx.userId);
    let query: FirebaseFirestore.Query = ctx.firestore.collection(resolvedPath);

    if (filters) {
      for (const filter of filters) {
        query = query.where(filter.field, filter.op, filter.value);
      }
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log.error('Collection query failed', { collectionPath, error: errorMessage });
    return [];
  }
}

/**
 * Get a single document by path.
 */
export async function getDocument(
  ctx: E2ETestContext,
  documentPath: string
): Promise<{ exists: boolean; data?: Record<string, unknown> }> {
  try {
    const resolvedPath = resolvePath(documentPath, ctx.userId);
    const docRef = ctx.firestore.doc(resolvedPath);
    const doc = await docRef.get();

    return {
      exists: doc.exists,
      data: doc.exists ? (doc.data() as Record<string, unknown>) : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log.error('Document get failed', { documentPath, error: errorMessage });
    return { exists: false };
  }
}

// ============================================================================
// Storage Assertions
// ============================================================================

/**
 * Assert that a document exists at the given path.
 */
export async function assertDocumentExists(
  ctx: E2ETestContext,
  documentPath: string,
  message?: string
): Promise<{ passed: boolean; error?: string }> {
  const { exists } = await getDocument(ctx, documentPath);

  if (!exists) {
    return {
      passed: false,
      error: message || `Expected document at "${documentPath}" to exist`,
    };
  }

  return { passed: true };
}

/**
 * Assert that a document does NOT exist at the given path.
 */
export async function assertDocumentNotExists(
  ctx: E2ETestContext,
  documentPath: string,
  message?: string
): Promise<{ passed: boolean; error?: string }> {
  const { exists } = await getDocument(ctx, documentPath);

  if (exists) {
    return {
      passed: false,
      error: message || `Expected document at "${documentPath}" to NOT exist`,
    };
  }

  return { passed: true };
}

/**
 * Assert that a collection has at least N documents.
 */
export async function assertCollectionHasDocuments(
  ctx: E2ETestContext,
  collectionPath: string,
  minCount: number,
  message?: string
): Promise<{ passed: boolean; error?: string; actualCount: number }> {
  const docs = await queryCollection(ctx, collectionPath);

  if (docs.length < minCount) {
    return {
      passed: false,
      error: message || `Expected collection "${collectionPath}" to have at least ${minCount} documents, but found ${docs.length}`,
      actualCount: docs.length,
    };
  }

  return { passed: true, actualCount: docs.length };
}

// ============================================================================
// Storage Path Helpers
// ============================================================================

/**
 * Common Firestore paths for Ferni data.
 */
export const STORAGE_PATHS = {
  /** User profile */
  userProfile: 'bogle_users/{userId}',

  /** User habits */
  habits: 'bogle_users/{userId}/habits',

  /** Single habit */
  habit: 'bogle_users/{userId}/habits/{id}',

  /** Habit completions */
  habitCompletions: 'bogle_users/{userId}/habit_completions',

  /** Career tracking */
  career: 'bogle_users/{userId}/career',

  /** Job applications */
  jobApplications: 'bogle_users/{userId}/career/job_applications',

  /** Contacts */
  contacts: 'bogle_users/{userId}/contacts',

  /** Single contact */
  contact: 'bogle_users/{userId}/contacts/{id}',

  /** Memories */
  memories: 'bogle_users/{userId}/memories',

  /** Calendar events */
  calendarEvents: 'bogle_users/{userId}/calendar_events',

  /** Team insights */
  teamInsights: 'bogle_users/{userId}/team_insights/data',

  /** Conversation history */
  conversations: 'bogle_users/{userId}/conversations',

  /** User settings */
  settings: 'bogle_users/{userId}/settings/preferences',

  /** Integrations */
  integrations: 'bogle_users/{userId}/integrations',

  /** Learning engine data */
  learningData: 'bogle_users/{userId}/learning',

  /** Key moments */
  keyMoments: 'bogle_users/{userId}/key_moments',

  /** Tracked items */
  trackedItems: 'bogle_users/{userId}/tracked_items',
} as const;

/**
 * Get a storage path for a domain.
 */
export function getStoragePathForDomain(domain: string, userId: string): string {
  const pathKey = domain as keyof typeof STORAGE_PATHS;
  const template = STORAGE_PATHS[pathKey];

  if (template) {
    return resolvePath(template, userId);
  }

  // Default to domain name as subcollection
  return `bogle_users/${userId}/${domain}`;
}
