/**
 * Unified Backchanneling Decision Engine
 *
 * Single decision engine that handles all backchanneling modes:
 * - Standard: Basic verbal nods
 * - Enhanced: Context-aware, research-backed
 * - Live: Real-time during speech
 *
 * @module backchanneling/decision-engine
 */
import { type BackchannelCategory } from '../persona-phrases.js';
import type { BackchannelContext, BackchannelDecision, BackchannelEngineOptions, BackchannelMode } from './types.js';
/**
 * Unified backchanneling decision engine
 *
 * Consolidates logic from:
 * - BackchannelingSystem (backchanneling.ts)
 * - EnhancedBackchannelingEngine (enhanced-backchanneling.ts)
 * - LiveBackchannelingService (live-backchanneling/)
 *
 * New adaptive mode automatically switches between modes based on:
 * - Conversation turn count (early = standard)
 * - Topic weight (heavy = enhanced)
 * - Emotional intensity (high = live)
 * - Breath pause availability (available = live)
 */
export declare class BackchannelEngine {
    private readonly configuredMode;
    private readonly baseTiming;
    private readonly personaId;
    private readonly adaptiveConfig;
    private lastBackchannelTime;
    private backchannelCount;
    private turnBackchannelCount;
    private backchannelHistory;
    private readonly maxHistorySize;
    private modeHistory;
    private lastAdaptiveMode;
    constructor(options: BackchannelEngineOptions);
    /**
     * Get the current effective mode (for adaptive, this can change per context)
     */
    get mode(): BackchannelMode;
    /**
     * Determine the best mode for the current context (adaptive mode logic)
     */
    private determineAdaptiveMode;
    /**
     * Decide whether to emit a backchannel
     */
    decide(context: BackchannelContext): BackchannelDecision;
    private checkTiming;
    private determineEmotionType;
    private selectCategory;
    private selectPhrase;
    private buildSsml;
    private recordBackchannel;
    private noBackchannel;
    /**
     * Call when a new turn starts
     */
    newTurn(): void;
    /**
     * Reset engine state
     */
    reset(): void;
    /**
     * Get engine statistics
     */
    getStats(): {
        mode: BackchannelMode;
        totalBackchannels: number;
        turnBackchannels: number;
        lastBackchannelTime: number;
        recentCategories: BackchannelCategory[];
    };
    /**
     * Get last backchannel time
     */
    getLastBackchannelTime(): number;
    /**
     * Get adaptive mode statistics (only relevant for adaptive mode)
     */
    getAdaptiveModeStats(): {
        isAdaptive: boolean;
        currentEffectiveMode: BackchannelMode;
        modeHistory: BackchannelMode[];
        modeBreakdown: Record<BackchannelMode, number>;
    };
}
/**
 * Create a backchannel engine for a specific mode
 */
export declare function createBackchannelEngine(options: BackchannelEngineOptions): BackchannelEngine;
//# sourceMappingURL=decision-engine.d.ts.map