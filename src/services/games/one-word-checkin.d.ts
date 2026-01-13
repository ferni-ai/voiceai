/**
 * 📍 One Word Check-in Implementation
 *
 * The simplest reflection: one word that captures where you are right now.
 * Ferni then gently explores what that word holds.
 *
 * Perfect for: quick emotional check-ins, daily practice, low-barrier reflection
 */
import type { TextGameResult } from './text-game-types.js';
export interface OneWordCheckinState {
    /** Current phase */
    phase: 'prompt' | 'explore' | 'complete';
    /** The prompt context */
    context: 'now' | 'today' | 'week' | 'feeling' | 'body' | 'custom';
    /** Custom context if provided */
    customContext?: string;
    /** The word they chose */
    word?: string;
    /** Their exploration response */
    exploration?: string;
    /** Whether concluded */
    concluded: boolean;
}
export interface OneWordCheckinResult extends TextGameResult {
    newState: OneWordCheckinState;
}
export declare function createInitialState(context?: OneWordCheckinState['context'], customContext?: string): OneWordCheckinState;
export declare function processInput(state: OneWordCheckinState, input: string): OneWordCheckinResult;
/**
 * Describe current state for voice
 */
export declare function describeStateForVoice(state: OneWordCheckinState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: OneWordCheckinState): OneWordCheckinResult;
/**
 * Get the check-in result (for saving)
 */
export declare function getCheckinResult(state: OneWordCheckinState): {
    word?: string;
    exploration?: string;
};
//# sourceMappingURL=one-word-checkin.d.ts.map