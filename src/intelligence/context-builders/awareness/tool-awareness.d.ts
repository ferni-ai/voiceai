/**
 * Tool Capabilities Context Builder
 *
 * CRITICAL: This builder injects a prominent "YOUR ACTIVE CAPABILITIES" section
 * at HIGH priority so LLMs (especially Gemini) know what tools they can use.
 *
 * Why this matters:
 * - LLMs often "forget" they have tools if not reminded prominently
 * - Gemini specifically benefits from explicit capability declarations early in context
 * - Dynamic tool hints only trigger on detection; this provides always-on awareness
 *
 * This runs on EVERY turn with high priority to ensure the LLM always knows
 * it can play music, search the web, check weather, etc.
 *
 * @module intelligence/context-builders/tool-capabilities
 */
import { type ContextBuilder } from '../index.js';
export declare const toolCapabilitiesBuilder: ContextBuilder;
export default toolCapabilitiesBuilder;
//# sourceMappingURL=tool-awareness.d.ts.map