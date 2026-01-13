/**
 * Tool Content Integration
 *
 * Integrates PhD-level research and persona methodologies into tool execution.
 * This is the bridge between the content layer and the tool layer.
 *
 * Usage in a tool:
 *   const context = await getEnhancedToolContext(ctx.agentId, 'boundaries', userMessage);
 *   // context includes: research, methodology, personaPhrases, relevantFrameworks
 */
import { type Framework, type DomainResearch, type PersonaMethodology } from './content/content-loader.js';
import { type LifeCoachingProfile } from './user-profile.js';
export interface EnhancedToolContext {
    research: DomainResearch | null;
    frameworks: Framework[];
    randomInsight: string | null;
    methodology: PersonaMethodology | null;
    personaPhrases: {
        opening: string[];
        validation: string[];
        reframe: string[];
        encouragement: string[];
    };
    userProfile: LifeCoachingProfile | null;
    detectedTendency: {
        tendency: string;
        confidence: number;
    } | null;
    tendencyApproach: {
        strength: string;
        challenge: string;
        approach: string;
    } | null;
    getFramework: (id: string) => Promise<Framework | null>;
    getPhrases: (category: string) => Promise<string[]>;
}
/**
 * Get enhanced context for a life coaching tool execution.
 * This provides the tool with research, methodology, and user personalization.
 */
export declare function getEnhancedToolContext(personaId: string, domain: string, userMessage?: string, userId?: string): Promise<EnhancedToolContext>;
/**
 * Get a random phrase from a category, with fallback
 */
export declare function getRandomPhrase(phrases: string[], fallback: string): string;
/**
 * Build a response with research-backed content
 */
export declare function buildResearchBackedResponse(coreMessage: string, context: EnhancedToolContext, options?: {
    includeInsight?: boolean;
    includeFramework?: string;
    includeTendencyAdaptation?: boolean;
}): string;
/**
 * Get opening phrase appropriate for persona and domain
 */
export declare function getOpeningPhrase(context: EnhancedToolContext): string;
/**
 * Get validation phrase appropriate for persona and domain
 */
export declare function getValidationPhrase(context: EnhancedToolContext): string;
/**
 * Get encouragement phrase appropriate for persona and domain
 */
export declare function getEncouragementPhrase(context: EnhancedToolContext): string;
/**
 * Format a framework for conversational use
 */
export declare function formatFrameworkForSpeech(framework: Framework): string;
/**
 * Get expert citation for credibility
 */
export declare function getExpertReference(research: DomainResearch | null): string | null;
/**
 * Get CBT cognitive distortions for anger/perfectionism tools
 */
export declare function getCognitiveDistortionContext(): Promise<{
    distortions: Array<{
        name: string;
        description: string;
        example: string;
    }>;
    formatForSpeech: (distortion: {
        name: string;
        description: string;
    }) => string;
}>;
/**
 * Get DBT skills for boundaries/anger tools
 */
export declare function getDBTSkillContext(): Promise<{
    dearMan: string[];
    distressTolerance: string[];
}>;
/**
 * Get attachment styles for relationships/dating tools
 */
export declare function getAttachmentContext(): Promise<{
    styles: Array<{
        style: string;
        internalModel: string;
        inRelationships: string;
    }>;
    describeStyle: (style: string) => string;
}>;
declare const _default: {
    getEnhancedToolContext: typeof getEnhancedToolContext;
    getRandomPhrase: typeof getRandomPhrase;
    buildResearchBackedResponse: typeof buildResearchBackedResponse;
    getOpeningPhrase: typeof getOpeningPhrase;
    getValidationPhrase: typeof getValidationPhrase;
    getEncouragementPhrase: typeof getEncouragementPhrase;
    formatFrameworkForSpeech: typeof formatFrameworkForSpeech;
    getExpertReference: typeof getExpertReference;
    getCognitiveDistortionContext: typeof getCognitiveDistortionContext;
    getDBTSkillContext: typeof getDBTSkillContext;
    getAttachmentContext: typeof getAttachmentContext;
};
export default _default;
//# sourceMappingURL=tool-content-integration.d.ts.map