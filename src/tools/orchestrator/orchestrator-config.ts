/**
 * Configuration constants and factory for the Unified Tool Orchestrator.
 *
 * Extracted from tool-orchestrator.ts for modularity.
 */

import type { ToolDomain } from '../registry/types.js';
import { modelConfig } from '../../services/model-config.js';
import type { OrchestratorConfig } from './orchestrator-types.js';

// Base always-available domains (before filtering by enabledDomains)
// These domains are ALWAYS sent to the LLM - they don't rely on semantic matching
// CRITICAL: Include all user-facing essentials, not just system domains!
// Must stay in sync with ESSENTIAL_DOMAINS in registry/loader.ts
export const BASE_ALWAYS_DOMAINS: ToolDomain[] = [
  // Core system domains
  'memory',
  'handoff',

  // User-facing essential domains (users expect these to ALWAYS work)
  'calendar', // Schedule meetings, events, reminders
  'scheduling', // Scheduling coordination
  'communication', // Send messages, emails
  'telephony', // Make phone calls ("call my mom")
  'productivity', // Todos, notes, tasks
  'family', // Family-related actions, messages

  // Daily wellness & habits (people check these every day!)
  'habits', // "How are my habits?", "Log my workout"
  'wellness', // "I'm stressed", emotional support

  // Entertainment & info
  'entertainment', // Music, media
  'information', // Weather, news, search
  'games', // Name That Tune, Tic-Tac-Toe, etc.
];

export const getDefaultConfig = (): OrchestratorConfig => {
  const adminConfig = modelConfig.getDefaultToolConfig();

  // Determine final alwaysDomains:
  // - If enabledDomains is set (non-empty), filter BASE_ALWAYS_DOMAINS to only include enabled ones
  // - If enabledDomains is empty, use all BASE_ALWAYS_DOMAINS
  let finalAlwaysDomains = BASE_ALWAYS_DOMAINS;
  if (adminConfig.enabledDomains && adminConfig.enabledDomains.length > 0) {
    finalAlwaysDomains = BASE_ALWAYS_DOMAINS.filter((d) => adminConfig.enabledDomains.includes(d));
    // Ensure we always have at least memory and handoff for core functionality
    if (!finalAlwaysDomains.includes('memory')) finalAlwaysDomains.push('memory');
    if (!finalAlwaysDomains.includes('handoff')) finalAlwaysDomains.push('handoff');
  }

  return {
    // Use admin config maxTools. 0 = unlimited (semantic router filters)
    maxTools: adminConfig.maxTools,
    semanticThreshold: 0.15,
    precomputeEmbeddings: true,
    selectionCacheTtlMs: 5 * 60 * 1000, // 5 minutes
    alwaysDomains: finalAlwaysDomains,
    enableABTesting: true,
    enableDeprecationWarnings: true,
    enableContextualTools: true,

    // Pass through all model-config.json settings
    enabledDomains: adminConfig.enabledDomains || [],
    excludedTools: adminConfig.excludedTools || [],
    includedTools: adminConfig.includedTools || [],
    debugMode: adminConfig.debugMode ?? false,
    logToolSchemas: adminConfig.logToolSchemas ?? false,
    logToolResults: adminConfig.logToolResults ?? false,
  };
};

// Keep a static default for cases where we can't read config
export const DEFAULT_CONFIG: OrchestratorConfig = {
  maxTools: 0, // 0 = unlimited, semantic router handles filtering
  semanticThreshold: 0.15,
  precomputeEmbeddings: true,
  selectionCacheTtlMs: 5 * 60 * 1000, // 5 minutes
  alwaysDomains: BASE_ALWAYS_DOMAINS,
  enableABTesting: true,
  enableDeprecationWarnings: true,
  enableContextualTools: true,
  // Defaults for new settings
  enabledDomains: [],
  excludedTools: [],
  includedTools: [],
  debugMode: false,
  logToolSchemas: false,
  logToolResults: false,
};
