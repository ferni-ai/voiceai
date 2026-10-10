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
  /**
   * Maximum domains loaded at once, essential ones included. With 12 essential
   * domains and the default of 10, each topic load evicts the previous topic
   * domain. That is what lets a topic raised again reload and re-offer its
   * tools after later domains pushed them out of the agent's capped tool set;
   * counting only topic domains would leave it "loaded" with its tools gone.
   */
  maxLoadedDomains: number;
  /** Enable automatic unloading */
  enableAutoUnload: boolean;
  /**
   * Tools every session has, whatever domains are loaded (timers, reminders,
   * music, safety...). Built by id, so a tool's whole domain isn't loaded
   * just to have it.
   */
  essentialToolIds?: readonly string[];
  /** Tool id → its domain, to register an essential tool's definitions. */
  domainOfTool?: (toolId: string) => ToolDomain | undefined;
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
