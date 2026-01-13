/**
 * LLM-as-Judge Response Evaluator
 *
 * > "Better than human" requires measurement by something that can understand nuance.
 *
 * This module uses Claude/GPT as an evaluator to assess response quality
 * across multiple dimensions:
 * - Persona voice consistency
 * - Emotional intelligence
 * - Helpfulness
 * - Authenticity
 * - Safety
 * - Context usage
 * - Trust building
 *
 * The evaluator is NOT the same model generating responses - it's a separate
 * judge that can objectively assess quality.
 */
import type { ResponseEvaluation, EvaluationContext, SamplingConfig } from './types.js';
declare function buildEvaluationPrompt(userMessage: string, aiResponse: string, context: EvaluationContext): string;
/**
 * Configuration for the evaluator
 */
interface EvaluatorConfig {
    model: 'claude-3-5-sonnet' | 'claude-3-opus' | 'gpt-4o';
    apiKey?: string;
    maxTokens: number;
    temperature: number;
}
declare const DEFAULT_CONFIG: EvaluatorConfig;
/**
 * Create a heuristic-based evaluation when LLM fails
 */
declare function createHeuristicEvaluation(context: EvaluationContext, aiResponse: string, userMessage: string, startTime: number): ResponseEvaluation;
/**
 * Evaluate a single response
 */
export declare function evaluateResponse(userMessage: string, aiResponse: string, context: EvaluationContext, config?: Partial<EvaluatorConfig>): Promise<ResponseEvaluation>;
/**
 * Quick voice-only evaluation (cheaper, faster)
 */
export declare function evaluateVoiceConsistency(aiResponse: string, personaId: string): {
    score: number;
    issues: string[];
};
/**
 * Determine if a conversation should be sampled for evaluation
 */
export declare function shouldSampleConversation(turnNumber: number, config?: SamplingConfig, metadata?: {
    userReportedIssue?: boolean;
    isLongConversation?: boolean;
    emotionalIntensity?: number;
    isNewUser?: boolean;
}): boolean;
/**
 * Evaluate multiple responses in batch
 */
export declare function evaluateBatch(items: Array<{
    userMessage: string;
    aiResponse: string;
    context: EvaluationContext;
}>, config?: Partial<EvaluatorConfig>): Promise<ResponseEvaluation[]>;
export { buildEvaluationPrompt, createHeuristicEvaluation, DEFAULT_CONFIG as DEFAULT_EVALUATOR_CONFIG, };
//# sourceMappingURL=response-evaluator.d.ts.map