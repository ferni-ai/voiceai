/**
 * Persona Modes Service
 *
 * Implements persona mode switching (listening, advising, exploring, etc.)
 * with mode-specific behavior modifiers and transition phrases.
 */
export type PersonaMode = 'listening' | 'advising' | 'exploring' | 'challenging' | 'celebrating' | 'storytelling' | 'comforting';
export interface ModeConfig {
    pace: 'slow' | 'moderate' | 'normal' | 'fast';
    questionFrequency: 'none' | 'minimal' | 'some' | 'many';
    responseStyle: 'reflective' | 'directive' | 'curious' | 'supportive' | 'enthusiastic';
    pauseMultiplier: number;
}
export interface ModeTransition {
    from: PersonaMode;
    to: PersonaMode;
    phrase?: string;
    timestamp: Date;
}
export interface ModeContext {
    personaId: string;
    userMessage: string;
    currentMode: PersonaMode;
    turnCount: number;
    recentModes: PersonaMode[];
}
/**
 * Detect suggested mode from user message
 */
export declare function detectSuggestedMode(userMessage: string): PersonaMode | null;
/**
 * Get current mode for a session
 */
export declare function getCurrentMode(sessionId: string): PersonaMode;
/**
 * Set mode for a session
 */
export declare function setMode(sessionId: string, mode: PersonaMode): void;
/**
 * Get mode configuration
 */
export declare function getModeConfig(mode: PersonaMode): ModeConfig;
/**
 * Get mode transition phrase from persona behaviors
 */
export declare function getModeTransitionPhrase(personaId: string, toMode: PersonaMode): Promise<string | null>;
/**
 * Get mode switching check-in phrase
 */
export declare function getModeCheckInPhrase(personaId: string): Promise<string | null>;
/**
 * Recommend mode transition based on context
 */
export declare function recommendModeTransition(context: ModeContext): {
    shouldTransition: boolean;
    suggestedMode?: PersonaMode;
    reason?: string;
};
/**
 * Apply mode modifiers to a response
 */
export declare function applyModeModifiers(response: string, mode: PersonaMode): string;
/**
 * Clear session mode tracking
 */
export declare function clearSessionMode(sessionId: string): void;
/**
 * Get mode history for a session
 */
export declare function getModeHistory(sessionId: string): ModeTransition[];
export declare const PersonaModesService: {
    detect: typeof detectSuggestedMode;
    getCurrent: typeof getCurrentMode;
    set: typeof setMode;
    getConfig: typeof getModeConfig;
    getTransitionPhrase: typeof getModeTransitionPhrase;
    getCheckInPhrase: typeof getModeCheckInPhrase;
    recommendTransition: typeof recommendModeTransition;
    applyModifiers: typeof applyModeModifiers;
    clearSession: typeof clearSessionMode;
    getHistory: typeof getModeHistory;
};
export default PersonaModesService;
//# sourceMappingURL=persona-modes.d.ts.map