/**
 * Music System Telemetry Service
 *
 * Tracks all music-related events for monitoring and optimization:
 * - Playback attempts, successes, failures
 * - Ducking/unducking cycles
 * - DJ outro and crossfade timings
 * - "Our Songs" detections
 * - User engagement during music
 * - Spontaneous offer conversions
 *
 * Usage:
 *   import { musicTelemetry } from './music-telemetry.js';
 *
 *   // Record a playback attempt
 *   musicTelemetry.recordPlaybackStart(track, isAmbient);
 *
 *   // Record state transitions
 *   musicTelemetry.recordStateTransition('playing', 'ducking');
 *
 *   // Get metrics summary
 *   const summary = musicTelemetry.getSummary();
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type MusicSource =
  | 'user_request' // User asked for music
  | 'spotify_search' // Searched Spotify
  | 'ambient' // Thinking/silence music
  | 'spontaneous_offer' // Agent offered, user accepted
  | 'emotional_mirror' // Emotion-reactive music
  | 'our_song'; // Playing a shared memory

export type MusicState =
  | 'idle'
  | 'playing'
  | 'ducking'
  | 'fading'
  | 'changing'
  | 'paused'
  | 'stopped';

export type PlaybackFailureReason =
  | 'not_initialized' // Player not initialized
  | 'download_failed' // Failed to download preview
  | 'ffmpeg_failed' // Audio processing failed
  | 'playback_error' // BackgroundAudioPlayer error
  | 'timeout' // Playback timed out
  | 'interrupted' // Interrupted by user
  | 'network_error' // Network issue
  | 'unknown';

export interface PlaybackTrace {
  id: string;
  sessionId?: string;
  trackName: string;
  artistName: string;
  source: MusicSource;

  // Timing
  startTime: number;
  endTime?: number;
  durationMs?: number;

  // State
  isAmbient: boolean;
  isOurSong: boolean;
  ourSongContext?: string;

  // Result
  success?: boolean;
  failureReason?: PlaybackFailureReason;
  errorMessage?: string;

  // Engagement
  userSpokeAt?: number; // Timestamp when user spoke during music
  duckingCycles: number;
  djOutroSpoken: boolean;
  crossfadeInitiated: boolean;

  // User feedback
  wasSkipped: boolean;
  likeIndicator?: 'positive' | 'negative' | 'neutral';
}

export interface StateTransition {
  fromState: MusicState;
  toState: MusicState;
  timestamp: number;
  trackName?: string;
  durationInStateMs: number;
}

export interface MusicTelemetrySummary {
  // Totals
  totalPlaybackAttempts: number;
  totalSuccessfulPlaybacks: number;
  totalFailedPlaybacks: number;
  successRate: number;

  // By source
  bySource: Record<MusicSource, { attempts: number; successes: number; skips: number }>;

  // Engagement
  avgDuckingCyclesPerTrack: number;
  percentWithDjOutro: number;
  percentSkipped: number;
  percentOurSongs: number;

  // Timing
  avgPlaybackDurationMs: number;
  avgCrossfadeGapMs: number;

  // Failure breakdown
  byFailureReason: Record<PlaybackFailureReason, number>;

  // Session stats
  tracksPerSession: number;
  spontaneousOfferAcceptRate: number;
}

// ============================================================================
// MUSIC TELEMETRY CLASS
// ============================================================================

class MusicTelemetryService {
  private playbackTraces = new Map<string, PlaybackTrace>();
  private stateTransitions: StateTransition[] = [];
  private currentState: MusicState = 'idle';
  private lastStateChangeTime: number = Date.now();
  private sessionId: string | null = null;

  // Counters
  private spontaneousOffersCount = 0;
  private spontaneousOffersAccepted = 0;
  private crossfadeGaps: number[] = [];
  private crossfadeStartTime: number | null = null;

  /**
   * Set the current session ID for correlation
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Generate a unique trace ID
   */
  private generateTraceId(): string {
    return `music-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==========================================================================
  // PLAYBACK TRACKING
  // ==========================================================================

  /**
   * Record when music playback starts
   */
  recordPlaybackStart(
    trackName: string,
    artistName: string,
    source: MusicSource,
    isAmbient = false,
    isOurSong = false,
    ourSongContext?: string
  ): string {
    const traceId = this.generateTraceId();

    const trace: PlaybackTrace = {
      id: traceId,
      sessionId: this.sessionId || undefined,
      trackName,
      artistName,
      source,
      startTime: Date.now(),
      isAmbient,
      isOurSong,
      ourSongContext,
      duckingCycles: 0,
      djOutroSpoken: false,
      crossfadeInitiated: false,
      wasSkipped: false,
    };

    this.playbackTraces.set(traceId, trace);

    log.info({ traceId, trackName, source, isAmbient, isOurSong }, '🎵 Playback started');

    return traceId;
  }

  /**
   * Record successful playback completion
   */
  recordPlaybackComplete(traceId: string, wasSkipped = false): void {
    const trace = this.playbackTraces.get(traceId);
    if (!trace) {
      log.warn({ traceId }, '🎵 Unknown trace ID for playback complete');
      return;
    }

    trace.endTime = Date.now();
    trace.durationMs = trace.endTime - trace.startTime;
    trace.success = true;
    trace.wasSkipped = wasSkipped;

    log.info(
      {
        traceId,
        trackName: trace.trackName,
        durationMs: trace.durationMs,
        wasSkipped,
        duckingCycles: trace.duckingCycles,
      },
      '🎵 Playback completed'
    );
  }

  /**
   * Record playback failure
   */
  recordPlaybackFailure(
    traceId: string,
    reason: PlaybackFailureReason,
    errorMessage?: string
  ): void {
    const trace = this.playbackTraces.get(traceId);
    if (!trace) {
      log.warn({ traceId }, '🎵 Unknown trace ID for playback failure');
      return;
    }

    trace.endTime = Date.now();
    trace.durationMs = trace.endTime - trace.startTime;
    trace.success = false;
    trace.failureReason = reason;
    trace.errorMessage = errorMessage;

    log.warn(
      { traceId, trackName: trace.trackName, reason, errorMessage },
      '🎵 Playback failed'
    );
  }

  // ==========================================================================
  // STATE TRANSITION TRACKING
  // ==========================================================================

  /**
   * Record a state transition
   */
  recordStateTransition(fromState: MusicState, toState: MusicState, trackName?: string): void {
    const now = Date.now();
    const durationInStateMs = now - this.lastStateChangeTime;

    const transition: StateTransition = {
      fromState,
      toState,
      timestamp: now,
      trackName,
      durationInStateMs,
    };

    this.stateTransitions.push(transition);
    this.currentState = toState;
    this.lastStateChangeTime = now;

    // Track crossfade timing
    if (toState === 'changing') {
      this.crossfadeStartTime = now;
    }
    if (fromState === 'changing' && toState === 'playing' && this.crossfadeStartTime) {
      const crossfadeGap = now - this.crossfadeStartTime;
      this.crossfadeGaps.push(crossfadeGap);
      log.debug({ crossfadeGap }, '🎵 Crossfade gap recorded');
      this.crossfadeStartTime = null;
    }

    // Keep only last 1000 transitions
    if (this.stateTransitions.length > 1000) {
      this.stateTransitions = this.stateTransitions.slice(-500);
    }

    log.debug({ fromState, toState, durationInStateMs, trackName }, '🎵 State transition');
  }

  /**
   * Record ducking cycle
   */
  recordDuckingCycle(traceId: string): void {
    const trace = this.playbackTraces.get(traceId);
    if (trace) {
      trace.duckingCycles++;
    }
  }

  /**
   * Record DJ outro was spoken
   */
  recordDjOutro(traceId: string): void {
    const trace = this.playbackTraces.get(traceId);
    if (trace) {
      trace.djOutroSpoken = true;
    }
  }

  /**
   * Record crossfade initiated
   */
  recordCrossfade(traceId: string): void {
    const trace = this.playbackTraces.get(traceId);
    if (trace) {
      trace.crossfadeInitiated = true;
    }
  }

  /**
   * Record user spoke during music
   */
  recordUserSpeech(traceId: string): void {
    const trace = this.playbackTraces.get(traceId);
    if (trace && !trace.userSpokeAt) {
      trace.userSpokeAt = Date.now();
    }
  }

  // ==========================================================================
  // SPONTANEOUS OFFER TRACKING
  // ==========================================================================

  /**
   * Record a spontaneous music offer
   */
  recordSpontaneousOffer(): void {
    this.spontaneousOffersCount++;
  }

  /**
   * Record user accepted a spontaneous offer
   */
  recordSpontaneousOfferAccepted(): void {
    this.spontaneousOffersAccepted++;
  }

  // ==========================================================================
  // SUMMARY & METRICS
  // ==========================================================================

  /**
   * Get telemetry summary
   */
  getSummary(): MusicTelemetrySummary {
    const traces = Array.from(this.playbackTraces.values());

    // Totals
    const totalAttempts = traces.length;
    const successes = traces.filter((t) => t.success === true);
    const failures = traces.filter((t) => t.success === false);

    // By source
    const bySource: Record<MusicSource, { attempts: number; successes: number; skips: number }> = {
      user_request: { attempts: 0, successes: 0, skips: 0 },
      spotify_search: { attempts: 0, successes: 0, skips: 0 },
      ambient: { attempts: 0, successes: 0, skips: 0 },
      spontaneous_offer: { attempts: 0, successes: 0, skips: 0 },
      emotional_mirror: { attempts: 0, successes: 0, skips: 0 },
      our_song: { attempts: 0, successes: 0, skips: 0 },
    };

    for (const trace of traces) {
      bySource[trace.source].attempts++;
      if (trace.success) bySource[trace.source].successes++;
      if (trace.wasSkipped) bySource[trace.source].skips++;
    }

    // By failure reason
    const byFailureReason: Record<PlaybackFailureReason, number> = {
      not_initialized: 0,
      download_failed: 0,
      ffmpeg_failed: 0,
      playback_error: 0,
      timeout: 0,
      interrupted: 0,
      network_error: 0,
      unknown: 0,
    };

    for (const trace of failures) {
      if (trace.failureReason) {
        byFailureReason[trace.failureReason]++;
      }
    }

    // Engagement metrics
    const completedTraces = traces.filter((t) => t.durationMs !== undefined);
    const avgDuckingCycles =
      completedTraces.length > 0
        ? completedTraces.reduce((sum, t) => sum + t.duckingCycles, 0) / completedTraces.length
        : 0;

    const tracesWithOutro = completedTraces.filter((t) => t.djOutroSpoken).length;
    const percentWithDjOutro =
      completedTraces.length > 0 ? (tracesWithOutro / completedTraces.length) * 100 : 0;

    const skippedTraces = traces.filter((t) => t.wasSkipped).length;
    const percentSkipped = totalAttempts > 0 ? (skippedTraces / totalAttempts) * 100 : 0;

    const ourSongTraces = traces.filter((t) => t.isOurSong).length;
    const percentOurSongs = totalAttempts > 0 ? (ourSongTraces / totalAttempts) * 100 : 0;

    // Timing
    const avgPlaybackDurationMs =
      completedTraces.length > 0
        ? completedTraces.reduce((sum, t) => sum + (t.durationMs || 0), 0) / completedTraces.length
        : 0;

    const avgCrossfadeGapMs =
      this.crossfadeGaps.length > 0
        ? this.crossfadeGaps.reduce((a, b) => a + b, 0) / this.crossfadeGaps.length
        : 0;

    // Spontaneous offers
    const spontaneousOfferAcceptRate =
      this.spontaneousOffersCount > 0
        ? (this.spontaneousOffersAccepted / this.spontaneousOffersCount) * 100
        : 0;

    return {
      totalPlaybackAttempts: totalAttempts,
      totalSuccessfulPlaybacks: successes.length,
      totalFailedPlaybacks: failures.length,
      successRate: totalAttempts > 0 ? (successes.length / totalAttempts) * 100 : 0,
      bySource,
      avgDuckingCyclesPerTrack: avgDuckingCycles,
      percentWithDjOutro,
      percentSkipped,
      percentOurSongs,
      avgPlaybackDurationMs,
      avgCrossfadeGapMs,
      byFailureReason,
      tracksPerSession: totalAttempts, // Would need session grouping for accurate
      spontaneousOfferAcceptRate,
    };
  }

  /**
   * Get recent playback traces for debugging
   */
  getRecentTraces(count = 10): PlaybackTrace[] {
    const traces = Array.from(this.playbackTraces.values());
    return traces.slice(-count);
  }

  /**
   * Reset telemetry (for new session)
   */
  reset(): void {
    this.playbackTraces.clear();
    this.stateTransitions = [];
    this.currentState = 'idle';
    this.lastStateChangeTime = Date.now();
    this.spontaneousOffersCount = 0;
    this.spontaneousOffersAccepted = 0;
    this.crossfadeGaps = [];
    this.crossfadeStartTime = null;
    this.sessionId = null;

    log.debug('🎵 Music telemetry reset');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: MusicTelemetryService | null = null;

export function getMusicTelemetry(): MusicTelemetryService {
  if (!instance) {
    instance = new MusicTelemetryService();
  }
  return instance;
}

export function resetMusicTelemetry(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

// Convenience export
export const musicTelemetry = {
  get: getMusicTelemetry,
  reset: resetMusicTelemetry,

  recordPlaybackStart: (...args: Parameters<MusicTelemetryService['recordPlaybackStart']>) =>
    getMusicTelemetry().recordPlaybackStart(...args),
  recordPlaybackComplete: (...args: Parameters<MusicTelemetryService['recordPlaybackComplete']>) =>
    getMusicTelemetry().recordPlaybackComplete(...args),
  recordPlaybackFailure: (...args: Parameters<MusicTelemetryService['recordPlaybackFailure']>) =>
    getMusicTelemetry().recordPlaybackFailure(...args),
  recordStateTransition: (...args: Parameters<MusicTelemetryService['recordStateTransition']>) =>
    getMusicTelemetry().recordStateTransition(...args),
  recordDuckingCycle: (...args: Parameters<MusicTelemetryService['recordDuckingCycle']>) =>
    getMusicTelemetry().recordDuckingCycle(...args),
  recordDjOutro: (...args: Parameters<MusicTelemetryService['recordDjOutro']>) =>
    getMusicTelemetry().recordDjOutro(...args),
  getSummary: () => getMusicTelemetry().getSummary(),
};

export default getMusicTelemetry;

