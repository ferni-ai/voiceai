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
import type { MusicTrack } from './music-player.js';
import type { DJState } from './dj-controller.js';
import { type ScheduledMoment } from './dj-decision-engine.js';
/**
 * A scheduled timer with metadata for inspection/cleanup
 */
export interface ScheduledTimer {
    /** Unique ID for this timer */
    id: string;
    /** Timer handle for cancellation */
    handle: ReturnType<typeof setTimeout>;
    /** What type of moment this timer is for */
    type: ScheduledMoment['type'] | 'fade_check' | 'volume_restore';
    /** When this timer should fire (absolute timestamp) */
    fireAt: number;
    /** Track this timer is associated with (if any) */
    trackName?: string;
    /** Whether this timer has been executed */
    executed: boolean;
}
/**
 * Events emitted by the timing engine
 */
export type TimingEvent = {
    type: 'moment_triggered';
    moment: ScheduledMoment['type'];
    track: MusicTrack;
} | {
    type: 'timer_scheduled';
    timerId: string;
    fireAt: number;
} | {
    type: 'timer_cancelled';
    timerId: string;
    reason: string;
} | {
    type: 'all_timers_cleared';
    count: number;
};
/**
 * Configuration for the timing engine
 */
export interface TimingEngineConfig {
    personaId: string;
    sessionId: string;
}
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
export declare class DJTimingEngine extends EventEmitter {
    private timers;
    private config;
    private currentTrackId;
    private timerIdCounter;
    /**
     * Initialize the timing engine for a session
     */
    initialize(config: TimingEngineConfig): void;
    /**
     * Reset the engine
     */
    reset(): void;
    /**
     * Schedule all moments for a track
     *
     * @param track - Track to schedule moments for
     * @param onMoment - Callback when a moment fires
     * @returns Array of scheduled timer IDs
     */
    scheduleTrackMoments(track: MusicTrack, onMoment: (moment: ScheduledMoment['type'], track: MusicTrack) => void): string[];
    /**
     * Schedule a single timer
     *
     * @param type - Type of event
     * @param delayMs - Delay in milliseconds
     * @param callback - Function to call when timer fires
     * @param trackName - Associated track name (optional)
     * @returns Timer ID
     */
    scheduleTimer(type: ScheduledTimer['type'], delayMs: number, callback: () => void, trackName?: string): string;
    /**
     * Schedule a volume fade check
     * Used for gradual volume transitions
     */
    scheduleFadeCheck(delayMs: number, callback: () => void): string;
    /**
     * Schedule volume restore after ducking
     */
    scheduleVolumeRestore(delayMs: number, callback: () => void): string;
    /**
     * Cancel a specific timer
     */
    cancelTimer(timerId: string, reason?: string): boolean;
    /**
     * Clear all timers for a specific track
     */
    clearTrackTimers(trackId: string, reason?: string): number;
    /**
     * Clear all timers
     */
    clearAllTimers(reason?: string): void;
    /**
     * Clear timers by type
     */
    clearTimersByType(type: ScheduledTimer['type'], reason?: string): number;
    /**
     * Handle DJ state transitions
     * Call this when DJ Controller state changes
     */
    onStateTransition(from: DJState, to: DJState): void;
    /**
     * Get all scheduled timers
     */
    getScheduledTimers(): readonly ScheduledTimer[];
    /**
     * Get count of active timers
     */
    getActiveTimerCount(): number;
    /**
     * Check if there are any pending timers of a specific type
     */
    hasPendingTimerOfType(type: ScheduledTimer['type']): boolean;
    /**
     * Get next timer to fire
     */
    getNextTimer(): ScheduledTimer | null;
    /**
     * Get diagnostic info for debugging
     */
    getDiagnostics(): {
        timerCount: number;
        timers: Array<{
            id: string;
            type: string;
            firesIn: number;
            trackName?: string;
        }>;
    };
    private emitEvent;
}
/**
 * Get the singleton timing engine instance
 */
export declare function getDJTimingEngine(): DJTimingEngine;
/**
 * Reset the singleton (for testing or session cleanup)
 */
export declare function resetDJTimingEngine(): void;
//# sourceMappingURL=dj-timing-engine.d.ts.map