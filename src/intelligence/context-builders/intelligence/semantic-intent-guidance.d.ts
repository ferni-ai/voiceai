/**
 * Semantic Intent Guidance Context Builder
 *
 * Uses semantic pattern matching to inject smart guidance into the LLM prompt.
 * This is how we leverage semantic detection WITHOUT direct tool calling:
 *
 * 1. Semantic patterns detect user intent
 * 2. High-confidence matches → inject strong guidance to LLM
 * 3. Medium-confidence → inject hints
 * 4. LLM naturally incorporates guidance into response
 *
 * Benefits:
 * - LLM responses feel natural (not robotic tool calls)
 * - Guidance is contextual and nuanced
 * - User experience is conversational
 * - We don't bypass the LLM's judgment entirely
 *
 * @module SemanticIntentGuidance
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface SemanticIntentMatch {
    intent: string;
    confidence: number;
    guidance: string;
    category: 'handoff' | 'tool' | 'emotional' | 'informational';
}
/**
 * Detect calendar-related intents using the enhanced semantic calendar service
 */
declare function detectCalendarIntent(message: string): SemanticIntentMatch | null;
/**
 * Detect music-related intents
 */
declare function detectMusicIntent(message: string): SemanticIntentMatch | null;
/**
 * Detect crisis/distress signals
 */
declare function detectCrisisIntent(message: string): SemanticIntentMatch | null;
declare function buildSemanticIntentContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
declare const semanticIntentBuilder: {
    name: string;
    description: string;
    priority: number;
    build: typeof buildSemanticIntentContext;
};
export { semanticIntentBuilder, detectCalendarIntent, detectMusicIntent, detectCrisisIntent };
//# sourceMappingURL=semantic-intent-guidance.d.ts.map