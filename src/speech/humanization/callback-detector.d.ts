/**
 * Callback Trigger Detector
 *
 * Detects when user input triggers a persona's callback phrases.
 * Callbacks create relationship continuity by referencing shared history.
 *
 * Example:
 * - User mentions "willpower" → Maya's "systems beat willpower" callback
 * - User asks a deep question → Ferni's "powerful question" callback
 * - User mentions a mistake → Ferni's "second chances" callback
 *
 * @module speech/humanization/callback-detector
 */
export interface CallbackTrigger {
    /** Callback ID from the JSON file */
    id: string;
    /** The trigger keyword/concept that matched */
    trigger: string;
    /** Context description from JSON */
    context: string;
    /** Match confidence (0-1) */
    confidence: number;
}
export interface DetectedCallback {
    /** Callback ID */
    id: string;
    /** Trigger that matched */
    trigger: string;
    /** Whether to use first-use or callback version */
    useCallbackVersion: boolean;
    /** Selected phrase to inject */
    phrase: string;
    /** Confidence of the detection */
    confidence: number;
}
/**
 * Detect callback triggers in user input
 */
export declare function detectCallbackTriggers(userText: string, personaId: string): CallbackTrigger[];
/**
 * Select a callback to inject based on triggers and conversation history
 */
export declare function selectCallback(triggers: CallbackTrigger[], personaId: string, conversationCount: number, usedCallbacks?: Set<string>): DetectedCallback | null;
/**
 * Inject a callback phrase into the beginning of a response
 */
export declare function injectCallback(text: string, callback: DetectedCallback): string;
declare const _default: {
    detectCallbackTriggers: typeof detectCallbackTriggers;
    selectCallback: typeof selectCallback;
    injectCallback: typeof injectCallback;
};
export default _default;
//# sourceMappingURL=callback-detector.d.ts.map