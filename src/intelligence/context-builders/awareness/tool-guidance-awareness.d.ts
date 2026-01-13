/**
 * Dynamic Tool Guidance Context Builder
 *
 * Injects relevant tool usage hints based on conversation context.
 * Instead of having ALL tool instructions in the system prompt,
 * we inject only what's relevant to the current moment.
 *
 * This reduces prompt bloat and makes tool usage more likely
 * by surfacing the right tool at the right time.
 *
 * @module intelligence/context-builders/dynamic-tool-guidance
 */
import { type ContextBuilder } from '../index.js';
export declare const dynamicToolGuidanceBuilder: ContextBuilder;
export default dynamicToolGuidanceBuilder;
//# sourceMappingURL=tool-guidance-awareness.d.ts.map