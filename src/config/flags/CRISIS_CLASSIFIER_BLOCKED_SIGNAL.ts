import type { FlagSpec } from '../flag-spec.js';

// off | on (L8 recall audit, 2026-11-01): a crisis read the provider blocked (PROHIBITED_CONTENT, SAFETY) is its own reply, never '' (not configured); a turn the patterns read as nothing whose read was blocked gets a gentle safety check-in, or child-safety care (not their fault, a safe adult, Childhelp, 911 if in danger, the call's memory held) when the caller sounds under 18 or their words mention touching, sexual acts or abuse. Logs counts only. Only adds: never on a turn the patterns read, never replaces a verdict (services/safety/crisis-classifier-blocked.ts).
export const CRISIS_CLASSIFIER_BLOCKED_SIGNAL = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
