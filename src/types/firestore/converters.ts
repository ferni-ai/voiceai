/**
 * Type-Safe Firestore Converters
 *
 * Provides type-safe conversion between Firestore documents and TypeScript types.
 * Uses branded types to ensure IDs are properly typed at compile time.
 *
 * Features:
 * - Automatic Date conversion (Firestore Timestamp <-> JS Date)
 * - Branded ID handling (ensures type safety)
 * - Validation with Zod schemas
 * - Partial updates with proper typing
 *
 * @example
 * ```typescript
 * const converter = createFirestoreConverter(UserIdentitySchema, 'UserId');
 *
 * // Read with type safety
 * const doc = await db.collection('users').doc(userId).withConverter(converter).get();
 * const user = doc.data(); // UserIdentity with UserId branded type
 *
 * // Write with validation
 * await db.collection('users').doc(userId).withConverter(converter).set(user);
 * ```
 *
 * @module types/firestore/converters
 */

import type { z } from 'zod';
import type {
  UserId,
  SessionId,
  PersonaId,
  GoalId,
  MemoryId,
  OrganizationId,
} from '../branded.js';
import {
  unsafeAsUserId,
  unsafeAsSessionId,
  unsafeAsGoalId,
  unsafeAsMemoryId,
  unsafeAsOrganizationId,
} from '../branded.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Firestore Timestamp interface (minimal definition to avoid import)
 */
interface FirestoreTimestamp {
  toDate(): Date;
  seconds: number;
  nanoseconds: number;
}

/**
 * Firestore document data
 */
type FirestoreData = Record<string, unknown>;

/**
 * Firestore QueryDocumentSnapshot interface
 */
interface QueryDocumentSnapshot<T> {
  id: string;
  data(): T;
  exists: boolean;
}

/**
 * Firestore DocumentSnapshot interface
 */
interface DocumentSnapshot<T> {
  id: string;
  data(): T | undefined;
  exists: boolean;
}

/**
 * Firestore converter interface
 */
export interface FirestoreConverter<T> {
  toFirestore(data: T): FirestoreData;
  fromFirestore(snapshot: QueryDocumentSnapshot<FirestoreData>): T;
}

/**
 * Options for converter creation
 */
export interface ConverterOptions {
  /** Validate data on read */
  validateOnRead?: boolean;
  /** Validate data on write */
  validateOnWrite?: boolean;
  /** Fields to exclude from Firestore (computed, etc.) */
  excludeFields?: string[];
  /** Custom timestamp fields to convert */
  timestampFields?: string[];
}

/**
 * Branded ID type mapping
 */
type BrandedIdType = 'UserId' | 'SessionId' | 'PersonaId' | 'GoalId' | 'MemoryId' | 'OrganizationId';

// ============================================================================
// TIMESTAMP CONVERSION
// ============================================================================

/**
 * Check if a value is a Firestore Timestamp
 */
function isFirestoreTimestamp(value: unknown): value is FirestoreTimestamp {
  return (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as FirestoreTimestamp).toDate === 'function'
  );
}

/**
 * Convert Firestore Timestamps to Dates in an object (recursive)
 */
export function convertTimestampsToDate<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (isFirestoreTimestamp(data)) {
    return data.toDate() as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map(convertTimestampsToDate) as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = convertTimestampsToDate(value);
    }
    return result as T;
  }

  return data;
}

/**
 * Convert Dates to Firestore-compatible format for writing
 * Note: Firestore SDK handles Date objects, but this ensures consistency
 */
export function convertDatesForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (data instanceof Date) {
    return data as unknown as T; // Firestore SDK handles Date objects
  }

  if (Array.isArray(data)) {
    return data.map(convertDatesForFirestore) as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = convertDatesForFirestore(value);
    }
    return result as T;
  }

  return data;
}

// ============================================================================
// BRANDED ID CONVERSION
// ============================================================================

/**
 * Convert a string to a branded ID type
 */
export function toBrandedId<T extends BrandedIdType>(
  value: string,
  type: T
): T extends 'UserId'
  ? UserId
  : T extends 'SessionId'
    ? SessionId
    : T extends 'PersonaId'
      ? PersonaId
      : T extends 'GoalId'
        ? GoalId
        : T extends 'MemoryId'
          ? MemoryId
          : T extends 'OrganizationId'
            ? OrganizationId
            : string {
  switch (type) {
    case 'UserId':
      return unsafeAsUserId(value) as ReturnType<typeof toBrandedId<T>>;
    case 'SessionId':
      return unsafeAsSessionId(value) as ReturnType<typeof toBrandedId<T>>;
    case 'GoalId':
      return unsafeAsGoalId(value) as ReturnType<typeof toBrandedId<T>>;
    case 'MemoryId':
      return unsafeAsMemoryId(value) as ReturnType<typeof toBrandedId<T>>;
    case 'OrganizationId':
      return unsafeAsOrganizationId(value) as ReturnType<typeof toBrandedId<T>>;
    default:
      return value as ReturnType<typeof toBrandedId<T>>;
  }
}

// ============================================================================
// CONVERTER FACTORY
// ============================================================================

/**
 * Create a type-safe Firestore converter with optional Zod validation
 */
export function createFirestoreConverter<T extends Record<string, unknown>>(
  schema?: z.ZodSchema<T>,
  idType?: BrandedIdType,
  options: ConverterOptions = {}
): FirestoreConverter<T> {
  const { validateOnRead = false, validateOnWrite = false, excludeFields = [] } = options;

  return {
    toFirestore(data: T): FirestoreData {
      // Validate if enabled
      if (validateOnWrite && schema) {
        schema.parse(data);
      }

      // Convert and filter
      const firestoreData = convertDatesForFirestore(data) as FirestoreData;

      // Remove excluded fields
      for (const field of excludeFields) {
        delete firestoreData[field];
      }

      // Remove undefined values (Firestore doesn't like them)
      for (const [key, value] of Object.entries(firestoreData)) {
        if (value === undefined) {
          delete firestoreData[key];
        }
      }

      return firestoreData;
    },

    fromFirestore(snapshot: QueryDocumentSnapshot<FirestoreData>): T {
      const data = snapshot.data();

      // Convert timestamps
      const converted = convertTimestampsToDate(data);

      // Add the document ID with branded type if specified
      if (idType) {
        (converted as Record<string, unknown>).id = toBrandedId(snapshot.id, idType);
      }

      // Validate if enabled
      if (validateOnRead && schema) {
        return schema.parse(converted);
      }

      return converted as T;
    },
  };
}

// ============================================================================
// SPECIALIZED CONVERTERS
// ============================================================================

/**
 * Converter for user profiles
 */
export function createUserProfileConverter<T extends Record<string, unknown>>(
  schema?: z.ZodSchema<T>
): FirestoreConverter<T> {
  return createFirestoreConverter(schema, 'UserId', {
    validateOnRead: !!schema,
    excludeFields: ['__metadata'], // Internal Firestore fields
  });
}

/**
 * Converter for session data
 */
export function createSessionConverter<T extends Record<string, unknown>>(
  schema?: z.ZodSchema<T>
): FirestoreConverter<T> {
  return createFirestoreConverter(schema, 'SessionId', {
    validateOnRead: !!schema,
  });
}

/**
 * Converter for goals
 */
export function createGoalConverter<T extends Record<string, unknown>>(
  schema?: z.ZodSchema<T>
): FirestoreConverter<T> {
  return createFirestoreConverter(schema, 'GoalId', {
    validateOnRead: !!schema,
  });
}

/**
 * Converter for memories
 */
export function createMemoryConverter<T extends Record<string, unknown>>(
  schema?: z.ZodSchema<T>
): FirestoreConverter<T> {
  return createFirestoreConverter(schema, 'MemoryId', {
    validateOnRead: !!schema,
  });
}

/**
 * Converter for organizations
 */
export function createOrganizationConverter<T extends Record<string, unknown>>(
  schema?: z.ZodSchema<T>
): FirestoreConverter<T> {
  return createFirestoreConverter(schema, 'OrganizationId', {
    validateOnRead: !!schema,
  });
}

// ============================================================================
// BATCH OPERATIONS HELPERS
// ============================================================================

/**
 * Convert an array of Firestore documents to typed objects
 */
export function convertDocuments<T>(
  docs: Array<DocumentSnapshot<FirestoreData>>,
  converter: FirestoreConverter<T>
): T[] {
  return docs
    .filter((doc) => doc.exists)
    .map((doc) =>
      converter.fromFirestore({
        id: doc.id,
        data: () => doc.data() as FirestoreData,
        exists: true,
      })
    );
}

/**
 * Prepare batch write data
 */
export function prepareBatchData<T extends Record<string, unknown>>(
  items: T[],
  converter: FirestoreConverter<T>
): FirestoreData[] {
  return items.map((item) => converter.toFirestore(item));
}

// ============================================================================
// PARTIAL UPDATE HELPERS
// ============================================================================

/**
 * Create a partial update object with proper typing
 * Removes undefined values and handles nested paths
 */
export function createPartialUpdate<T extends Record<string, unknown>>(
  update: Partial<T>
): FirestoreData {
  const result: FirestoreData = {};

  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) {
      result[key] = convertDatesForFirestore(value);
    }
  }

  return result;
}

/**
 * Create a nested field update (for updating nested fields without overwriting)
 *
 * @example
 * // Update just the 'style' field in communication aggregate
 * const update = createNestedUpdate('communication', { style: 'casual' });
 * // Results in: { 'communication.style': 'casual' }
 */
export function createNestedUpdate(
  path: string,
  update: Record<string, unknown>
): FirestoreData {
  const result: FirestoreData = {};

  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) {
      result[`${path}.${key}`] = convertDatesForFirestore(value);
    }
  }

  return result;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate data before writing to Firestore
 */
export function validateForFirestore<T>(
  data: T,
  schema: z.ZodSchema<T>
): { valid: true; data: T } | { valid: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

/**
 * Safe parse from Firestore with error handling
 */
export function safeParseFromFirestore<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const converted = convertTimestampsToDate(data);
    const result = schema.safeParse(converted);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
