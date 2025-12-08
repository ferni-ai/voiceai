/**
 * 🎧 DJ Booth - The Complete Audio Orchestration System
 *
 * This is the "sound engineer" that coordinates everything:
 * - Agent speaking over music (talk-over)
 * - User speaking during music (duck + listen)
 * - Music fading with DJ outro
 * - Thinking music during processing
 * - Timing of "wait for it" moments
 *
 * Think of this as the mixing board in a real radio station.
 * The DJ (agent) talks, the music responds.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getMusicPlayer, type MusicTrack, type MusicState } from './music-player.js';
import {
  getDJOutroPhrase,
  getDJTrackChangePhrase,
  getMidSongMomentPhrase,
  getMusicStoppedPhrase,
} from './ambient-music.js';
import {
  initializeDJEnhancements,
  getDJEnhancements,
  resetDJEnhancements,
  type MusicPreferences,
  type DJEnhancementController,
} from './dj-enhancements.js';
import { getMusicAppreciationComment, getReadTheRoomAction } from '../services/dj-service.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface DJBoothConfig {
  /** Persona ID for voice-appropriate DJ phrases */
  personaId: string;
  /** Callback to make the agent speak */
  speakCallback: (text: string, options?: { allowInterruptions?: boolean }) => void;
  /** Callback when agent is about to speak (for pre-ducking) */
  onAgentSpeakStart?: () => void;
  /** Callback when agent finishes speaking */
  onAgentSpeakEnd?: () => void;
}

export interface DJBoothState {
  /** Is the DJ booth active? */
  isActive: boolean;
  /** Current music state */
  musicState: MusicState;
  /** Current track info */
  currentTrack: MusicTrack | null;
  /** Is the agent currently speaking? */
  agentSpeaking: boolean;
  /** Is the user currently speaking? */
  userSpeaking: boolean;
  /** Target volume (what we're fading to) */
  targetVolume: number;
  /** Actual current volume */
  currentVolume: number;
  /** Time music started (for duration tracking) */
  musicStartTime: number | null;
  /** Scheduled DJ moments */
  scheduledMoments: ScheduledMoment[];
}

export interface ScheduledMoment {
  type: 'buildup' | 'drop' | 'outro' | 'appreciation' | 'check-in';
  triggerTime: number; // ms from music start
  executed: boolean;
}

// ============================================================================
// VOLUME CONSTANTS - The "mixing board" settings
// ============================================================================

const VOLUME = {
  /** Normal music volume */
  NORMAL: 0.5,
  /** Volume when agent is speaking (can hear both) */
  AGENT_TALKING: 0.15,
  /** Volume when user is speaking (much lower, almost muted) */
  USER_TALKING: 0.05,
  /** Ambient/thinking music volume */
  AMBIENT: 0.08,
  /** Fade-out target */
  FADEOUT: 0.0,
} as const;

const TIMING = {
  /** How fast to duck when agent speaks (ms) */
  DUCK_FOR_AGENT_MS: 300,
  /** How fast to duck when user speaks (ms) */
  DUCK_FOR_USER_MS: 150,
  /** How fast to restore volume (ms) */
  RESTORE_MS: 500,
  /** Time before track end to start DJ outro (ms) */
  OUTRO_LEAD_TIME_MS: 5000,
  /** Minimum track duration for mid-song moments (ms) */
  MIN_DURATION_FOR_MOMENTS_MS: 20000,
  /** Check-in interval during music (ms) */
  CHECK_IN_INTERVAL_MS: 60000,
  /** How long fade-out should take (ms) */
  FADEOUT_DURATION_MS: 3000,
} as const;

// ============================================================================
// DJ BOOTH CLASS
// ============================================================================

export class DJBooth {
  private config: DJBoothConfig;
  private state: DJBoothState;
  private volumeFadeInterval: ReturnType<typeof setInterval> | null = null;
  private scheduledTimers: Array<ReturnType<typeof setTimeout>> = [];
  private lastAppreciationTime = 0;
  private lastCheckInTime = 0;
  private djEnhancements: DJEnhancementController | null = null;

  constructor(config: DJBoothConfig, existingMusicPreferences?: Partial<MusicPreferences>) {
    this.config = config;
    this.state = {
      isActive: false,
      musicState: 'idle',
      currentTrack: null,
      agentSpeaking: false,
      userSpeaking: false,
      targetVolume: VOLUME.NORMAL,
      currentVolume: VOLUME.NORMAL,
      musicStartTime: null,
      scheduledMoments: [],
    };

    // Initialize DJ Enhancements (Phases 2-8)
    this.djEnhancements = initializeDJEnhancements(existingMusicPreferences);
    this.djEnhancements.setPersona(config.personaId);
    this.djEnhancements.setSpeakCallback((text) => {
      if (this.state.isActive) {
        this.speakOverMusic(text);
      }
    });

    log.info('🎧 DJ Booth initialized with enhancements', { persona: config.personaId });
  }

  /**
   * Get DJ Enhancements controller for external access
   */
  getEnhancements(): DJEnhancementController | null {
    return this.djEnhancements;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Start the DJ booth - call when session starts
   */
  activate(): void {
    this.state.isActive = true;
    this.setupMusicCallbacks();
    log.info('🎧 DJ Booth activated');
  }

  /**
   * Stop the DJ booth - call when session ends
   */
  deactivate(): void {
    this.state.isActive = false;
    this.clearAllTimers();
    this.stopVolumeFade();

    // Cleanup DJ Enhancements
    if (this.djEnhancements) {
      this.djEnhancements.cleanup();
      resetDJEnhancements();
      this.djEnhancements = null;
    }

    log.info('🎧 DJ Booth deactivated');
  }

  /**
   * Update persona (for handoffs)
   */
  setPersona(personaId: string): void {
    this.config.personaId = personaId;
    this.djEnhancements?.setPersona(personaId);
    log.debug('🎧 DJ Booth persona updated', { persona: personaId });
  }

  // ==========================================================================
  // THINKING MUSIC (Phase 4)
  // ==========================================================================

  /**
   * Start thinking music - call when agent is processing
   * (tool execution, LLM thinking, etc.)
   */
  onProcessingStart(): void {
    this.djEnhancements?.thinkingMusic.onProcessingStart();
  }

  /**
   * Stop thinking music - call when agent is about to speak
   */
  onProcessingEnd(): void {
    this.djEnhancements?.thinkingMusic.onProcessingEnd();
  }

  /**
   * Check if thinking music is playing
   */
  isThinkingMusicPlaying(): boolean {
    return this.djEnhancements?.thinkingMusic.isThinkingMusicPlaying() ?? false;
  }

  // ==========================================================================
  // EMOTION-REACTIVE MUSIC (Phase 5)
  // ==========================================================================

  /**
   * Get a music offer based on detected emotion
   */
  getEmotionMusicOffer(emotion: string): { offer: string; searchQuery: string } | null {
    return this.djEnhancements?.getEmotionOffer(emotion) ?? null;
  }

  // ==========================================================================
  // SESSION FLOW (Phase 7)
  // ==========================================================================

  /**
   * Track a topic discussed in the session
   */
  trackTopic(topic: string): void {
    this.djEnhancements?.sessionFlow.trackTopic(topic);
  }

  /**
   * Track an emotional moment
   */
  trackEmotion(emotion: string): void {
    this.djEnhancements?.sessionFlow.trackEmotion(emotion);
  }

  /**
   * Track a game played
   */
  trackGame(gameType: string): void {
    this.djEnhancements?.sessionFlow.trackGame(gameType);
  }

  /**
   * Get music memory callback for greeting
   */
  getMusicMemoryCallback(): string | null {
    return this.djEnhancements?.getMusicCallback() ?? null;
  }

  /**
   * Get session outro phrase
   */
  getSessionOutro(): string {
    return this.djEnhancements?.getSessionOutro() ?? 'Take care!';
  }

  /**
   * Get music preferences for saving
   */
  getMusicPreferences(): MusicPreferences | null {
    return this.djEnhancements?.getMusicPreferences() ?? null;
  }

  /**
   * Handle a persona handoff - stops music for clean transition
   * Call this BEFORE the voice switch happens
   */
  onHandoff(toPersonaId: string): void {
    log.info('🎧 DJ Booth handling handoff', { to: toPersonaId });

    // Track handoff in session flow
    this.djEnhancements?.sessionFlow.trackHandoff(this.config.personaId, toPersonaId);

    // Stop any current music for a clean transition
    const player = getMusicPlayer();
    if (player.isPlaying()) {
      // Quick fade out, not abrupt stop
      this.fadeToVolume(0, 500);
      setTimeout(() => player.stop(), 600);
    }

    // Clear scheduled moments since we're switching personas
    this.clearAllTimers();
    this.clearScheduledMoments();

    // Update persona for subsequent DJ phrases
    this.config.personaId = toPersonaId;
  }

  // ==========================================================================
  // MUSIC STATE HANDLING
  // ==========================================================================

  /**
   * Connect to music player callbacks
   */
  private setupMusicCallbacks(): void {
    const player = getMusicPlayer();

    player.setOnMusicStateChangeCallback((state, track, isAmbient) => {
      this.handleMusicStateChange(state, track, isAmbient);
    });

    player.setOnMidSongMomentCallback((track, momentType) => {
      // Convert music player moment types to our internal types
      const djMomentType = momentType === 'highlight' ? 'drop' : 'buildup';
      this.handleMidSongMoment(track, djMomentType);
    });
  }

  /**
   * Handle music state changes
   */
  private handleMusicStateChange(
    state: MusicState,
    track: MusicTrack | null,
    isAmbient: boolean
  ): void {
    const prevState = this.state.musicState;
    this.state.musicState = state;
    this.state.currentTrack = track;

    log.debug('🎧 Music state change', {
      from: prevState,
      to: state,
      track: track?.name,
      isAmbient,
    });

    switch (state) {
      case 'playing':
        if (!isAmbient && track) {
          this.onMusicStarted(track);
        }
        break;

      case 'fading':
        if (!isAmbient && track) {
          this.onMusicFading(track);
        }
        break;

      case 'changing':
        // Crossfade happening - agent speaks transition
        this.onTrackChanging(track);
        break;

      case 'stopped':
        // Track ended - record in DJ Enhancements for music history
        if (track && !isAmbient) {
          // wasSkipped = true if we jumped straight from 'playing' (user stopped it)
          // wasSkipped = false if we came from 'fading' (natural ending)
          const wasSkipped = prevState === 'playing';
          this.djEnhancements?.onTrackEnd(track, wasSkipped);

          if (wasSkipped) {
            // Unexpected stop while playing - speak a phrase
            this.onMusicUnexpectedStop(false);
          }
        }

        // 🎧 FIX: Notify ThinkingMusicController when ambient/thinking music ends naturally
        // This ensures isPlaying flag is properly reset
        if (isAmbient && this.djEnhancements?.thinkingMusic.isThinkingMusicPlaying()) {
          this.djEnhancements.thinkingMusic.onMusicEnded();
        }

        this.clearScheduledMoments();
        break;

      case 'paused':
        if (prevState === 'playing' && !isAmbient) {
          // User paused - just acknowledge, don't record as ended
          this.onMusicUnexpectedStop(true);
        }
        this.clearScheduledMoments();
        break;

      case 'ducking':
        // Already handled by our ducking system
        break;
    }
  }

  /**
   * Music started playing - schedule all the DJ moments
   */
  private onMusicStarted(track: MusicTrack): void {
    this.state.musicStartTime = Date.now();
    this.clearScheduledMoments();

    const duration = track.duration || 30000;

    log.info('🎧 Music started - scheduling DJ moments', {
      track: track.name,
      duration: Math.round(duration / 1000),
    });

    // Notify DJ Enhancements (Phase 2 predictive timing)
    this.djEnhancements?.onTrackStart(track);

    // Schedule moments based on track duration
    this.scheduleMoments(track, duration);

    // Restore normal volume
    this.fadeToVolume(VOLUME.NORMAL, TIMING.RESTORE_MS);
  }

  /**
   * Schedule all the DJ moments for this track
   */
  private scheduleMoments(track: MusicTrack, duration: number): void {
    const moments: ScheduledMoment[] = [];

    // 1. Mid-song "buildup" moment (55-70% through) - 30% chance
    if (duration > TIMING.MIN_DURATION_FOR_MOMENTS_MS && Math.random() < 0.3) {
      const buildupPercent = 0.55 + Math.random() * 0.15;
      const buildupTime = duration * buildupPercent;

      moments.push({
        type: 'buildup',
        triggerTime: buildupTime,
        executed: false,
      });

      this.scheduleTimer(() => {
        this.executeMoment('buildup', track);
      }, buildupTime);
    }

    // 2. "Drop" reaction (right after buildup, if we have one) - 20% chance
    if (moments.find((m) => m.type === 'buildup') && Math.random() < 0.2) {
      const dropTime = moments[0].triggerTime + 3000; // 3s after buildup
      if (dropTime < duration - TIMING.OUTRO_LEAD_TIME_MS) {
        moments.push({
          type: 'drop',
          triggerTime: dropTime,
          executed: false,
        });

        this.scheduleTimer(() => {
          this.executeMoment('drop', track);
        }, dropTime);
      }
    }

    // 3. Appreciation comment (15-25s in for longer tracks) - 30% chance
    if (duration > 25000 && Math.random() < 0.3) {
      const appreciationTime = 15000 + Math.random() * 10000;
      if (appreciationTime < duration - TIMING.OUTRO_LEAD_TIME_MS) {
        moments.push({
          type: 'appreciation',
          triggerTime: appreciationTime,
          executed: false,
        });

        this.scheduleTimer(() => {
          this.executeMoment('appreciation', track);
        }, appreciationTime);
      }
    }

    // 4. Check-in for very long tracks (60s+)
    if (duration > TIMING.CHECK_IN_INTERVAL_MS) {
      moments.push({
        type: 'check-in',
        triggerTime: TIMING.CHECK_IN_INTERVAL_MS,
        executed: false,
      });

      this.scheduleTimer(() => {
        this.executeMoment('check-in', track);
      }, TIMING.CHECK_IN_INTERVAL_MS);
    }

    // 5. DJ Outro (5s before end) - ALWAYS
    const outroTime = Math.max(duration - TIMING.OUTRO_LEAD_TIME_MS, duration * 0.8);
    moments.push({
      type: 'outro',
      triggerTime: outroTime,
      executed: false,
    });

    // Note: Outro is triggered by 'fading' state from music player, not timer

    this.state.scheduledMoments = moments;

    log.debug('🎧 Scheduled moments', {
      track: track.name,
      moments: moments.map((m) => ({
        type: m.type,
        at: `${Math.round(m.triggerTime / 1000)}s`,
      })),
    });
  }

  /**
   * Execute a scheduled moment
   */
  private executeMoment(
    type: 'buildup' | 'drop' | 'outro' | 'appreciation' | 'check-in',
    track: MusicTrack
  ): void {
    if (!this.state.isActive || this.state.musicState !== 'playing') {
      return;
    }

    // Don't talk if user is speaking
    if (this.state.userSpeaking) {
      log.debug('🎧 Skipping moment - user is speaking', { type });
      return;
    }

    // Mark as executed
    const moment = this.state.scheduledMoments.find((m) => m.type === type && !m.executed);
    if (moment) {
      moment.executed = true;
    }

    let phrase: string | null = null;

    switch (type) {
      case 'buildup':
        phrase = getMidSongMomentPhrase('buildup', track.name, this.config.personaId);
        break;

      case 'drop':
        phrase = getMidSongMomentPhrase('drop', track.name, this.config.personaId);
        break;

      case 'appreciation':
        // Only if enough time has passed since last one
        if (Date.now() - this.lastAppreciationTime > 15000) {
          phrase = getMusicAppreciationComment(this.config.personaId, track);
          if (phrase) {
            this.lastAppreciationTime = Date.now();
          }
        }
        break;

      case 'check-in':
        if (Date.now() - this.lastCheckInTime > 50000) {
          const timePlaying = this.state.musicStartTime
            ? (Date.now() - this.state.musicStartTime) / 1000
            : 0;

          const action = getReadTheRoomAction(
            {
              musicHasBeenPlayingFor: timePlaying,
              userIsSilentDuringMusic: !this.state.userSpeaking,
            },
            this.config.personaId
          );

          if (action?.phrase && action.action !== 'continue') {
            phrase = action.phrase;
            this.lastCheckInTime = Date.now();
          }
        }
        break;
    }

    if (phrase) {
      log.info('🎧 DJ moment', { type, phrase: phrase.slice(0, 50) });
      this.speakOverMusic(phrase);
    }
  }

  /**
   * Music is fading - speak the DJ outro
   */
  private onMusicFading(track: MusicTrack): void {
    log.info('🎧 Music fading - speaking DJ outro', { track: track.name });

    const outro = getDJOutroPhrase(track.name, track.artist, this.config.personaId);

    // The key: speak OVER the fading music, like a real DJ!
    this.speakOverMusic(outro);
  }

  /**
   * Track is changing (crossfade) - speak transition
   */
  private onTrackChanging(currentTrack: MusicTrack | null): void {
    if (!currentTrack) return;

    log.info('🎧 Track changing - speaking transition', { from: currentTrack.name });

    const transition = getDJTrackChangePhrase(
      { name: currentTrack.name, artist: currentTrack.artist },
      undefined,
      this.config.personaId
    );

    this.speakOverMusic(transition);
  }

  /**
   * Music stopped or paused unexpectedly
   */
  private onMusicUnexpectedStop(wasPaused: boolean): void {
    log.info('🎧 Music stopped unexpectedly', { wasPaused });

    const phrase = getMusicStoppedPhrase(this.config.personaId, wasPaused);
    this.config.speakCallback(phrase, { allowInterruptions: true });

    // Note: No volume restore needed - music has already stopped
  }

  /**
   * Handle mid-song moment callback from music player
   */
  private handleMidSongMoment(track: MusicTrack, momentType: 'buildup' | 'drop'): void {
    this.executeMoment(momentType, track);
  }

  // ==========================================================================
  // SPEAKING OVER MUSIC (The Magic!)
  // ==========================================================================

  /**
   * Speak a phrase while music is playing.
   * Ducks the music, speaks, then restores.
   */
  speakOverMusic(phrase: string): void {
    if (!this.state.isActive) return;

    log.debug('🎧 Speaking over music', { phrase: phrase.slice(0, 50) });

    // 1. Signal we're about to speak
    this.config.onAgentSpeakStart?.();
    this.state.agentSpeaking = true;

    // 2. Duck the music smoothly
    this.fadeToVolume(VOLUME.AGENT_TALKING, TIMING.DUCK_FOR_AGENT_MS);

    // 3. Small delay for the duck to take effect, then speak
    setTimeout(() => {
      this.config.speakCallback(phrase, { allowInterruptions: true });
    }, 100);

    // 4. Estimate speech duration and restore volume after
    // Rough estimate: 100ms per word + 500ms buffer
    const wordCount = phrase.split(/\s+/).length;
    const estimatedDuration = wordCount * 100 + 500;

    setTimeout(() => {
      this.onAgentFinishedSpeaking();
    }, estimatedDuration);
  }

  /**
   * Called when agent finishes speaking
   */
  onAgentFinishedSpeaking(): void {
    this.state.agentSpeaking = false;
    this.config.onAgentSpeakEnd?.();

    // Restore volume (unless user is now speaking)
    if (!this.state.userSpeaking && this.state.musicState === 'playing') {
      this.fadeToVolume(VOLUME.NORMAL, TIMING.RESTORE_MS);
    }
  }

  // ==========================================================================
  // USER SPEAKING HANDLING
  // ==========================================================================

  /**
   * Call when user starts speaking (from VAD)
   */
  onUserStartSpeaking(): void {
    if (!this.state.isActive) return;

    this.state.userSpeaking = true;

    // Duck music heavily for user - we want to HEAR them
    if (this.state.musicState === 'playing') {
      log.debug('🎧 Ducking for user speech');
      this.fadeToVolume(VOLUME.USER_TALKING, TIMING.DUCK_FOR_USER_MS);
    }
  }

  /**
   * Call when user stops speaking (from VAD)
   */
  onUserStopSpeaking(): void {
    if (!this.state.isActive) return;

    this.state.userSpeaking = false;

    // Restore volume (unless agent is about to respond)
    if (!this.state.agentSpeaking && this.state.musicState === 'playing') {
      // Slight delay to see if agent will respond
      setTimeout(() => {
        if (!this.state.agentSpeaking && !this.state.userSpeaking) {
          this.fadeToVolume(VOLUME.NORMAL, TIMING.RESTORE_MS);
        }
      }, 300);
    }
  }

  // ==========================================================================
  // VOLUME FADING (Smooth transitions)
  // ==========================================================================

  /**
   * Smoothly fade to target volume
   */
  private fadeToVolume(targetVolume: number, durationMs: number): void {
    this.stopVolumeFade();

    this.state.targetVolume = targetVolume;
    const startVolume = this.state.currentVolume;
    const volumeDiff = targetVolume - startVolume;

    if (Math.abs(volumeDiff) < 0.01) {
      // Already at target
      return;
    }

    const steps = 20;
    const stepDuration = durationMs / steps;
    const stepVolume = volumeDiff / steps;
    let currentStep = 0;

    const player = getMusicPlayer();

    this.volumeFadeInterval = setInterval(() => {
      currentStep++;
      const newVolume = startVolume + stepVolume * currentStep;
      this.state.currentVolume = newVolume;
      player.setVolume(newVolume);

      if (currentStep >= steps) {
        this.stopVolumeFade();
        this.state.currentVolume = targetVolume;
        player.setVolume(targetVolume);
      }
    }, stepDuration);
  }

  /**
   * Stop any in-progress volume fade
   */
  private stopVolumeFade(): void {
    if (this.volumeFadeInterval) {
      clearInterval(this.volumeFadeInterval);
      this.volumeFadeInterval = null;
    }
  }

  // ==========================================================================
  // TIMER MANAGEMENT
  // ==========================================================================

  private scheduleTimer(callback: () => void, delayMs: number): void {
    const timer = setTimeout(callback, delayMs);
    this.scheduledTimers.push(timer);
  }

  private clearAllTimers(): void {
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer);
    }
    this.scheduledTimers = [];
  }

  private clearScheduledMoments(): void {
    this.state.scheduledMoments = [];
  }

  // ==========================================================================
  // STATE GETTERS
  // ==========================================================================

  getState(): Readonly<DJBoothState> {
    return { ...this.state };
  }

  isPlayingMusic(): boolean {
    return this.state.musicState === 'playing';
  }

  getCurrentTrack(): MusicTrack | null {
    return this.state.currentTrack;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let djBoothInstance: DJBooth | null = null;

export function initializeDJBooth(
  config: DJBoothConfig,
  existingMusicPreferences?: Partial<MusicPreferences>
): DJBooth {
  if (djBoothInstance) {
    djBoothInstance.deactivate();
  }
  djBoothInstance = new DJBooth(config, existingMusicPreferences);
  djBoothInstance.activate();
  return djBoothInstance;
}

export function getDJBooth(): DJBooth | null {
  return djBoothInstance;
}

export function resetDJBooth(): void {
  if (djBoothInstance) {
    djBoothInstance.deactivate();
    djBoothInstance = null;
  }
}

export default {
  initializeDJBooth,
  getDJBooth,
  resetDJBooth,
  DJBooth,
};
