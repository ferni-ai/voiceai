/**
 * Repair Strategies
 *
 * Strategies for repairing declining rapport in conversation.
 *
 * @module rapport/repair-strategies
 */
import type { RapportScore, RepairState, RepairStrategy, RepairStrategyType } from './types.js';
/**
 * Select the most appropriate repair strategy based on current score and state
 */
export declare function selectRepairStrategy(score: RapportScore, repairState: RepairState): RepairStrategy;
/**
 * Get all available repair strategies
 */
export declare function getAvailableStrategies(): {
    type: RepairStrategyType;
    description: string;
}[];
/**
 * Get TTS adjustments for a strategy type
 */
export declare function getStrategyTtsAdjustments(type: RepairStrategyType): {
    speedMultiplier?: number;
    extraPauseMs?: number;
    volumeAdjust?: number;
} | undefined;
/**
 * Get context injection for a strategy type
 */
export declare function getStrategyContextInjection(type: RepairStrategyType): string | undefined;
//# sourceMappingURL=repair-strategies.d.ts.map