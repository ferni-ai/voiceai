/**
 * The crisis classifier's easing rules, in one place: prompt rules that can move
 * a model read toward "none" (the everyday rules, crisis-everyday.ts, and the
 * heavy-feelings rules, crisis-heavy-feelings.ts), and the backstop both share.
 * When the caller's latest words hold any risk word, the turn is also read with
 * neither set of rules and the more severe read wins (moreSevereRead), so on
 * those turns the rules can only add.
 *
 * @module CrisisEasingRules
 */

import { hasRiskContent } from './crisis-agreement.js';
import { CRISIS_EVERYDAY_RULES, resolveCrisisEverydayRules } from './crisis-everyday.js';
import {
  CRISIS_HEAVY_FEELINGS_RULES,
  resolveCrisisHeavyFeelings,
} from './crisis-heavy-feelings.js';

/**
 * The prompt rules that can move a read toward "none": the everyday rules,
 * then the heavy-feelings rules, each only with its flag on. Empty when both
 * are off. Either brings the attribution rules (crisis-classifier.ts).
 */
export function easingRules(env: Record<string, string | undefined> = process.env): string {
  return [
    resolveCrisisEverydayRules(env) ? CRISIS_EVERYDAY_RULES : '',
    resolveCrisisHeavyFeelings(env) ? CRISIS_HEAVY_FEELINGS_RULES : '',
  ].join('');
}

/** Both easing flags off: the backstop's plain read. */
export const EASING_RULES_OFF = {
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off',
  CRISIS_CLASSIFIER_HEAVY_FEELINGS: 'off',
} as const;

/**
 * With the everyday or heavy-feelings rules on, whether this turn is also read
 * without them (the backstop).
 */
export function needsPlainRead(
  latest: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    (resolveCrisisEverydayRules(env) || resolveCrisisHeavyFeelings(env)) && hasRiskContent(latest)
  );
}
