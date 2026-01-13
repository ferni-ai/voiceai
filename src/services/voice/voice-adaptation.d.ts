/**
 * Voice Adaptation Service
 *
 * Handles voice expression loading, SSML patterns, and real-time voice
 * adjustments based on context and emotion.
 */
import type { EmotionResult } from '../emotion-detection.js';
export interface VoiceExpression {
    name: string;
    ssml: string;
    duration?: number;
}
export interface VoiceContext {
    personaId: string;
    userEmotion?: EmotionResult;
    conversationTone?: 'casual' | 'serious' | 'celebratory' | 'supportive';
    currentMode?: string;
}
export interface VoiceModifiers {
    rate: number;
    pitch: number;
    pauseMultiplier: number;
    emphasis: 'none' | 'reduced' | 'moderate' | 'strong';
}
/**
 * Get base voice modifiers for a persona
 */
export declare function getPersonaVoiceProfile(personaId: string): VoiceModifiers;
/**
 * Adjust voice profile based on user emotion
 */
export declare function adjustForUserEmotion(base: VoiceModifiers, emotion: EmotionResult): VoiceModifiers;
/**
 * Apply SSML rate tag to content
 */
export declare function applyRate(content: string, rate: number): string;
/**
 * Apply pause multiplier to all breaks in content
 */
export declare function applyPauseMultiplier(content: string, multiplier: number): string;
/**
 * Add emphasis to specific words
 */
export declare function addEmphasis(content: string, words: string[], level: string): string;
/**
 * Insert thinking sound
 */
export declare function insertThinkingSound(personaId: string): string;
/**
 * Insert a natural filler
 */
export declare function insertFiller(personaId: string): string;
/**
 * Add micro-expressions based on content analysis
 */
export declare function addMicroExpressions(content: string, personaId: string, context: VoiceContext): Promise<string>;
/**
 * Process content with full voice adaptation
 */
export declare function processVoiceContent(content: string, context: VoiceContext): Promise<string>;
/**
 * Get a natural conversation break for long responses
 */
export declare function getConversationBreak(personaId: string): string;
export declare const VoiceAdaptationService: {
    getProfile: typeof getPersonaVoiceProfile;
    adjustForEmotion: typeof adjustForUserEmotion;
    applyRate: typeof applyRate;
    applyPauseMultiplier: typeof applyPauseMultiplier;
    addEmphasis: typeof addEmphasis;
    insertThinkingSound: typeof insertThinkingSound;
    insertFiller: typeof insertFiller;
    addMicroExpressions: typeof addMicroExpressions;
    process: typeof processVoiceContent;
    getConversationBreak: typeof getConversationBreak;
};
export default VoiceAdaptationService;
//# sourceMappingURL=voice-adaptation.d.ts.map