/**
 * Advice Detector - For Counterfactual Memory
 *
 * Detects when Ferni gives advice in responses so we can track:
 * - What advice was given
 * - Whether user followed it
 * - What the outcome was
 *
 * This enables "Better than Human" insights like:
 * "Last time this pattern started, you didn't rest. Want to try something different?"
 *
 * @module services/superhuman/semantic-intelligence/advice-detector
 */
import { type AgentAdviceContext } from './integration.js';
interface AdviceDetectionResult {
    containsAdvice: boolean;
    adviceText: string | null;
    category: AgentAdviceContext['category'] | null;
    confidence: number;
    matchedPattern: string | null;
}
/**
 * Detect if a response contains advice.
 */
export declare function detectAdvice(responseText: string): AdviceDetectionResult;
/**
 * Analyze agent response for advice and record it if found.
 *
 * Call this from response-processor.ts after the response is finalized.
 *
 * @param responseText - The final response text
 * @param context - Context about the conversation
 */
export declare function trackAdviceInResponse(responseText: string, context: {
    userId: string;
    sessionId: string;
    personaId: string;
    topic?: string;
    userSituation?: string;
    userEmotion?: string;
}): Promise<void>;
export type { AdviceDetectionResult };
//# sourceMappingURL=advice-detector.d.ts.map