/**
 * Loaded Bundle Types
 *
 * Types for loaded and discovered bundles.
 */
import type { PersonaBundleManifest } from './core.js';
import type { BundleStory, BundleKnowledge, BundleBehaviors } from './content.js';
import type { BundleVoiceExpressions, BundleSituationalResponses, BundleRelationshipStages, BundleMemoryPatterns, BundlePersonaModes, BundleStoryGraph, BundleMicroExpressions, BundleContextualNuances, BundleConflictHandling, BundlePromptAssembly, BundleInnerWorld, BundleSensoryWorld } from './extensions.js';
import type { BundleCommand, BundleLocalTool, BundleAssets, BundleAgentHooks, BundleMCPConfig } from './commands.js';
export interface LoadedPersonaBundle {
    manifest: PersonaBundleManifest;
    bundlePath: string;
    loadedAt: Date;
    getStory: (id: string) => Promise<BundleStory | null>;
    getStoriesByTrigger: (trigger: string) => Promise<BundleStory[]>;
    getAllStories: () => Promise<BundleStory[]>;
    getKnowledge: (topic: string) => Promise<BundleKnowledge | null>;
    getBehaviors: () => Promise<BundleBehaviors>;
    getVoiceExpressions?: () => Promise<BundleVoiceExpressions | null>;
    getSituationalResponses?: () => Promise<BundleSituationalResponses | null>;
    getRelationshipStages?: () => Promise<BundleRelationshipStages | null>;
    getMemoryPatterns?: () => Promise<BundleMemoryPatterns | null>;
    getPersonaModes?: () => Promise<BundlePersonaModes | null>;
    getStoryGraph?: () => Promise<BundleStoryGraph | null>;
    getMicroExpressions?: () => Promise<BundleMicroExpressions | null>;
    getContextualNuances?: () => Promise<BundleContextualNuances | null>;
    getConflictHandling?: () => Promise<BundleConflictHandling | null>;
    getPromptAssembly?: () => Promise<BundlePromptAssembly | null>;
    /** Phase 1: Agent Commands - slash commands specific to this agent */
    getCommands?: () => Promise<BundleCommand[]>;
    /** Phase 2: Local Tools - agent-specific tools bundled with the agent */
    getLocalTools?: () => Promise<BundleLocalTool[]>;
    /** Phase 3: Theme & Assets - custom theme, sounds, and visual assets */
    getAssets?: () => Promise<BundleAssets | null>;
    /** Phase 4: Hooks - lifecycle event handlers */
    getHooks?: () => Promise<BundleAgentHooks | null>;
    /** Phase 5: MCP Config - external tool server configuration
     * @param options.publisherId - Publisher ID for loading API-registered MCP servers
     * @param options.personaId - Persona ID for filtering API-registered servers
     */
    getMCPConfig?: (options?: {
        publisherId?: string;
        personaId?: string;
    }) => Promise<BundleMCPConfig | null>;
    reload: () => Promise<void>;
    onReload: (callback: () => void) => () => void;
}
export interface BundleLoadOptions {
    watchForChanges?: boolean;
    preloadContent?: boolean;
    cacheStories?: boolean;
    /** Force reload from disk even if cached */
    forceReload?: boolean;
}
export interface DiscoveredBundle {
    id: string;
    path: string;
    manifest: PersonaBundleManifest;
    isValid: boolean;
    errors?: string[];
}
export interface BundleDiscoveryResult {
    bundles: DiscoveredBundle[];
    searchPaths: string[];
    errors: string[];
}
export interface ExtendedLoadedBundle extends LoadedPersonaBundle {
    getInnerWorld?: () => Promise<BundleInnerWorld | null>;
    getSensoryWorld?: () => Promise<BundleSensoryWorld | null>;
}
//# sourceMappingURL=loaded.d.ts.map