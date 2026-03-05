/**
 * Proactive Coaching Re-export Shim (Backward Compatibility)
 *
 * Canonical implementation lives in domains/proactive/coaching/.
 * This shim preserves existing imports from tools/proactive-coaching.js.
 *
 * PREFERRED: Import from canonical path:
 *   import { createProactiveCoachingTools } from './domains/proactive/coaching/proactive-coaching.js';
 */

export {
  createProactiveCoachingTools,
  createProactiveCoachingTools as default,
} from './domains/proactive/coaching/proactive-coaching.js';
export type { ProactiveTriggerType, ProactiveTrigger } from './domains/proactive/coaching/proactive-coaching.js';
