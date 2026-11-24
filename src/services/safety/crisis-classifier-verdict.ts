/**
 * The semantic classifier's verdict (crisis-classifier.ts) folded into the guard's pattern
 * detection (detectCrisis in crisis-guard.ts).
 *
 * @module CrisisClassifierVerdict
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { forThemFirst } from './crisis-caller-check.js';
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
  verdict: ClassifierVerdictLike | null,
  env: Env = process.env
): CrisisDetectionResult {
  if (!verdict || verdict.risk === 'none') return crisis;
  const merged = mergeVerdict(crisis, verdict);
  return readsSomeoneElseInDanger(crisis, verdict, env) ? raiseForSomeoneDown(merged) : merged;
}

/** The merge as main has it: imminent only for the caller, worry for someone else. */
function mergeVerdict(
  crisis: CrisisDetectionResult,
  verdict: ClassifierVerdictLike
): CrisisDetectionResult {
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

/**
 * CRISIS_CLASSIFIER_OTHER_IMMINENT_911 (owner rule 2026-11-02): the classifier reads someone other
 * than the caller in immediate danger, and no pattern read an emergency for them already.
 */
function readsSomeoneElseInDanger(
  crisis: CrisisDetectionResult,
  verdict: ClassifierVerdictLike,
  env: Env
): boolean {
  return (
    verdict.risk === 'imminent' &&
    verdict.subject === 'third_party' &&
    !crisis.indicators.includes('third_party_emergency') &&
    flagOn('CRISIS_CLASSIFIER_OTHER_IMMINENT_911', env)
  );
}

/**
 * 911 for them first, then everything main's merge says, whole. The 911 for them is the line the
 * pattern path leads a reply with when someone is down beside the caller's own words
 * (forThemFirst). What follows is main's reply: the for-them 988 reply (with the caller's 988 line
 * where the patterns asked for a caller check) for a read about someone else. A classifier read
 * does not say whether the danger is a collapse or a suicide attempt, so the 988 for them stays
 * (never-lower grid, 'for them'). Where the patterns read the caller and the classifier someone
 * else, who is at risk is unsure: the for-them reply, then the caller's own script whole (#3789).
 */
function raiseForSomeoneDown(merged: CrisisDetectionResult): CrisisDetectionResult {
  const own = merged.subject === 'self';
  const severity = Math.max(merged.severity, SEVERITY.explicit);
  const tags = ['classifier_imminent', 'third_party_emergency', 'imminent_danger'];
  if (!own) tags.push('third_party_risk');
  const main =
    merged.suggestedResponse ??
    getCrisisResponse(severity, merged.subject ?? 'self', merged.language, own);
  const forThem = getCrisisResponse(severity, 'third_party', merged.language, false);
  const said = own ? `${forThem}\n\n${main}` : main;
  return {
    ...merged,
    isCrisis: true,
    severity,
    indicators: [...new Set([...merged.indicators, ...tags])],
    suggestedResponse: forThemFirst(said),
  };
}
