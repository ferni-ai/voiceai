/**
 * Session Manager
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Handles creation and lifecycle of per-conversation sessions.
 * Each session gets its own set of services and state.
 *
 * Every session is a new opportunity to connect with someone as a real person,
 * not just another API call. We maintain context, remember history, and bring
 * genuine continuity to each conversation.
 *
 * @see ./session-manager/cleanup.ts - Session cleanup/TTL management
 * @see ./session-manager/constants.ts - Configuration constants
 * @see ./session-manager/validation.ts - User ID validation
 */
import type { SpeechCharacteristics } from '../personas/types.js';
import { clearAllSessions as clearAll, getActiveSessionCount as getActiveCount, getActiveSessionIds as getActiveIds, getSessionServices as getSession } from './session-manager/access.js';
import type { CreateSessionOptions, SessionServices } from './types.js';
/**
 * Start periodic cleanup of orphaned sessions
 * Sessions older than SESSION_MAX_AGE_MS are automatically ended
 */
export declare function startSessionCleanup(): void;
/**
 * Stop periodic session cleanup (for shutdown)
 */
export declare function stopSessionCleanup(): void;
/**
 * Create session services for a new conversation
 */
export declare function createSessionServices(sessionId: string, userId?: string, isReturningUser?: boolean, personaSpeech?: SpeechCharacteristics, personaEnergy?: number, personaId?: string): Promise<SessionServices>;
export declare function createSessionServices(options: CreateSessionOptions): Promise<SessionServices>;
export declare const getSessionServices: typeof getSession;
export declare const getActiveSessionIds: typeof getActiveIds;
export declare const getActiveSessionCount: typeof getActiveCount;
export declare const clearAllSessions: typeof clearAll;
//# sourceMappingURL=session-manager.d.ts.map