/**
 * Context Builder Categories
 *
 * Organizes the 70+ context builders into logical categories
 * for better discoverability, debugging, and documentation.
 *
 * @module intelligence/context-builders/categories
 */
/**
 * Categories for context builders
 *
 * Used to group related builders and enable category-based filtering.
 */
export declare enum BuilderCategory {
    /**
     * SAFETY - Crisis detection, wellbeing alerts
     * Priority: Runs first, can override everything
     */
    SAFETY = "safety",
    /**
     * EMOTIONAL - Emotion detection, validation, support
     * Priority: High - informs tone and approach
     */
    EMOTIONAL = "emotional",
    /**
     * VOICE - Voice emotion, prosody, speech adaptation
     * Priority: High - "better than human" listening
     */
    VOICE = "voice",
    /**
     * MEMORY - Cross-session memory, context recall
     * Priority: High - personalization foundation
     */
    MEMORY = "memory",
    /**
     * PERSONA - Persona identity, quirks, vulnerability
     * Priority: Medium - character consistency
     */
    PERSONA = "persona",
    /**
     * COACHING - Life coaching, goals, growth
     * Priority: Medium - domain-specific guidance
     */
    COACHING = "coaching",
    /**
     * COGNITIVE - Cognitive style, distortions, frameworks
     * Priority: Medium - "better than PhD" capabilities
     */
    COGNITIVE = "cognitive",
    /**
     * ENGAGEMENT - Engagement patterns, rituals, games
     * Priority: Medium - relationship building
     */
    ENGAGEMENT = "engagement",
    /**
     * TEAM - Team dynamics, handoffs, availability
     * Priority: Medium - multi-persona coordination
     */
    TEAM = "team",
    /**
     * CONTEXT - Situational awareness, topics, intent
     * Priority: Medium - conversation flow
     */
    CONTEXT = "context",
    /**
     * EXTERNAL - Biometrics, calendar, weather, finance
     * Priority: Low - external data integration
     */
    EXTERNAL = "external",
    /**
     * HUMANIZING - Natural uncertainty, response length, personality
     * Priority: Low - polish and naturalness
     */
    HUMANIZING = "humanizing",
    /**
     * LEARNING - Community learning, wisdom synthesis
     * Priority: Low - collective intelligence
     */
    LEARNING = "learning"
}
/**
 * Maps builder names to their categories
 *
 * This is the canonical mapping. If a builder is not listed here,
 * it defaults to CONTEXT category.
 */
export declare const BUILDER_CATEGORIES: Record<string, BuilderCategory>;
export interface CategoryMetadata {
    name: string;
    description: string;
    priorityRange: {
        min: number;
        max: number;
    };
    builderCount: number;
}
/**
 * Get metadata for a category
 */
export declare function getCategoryMetadata(category: BuilderCategory): CategoryMetadata;
/**
 * Get the category for a builder
 *
 * @param builderName - Name of the builder
 * @returns The builder's category (defaults to CONTEXT)
 */
export declare function getBuilderCategory(builderName: string): BuilderCategory;
/**
 * Get all builders in a category
 *
 * @param category - Category to filter by
 * @returns Array of builder names
 */
export declare function getBuildersInCategory(category: BuilderCategory): string[];
/**
 * Get all categories with their builder counts
 */
export declare function getCategorySummary(): Array<{
    category: BuilderCategory;
    count: number;
}>;
/**
 * Validate that all builders have appropriate priorities for their category
 */
export declare function validateBuilderPriorities(builders: Array<{
    name: string;
    priority: number;
}>): string[];
declare const _default: {
    BuilderCategory: typeof BuilderCategory;
    BUILDER_CATEGORIES: Record<string, BuilderCategory>;
    getBuilderCategory: typeof getBuilderCategory;
    getBuildersInCategory: typeof getBuildersInCategory;
    getCategoryMetadata: typeof getCategoryMetadata;
    getCategorySummary: typeof getCategorySummary;
    validateBuilderPriorities: typeof validateBuilderPriorities;
};
export default _default;
//# sourceMappingURL=categories.d.ts.map