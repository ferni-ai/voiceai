/**
 * DJ Timing Engine - When Events Fire
 *
 * This module manages ALL scheduled events for the DJ system:
 * - Track moment callbacks (buildup, drop, appreciation)
 * - Outro announcements
 * - Check-in timers for long tracks
 * - Countdown warnings
 *
 * All timers are centralized here with proper cleanup on state transitions.
 * This prevents the "multiple schedulers" problem that caused redundant interjections.
 *
 * @module audio/dj-timing-engine
 */
import { EventEmitter } from 'events';
import { createLogger } from '../utils/safe-logger.js';
import { calculateScheduledMoments } from './dj-decision-engine.js';
const log = createLogger({ module: 'DJTimingEngine' });
// ============================================================================
// TIMING ENGINE CLASS
// ============================================================================
/**
 * DJ Timing Engine - Centralized timer management
 *
 * Usage:
 * ```typescript
 * const engine = new DJTimingEngine();
 * engine.initialize({ personaId: 'ferni', sessionId: 'abc' });
 *
 * // Schedule moments for a track
 * engine.scheduleTrackMoments(track, (moment) => {
 *   djController.dispatch({ type: 'SHOULD_INTERJECT', moment });
 * });
 *
 * // Clear all timers on state change
 * djController.on('state_changed', (event) => {
 *   if (event.to === 'stopped' || event.to === 'idle') {
 *     engine.clearAllTimers();
 *   }
 * });
 * ```
 */
export class DJTimingEngine extends EventEmitter {
    timers = new Map();
    config = null;
    currentTrackId = null;
    timerIdCounter = 0;
    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    /**
     * Initialize the timing engine for a session
     */
    initialize(config) {
        this.config = config;
        this.clearAllTimers('initialization');
        log.info({ sessionId: config.sessionId }, 'DJ Timing Engine initialized');
    }
    /**
     * Reset the engine
     */
    reset() {
        this.clearAllTimers('reset');
        this.config = null;
        this.currentTrackId = null;
    }
    // ==========================================================================
    // TIMER SCHEDULING
    // ==========================================================================
    /**
     * Schedule all moments for a track
     *
     * @param track - Track to schedule moments for
     * @param onMoment - Callback when a moment fires
     * @returns Array of scheduled timer IDs
     */
    scheduleTrackMoments(track, onMoment) {
        const personaId = this.config?.personaId ?? 'ferni';
        const trackId = `${track.name}-${Date.now()}`;
        // Clear any existing timers for previous track
        if (this.currentTrackId && this.currentTrackId !== trackId) {
            this.clearTrackTimers(this.currentTrackId, 'new_track');
        }
        this.currentTrackId = trackId;
        // Calculate moments based on track duration and persona
        const moments = calculateScheduledMoments(track, personaId);
        const scheduledIds = [];
        for (const moment of moments) {
            // Roll probability check NOW at schedule time
            // This is intentional - we decide at schedule time, not fire time
            // to keep the system predictable
            const roll = Math.random();
            if (roll > moment.probability) {
                log.debug({ type: moment.type, probability: moment.probability, roll }, 'Moment skipped by probability');
                continue;
            }
            const timerId = this.scheduleTimer(moment.type, moment.triggerTimeMs, () => {
                // Mark as executed
                const timer = this.timers.get(timerId);
                if (timer) {
                    timer.executed = true;
                }
                // Emit event
                this.emitEvent({ type: 'moment_triggered', moment: moment.type, track });
                // Call the callback
                onMoment(moment.type, track);
            }, track.name);
            scheduledIds.push(timerId);
            log.debug({
                type: moment.type,
                triggerMs: moment.triggerTimeMs,
                timerId,
                track: track.name,
            }, 'Moment scheduled');
        }
        log.info({
            track: track.name,
            momentsScheduled: scheduledIds.length,
            totalMoments: moments.length,
        }, 'Track moments scheduled');
        return scheduledIds;
    }
    /**
     * Schedule a single timer
     *
     * @param type - Type of event
     * @param delayMs - Delay in milliseconds
     * @param callback - Function to call when timer fires
     * @param trackName - Associated track name (optional)
     * @returns Timer ID
     */
    scheduleTimer(type, delayMs, callback, trackName) {
        const id = `timer-${++this.timerIdCounter}-${type}`;
        const fireAt = Date.now() + delayMs;
        const handle = setTimeout(() => {
            const timer = this.timers.get(id);
            if (timer && !timer.executed) {
                timer.executed = true;
                callback();
            }
            // Clean up after execution
            this.timers.delete(id);
        }, delayMs);
        const timer = {
            id,
            handle,
            type,
            fireAt,
            trackName,
            executed: false,
        };
        this.timers.set(id, timer);
        this.emitEvent({ type: 'timer_scheduled', timerId: id, fireAt });
        return id;
    }
    /**
     * Schedule a volume fade check
     * Used for gradual volume transitions
     */
    scheduleFadeCheck(delayMs, callback) {
        return this.scheduleTimer('fade_check', delayMs, callback);
    }
    /**
     * Schedule volume restore after ducking
     */
    scheduleVolumeRestore(delayMs, callback) {
        return this.scheduleTimer('volume_restore', delayMs, callback);
    }
    // ==========================================================================
    // TIMER CANCELLATION
    // ==========================================================================
    /**
     * Cancel a specific timer
     */
    cancelTimer(timerId, reason = 'manual') {
        const timer = this.timers.get(timerId);
        if (!timer) {
            return false;
        }
        clearTimeout(timer.handle);
        this.timers.delete(timerId);
        this.emitEvent({ type: 'timer_cancelled', timerId, reason });
        log.debug({ timerId, type: timer.type, reason }, 'Timer cancelled');
        return true;
    }
    /**
     * Clear all timers for a specific track
     */
    clearTrackTimers(trackId, reason = 'track_change') {
        let cleared = 0;
        for (const [id, timer] of this.timers.entries()) {
            // Match by track name prefix
            if (timer.trackName && trackId.startsWith(timer.trackName)) {
                clearTimeout(timer.handle);
                this.timers.delete(id);
                cleared++;
            }
        }
        if (cleared > 0) {
            log.debug({ trackId, cleared, reason }, 'Track timers cleared');
        }
        return cleared;
    }
    /**
     * Clear all timers
     */
    clearAllTimers(reason = 'manual') {
        const count = this.timers.size;
        for (const timer of this.timers.values()) {
            clearTimeout(timer.handle);
        }
        this.timers.clear();
        if (count > 0) {
            this.emitEvent({ type: 'all_timers_cleared', count });
            log.info({ count, reason }, 'All timers cleared');
        }
    }
    /**
     * Clear timers by type
     */
    clearTimersByType(type, reason = 'type_clear') {
        let cleared = 0;
        for (const [id, timer] of this.timers.entries()) {
            if (timer.type === type) {
                clearTimeout(timer.handle);
                this.timers.delete(id);
                cleared++;
            }
        }
        if (cleared > 0) {
            log.debug({ type, cleared, reason }, 'Timers cleared by type');
        }
        return cleared;
    }
    // ==========================================================================
    // STATE TRANSITIONS
    // ==========================================================================
    /**
     * Handle DJ state transitions
     * Call this when DJ Controller state changes
     */
    onStateTransition(from, to) {
        // Clear all moment timers when music stops
        if (to === 'stopped' || to === 'idle') {
            this.clearAllTimers(`state_${from}_to_${to}`);
            this.currentTrackId = null;
        }
        // Clear interjection timers when ducking (don't talk over speech)
        if (to === 'ducking') {
            const interjectionTypes = [
                'buildup',
                'drop',
                'appreciation',
                'check-in',
            ];
            for (const type of interjectionTypes) {
                this.clearTimersByType(type, 'ducking');
            }
        }
    }
    // ==========================================================================
    // INSPECTION
    // ==========================================================================
    /**
     * Get all scheduled timers
     */
    getScheduledTimers() {
        return [...this.timers.values()];
    }
    /**
     * Get count of active timers
     */
    getActiveTimerCount() {
        return this.timers.size;
    }
    /**
     * Check if there are any pending timers of a specific type
     */
    hasPendingTimerOfType(type) {
        for (const timer of this.timers.values()) {
            if (timer.type === type && !timer.executed) {
                return true;
            }
        }
        return false;
    }
    /**
     * Get next timer to fire
     */
    getNextTimer() {
        let earliest = null;
        for (const timer of this.timers.values()) {
            if (!timer.executed && (!earliest || timer.fireAt < earliest.fireAt)) {
                earliest = timer;
            }
        }
        return earliest;
    }
    /**
     * Get diagnostic info for debugging
     */
    getDiagnostics() {
        const now = Date.now();
        const timers = [...this.timers.values()].map((t) => ({
            id: t.id,
            type: t.type,
            firesIn: Math.max(0, t.fireAt - now),
            trackName: t.trackName,
        }));
        return {
            timerCount: this.timers.size,
            timers,
        };
    }
    // ==========================================================================
    // EVENT EMISSION
    // ==========================================================================
    emitEvent(event) {
        this.emit(event.type, event);
        this.emit('*', event); // Wildcard for logging/debugging
    }
}
// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================
let timingEngineInstance = null;
/**
 * Get the singleton timing engine instance
 */
export function getDJTimingEngine() {
    if (!timingEngineInstance) {
        timingEngineInstance = new DJTimingEngine();
        log.info('DJ Timing Engine singleton created');
    }
    return timingEngineInstance;
}
/**
 * Reset the singleton (for testing or session cleanup)
 */
export function resetDJTimingEngine() {
    if (timingEngineInstance) {
        timingEngineInstance.reset();
        timingEngineInstance.removeAllListeners();
        timingEngineInstance = null;
        log.info('DJ Timing Engine singleton reset');
    }
}
//# sourceMappingURL=dj-timing-engine.js.map