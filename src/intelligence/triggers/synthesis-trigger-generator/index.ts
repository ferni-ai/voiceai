/**
 * Synthesis Trigger Generator
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Generates synthesis triggers based on life context patterns.
 * These triggers respond to LIFE CONTEXT, not just words.
 *
 * Example:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Generate trigger: "support" with "You're carrying a lot right now"
 *
 * Key categories:
 * - support: User needs emotional/practical support
 * - celebration: Positive momentum worth acknowledging
 * - warning: Early intervention for emerging issues
 * - connection: User may need social connection
 * - rest: User needs to slow down
 *
 * @module synthesis-trigger-generator
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type { TriggerTemplate, SynthesisAnalytics, AnalyticsState } from './types.js';

// ============================================================================
// TRIGGER TEMPLATE EXPORTS
// ============================================================================

export { supportTriggerTemplates } from './support-triggers.js';
export { celebrationTriggerTemplates } from './celebration-triggers.js';
export { warningTriggerTemplates } from './warning-triggers.js';
export { nuancedTriggerTemplates } from './nuanced-triggers.js';

// ============================================================================
// GENERATOR EXPORTS
// ============================================================================

export {
  allTriggerTemplates,
  generateSynthesisTriggers,
  populateSynthesisTriggers,
  getMostImportantTrigger,
  getTriggersByCategory,
  getTriggersForPersona,
} from './generator.js';

// ============================================================================
// ANALYTICS EXPORTS
// ============================================================================

export {
  recordSynthesisTriggers,
  getSynthesisAnalytics,
  resetSynthesisAnalytics,
} from './analytics.js';
