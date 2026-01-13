/**
 * Superhuman Orchestrator Registry
 *
 * Session-scoped singleton management.
 *
 * @module @ferni/superhuman/orchestrator/registry
 */
import { BetterThanHumanOrchestrator } from './engine.js';
/**
 * Get or create the Better Than Human orchestrator
 */
export declare function getBetterThanHuman(userId: string, sessionId: string, personaId: string, sessionCount?: number): BetterThanHumanOrchestrator;
/**
 * Clear orchestrator
 */
export declare function clearBetterThanHuman(userId: string, sessionId: string): void;
/**
 * Get an existing orchestrator for a user without creating a new one.
 */
export declare function getExistingBetterThanHumanForUser(userId: string): BetterThanHumanOrchestrator | undefined;
/**
 * Get count of active orchestrators
 */
export declare function getOrchestratorCount(): number;
/**
 * Clear all orchestrators for a user
 */
export declare function clearAllBetterThanHumanForUser(userId: string): void;
//# sourceMappingURL=registry.d.ts.map