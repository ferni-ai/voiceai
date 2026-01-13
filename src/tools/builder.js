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
import { toolRegistry } from './registry/index.js';
import { initializeToolRegistry } from './registry/loader.js';
import { EnvironmentServiceRegistry, } from './registry/types.js';
// ============================================================================
// MANIFEST LOADING
// ============================================================================
/**
 * Load agent manifest by ID
 * Uses the bundle loader to get the manifest
 */
async function loadAgentManifest(agentId) {
    try {
        // Try to import from bundles
        const { loadBundleById } = await import('../personas/bundles/loader.js');
        const bundle = await loadBundleById(agentId);
        if (bundle) {
            return bundle.manifest;
        }
    }
    catch (error) {
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
const DEFAULT_DOMAINS_BY_ROLE = {
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
function getDefaultDomainsForRole(roleId) {
    if (roleId && DEFAULT_DOMAINS_BY_ROLE[roleId]) {
        return DEFAULT_DOMAINS_BY_ROLE[roleId];
    }
    return DEFAULT_DOMAINS_BY_ROLE.default;
}
// ============================================================================
// HANDOFF TOOLS BUILDER
// ============================================================================
/**
 * Build handoff tools based on manifest configuration.
 *
 * FIX: Now uses buildHandoffTools from handoff-factory which:
 * 1. Creates proper llm.tool() wrapped tools with execute functions
 * 2. Filters tools based on user unlock status at BUILD time (prevents LLM seeing locked tools)
 * 3. Also validates at RUNTIME when tool is executed
 * 4. Returns proper LLM-compatible tools, not raw definitions
 *
 * IMPORTANT: userProfile and subscriptionTier MUST be passed for correct filtering.
 * Without them, all team members except Ferni will be filtered out!
 */
async function buildHandoffToolsForAgent(manifest, ctx, options) {
    if (!manifest.role?.can_handoff) {
        return {};
    }
    // Get handoff targets from manifest
    const targets = manifest.role.handoff_targets || [];
    const allTargets = targets.includes('*');
    try {
        // Use the FILTERED buildHandoffTools from handoff-factory
        // This creates proper llm.tool() wrapped tools with:
        // - BUILD time unlock filtering (prevents LLM seeing locked member tools)
        // - Runtime unlock validation (double-check when tool executes)
        // - User profile context extraction
        // - Proper execute functions
        const { buildHandoffTools: buildFilteredHandoffTools } = await import('./handoff/handoff-factory.js');
        const { tools: handoffTools, agentIds } = await buildFilteredHandoffTools({
            currentAgentId: ctx.agentId,
            // FIX: Pass userProfile and subscriptionTier for BUILD-TIME filtering
            // Without this, all team members are filtered out for new/null profiles!
            userProfile: options?.userProfile,
            subscriptionTier: options?.subscriptionTier || 'free',
        });
        // Filter by manifest targets if not '*'
        if (!allTargets && targets.length > 0) {
            const filteredTools = {};
            for (const [name, tool] of Object.entries(handoffTools)) {
                // Always include utility tools
                if (name === 'meetTheTeam' || name === 'softTeamIntro') {
                    filteredTools[name] = tool;
                    continue;
                }
                // Match tool name to target (e.g., handoffToMaya -> maya-santos)
                const targetMatch = name.match(/handoffTo(\w+)/i);
                if (targetMatch) {
                    const targetName = targetMatch[1].toLowerCase();
                    const isAllowed = targets.some((t) => t.toLowerCase().replace(/-/g, '').includes(targetName.replace(/-/g, '')));
                    if (isAllowed) {
                        filteredTools[name] = tool;
                    }
                }
            }
            getLogger().debug({ agentId: ctx.agentId, targets, filteredCount: Object.keys(filteredTools).length }, 'Filtered handoff tools by manifest targets');
            return filteredTools;
        }
        getLogger().debug({ agentId: ctx.agentId, toolCount: Object.keys(handoffTools).length, agentIds }, 'Built handoff tools for agent');
        return handoffTools;
    }
    catch (error) {
        getLogger().warn({ error }, 'Could not load handoff tools');
        return {};
    }
}
// ============================================================================
// LOCAL TOOLS FROM EXTENSIBILITY BUNDLES
// ============================================================================
/**
 * Build local tools from agent extensibility bundles.
 * These are custom tools defined in the agent's tools/ directory.
 *
 * Local tools can be:
 * - prompt: Injects a prompt into the conversation (simplest)
 * - webhook: Calls an external HTTP endpoint
 * - script: Runs a JS/MJS module with a run(params, context) export
 * - mcp: Delegates to an MCP server (uses mcp-integration)
 *
 * Script tools support:
 * - Must be .js or .mjs files
 * - Must export `run(params, context)` or be a default export function
 * - Are sandboxed to the bundle directory
 * - Have a 15s timeout
 *
 * @see personas/bundles/local-tools-loader.ts for implementation details
 */
async function buildLocalToolsForAgent(agentId, ctx) {
    try {
        const { loadBundleById } = await import('../personas/bundles/loader.js');
        const bundle = await loadBundleById(agentId);
        if (!bundle?.getLocalTools) {
            return {};
        }
        const localToolDefs = await bundle.getLocalTools();
        if (!localToolDefs || localToolDefs.length === 0) {
            return {};
        }
        const { llm } = await import('@livekit/agents');
        const { z } = await import('zod');
        const { executeLocalTool } = await import('../personas/bundles/extensibility-integration.js');
        const tools = {};
        for (const toolDef of localToolDefs) {
            // Convert JSON Schema parameters to Zod schema (simplified)
            // For now, we use a generic object schema and validate at runtime
            const paramSchema = z.object({}).passthrough();
            tools[toolDef.name] = llm.tool({
                description: toolDef.description,
                parameters: paramSchema,
                execute: async (params) => {
                    const result = await executeLocalTool(agentId, toolDef.name, params, {
                        userId: ctx.userId,
                        sessionId: undefined,
                    });
                    if (!result.success) {
                        return `That didn't work. ${result.error || 'Want to try something else?'}`;
                    }
                    // For prompt-type tools, the result is the prompt to inject
                    if (typeof result.result === 'string') {
                        return result.result;
                    }
                    return JSON.stringify(result.result || 'Tool executed successfully');
                },
            });
        }
        getLogger().info({ agentId, localToolCount: Object.keys(tools).length }, 'Local tools loaded from extensibility bundle');
        return tools;
    }
    catch (error) {
        getLogger().warn({ agentId, error: String(error) }, 'Failed to load local tools from extensibility bundle');
        return {};
    }
}
// ============================================================================
// MCP TOOLS FROM EXTENSIBILITY BUNDLES
// ============================================================================
/**
 * Build MCP tools from agent extensibility bundles.
 * These are tools provided by MCP servers configured in the agent's mcp.json.
 *
 * MCP (Model Context Protocol) allows agents to connect to external tool servers
 * for extended functionality without bundling tools directly.
 */
async function buildMCPToolsForAgent(agentId) {
    try {
        const { buildMCPTools } = await import('../personas/bundles/mcp-integration.js');
        const mcpTools = await buildMCPTools(agentId);
        if (Object.keys(mcpTools).length > 0) {
            getLogger().info({ agentId, mcpToolCount: Object.keys(mcpTools).length }, 'MCP tools loaded from extensibility bundle');
        }
        return mcpTools;
    }
    catch (error) {
        getLogger().warn({ agentId, error: String(error) }, 'Failed to load MCP tools from extensibility bundle');
        return {};
    }
}
// ============================================================================
// MAIN BUILDER FUNCTION
// ============================================================================
/**
 * Build tools for an agent based on their manifest
 */
export async function buildAgentTools(agentId, options = {}) {
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
    const ctx = {
        userId: options.userId || 'default',
        agentId: manifest.identity.id,
        agentDisplayName: manifest.identity.display_name,
        services: options.services || new EnvironmentServiceRegistry(),
        agentManifest: {
            identity: manifest.identity,
            tools: manifest.tools,
        },
        domainConfig: manifest.tools?.domain_config,
    };
    // Build tool spec from manifest
    const manifestSpec = {
        domains: manifest.tools?.domains || getDefaultDomainsForRole(manifest.role?.handoff_targets?.[0]),
        required: manifest.tools?.required || [],
        optional: manifest.tools?.optional || [],
        forbidden: manifest.tools?.forbidden || [],
        domainConfig: manifest.tools?.domain_config,
    };
    // Apply overrides
    const finalSpec = {
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
    const result = toolRegistry.buildToolSet(finalSpec, ctx);
    // Add handoff tools if enabled
    // FIX: Pass userProfile and subscriptionTier for correct BUILD-TIME filtering
    // Without this, Ferni can't see handoff tools for unlocked team members!
    const handoffTools = await buildHandoffToolsForAgent(manifest, ctx, {
        userProfile: options.userProfile,
        subscriptionTier: options.subscriptionTier,
    });
    // Add local tools from extensibility bundles (marketplace agents)
    const localTools = await buildLocalToolsForAgent(agentId, ctx);
    // Add MCP tools from extensibility bundles (MCP server integration)
    const mcpTools = await buildMCPToolsForAgent(agentId);
    // Merge tools (MCP and local tools can override if needed)
    const allTools = {
        ...result.tools,
        ...handoffTools,
        ...localTools,
        ...mcpTools,
    };
    const elapsed = Date.now() - startTime;
    getLogger().info({
        agentId: manifest.identity.id,
        displayName: manifest.identity.display_name,
        toolCount: Object.keys(allTools).length,
        domains: finalSpec.domains,
        skipped: result.skipped.length,
        elapsed,
    }, 'Agent tools built');
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
export async function buildToolsForDomains(domains, options = {}) {
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
export function agentHasTool(manifest, toolId) {
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
export async function getAvailableToolsForAgent(agentId) {
    const manifest = await loadAgentManifest(agentId);
    if (!manifest)
        return [];
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
export async function buildAllTeamTools(options = {}) {
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
    const byAgent = {};
    const allTools = {};
    const statsByAgent = {};
    // Build tools for each team member in parallel
    const results = await Promise.allSettled(teamMembers.map(async (agentId) => {
        const tools = await buildAgentTools(agentId, {
            userId: options.userId,
            services: options.services,
            skipRegistryInit: true, // Already initialized
        });
        return { agentId, tools };
    }));
    // Collect results
    for (const result of results) {
        if (result.status === 'fulfilled') {
            const { agentId, tools } = result.value;
            byAgent[agentId] = tools;
            statsByAgent[agentId] = Object.keys(tools).length;
            // Merge into allTools (later agents override earlier for conflicts)
            Object.assign(allTools, tools);
        }
        else {
            getLogger().warn({ error: result.reason }, 'Failed to build tools for agent');
        }
    }
    const elapsed = Date.now() - startTime;
    const uniqueTools = Object.keys(allTools).length;
    const totalTools = Object.values(statsByAgent).reduce((sum, n) => sum + n, 0);
    getLogger().info({
        teamMembers: teamMembers.length,
        uniqueTools,
        totalTools,
        elapsed,
    }, 'Team tools built');
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
 *
 * NOTE: Includes entertainment & information domains so agents can:
 * - Play music (playMusic, pauseMusic, etc.)
 * - Get weather, search web, etc.
 *
 * Keep this focused! Most LLMs work best with 20-60 tools max.
 * Google Gemini Realtime struggles with 100+ tools.
 *
 * IMPORTANT: 'handoff' domain is NOT included here because:
 * 1. The registry's handoff domain returns raw definitions without unlock filtering
 * 2. Proper handoff tools are added via buildHandoffToolsForAgent() which uses
 *    buildHandoffTools from handoff-factory.ts with runtime unlock validation
 * 3. This prevents locked team members from appearing in the LLM's tool list
 */
export async function buildEssentialTools(options = {}) {
    // Initialize registry if needed
    if (!toolRegistry.isInitialized()) {
        await initializeToolRegistry();
    }
    // Essential tools: memory, entertainment (music), information (weather/search)
    // NOTE: 'handoff' is intentionally excluded - see buildHandoffToolsForAgent()
    // This gives agents core capabilities while keeping tool count manageable
    return toolRegistry.buildSimple(['memory', 'entertainment', 'information'], {
        userId: options.userId || 'default',
        agentId: 'essential',
        agentDisplayName: 'Essential',
        services: options.services,
    });
}
// ============================================================================
// EXPORTS
// ============================================================================
export { getDefaultDomainsForRole };
export default buildAgentTools;
//# sourceMappingURL=builder.js.map