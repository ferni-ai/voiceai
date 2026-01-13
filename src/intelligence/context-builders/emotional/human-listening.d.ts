/**
 * Human Listening Context Builder
 *
 * Injects insights from the HumanListeningPipeline into LLM context.
 * This gives the agent "better than human" awareness of:
 * - Voice tremor/strain (held-back tears, nervousness)
 * - Breath patterns (sighs, held breath)
 * - Volume dynamics (getting quieter on sensitive topics)
 * - Cognitive load (overwhelm, processing)
 * - Hedging patterns (uncertainty, protecting)
 * - Self-soothing behaviors (dismissing, minimizing)
 *
 * @module HumanListeningContextBuilder
 */
import { type ContextBuilder } from '../index.js';
import { type HumanListeningResult } from '../../../speech/human-listening-pipeline.js';
/**
 * Store analysis result for context builder access.
 * Called from voice-agent after analyzing user message.
 */
export declare function setHumanListeningResult(sessionId: string, result: HumanListeningResult): void;
/**
 * Get the latest analysis result for a session.
 */
export declare function getHumanListeningResult(sessionId: string): HumanListeningResult | null;
/**
 * Clear stored result for a session.
 */
export declare function clearHumanListeningResult(sessionId: string): void;
declare const humanListeningBuilder: ContextBuilder;
export { humanListeningBuilder };
export default humanListeningBuilder;
//# sourceMappingURL=human-listening.d.ts.map