/**
 * A variant's traffic share when an experiment is created.
 *
 * Prod ran smart-context-routing-v1, created as 100/0/0, as an equal three-way split (#4397):
 * `trafficPercent || 100 / count` reads an explicit 0 as unset, so the two 0% variants became
 * 33.3% each, the sum came to 166.67, and ab-testing.ts reset all three to an equal share. About
 * two thirds of calls got a routing nobody had rolled out.
 *
 * With EXPERIMENT_KEEP_ZERO_TRAFFIC on, an explicit 0 stays 0 and only a missing share (undefined)
 * gets an equal one. Off, a 0 is still read as unset, as before.
 *
 * @module tools/experiments/variant-traffic
 */
import { flagOn } from '../../config/env-flag.js';

export function variantTraffic(percent: number | undefined, variantCount: number): number {
  const equalShare = 100 / variantCount;
  return flagOn('EXPERIMENT_KEEP_ZERO_TRAFFIC') ? (percent ?? equalShare) : percent || equalShare;
}
