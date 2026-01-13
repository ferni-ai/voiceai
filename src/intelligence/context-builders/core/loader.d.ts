/**
 * Context Builder Loader
 *
 * Auto-discovery and loading of context builders.
 *
 * Benefits over manual import list:
 * - New builders are auto-discovered
 * - Easier to maintain
 * - Clear categorization
 * - Dependency ordering
 *
 * @module intelligence/context-builders/loader
 */
import { BuilderCategory } from './categories.js';
/**
 * Categories that can be conditionally skipped based on feature flags or context.
 * This reduces startup time by not loading builders that won't be used.
 */
export interface ConditionalLoadingConfig {
    /** Skip VOICE category if voice emotion analysis is disabled */
    skipVoiceBuilders: boolean;
    /** Skip EXTERNAL category if no external integrations are configured */
    skipExternalBuilders: boolean;
    /** Skip COACHING category if not in coaching mode */
    skipCoachingBuilders: boolean;
    /** Skip TEAM category for single-persona mode */
    skipTeamBuilders: boolean;
}
/**
 * Configure conditional loading options.
 * Call this before ensureBuildersLoaded() to customize which categories load.
 */
export declare function configureConditionalLoading(config: Partial<ConditionalLoadingConfig>): void;
/**
 * Builder manifest organized by category.
 *
 * Each entry is a module name (without .js extension) that will be dynamically imported.
 * Modules are expected to call registerContextBuilder() on load.
 *
 * Categories are loaded in priority order:
 * 1. SAFETY - Crisis, wellbeing (must run first)
 * 2. EMOTIONAL - Emotion detection
 * 3. VOICE - Voice emotion analysis
 * 4. MEMORY - Cross-session memory
 * 5. PERSONA - Character identity
 * 6. COACHING - Life coaching
 * 7. COGNITIVE - Cognitive patterns
 * 8. ENGAGEMENT - Games, music
 * 9. TEAM - Multi-persona
 * 10. CONTEXT - Topics, intent
 * 11. EXTERNAL - External data
 * 12. HUMANIZING - Natural speech
 * 13. LEARNING - Collective learning
 */
export declare const BUILDER_MANIFEST: Record<BuilderCategory, string[]>;
export interface BuilderLoadReport {
    loaded: number;
    failed: string[];
    skipped: string[];
    durationMs: number;
    loadedAt: number;
}
/**
 * Get all builder module names from the manifest
 */
export declare function getAllBuilderModules(): string[];
/**
 * Get builder modules by category
 */
export declare function getBuilderModulesByCategory(category: BuilderCategory): string[];
/**
 * Ensure all builders are loaded (idempotent)
 *
 * This is the main entry point for lazy loading.
 * Call this before buildConversationContext().
 *
 * NOTE: Uses mutex pattern to prevent race conditions - loadingPromise is set
 * SYNCHRONOUSLY before any await to prevent TOCTOU bugs where multiple callers
 * could both see loadingPromise as null and start concurrent loads.
 */
export declare function ensureBuildersLoaded(): Promise<void>;
/**
 * Get the last builder load report (useful for testing and observability).
 */
export declare function getLastLoadReport(): BuilderLoadReport | null;
/**
 * Force reload all builders (for testing)
 */
export declare function reloadBuilders(): Promise<void>;
/**
 * Check if builders are loaded
 */
export declare function areBuildersLoaded(): boolean;
/**
 * Get loading status
 */
export declare function getLoadingStatus(): {
    loaded: boolean;
    loading: boolean;
    totalModules: number;
};
/**
 * Pre-warm context builders in background at session start.
 * Fire-and-forget - doesn't block session startup.
 *
 * Call this early in session initialization to ensure builders
 * are loaded before the first conversation turn.
 *
 * @example
 * // In session initialization
 * prewarmBuildersInBackground(); // Non-blocking
 */
export declare function prewarmBuildersInBackground(): void;
/**
 * Pre-warm with conditional loading config.
 * Allows session-specific optimization based on session context.
 *
 * @param config - Conditional loading configuration
 */
export declare function prewarmBuildersWithConfig(config: Partial<ConditionalLoadingConfig>): void;
declare const _default: {
    ensureBuildersLoaded: typeof ensureBuildersLoaded;
    reloadBuilders: typeof reloadBuilders;
    areBuildersLoaded: typeof areBuildersLoaded;
    getLoadingStatus: typeof getLoadingStatus;
    getAllBuilderModules: typeof getAllBuilderModules;
    getBuilderModulesByCategory: typeof getBuilderModulesByCategory;
    configureConditionalLoading: typeof configureConditionalLoading;
    prewarmBuildersInBackground: typeof prewarmBuildersInBackground;
    prewarmBuildersWithConfig: typeof prewarmBuildersWithConfig;
    BUILDER_MANIFEST: Record<BuilderCategory, string[]>;
};
export default _default;
//# sourceMappingURL=loader.d.ts.map