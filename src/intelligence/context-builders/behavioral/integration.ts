/**
 * Behavioral Context Integration
 *
 * The new context system that replaces the legacy context builders.
 * Produces prompt context that CANNOT leak into speech.
 *
 * THE THREE SYSTEMS:
 *
 * 1. BEHAVIORAL SIGNALS (HOW to behave)
 *    - Tone, pace, style, energy
 *    - No facts that could leak
 *
 * 2. AWARENESS FACTS (WHAT to know)
 *    - Time, user name, session state
 *    - Facts the model SHOULD read and use
 *
 * 3. TOOL GUIDANCE (WHEN to query)
 *    - Available tools and when to use them
 *    - Model asks for data instead of having it pre-loaded
 *
 * @module intelligence/context-builders/behavioral/integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ContextBuilderInput } from '../core/types.js';
import { buildBehavioralContext, type BehavioralResult } from './orchestrator.js';
import { buildAwarenessFacts, formatAwarenessFacts } from './awareness.js';
import { getAvailableTools, formatToolGuidance, suggestTools } from './tool-guidance.js';

const log = createLogger({ module: 'behavioral:integration' });

// ============================================================================
// INTEGRATED RESULT
// ============================================================================

export interface IntegratedContextResult {
  /**
   * The behavioral directive to include in the prompt.
   * This tells the model HOW to behave (tone, style, pace, etc.)
   */
  behavioralDirective: string;

  /**
   * Awareness facts the model should know.
   * Unlike behavioral signals, these ARE meant to be read.
   */
  awarenessFacts: string;

  /**
   * Tool guidance - what tools are available and when to use them.
   * Teaches the model to ASK for data instead of having it pre-loaded.
   */
  toolGuidance: string;

  /**
   * Compact version for system prompt (if separate from user turn)
   */
  compactDirective: string;

  /**
   * Whether high-emotion mode was activated (reduces noise)
   */
  highEmotionMode: boolean;

  /**
   * Raw behavioral result (for debugging)
   */
  behavioralResult?: BehavioralResult;

  /**
   * Metrics for monitoring
   */
  metrics: {
    mode: 'behavioral';
    behavioralBuildersRun: number;
    totalDurationMs: number;
  };
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Detect if high-emotion mode should be activated.
 * In high emotion mode, we reduce context noise for focused support.
 */
function detectHighEmotionMode(analysis: ContextBuilderInput['analysis']): boolean {
  if (!analysis?.emotion) return false;

  const distressLevel = analysis.emotion.distressLevel ?? 0;
  const intensity = analysis.emotion.intensity ?? 0;

  // High emotion mode triggers when:
  // - Distress level > 0.7 (clear distress)
  // - OR intensity > 0.8 with certain primary emotions
  if (distressLevel > 0.7) return true;

  const highEmotionPrimaries = ['fear', 'sadness', 'anger', 'grief', 'panic', 'despair'];
  if (
    intensity > 0.8 &&
    analysis.emotion.primary &&
    highEmotionPrimaries.includes(analysis.emotion.primary.toLowerCase())
  ) {
    return true;
  }

  return false;
}

/**
 * Build context using the behavioral system.
 *
 * This is the main entry point for the turn handler and voice agent.
 * It produces three separate outputs:
 * - Behavioral directive (HOW to behave)
 * - Awareness facts (WHAT to know)
 * - Tool guidance (WHEN to query)
 */
export async function buildIntegratedContext(
  input: ContextBuilderInput
): Promise<IntegratedContextResult> {
  const startTime = performance.now();
  const highEmotionMode = detectHighEmotionMode(input.analysis);

  if (highEmotionMode) {
    log.info('🎯 High emotion mode activated: Focused support');
  }

  // Run all three systems in parallel
  const [behavioralResult, awarenessFacts, availableTools] = await Promise.all([
    buildBehavioralContext(input),
    buildAwarenessFacts(input),
    getAvailableTools(input),
  ]);

  // Get tool suggestions based on context
  const toolSuggestions = suggestTools(input, availableTools);

  // Add tool suggestions to behavioral result's callbacks
  if (toolSuggestions.length > 0 && behavioralResult.behavior.callbacks) {
    behavioralResult.behavior.callbacks.push(...toolSuggestions);
  }

  const duration = performance.now() - startTime;

  log.debug(
    {
      buildersRun: behavioralResult.metrics.buildersRun,
      toolsAvailable: availableTools.length,
      toolSuggestions: toolSuggestions.length,
      highEmotionMode,
      durationMs: duration.toFixed(1),
    },
    'Behavioral context built'
  );

  return {
    behavioralDirective: behavioralResult.directive,
    awarenessFacts: formatAwarenessFacts(awarenessFacts),
    toolGuidance: formatToolGuidance(availableTools),
    compactDirective: behavioralResult.compactDirective,
    highEmotionMode,
    behavioralResult,
    metrics: {
      mode: 'behavioral',
      behavioralBuildersRun: behavioralResult.metrics.buildersRun,
      totalDurationMs: duration,
    },
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick function to get just the combined prompt context.
 * Combines: Awareness Facts + Behavioral Directive + Tool Guidance
 */
export async function getPromptContext(input: ContextBuilderInput): Promise<string> {
  const result = await buildIntegratedContext(input);

  const parts: string[] = [];

  // 1. Awareness facts first (what the model should know)
  if (result.awarenessFacts) {
    parts.push(result.awarenessFacts);
  }

  // 2. Behavioral directive (how to behave)
  if (result.behavioralDirective) {
    parts.push(result.behavioralDirective);
  }

  // 3. Tool guidance (when to query for more info)
  if (result.toolGuidance) {
    parts.push(result.toolGuidance);
  }

  return parts.join('\n\n');
}

/**
 * Quick function for system prompt injection
 */
export async function getSystemPromptContext(input: ContextBuilderInput): Promise<string> {
  const result = await buildIntegratedContext(input);
  return result.compactDirective || result.behavioralDirective;
}
