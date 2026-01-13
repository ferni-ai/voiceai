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
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'DJController' });
// ============================================================================
// VALID STATE TRANSITIONS
// ============================================================================
/**
 * State transition table - defines which transitions are valid
 * Key: current state, Value: set of valid next states
 */
const VALID_TRANSITIONS = {
    idle: new Set(['playing', 'changing']),
    playing: new Set(['ducking', 'fading', 'paused', 'stopped', 'changing', 'idle']),
    ducking: new Set(['playing', 'fading', 'paused', 'stopped', 'idle']),
    fading: new Set(['stopped', 'ducking', 'idle']),
    paused: new Set(['playing', 'stopped', 'idle']),
    stopped: new Set(['idle', 'playing']),
    changing: new Set(['playing', 'stopped', 'idle']),
};
// ============================================================================
// DJ CONTROLLER CLASS
// ============================================================================
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
export class DJController extends EventEmitter {
    _state;
    config = null;
    constructor() {
        super();
        this._state = this.getInitialState();
    }
    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    /**
     * Initialize the controller for a session
     */
    initialize(config) {
        // Check for session change
        if (this._state.sessionId && this._state.sessionId !== config.sessionId) {
            log.warn({ oldSession: this._state.sessionId, newSession: config.sessionId }, 'Session change detected - resetting DJ controller');
            this.reset();
        }
        this.config = config;
        this._state.sessionId = config.sessionId;
        this._state.isInitialized = true;
        log.info({ sessionId: config.sessionId, personaId: config.personaId }, 'DJ Controller initialized');
    }
    /**
     * Reset the controller to initial state
     */
    reset() {
        const oldState = this._state.state;
        this._state = this.getInitialState();
        if (oldState !== 'idle') {
            log.info({ from: oldState, to: 'idle' }, 'DJ Controller reset');
        }
    }
    /**
     * Get initial state
     */
    getInitialState() {
        return {
            state: 'idle',
            currentTrack: null,
            isAmbient: false,
            isAgentSpeaking: false,
            isUserSpeaking: false,
            duckReason: null,
            trackStartTime: null,
            trackDuration: null,
            wasExplicitlyStopped: false,
            explicitStopTime: null,
            sessionId: null,
            isInitialized: false,
        };
    }
    // ==========================================================================
    // COMMAND DISPATCH (Main Entry Point)
    // ==========================================================================
    /**
     * Dispatch a command to the state machine
     *
     * This is the ONLY way to change state. All external systems should use this.
     */
    dispatch(command) {
        const prevState = this._state.state;
        try {
            switch (command.type) {
                case 'PLAY_TRACK':
                    this.handlePlayTrack(command.track, command.isAmbient ?? false);
                    break;
                case 'STOP':
                    this.handleStop(true); // explicit stop
                    break;
                case 'PAUSE':
                    this.handlePause();
                    break;
                case 'RESUME':
                    this.handleResume();
                    break;
                case 'SKIP':
                    this.handleSkip();
                    break;
                case 'DUCK':
                    this.handleDuck(command.reason);
                    break;
                case 'UNDUCK':
                    this.handleUnduck();
                    break;
                case 'TRACK_NEAR_END':
                    this.handleTrackNearEnd();
                    break;
                case 'TRACK_ENDED':
                    this.handleTrackEnded();
                    break;
                case 'AGENT_SPEAKING_START':
                    this._state.isAgentSpeaking = true;
                    this.handleDuck('agent_speaking');
                    break;
                case 'AGENT_SPEAKING_END':
                    this._state.isAgentSpeaking = false;
                    if (!this._state.isUserSpeaking) {
                        this.handleUnduck();
                    }
                    break;
                case 'USER_SPEAKING_START':
                    this._state.isUserSpeaking = true;
                    this.handleDuck('user_speaking');
                    break;
                case 'USER_SPEAKING_END':
                    this._state.isUserSpeaking = false;
                    if (!this._state.isAgentSpeaking) {
                        this.handleUnduck();
                    }
                    break;
                case 'CLEANUP':
                    this.handleCleanup();
                    break;
                default:
                    log.warn({ command }, 'Unknown command type');
            }
        }
        catch (error) {
            log.error({ error: String(error), command, prevState }, 'Error handling command');
            this.emitEvent({ type: 'error', message: String(error), command });
        }
    }
    // ==========================================================================
    // COMMAND HANDLERS
    // ==========================================================================
    handlePlayTrack(track, isAmbient) {
        const prevState = this._state.state;
        // If already playing, treat as track change
        if (prevState === 'playing' || prevState === 'ducking') {
            this.transitionTo('changing');
        }
        // Update state
        this._state.currentTrack = track;
        this._state.isAmbient = isAmbient;
        this._state.trackStartTime = Date.now();
        this._state.trackDuration = track.duration ?? 30000;
        this._state.wasExplicitlyStopped = false;
        this._state.explicitStopTime = null;
        // Transition to playing (or ducking if someone is speaking)
        if (this._state.isAgentSpeaking || this._state.isUserSpeaking) {
            this.transitionTo('ducking');
            this._state.duckReason = this._state.isAgentSpeaking ? 'agent_speaking' : 'user_speaking';
        }
        else {
            this.transitionTo('playing');
        }
        // Emit events
        this.emitEvent({ type: 'track_started', track, isAmbient });
        // Only emit intro speech event if not ambient and not already ducking
        if (!isAmbient && this._state.state === 'playing') {
            this.emitEvent({ type: 'should_speak_intro', track });
        }
        log.info({
            track: track.name,
            artist: track.artist,
            isAmbient,
            duration: this._state.trackDuration,
            state: this._state.state,
        }, 'Track started');
    }
    handleStop(explicit) {
        const prevState = this._state.state;
        const track = this._state.currentTrack;
        if (prevState === 'idle' || prevState === 'stopped') {
            return; // Already stopped
        }
        if (explicit) {
            this._state.wasExplicitlyStopped = true;
            this._state.explicitStopTime = Date.now();
        }
        this.transitionTo('stopped');
        if (track) {
            const wasSkipped = prevState !== 'fading'; // If we weren't fading, it was skipped
            this.emitEvent({
                type: 'track_ended',
                track,
                wasSkipped,
                wasAmbient: this._state.isAmbient,
            });
        }
        // Clear track state
        this._state.currentTrack = null;
        this._state.trackStartTime = null;
        this._state.trackDuration = null;
        this._state.duckReason = null;
        log.info({ track: track?.name, explicit, prevState }, 'Music stopped');
        // Transition to idle after a short delay
        setTimeout(() => {
            if (this._state.state === 'stopped') {
                this.transitionTo('idle');
            }
        }, 100);
    }
    handlePause() {
        if (this._state.state !== 'playing' && this._state.state !== 'ducking') {
            return;
        }
        this.transitionTo('paused');
        log.info({ track: this._state.currentTrack?.name }, 'Music paused');
    }
    handleResume() {
        if (this._state.state !== 'paused') {
            return;
        }
        // Resume to appropriate state based on speaking status
        if (this._state.isAgentSpeaking || this._state.isUserSpeaking) {
            this.transitionTo('ducking');
        }
        else {
            this.transitionTo('playing');
        }
        log.info({ track: this._state.currentTrack?.name }, 'Music resumed');
    }
    handleSkip() {
        const track = this._state.currentTrack;
        if (!track)
            return;
        this.emitEvent({
            type: 'track_ended',
            track,
            wasSkipped: true,
            wasAmbient: this._state.isAmbient,
        });
        // Clear current track, wait for next PLAY_TRACK command
        this.transitionTo('stopped');
        this._state.currentTrack = null;
        log.info({ track: track.name }, 'Track skipped');
    }
    handleDuck(reason) {
        const currentState = this._state.state;
        // Already ducking - just update reason if different
        if (currentState === 'ducking') {
            if (this._state.duckReason !== reason) {
                this._state.duckReason = reason;
                log.debug({ reason, prevReason: this._state.duckReason }, 'Duck reason updated');
            }
            return;
        }
        // Can only duck from playing or fading state
        if (currentState !== 'playing' && currentState !== 'fading') {
            return;
        }
        this._state.duckReason = reason;
        this.transitionTo('ducking');
        this.emitEvent({ type: 'ducking_started', reason });
        log.debug({ reason, from: currentState }, 'Music ducking');
    }
    handleUnduck() {
        if (this._state.state !== 'ducking') {
            return;
        }
        // Don't unduck if someone is still speaking
        if (this._state.isAgentSpeaking || this._state.isUserSpeaking) {
            return;
        }
        this._state.duckReason = null;
        this.transitionTo('playing');
        this.emitEvent({ type: 'ducking_ended' });
        log.debug({ track: this._state.currentTrack?.name }, 'Music unduck');
    }
    handleTrackNearEnd() {
        if (this._state.state !== 'playing' && this._state.state !== 'ducking') {
            return;
        }
        const track = this._state.currentTrack;
        if (!track || this._state.isAmbient) {
            return; // Don't announce ambient music endings
        }
        this.transitionTo('fading');
        this.emitEvent({ type: 'fading_started', track });
        this.emitEvent({ type: 'should_speak_outro', track });
        log.info({ track: track.name }, 'Track fading - outro scheduled');
    }
    handleTrackEnded() {
        this.handleStop(false); // Not explicit
    }
    handleCleanup() {
        this.reset();
        log.info('DJ Controller cleaned up');
    }
    // ==========================================================================
    // STATE TRANSITIONS
    // ==========================================================================
    transitionTo(newState) {
        const prevState = this._state.state;
        // Validate transition
        if (!VALID_TRANSITIONS[prevState].has(newState)) {
            log.warn({ from: prevState, to: newState }, 'Invalid state transition attempted');
            return;
        }
        // Skip if same state (except for logging)
        if (prevState === newState) {
            return;
        }
        this._state.state = newState;
        // Emit state change event
        this.emitEvent({
            type: 'state_changed',
            from: prevState,
            to: newState,
            track: this._state.currentTrack,
        });
        log.info({
            from: prevState,
            to: newState,
            track: this._state.currentTrack?.name,
            isAmbient: this._state.isAmbient,
        }, 'State transition');
    }
    // ==========================================================================
    // EVENT EMISSION
    // ==========================================================================
    emitEvent(event) {
        this.emit(event.type, event);
        this.emit('*', event); // Wildcard for logging/debugging
    }
    // ==========================================================================
    // STATE QUERIES (Read-only access to state)
    // ==========================================================================
    /**
     * Get a snapshot of the current state
     */
    getState() {
        return { ...this._state };
    }
    /**
     * Check if music is currently active (playing or ducking)
     * Use this for dead air detection
     */
    isMusicActive() {
        return (this._state.state === 'playing' ||
            this._state.state === 'ducking' ||
            this._state.state === 'fading' ||
            this._state.state === 'changing');
    }
    /**
     * Check if music is playing at full volume
     */
    isMusicPlaying() {
        return this._state.state === 'playing';
    }
    /**
     * Check if music is currently ducked
     */
    isDucking() {
        return this._state.state === 'ducking';
    }
    /**
     * Check if music is in fade-out state
     */
    isFading() {
        return this._state.state === 'fading';
    }
    /**
     * Get the current track
     */
    getCurrentTrack() {
        return this._state.currentTrack;
    }
    /**
     * Check if current music is ambient/thinking music
     */
    isAmbientMusic() {
        return this._state.isAmbient;
    }
    /**
     * Check if music was explicitly stopped by user
     */
    wasExplicitlyStopped() {
        return this._state.wasExplicitlyStopped;
    }
    /**
     * Get time elapsed since track started (ms)
     */
    getTrackElapsedTime() {
        if (!this._state.trackStartTime)
            return 0;
        return Date.now() - this._state.trackStartTime;
    }
    /**
     * Get time remaining in track (ms)
     */
    getTrackRemainingTime() {
        if (!this._state.trackStartTime || !this._state.trackDuration)
            return 0;
        return Math.max(0, this._state.trackDuration - this.getTrackElapsedTime());
    }
    /**
     * Get the persona ID for this session
     */
    getPersonaId() {
        return this.config?.personaId ?? 'ferni';
    }
    /**
     * Get the session ID
     */
    getSessionId() {
        return this._state.sessionId;
    }
    /**
     * Convert current state to legacy MusicState for backward compatibility
     */
    toLegacyMusicState() {
        switch (this._state.state) {
            case 'playing':
                return 'playing';
            case 'ducking':
                return 'ducking';
            case 'fading':
                return 'fading';
            case 'paused':
                return 'paused';
            case 'stopped':
                return 'stopped';
            case 'changing':
                return 'changing';
            case 'idle':
            default:
                return 'idle';
        }
    }
}
// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================
let djControllerInstance = null;
/**
 * Get the singleton DJ Controller instance
 */
export function getDJController() {
    if (!djControllerInstance) {
        djControllerInstance = new DJController();
        log.info('DJ Controller singleton created');
    }
    return djControllerInstance;
}
/**
 * Reset the singleton (for testing or session cleanup)
 */
export function resetDJController() {
    if (djControllerInstance) {
        djControllerInstance.reset();
        djControllerInstance.removeAllListeners();
        djControllerInstance = null;
        log.info('DJ Controller singleton reset');
    }
}
/**
 * Check if controller is initialized
 */
export function isDJControllerInitialized() {
    return djControllerInstance?.getState().isInitialized ?? false;
}
//# sourceMappingURL=dj-controller.js.map