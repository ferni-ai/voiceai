/**
 * Discovery Context Builder
 *
 * Handles new user discovery:
 * - Ask for name naturally
 * - Learn about life stage
 * - Discover financial goals
 *
 * For new users, gently gather key info to personalize advice.
 *
 * Extracted from jack-bogle.ts lines 689-707
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build discovery-related context injections
 */
declare function buildDiscoveryContext(input: ContextBuilderInput): ContextInjection[];
export { buildDiscoveryContext };
//# sourceMappingURL=discovery-context.d.ts.map