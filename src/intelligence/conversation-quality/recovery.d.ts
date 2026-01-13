/**
 * Session Recovery Module
 *
 * Handles dropped calls and session interruptions gracefully.
 * Generates appropriate recovery greetings.
 *
 * @module conversation-quality/recovery
 */
import type { SessionRecoveryState } from './types.js';
/**
 * Generate session recovery state for dropped calls
 */
export declare function createSessionRecoveryState(lastTopic: string | null, lastUserMessage: string | null): SessionRecoveryState;
/**
 * Check if session should attempt recovery
 */
export declare function shouldAttemptRecovery(disconnectedAt: Date | null, maxRecoveryMinutes?: number): boolean;
//# sourceMappingURL=recovery.d.ts.map