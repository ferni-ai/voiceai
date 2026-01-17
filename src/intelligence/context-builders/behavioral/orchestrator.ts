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

import { createLogger } from '../../../utils/safe-logger.js';
import type { ContextBuilderInput } from '../core/types.js';
import type { BehavioralBuilder, BehavioralSignals } from './signals.js';
import {
  aggregateBehavior,
  formatBehavioralDirective,
  formatForSystemPrompt,
  type AggregatedBehavior,
} from './aggregator.js';

const log = createLogger({ module: 'behavioral:orchestrator' });

// ============================================================================
// BUILDER REGISTRY
// ============================================================================

const behavioralBuilders = new Map<string, BehavioralBuilder>();

/**
 * Register a behavioral builder
 */
export function registerBehavioralBuilder(builder: BehavioralBuilder): void {
  if (behavioralBuilders.has(builder.name)) {
    log.warn({ builder: builder.name }, 'Overwriting existing behavioral builder');
  }
  behavioralBuilders.set(builder.name, builder);
  log.debug({ builder: builder.name, priority: builder.priority }, 'Registered behavioral builder');
}

/**
 * Get all registered behavioral builders
 */
export function getBehavioralBuilders(): BehavioralBuilder[] {
  return Array.from(behavioralBuilders.values()).sort((a, b) => a.priority - b.priority);
}

// ============================================================================
// ORCHESTRATION RESULT
// ============================================================================

export interface BehavioralResult {
  /** The aggregated behavior */
  behavior: AggregatedBehavior;

  /** Formatted directive for the prompt */
  directive: string;

  /** Compact format for system prompt */
  compactDirective: string;

  /** Raw signals from each builder (for debugging) */
  rawSignals: Array<{ builder: string; signals: BehavioralSignals }>;

  /** Performance metrics */
  metrics: {
    totalDurationMs: number;
    builderDurations: Record<string, number>;
    buildersRun: number;
  };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Run all behavioral builders and produce the final directive
 */
export async function buildBehavioralContext(
  input: ContextBuilderInput,
  options: {
    /** Timeout per builder in ms */
    builderTimeoutMs?: number;
    /** Enable parallel execution */
    parallel?: boolean;
    /** Skip specific builders */
    skip?: string[];
  } = {}
): Promise<BehavioralResult> {
  const startTime = performance.now();
  const builderTimeoutMs = options.builderTimeoutMs ?? 50; // 50ms default timeout per builder
  const parallel = options.parallel ?? true;
  const skip = new Set(options.skip ?? []);

  const builders = getBehavioralBuilders().filter((b) => !skip.has(b.name));
  const rawSignals: Array<{ builder: string; signals: BehavioralSignals }> = [];
  const builderDurations: Record<string, number> = {};

  /**
   * Run a single builder with timeout
   */
  const runBuilder = async (builder: BehavioralBuilder): Promise<BehavioralSignals | null> => {
    const builderStart = performance.now();

    try {
      const signals = await Promise.race([
        builder.build(input),
        new Promise<BehavioralSignals>((_, reject) => {
          setTimeout(() => reject(new Error('Builder timeout')), builderTimeoutMs);
        }),
      ]);

      builderDurations[builder.name] = performance.now() - builderStart;

      // Ensure source is set
      return { ...signals, source: builder.name };
    } catch (error) {
      builderDurations[builder.name] = performance.now() - builderStart;
      log.warn({ builder: builder.name, error }, 'Behavioral builder failed');
      return null;
    }
  };

  // Run builders
  let allSignals: (BehavioralSignals | null)[];

  if (parallel) {
    allSignals = await Promise.all(builders.map(runBuilder));
  } else {
    allSignals = [];
    for (const builder of builders) {
      allSignals.push(await runBuilder(builder));
    }
  }

  // Collect successful signals
  for (let i = 0; i < builders.length; i++) {
    const signals = allSignals[i];
    if (signals) {
      rawSignals.push({
        builder: builders[i].name,
        signals,
      });
    }
  }

  // Aggregate all signals
  const signalsToAggregate = rawSignals.map((r) => r.signals);
  const behavior = aggregateBehavior(signalsToAggregate);

  // Format outputs
  const directive = formatBehavioralDirective(behavior);
  const compactDirective = formatForSystemPrompt(behavior);

  const totalDurationMs = performance.now() - startTime;

  log.debug(
    {
      buildersRun: rawSignals.length,
      contributors: behavior.contributors,
      totalDurationMs: totalDurationMs.toFixed(1),
      modes: Object.keys(behavior.modes).filter(
        (k) => behavior.modes[k as keyof typeof behavior.modes]
      ),
    },
    'Behavioral context built'
  );

  return {
    behavior,
    directive,
    compactDirective,
    rawSignals,
    metrics: {
      totalDurationMs,
      builderDurations,
      buildersRun: rawSignals.length,
    },
  };
}

// ============================================================================
// QUICK ACCESS FUNCTIONS
// ============================================================================

/**
 * Quick function to get just the directive string
 */
export async function getBehavioralDirective(input: ContextBuilderInput): Promise<string> {
  const result = await buildBehavioralContext(input);
  return result.directive;
}

/**
 * Quick function to get compact directive for system prompt
 */
export async function getCompactBehavioralDirective(input: ContextBuilderInput): Promise<string> {
  const result = await buildBehavioralContext(input);
  return result.compactDirective;
}

// ============================================================================
// HYBRID MODE: BEHAVIORAL + LEGACY
// ============================================================================

import { translateContextsToSignals } from './translator.js';
import type { ContextInjection } from '../core/types.js';

/**
 * Hybrid orchestration that combines:
 * 1. New behavioral builders
 * 2. Legacy context injections (translated to signals)
 *
 * This allows gradual migration while maintaining backwards compatibility.
 */
export async function buildHybridBehavioralContext(
  input: ContextBuilderInput,
  legacyInjections: ContextInjection[]
): Promise<BehavioralResult> {
  // Run behavioral builders
  const behavioralResult = await buildBehavioralContext(input);

  // Translate legacy injections to signals
  const legacySignals = translateContextsToSignals(
    legacyInjections.map((inj) => ({
      content: inj.content,
      source: inj.source,
      priority:
        inj.priority === 'critical'
          ? 90
          : inj.priority === 'high'
            ? 70
            : inj.priority === 'standard'
              ? 50
              : 30,
    }))
  );

  // Combine all signals
  const allSignals = [...behavioralResult.rawSignals.map((r) => r.signals), ...legacySignals];

  // Re-aggregate with legacy signals included
  const behavior = aggregateBehavior(allSignals);
  const directive = formatBehavioralDirective(behavior);
  const compactDirective = formatForSystemPrompt(behavior);

  return {
    behavior,
    directive,
    compactDirective,
    rawSignals: [
      ...behavioralResult.rawSignals,
      ...legacySignals.map((s, i) => ({
        builder: `legacy_${i}`,
        signals: s,
      })),
    ],
    metrics: behavioralResult.metrics,
  };
}
