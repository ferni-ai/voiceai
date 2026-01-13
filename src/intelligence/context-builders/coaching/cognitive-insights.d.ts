/**
 * Cognitive Insights Context Builder
 *
 * Surfaces cognitive insights that can be shared with users.
 * These are moments where the AI can transparently show
 * how it's adapting to the user.
 *
 * Examples:
 * - "I noticed you think analytically, so I'll show you the data"
 * - "Peter mentioned you prefer stories - let me share one"
 * - "I'm adjusting my pace because you seem stressed"
 *
 * This creates transparency and builds trust.
 *
 * Uses centralized SessionStateManager for session tracking.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build cognitive insights context
 *
 * Uses centralized session state for tracking shared insights.
 */
declare function buildCognitiveInsightsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Clear cognitive insights session state
 * Now handled by centralized session state in session-state.ts
 */
export declare function clearCognitiveInsightsSession(_sessionKey: string): void;
export { buildCognitiveInsightsContext };
export default buildCognitiveInsightsContext;
//# sourceMappingURL=cognitive-insights.d.ts.map