/**
 * Voice Manager
 *
 * Manages TTS voice switching between all personas in the team.
 */
import * as cartesia from '@livekit/agents-plugin-cartesia';
import { getCanonicalPersonaId } from '../../personas/voice-registry.js';
// Unified handoff module (Phase 3 migration)
import { handoffEvents } from '../../handoff/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { VOICES } from './config.js';
// ============================================================================
// VOICE ID NORMALIZATION
// ============================================================================
/**
 * Normalize agent ID to canonical form for voice lookup.
 * Uses the voice registry for consistent ID resolution.
 * Always returns canonical IDs (e.g., 'jordan-taylor' not 'jordan').
 */
export function normalizeAgentId(agentId) {
    // Use voice registry for canonical resolution
    const canonical = getCanonicalPersonaId(agentId);
    // All canonical IDs are valid voice agent IDs
    const canonicalIds = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
    ];
    if (canonicalIds.includes(canonical)) {
        return canonical;
    }
    // Check if it's already a valid voice agent ID (legacy/alias support)
    const normalized = agentId.toLowerCase();
    if (normalized in VOICES) {
        return normalized;
    }
    // Default to ferni (the coach)
    getLogger().warn({ agentId }, 'Unknown agent ID, defaulting to ferni');
    return 'ferni';
}
// ============================================================================
// VOICE MANAGER CLASS
// ============================================================================
export class VoiceManager {
    currentVoice = 'ferni';
    ttsInstances = new Map();
    initialized = false;
    voiceSwitchHandler = null;
    // FIX BUG #voice-6: Voice switch subscribers for notification
    voiceSwitchSubscribers = new Set();
    constructor() {
        // NOTE: VoiceManager no longer auto-switches on voiceSwitch events
        // The voice-agent.ts now controls timing: it sends frontend notification,
        // waits for transition sound, THEN calls switchVoice() directly.
        // This prevents the voice from changing before the frontend plays sounds.
        this.voiceSwitchHandler = null; // Explicitly null - no auto-switch
    }
    /**
     * Clean up event listeners and TTS instances
     * FIX BUG #45: Properly dispose TTS instances to prevent memory leaks
     * Note: Cartesia TTS instances are lightweight and don't require explicit close()
     * calls, but we clear the map to release references for GC.
     */
    cleanup() {
        if (this.voiceSwitchHandler) {
            handoffEvents.off('voiceSwitch', this.voiceSwitchHandler);
            this.voiceSwitchHandler = null;
        }
        // Clear all TTS instance references to allow garbage collection
        this.ttsInstances.clear();
        this.initialized = false;
        getLogger().debug('Voice manager cleaned up');
    }
    /**
     * Initialize TTS instances for all personas (lazy-loaded on first use)
     */
    initialize() {
        if (this.initialized)
            return;
        // Create TTS instances for all personas
        for (const [agentId, config] of Object.entries(VOICES)) {
            // Skip legacy aliases (they share voice IDs)
            if (agentId === 'peter')
                continue;
            this.ttsInstances.set(agentId, new cartesia.TTS({
                model: config.model,
                voice: config.id,
            }));
        }
        this.initialized = true;
        getLogger().info({ personas: Object.keys(VOICES).filter((k) => k !== 'peter') }, 'Voice manager initialized with all persona voices');
    }
    /**
     * Get the current voice configuration
     */
    getCurrentVoice() {
        return VOICES[this.currentVoice];
    }
    /**
     * Get the current TTS instance
     */
    getCurrentTTS() {
        if (!this.initialized) {
            this.initialize();
        }
        // Handle legacy aliases
        const normalizedVoice = normalizeAgentId(this.currentVoice);
        return this.ttsInstances.get(normalizedVoice) ?? this.ttsInstances.get('jack-b');
    }
    /**
     * Subscribe to voice switch events
     * FIX BUG #voice-6: Allow components to be notified of voice changes
     */
    onVoiceSwitch(callback) {
        this.voiceSwitchSubscribers.add(callback);
        return () => this.voiceSwitchSubscribers.delete(callback);
    }
    /**
     * Switch to a different voice
     * FIX BUG #voice-6: Now notifies subscribers of voice changes
     */
    switchVoice(agent) {
        const normalizedAgent = normalizeAgentId(agent);
        if (this.currentVoice === normalizedAgent) {
            getLogger().debug({ agent: normalizedAgent }, 'Already using this voice');
            return;
        }
        const oldVoice = this.currentVoice;
        this.currentVoice = normalizedAgent;
        // FIX BUG #voice-6: Notify subscribers
        for (const callback of this.voiceSwitchSubscribers) {
            try {
                callback(oldVoice, normalizedAgent);
            }
            catch (err) {
                getLogger().warn({ error: String(err) }, 'Voice switch subscriber threw error');
            }
        }
        getLogger().info({
            from: VOICES[oldVoice]?.name ?? oldVoice,
            to: VOICES[normalizedAgent].name,
            voiceId: VOICES[normalizedAgent].id,
        }, '🎤 Voice switched');
    }
    /**
     * Get the voice ID for the current agent
     */
    getVoiceId() {
        // FIX: Use ferni as fallback instead of legacy jack-b
        return VOICES[this.currentVoice]?.id ?? VOICES['ferni'].id;
    }
    /**
     * Check if we should use Peter's voice
     * FIX BUG #voice-7: Only check currentVoice (single source of truth)
     * The getCurrentAgent() call was redundant and could cause inconsistencies
     */
    isPeter() {
        return this.currentVoice === 'peter-john' || this.currentVoice === 'peter';
    }
    /**
     * Check if we should use Nayan Patel's voice (sage/mentor role)
     */
    isNayan() {
        return this.currentVoice === 'nayan-patel' || this.currentVoice === 'nayan';
    }
    /**
     * Get the current agent ID
     */
    getCurrentAgentId() {
        return this.currentVoice;
    }
    /**
     * Create a fresh TTS instance with the current voice
     * Useful for when you need a new TTS mid-session
     */
    createTTS() {
        const voice = this.getCurrentVoice();
        return new cartesia.TTS({
            model: voice.model,
            voice: voice.id,
        });
    }
}
// ============================================================================
// GLOBAL SINGLETON (Legacy - for backward compatibility)
// ============================================================================
let voiceManagerInstance = null;
/**
 * Get the global voice manager instance.
 * @deprecated Use getSessionVoiceManager(sessionId) for session-scoped management.
 * Will be removed in Q1 2025.
 */
export function getVoiceManager() {
    getLogger().warn({}, '[DEPRECATED] getVoiceManager() is deprecated. Use getSessionVoiceManager(sessionId) instead. Will be removed in Q1 2025.');
    if (!voiceManagerInstance) {
        voiceManagerInstance = new VoiceManager();
    }
    return voiceManagerInstance;
}
/**
 * Reset the global voice manager.
 * @deprecated Use resetSessionVoiceManager(sessionId) for session-scoped management.
 * Will be removed in Q1 2025.
 */
export function resetVoiceManager() {
    getLogger().warn({}, '[DEPRECATED] resetVoiceManager() is deprecated. Use resetSessionVoiceManager(sessionId) instead. Will be removed in Q1 2025.');
    if (voiceManagerInstance) {
        voiceManagerInstance.cleanup();
        voiceManagerInstance = null;
    }
}
// ============================================================================
// SESSION-SCOPED VOICE MANAGERS (Production-Ready)
// ============================================================================
const sessionVoiceManagers = new Map();
/**
 * Get or create a session-scoped voice manager.
 * This prevents voice state leakage between sessions.
 *
 * @param sessionId - The unique session identifier
 * @returns VoiceManager instance for this session
 */
export function getSessionVoiceManager(sessionId) {
    let manager = sessionVoiceManagers.get(sessionId);
    if (!manager) {
        manager = new VoiceManager();
        sessionVoiceManagers.set(sessionId, manager);
        getLogger().debug({ sessionId }, '🎤 Session voice manager created');
    }
    return manager;
}
/**
 * Reset and remove the voice manager for a specific session.
 * Call this when a session ends to prevent memory leaks.
 *
 * @param sessionId - The session to clean up
 */
export function resetSessionVoiceManager(sessionId) {
    const manager = sessionVoiceManagers.get(sessionId);
    if (manager) {
        manager.cleanup();
        sessionVoiceManagers.delete(sessionId);
        getLogger().debug({ sessionId }, '🎤 Session voice manager cleaned up');
    }
}
/**
 * Reset all session voice managers.
 * Use for shutdown or testing.
 */
export function resetAllSessionVoiceManagers() {
    for (const [sessionId, manager] of sessionVoiceManagers) {
        manager.cleanup();
    }
    sessionVoiceManagers.clear();
    getLogger().debug({ count: sessionVoiceManagers.size }, '🎤 All session voice managers cleared');
}
/**
 * Get count of active session voice managers (for monitoring)
 */
export function getSessionVoiceManagerCount() {
    return sessionVoiceManagers.size;
}
//# sourceMappingURL=manager.js.map