/**
 * Effect Coordinator
 *
 * Coordinates effect selection and application.
 * This is the main orchestration point for the composable effect pattern.
 *
 * Features:
 * - Registers and manages all effects
 * - Selects applicable effects based on context
 * - Enforces cooldowns, limits, and probability checks
 * - Applies effects to responses in priority order
 * - Tracks what was applied/skipped for debugging
 *
 * @module @ferni/conversation/effects/effect-coordinator
 */
import type { EffectCoordinator } from './types.js';
/**
 * Get or create an effect coordinator for a session
 */
export declare function getEffectCoordinator(sessionId: string, personaId: string): EffectCoordinator;
/**
 * Reset coordinator for a session
 */
export declare function resetEffectCoordinator(sessionId: string, personaId: string): void;
/**
 * Reset all coordinators
 */
export declare function resetAllEffectCoordinators(): void;
//# sourceMappingURL=effect-coordinator.d.ts.map