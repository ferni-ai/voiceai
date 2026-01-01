/**
 * Dynamic Tool Loader - Type Definitions
 *
 * Types and interfaces for the dynamic tool loading system.
 */

import type { ToolDomain } from '../registry/types.js';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface DynamicLoaderConfig {
  /** Domains that are always loaded (never unloaded) */
  essentialDomains: ToolDomain[];
  /** How long (ms) before unloading inactive domains */
  unloadAfterMs: number;
  /** Maximum domains to have loaded at once (excluding essential) */
  maxLoadedDomains: number;
  /** Enable automatic unloading */
  enableAutoUnload: boolean;
}

// ============================================================================
// STATE TYPES
// ============================================================================

export interface LoadedDomainState {
  domain: ToolDomain;
  loadedAt: Date;
  lastUsedAt: Date;
  toolCount: number;
  isEssential: boolean;
}

export interface TopicDetectionResult {
  detectedTopics: string[];
  suggestedDomains: ToolDomain[];
  confidence: number;
}

// ============================================================================
// STATUS TYPES
// ============================================================================

export interface DynamicLoaderStatus {
  loadedDomains: LoadedDomainState[];
  totalTools: number;
  config: DynamicLoaderConfig;
}
