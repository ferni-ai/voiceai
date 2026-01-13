/**
 * 🥠 Fortune Cookie Implementation
 *
 * Receive a thought-provoking fortune and reflect on what it means for you.
 * Combines ancient wisdom traditions with modern coaching questions.
 *
 * Perfect for: daily inspiration, perspective shifts, meaning-making
 */
import type { TextGameResult } from './text-game-types.js';
export interface Fortune {
    text: string;
    source?: string;
    category: 'wisdom' | 'growth' | 'relationships' | 'purpose' | 'courage' | 'presence';
}
export interface FortuneCookieState {
    /** Current phase */
    phase: 'opening' | 'revealing' | 'reflecting' | 'closing' | 'complete';
    /** The fortune given */
    fortune?: Fortune;
    /** User's reflection */
    reflection?: string;
    /** Whether they want another */
    wantsAnother?: boolean;
    /** Fortunes seen this session */
    fortunesSeen: Fortune[];
    /** Whether concluded */
    concluded: boolean;
}
export interface FortuneCookieResult extends TextGameResult {
    newState: FortuneCookieState;
}
export declare function createInitialState(): FortuneCookieState;
export declare function processInput(state: FortuneCookieState, input: string): FortuneCookieResult;
/**
 * Describe current state for voice
 */
export declare function describeStateForVoice(state: FortuneCookieState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: FortuneCookieState): FortuneCookieResult;
/**
 * Get fortunes from session (for saving)
 */
export declare function getSessionFortunes(state: FortuneCookieState): Fortune[];
//# sourceMappingURL=fortune-cookie.d.ts.map