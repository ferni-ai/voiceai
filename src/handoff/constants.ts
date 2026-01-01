/**
 * Unified Handoff Constants
 *
 * Single source of truth for all handoff timing and configuration.
 *
 * @module handoff/constants
 */

import { HANDOFF_TIMING } from '../config/handoff-timing.js';

// ============================================================================
// TIMING CONSTANTS (from shared config)
// ============================================================================

/**
 * Handoff timeout in milliseconds.
 * Set to 8s to align with UI timeout (10s) with 2s buffer.
 * Voice should timeout before UI to ensure consistent error messaging.
 */
export const { HANDOFF_TIMEOUT_MS } = HANDOFF_TIMING;

/**
 * Minimum time between handoffs (rate limiting).
 */
export const HANDOFF_DEBOUNCE_MS = HANDOFF_TIMING.DEBOUNCE_MS;

/**
 * Progress heartbeat interval during handoff.
 */
export const PROGRESS_HEARTBEAT_INTERVAL_MS = 2000;

// ============================================================================
// QUEUE CONSTANTS
// ============================================================================

/**
 * Maximum pending handoffs in queue.
 */
export const MAX_PENDING_HANDOFFS = 10;

/**
 * Alias for consistency with other modules.
 * @deprecated Use MAX_PENDING_HANDOFFS instead
 */
export const MAX_HANDOFF_QUEUE_SIZE = MAX_PENDING_HANDOFFS;

// ============================================================================
// SESSION CONSTANTS
// ============================================================================

/**
 * Maximum number of sessions to track (prevents unbounded growth).
 */
export const MAX_SESSIONS = 100;

/**
 * Session TTL for inactive sessions.
 */
export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * How often to check for expired sessions.
 */
export const EVICTION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// HISTORY CONSTANTS
// ============================================================================

/**
 * Maximum handoff history entries per session.
 */
export const MAX_HISTORY_LENGTH = 100;

/**
 * Maximum recent tool executions to track.
 */
export const MAX_RECENT_TOOLS = 10;

/**
 * Maximum routing history entries.
 */
export const MAX_ROUTING_HISTORY = 5;

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Re-export the full HANDOFF_TIMING object for modules that need it
export { HANDOFF_TIMING };
