/**
 * Behavioral Signal Aggregator
 *
 * Combines behavioral signals from multiple builders into a unified
 * behavioral directive. Handles conflicts by priority and confidence.
 *
 * @module intelligence/context-builders/behavioral/aggregator
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  BehavioralSignals,
  ToneModifier,
  PaceModifier,
  LengthModifier,
  EnergyModifier,
  StyleModifier,
  QuestionStyle,
  CallbackSignal,
  SpecialModes,
} from './signals.js';

const log = createLogger({ module: 'behavioral:aggregator' });

// ============================================================================
// AGGREGATION RESULT
// ============================================================================

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

// ============================================================================
// PRIORITY WEIGHTING
// ============================================================================

/**
 * Get the effective priority weight for a signal
 * Higher priority = more weight in conflicts
 */
function getWeight(signal: BehavioralSignals): number {
  const basePriority = signal.priority ?? 50;
  const confidence = signal.confidence ?? 0.8;
  return basePriority * confidence;
}

// ============================================================================
// VALUE RESOLUTION
// ============================================================================

/**
 * Resolve a single-value field (tone, pace, etc.) from multiple signals.
 * Higher priority wins. Equal priority = last writer wins.
 */
function resolveValue<T>(
  signals: BehavioralSignals[],
  field: keyof BehavioralSignals,
  defaultValue: T
): T {
  let bestValue: T = defaultValue;
  let bestWeight = -1;

  for (const signal of signals) {
    const value = signal[field] as T | undefined;
    if (value !== undefined) {
      const weight = getWeight(signal);
      if (weight >= bestWeight) {
        bestValue = value;
        bestWeight = weight;
      }
    }
  }

  return bestValue;
}

// ============================================================================
// MODE AGGREGATION
// ============================================================================

/**
 * Aggregate special modes - any builder can activate a mode
 */
function aggregateModes(signals: BehavioralSignals[]): SpecialModes {
  const result: SpecialModes = {};

  for (const signal of signals) {
    if (signal.modes) {
      // OR all modes together - any builder can activate
      if (signal.modes.holdingSpace) result.holdingSpace = true;
      if (signal.modes.crisisMode) result.crisisMode = true;
      if (signal.modes.celebrationMode) result.celebrationMode = true;
      if (signal.modes.transitionMode) result.transitionMode = true;
      if (signal.modes.ventingMode) result.ventingMode = true;
      if (signal.modes.processingMode) result.processingMode = true;
      // Superhuman predictive modes
      if (signal.modes.breakthroughMode) result.breakthroughMode = true;
      if (signal.modes.spiralRiskMode) result.spiralRiskMode = true;
    }
  }

  return result;
}

// ============================================================================
// CALLBACK AGGREGATION
// ============================================================================

/**
 * Aggregate callbacks - collect all, limit by count
 */
function aggregateCallbacks(signals: BehavioralSignals[], maxCallbacks = 3): CallbackSignal[] {
  const all: CallbackSignal[] = [];

  for (const signal of signals) {
    if (signal.callbacks) {
      all.push(...signal.callbacks);
    }
  }

  // Sort by strength (important > natural > gentle > subtle)
  const strengthOrder: Record<CallbackSignal['strength'], number> = {
    important: 0,
    natural: 1,
    gentle: 2,
    subtle: 3,
  };
  all.sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]);

  // Limit to top N
  return all.slice(0, maxCallbacks);
}

// ============================================================================
// AVOIDANCES AGGREGATION
// ============================================================================

/**
 * Aggregate avoidances - union of all
 */
function aggregateAvoidances(signals: BehavioralSignals[]): string[] {
  const all = new Set<string>();

  for (const signal of signals) {
    if (signal.avoidances) {
      for (const avoidance of signal.avoidances) {
        all.add(avoidance);
      }
    }
  }

  return Array.from(all);
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Detect and warn about conflicting signals
 */
function detectConflicts(signals: BehavioralSignals[]): string[] {
  const warnings: string[] = [];

  // Check for conflicting tones
  const tones = signals.filter((s) => s.tone).map((s) => s.tone);
  const uniqueTones = new Set(tones);
  if (uniqueTones.size > 1) {
    warnings.push(`Tone conflict: ${Array.from(uniqueTones).join(' vs ')}`);
  }

  // Check for conflicting modes
  const modes = aggregateModes(signals);
  if (modes.crisisMode && modes.celebrationMode) {
    warnings.push('Mode conflict: crisis + celebration (crisis wins)');
  }

  return warnings;
}

// ============================================================================
// MAIN AGGREGATOR
// ============================================================================

/**
 * Aggregate multiple behavioral signals into a single directive
 */
export function aggregateBehavior(signals: BehavioralSignals[]): AggregatedBehavior {
  if (signals.length === 0) {
    return getDefaultBehavior();
  }

  const warnings = detectConflicts(signals);
  const modes = aggregateModes(signals);

  // Crisis mode overrides everything
  if (modes.crisisMode) {
    return {
      tone: 'grounding',
      pace: 'slow',
      length: 'brief',
      energy: 'subdued',
      style: 'grounding',
      questionStyle: 'none',
      callbacks: [], // No callbacks in crisis
      avoidances: aggregateAvoidances(signals),
      modes,
      contributors: signals.filter((s) => s.source).map((s) => s.source!),
      warnings: [...warnings, 'Crisis mode: all other signals overridden'],
    };
  }

  const result: AggregatedBehavior = {
    tone: resolveValue(signals, 'tone', 'warm'),
    pace: resolveValue(signals, 'pace', 'normal'),
    length: resolveValue(signals, 'length', 'moderate'),
    energy: resolveValue(signals, 'energy', 'warm'),
    style: resolveValue(signals, 'style', 'supportive'),
    questionStyle: resolveValue(signals, 'questionStyle', 'open'),
    callbacks: aggregateCallbacks(signals),
    avoidances: aggregateAvoidances(signals),
    modes,
    contributors: signals.filter((s) => s.source).map((s) => s.source!),
    warnings,
  };

  // Mode-based adjustments
  if (modes.holdingSpace) {
    result.length = 'brief';
    result.questionStyle = 'none';
    result.style = 'listening';
  }

  if (modes.ventingMode) {
    result.style = 'listening';
    result.questionStyle = 'none';
  }

  if (modes.celebrationMode && !modes.crisisMode) {
    result.energy = 'elevated';
    result.tone = 'celebratory';
  }

  if (result.warnings.length > 0) {
    log.debug({ warnings: result.warnings }, 'Behavioral signal conflicts detected');
  }

  return result;
}

/**
 * Get default behavior when no signals provided
 */
function getDefaultBehavior(): AggregatedBehavior {
  return {
    tone: 'warm',
    pace: 'normal',
    length: 'moderate',
    energy: 'warm',
    style: 'supportive',
    questionStyle: 'open',
    callbacks: [],
    avoidances: [],
    modes: {},
    contributors: [],
    warnings: [],
  };
}

// ============================================================================
// BEHAVIORAL DIRECTIVE FORMATTING
// ============================================================================

/**
 * Format aggregated behavior into a concise behavioral directive.
 *
 * This is NOT injected as context - it's the MODEL'S instructions.
 * The format is designed to be:
 * 1. Concise - minimal tokens
 * 2. Direct - no "stage directions" to interpret
 * 3. Actionable - tells model WHAT TO DO, not what to know
 */
export function formatBehavioralDirective(behavior: AggregatedBehavior): string {
  const lines: string[] = [];

  // Core behavioral instruction
  lines.push('## Response Style');
  lines.push('');

  // Tone and energy in one line
  const toneEnergy = `Be ${behavior.tone}${behavior.energy !== 'warm' ? `, ${behavior.energy} energy` : ''}.`;
  lines.push(toneEnergy);

  // Pace and length
  if (behavior.pace !== 'normal' || behavior.length !== 'moderate') {
    const paceLength = [
      behavior.pace !== 'normal' ? `${behavior.pace} pace` : null,
      behavior.length !== 'moderate' ? `${behavior.length} response` : null,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`Keep ${paceLength}.`);
  }

  // Conversational approach
  const styleMap: Record<StyleModifier, string> = {
    listening: 'Focus on hearing them. Minimal output.',
    exploratory: 'Be curious. Ask open questions.',
    supportive: 'Validate and support.',
    directive: 'Guide toward action.',
    celebratory: 'Celebrate with them!',
    reflective: 'Mirror back insights.',
    grounding: 'Help them feel stable and present.',
    collaborative: 'Work alongside them.',
    coaching: 'Guide with action-oriented questions and suggestions.',
    challenging: 'Offer gentle pushback to encourage growth.',
    direct: 'Be straightforward and clear.',
  };
  lines.push(styleMap[behavior.style]);

  // Question guidance
  if (behavior.questionStyle === 'none') {
    lines.push('No questions right now - just presence.');
  } else if (behavior.questionStyle === 'gentle-probe') {
    lines.push('If you ask anything, go gently deeper.');
  }

  // Special modes
  if (behavior.modes.crisisMode) {
    lines.push('');
    lines.push('**PRIORITY: Safety first. Ground them. Listen. Resources available.**');
  } else if (behavior.modes.holdingSpace) {
    lines.push('');
    lines.push("**Just be present. Don't fix. Don't advise.**");
  } else if (behavior.modes.ventingMode) {
    lines.push('');
    lines.push("**They're venting. Listen fully. Don't solve.**");
  } else if (behavior.modes.celebrationMode) {
    lines.push('');
    lines.push('**This is a win! Celebrate genuinely.**');
  }

  // Callbacks as behavioral hints (NOT facts)
  if (behavior.callbacks.length > 0) {
    lines.push('');
    lines.push('## Conversation Weaving');
    for (const callback of behavior.callbacks) {
      const strength =
        callback.strength === 'important'
          ? 'Consider:'
          : callback.strength === 'natural'
            ? 'If natural:'
            : 'Optionally:';
      lines.push(`${strength} ${callback.hint}`);
    }
  }

  // Avoidances
  if (behavior.avoidances.length > 0) {
    lines.push('');
    lines.push('## Avoid');
    for (const avoid of behavior.avoidances) {
      lines.push(`- ${avoid}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format for system prompt (even more concise)
 */
export function formatForSystemPrompt(behavior: AggregatedBehavior): string {
  const parts: string[] = [];

  // One-liner behavioral summary
  parts.push(`[STYLE: ${behavior.tone}, ${behavior.style}]`);

  // Critical modes only
  if (behavior.modes.crisisMode) {
    parts.push('[MODE: CRISIS - Safety first]');
  } else if (behavior.modes.holdingSpace) {
    parts.push('[MODE: PRESENCE - Just be here]');
  } else if (behavior.modes.celebrationMode) {
    parts.push('[MODE: CELEBRATION]');
  }

  // Callbacks as brief hints
  if (behavior.callbacks.length > 0) {
    const hints = behavior.callbacks.map((c) => c.hint.substring(0, 50)).join('; ');
    parts.push(`[WEAVE: ${hints}]`);
  }

  return parts.join(' ');
}
