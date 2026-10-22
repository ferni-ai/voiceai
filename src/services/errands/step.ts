/**
 * step(): the one entry point for errand rules. It runs the rules version the
 * errand was saved with, so a deploy never changes the rules under an errand
 * already in flight (errands design 2.1). An errand saved under a version this
 * build doesn't know fails closed: nothing is done and the log says why.
 *
 * @module services/errands/step
 */

import type { Errand, Signal } from './errand.js';
import type { StepContext, StepResult } from './draft.js';
import { stepV1 } from './step-v1.js';

export const CURRENT_STEP_VERSION = 1;

type Rules = (e: Errand, signal: Signal, ctx: StepContext) => StepResult;
const RULES: ReadonlyMap<number, Rules> = new Map([[1, stepV1]]);

export function step(e: Errand, signal: Signal, ctx: StepContext): StepResult {
  const rules = RULES.get(e.stepVersion);
  if (rules) return rules(e, signal, ctx);
  const at = ctx.now.toISOString();
  const note = `no rules for stepVersion ${e.stepVersion}: held, nothing done`;
  const heard = { type: 'signal', at, signal: signal.type } as const;
  return { next: e, effects: [], events: [heard, { type: 'decision', at, note }] };
}
