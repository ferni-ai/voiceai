/**
 * Agent Tool Builder
 *
 * Builds tool sets for agents based on their manifest configuration.
 * This replaces the hard-coded switch statements in factory.ts with
 * a configuration-driven approach.
 *
 * USAGE:
 *
 * // Build tools for an agent based on their manifest
 * const tools = await buildAgentTools('ferni');
 *
 * // Build tools with custom context
 * const tools = await buildAgentTools('maya-santos', {
 *   userId: 'user-123',
 *   services: myServiceRegistry
 * });
 */

import { getLogger } from '../utils/safe-logger.js';

// Alias for backwards compatibility
const log = getLogger;
import { toolRegistry } from './registry/index.js';
import { initializeToolRegistry } from './registry/loader.js';
import type {
  ToolContext,
  ToolDomain,
  ToolSetSpec,
  ToolSetResult,
  ServiceRegistry,
  Tool,
} from './registry/types.js';
import { EmptyServiceRegistry } from './registry/types.js';

// Safe logger
const getLogger = () => {
  try {
    return log();
  } catch {
    return {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
  }
};

// ============================================================================
// MANIFEST TYPES (simplified reference to avoid circular deps)
// ============================================================================

interface AgentManifestTools {
  domains?: ToolDomain[];
  required?: string[];
  optional?: string[];
  forbidden?: string[];
  domain_config?: Record<string, Record<string, unknown>>;
}

interface AgentManifestRole {
  can_handoff?: boolean;
  handoff_targets?: string[];
}

interface AgentManifest {
  identity: {
    id: string;
    name: string;
    display_name: string;
  };
  tools?: AgentManifestTools;
  role?: AgentManifestRole;
  capabilities?: Record<string, boolean>;
}

// ============================================================================
// BUILD OPTIONS
// ============================================================================

export interface BuildToolsOptions {
  /** User ID for context */
  userId?: string;

  /** Service registry for external services */
  services?: ServiceRegistry;

  /** Override manifest tools spec */
  toolsOverride?: Partial<ToolSetSpec>;

  /** Include experimental tools */
  includeExperimental?: boolean;

  /** Skip registry initialization (if already done) */
  skipRegistryInit?: boolean;

  /** Manifest to use (if already loaded) */
  manifest?: AgentManifest;
}

// ============================================================================
// MANIFEST LOADING
// ============================================================================

/**
 * Load agent manifest by ID
 * Uses the bundle loader to get the manifest
 */
async function loadAgentManifest(agentId: string): Promise<AgentManifest | null> {
  try {
    // Try to import from bundles
    const { loadBundleById } = await import('../personas/bundles/loader.js');
    const bundle = await loadBundleById(agentId);

    if (bundle) {
      return bundle.manifest as unknown as AgentManifest;
    }
  } catch (error) {
    getLogger().warn({ agentId, error }, 'Could not load manifest from bundle');
  }

  // Return null if not found
  return null;
}

// ============================================================================
// DEFAULT DOMAINS BY AGENT TYPE
// ============================================================================

/**
 * Default domains for common agent archetypes
 * Used when manifest doesn't specify domains
 */
const DEFAULT_DOMAINS_BY_ROLE: Record<string, ToolDomain[]> = {
  // Life coach / coordinator
  'life-coach': ['memory', 'handoff', 'productivity', 'wellness'],

  // Investment advisor
  'investment-advisor': ['memory', 'finance', 'research', 'information'],

  // Communication specialist
  'communication-specialist': ['memory', 'calendar', 'communication', 'productivity'],

  // Budget / habits coach
  'budget-coach': ['memory', 'habits', 'finance', 'productivity'],

  // Life planning
  'life-planner': ['memory', 'life-planning', 'calendar', 'productivity'],

  // Research analyst
  researcher: ['memory', 'research', 'finance', 'information'],

  // Default (minimal)
  default: ['memory', 'information'],
};

/**
 * Get default domains for an agent based on role
 */
function getDefaultDomainsForRole(roleId?: string): ToolDomain[] {
  if (roleId && DEFAULT_DOMAINS_BY_ROLE[roleId]) {
    return DEFAULT_DOMAINS_BY_ROLE[roleId];
  }
  return DEFAULT_DOMAINS_BY_ROLE.default;
}

// ============================================================================
// HANDOFF TOOLS BUILDER
// ============================================================================

/**
 * Build handoff tools based on manifest configuration
 */
async function buildHandoffTools(
  manifest: AgentManifest,
  ctx: ToolContext
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  if (!manifest.role?.can_handoff) {
    return tools;
  }

  // Get handoff targets
  const targets = manifest.role.handoff_targets || [];
  const allTargets = targets.includes('*');

  // Import handoff tool creator from new modular system
  try {
    const { createHandoffTools } = await import('./handoff/index.js');
    const handoffToolSet = await createHandoffTools();

    // Include all handoff tools if '*' or filter by targets
    for (const toolDef of handoffToolSet.tools) {
      if (allTargets) {
        tools[toolDef.name] = toolDef as unknown as Tool;
      } else {
        // Match tool name to target (e.g., handoffToMayaSantos -> maya-santos)
        const targetMatch = toolDef.name.match(/handoffTo(\w+)/i);
        if (targetMatch) {
          const targetName = targetMatch[1].toLowerCase();
          if (targets.some((t: string) => t.toLowerCase().replace('-', '').includes(targetName.replace('-', '')))) {
            tools[toolDef.name] = toolDef as unknown as Tool;
          }
        } else if (toolDef.name === 'meetTheTeam') {
          // Always include meetTheTeam
          tools[toolDef.name] = toolDef as unknown as Tool;
        }
      }
    }
  } catch (error) {
    getLogger().warn({ error }, 'Could not load handoff tools');
  }

  return tools;
}

// ============================================================================
// MAIN BUILDER FUNCTION
// ============================================================================

/**
 * Build tools for an agent based on their manifest
 */
export async function buildAgentTools(
  agentId: string,
  options: BuildToolsOptions = {}
): Promise<Record<string, Tool>> {
  const startTime = Date.now();

  // Initialize registry if needed
  if (!options.skipRegistryInit && !toolRegistry.isInitialized()) {
    await initializeToolRegistry();
  }

  // Load or use provided manifest
  const manifest = options.manifest || (await loadAgentManifest(agentId));

  if (!manifest) {
    getLogger().warn({ agentId }, 'No manifest found, using default tools');
    // Return minimal tools for unknown agents
    return toolRegistry.buildSimple(['memory', 'information'], {
      userId: options.userId || 'default',
      agentId,
      agentDisplayName: agentId,
      services: options.services,
    });
  }

  // Build tool context
  const ctx: ToolContext = {
    userId: options.userId || 'default',
    agentId: manifest.identity.id,
    agentDisplayName: manifest.identity.display_name,
    services: options.services || new EmptyServiceRegistry(),
    agentManifest: {
      identity: manifest.identity,
      tools: manifest.tools,
    },
    domainConfig: manifest.tools?.domain_config,
  };

  // Build tool spec from manifest
  const manifestSpec: ToolSetSpec = {
    domains: manifest.tools?.domains || getDefaultDomainsForRole(manifest.role?.handoff_targets?.[0]),
    required: manifest.tools?.required || [],
    optional: manifest.tools?.optional || [],
    forbidden: manifest.tools?.forbidden || [],
    domainConfig: manifest.tools?.domain_config as Record<ToolDomain, Record<string, unknown>>,
  };

  // Apply overrides
  const finalSpec: ToolSetSpec = {
    ...manifestSpec,
    ...options.toolsOverride,
    // Merge arrays rather than replace
    domains: [
      ...new Set([...(manifestSpec.domains || []), ...(options.toolsOverride?.domains || [])]),
    ],
    required: [
      ...new Set([...(manifestSpec.required || []), ...(options.toolsOverride?.required || [])]),
    ],
    forbidden: [
      ...new Set([...(manifestSpec.forbidden || []), ...(options.toolsOverride?.forbidden || [])]),
    ],
  };

  // Build main tools from registry
  const result: ToolSetResult = toolRegistry.buildToolSet(finalSpec, ctx);

  // Add handoff tools if enabled
  const handoffTools = await buildHandoffTools(manifest, ctx);

  // Merge tools
  const allTools = {
    ...result.tools,
    ...handoffTools,
  };

  const elapsed = Date.now() - startTime;
  getLogger().info(
    {
      agentId: manifest.identity.id,
      displayName: manifest.identity.display_name,
      toolCount: Object.keys(allTools).length,
      domains: finalSpec.domains,
      skipped: result.skipped.length,
      elapsed,
    },
    'Agent tools built'
  );

  // Log warnings
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      getLogger().warn({ agentId, warning }, 'Tool build warning');
    }
  }

  return allTools;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Build tools with a simple domain list (no manifest needed)
 */
export async function buildToolsForDomains(
  domains: ToolDomain[],
  options: {
    userId?: string;
    agentId?: string;
    agentDisplayName?: string;
    services?: ServiceRegistry;
  } = {}
): Promise<Record<string, Tool>> {
  // Initialize registry if needed
  if (!toolRegistry.isInitialized()) {
    await initializeToolRegistry();
  }

  return toolRegistry.buildSimple(domains, {
    userId: options.userId || 'default',
    agentId: options.agentId || 'custom',
    agentDisplayName: options.agentDisplayName || 'Custom Agent',
    services: options.services,
  });
}

/**
 * Check if an agent has a specific tool
 */
export function agentHasTool(manifest: AgentManifest, toolId: string): boolean {
  // Check if explicitly forbidden
  if (manifest.tools?.forbidden?.includes(toolId)) {
    return false;
  }

  // Check if explicitly required
  if (manifest.tools?.required?.includes(toolId)) {
    return true;
  }

  // Check if in one of the agent's domains
  const tool = toolRegistry.get(toolId);
  if (tool && manifest.tools?.domains?.includes(tool.domain)) {
    return true;
  }

  return false;
}

/**
 * Get available tools for an agent (metadata only)
 */
export async function getAvailableToolsForAgent(
  agentId: string
): Promise<Array<{ id: string; name: string; domain: ToolDomain }>> {
  const manifest = await loadAgentManifest(agentId);
  if (!manifest) return [];

  const domains = manifest.tools?.domains || getDefaultDomainsForRole();
  const forbidden = new Set(manifest.tools?.forbidden || []);

  const tools = toolRegistry.query({ domains });

  return tools
    .filter((t) => !forbidden.has(t.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      domain: t.domain,
    }));
}

// ============================================================================
// TEAM TOOLS BUILDER
// ============================================================================

/**
 * Build tools for all team members at once
 * This replaces the parallel createPersonaTools() calls in voice-agent.ts
 */
export async function buildAllTeamTools(options: {
  userId?: string;
  services?: ServiceRegistry;
  /** Team member agent IDs (defaults to standard Ferni team) */
  teamMembers?: string[];
  /** Skip registry initialization */
  skipRegistryInit?: boolean;
} = {}): Promise<{
  tools: Record<string, Tool>;
  byAgent: Record<string, Record<string, Tool>>;
  stats: {
    totalTools: number;
    uniqueTools: number;
    byAgent: Record<string, number>;
  };
}> {
  const startTime = Date.now();

  // Initialize registry if needed
  if (!options.skipRegistryInit && !toolRegistry.isInitialized()) {
    await initializeToolRegistry();
  }

  // Default team members
  const teamMembers = options.teamMembers || [
    'ferni',
    'maya-santos',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
    'peter-john',
  ];

  const byAgent: Record<string, Record<string, Tool>> = {};
  const allTools: Record<string, Tool> = {};
  const statsByAgent: Record<string, number> = {};

  // Build tools for each team member in parallel
  const results = await Promise.allSettled(
    teamMembers.map(async (agentId) => {
      const tools = await buildAgentTools(agentId, {
        userId: options.userId,
        services: options.services,
        skipRegistryInit: true, // Already initialized
      });
      return { agentId, tools };
    })
  );

  // Collect results
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { agentId, tools } = result.value;
      byAgent[agentId] = tools;
      statsByAgent[agentId] = Object.keys(tools).length;

      // Merge into allTools (later agents override earlier for conflicts)
      Object.assign(allTools, tools);
    } else {
      getLogger().warn({ error: result.reason }, 'Failed to build tools for agent');
    }
  }

  const elapsed = Date.now() - startTime;
  const uniqueTools = Object.keys(allTools).length;
  const totalTools = Object.values(statsByAgent).reduce((sum, n) => sum + n, 0);

  getLogger().info(
    {
      teamMembers: teamMembers.length,
      uniqueTools,
      totalTools,
      elapsed,
    },
    'Team tools built'
  );

  return {
    tools: allTools,
    byAgent,
    stats: {
      totalTools,
      uniqueTools,
      byAgent: statsByAgent,
    },
  };
}

/**
 * Build essential tools (always available, minimal set)
 * This replaces createEssentialTools() in factory.ts
 */
export async function buildEssentialTools(options: {
  userId?: string;
  services?: ServiceRegistry;
} = {}): Promise<Record<string, Tool>> {
  // Initialize registry if needed
  if (!toolRegistry.isInitialized()) {
    await initializeToolRegistry();
  }

  // Essential tools are a minimal set that every agent should have
  return toolRegistry.buildSimple(['memory', 'handoff'], {
    userId: options.userId || 'default',
    agentId: 'essential',
    agentDisplayName: 'Essential',
    services: options.services,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { AgentManifest, AgentManifestTools };
export { getDefaultDomainsForRole };

export default buildAgentTools;

