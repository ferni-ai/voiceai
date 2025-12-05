/**
 * Team Handler Registry Loader
 *
 * Loads team handlers from:
 * 1. Legacy *-team-handlers.ts files (for backwards compatibility)
 * 2. Agent manifests (new approach)
 *
 * This provides a migration path from the old system to the new one.
 */

import { getLogger } from '../../utils/safe-logger.js';

import type { AgentId } from '../agent-bus.js';
import { teamHandlerRegistry } from './index.js';
import type {
  TeamHandlerDefinition,
  HandlerCapability,
  AgentHandlerConfig,
} from './types.js';


// ============================================================================
// AGENT CAPABILITY MAPPING
// ============================================================================

/**
 * Map agent IDs to their capabilities
 * This is derived from what the legacy handlers do
 */
const AGENT_CAPABILITIES: Record<AgentId, HandlerCapability[]> = {
  // Maya - Financial Habits
  'maya': ['savings-goals', 'budgets', 'expense-tracking', 'financial-status'],
  'maya-santos': ['savings-goals', 'budgets', 'expense-tracking', 'financial-status'],
  'spend-save': ['savings-goals', 'budgets', 'expense-tracking', 'financial-status'],

  // Jordan - Life Planning
  'jordan': ['milestones', 'goals', 'retirement'],
  'jordan-taylor': ['milestones', 'goals', 'retirement'],
  'event-planner': ['milestones', 'goals', 'retirement'],

  // Alex - Communication
  'alex': ['scheduling', 'reminders', 'notifications', 'contacts'],
  'alex-chen': ['scheduling', 'reminders', 'notifications', 'contacts'],
  'comm-specialist': ['scheduling', 'reminders', 'notifications', 'contacts'],

  // Nayan - Wisdom
  'nayan': ['insights'],
  'nayan-patel': ['insights'],

  // Peter John - Research
  'peter': ['insights', 'analysis'],
  'peter-john': ['insights', 'analysis'],

  // Ferni - Coordinator
  'ferni': ['team-status', 'context-sharing', 'escalation'],
  'jack-b': ['team-status', 'context-sharing', 'escalation'],
};

// ============================================================================
// LEGACY HANDLER LOADING
// ============================================================================

/**
 * Load handlers from legacy *-team-handlers.ts files
 * This maintains backwards compatibility during migration
 */
export async function loadLegacyHandlers(): Promise<{
  loaded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let loaded = 0;

  const legacyModules = [
    { agentId: 'maya' as AgentId, module: '../../tools/maya-team-handlers.js' },
    { agentId: 'alex' as AgentId, module: '../../tools/alex-team-handlers.js' },
    { agentId: 'jordan' as AgentId, module: '../../tools/jordan-team-handlers.js' },
    { agentId: 'peter-john' as AgentId, module: '../../tools/peter-team-handlers.js' },
    { agentId: 'ferni' as AgentId, module: '../../tools/ferni-team-handlers.js' },
  ];

  for (const { agentId, module } of legacyModules) {
    try {
      // Configure the agent with their capabilities
      const capabilities = AGENT_CAPABILITIES[agentId] || [];
      teamHandlerRegistry.configureAgent({
        agentId,
        displayName: getDisplayName(agentId),
        capabilities,
        active: true,
      });

      getLogger().debug({ agentId, capabilities }, 'Agent configured from legacy mapping');
      loaded++;
    } catch (error) {
      errors.push(`Failed to configure ${agentId}: ${error}`);
    }
  }

  return { loaded, errors };
}

/**
 * Get display name for an agent
 */
function getDisplayName(agentId: AgentId): string {
  const names: Record<string, string> = {
    maya: 'Maya',
    'maya-santos': 'Maya Santos',
    alex: 'Alex',
    'alex-chen': 'Alex Chen',
    jordan: 'Jordan',
    'jordan-taylor': 'Jordan Taylor',
    'nayan': 'Nayan',
    'nayan-patel': 'Nayan',
    'peter': 'Peter',
    'peter-john': 'Peter John',
    ferni: 'Ferni',
    'jack-b': 'Ferni',
  };
  return names[agentId] || agentId;
}

// ============================================================================
// MANIFEST-BASED LOADING
// ============================================================================

/**
 * Load handlers from agent manifests
 * This is the preferred approach for new agents
 */
export async function loadHandlersFromManifests(): Promise<{
  loaded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let loaded = 0;

  try {
    // Import bundle loader
    const { getCachedBundles } = await import('../../personas/bundles/loader.js');

    // Get all cached bundles (assumes bundles were loaded during persona init)
    const bundles = getCachedBundles();

    for (const bundle of bundles) {
      const manifest = bundle.manifest;
      const agentId = manifest.identity.id as AgentId;

      // Check if manifest has team handler configuration
      const teamConfig = (manifest as any).team_handlers;
      if (!teamConfig) {
        // Skip agents without team handler config
        continue;
      }

      // Configure agent
      teamHandlerRegistry.configureAgent({
        agentId,
        displayName: manifest.identity.display_name,
        capabilities: teamConfig.capabilities || [],
        handlers: teamConfig.handlers || [],
        excludedHandlers: teamConfig.excluded || [],
        active: true,
      });

      getLogger().debug({ agentId }, 'Agent configured from manifest');
      loaded++;
    }
  } catch (error) {
    errors.push(`Failed to load from manifests: ${error}`);
  }

  return { loaded, errors };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the team handler registry
 * Loads from both legacy handlers and manifests
 */
export async function initializeTeamHandlerRegistry(options: {
  loadLegacy?: boolean;
  loadManifests?: boolean;
} = {}): Promise<{
  legacy: { loaded: number; errors: string[] };
  manifests: { loaded: number; errors: string[] };
}> {
  const startTime = Date.now();
  getLogger().info('Initializing team handler registry...');

  const results = {
    legacy: { loaded: 0, errors: [] as string[] },
    manifests: { loaded: 0, errors: [] as string[] },
  };

  // Load legacy handlers (default: true for backwards compatibility)
  if (options.loadLegacy !== false) {
    results.legacy = await loadLegacyHandlers();
  }

  // Load from manifests (default: true)
  if (options.loadManifests !== false) {
    results.manifests = await loadHandlersFromManifests();
  }

  // Mark as initialized
  teamHandlerRegistry.markInitialized();

  const elapsed = Date.now() - startTime;
  const stats = teamHandlerRegistry.getStats();

  getLogger().info(
    {
      legacyAgents: results.legacy.loaded,
      manifestAgents: results.manifests.loaded,
      totalHandlers: stats.totalHandlers,
      activeAgents: stats.activeAgents,
      elapsed,
    },
    'Team handler registry initialized'
  );

  return results;
}

// ============================================================================
// HELPER: WRAP LEGACY HANDLER
// ============================================================================

/**
 * Wrap a legacy handler function in a TeamHandlerDefinition
 * Use this when migrating handlers from legacy files
 */
export function wrapLegacyHandler(
  id: string,
  name: string,
  description: string,
  capability: HandlerCapability,
  execute: TeamHandlerDefinition['execute'],
  options?: {
    additionalCapabilities?: HandlerCapability[];
    executingAgents?: AgentId[];
    tags?: string[];
  }
): TeamHandlerDefinition {
  return {
    id,
    name,
    description,
    capability,
    additionalCapabilities: options?.additionalCapabilities,
    execute,
    executingAgents: options?.executingAgents,
    tags: options?.tags,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadLegacyHandlers,
  loadHandlersFromManifests,
  initializeTeamHandlerRegistry,
  wrapLegacyHandler,
  AGENT_CAPABILITIES,
};

