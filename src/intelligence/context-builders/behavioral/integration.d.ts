/**
 * Behavioral Context Integration
 *
 * The new context system that replaces the legacy context builders.
 * Produces prompt context that CANNOT leak into speech.
 *
 * THE THREE SYSTEMS:
 *
 * 1. BEHAVIORAL SIGNALS (HOW to behave)
 *    - Tone, pace, style, energy
 *    - No facts that could leak
 *
 * 2. AWARENESS FACTS (WHAT to know)
 *    - Time, user name, session state
 *    - Facts the model SHOULD read and use
 *
 * 3. TOOL GUIDANCE (WHEN to query)
 *    - Available tools and when to use them
 *    - Model asks for data instead of having it pre-loaded
 *
 * @module intelligence/context-builders/behavioral/integration
 */
import type { ContextBuilderInput } from '../core/types.js';
import { type BehavioralResult } from './orchestrator.js';
export interface IntegratedContextResult {
    /**
     * The behavioral directive to include in the prompt.
     * This tells the model HOW to behave (tone, style, pace, etc.)
     */
    behavioralDirective: string;
    /**
     * Awareness facts the model should know.
     * Unlike behavioral signals, these ARE meant to be read.
     */
    awarenessFacts: string;
    /**
     * Tool guidance - what tools are available and when to use them.
     * Teaches the model to ASK for data instead of having it pre-loaded.
     */
    toolGuidance: string;
    /**
     * Compact version for system prompt (if separate from user turn)
     */
    compactDirective: string;
    /**
     * Whether high-emotion mode was activated (reduces noise)
     */
    highEmotionMode: boolean;
    /**
     * Raw behavioral result (for debugging)
     */
    behavioralResult?: BehavioralResult;
    /**
     * Metrics for monitoring
     */
    metrics: {
        mode: 'behavioral';
        behavioralBuildersRun: number;
        totalDurationMs: number;
    };
}
/**
 * Build context using the behavioral system.
 *
 * This is the main entry point for the turn handler and voice agent.
 * It produces three separate outputs:
 * - Behavioral directive (HOW to behave)
 * - Awareness facts (WHAT to know)
 * - Tool guidance (WHEN to query)
 */
export declare function buildIntegratedContext(input: ContextBuilderInput): Promise<IntegratedContextResult>;
/**
 * Quick function to get just the combined prompt context.
 * Combines: Awareness Facts + Behavioral Directive + Tool Guidance
 */
export declare function getPromptContext(input: ContextBuilderInput): Promise<string>;
/**
 * Quick function for system prompt injection
 */
export declare function getSystemPromptContext(input: ContextBuilderInput): Promise<string>;
//# sourceMappingURL=integration.d.ts.map