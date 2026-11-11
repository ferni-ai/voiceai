/**
 * The semantic classifier's verdict (crisis-classifier.ts) folded into the guard's pattern
 * detection (detectCrisis in crisis-guard.ts).
 *
 * @module CrisisClassifierVerdict
 */

import type { CrisisDetectionResult, CrisisSubject } from './crisis-guard.js';
import { getCrisisResponse } from './crisis-guard-replies.js';
import { SEVERITY } from './crisis-severity.js';

/** The classifier's verdict, as crisis-classifier.ts returns it. */
export interface ClassifierVerdictLike {
  risk: 'imminent' | 'crisis' | 'none';
  subject: 'self' | 'third_party';
}

/**
 * Merge the semantic classifier's verdict into a pattern detection. It only
 * escalates: the patterns are precise, the classifier catches what they miss.
 * A missing verdict (timeout, error) leaves the detection unchanged.
 */
export function applyClassifierVerdict(
  crisis: CrisisDetectionResult,
  verdict: ClassifierVerdictLike | null
): CrisisDetectionResult {
  if (!verdict || verdict.risk === 'none') return crisis;

  const thirdParty = verdict.subject === 'third_party' && crisis.subject !== 'self';
  const subject: CrisisSubject = thirdParty ? 'third_party' : 'self';
  const imminent = verdict.risk === 'imminent' && !thirdParty;
  const target = imminent ? SEVERITY.explicit : SEVERITY.passive;
  if (crisis.severity >= target && crisis.subject === subject) return crisis;

  const severity = Math.max(crisis.severity, target);
  const indicators = [...crisis.indicators, `classifier_${verdict.risk}`];
  if (imminent && !indicators.includes('imminent_danger')) indicators.push('imminent_danger');
  if (thirdParty && !indicators.includes('third_party_risk')) indicators.push('third_party_risk');
  const alreadyImminent = crisis.indicators.includes('imminent_danger');
  return {
    ...crisis,
    isCrisis: true,
    severity,
    indicators,
    subject,
    language: crisis.language ?? 'en',
    suggestedResponse: getCrisisResponse(
      severity,
      subject,
      crisis.language,
      imminent || alreadyImminent
    ),
  };
}
