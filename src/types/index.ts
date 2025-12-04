/**
 * Types Module
 *
 * Central export for all type definitions used across the voice AI system.
 *
 * Note: We maintain both the legacy UserProfile (user-profile.ts) and
 * the new bounded context aggregates (profile/*) for backward compatibility.
 * New code should prefer the profile/* aggregates.
 */

// Legacy UserProfile (maintained for backward compatibility)
// This is the primary export - existing code relies on these types
export * from './user-profile.js';

// Result types for error handling
export * from './result.js';

// Result type utilities for testing and pipelines
export {
  tryCatch,
  tryCatchAsync,
  wrapWithResult,
  expectSuccess,
  expectFailure,
  assertSuccessEquals,
  assertFailureType,
  mockSuccess,
  mockFailure,
  resultMatchers,
  pipe,
  executeAll,
  retryResult,
} from './result-utils.js';

// Bounded context aggregates (new architecture)
// Export under a namespace to avoid conflicts with legacy types
export * as ProfileAggregates from './profile/index.js';

// Also export the composite type directly (it's new and doesn't conflict)
export type { CompositeUserProfile } from './profile/index.js';
export { createCompositeUserProfile } from './profile/index.js';
