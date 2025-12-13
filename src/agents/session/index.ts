/**
 * Session Management
 *
 * Centralized session state and lifecycle management.
 *
 * Modules:
 * - session-state.ts: SessionStateManager for immutable state updates
 * - user-data-proxy.ts: UserData proxy that delegates to SessionStateManager (single source of truth)
 *
 * Note: UserData type is exported from shared/types.ts (historical location).
 * Use createUserDataProxy from this module to create proxy instances.
 */

export * from './session-state.js';

// Export proxy functions but NOT UserData type (to avoid conflict with shared/types.ts)
export {
  createUserDataProxy,
  isUserDataProxy,
  getStateManager,
} from './user-data-proxy.js';
