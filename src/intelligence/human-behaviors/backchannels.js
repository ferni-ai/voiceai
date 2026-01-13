/**
 * Real-Time Backchannel System
 *
 * Determines when to inject backchannels ("Mmhmm", "Right", etc.)
 * during extended pauses in user speech.
 *
 * @module intelligence/human-behaviors/backchannels
 */
// ============================================================================
// CONFIGURATION
// ============================================================================
const defaultConfig = {
    enabled: true,
    minUserSpeechDuration: 3000, // 3 seconds
    silenceThreshold: 1500, // 1.5 seconds
    maxBackchannelsPerTurn: 2,
};
// ============================================================================
// BACKCHANNEL LOGIC
// ============================================================================
/**
 * Determine if a backchannel should be injected
 */
export function shouldInjectBackchannel(state, silenceDurationMs, config = defaultConfig) {
    if (!config.enabled)
        return null;
    // Check limit
    if (state.backchannelsThisTurn >= config.maxBackchannelsPerTurn)
        return null;
    // Check speech duration
    if (!state.userSpeechStartTime)
        return null;
    const speechDuration = Date.now() - state.userSpeechStartTime;
    if (speechDuration < config.minUserSpeechDuration)
        return null;
    // Check silence threshold
    if (silenceDurationMs < config.silenceThreshold)
        return null;
    // Don't backchannel too frequently
    if (Date.now() - state.lastBackchannelTime < 4000)
        return null;
    // Pick a backchannel sound
    const sounds = ['Mmhmm.', 'Mm.', 'Right.', 'Yeah.', 'I see.', 'Go on.', 'Uh huh.'];
    return {
        inject: true,
        sound: sounds[Math.floor(Math.random() * sounds.length)],
    };
}
export default shouldInjectBackchannel;
//# sourceMappingURL=backchannels.js.map