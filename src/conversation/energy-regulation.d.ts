/**
 * Energy Regulation System
 *
 * > "Sometimes we match. Sometimes we gently lead."
 *
 * Sophisticated management of conversational energy:
 *
 * - **Energy Matching**: Mirror user's energy for rapport
 * - **Energy Leading**: Gently shift energy when helpful
 * - **Protective Grounding**: Bring down escalating distress
 * - **Uplift**: Gradually energize when appropriate
 * - **Stabilization**: Create calm, consistent presence
 *
 * The key insight: sometimes matching energy helps,
 * sometimes leading them somewhere better does.
 *
 * @module @ferni/energy-regulation
 */
export type EnergyLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
export type EnergyValence = 'negative' | 'neutral' | 'positive';
export type RegulationStrategy = 'match' | 'lead_up' | 'lead_down' | 'ground' | 'contain' | 'celebrate' | 'stabilize';
export interface EnergyState {
    /** Energy level (0-1) */
    level: number;
    /** Valence (-1 to 1) */
    valence: number;
    /** Stability (0-1) - how consistent is their energy */
    stability: number;
    /** Trajectory */
    trajectory: 'rising' | 'falling' | 'stable' | 'volatile';
    /** Categorized level */
    levelCategory: EnergyLevel;
    /** Categorized valence */
    valenceCategory: EnergyValence;
}
export interface RegulationDecision {
    /** Strategy to use */
    strategy: RegulationStrategy;
    /** Target energy level (0-1) */
    targetLevel: number;
    /** Target valence (-1 to 1) */
    targetValence: number;
    /** Strength of intervention (0-1) */
    interventionStrength: number;
    /** Reasoning */
    reasoning: string;
    /** Guidance for response */
    responseGuidance: EnergyGuidance;
}
export interface EnergyGuidance {
    /** Pace of speech */
    pace: 'slower' | 'normal' | 'faster';
    /** Volume/intensity */
    intensity: 'softer' | 'normal' | 'stronger';
    /** Affect in voice */
    affect: 'warmer' | 'calmer' | 'brighter' | 'steadier' | 'normal';
    /** Response length tendency */
    lengthTendency: 'shorter' | 'normal' | 'longer';
    /** Use of exclamations */
    exclamations: 'avoid' | 'minimal' | 'natural' | 'encouraged';
    /** Pause usage */
    pauses: 'more' | 'normal' | 'fewer';
}
export interface EnergyHistory {
    turn: number;
    state: EnergyState;
    timestamp: number;
}
export declare class EnergyRegulationEngine {
    private energyHistory;
    private currentUserEnergy;
    private agentTargetEnergy;
    private turnCount;
    private readonly HISTORY_SIZE;
    private readonly LEAD_RATE;
    private readonly MATCH_THRESHOLD;
    constructor();
    /**
     * Process user message and detect energy state
     *
     * @param userMessage - User's message
     * @param turnCount - Current turn
     * @param prosodyHints - Optional voice prosody hints
     * @returns Detected energy state
     */
    detectEnergy(userMessage: string, turnCount: number, prosodyHints?: {
        speechRate?: number;
        volume?: number;
        pitchVariance?: number;
    }): EnergyState;
    /**
     * Decide how to regulate energy
     *
     * @param userState - User's current energy state
     * @param context - Additional context
     * @returns Regulation decision
     */
    decide(userState: EnergyState, context: {
        isEmotionalContent?: boolean;
        isCrisis?: boolean;
        turnCount: number;
        comfortLevel?: number;
    }): RegulationDecision;
    /**
     * Get current energy state
     */
    getCurrentState(): {
        user: EnergyState;
        agentTarget: EnergyState;
    };
    /**
     * Get energy history
     */
    getHistory(): EnergyHistory[];
    /**
     * Reset for new session
     */
    reset(): void;
    private createDefaultState;
    private categorizeLevel;
    private categorizeValence;
    private calculateStability;
    private calculateTrajectory;
    private getResponseGuidance;
}
export declare function getEnergyRegulationEngine(sessionId: string): EnergyRegulationEngine;
export declare function resetEnergyRegulationEngine(sessionId: string): void;
export declare function clearEnergyRegulationEngine(sessionId: string): void;
export declare function getActiveEnergyRegulationCount(): number;
export default EnergyRegulationEngine;
//# sourceMappingURL=energy-regulation.d.ts.map