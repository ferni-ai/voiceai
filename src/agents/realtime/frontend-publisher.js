/**
 * Frontend Publisher
 *
 * Centralized real-time communication with the frontend via LiveKit data channels.
 * Extracted from voice-agent.ts to consolidate all publishData calls.
 *
 * Benefits:
 * - Single point of control for all frontend messages
 * - Consistent error handling and retry logic
 * - Type-safe message definitions
 * - Easy to mock for testing
 * - Centralized logging
 */
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
// ============================================================================
// FRONTEND PUBLISHER CLASS
// ============================================================================
/**
 * FrontendPublisher - Centralized frontend communication
 *
 * Usage:
 * ```ts
 * const publisher = new FrontendPublisher(room);
 *
 * // Send typed messages
 * await publisher.sendEmotion('happy', 0.8, 0.7);
 * await publisher.sendHandoffStarted('alex-chen', 'ferni', 'coach-to-team');
 * await publisher.sendCelebration('milestone', 'fireworks');
 * ```
 */
export class FrontendPublisher {
    room = null;
    logger = getLogger();
    config;
    constructor(room, config = {}) {
        this.room = room || null;
        this.config = {
            maxRetries: config.maxRetries ?? 3,
            retryDelayMs: config.retryDelayMs ?? 100,
            verbose: config.verbose ?? false,
        };
    }
    /**
     * Set or update the room reference
     */
    setRoom(room) {
        this.room = room;
    }
    /**
     * Check if connected and ready to send
     */
    isConnected() {
        return !!this.room?.localParticipant;
    }
    // ============================================================================
    // CORE SEND METHOD
    // ============================================================================
    /**
     * Send a message to the frontend with retry logic
     */
    async send(message) {
        if (!this.room?.localParticipant) {
            // Always log for music_state messages since we're debugging
            if (message.type === 'music_state') {
                diag.warn('🎧 [PUBLISHER.send] Cannot send music_state: no room connection', {
                    hasRoom: !!this.room,
                    hasLocalParticipant: !!this.room?.localParticipant,
                });
            }
            else if (this.config.verbose) {
                this.logger.debug({ type: message.type }, 'Cannot send: no room connection');
            }
            return false;
        }
        const fullMessage = {
            ...message,
            timestamp: Date.now(),
        };
        const data = new TextEncoder().encode(JSON.stringify(fullMessage));
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                await this.room.localParticipant.publishData(data, { reliable: true });
                // Always log success for music_state messages
                if (message.type === 'music_state') {
                    const musicMsg = fullMessage;
                    diag.state('🎧 [PUBLISHER.send] music_state published to LiveKit data channel', {
                        trackName: musicMsg.track?.name,
                        state: musicMsg.state,
                    });
                }
                else if (this.config.verbose) {
                    this.logger.debug({ type: message.type }, 'Message sent to frontend');
                }
                return true;
            }
            catch (error) {
                const errorStr = String(error);
                // Don't retry if connection is already closed - bail out immediately
                if (errorStr.includes('closed') || errorStr.includes('disconnect')) {
                    if (message.type === 'music_state') {
                        diag.debug('🎧 [PUBLISHER.send] music_state skipped - connection closed');
                    }
                    else if (this.config.verbose) {
                        this.logger.debug({ type: message.type }, 'Send skipped - connection closed');
                    }
                    return false;
                }
                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelayMs * (attempt + 1);
                    this.logger.warn({ type: message.type, attempt: attempt + 1, error: errorStr }, `Send failed, retrying in ${delay}ms...`);
                    await new Promise((resolve) => {
                        setTimeout(resolve, delay);
                    });
                }
                else {
                    this.logger.error({ type: message.type, attempts: attempt + 1, error: errorStr }, 'Failed to send after retries');
                    return false;
                }
            }
        }
        return false;
    }
    // ============================================================================
    // HANDOFF MESSAGES
    // ============================================================================
    /**
     * Send handoff_started event
     */
    async sendHandoffStarted(newAgent, previousAgent, direction, playSound) {
        diag.entry(`Handoff started: ${previousAgent} → ${newAgent}`);
        return this.send({
            type: 'handoff_started',
            newAgent,
            previousAgent,
            direction,
            playSound,
        });
    }
    /**
     * Send handoff_complete event
     */
    async sendHandoffComplete(newAgent, previousAgent, greeting) {
        diag.entry(`Handoff complete: ${newAgent} ready to speak`);
        return this.send({
            type: 'handoff_complete',
            newAgent,
            previousAgent,
            greeting,
        });
    }
    /**
     * Send handoff_failed event
     */
    async sendHandoffFailed(newAgent, error, previousAgent) {
        diag.error(`Handoff failed: ${error}`);
        return this.send({
            type: 'handoff_failed',
            newAgent,
            previousAgent,
            error,
        });
    }
    /**
     * Send handoff_acknowledged event
     */
    async sendHandoffAcknowledged(target, success, error) {
        return this.send({
            type: 'handoff_acknowledged',
            target,
            success,
            error,
        });
    }
    // ============================================================================
    // EMOTION & MOOD MESSAGES
    // ============================================================================
    /**
     * Send emotion update to frontend
     */
    async sendEmotion(emotion, confidence, intensity) {
        // Only send if confidence is meaningful
        if (confidence < 0.5) {
            return false;
        }
        return this.send({
            type: 'emotion',
            emotion,
            confidence,
            intensity,
        });
    }
    /**
     * Send mood update to frontend
     */
    async sendMood(state, energyLevel, relationshipStage, hasTransition) {
        return this.send({
            type: 'mood',
            state,
            energyLevel,
            relationshipStage,
            hasTransition,
        });
    }
    // ============================================================================
    // CELEBRATION MESSAGES
    // ============================================================================
    /**
     * Send celebration event for visual feedback
     */
    async sendCelebration(celebrationType, effect, message) {
        diag.entry(`Celebration: ${celebrationType} (${effect})`);
        return this.send({
            type: 'celebration',
            celebrationType,
            effect,
            message,
        });
    }
    /**
     * Send multiple celebration events from context injections
     */
    async sendCelebrationEvents(injections) {
        const celebrationConfigs = {
            milestone: {
                celebrationType: 'milestone',
                effect: 'fireworks',
                message: '🎆 Milestone achieved!',
            },
            achievement: {
                celebrationType: 'achievement',
                effect: 'fireworks',
                message: '🎆 Great achievement!',
            },
            aha_moment: { celebrationType: 'aha_moment', effect: 'sparkles' },
            good_news: { celebrationType: 'good_news', effect: 'sparkles' },
        };
        for (const injection of injections) {
            const config = celebrationConfigs[injection.category];
            if (config) {
                await this.sendCelebration(config.celebrationType, config.effect, config.message);
            }
        }
    }
    // ============================================================================
    // MUSIC STATE MESSAGES
    // ============================================================================
    /**
     * Send music state update to frontend
     *
     * States:
     * - 'playing' = Music actively playing
     * - 'ducking' = Agent speaking over music (DJ fade-down)
     * - 'fading' = Track ending soon (~5 seconds left)
     * - 'changing' = DJ crossfade - switching to a new track
     * - 'paused' = Playback paused
     * - 'stopped' = Playback stopped
     * - 'idle' = No music loaded
     */
    async sendMusicState(state, track, isAmbient = false, ourSongInfo) {
        diag.state('🎧 [PUBLISHER] sendMusicState called', {
            state,
            track: track?.name,
            duration: track?.duration,
            albumArt: track?.albumArt ? 'present' : 'none',
            isAmbient,
            isOurSong: ourSongInfo?.isOurSong,
            hasLocalParticipant: !!this.room?.localParticipant,
        });
        const result = await this.send({
            type: 'music_state',
            state,
            track,
            isAmbient,
            isOurSong: ourSongInfo?.isOurSong,
            ourSongContext: ourSongInfo?.context,
        });
        diag.state('🎧 [PUBLISHER] sendMusicState result', {
            success: result,
            state,
            trackName: track?.name,
        });
        return result;
    }
    // ============================================================================
    // ENGAGEMENT MESSAGES
    // ============================================================================
    /**
     * Send engagement data to frontend
     */
    async sendEngagementData(data) {
        return this.send({
            type: 'engagement_data',
            ...data,
        });
    }
    // ============================================================================
    // APP SETTINGS MESSAGES
    // ============================================================================
    /**
     * Send a language change request to the frontend
     *
     * The frontend will change the locale WITHOUT reloading the page,
     * keeping the LiveKit connection alive. This enables voice-triggered
     * language changes without disconnecting the call.
     *
     * @param language - The locale code (e.g., 'es', 'fr', 'ja')
     */
    async sendSetLanguage(language) {
        this.logger.info({ language }, '🌐 Sending language change to frontend');
        return this.send({
            type: 'set_language',
            language,
        });
    }
    // ============================================================================
    // GAME STATE MESSAGES
    // ============================================================================
    /**
     * Send game started notification to frontend
     *
     * Triggers the game board UI to appear with the appropriate game type.
     */
    async sendGameStarted(gameId, gameType, gameName) {
        this.logger.info({ gameId, gameType, gameName }, '🎮 Game started');
        return this.send({
            type: 'game_started',
            gameId,
            gameType,
            gameName,
        });
    }
    /**
     * Send game state update to frontend
     *
     * Updates the visual game board with current state (moves, scores, turns).
     */
    async sendGameState(gameType, status, gameData) {
        if (this.config.verbose) {
            this.logger.debug({ gameType, status }, '🎮 Sending game state update');
        }
        return this.send({
            type: 'game_state',
            gameType,
            status,
            gameData,
        });
    }
    /**
     * Send game ended notification to frontend
     *
     * Triggers the game board UI to show results and then hide.
     */
    async sendGameEnded(gameType, result) {
        this.logger.info({ gameType, result }, '🎮 Game ended');
        return this.send({
            type: 'game_ended',
            gameType,
            result,
        });
    }
    // ============================================================================
    // GENERIC DATA MESSAGE
    // ============================================================================
    /**
     * Send a generic data message (for custom message types)
     */
    async sendData(type, payload) {
        if (!this.room?.localParticipant) {
            if (this.config.verbose) {
                this.logger.debug({ type }, 'Cannot send: no room connection');
            }
            return false;
        }
        try {
            const message = JSON.stringify({
                type,
                ...payload,
                timestamp: Date.now(),
            });
            await this.room.localParticipant.publishData(new TextEncoder().encode(message), {
                reliable: true,
            });
            if (this.config.verbose) {
                this.logger.debug({ type }, 'Generic message sent to frontend');
            }
            return true;
        }
        catch (error) {
            this.logger.warn({ type, error: String(error) }, 'Failed to send generic message');
            return false;
        }
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let publisherInstance = null;
/**
 * Get the singleton FrontendPublisher instance
 */
export function getFrontendPublisher() {
    if (!publisherInstance) {
        publisherInstance = new FrontendPublisher();
    }
    return publisherInstance;
}
/**
 * Initialize the FrontendPublisher with a room
 */
export function initializeFrontendPublisher(room, config) {
    if (!publisherInstance) {
        publisherInstance = new FrontendPublisher(room, config);
    }
    else {
        publisherInstance.setRoom(room);
    }
    return publisherInstance;
}
/**
 * Reset the singleton (for testing)
 */
export function resetFrontendPublisher() {
    publisherInstance = null;
}
//# sourceMappingURL=frontend-publisher.js.map