/**
 * Dependency Resolver for Context Builders
 *
 * Provides topological sorting of context builders based on their
 * declared dependencies.
 *
 * @module intelligence/utils/dependency-resolver
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DependencyResolver' });

// ============================================================================
// TYPES
// ============================================================================

export interface DependencyNode {
  name: string;
  priority: number;
  dependsOn: string[];
}

export interface ResolvedOrder {
  order: string[];
  tiers: string[][];
  cycles: string[][];
  success: boolean;
  error?: string;
}

// ============================================================================
// CACHE
// ============================================================================

let resolvedOrderCache: { order: ResolvedOrder; builderHash: string } | null = null;

function generateBuilderHash(builders: DependencyNode[]): string {
  return builders
    .map(b => `${b.name}:${b.priority}:${b.dependsOn.join(',')}`)
    .sort()
    .join('|');
}

// ============================================================================
// TOPOLOGICAL SORT
// ============================================================================

function topologicalSort(builders: DependencyNode[]): ResolvedOrder {
  const builderMap = new Map<string, DependencyNode>();
  for (const builder of builders) {
    builderMap.set(builder.name, builder);
  }

  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  for (const builder of builders) {
    inDegree.set(builder.name, 0);
    adjacencyList.set(builder.name, []);
  }

  for (const builder of builders) {
    for (const dep of builder.dependsOn) {
      if (builderMap.has(dep)) {
        inDegree.set(builder.name, (inDegree.get(builder.name) || 0) + 1);
        adjacencyList.get(dep)?.push(builder.name);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  queue.sort((a, b) => {
    const builderA = builderMap.get(a);
    const builderB = builderMap.get(b);
    return (builderB?.priority || 0) - (builderA?.priority || 0);
  });

  const order: string[] = [];
  const tiers: string[][] = [];
  let currentTier: string[] = [...queue];

  while (queue.length > 0) {
    const nextTier: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      for (const dependent of adjacencyList.get(current) || []) {
        const newDegree = (inDegree.get(dependent) || 1) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          nextTier.push(dependent);
        }
      }
    }

    if (currentTier.length > 0) {
      tiers.push(currentTier);
    }

    if (nextTier.length > 0) {
      nextTier.sort((a, b) => {
        const builderA = builderMap.get(a);
        const builderB = builderMap.get(b);
        return (builderB?.priority || 0) - (builderA?.priority || 0);
      });

      queue.push(...nextTier);
      currentTier = [...nextTier];
    }
  }

  if (order.length !== builders.length) {
    const remaining = builders
      .filter(b => !order.includes(b.name))
      .map(b => b.name);

    return {
      order: [],
      tiers: [],
      cycles: [[...remaining]],
      success: false,
      error: `Circular dependency detected among: ${remaining.join(', ')}`,
    };
  }

  return {
    order,
    tiers,
    cycles: [],
    success: true,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function resolveDependencies(builders: DependencyNode[]): ResolvedOrder {
  const hash = generateBuilderHash(builders);
  if (resolvedOrderCache && resolvedOrderCache.builderHash === hash) {
    return resolvedOrderCache.order;
  }

  const result = topologicalSort(builders);

  if (result.success) {
    resolvedOrderCache = {
      order: result,
      builderHash: hash,
    };
    log.debug({ builderCount: builders.length, tierCount: result.tiers.length }, 'Dependency order resolved');
  } else {
    log.error({ error: result.error, cycles: result.cycles }, 'Failed to resolve dependencies');
  }

  return result;
}

export function getExecutionGroups(builders: DependencyNode[]): {
  groups: string[][];
  success: boolean;
  error?: string;
} {
  const resolved = resolveDependencies(builders);

  if (!resolved.success) {
    const fallbackOrder = [...builders]
      .sort((a, b) => b.priority - a.priority)
      .map(b => b.name);

    return {
      groups: [fallbackOrder],
      success: false,
      error: resolved.error,
    };
  }

  return {
    groups: resolved.tiers,
    success: true,
  };
}

export function hasDependencies(builders: DependencyNode[]): boolean {
  return builders.some(b => b.dependsOn.length > 0);
}

export function clearDependencyCache(): void {
  resolvedOrderCache = null;
}

export function validateDependencies(builders: DependencyNode[]): {
  valid: boolean;
  missingDeps: Array<{ builder: string; missing: string[] }>;
} {
  const builderNames = new Set(builders.map(b => b.name));
  const missingDeps: Array<{ builder: string; missing: string[] }> = [];

  for (const builder of builders) {
    const missing = builder.dependsOn.filter(dep => !builderNames.has(dep));
    if (missing.length > 0) {
      missingDeps.push({ builder: builder.name, missing });
    }
  }

  return {
    valid: missingDeps.length === 0,
    missingDeps,
  };
}

export default {
  resolveDependencies,
  getExecutionGroups,
  hasDependencies,
  validateDependencies,
  clearDependencyCache,
};
