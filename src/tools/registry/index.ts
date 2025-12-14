/**
 * Tool Registry
 *
 * Central registry for all tools in the system.
 * Tools register themselves by domain/capability, and agents
 * select which domains they need in their manifest.
 *
 * USAGE:
 *
 * // Register a tool
 * toolRegistry.register({
 *   id: 'createAppointment',
 *   name: 'Create Appointment',
 *   domain: 'calendar',
 *   create: (ctx) => ({ ... })
 * });
 *
 * // Build tools for an agent
 * const tools = await toolRegistry.buildToolSet({
 *   domains: ['calendar', 'memory'],
 *   required: ['handoff'],
 *   forbidden: ['dayTrade']
 * }, context);
 */

import { getLogger } from '../../utils/safe-logger.js';

import {
  ALL_TOOL_DOMAINS,
  DOMAIN_TO_CATEGORY,
  EmptyServiceRegistry,
  validateToolDefinition,
  validateToolSetSpec,
  type RegistryEvent,
  type RegistryEventHandler,
  type RegistryQueryOptions,
  type Tool,
  type ToolCategory,
  type ToolContext,
  type ToolDefinition,
  type ToolDomain,
  type ToolMetadata,
  type ToolSetResult,
  type ToolSetSpec,
} from './types.js';

// ============================================================================
// TOOL REGISTRY CLASS
// ============================================================================

export class ToolRegistry {
  /** All registered tools */
  private tools = new Map<string, ToolDefinition>();

  /** Index: domain -> tool IDs */
  private domainIndex = new Map<ToolDomain, Set<string>>();

  /** Index: category -> tool IDs */
  private categoryIndex = new Map<ToolCategory, Set<string>>();

  /** Index: tag -> tool IDs */
  private tagIndex = new Map<string, Set<string>>();

  /** Event handlers */
  private eventHandlers = new Set<RegistryEventHandler>();

  /** Initialization flag */
  private initialized = false;

  constructor() {
    // Initialize domain indexes
    for (const domain of ALL_TOOL_DOMAINS) {
      this.domainIndex.set(domain, new Set());
    }
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  /**
   * Register a tool definition
   */
  register(definition: ToolDefinition): void {
    // Validate
    const errors = validateToolDefinition(definition);
    if (errors.length > 0) {
      getLogger().error({ toolId: definition.id, errors }, 'Invalid tool definition');
      throw new Error(`Invalid tool definition: ${errors.join(', ')}`);
    }

    // Check for duplicates
    if (this.tools.has(definition.id)) {
      getLogger().warn({ toolId: definition.id }, 'Tool already registered, overwriting');
    }

    // Store the definition
    this.tools.set(definition.id, definition);

    // Index by primary domain
    this.indexByDomain(definition.domain, definition.id);

    // Index by additional domains
    if (definition.additionalDomains) {
      for (const domain of definition.additionalDomains) {
        this.indexByDomain(domain, definition.id);
      }
    }

    // Index by category
    const category = definition.category || DOMAIN_TO_CATEGORY[definition.domain];
    this.indexByCategory(category, definition.id);

    // Index by tags
    if (definition.tags) {
      for (const tag of definition.tags) {
        this.indexByTag(tag, definition.id);
      }
    }

    // Emit event
    this.emit({ type: 'tool_registered', tool: definition });

    getLogger().debug(
      {
        toolId: definition.id,
        domain: definition.domain,
        category,
      },
      'Tool registered'
    );
  }

  /**
   * Register multiple tools at once
   */
  registerAll(definitions: ToolDefinition[]): void {
    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Unregister a tool
   */
  unregister(toolId: string): boolean {
    const definition = this.tools.get(toolId);
    if (!definition) {
      return false;
    }

    // Remove from indexes
    this.domainIndex.get(definition.domain)?.delete(toolId);
    if (definition.additionalDomains) {
      for (const domain of definition.additionalDomains) {
        this.domainIndex.get(domain)?.delete(toolId);
      }
    }

    const category = definition.category || DOMAIN_TO_CATEGORY[definition.domain];
    this.categoryIndex.get(category)?.delete(toolId);

    if (definition.tags) {
      for (const tag of definition.tags) {
        this.tagIndex.get(tag)?.delete(toolId);
      }
    }

    // Remove from main map
    this.tools.delete(toolId);

    // Emit event
    this.emit({ type: 'tool_unregistered', toolId });

    return true;
  }

  // ==========================================================================
  // INDEXING (private)
  // ==========================================================================

  private indexByDomain(domain: ToolDomain, toolId: string): void {
    let index = this.domainIndex.get(domain);
    if (!index) {
      index = new Set();
      this.domainIndex.set(domain, index);
    }
    index.add(toolId);
  }

  private indexByCategory(category: ToolCategory, toolId: string): void {
    let index = this.categoryIndex.get(category);
    if (!index) {
      index = new Set();
      this.categoryIndex.set(category, index);
    }
    index.add(toolId);
  }

  private indexByTag(tag: string, toolId: string): void {
    const normalizedTag = tag.toLowerCase();
    let index = this.tagIndex.get(normalizedTag);
    if (!index) {
      index = new Set();
      this.tagIndex.set(normalizedTag, index);
    }
    index.add(toolId);
  }

  // ==========================================================================
  // QUERYING
  // ==========================================================================

  /**
   * Get a tool definition by ID
   */
  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Check if a tool exists
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Get all tool IDs
   */
  getAllIds(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tool definitions
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool metadata (without create function)
   */
  getMetadata(toolId: string): ToolMetadata | undefined {
    const def = this.tools.get(toolId);
    if (!def) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { create, ...metadata } = def;
    return metadata;
  }

  /**
   * Get all tool metadata
   */
  getAllMetadata(): ToolMetadata[] {
    return this.getAll().map((def) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { create, ...metadata } = def;
      return metadata;
    });
  }

  /**
   * Get tools by domain
   */
  getByDomain(domain: ToolDomain): ToolDefinition[] {
    const ids = this.domainIndex.get(domain) || new Set();
    return Array.from(ids)
      .map((id) => this.tools.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    const ids = this.categoryIndex.get(category) || new Set();
    return Array.from(ids)
      .map((id) => this.tools.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get tools by tag
   */
  getByTag(tag: string): ToolDefinition[] {
    const ids = this.tagIndex.get(tag.toLowerCase()) || new Set();
    return Array.from(ids)
      .map((id) => this.tools.get(id)!)
      .filter(Boolean);
  }

  /**
   * Query tools with filters
   */
  query(options: RegistryQueryOptions = {}): ToolDefinition[] {
    let results = this.getAll();

    // Filter by domain
    if (options.domain) {
      const domainIds = this.domainIndex.get(options.domain) || new Set();
      results = results.filter((def) => domainIds.has(def.id));
    }

    // Filter by domains (any match)
    if (options.domains && options.domains.length > 0) {
      const domainIds = new Set<string>();
      for (const domain of options.domains) {
        const ids = this.domainIndex.get(domain) || new Set();
        for (const id of ids) {
          domainIds.add(id);
        }
      }
      results = results.filter((def) => domainIds.has(def.id));
    }

    // Filter by category
    if (options.category) {
      const categoryIds = this.categoryIndex.get(options.category) || new Set();
      results = results.filter((def) => categoryIds.has(def.id));
    }

    // Filter experimental
    if (!options.includeExperimental) {
      results = results.filter((def) => !def.experimental);
    }

    // Filter deprecated
    if (!options.includeDeprecated) {
      results = results.filter((def) => !def.deprecated);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter((def) => {
        if (!def.tags) return false;
        const defTags = new Set(def.tags.map((t) => t.toLowerCase()));
        return options.tags!.some((t) => defTags.has(t.toLowerCase()));
      });
    }

    // Filter by required service
    if (options.requiresService) {
      results = results.filter(
        (def) => def.requiredServices?.includes(options.requiresService!) ?? false
      );
    }

    return results;
  }

  // ==========================================================================
  // TOOL SET BUILDING
  // ==========================================================================

  /**
   * Build a tool set from a specification
   */
  buildToolSet(spec: ToolSetSpec, ctx: ToolContext): ToolSetResult {
    const startTime = Date.now();

    // Validate spec
    const specErrors = validateToolSetSpec(spec);
    if (specErrors.length > 0) {
      getLogger().warn({ errors: specErrors }, 'Invalid tool set spec');
    }

    const tools: Record<string, Tool> = {};
    const skipped: ToolSetResult['skipped'] = [];
    const warnings: string[] = [...specErrors];
    const forbidden = new Set(spec.forbidden || []);
    const included = new Set<string>();

    // Helper to add a tool
    const addTool = (def: ToolDefinition, reason: string): boolean => {
      // Skip if forbidden
      if (forbidden.has(def.id)) {
        skipped.push({ toolId: def.id, reason: 'Forbidden by spec' });
        return false;
      }

      // Skip if already included
      if (included.has(def.id)) {
        return true;
      }

      // Check required services
      if (def.requiredServices) {
        const missingServices = def.requiredServices.filter((s) => !ctx.services.has(s));
        if (missingServices.length > 0) {
          skipped.push({
            toolId: def.id,
            reason: `Missing services: ${missingServices.join(', ')}`,
          });
          return false;
        }
      }

      // Check deprecated
      if (def.deprecated) {
        warnings.push(
          `Tool ${def.id} is deprecated: ${def.deprecationMessage || 'No reason given'}`
        );
      }

      // Create the tool instance
      try {
        const tool = def.create(ctx);
        tools[def.id] = tool;
        included.add(def.id);
        getLogger().debug({ toolId: def.id, reason }, 'Tool added to set');
        return true;
      } catch (error) {
        skipped.push({
          toolId: def.id,
          reason: `Creation failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        return false;
      }
    };

    // Add tools from domains
    if (spec.domains) {
      for (const domain of spec.domains) {
        const domainTools = this.getByDomain(domain);
        for (const def of domainTools) {
          addTool(def, `domain:${domain}`);
        }
      }
    }

    // Add required tools
    if (spec.required) {
      for (const toolId of spec.required) {
        const def = this.tools.get(toolId);
        if (def) {
          const added = addTool(def, 'required');
          if (!added && !forbidden.has(toolId)) {
            warnings.push(`Required tool ${toolId} could not be added`);
          }
        } else {
          warnings.push(`Required tool ${toolId} not found in registry`);
        }
      }
    }

    // Add optional tools (if not already included)
    if (spec.optional) {
      for (const toolId of spec.optional) {
        if (!included.has(toolId)) {
          const def = this.tools.get(toolId);
          if (def) {
            addTool(def, 'optional');
          }
          // Don't warn about missing optional tools
        }
      }
    }

    // Build stats
    const stats: ToolSetResult['stats'] = {
      total: Object.keys(tools).length,
      byDomain: {} as Record<ToolDomain, number>,
      byCategory: {} as Record<ToolCategory, number>,
    };

    for (const toolId of included) {
      const def = this.tools.get(toolId)!;
      stats.byDomain[def.domain] = (stats.byDomain[def.domain] || 0) + 1;
      const category = def.category || DOMAIN_TO_CATEGORY[def.domain];
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }

    const elapsed = Date.now() - startTime;
    getLogger().info(
      {
        agentId: ctx.agentId,
        toolCount: stats.total,
        skippedCount: skipped.length,
        warningCount: warnings.length,
        elapsed,
      },
      'Tool set built'
    );

    // Emit event
    this.emit({ type: 'build_complete', agentId: ctx.agentId, toolCount: stats.total });

    return { tools, skipped, warnings, stats };
  }

  /**
   * Build a simple tool set (convenience method)
   */
  buildSimple(domains: ToolDomain[], ctx: Partial<ToolContext> = {}): Record<string, Tool> {
    // Note: We spread ctx first, then override with defaults for missing values
    // This ensures ctx.services = undefined doesn't overwrite our EmptyServiceRegistry
    const fullCtx: ToolContext = {
      ...ctx,
      userId: ctx.userId || 'default',
      agentId: ctx.agentId || 'default',
      agentDisplayName: ctx.agentDisplayName || 'Agent',
      services: ctx.services || new EmptyServiceRegistry(),
    };

    const result = this.buildToolSet({ domains }, fullCtx);
    return result.tools;
  }

  // ==========================================================================
  // EVENTS
  // ==========================================================================

  /**
   * Subscribe to registry events
   */
  on(handler: RegistryEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event
   */
  private emit(event: RegistryEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        getLogger().error({ error, event }, 'Event handler error');
      }
    }
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get registry statistics
   */
  getStats(): {
    totalTools: number;
    byDomain: Record<ToolDomain, number>;
    byCategory: Record<ToolCategory, number>;
    experimental: number;
    deprecated: number;
  } {
    const byDomain: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let experimental = 0;
    let deprecated = 0;

    for (const def of this.tools.values()) {
      byDomain[def.domain] = (byDomain[def.domain] || 0) + 1;
      const category = def.category || DOMAIN_TO_CATEGORY[def.domain];
      byCategory[category] = (byCategory[category] || 0) + 1;
      if (def.experimental) experimental++;
      if (def.deprecated) deprecated++;
    }

    return {
      totalTools: this.tools.size,
      byDomain: byDomain as Record<ToolDomain, number>,
      byCategory: byCategory as Record<ToolCategory, number>,
      experimental,
      deprecated,
    };
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark registry as initialized
   */
  markInitialized(): void {
    this.initialized = true;
    getLogger().info(this.getStats(), 'Tool registry initialized');
  }

  /**
   * Clear the registry (for testing)
   */
  clear(): void {
    this.tools.clear();
    for (const set of this.domainIndex.values()) {
      set.clear();
    }
    for (const set of this.categoryIndex.values()) {
      set.clear();
    }
    this.tagIndex.clear();
    this.initialized = false;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global tool registry instance
 */
export const toolRegistry = new ToolRegistry();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Register a tool with the global registry
 */
export function registerTool(definition: ToolDefinition): void {
  toolRegistry.register(definition);
}

/**
 * Register multiple tools with the global registry
 */
export function registerTools(definitions: ToolDefinition[]): void {
  toolRegistry.registerAll(definitions);
}

/**
 * Get a tool from the global registry
 */
export function getTool(toolId: string): ToolDefinition | undefined {
  return toolRegistry.get(toolId);
}

/**
 * Build a tool set from the global registry
 */
export function buildToolSet(spec: ToolSetSpec, ctx: ToolContext): ToolSetResult {
  return toolRegistry.buildToolSet(spec, ctx);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ALL_TOOL_DOMAINS,
  assertTool,
  DOMAIN_TO_CATEGORY,
  EmptyServiceRegistry,
  isTool,
  type BaseTool,
  type RegistryQueryOptions,
  type Tool,
  type ToolCategory,
  type ToolContext,
  type ToolDefinition,
  type ToolDomain,
  type ToolMetadata,
  type ToolSetResult,
  type ToolSetSpec,
} from './types.js';

export default toolRegistry;
