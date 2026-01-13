/**
 * Superhuman Communication Tools - Better Than Human
 *
 * 10 communication capabilities that exceed what any human friend can provide.
 *
 * These tools give Alex superhuman abilities:
 *
 * 1. Communication Archaeology - Perfect recall of past conversations
 * 2. Relationship Temperature - Track gradual drift in relationships
 * 3. Unsaid Words Detector - Notice what they DON'T say
 * 4. Reception Predictor - Predict how messages will land
 * 5. Apology Effectiveness - Learn what works per person
 * 6. Conflict Replay - Objective conflict analysis
 * 7. Communication Debt - Track all obligations
 * 8. Third-Party Perspective - Truly neutral viewpoints
 * 9. Strategic Silence - Know when NOT to communicate
 * 10. Unspoken Needs - Surface underlying needs
 *
 * @module tools/domains/communication/superhuman-tools
 */
export { communicationArchaeology } from './communication-archaeology.js';
export { relationshipTemperature } from './relationship-temperature.js';
export { unsaidWordsDetector } from './unsaid-words-detector.js';
export { receptionPredictor } from './reception-predictor.js';
export { apologyEffectiveness } from './apology-effectiveness.js';
export { conflictReplay } from './conflict-replay.js';
export { communicationDebt } from './communication-debt.js';
export { thirdPartyPerspective } from './third-party-perspective.js';
export { strategicSilence } from './strategic-silence.js';
export { unspokenNeeds } from './unspoken-needs.js';
export { createSuperhumanCommunicationTools, getToolDefinitions, domain as llmToolsDomain, definitions as llmToolsDefinitions, } from './llm-tools.js';
export type * from './types.js';
/**
 * Build unified superhuman communication context for Alex.
 *
 * This combines all 10 capabilities into a single context string
 * for LLM injection.
 */
export declare function buildSuperhumanCommunicationContext(userId: string, options?: {
    includeAll?: boolean;
    contactName?: string;
    maxLength?: number;
}): Promise<string>;
/**
 * Build quick superhuman context (lightweight, for every turn).
 */
export declare function buildQuickCommunicationContext(userId: string): Promise<string>;
/**
 * Get a summary of what superhuman communication capabilities are available.
 */
export declare function getSuperhumanCapabilitiesSummary(): string;
export declare const superhumanCommunication: {
    buildContext: typeof buildSuperhumanCommunicationContext;
    buildQuickContext: typeof buildQuickCommunicationContext;
    getCapabilitiesSummary: typeof getSuperhumanCapabilitiesSummary;
};
export default superhumanCommunication;
//# sourceMappingURL=index.d.ts.map