/**
 * Unified Humanizing Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This CONSOLIDATES all humanization logic into a single builder:
 * - Active listening cues
 * - Emotional mirroring
 * - Response length guidance
 * - Energy awareness
 * - Spontaneous elements
 * - Natural uncertainty
 *
 * The key insight: In high-emotion moments, we REDUCE humanization features
 * and focus purely on presence. The user needs us, not our personality.
 *
 * This builder replaces:
 * - humanizing.ts
 * - deep-humanization.ts
 * - conversation-humanizing.ts
 * - natural-uncertainty.ts
 * - response-length.ts
 * - energy-mirroring.ts
 * - energy-awareness.ts
 *
 * Those files are kept for backwards compatibility but this is the preferred approach.
 *
 * @module intelligence/context-builders/unified-humanizing
 */
import type { ContextBuilder } from '../index.js';
export declare const unifiedHumanizingBuilder: ContextBuilder;
export default unifiedHumanizingBuilder;
//# sourceMappingURL=unified-humanizing.d.ts.map