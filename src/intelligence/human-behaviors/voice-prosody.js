/**
 * Voice Prosody Response
 *
 * Generates response based on voice prosody analysis.
 *
 * @module intelligence/human-behaviors/voice-prosody
 */
// ============================================================================
// PROSODY RESPONSE
// ============================================================================
/**
 * Generate response based on voice prosody analysis
 */
export function getVoiceProsodyResponse(voiceEmotion) {
    if (!voiceEmotion) {
        return { shouldAdjust: false, guidance: '' };
    }
    const { stressLevel, arousal, valence } = voiceEmotion;
    const guidance = [];
    // High stress - slow down and soften
    if (stressLevel > 0.7) {
        guidance.push('User sounds stressed. SLOW DOWN. Softer voice. More pauses.');
        return {
            shouldAdjust: true,
            guidance: guidance.join(' '),
            emotionalMirror: 'I can hear this is weighing on you...',
        };
    }
    // High arousal + positive valence = excited
    if (arousal > 0.7 && valence > 0.3) {
        guidance.push('User sounds excited! Match their energy. Be enthusiastic.');
        return {
            shouldAdjust: true,
            guidance: guidance.join(' '),
            emotionalMirror: 'I can hear the excitement in your voice!',
        };
    }
    // Low arousal + negative valence = sad/tired
    if (arousal < 0.3 && valence < -0.2) {
        guidance.push("User sounds down. Be gentle. Don't be too upbeat.");
        return {
            shouldAdjust: true,
            guidance: guidance.join(' '),
            emotionalMirror: 'I hear you... <break time="300ms"/>',
        };
    }
    // High arousal = animated
    if (arousal > 0.7) {
        guidance.push('User is animated. Keep pace. Be engaged.');
        return { shouldAdjust: true, guidance: guidance.join(' ') };
    }
    // Low arousal = calm
    if (arousal < 0.3) {
        guidance.push('User is speaking calmly. Match the measured pace.');
        return { shouldAdjust: true, guidance: guidance.join(' ') };
    }
    return { shouldAdjust: false, guidance: '' };
}
export default getVoiceProsodyResponse;
//# sourceMappingURL=voice-prosody.js.map