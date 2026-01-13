/**
 * Habit Bundles - Pre-built habit recipes
 *
 * Curated bundles of habits that work well together,
 * each with a "stack formula" for optimal sequencing.
 *
 * @module habit-coaching/bundles
 */
import type { HabitBundleItem, HabitBundleDefinition } from './types.js';
export type { HabitBundleItem, HabitBundleDefinition } from './types.js';
export declare const HABIT_BUNDLES: Record<string, HabitBundleDefinition>;
/**
 * Get a bundle by key
 */
export declare function getBundle(key: string): HabitBundleDefinition | undefined;
/**
 * Get all bundle keys
 */
export declare function getBundleKeys(): string[];
/**
 * Get core habits from a bundle
 */
export declare function getBundleCoreHabits(key: string): HabitBundleItem[];
/**
 * Get enhancement habits from a bundle
 */
export declare function getBundleEnhancements(key: string): HabitBundleItem[];
//# sourceMappingURL=bundles.d.ts.map