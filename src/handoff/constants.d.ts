/**
 * Unified Handoff Constants
 *
 * Single source of truth for all handoff timing and configuration.
 *
 * @module handoff/constants
 */
import { HANDOFF_TIMING } from '../config/handoff-timing.js';
/**
 * Handoff timeout in milliseconds.
 * Set to 8s to align with UI timeout (10s) with 2s buffer.
 * Voice should timeout before UI to ensure consistent error messaging.
 */
export declare const HANDOFF_TIMEOUT_MS: 15000;
/**
 * Minimum time between handoffs (rate limiting).
 */
export declare const HANDOFF_DEBOUNCE_MS: 800;
/**
 * Progress heartbeat interval during handoff.
 */
export declare const PROGRESS_HEARTBEAT_INTERVAL_MS = 2000;
/**
 * Maximum pending handoffs in queue.
 */
export declare const MAX_PENDING_HANDOFFS = 10;
/**
 * Alias for consistency with other modules.
 * @deprecated Use MAX_PENDING_HANDOFFS instead
 */
export declare const MAX_HANDOFF_QUEUE_SIZE = 10;
/**
 * Maximum number of sessions to track (prevents unbounded growth).
 */
export declare const MAX_SESSIONS = 100;
/**
 * Session TTL for inactive sessions.
 */
export declare const SESSION_TTL_MS: number;
/**
 * How often to check for expired sessions.
 */
export declare const EVICTION_CHECK_INTERVAL_MS: number;
/**
 * Maximum handoff history entries per session.
 */
export declare const MAX_HISTORY_LENGTH = 100;
/**
 * Maximum recent tool executions to track.
 */
export declare const MAX_RECENT_TOOLS = 10;
/**
 * Maximum routing history entries.
 */
export declare const MAX_ROUTING_HISTORY = 5;
export { HANDOFF_TIMING };
//# sourceMappingURL=constants.d.ts.map