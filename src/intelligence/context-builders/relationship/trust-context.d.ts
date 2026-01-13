/**
 * Trust Context Builder
 *
 * Integrates the "better than human" trust systems into the
 * voice agent's context pipeline.
 *
 * This context builder surfaces:
 * - Unsaid signals (what they're not saying)
 * - Boundary warnings (topics to avoid)
 * - Growth reflections (noticing their evolution)
 * - Callback opportunities (inside jokes, shared history)
 * - Celebration opportunities (small wins)
 * - Proactive outreach suggestions
 * - Response tuning guidance (Phase 15)
 * - Relationship health context (Phase 12)
 * - Seasonal awareness (Phase 26)
 * - Learning style adaptation (Phase 27)
 * - Life events context (Phase 14)
 * - Voice prosody insights (Phase 24)
 * - Celebration momentum (Phase 16)
 *
 * @module TrustContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build trust-aware context for the current turn
 */
declare function buildTrustAwareContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildTrustAwareContext };
declare const _default: {
    buildTrustAwareContext: typeof buildTrustAwareContext;
};
export default _default;
//# sourceMappingURL=trust-context.d.ts.map