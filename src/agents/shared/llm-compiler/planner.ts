/**
 * LLMCompiler Planner
 *
 * Parses and validates execution plans from LLM output.
 * Detects DAG format, validates dependencies, and resolves variable references.
 *
 * @module agents/shared/llm-compiler/planner
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  LLMCompilerTask,
  LLMCompilerPlan,
  DAGValidationResult,
} from './types.js';

const log = createLogger({ module: 'llm-compiler-planner' });

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Pattern to detect LLMCompiler DAG format in text.
 * Looks for array of objects with "id" field.
 */
const DAG_PATTERN = /\[\s*\{[^}]*"id"\s*:\s*"[^"]+"/;

/**
 * Check if text contains an LLMCompiler execution plan.
 */
export function containsLLMCompilerPlan(text: string): boolean {
  return DAG_PATTERN.test(text) && text.includes('"dependsOn"');
}

// ============================================================================
// PARSING
// ============================================================================

/**
 * Extract JSON array from text (handles surrounding text).
 */
function extractJsonArray(text: string): string | null {
  // Find the first [ and matching ]
  const start = text.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let end = -1;

  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;
  return text.slice(start, end + 1);
}

/**
 * Parse LLMCompiler plan from text.
 * Returns null if parsing fails.
 */
export function parseLLMCompilerPlan(text: string): LLMCompilerPlan | null {
  try {
    const jsonStr = extractJsonArray(text);
    if (!jsonStr) {
      log.debug('No JSON array found in text');
      return null;
    }

    const parsed = JSON.parse(jsonStr) as unknown[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      log.debug('Parsed JSON is not a non-empty array');
      return null;
    }

    // Validate each task
    const tasks: LLMCompilerTask[] = [];
    for (const item of parsed) {
      if (!isValidTask(item)) {
        log.debug({ item }, 'Invalid task format');
        return null;
      }
      tasks.push(item as LLMCompilerTask);
    }

    // Validate DAG structure
    const validation = validateDAG(tasks);
    if (!validation.valid) {
      log.warn({ error: validation.error }, 'DAG validation failed');
      return null;
    }

    return {
      tasks,
      allowReplan: true, // Default to allowing replan
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to parse LLMCompiler plan');
    return null;
  }
}

/**
 * Type guard for valid task format.
 */
function isValidTask(item: unknown): item is LLMCompilerTask {
  if (typeof item !== 'object' || item === null) return false;

  const task = item as Record<string, unknown>;

  return (
    typeof task.id === 'string' &&
    typeof task.fn === 'string' &&
    typeof task.args === 'object' &&
    task.args !== null &&
    Array.isArray(task.dependsOn) &&
    task.dependsOn.every((dep) => typeof dep === 'string')
  );
}

// ============================================================================
// DAG VALIDATION
// ============================================================================

/**
 * Validate DAG structure (no cycles, valid references).
 */
export function validateDAG(tasks: LLMCompilerTask[]): DAGValidationResult {
  const taskIds = new Set(tasks.map((t) => t.id));

  // Check for duplicate IDs
  if (taskIds.size !== tasks.length) {
    return { valid: false, error: 'Duplicate task IDs' };
  }

  // Check for missing dependencies
  const missingDeps: string[] = [];
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        missingDeps.push(dep);
      }
    }
  }

  if (missingDeps.length > 0) {
    return {
      valid: false,
      error: `Missing dependencies: ${missingDeps.join(', ')}`,
      missingDeps,
    };
  }

  // Check for cycles using DFS
  const cycleIds = detectCycles(tasks);
  if (cycleIds.length > 0) {
    return {
      valid: false,
      error: `Circular dependency detected: ${cycleIds.join(' → ')}`,
      cycleIds,
    };
  }

  return { valid: true };
}

/**
 * Detect cycles in task graph using DFS.
 * Returns IDs involved in cycle, or empty array if no cycle.
 */
function detectCycles(tasks: LLMCompilerTask[]): string[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(id: string): string[] {
    if (visiting.has(id)) {
      // Found cycle - return path from cycle start
      const cycleStart = path.indexOf(id);
      return [...path.slice(cycleStart), id];
    }

    if (visited.has(id)) return [];

    visiting.add(id);
    path.push(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        const cycle = dfs(dep);
        if (cycle.length > 0) return cycle;
      }
    }

    path.pop();
    visiting.delete(id);
    visited.add(id);

    return [];
  }

  for (const task of tasks) {
    const cycle = dfs(task.id);
    if (cycle.length > 0) return cycle;
  }

  return [];
}

// ============================================================================
// VARIABLE RESOLUTION
// ============================================================================

/**
 * Variable reference pattern: $t1, $t2, etc.
 */
const VAR_PATTERN = /\$([a-zA-Z0-9_]+)/g;

/**
 * Resolve variable references in args.
 * Replaces "$t1" with actual output from task t1.
 */
export function resolveVariableReferences(
  args: Record<string, unknown>,
  outputs: Map<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    resolved[key] = resolveValue(value, outputs);
  }

  return resolved;
}

/**
 * Recursively resolve variable references in a value.
 */
function resolveValue(value: unknown, outputs: Map<string, unknown>): unknown {
  if (typeof value === 'string') {
    // Check if entire string is a variable reference
    const fullMatch = value.match(/^\$([a-zA-Z0-9_]+)$/);
    if (fullMatch) {
      const taskId = fullMatch[1];
      return outputs.has(taskId) ? outputs.get(taskId) : value;
    }

    // Replace embedded variable references
    return value.replace(VAR_PATTERN, (match, taskId) => {
      if (outputs.has(taskId)) {
        const output = outputs.get(taskId);
        return typeof output === 'string' ? output : JSON.stringify(output);
      }
      return match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, outputs));
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, outputs);
    }
    return resolved;
  }

  return value;
}

// ============================================================================
// STRIP PLAN FROM TEXT
// ============================================================================

/**
 * Strip LLMCompiler plan from text (for TTS).
 */
export function stripLLMCompilerPlan(text: string): string {
  const jsonStr = extractJsonArray(text);
  if (!jsonStr) return text;

  return text.replace(jsonStr, '').trim();
}
