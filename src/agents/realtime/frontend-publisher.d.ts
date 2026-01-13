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
/**
 * Room reference type (minimal interface for LiveKit room)
 */
export interface RoomRef {
    localParticipant?: {
        identity?: string;
        publishData: (data: Uint8Array, opts: {
            reliable: boolean;
        }) => Promise<void>;
    };
}
/**
 * Base message type - all messages have these fields
 */
interface BaseMessage {
    type: string;
    timestamp: number;
}
/**
 * Handoff started message
 */
export interface HandoffStartedMessage extends BaseMessage {
    type: 'handoff_started';
    newAgent: string;
    previousAgent: string;
    direction: string;
    playSound?: string;
}
/**
 * Handoff complete message
 */
export interface HandoffCompleteMessage extends BaseMessage {
    type: 'handoff_complete';
    newAgent: string;
    previousAgent: string;
    greeting?: string;
}
/**
 * Handoff failed message
 */
export interface HandoffFailedMessage extends BaseMessage {
    type: 'handoff_failed';
    newAgent: string;
    previousAgent?: string;
    error: string;
}
/**
 * Handoff acknowledged message
 */
export interface HandoffAcknowledgedMessage extends BaseMessage {
    type: 'handoff_acknowledged';
    target: string;
    success: boolean;
    error?: string;
}
/**
 * Emotion update message
 */
export interface EmotionMessage extends BaseMessage {
    type: 'emotion';
    emotion: string;
    confidence: number;
    intensity: number;
}
/**
 * Mood update message
 */
export interface MoodMessage extends BaseMessage {
    type: 'mood';
    state: string;
    energyLevel: number;
    relationshipStage: string;
    hasTransition: boolean;
}
/**
 * Celebration message
 */
export interface CelebrationMessage extends BaseMessage {
    type: 'celebration';
    celebrationType: string;
    effect: 'fireworks' | 'sparkles';
    message?: string;
}
/**
 * Music state message
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
export interface MusicStateMessage extends BaseMessage {
    type: 'music_state';
    state: 'playing' | 'ducking' | 'fading' | 'changing' | 'paused' | 'stopped' | 'idle';
    track?: {
        name: string;
        artist?: string;
        /** Track duration in milliseconds */
        duration?: number;
        /** Album artwork URL (from Spotify/iTunes) */
        albumArt?: string;
    };
    isAmbient: boolean;
    /** 💚 Is this a shared musical memory ("our song")? */
    isOurSong?: boolean;
    /** 💚 Context for the shared memory (e.g., "When you got the job") */
    ourSongContext?: string;
}
/**
 * Engagement data message
 */
export interface EngagementDataMessage extends BaseMessage {
    type: 'engagement_data';
    streak?: number;
    totalConversations?: number;
    predictions?: unknown[];
    achievements?: unknown[];
}
/**
 * Set language message - voice-triggered app language change
 *
 * Sent when the user asks Ferni to change the app language.
 * The frontend will change the locale WITHOUT reloading, keeping
 * the LiveKit connection alive.
 */
export interface SetLanguageMessage extends BaseMessage {
    type: 'set_language';
    language: string;
}
/**
 * Game state message - real-time game board updates
 *
 * Sent when game state changes (move made, turn taken, etc.)
 * The frontend renders visual game boards based on this data.
 */
export interface GameStateMessage extends BaseMessage {
    type: 'game_state';
    gameType: 'tic-tac-toe' | '20-questions' | 'word-association' | 'story-builder' | 'would-you-rather' | string;
    status: 'active' | 'completed' | 'abandoned';
    gameData: Record<string, unknown>;
}
/**
 * Game started message - notify frontend to show game board
 */
export interface GameStartedMessage extends BaseMessage {
    type: 'game_started';
    gameId: string;
    gameType: string;
    gameName: string;
}
/**
 * Game ended message - notify frontend to hide game board
 */
export interface GameEndedMessage extends BaseMessage {
    type: 'game_ended';
    gameType: string;
    result?: string;
}
/**
 * All possible message types
 */
export type FrontendMessage = HandoffStartedMessage | HandoffCompleteMessage | HandoffFailedMessage | HandoffAcknowledgedMessage | EmotionMessage | MoodMessage | CelebrationMessage | MusicStateMessage | EngagementDataMessage | SetLanguageMessage | GameStateMessage | GameStartedMessage | GameEndedMessage;
/**
 * Publisher configuration
 */
export interface PublisherConfig {
    /** Max retry attempts for failed sends */
    maxRetries?: number;
    /** Base delay between retries in ms */
    retryDelayMs?: number;
    /** Whether to log all sends */
    verbose?: boolean;
}
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
export declare class FrontendPublisher {
    private room;
    private logger;
    private config;
    constructor(room?: RoomRef, config?: PublisherConfig);
    /**
     * Set or update the room reference
     */
    setRoom(room: RoomRef): void;
    /**
     * Check if connected and ready to send
     */
    isConnected(): boolean;
    /**
     * Send a message to the frontend with retry logic
     */
    send<T extends FrontendMessage>(message: Omit<T, 'timestamp'>): Promise<boolean>;
    /**
     * Send handoff_started event
     */
    sendHandoffStarted(newAgent: string, previousAgent: string, direction: string, playSound?: string): Promise<boolean>;
    /**
     * Send handoff_complete event
     */
    sendHandoffComplete(newAgent: string, previousAgent: string, greeting?: string): Promise<boolean>;
    /**
     * Send handoff_failed event
     */
    sendHandoffFailed(newAgent: string, error: string, previousAgent?: string): Promise<boolean>;
    /**
     * Send handoff_acknowledged event
     */
    sendHandoffAcknowledged(target: string, success: boolean, error?: string): Promise<boolean>;
    /**
     * Send emotion update to frontend
     */
    sendEmotion(emotion: string, confidence: number, intensity: number): Promise<boolean>;
    /**
     * Send mood update to frontend
     */
    sendMood(state: string, energyLevel: number, relationshipStage: string, hasTransition: boolean): Promise<boolean>;
    /**
     * Send celebration event for visual feedback
     */
    sendCelebration(celebrationType: string, effect: 'fireworks' | 'sparkles', message?: string): Promise<boolean>;
    /**
     * Send multiple celebration events from context injections
     */
    sendCelebrationEvents(injections: Array<{
        category: string;
        content: string;
    }>): Promise<void>;
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
    sendMusicState(state: 'playing' | 'ducking' | 'fading' | 'changing' | 'paused' | 'stopped' | 'idle', track?: {
        name: string;
        artist?: string;
        duration?: number;
        albumArt?: string;
    }, isAmbient?: boolean, ourSongInfo?: {
        isOurSong: boolean;
        context?: string;
    }): Promise<boolean>;
    /**
     * Send engagement data to frontend
     */
    sendEngagementData(data: Omit<EngagementDataMessage, 'type' | 'timestamp'>): Promise<boolean>;
    /**
     * Send a language change request to the frontend
     *
     * The frontend will change the locale WITHOUT reloading the page,
     * keeping the LiveKit connection alive. This enables voice-triggered
     * language changes without disconnecting the call.
     *
     * @param language - The locale code (e.g., 'es', 'fr', 'ja')
     */
    sendSetLanguage(language: string): Promise<boolean>;
    /**
     * Send game started notification to frontend
     *
     * Triggers the game board UI to appear with the appropriate game type.
     */
    sendGameStarted(gameId: string, gameType: string, gameName: string): Promise<boolean>;
    /**
     * Send game state update to frontend
     *
     * Updates the visual game board with current state (moves, scores, turns).
     */
    sendGameState(gameType: GameStateMessage['gameType'], status: GameStateMessage['status'], gameData: Record<string, unknown>): Promise<boolean>;
    /**
     * Send game ended notification to frontend
     *
     * Triggers the game board UI to show results and then hide.
     */
    sendGameEnded(gameType: string, result?: string): Promise<boolean>;
    /**
     * Send a generic data message (for custom message types)
     */
    sendData(type: string, payload: Record<string, unknown>): Promise<boolean>;
}
/**
 * Get the singleton FrontendPublisher instance
 */
export declare function getFrontendPublisher(): FrontendPublisher;
/**
 * Initialize the FrontendPublisher with a room
 */
export declare function initializeFrontendPublisher(room: RoomRef, config?: PublisherConfig): FrontendPublisher;
/**
 * Reset the singleton (for testing)
 */
export declare function resetFrontendPublisher(): void;
export {};
//# sourceMappingURL=frontend-publisher.d.ts.map