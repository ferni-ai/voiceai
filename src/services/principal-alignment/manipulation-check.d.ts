/**
 * Manipulation Self-Check
 *
 * > "If you're asking because you think you know where it should go, stop. That's manipulation dressed as curiosity."
 *
 * This system analyzes our own responses for potentially manipulative patterns.
 * A principal-aligned agent doesn't just avoid being manipulated—it avoids manipulating.
 *
 * Key insight: Sometimes "being helpful" is actually steering toward hidden agendas.
 *
 * @module @ferni/principal-alignment/manipulation-check
 */
import type { ManipulationCheckResult, ManipulationRisk } from './types.js';
/**
 * Patterns that indicate leading questions
 */
declare const LEADING_QUESTION_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    severity: number;
}>;
/**
 * Patterns that indicate false validation
 */
declare const FALSE_VALIDATION_PATTERNS: Array<{
    pattern: RegExp;
    context: string;
    severity: number;
}>;
/**
 * Patterns that indicate emotional exploitation
 */
declare const EMOTIONAL_EXPLOITATION_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    severity: number;
}>;
/**
 * Patterns that indicate truth avoidance
 */
declare const TRUTH_AVOIDANCE_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    severity: number;
}>;
/**
 * Patterns that indicate dependency creation
 */
declare const DEPENDENCY_CREATION_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    severity: number;
}>;
/**
 * Patterns that indicate premature closure
 */
declare const PREMATURE_CLOSURE_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    severity: number;
}>;
interface AnalysisContext {
    userMessage: string;
    agentResponse: string;
    turnCount: number;
    userEmotion?: string;
    userVulnerable?: boolean;
    topicWeight?: 'light' | 'medium' | 'heavy';
}
/**
 * Check agent response for manipulation risks
 */
export declare function checkForManipulation(agentResponse: string, context?: Partial<AnalysisContext>): ManipulationCheckResult;
/**
 * Analyze multiple responses for patterns of manipulation
 */
export declare function analyzeConversationPatterns(responses: string[]): {
    overallRisk: number;
    patterns: ManipulationRisk[];
    recommendation: string;
};
/**
 * Quick check for obvious manipulation before sending response
 */
export declare function quickManipulationGuard(response: string): {
    safe: boolean;
    warning?: string;
};
export { LEADING_QUESTION_PATTERNS, FALSE_VALIDATION_PATTERNS, EMOTIONAL_EXPLOITATION_PATTERNS, TRUTH_AVOIDANCE_PATTERNS, DEPENDENCY_CREATION_PATTERNS, PREMATURE_CLOSURE_PATTERNS, };
//# sourceMappingURL=manipulation-check.d.ts.map