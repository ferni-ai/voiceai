/**
 * Agent Transparency System
 *
 * > "A principal-aligned agent is honest about its own uncertainty and limitations."
 *
 * This system helps agents be appropriately transparent about:
 * - Uncertainty in their assessments
 * - Limitations of their capabilities
 * - Potential biases in their responses
 * - When they're learning from the interaction
 *
 * Key insight: Over-confidence is a form of manipulation.
 *
 * @module @ferni/principal-alignment/agent-transparency
 */
import type { TransparencyRecommendation, TransparencyType } from './types.js';
/**
 * Topics where we should express more uncertainty
 */
declare const LOW_CONFIDENCE_DOMAINS: string[];
/**
 * Topics where we have reasonable expertise
 */
declare const HIGH_CONFIDENCE_DOMAINS: string[];
declare const UNCERTAINTY_EXPRESSIONS: Record<string, string[]>;
declare const LIMITATION_EXPRESSIONS: Record<string, string[]>;
declare const BIAS_ACKNOWLEDGMENTS: Record<string, string[]>;
/**
 * Analyze context and recommend transparency expressions
 */
export declare function analyzeTransparencyNeeds(agentResponse: string, context: {
    userMessage: string;
    topic?: string;
    confidence?: number;
    hasFullContext?: boolean;
    isSpeculatingBeyondData?: boolean;
    userExpectingExpertise?: boolean;
}): TransparencyRecommendation[];
/**
 * Inject appropriate transparency into a response
 */
export declare function injectTransparency(response: string, recommendations: TransparencyRecommendation[]): string;
/**
 * Quick check for critical transparency needs
 */
export declare function quickTransparencyCheck(response: string, userMessage: string): {
    needsTransparency: boolean;
    type?: TransparencyType;
    suggestion?: string;
};
/**
 * Check if response needs "I don't know" insertion
 */
export declare function shouldSayIDontKnow(userMessage: string, context: {
    isFactualQuestion?: boolean;
    hasReliableAnswer?: boolean;
    isOpinionQuestion?: boolean;
}): {
    shouldSay: boolean;
    expression?: string;
};
export { LOW_CONFIDENCE_DOMAINS, HIGH_CONFIDENCE_DOMAINS, UNCERTAINTY_EXPRESSIONS, LIMITATION_EXPRESSIONS, BIAS_ACKNOWLEDGMENTS, };
//# sourceMappingURL=agent-transparency.d.ts.map