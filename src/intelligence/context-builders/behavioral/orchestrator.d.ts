/**
 * Behavioral Context Orchestrator
 *
 * The main entry point for the behavioral context system.
 * This orchestrator:
 *
 * 1. Runs all registered behavioral builders
 * 2. Aggregates their signals
 * 3. Outputs a clean behavioral directive
 *
 * The result is a structured instruction that tells the model
 * HOW to behave - not facts about the user that might leak.
 *
 * @module intelligence/context-builders/behavioral/orchestrator
 */
import type { ContextBuilderInput } from '../core/types.js';
import type { BehavioralBuilder, BehavioralSignals } from './signals.js';
import { type AggregatedBehavior } from './aggregator.js';
/**
 * Register a behavioral builder
 */
export declare function registerBehavioralBuilder(builder: BehavioralBuilder): void;
/**
 * Get all registered behavioral builders
 */
export declare function getBehavioralBuilders(): BehavioralBuilder[];
export interface BehavioralResult {
    /** The aggregated behavior */
    behavior: AggregatedBehavior;
    /** Formatted directive for the prompt */
    directive: string;
    /** Compact format for system prompt */
    compactDirective: string;
    /** Raw signals from each builder (for debugging) */
    rawSignals: Array<{
        builder: string;
        signals: BehavioralSignals;
    }>;
    /** Performance metrics */
    metrics: {
        totalDurationMs: number;
        builderDurations: Record<string, number>;
        buildersRun: number;
    };
}
/**
 * Run all behavioral builders and produce the final directive
 */
export declare function buildBehavioralContext(input: ContextBuilderInput, options?: {
    /** Timeout per builder in ms */
    builderTimeoutMs?: number;
    /** Enable parallel execution */
    parallel?: boolean;
    /** Skip specific builders */
    skip?: string[];
}): Promise<BehavioralResult>;
/**
 * Quick function to get just the directive string
 */
export declare function getBehavioralDirective(input: ContextBuilderInput): Promise<string>;
/**
 * Quick function to get compact directive for system prompt
 */
export declare function getCompactBehavioralDirective(input: ContextBuilderInput): Promise<string>;
import type { ContextInjection } from '../core/types.js';
/**
 * Hybrid orchestration that combines:
 * 1. New behavioral builders
 * 2. Legacy context injections (translated to signals)
 *
 * This allows gradual migration while maintaining backwards compatibility.
 */
export declare function buildHybridBehavioralContext(input: ContextBuilderInput, legacyInjections: ContextInjection[]): Promise<BehavioralResult>;
//# sourceMappingURL=orchestrator.d.ts.map