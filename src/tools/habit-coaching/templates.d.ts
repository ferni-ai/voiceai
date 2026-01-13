/**
 * Habit Templates - Pre-built habits for common goals
 *
 * Curated collection of habit templates based on behavioral science.
 * Each template includes glidepath versions for gradual progression,
 * complete habit loops, and AI coaching context.
 *
 * @module habit-coaching/templates
 */
import type { LifeDomain, LifeStage, HabitTemplate } from './types.js';
export type { HabitTemplate } from './types.js';
export declare const HABIT_TEMPLATES: HabitTemplate[];
/**
 * Get templates for a specific domain
 */
export declare function getTemplatesByDomain(domain: LifeDomain): HabitTemplate[];
/**
 * Get templates by difficulty level
 */
export declare function getTemplatesByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): HabitTemplate[];
/**
 * Get keystone habits (high-impact habits)
 */
export declare function getKeystoneTemplates(): HabitTemplate[];
/**
 * Get template by ID
 */
export declare function getTemplateById(id: string): HabitTemplate | undefined;
/**
 * Get templates suitable for a life stage
 */
export declare function getTemplatesForStage(stage: LifeStage): HabitTemplate[];
//# sourceMappingURL=templates.d.ts.map