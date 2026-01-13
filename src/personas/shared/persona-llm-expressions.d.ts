/**
 * Persona-Agnostic LLM Expression Generator
 *
 * Generates dynamic, contextual expressions for ANY persona using LLM.
 * Each persona provides their own voice DNA and themes.
 *
 * Architecture:
 * 1. Load persona's voice-guidance.md as voice DNA
 * 2. Use persona-specific themes and examples
 * 3. Share core LLM generation logic (queue, cache, rate limiting)
 *
 * @module personas/shared/persona-llm-expressions
 */
export interface PersonaExpressionConfig {
    personaId: string;
    voiceDnaPath: string;
    themes: PersonaTheme[];
    aiTells?: string[];
}
export interface PersonaTheme {
    id: string;
    name: string;
    examples: string[];
    contextHints?: string[];
}
export interface ExpressionContext {
    emotion?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'late_night';
    momentum?: 'opening' | 'building' | 'cruising' | 'winding_down' | 'peaking' | 'intimate' | 'closing' | 'stalled';
    relationshipStage?: string;
    topic?: string;
}
export interface GeneratedExpression {
    id: string;
    personaId: string;
    theme: string;
    content: string;
    ssml: string;
    context: ExpressionContext;
    generatedAt: Date;
    usedCount: number;
}
/**
 * Maya Santos - Habit Coach
 * Warm, nurturing, celebrates small wins
 */
export declare const MAYA_CONFIG: PersonaExpressionConfig;
/**
 * Jordan Taylor - Event Planner
 * Upbeat, action-oriented, energy-aware
 */
export declare const JORDAN_CONFIG: PersonaExpressionConfig;
/**
 * Peter John - Research Analyst
 * Analytical, data-driven, curious
 */
export declare const PETER_CONFIG: PersonaExpressionConfig;
/**
 * Alex Chen - Communications Expert
 * Efficient, organized, supportive
 */
export declare const ALEX_CONFIG: PersonaExpressionConfig;
/**
 * Nayan Patel - Wisdom Guide
 * Contemplative, philosophical, grounded
 */
export declare const NAYAN_CONFIG: PersonaExpressionConfig;
export declare const PERSONA_CONFIGS: Record<string, PersonaExpressionConfig>;
/**
 * Generate expressions for a persona using LLM
 */
export declare function generatePersonaExpressions(personaId: string, themes: string[], context: ExpressionContext): Promise<GeneratedExpression[]>;
/**
 * Get an expression from cache for a persona
 */
export declare function getPersonaExpression(personaId: string, themeId: string, context: ExpressionContext): GeneratedExpression | null;
/**
 * Prewarm cache for a persona
 */
export declare function prewarmPersonaExpressions(personaId: string, context: ExpressionContext): Promise<void>;
/**
 * Clear cache for a persona
 */
export declare function clearPersonaCache(personaId: string): void;
/**
 * Check if a persona has LLM expression support
 */
export declare function hasPersonaExpressionSupport(personaId: string): boolean;
//# sourceMappingURL=persona-llm-expressions.d.ts.map