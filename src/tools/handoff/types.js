/**
 * Handoff Types
 * Type definitions for the handoff system
 */
/**
 * Create a handoff event data object for emitting voiceSwitch events.
 *
 * @example
 * const event = await createHandoffEvent('alex-chen', {
 *   greeting: 'Hey! Alex here.',
 *   previousAgentId: 'ferni'
 * });
 * handoffEvents.emit('voiceSwitch', event);
 */
export async function createHandoffEvent(targetId, options = {}) {
    // Dynamic import to avoid circular dependency through personas/index
    // 🐛 FIX: Use getPersonaAsync instead of sync getPersona to ensure bundle is loaded
    // This was the ROOT CAUSE of Maya handoff failures - the sync function returns undefined
    // if the persona bundle hasn't been loaded yet!
    const { getPersonaAsync } = await import('../../personas/index.js');
    const persona = await getPersonaAsync(targetId);
    if (!persona) {
        throw new Error(`Cannot create handoff event: persona "${targetId}" not found (bundle may not be loaded)`);
    }
    // 🐛 FIX: Extract voiceId from persona.voice.voiceId - CRITICAL for TTS voice switching!
    // Without this, the TTS continues using the previous persona's voice even after handoff.
    const voiceId = persona.voice?.voiceId;
    if (!voiceId) {
        throw new Error(`Cannot create handoff event: persona "${targetId}" has no voiceId configured`);
    }
    return {
        persona,
        agentId: persona.id,
        voiceId,
        greeting: options.greeting,
        playSound: options.playSound,
        previousAgentId: options.previousAgentId,
    };
}
//# sourceMappingURL=types.js.map