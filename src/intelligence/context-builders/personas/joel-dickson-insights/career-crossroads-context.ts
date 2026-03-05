/**
 * Joel Dickson Insights - Career Crossroads Context
 *
 * Detects career transition signals and injects relevant Joel stories and angles.
 *
 * @module intelligence/context-builders/personas/joel-dickson-insights/career-crossroads-context
 */

import type { JoelInsightData, CareerCrossroadsContext } from './types.js';

// ============================================================================
// BUILD CAREER CROSSROADS CONTEXT
// ============================================================================

export function buildCareerCrossroadsContext(data: JoelInsightData): CareerCrossroadsContext {
  const { career } = data;
  const signals: string[] = [];
  let suggestedAngle: string | null = null;

  if (career.careerSignals.length > 0) {
    signals.push(`Career-related goals or signals: ${career.careerSignals.join(', ')}.`);
    suggestedAngle =
      "Share your own journey — Fed to Vanguard, the leap of faith. Ask: 'What's the cost of NOT making a change?'";
  }

  if (career.transitionLikely) {
    signals.push('User may be in or considering a career transition.');
    if (!suggestedAngle) {
      suggestedAngle =
        "Career is chapters, not a ladder. 'What chapter are you in? What's the next one about?'";
    }
  }

  if (career.stressSignals) {
    signals.push('Stress signals in career context. Listen more than advise. Validate first.');
  }

  const prompts: string[] = [];
  if (suggestedAngle) {
    prompts.push(suggestedAngle);
  }
  if (career.optimizingFor) {
    prompts.push(`They may be optimizing for: ${career.optimizingFor}. Ask what they're optimizing for.`);
  }

  return {
    signals,
    suggestedAngle,
    prompts,
  };
}
