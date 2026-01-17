/**
 * Context Builder Registry
 *
 * Registration and lookup for context builders with indexing optimization.
 *
 * @module context-builders/core/registry
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './types.js';
import { getBuilderCategory, type BuilderCategory, BUILDER_CATEGORIES } from './categories.js';

const log = createLogger({ module: 'context-registry' });

// ============================================================================
// REGISTRY STATE
// ============================================================================

const builders = new Map<string, ContextBuilder>();

/** Pre-computed index of builders by category for O(1) lookup */
const buildersByCategory = new Map<BuilderCategory, Set<string>>();

/** Cached sorted array of all builders (invalidated on registration) */
let sortedBuildersCache: ContextBuilder[] | null = null;

/** Cached sorted arrays by category (invalidated on registration) */
const sortedByCategoryCache = new Map<BuilderCategory, ContextBuilder[]>();

/** Track duplicate registration attempts */
const registrationWarnings = new Set<string>();

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Invalidate all caches (called when builders change)
 */
function invalidateCaches(): void {
  sortedBuildersCache = null;
  sortedByCategoryCache.clear();
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Register a context builder.
 *
 * Supports two call signatures for backward compatibility:
 * 1. registerContextBuilder(builder: ContextBuilder) - new style
 * 2. registerContextBuilder(name: string, buildFn: Function) - legacy style
 *
 * @param builderOrName - Either a ContextBuilder object or the builder name (legacy)
 * @param buildFn - Build function (only for legacy style)
 */
export function registerContextBuilder(
  builderOrName: ContextBuilder | string,
  buildFn?: (input: ContextBuilderInput) => Promise<ContextInjection[]> | ContextInjection[]
): void {
  let builder: ContextBuilder;

  if (typeof builderOrName === 'string') {
    // Legacy call: registerContextBuilder('name', buildFn)
    if (!buildFn) {
      throw new Error(`registerContextBuilder('${builderOrName}') called without a build function`);
    }
    builder = {
      name: builderOrName,
      description: `Context builder: ${builderOrName}`,
      priority: 50, // Default priority
      category: getBuilderCategory(builderOrName),
      build: async (input) => {
        const result = buildFn(input);
        return result instanceof Promise ? result : Promise.resolve(result);
      },
    };
  } else {
    builder = {
      ...builderOrName,
      category: builderOrName.category || getBuilderCategory(builderOrName.name),
    };
  }

  // Validation: warn on duplicate registration
  if (builders.has(builder.name) && !registrationWarnings.has(builder.name)) {
    log.warn({ builder: builder.name }, 'Builder already registered, overwriting');
    registrationWarnings.add(builder.name);
  }

  // Validation: check dependencies exist (deferred check)
  if (builder.dependsOn) {
    for (const dep of builder.dependsOn) {
      if (!builders.has(dep) && !BUILDER_CATEGORIES[dep]) {
        log.debug(
          { builder: builder.name, dependency: dep },
          'Builder depends on unregistered builder (may load later)'
        );
      }
    }
  }

  // Remove from old category index if overwriting
  if (builders.has(builder.name)) {
    const oldBuilder = builders.get(builder.name)!;
    const oldCategory = oldBuilder.category || getBuilderCategory(oldBuilder.name);
    const oldCategorySet = buildersByCategory.get(oldCategory);
    if (oldCategorySet) {
      oldCategorySet.delete(builder.name);
    }
  }

  // Add to builders map
  builders.set(builder.name, builder);

  // Add to category index
  const category = builder.category || getBuilderCategory(builder.name);
  if (!buildersByCategory.has(category)) {
    buildersByCategory.set(category, new Set());
  }
  buildersByCategory.get(category)!.add(builder.name);

  // Invalidate caches
  invalidateCaches();

  log.debug(
    { builder: builder.name, priority: builder.priority, category },
    'Registered context builder'
  );
}

// ============================================================================
// LOOKUP
// ============================================================================

/**
 * Get all registered builders, sorted by priority (highest first)
 * Uses cached sorted array for O(1) repeated access
 */
export function getRegisteredBuilders(): ContextBuilder[] {
  if (sortedBuildersCache) {
    return sortedBuildersCache;
  }

  sortedBuildersCache = Array.from(builders.values()).sort((a, b) => b.priority - a.priority);
  return sortedBuildersCache;
}

/**
 * Get builders by category using pre-computed index
 * O(k) where k = builders in category, instead of O(n) filtering all builders
 */
export function getBuildersByCategory(category: BuilderCategory): ContextBuilder[] {
  // Check cache first
  const cached = sortedByCategoryCache.get(category);
  if (cached) {
    return cached;
  }

  // Use index for O(1) lookup of builder names in category
  const builderNames = buildersByCategory.get(category);
  if (!builderNames || builderNames.size === 0) {
    return [];
  }

  // Build sorted array from index
  const result: ContextBuilder[] = [];
  for (const name of builderNames) {
    const builder = builders.get(name);
    if (builder) {
      result.push(builder);
    }
  }

  result.sort((a, b) => b.priority - a.priority);

  // Cache the result
  sortedByCategoryCache.set(category, result);

  return result;
}

/**
 * Check if a builder is registered
 */
export function isBuilderRegistered(name: string): boolean {
  return builders.has(name);
}

/**
 * Get builder count
 */
export function getBuilderCount(): number {
  return builders.size;
}

/**
 * Get registry statistics for monitoring
 */
export function getRegistryStats(): {
  totalBuilders: number;
  byCategory: Record<string, number>;
  cacheStatus: { sortedAll: boolean; sortedByCategory: number };
} {
  const byCategory: Record<string, number> = {};
  for (const [category, names] of buildersByCategory.entries()) {
    byCategory[category] = names.size;
  }

  return {
    totalBuilders: builders.size,
    byCategory,
    cacheStatus: {
      sortedAll: sortedBuildersCache !== null,
      sortedByCategory: sortedByCategoryCache.size,
    },
  };
}

/**
 * Get builders filtered by active categories
 *
 * @param activeCategories - Categories to include
 * @returns Filtered and sorted builders
 */
export function getBuildersByActiveCategories(
  activeCategories: BuilderCategory[]
): ContextBuilder[] {
  const activeSet = new Set(activeCategories);
  const allBuilders = getRegisteredBuilders();

  return allBuilders.filter((builder) => {
    const category = builder.category || getBuilderCategory(builder.name);
    return activeSet.has(category);
  });
}
