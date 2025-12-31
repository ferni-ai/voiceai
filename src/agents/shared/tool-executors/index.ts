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
import { musicExecutor } from './music-executor.js';
import { informationExecutor } from './information-executor.js';
import { productivityExecutor } from './productivity-executor.js';
import { memoryExecutor } from './memory-executor.js';
import { calendarExecutor } from './calendar-executor.js';
import { habitsExecutor } from './habits-executor.js';
import { homeExecutor } from './home-executor.js';
import { schedulingExecutor } from './scheduling-executor.js';
import { conciergeExecutor } from './concierge-executor.js';
import { telephonyExecutor } from './telephony-executor.js';
import { reflectionGamesExecutor } from './reflection-games-executor.js';
import { researchExecutor } from './research-executor.js';
import { handoffExecutor } from './handoff-executor.js';

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
  // TODO: Add more executors:
  // - engagementExecutor
  // - shoppingExecutor
  // - travelExecutor
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
export { musicExecutor } from './music-executor.js';
export { informationExecutor } from './information-executor.js';
export { productivityExecutor } from './productivity-executor.js';
export { memoryExecutor } from './memory-executor.js';
export { calendarExecutor } from './calendar-executor.js';
export { habitsExecutor } from './habits-executor.js';
export { homeExecutor } from './home-executor.js';
export { schedulingExecutor } from './scheduling-executor.js';
export { conciergeExecutor } from './concierge-executor.js';
export { telephonyExecutor } from './telephony-executor.js';
export { reflectionGamesExecutor } from './reflection-games-executor.js';
export { researchExecutor } from './research-executor.js';
export { handoffExecutor } from './handoff-executor.js';
