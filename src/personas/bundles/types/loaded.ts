/**
 * Loaded Bundle Types
 *
 * Types for loaded and discovered bundles.
 */

import type { PersonaBundleManifest } from './core.js';
import type { BundleStory, BundleKnowledge, BundleBehaviors } from './content.js';
import type {
  BundleVoiceExpressions,
  BundleSituationalResponses,
  BundleRelationshipStages,
  BundleMemoryPatterns,
  BundlePersonaModes,
  BundleStoryGraph,
  BundleMicroExpressions,
  BundleContextualNuances,
  BundleConflictHandling,
  BundlePromptAssembly,
  BundleInnerWorld,
  BundleSensoryWorld,
} from './extensions.js';

// ============================================================================
// LOADED BUNDLE TYPES
// ============================================================================

export interface LoadedPersonaBundle {
  manifest: PersonaBundleManifest;
  bundlePath: string;
  loadedAt: Date;

  // Accessors for lazy-loaded content
  getStory: (id: string) => Promise<BundleStory | null>;
  getStoriesByTrigger: (trigger: string) => Promise<BundleStory[]>;
  getAllStories: () => Promise<BundleStory[]>;
  getKnowledge: (topic: string) => Promise<BundleKnowledge | null>;
  getBehaviors: () => Promise<BundleBehaviors>;

  // New accessors for extended content
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

  // Hot reload support
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

// ============================================================================
// BUNDLE DISCOVERY
// ============================================================================

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

// ============================================================================
// EXTENDED LOADED BUNDLE
// ============================================================================

export interface ExtendedLoadedBundle extends LoadedPersonaBundle {
  getInnerWorld?: () => Promise<BundleInnerWorld | null>;
  getSensoryWorld?: () => Promise<BundleSensoryWorld | null>;
}
