/**
 * Values-Centered Coaching
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Helps users identify and align with their core values.
 * Based on ACT (Acceptance and Commitment Therapy) values work.
 *
 * Philosophy:
 * - Values ≠ Goals (values are directions, not destinations)
 * - Living aligned with values = flourishing
 * - Values clarify difficult decisions
 *
 * @module ValuesCoaching
 */
export type ValueDomain = 'relationships' | 'work' | 'health' | 'growth' | 'leisure' | 'spirituality' | 'community' | 'environment';
export interface Value {
    id: string;
    name: string;
    description: string;
    domain: ValueDomain;
    importance: number;
    currentAlignment: number;
    examples: string[];
}
export interface ValuesProfile {
    userId: string;
    identifiedValues: Value[];
    topValues: string[];
    valuesExploration: Array<{
        date: Date;
        prompt: string;
        response?: string;
    }>;
    alignmentHistory: Array<{
        date: Date;
        valueId: string;
        alignmentScore: number;
        context?: string;
    }>;
    valueConflicts: Array<{
        value1: string;
        value2: string;
        context: string;
        resolved?: boolean;
        resolution?: string;
    }>;
}
/**
 * Generate a values exploration prompt
 */
export declare function getValuesExplorationPrompt(userId: string): {
    prompt: string;
    context: string;
    ssml: string;
};
/**
 * Record response to values exploration
 */
export declare function recordValuesExplorationResponse(userId: string, prompt: string, response: string): void;
/**
 * Identify a value for a user
 */
export declare function identifyValue(userId: string, valueName: string, domain: ValueDomain, importance?: number): Value;
/**
 * Get values suggestions based on conversation
 */
export declare function suggestValuesFromConversation(userMessage: string): Array<{
    value: string;
    domain: ValueDomain;
    confidence: number;
}>;
/**
 * Record alignment with a value
 */
export declare function recordValueAlignment(userId: string, valueName: string, alignmentScore: number, context?: string): void;
/**
 * Get values with low alignment (potential growth areas)
 */
export declare function getLowAlignmentValues(userId: string): Value[];
/**
 * Generate values check for a decision
 */
export declare function generateValuesCheck(userId: string, decision: string): {
    questions: string[];
    relevantValues: Value[];
    ssml: string;
};
/**
 * Build LLM context for values coaching
 */
export declare function buildValuesContext(userId: string): string | null;
export declare function exportValuesProfile(userId: string): ValuesProfile | null;
export declare function importValuesProfile(profile: ValuesProfile): void;
declare const _default: {
    getValuesExplorationPrompt: typeof getValuesExplorationPrompt;
    recordValuesExplorationResponse: typeof recordValuesExplorationResponse;
    identifyValue: typeof identifyValue;
    suggestValuesFromConversation: typeof suggestValuesFromConversation;
    recordValueAlignment: typeof recordValueAlignment;
    getLowAlignmentValues: typeof getLowAlignmentValues;
    generateValuesCheck: typeof generateValuesCheck;
    buildValuesContext: typeof buildValuesContext;
    exportValuesProfile: typeof exportValuesProfile;
    importValuesProfile: typeof importValuesProfile;
};
export default _default;
//# sourceMappingURL=values-coaching.d.ts.map