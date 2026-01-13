/**
 * Behavioral Signal Aggregator
 *
 * Combines behavioral signals from multiple builders into a unified
 * behavioral directive. Handles conflicts by priority and confidence.
 *
 * @module intelligence/context-builders/behavioral/aggregator
 */
import type { BehavioralSignals, ToneModifier, PaceModifier, LengthModifier, EnergyModifier, StyleModifier, QuestionStyle, CallbackSignal, SpecialModes } from './signals.js';
/**
 * The final aggregated behavioral directive
 */
export interface AggregatedBehavior {
    /** Resolved tone */
    tone: ToneModifier;
    /** Resolved pace */
    pace: PaceModifier;
    /** Resolved length */
    length: LengthModifier;
    /** Resolved energy */
    energy: EnergyModifier;
    /** Resolved style */
    style: StyleModifier;
    /** Resolved question approach */
    questionStyle: QuestionStyle;
    /** All callbacks to consider weaving in */
    callbacks: CallbackSignal[];
    /** Topics/approaches to avoid */
    avoidances: string[];
    /** Active special modes */
    modes: SpecialModes;
    /** Debug: which builders contributed */
    contributors: string[];
    /** Warnings about conflicts */
    warnings: string[];
}
/**
 * Aggregate multiple behavioral signals into a single directive
 */
export declare function aggregateBehavior(signals: BehavioralSignals[]): AggregatedBehavior;
/**
 * Format aggregated behavior into a concise behavioral directive.
 *
 * This is NOT injected as context - it's the MODEL'S instructions.
 * The format is designed to be:
 * 1. Concise - minimal tokens
 * 2. Direct - no "stage directions" to interpret
 * 3. Actionable - tells model WHAT TO DO, not what to know
 */
export declare function formatBehavioralDirective(behavior: AggregatedBehavior): string;
/**
 * Format for system prompt (even more concise)
 */
export declare function formatForSystemPrompt(behavior: AggregatedBehavior): string;
//# sourceMappingURL=aggregator.d.ts.map