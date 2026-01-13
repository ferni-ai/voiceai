/**
 * Voice Prosody Response
 *
 * Generates response based on voice prosody analysis.
 *
 * @module intelligence/human-behaviors/voice-prosody
 */
export interface ProsodyResponse {
    shouldAdjust: boolean;
    guidance: string;
    emotionalMirror?: string;
}
export interface VoiceEmotionInput {
    primary: string;
    stressLevel: number;
    arousal: number;
    valence: number;
    dominance?: number;
}
/**
 * Generate response based on voice prosody analysis
 */
export declare function getVoiceProsodyResponse(voiceEmotion: VoiceEmotionInput | null): ProsodyResponse;
export default getVoiceProsodyResponse;
//# sourceMappingURL=voice-prosody.d.ts.map