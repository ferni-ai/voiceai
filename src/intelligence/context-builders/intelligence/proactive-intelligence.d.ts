/**
 * Proactive Noticing Context Builder
 *
 * "Better Than Human" - Actually SPEAKS the patterns we detect.
 *
 * Most AI systems detect patterns but never surface them.
 * This builder actively injects "I notice..." observations
 * that create "they really see me" moments.
 *
 * What we surface:
 * - Repeated mentions of topics/emotions (3+ times)
 * - Voice/text contradictions ("I'm fine" + sad voice)
 * - Deflection patterns (avoiding certain topics)
 * - Growth moments (changed behavior over time)
 * - Energy/mood patterns across conversations
 *
 * @module ProactiveNoticingContext
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildProactiveNoticingContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildProactiveNoticingContext };
//# sourceMappingURL=proactive-intelligence.d.ts.map