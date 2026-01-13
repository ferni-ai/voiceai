/**
 * Tool Failure Awareness Context Builder
 *
 * When tools fail (music playback, weather lookup, phone calls, etc.),
 * this builder surfaces the failure to the LLM so Ferni can acknowledge
 * it naturally instead of pretending nothing happened.
 *
 * Example failures and suggested acknowledgments:
 * - Music failed: "Having some trouble with Spotify - let me try again"
 * - Weather failed: "Hmm, couldn't get the weather right now"
 * - Call failed: "I wasn't able to reach them - want to try again?"
 *
 * Philosophy: Honesty builds trust. When something doesn't work,
 * acknowledge it warmly rather than ignoring it.
 *
 * @module intelligence/context-builders/awareness/tool-failure-awareness
 */
import type { ContextBuilder } from '../core/types.js';
export declare const toolFailureAwarenessBuilder: ContextBuilder;
export default toolFailureAwarenessBuilder;
//# sourceMappingURL=tool-failure-awareness.d.ts.map