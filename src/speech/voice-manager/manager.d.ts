/**
 * Voice Manager
 *
 * Manages TTS voice switching between all personas in the team.
 */
import * as cartesia from '@livekit/agents-plugin-cartesia';
import type { VoiceAgentId, VoiceConfig } from './types.js';
/**
 * Normalize agent ID to canonical form for voice lookup.
 * Uses the voice registry for consistent ID resolution.
 * Always returns canonical IDs (e.g., 'jordan-taylor' not 'jordan').
 */
export declare function normalizeAgentId(agentId: string): VoiceAgentId;
export declare class VoiceManager {
    private currentVoice;
    private ttsInstances;
    private initialized;
    private voiceSwitchHandler;
    private voiceSwitchSubscribers;
    constructor();
    /**
     * Clean up event listeners and TTS instances
     * FIX BUG #45: Properly dispose TTS instances to prevent memory leaks
     * Note: Cartesia TTS instances are lightweight and don't require explicit close()
     * calls, but we clear the map to release references for GC.
     */
    cleanup(): void;
    /**
     * Initialize TTS instances for all personas (lazy-loaded on first use)
     */
    initialize(): void;
    /**
     * Get the current voice configuration
     */
    getCurrentVoice(): VoiceConfig;
    /**
     * Get the current TTS instance
     */
    getCurrentTTS(): cartesia.TTS;
    /**
     * Subscribe to voice switch events
     * FIX BUG #voice-6: Allow components to be notified of voice changes
     */
    onVoiceSwitch(callback: (from: VoiceAgentId, to: VoiceAgentId) => void): () => void;
    /**
     * Switch to a different voice
     * FIX BUG #voice-6: Now notifies subscribers of voice changes
     */
    switchVoice(agent: VoiceAgentId | string): void;
    /**
     * Get the voice ID for the current agent
     */
    getVoiceId(): string;
    /**
     * Check if we should use Peter's voice
     * FIX BUG #voice-7: Only check currentVoice (single source of truth)
     * The getCurrentAgent() call was redundant and could cause inconsistencies
     */
    isPeter(): boolean;
    /**
     * Check if we should use Nayan Patel's voice (sage/mentor role)
     */
    isNayan(): boolean;
    /**
     * Get the current agent ID
     */
    getCurrentAgentId(): VoiceAgentId;
    /**
     * Create a fresh TTS instance with the current voice
     * Useful for when you need a new TTS mid-session
     */
    createTTS(): cartesia.TTS;
}
/**
 * Get the global voice manager instance.
 * @deprecated Use getSessionVoiceManager(sessionId) for session-scoped management.
 * Will be removed in Q1 2025.
 */
export declare function getVoiceManager(): VoiceManager;
/**
 * Reset the global voice manager.
 * @deprecated Use resetSessionVoiceManager(sessionId) for session-scoped management.
 * Will be removed in Q1 2025.
 */
export declare function resetVoiceManager(): void;
/**
 * Get or create a session-scoped voice manager.
 * This prevents voice state leakage between sessions.
 *
 * @param sessionId - The unique session identifier
 * @returns VoiceManager instance for this session
 */
export declare function getSessionVoiceManager(sessionId: string): VoiceManager;
/**
 * Reset and remove the voice manager for a specific session.
 * Call this when a session ends to prevent memory leaks.
 *
 * @param sessionId - The session to clean up
 */
export declare function resetSessionVoiceManager(sessionId: string): void;
/**
 * Reset all session voice managers.
 * Use for shutdown or testing.
 */
export declare function resetAllSessionVoiceManagers(): void;
/**
 * Get count of active session voice managers (for monitoring)
 */
export declare function getSessionVoiceManagerCount(): number;
//# sourceMappingURL=manager.d.ts.map