/**
 * Dynamic TTS
 *
 * TTS implementation that switches voices based on the current agent.
 */
import { tts } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
// NOTE: This uses the global getCurrentAgent (no sessionId) because DynamicTTS
// is deprecated and doesn't have session context. Use PersonaAwareTTS instead.
import { getCurrentAgent } from '../../tools/handoff/state.js';
import { getLogger } from '../../utils/safe-logger.js';
import { VOICES } from './config.js';
import { normalizeAgentId } from './manager.js';
// ============================================================================
// DYNAMIC TTS - Switches voices based on current agent
// ============================================================================
/**
 * DynamicTTS wraps Cartesia TTS and switches voices dynamically
 * based on the current agent from the full team.
 *
 * This implements the TTS interface so it can be used directly
 * with LiveKit's AgentSession.
 *
 * Supports: Ferni, Jack Bogle, Peter John, Alex, Maya, Jordan
 */
export class DynamicTTS extends tts.TTS {
    label = 'dynamic-cartesia-tts';
    ttsInstances = new Map();
    constructor() {
        // Call parent with sample rate and channels
        // IMPORTANT: Cartesia outputs at 24000 Hz - must match!
        super(24000, 1, { streaming: true });
        // FIX BUG #voice-4 & #voice-5: Use ferni instead of legacy jack-b
        const personaIds = [
            'ferni',
            'peter-john',
            'comm-specialist',
            'spend-save',
            'event-planner',
            'nayan-patel',
        ];
        for (const personaId of personaIds) {
            const config = VOICES[personaId];
            this.ttsInstances.set(personaId, new cartesia.TTS({
                model: config.model,
                voice: config.id,
            }));
        }
        getLogger().info({ personas: personaIds }, 'DynamicTTS initialized with all persona voices');
    }
    /**
     * Get the TTS instance for the current agent
     */
    getCurrentTTS() {
        const currentAgent = getCurrentAgent();
        const normalizedAgent = normalizeAgentId(currentAgent);
        // FIX BUG #voice-4 & #voice-8: Fallback to ferni with error handling
        const currentTTS = this.ttsInstances.get(normalizedAgent) ?? this.ttsInstances.get('ferni');
        if (!currentTTS) {
            getLogger().error({ agent: currentAgent, normalizedAgent }, 'No TTS instance found - this should not happen');
            throw new Error(`No TTS instance available for agent: ${currentAgent}`);
        }
        getLogger().debug({
            agent: currentAgent,
            normalizedAgent,
            voice: VOICES[normalizedAgent]?.name ?? 'Unknown',
        }, 'Using TTS voice');
        return currentTTS;
    }
    /**
     * Synthesize text to speech using the current agent's voice
     */
    synthesize(text) {
        const currentAgent = getCurrentAgent();
        const normalizedAgent = normalizeAgentId(currentAgent);
        getLogger().debug({ agent: VOICES[normalizedAgent]?.name ?? currentAgent }, 'TTS speaking');
        return this.getCurrentTTS().synthesize(text);
    }
    /**
     * Stream synthesis for the current agent's voice
     */
    stream() {
        const currentAgent = getCurrentAgent();
        getLogger().debug({ agent: currentAgent }, 'Starting TTS stream');
        return this.getCurrentTTS().stream();
    }
}
/**
 * Create a DynamicTTS instance for use with AgentSession
 *
 * @deprecated This is legacy TTS that uses global state and switches between all personas.
 * For per-session persona binding, use createPersonaAwareTTS() instead,
 * which is session-scoped and properly isolated.
 */
export function createDynamicTTS() {
    return new DynamicTTS();
}
//# sourceMappingURL=dynamic-tts.js.map