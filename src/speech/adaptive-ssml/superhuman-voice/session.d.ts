/**
 * Superhuman Voice Session Management
 *
 * Tracks session state for superhuman voice enhancements.
 *
 * @module speech/adaptive-ssml/superhuman-voice/session
 */
import type { SuperhumanVoiceResult, SuperhumanVoiceSession } from './types.js';
/**
 * Get or create session state for superhuman voice.
 */
export declare function getSuperhmanVoiceSession(sessionId: string): SuperhumanVoiceSession;
/**
 * Update session after applying enhancements.
 */
export declare function updateSuperhmanVoiceSession(sessionId: string, result: SuperhumanVoiceResult, currentEmotion?: string): void;
/**
 * Get the last emotion for a session (for transition bridges).
 */
export declare function getLastEmotion(sessionId: string): string | null;
/**
 * Reset session state.
 */
export declare function resetSuperhmanVoiceSession(sessionId: string): void;
/**
 * Reset all sessions.
 */
export declare function resetAllSuperhmanVoiceSessions(): void;
/**
 * Get active session count.
 */
export declare function getActiveSuperhmanVoiceSessionCount(): number;
//# sourceMappingURL=session.d.ts.map