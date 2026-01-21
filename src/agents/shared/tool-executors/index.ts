/**
 * Tool Executors Index
 *
 * Central registry of domain-specific tool executors.
 * Each domain handles a set of related tools, making the system modular and maintainable.
 *
 * Usage:
 * ```typescript
 * import { routeToToolModular } from './tool-executors';
 * const result = await routeToToolModular('playMusic', { query: 'jazz' }, ctx);
 * ```
 *
 * @module agents/shared/tool-executors
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

// Domain executors
import { calendarExecutor } from './calendar-executor.js';
import { conciergeExecutor } from './concierge-executor.js';
import { habitsExecutor } from './habits-executor.js';
import { handoffExecutor } from './handoff-executor.js';
import { homeExecutor } from './home-executor.js';
import { informationExecutor } from './information-executor.js';
import { memoryExecutor } from './memory-executor.js';
import { musicExecutor } from './music-executor.js';
import { productivityExecutor } from './productivity-executor.js';
import { reflectionGamesExecutor } from './reflection-games-executor.js';
import { researchExecutor } from './research-executor.js';
import { schedulingExecutor } from './scheduling-executor.js';
import { telephonyExecutor } from './telephony-executor.js';
// FTIS V3 domain executors (January 2026)
import ceoExecutor from './ceo-executor.js';
import { dynamicDomainExecutor } from './dynamic-domain-executor.js';
import entertainmentExecutor from './entertainment-executor.js';
import financeExecutor from './finance-executor.js';
import healthExecutor from './health-executor.js';
import travelExecutor from './travel-executor.js';

const log = createLogger({ module: 'ToolExecutors' });

// ============================================================================
// EXECUTOR REGISTRY
// ============================================================================

/**
 * All registered domain executors.
 * Order matters: first match wins.
 */
const DOMAIN_EXECUTORS: DomainExecutor[] = [
  musicExecutor,
  informationExecutor,
  productivityExecutor,
  memoryExecutor,
  calendarExecutor,
  habitsExecutor,
  homeExecutor,
  schedulingExecutor,
  conciergeExecutor,
  telephonyExecutor,
  reflectionGamesExecutor,
  researchExecutor,
  handoffExecutor,
  // FTIS V3 domain executors (January 2026)
  healthExecutor,
  financeExecutor,
  entertainmentExecutor,
  ceoExecutor,
  travelExecutor,
];

/**
 * Pre-computed lookup table for fast tool routing.
 * Maps lowercase tool name to its executor.
 */
const toolToExecutor = new Map<string, DomainExecutor>();

// Build lookup table
for (const executor of DOMAIN_EXECUTORS) {
  for (const tool of executor.handles) {
    if (toolToExecutor.has(tool)) {
      log.warn(
        { tool, existingDomain: toolToExecutor.get(tool)!.domain, newDomain: executor.domain },
        '⚠️ Duplicate tool registration'
      );
    }
    toolToExecutor.set(tool, executor);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Route a tool call to the appropriate domain executor.
 *
 * @param fn - Tool function name
 * @param args - Tool arguments
 * @param ctx - Execution context
 * @returns Tool result, or null if no executor handles this tool
 */
export async function routeToToolModular(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();
  const executor = toolToExecutor.get(fnLower);

  if (executor) {
    log.debug({ fn, domain: executor.domain }, '🔧 Routing to domain executor');
    return executor.execute(fn, args, ctx);
  }

  // Fallback: Try the dynamic domain executor for tools not in specialized executors
  // This enables voice-calling of ~135+ tools in domains/ that aren't manually wired
  const dynamicResult = await dynamicDomainExecutor.execute(fn, args, ctx);
  if (dynamicResult !== null) {
    log.debug({ fn, domain: 'dynamic-domains' }, '🔧 Routing to dynamic domain executor');
    return dynamicResult;
  }

  // No executor found - return null to indicate the tool wasn't handled
  return null;
}

/**
 * Check if a tool is handled by a modular executor.
 */
export function isToolModular(fn: string): boolean {
  return toolToExecutor.has(fn.toLowerCase());
}

/**
 * Get the domain that handles a specific tool.
 */
export function getToolDomain(fn: string): string | null {
  return toolToExecutor.get(fn.toLowerCase())?.domain || null;
}

/**
 * Get all registered tools across all domains.
 */
export function getAllModularTools(): string[] {
  return Array.from(toolToExecutor.keys());
}

/**
 * Get statistics about the modular executor registry.
 */
export function getExecutorStats(): {
  domainCount: number;
  toolCount: number;
  domains: Array<{ name: string; toolCount: number }>;
} {
  const domains = DOMAIN_EXECUTORS.map((e) => ({
    name: e.domain,
    toolCount: e.handles.length,
  }));

  return {
    domainCount: DOMAIN_EXECUTORS.length,
    toolCount: toolToExecutor.size,
    domains,
  };
}

// Re-export types
export type { DomainExecutor, ToolExecutionContext, ToolHandler } from './types.js';

// Re-export individual executors for testing
export { calendarExecutor } from './calendar-executor.js';
export { conciergeExecutor } from './concierge-executor.js';
export { habitsExecutor } from './habits-executor.js';
export { handoffExecutor } from './handoff-executor.js';
export { homeExecutor } from './home-executor.js';
export { informationExecutor } from './information-executor.js';
export { memoryExecutor } from './memory-executor.js';
export { musicExecutor } from './music-executor.js';
export { productivityExecutor } from './productivity-executor.js';
export { reflectionGamesExecutor } from './reflection-games-executor.js';
export { researchExecutor } from './research-executor.js';
export { schedulingExecutor } from './scheduling-executor.js';
export { telephonyExecutor } from './telephony-executor.js';
// FTIS V3 domain executors (January 2026)
export { default as ceoExecutor } from './ceo-executor.js';
export {
  dynamicDomainExecutor,
  getDynamicToolIds,
  isDynamicTool,
  resetDynamicExecutor,
} from './dynamic-domain-executor.js';
export { default as entertainmentExecutor } from './entertainment-executor.js';
export { default as financeExecutor } from './finance-executor.js';
export { default as healthExecutor } from './health-executor.js';
export { default as travelExecutor } from './travel-executor.js';
