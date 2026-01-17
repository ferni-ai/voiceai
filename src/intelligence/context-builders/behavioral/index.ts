/**
 * Behavioral Context Builder System
 *
 * A new architecture for guiding LLM behavior without context leakage.
 *
 * OLD APPROACH (leaky):
 * - Context builders emit strings: "[EMOTIONAL CONTEXT: User seems sad]"
 * - These strings are injected into the prompt
 * - LLM is told "don't speak this, just use it"
 * - Problem: LLMs often speak the context anyway
 *
 * NEW APPROACH (behavioral):
 * - Context builders emit structured signals: { tone: 'gentle', style: 'supportive' }
 * - Signals are aggregated and translated to behavioral instructions
 * - The instruction tells the model HOW to behave, not facts to know
 * - Nothing to leak because there are no raw facts
 *
 * MIGRATION PATH:
 * 1. Existing builders continue to work (translator converts their output)
 * 2. New builders can be written as behavioral builders
 * 3. Over time, convert existing builders to behavioral format
 *
 * @module intelligence/context-builders/behavioral
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  BehavioralSignals,
  BehavioralBuilder,
  ToneModifier,
  PaceModifier,
  LengthModifier,
  EnergyModifier,
  StyleModifier,
  QuestionStyle,
  CallbackSignal,
  SpecialModes,
} from './signals.js';

export {
  createCallback,
  createPresenceSignals,
  createCelebrationSignals,
  createCrisisSignals,
} from './signals.js';

// ============================================================================
// AGGREGATOR
// ============================================================================

export type { AggregatedBehavior } from './aggregator.js';

export {
  aggregateBehavior,
  formatBehavioralDirective,
  formatForSystemPrompt,
} from './aggregator.js';

// ============================================================================
// TRANSLATOR (Legacy -> Behavioral)
// ============================================================================

export {
  translateContextToSignals,
  translateContextsToSignals,
  wrapLegacyBuilder,
  sanitizeContextForSafety,
} from './translator.js';

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export type { BehavioralResult } from './orchestrator.js';

export {
  registerBehavioralBuilder,
  getBehavioralBuilders,
  buildBehavioralContext,
  getBehavioralDirective,
  getCompactBehavioralDirective,
  buildHybridBehavioralContext,
} from './orchestrator.js';

// ============================================================================
// INTEGRATION (for use with existing context builder infrastructure)
// ============================================================================

export type { IntegratedContextResult } from './integration.js';

export { buildIntegratedContext, getPromptContext, getSystemPromptContext } from './integration.js';

// ============================================================================
// AWARENESS FACTS (What the model should know)
// ============================================================================

export type { AwarenessFacts } from './awareness.js';

export {
  buildAwarenessFacts,
  formatAwarenessFacts,
  formatAwarenessCompact,
  getTimeOfDayBehavior,
} from './awareness.js';

// ============================================================================
// TOOL GUIDANCE (When to call tools)
// ============================================================================

export type { ToolAvailability, ToolCategory } from './tool-guidance.js';

export {
  getAvailableTools,
  formatToolGuidance,
  formatToolsCompact,
  suggestTools,
} from './tool-guidance.js';

// ============================================================================
// CONVERTED BUILDERS
// ============================================================================

// Import all behavioral builders to register them
import './builders/emotional.behavioral.js';
import './builders/memory.behavioral.js';
import './builders/distress.behavioral.js';
import './builders/awareness.behavioral.js';
import './builders/pacing.behavioral.js';
import './builders/humanizing.behavioral.js';
import './builders/validation.behavioral.js';
import './builders/energy.behavioral.js';
