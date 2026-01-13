/**
 * Voice Agent Integration - Advanced Humanization Access
 *
 * @module @ferni/humanization/voice-agent-integration/advanced-humanization
 */
import type { TurnGuidance, ResponseModification } from './types.js';
/**
 * Get advanced humanization guidance from last processed turn
 */
export declare function getAdvancedGuidance(sessionId: string): TurnGuidance | null;
/**
 * Get response modifications from advanced humanization
 */
export declare function getAdvancedModifications(sessionId: string): ResponseModification | null;
/**
 * Record that agent gave advice (for resistance tracking)
 */
export declare function recordAdvice(sessionId: string): void;
/**
 * Record agent response (for repair detection on next turn)
 */
export declare function recordResponse(sessionId: string, response: string): void;
/**
 * Check if we should stop giving direct advice
 */
export declare function shouldStopAdvice(sessionId: string): boolean;
/**
 * Get system prompt additions from advanced humanization
 */
export declare function getAdvancedSystemPromptAdditions(sessionId: string): string[];
//# sourceMappingURL=advanced-humanization.d.ts.map