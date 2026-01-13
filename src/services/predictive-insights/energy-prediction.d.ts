/**
 * Energy/Productivity Prediction
 *
 * > "Based on your patterns, tomorrow morning looks like a high-energy window."
 *
 * Predicts optimal times for challenging tasks based on:
 * - Sleep patterns (if available)
 * - Calendar density
 * - Recent stress levels
 * - Historical energy patterns
 * - Day of week patterns
 * - Time of day patterns
 *
 * @module PredictiveInsights/EnergyPrediction
 */
import type { EnergyFactor, EnergyLevel } from './types.js';
export interface EnergyPrediction {
    userId: string;
    /** Predicted energy level */
    predictedLevel: EnergyLevel;
    /** When the high-energy window starts */
    windowStart: Date;
    /** When the high-energy window ends */
    windowEnd: Date;
    /** Human-friendly message */
    message: string;
    /** Suggested action */
    suggestion: string;
    /** Confidence in this prediction (0-1) */
    confidence: number;
    /** Factors contributing to this prediction */
    factors: EnergyFactor[];
    /** Should this be surfaced to user */
    shouldSurface: boolean;
}
/**
 * Predict energy levels and optimal windows for a user
 */
export declare function predictEnergy(userId: string): Promise<EnergyPrediction>;
/**
 * Record an energy observation for learning
 */
export declare function recordEnergyObservation(userId: string, level: EnergyLevel, factors?: string[]): void;
/**
 * Clear energy history for a user
 */
export declare function clearEnergyHistory(userId: string): void;
declare const _default: {
    predictEnergy: typeof predictEnergy;
    recordEnergyObservation: typeof recordEnergyObservation;
    clearEnergyHistory: typeof clearEnergyHistory;
};
export default _default;
//# sourceMappingURL=energy-prediction.d.ts.map