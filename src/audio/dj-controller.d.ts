/**
 * DJ Controller - Single Source of Truth for Music/DJ State
 *
 * This is the central state machine that coordinates all music/DJ functionality.
 * All music-related state lives here. External systems issue commands and subscribe
 * to events - they do NOT manage their own music state.
 *
 * Architecture:
 * - State Machine: Idle → Playing → Ducking → Fading → Stopped
 * - Command Pattern: External entities issue commands, controller handles transitions
 * - Event Emitter: Subscribers react to state changes
 * - Unidirectional Flow: Commands in, events out - no circular dependencies
 *
 * @module audio/dj-controller
 */
import { EventEmitter } from 'events';
import type { MusicTrack, MusicState } from './music-player.js';
/**
 * DJ Controller States
 *
 * The state machine has these states:
 * - idle: No music playing, dead air detection active
 * - playing: Music at full volume, DJ interjections enabled
 * - ducking: Music at reduced volume (agent/user speaking), NO interjections
 * - fading: Track ending soon (~5s left), outro speech scheduled
 * - paused: Playback paused by user
 * - stopped: Track ended, cleanup in progress
 * - changing: Crossfade between tracks in progress
 */
export type DJState = 'idle' | 'playing' | 'ducking' | 'fading' | 'paused' | 'stopped' | 'changing';
/**
 * Commands that can be issued to the DJ Controller
 */
export type DJCommand = {
    type: 'PLAY_TRACK';
    track: MusicTrack;
    isAmbient?: boolean;
} | {
    type: 'STOP';
} | {
    type: 'PAUSE';
} | {
    type: 'RESUME';
} | {
    type: 'SKIP';
} | {
    type: 'DUCK';
    reason: DuckReason;
} | {
    type: 'UNDUCK';
} | {
    type: 'TRACK_NEAR_END';
} | {
    type: 'TRACK_ENDED';
} | {
    type: 'AGENT_SPEAKING_START';
} | {
    type: 'AGENT_SPEAKING_END';
} | {
    type: 'USER_SPEAKING_START';
} | {
    type: 'USER_SPEAKING_END';
} | {
    type: 'CLEANUP';
};
/**
 * Reasons for ducking audio
 */
export type DuckReason = 'agent_speaking' | 'user_speaking' | 'external' | 'game';
/**
 * Events emitted by the DJ Controller
 */
export type DJEvent = {
    type: 'state_changed';
    from: DJState;
    to: DJState;
    track: MusicTrack | null;
} | {
    type: 'track_started';
    track: MusicTrack;
    isAmbient: boolean;
} | {
    type: 'track_ended';
    track: MusicTrack;
    wasSkipped: boolean;
    wasAmbient: boolean;
} | {
    type: 'ducking_started';
    reason: DuckReason;
} | {
    type: 'ducking_ended';
} | {
    type: 'fading_started';
    track: MusicTrack;
} | {
    type: 'should_speak_intro';
    track: MusicTrack;
} | {
    type: 'should_speak_outro';
    track: MusicTrack;
} | {
    type: 'should_interject';
    track: MusicTrack;
    momentType: 'buildup' | 'drop' | 'appreciation';
} | {
    type: 'error';
    message: string;
    command?: DJCommand;
};
/**
 * Full state snapshot for the DJ Controller
 */
export interface DJControllerState {
    /** Current state machine state */
    state: DJState;
    /** Currently playing track (null if idle) */
    currentTrack: MusicTrack | null;
    /** Is this ambient/thinking music? */
    isAmbient: boolean;
    /** Is the agent currently speaking? */
    isAgentSpeaking: boolean;
    /** Is the user currently speaking? */
    isUserSpeaking: boolean;
    /** Current ducking reason (null if not ducking) */
    duckReason: DuckReason | null;
    /** When the current track started playing */
    trackStartTime: number | null;
    /** Track duration in ms */
    trackDuration: number | null;
    /** Was music explicitly stopped by user? (prevents auto-play thinking music) */
    wasExplicitlyStopped: boolean;
    /** Timestamp when music was explicitly stopped */
    explicitStopTime: number | null;
    /** Session ID for this controller instance */
    sessionId: string | null;
    /** Is the controller initialized? */
    isInitialized: boolean;
}
/**
 * Configuration for DJ Controller
 */
export interface DJControllerConfig {
    /** Persona ID for persona-aware DJ behavior */
    personaId: string;
    /** Session ID for logging and tracking */
    sessionId: string;
    /** User ID for preference learning */
    userId?: string;
}
/**
 * DJ Controller - The single source of truth for all music/DJ state
 *
 * Usage:
 * ```typescript
 * const controller = getDJController();
 * controller.initialize({ personaId: 'ferni', sessionId: 'abc123' });
 *
 * // Issue commands
 * controller.dispatch({ type: 'PLAY_TRACK', track: myTrack });
 * controller.dispatch({ type: 'AGENT_SPEAKING_START' });
 *
 * // Subscribe to events
 * controller.on('state_changed', (event) => { ... });
 * controller.on('should_speak_intro', (event) => { ... });
 *
 * // Query state
 * if (controller.isMusicActive()) { ... }
 * ```
 */
export declare class DJController extends EventEmitter {
    private _state;
    private config;
    constructor();
    /**
     * Initialize the controller for a session
     */
    initialize(config: DJControllerConfig): void;
    /**
     * Reset the controller to initial state
     */
    reset(): void;
    /**
     * Get initial state
     */
    private getInitialState;
    /**
     * Dispatch a command to the state machine
     *
     * This is the ONLY way to change state. All external systems should use this.
     */
    dispatch(command: DJCommand): void;
    private handlePlayTrack;
    private handleStop;
    private handlePause;
    private handleResume;
    private handleSkip;
    private handleDuck;
    private handleUnduck;
    private handleTrackNearEnd;
    private handleTrackEnded;
    private handleCleanup;
    private transitionTo;
    private emitEvent;
    /**
     * Get a snapshot of the current state
     */
    getState(): Readonly<DJControllerState>;
    /**
     * Check if music is currently active (playing or ducking)
     * Use this for dead air detection
     */
    isMusicActive(): boolean;
    /**
     * Check if music is playing at full volume
     */
    isMusicPlaying(): boolean;
    /**
     * Check if music is currently ducked
     */
    isDucking(): boolean;
    /**
     * Check if music is in fade-out state
     */
    isFading(): boolean;
    /**
     * Get the current track
     */
    getCurrentTrack(): MusicTrack | null;
    /**
     * Check if current music is ambient/thinking music
     */
    isAmbientMusic(): boolean;
    /**
     * Check if music was explicitly stopped by user
     */
    wasExplicitlyStopped(): boolean;
    /**
     * Get time elapsed since track started (ms)
     */
    getTrackElapsedTime(): number;
    /**
     * Get time remaining in track (ms)
     */
    getTrackRemainingTime(): number;
    /**
     * Get the persona ID for this session
     */
    getPersonaId(): string;
    /**
     * Get the session ID
     */
    getSessionId(): string | null;
    /**
     * Convert current state to legacy MusicState for backward compatibility
     */
    toLegacyMusicState(): MusicState;
}
/**
 * Get the singleton DJ Controller instance
 */
export declare function getDJController(): DJController;
/**
 * Reset the singleton (for testing or session cleanup)
 */
export declare function resetDJController(): void;
/**
 * Check if controller is initialized
 */
export declare function isDJControllerInitialized(): boolean;
//# sourceMappingURL=dj-controller.d.ts.map