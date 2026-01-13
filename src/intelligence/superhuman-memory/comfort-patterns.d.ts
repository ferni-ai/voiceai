/**
 * Comfort Pattern Application
 *
 * Apply what helps when stress is detected.
 *
 * @module superhuman-memory/comfort-patterns
 */
import type { HumanMemory } from '../../types/human-memory.js';
import type { ComfortGuidance } from './types.js';
/**
 * Determine comfort guidance based on detected emotional state
 */
export declare function getComfortGuidance(humanMemory: Partial<HumanMemory> | undefined, detectedEmotion: string | undefined, detectedStressLevel: number): ComfortGuidance;
//# sourceMappingURL=comfort-patterns.d.ts.map