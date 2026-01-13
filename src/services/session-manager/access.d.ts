/**
 * Session Access Functions
 *
 * Functions for accessing and managing active sessions.
 * Uses branded SessionId type for type-safe session identification.
 *
 * @module session-manager/access
 */
import type { SessionId } from '../../types/branded.js';
import type { SessionServices } from '../types.js';
/**
 * Initialize access module with reference to active sessions map
 */
export declare function initializeAccess(sessions: Map<SessionId, SessionServices>): void;
/**
 * Get existing session services by session ID
 *
 * @param sessionId - Session identifier (string or branded SessionId)
 * @returns Session services if session exists
 */
export declare function getSessionServices(sessionId: string | SessionId): SessionServices | undefined;
/**
 * Check if a session exists
 */
export declare function hasSession(sessionId: string | SessionId): boolean;
/**
 * Get all active session IDs
 */
export declare function getActiveSessionIds(): SessionId[];
/**
 * Get count of active sessions
 */
export declare function getActiveSessionCount(): number;
/**
 * Clear all active sessions (for shutdown)
 * Properly ends each session before clearing to prevent data loss
 *
 * @returns Number of sessions that were cleared
 */
export declare function clearAllSessions(): Promise<number>;
//# sourceMappingURL=access.d.ts.map