/**
 * Cameo Trigger Detection
 *
 * Detects opportunities for team member cameos based on:
 * - Keywords and topics in user messages
 * - Conversation context and patterns
 * - Emotional state and needs
 * - Session history (avoid repetition)
 *
 * The goal is to make cameos feel natural and valuable,
 * not forced or annoying.
 */
import type { CameoDetectionContext, CameoOpportunity, CameoPersonaId, CameoSessionState } from './types.js';
/**
 * Keywords that strongly suggest a specific persona should cameo
 * ENHANCED: More comprehensive trigger patterns for natural cameo opportunities
 */
declare const STRONG_TRIGGER_PATTERNS: Record<CameoPersonaId, RegExp[]>;
/**
 * Phrases that indicate a good cameo opportunity (any persona)
 * ENHANCED: More natural conversation patterns
 */
declare const CAMEO_OPPORTUNITY_PHRASES: RegExp[];
/**
 * Emotional states that might trigger supportive cameos
 * ENHANCED: More nuanced emotional detection
 */
declare const EMOTIONAL_TRIGGERS: Record<string, CameoPersonaId[]>;
/**
 * Detect if there's a cameo opportunity in the current context
 */
export declare function detectCameoOpportunity(context: CameoDetectionContext, sessionState: CameoSessionState): CameoOpportunity;
/**
 * Generate a prompt for LLM-assisted cameo detection
 * This can be used when simple keyword matching isn't enough
 */
export declare function generateCameoDetectionPrompt(context: CameoDetectionContext): string;
/**
 * Parse LLM response for cameo detection
 */
export declare function parseCameoDetectionResponse(response: string): CameoOpportunity;
export { CAMEO_OPPORTUNITY_PHRASES, EMOTIONAL_TRIGGERS, STRONG_TRIGGER_PATTERNS };
declare const _default: {
    detectCameoOpportunity: typeof detectCameoOpportunity;
    generateCameoDetectionPrompt: typeof generateCameoDetectionPrompt;
    parseCameoDetectionResponse: typeof parseCameoDetectionResponse;
};
export default _default;
//# sourceMappingURL=cameo-triggers.d.ts.map