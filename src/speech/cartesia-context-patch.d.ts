/**
 * Cartesia Context Manager
 *
 * Manages context IDs for Cartesia TTS to enable prosody continuity
 * across TTS streams within a session. This enables Cartesia to maintain
 * intonation, rhythm, and energy across multiple synthesis calls.
 *
 * Usage:
 *   import { setSessionContextId, getSessionContextId } from './cartesia-context-patch.js';
 *
 *   // Set context ID at session start
 *   setSessionContextId('session-123');
 *
 *   // Get context ID for Cartesia TTS options
 *   const contextId = getSessionContextId();
 *
 * Note: This module provides context ID management. The actual application
 * to Cartesia TTS should be done at the TTS creation/configuration level,
 * not via monkeypatching.
 *
 * @see https://docs.cartesia.ai/api-reference/tts/working-with-web-sockets/contexts
 */
/**
 * Generate a unique context ID for Cartesia.
 * Format: ctx_{timestamp}_{random}
 */
export declare function generateContextId(): string;
/**
 * Set the context ID for a specific session.
 * Call this at the start of each voice session.
 *
 * @param sessionId - Unique session identifier
 * @param contextId - Optional custom context ID (auto-generated if not provided)
 * @returns The context ID that was set
 */
export declare function setSessionContextId(sessionId: string, contextId?: string): string;
/**
 * Get the context ID for a specific session.
 *
 * @param sessionId - Session to get context ID for (uses active session if not provided)
 * @returns The context ID, or null if no context set
 */
export declare function getSessionContextId(sessionId?: string): string | null;
/**
 * Clear the context ID for a session (call at session end).
 *
 * @param sessionId - Session to clear (uses active session if not provided)
 */
export declare function clearSessionContextId(sessionId?: string): void;
/**
 * Get or create a context ID for a session.
 * Useful when you want to ensure a context ID exists.
 *
 * @param sessionId - Session identifier
 * @returns The existing or newly created context ID
 */
export declare function getOrCreateContextId(sessionId: string): string;
/**
 * Options to pass to Cartesia TTS for context continuity.
 */
export interface CartesiaContextOptions {
    /** Context ID for prosody continuity */
    contextId: string;
    /** Whether to continue from previous context */
    continueContext: boolean;
}
/**
 * Get Cartesia TTS options with context ID for a session.
 *
 * @param sessionId - Session to get options for
 * @returns Options object to spread into Cartesia TTS config, or undefined if no session
 *
 * @example
 * ```typescript
 * const contextOptions = getCartesiaContextOptions(sessionId);
 * const tts = new cartesia.TTS({
 *   model: 'sonic-3',
 *   voice: voiceId,
 *   ...contextOptions, // Adds context_id if available
 * });
 * ```
 */
export declare function getCartesiaContextOptions(sessionId?: string): CartesiaContextOptions | undefined;
/**
 * Get all active session context IDs (for debugging).
 */
export declare function getAllSessionContexts(): Map<string, string>;
/**
 * Get count of active session contexts.
 */
export declare function getActiveContextCount(): number;
/**
 * Clear all session contexts.
 * Use with caution - typically only for testing or shutdown.
 */
export declare function clearAllContexts(): void;
//# sourceMappingURL=cartesia-context-patch.d.ts.map