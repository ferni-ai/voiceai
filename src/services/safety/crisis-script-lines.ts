/**
 * CRISIS_SELF_HARM_911_LINE (owner, 2026-11-11): one conditional line after 988 in the caller's
 * severe script that is not imminent, for suicide and self-harm alike; 988 stays first and whole
 * (crisis-guard-replies.ts). The line lives here, in the kernel, so the safety wording list
 * (phrase-loops-safety.generated.ts) imports it instead of copying a resource literal.
 *
 * @module CrisisSelfHarm911Line
 */

import { flagOn, type Env } from '../../config/env-flag.js';

/** Conditional by design, never a bare "call 911" (owner, 2026-11-11). */
export const SELF_HARM_911_LINE = "If you've already hurt yourself or you're about to, call 911.";

/** Whether the severe script carries the line: the request's env, else process.env. */
export const selfHarm911LineOn = (env: Env = process.env): boolean =>
  flagOn('CRISIS_SELF_HARM_911_LINE', env);
