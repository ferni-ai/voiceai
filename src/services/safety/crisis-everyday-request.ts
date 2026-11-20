/**
 * Whether a classifier-only crisis read of this turn gets the soft check-in because the caller
 * only asked for everyday business: a teammate (CRISIS_TRANSFER_EVERYDAY,
 * crisis-transfer-request.ts) or forgetting a named thing (CRISIS_FORGET_EVERYDAY,
 * crisis-forget-request.ts). Both flags are off by default; each rule keeps its own guards.
 * The crisis gate and the turn pipeline both ask here, before the turn's own read starts.
 *
 * @module CrisisEverydayRequest
 */

import type { Env } from '../../config/env-flag.js';
import type { CrisisClassifierInput, PatternOutcome } from './crisis-classifier.js';
import { forgetRequestIsEveryday } from './crisis-forget-request.js';
import { transferRequestIsEveryday } from './crisis-transfer-request.js';

export function requestIsEveryday(
  input: CrisisClassifierInput,
  pattern: PatternOutcome,
  call: string | undefined,
  env: Env = process.env
): boolean {
  return (
    transferRequestIsEveryday(input, pattern, call, env) ||
    forgetRequestIsEveryday(input, pattern, call, env)
  );
}
