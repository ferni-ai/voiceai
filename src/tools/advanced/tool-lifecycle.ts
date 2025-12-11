/**
 * Tool Lifecycle Manager
 *
 * Integrates advanced tool systems into the tool lifecycle:
 * - A/B Testing: Test different tool implementations
 * - Semantic Router: Route requests to appropriate tools
 * - Deprecation Service: Track and warn about deprecated tools
 * - Versioning: Track tool version changes
 *
 * USAGE:
 *
 * // Initialize at startup
 * await initializeToolLifecycle();
 *
 * // Get the best tool for a request
 * const tool = await routeToolRequest(userIntent, availableTools);
 *
 * // Track tool execution
 * await trackToolExecution(toolId, result, { userId, sessionId });
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ToolDefinition, ToolDomain } from '../registry/types.js';

// Import advanced systems
import { abTestingService, type ExperimentAssignment } from '../ab-testing.js';
import { deprecationService, type DeprecationRecord } from '../deprecation.js';
import { semanticRouter, type SemanticMatch } from '../semantic-router.js';
import { versioningService } from '../versioning.js';

const log = getLogger();

// ============================================================================
// LIFECYCLE STATE
// ============================================================================

interface LifecycleState {
  initialized: boolean;
  semanticIndexBuilt: boolean;
  deprecationChecked: boolean;
  experimentsActive: string[];
}

const state: LifecycleState = {
  initialized: false,
  semanticIndexBuilt: false,
  deprecationChecked: false,
  experimentsActive: [],
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export interface InitOptions {
  /** Build semantic index for tool routing */
  buildSemanticIndex?: boolean;

  /** Check for deprecated tools */
  checkDeprecations?: boolean;

  /** Start A/B experiments */
  startExperiments?: boolean;

  /** Tool definitions to index */
  toolDefinitions?: ToolDefinition[];
}

/**
 * Initialize the tool lifecycle systems
 */
export async function initializeToolLifecycle(options: InitOptions = {}): Promise<void> {
  const startTime = Date.now();

  log.info({ options }, 'Initializing tool lifecycle...');

  try {
    // Build semantic index for routing (router auto-initializes with all tools)
    if (options.buildSemanticIndex) {
      await semanticRouter.initialize();
      state.semanticIndexBuilt = true;
    }

    // Check for deprecated tools
    if (options.checkDeprecations && options.toolDefinitions) {
      checkDeprecations(options.toolDefinitions);
      state.deprecationChecked = true;
    }

    // Start A/B experiments
    if (options.startExperiments) {
      state.experimentsActive = getActiveExperiments();
    }

    state.initialized = true;

    log.info(
      { elapsed: Date.now() - startTime, semanticIndex: state.semanticIndexBuilt },
      'Tool lifecycle initialized'
    );
  } catch (error) {
    log.error({ error }, 'Failed to initialize tool lifecycle');
    throw error;
  }
}

// ============================================================================
// SEMANTIC ROUTING
// ============================================================================

/**
 * Route a user request to the best matching tools
 */
export async function routeToolRequest(
  userIntent: string,
  availableToolIds: string[],
  _options: { threshold?: number; maxResults?: number } = {}
): Promise<SemanticMatch[]> {
  if (!state.semanticIndexBuilt) {
    log.warn('Semantic index not built, returning empty results');
    return [];
  }

  // Use async version for better semantic matching
  let allMatches: SemanticMatch[];
  try {
    allMatches = await semanticRouter.findRelevantToolsAsync(userIntent);
  } catch {
    // Fallback to sync version if async fails
    allMatches = semanticRouter.findRelevantTools(userIntent);
  }

  // Filter to available tools
  const matches = allMatches.filter((m) => availableToolIds.includes(m.toolId));

  log.debug({ intent: userIntent, matchCount: matches.length }, 'Routed tool request');

  return matches;
}

/**
 * Get the best tool for a request
 */
export async function getBestToolForRequest(
  userIntent: string,
  availableToolIds: string[]
): Promise<string | null> {
  const matches = await routeToolRequest(userIntent, availableToolIds, { maxResults: 1 });
  return matches.length > 0 ? matches[0].toolId : null;
}

// ============================================================================
// A/B TESTING
// ============================================================================

/**
 * Get active experiments
 */
function getActiveExperiments(): string[] {
  const experiments = abTestingService.getActiveExperiments();
  return experiments.map((e) => e.id);
}

/**
 * Get assignment for a user in an experiment
 */
export function getToolVariant(userId: string, experimentId: string): ExperimentAssignment | null {
  return abTestingService.assignUser(userId, experimentId);
}

/**
 * Track tool experiment result
 */
export function trackExperimentResult(
  userId: string,
  experimentId: string,
  metric: string,
  value: number
): void {
  abTestingService.recordMetric(userId, experimentId, metric, value);
}

/**
 * Check if user should see tool variant
 */
export function shouldUseToolVariant(
  userId: string,
  toolId: string,
  variantToolId: string
): boolean {
  // Check if there's an active experiment for this tool
  const experimentId = `tool_variant_${toolId}`;
  const assignment = getToolVariant(userId, experimentId);

  if (!assignment) return false;

  // Get the variant config to check if this is the treatment
  const variantConfig = abTestingService.getUserVariant(userId, experimentId);
  if (!variantConfig) return false;

  return variantConfig.id !== 'control' && variantConfig.config?.toolId === variantToolId;
}

// ============================================================================
// DEPRECATION MANAGEMENT
// ============================================================================

/**
 * Check tools for deprecation
 */
function checkDeprecations(tools: ToolDefinition[]): void {
  const deprecatedTools = tools.filter((t) => t.deprecated);

  for (const tool of deprecatedTools) {
    // Flag the tool for deprecation using the service's API
    deprecationService.flagForDeprecation(
      tool.id,
      tool.domain,
      'manual', // Use manual since this is from tool definition marking
      { replacementToolId: undefined, migrationGuide: tool.deprecationMessage }
    );
  }

  if (deprecatedTools.length > 0) {
    log.warn(
      { count: deprecatedTools.length, tools: deprecatedTools.map((t) => t.id) },
      'Deprecated tools found'
    );
  }
}

/**
 * Check if a tool is deprecated
 */
export function isToolDeprecated(toolId: string): boolean {
  return deprecationService.isDeprecated(toolId);
}

/**
 * Get deprecation info for a tool
 */
export function getDeprecationInfo(toolId: string): DeprecationRecord | null {
  return deprecationService.getDeprecationInfo(toolId);
}

/**
 * Get suggested replacement for deprecated tool
 */
export function getSuggestedReplacement(toolId: string): string | null {
  const info = getDeprecationInfo(toolId);
  return info?.replacementToolId || null;
}

// ============================================================================
// VERSIONING
// ============================================================================

/**
 * Register a tool with the versioning service
 */
export function registerToolVersion(tool: ToolDefinition, version = '1.0.0'): void {
  versioningService.registerTool(tool, version);
}

/**
 * Get the active version for a tool
 */
export function getToolVersion(toolId: string): string | null {
  return versioningService.getActiveVersion(toolId);
}

// ============================================================================
// EXECUTION TRACKING
// ============================================================================

export interface ExecutionContext {
  userId: string;
  sessionId?: string;
  agentId?: string;
  domain?: ToolDomain;
}

export interface ExecutionResult {
  success: boolean;
  executionTimeMs: number;
  resultSize?: number;
  error?: string;
}

/**
 * Track a tool execution for analytics and experiments
 */
export function trackToolExecution(
  toolId: string,
  result: ExecutionResult,
  ctx: ExecutionContext
): void {
  // Track for A/B testing if in an experiment
  if (ctx.userId) {
    const experimentId = `tool_${toolId}`;
    if (state.experimentsActive.includes(experimentId)) {
      trackExperimentResult(ctx.userId, experimentId, 'success_rate', result.success ? 1 : 0);
      trackExperimentResult(ctx.userId, experimentId, 'execution_time', result.executionTimeMs);
    }
  }

  // Log execution metrics
  log.debug(
    {
      toolId,
      success: result.success,
      executionTimeMs: result.executionTimeMs,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
    },
    'Tool execution tracked'
  );
}

// ============================================================================
// TOOL SELECTION ENHANCEMENT
// ============================================================================

/**
 * Enhanced tool selection that considers:
 * - Semantic routing
 * - A/B testing variants
 * - Deprecation status
 * - Tool version
 */
export async function selectBestTool(
  userIntent: string,
  availableToolIds: string[],
  ctx: ExecutionContext
): Promise<{
  toolId: string | null;
  reason: string;
  alternatives: string[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const alternatives: string[] = [];

  // Semantic routing
  const matches = await routeToolRequest(userIntent, availableToolIds);

  if (matches.length === 0) {
    return {
      toolId: null,
      reason: 'No matching tools found',
      alternatives: [],
      warnings: [],
    };
  }

  let bestToolId = matches[0].toolId;
  alternatives.push(...matches.slice(1, 4).map((m) => m.toolId));

  // Check deprecation
  if (isToolDeprecated(bestToolId)) {
    const replacement = getSuggestedReplacement(bestToolId);
    if (replacement && availableToolIds.includes(replacement)) {
      warnings.push(`Tool ${bestToolId} is deprecated, using ${replacement}`);
      bestToolId = replacement;
    } else {
      warnings.push(`Tool ${bestToolId} is deprecated`);
    }
  }

  // Check A/B variant
  if (ctx.userId) {
    for (const alt of alternatives) {
      if (shouldUseToolVariant(ctx.userId, bestToolId, alt)) {
        warnings.push(`A/B test: Using variant ${alt} instead of ${bestToolId}`);
        bestToolId = alt;
        break;
      }
    }
  }

  return {
    toolId: bestToolId,
    reason: `Semantic match (similarity: ${matches[0].similarity.toFixed(2)})`,
    alternatives,
    warnings,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export function isLifecycleInitialized(): boolean {
  return state.initialized;
}

export function getLifecycleState(): Readonly<LifecycleState> {
  return { ...state };
}

export default {
  initializeToolLifecycle,
  routeToolRequest,
  getBestToolForRequest,
  getToolVariant,
  trackExperimentResult,
  shouldUseToolVariant,
  isToolDeprecated,
  getDeprecationInfo,
  getSuggestedReplacement,
  registerToolVersion,
  getToolVersion,
  trackToolExecution,
  selectBestTool,
  isLifecycleInitialized,
  getLifecycleState,
};
