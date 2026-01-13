/**
 * Voice Synthesis for Outreach
 *
 * Generates personalized voice messages using Cartesia TTS
 * for voicemails and voice-based outreach.
 *
 * Each persona has their own voice and speaking style.
 */
export interface VoiceSynthesisConfig {
    cartesiaApiKey: string;
    gcsProjectId: string;
    gcsBucketName: string;
}
export interface VoiceMessage {
    audioUrl: string;
    duration: number;
    transcript: string;
    personaId: string;
}
export interface PersonaVoiceProfile {
    voiceId: string;
    speed: number;
    emotion?: string;
    pitch?: number;
}
/**
 * Initialize voice synthesis with Cartesia and GCS credentials
 */
export declare function initializeVoiceSynthesis(synthesisConfig: VoiceSynthesisConfig): void;
/**
 * Check if voice synthesis is available
 */
export declare function isVoiceSynthesisAvailable(): boolean;
/**
 * Generate a voice message using Cartesia TTS
 */
export declare function generateVoiceMessage(params: {
    text: string;
    personaId: string;
    userId: string;
}): Promise<VoiceMessage | null>;
/**
 * Generate a voicemail message for a missed call
 */
export declare function generateVoicemail(params: {
    personaId: string;
    userId: string;
    userName?: string;
    context: string;
    originalMessage: string;
}): Promise<VoiceMessage | null>;
/**
 * Generate a call greeting audio
 */
export declare function generateCallGreeting(params: {
    personaId: string;
    userId: string;
    userName?: string;
    context: string;
}): Promise<VoiceMessage | null>;
/**
 * Delete old voice messages from GCS
 * Call this periodically to manage storage costs
 */
export declare function cleanupOldVoiceMessages(maxAgeDays?: number): Promise<number>;
export declare const voiceSynthesis: {
    initialize: typeof initializeVoiceSynthesis;
    isAvailable: typeof isVoiceSynthesisAvailable;
    generateMessage: typeof generateVoiceMessage;
    generateVoicemail: typeof generateVoicemail;
    generateGreeting: typeof generateCallGreeting;
    cleanup: typeof cleanupOldVoiceMessages;
};
export default voiceSynthesis;
//# sourceMappingURL=voice-synthesis.d.ts.map