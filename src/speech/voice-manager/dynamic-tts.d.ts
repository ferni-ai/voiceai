/**
 * Dynamic TTS
 *
 * TTS implementation that switches voices based on the current agent.
 */
import { tts } from '@livekit/agents';
/**
 * DynamicTTS wraps Cartesia TTS and switches voices dynamically
 * based on the current agent from the full team.
 *
 * This implements the TTS interface so it can be used directly
 * with LiveKit's AgentSession.
 *
 * Supports: Ferni, Jack Bogle, Peter John, Alex, Maya, Jordan
 */
export declare class DynamicTTS extends tts.TTS {
    readonly label = "dynamic-cartesia-tts";
    private ttsInstances;
    constructor();
    /**
     * Get the TTS instance for the current agent
     */
    private getCurrentTTS;
    /**
     * Synthesize text to speech using the current agent's voice
     */
    synthesize(text: string): tts.ChunkedStream;
    /**
     * Stream synthesis for the current agent's voice
     */
    stream(): tts.SynthesizeStream;
}
/**
 * Create a DynamicTTS instance for use with AgentSession
 *
 * @deprecated This is legacy TTS that uses global state and switches between all personas.
 * For per-session persona binding, use createPersonaAwareTTS() instead,
 * which is session-scoped and properly isolated.
 */
export declare function createDynamicTTS(): DynamicTTS;
//# sourceMappingURL=dynamic-tts.d.ts.map