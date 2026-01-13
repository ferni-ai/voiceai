/**
 * Brand Generator Service
 *
 * AI-powered content generation that follows brand rules.
 * Uses LLM with brand context to generate on-brand copy.
 *
 * @module @ferni/brand/brand-generator
 */
import type { BrandContext, ContextType, GenerationRequest, GenerationResult, PersonaVoice } from './types.js';
/**
 * Build the complete system prompt for brand-aware generation
 */
export declare function buildBrandSystemPrompt(config: {
    brandContext: BrandContext;
    personaVoice: PersonaVoice;
    contentType: GenerationRequest['type'];
    context: GenerationRequest['context'];
}): string;
/**
 * Generate brand-compliant content
 */
export declare function generateBrandContent(request: GenerationRequest, llmClient?: LLMClient): Promise<GenerationResult>;
/**
 * Generate multiple variants for A/B testing
 */
export declare function generateVariants(request: GenerationRequest, count?: number, llmClient?: LLMClient): Promise<GenerationResult[]>;
/**
 * Generate experiment variants for a specific experiment type
 */
export declare function generateExperimentVariants(experimentType: 'headline' | 'cta' | 'notification', context?: ContextType, llmClient?: LLMClient): Promise<{
    variantId: string;
    content: string;
    score: number;
}[]>;
/**
 * Interface for LLM client
 */
export interface LLMClient {
    generate(params: {
        system: string;
        user: string;
        temperature?: number;
        maxTokens?: number;
    }): Promise<string>;
}
//# sourceMappingURL=brand-generator.d.ts.map