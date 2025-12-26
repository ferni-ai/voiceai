/**
 * @deprecated MOVED TO: ./domains/proactive/coaching/proactive-coaching.ts
 *
 * This file has been moved to the proactive domain. Update your imports:
 * ```
 * // OLD (deprecated)
 * import { createProactiveCoachingTools } from '../proactive-coaching.js';
 *
 * // NEW
 * import { createProactiveCoachingTools } from '../domains/proactive/coaching/index.js';
 * ```
 *
 * This file re-exports from the new location for backward compatibility.
 */

// Re-export everything from the new location for backward compatibility
export * from './domains/proactive/coaching/index.js';

// Re-export default for backward compatibility
export { default } from './domains/proactive/coaching/index.js';

