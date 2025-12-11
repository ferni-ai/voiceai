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

import { getFrontendPublisher } from '../agents/realtime/index.js';
import { getMusicAppreciationComment, getReadTheRoomAction } from '../services/dj-service.js';
import {
  checkForOurSong,
  detectSignificantMoment,
  recordOurSong,
  type MomentType,
} from '../services/trust-systems/our-songs.js';
import { getLogger } from '../utils/safe-logger.js';
import {
  getDJOutroPhrase,
  getDJTrackChangePhrase,
  getMidSongMomentPhrase,
  getMusicStoppedPhrase,
} from './ambient-music.js';
import {
  getDJEnhancements,
  initializeDJEnhancements,
  resetDJEnhancements,
  type DJEnhancementController,
  type MusicPreferences,
} from './dj-enhancements.js';
import {
  checkSpontaneousMusicMoment,
  getConversationBridge,
  getEmotionalMirrorOffer,
  getFunInterjection,
  getMusicHumanization,
  getPostMusicCheckIn,
  getTimeAwareMusicSuggestion,
  type MusicHumanizationController,
} from './music-humanization.js';
import { getMusicPlayer, type MusicState, type MusicTrack } from './music-player.js';

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
  /** Callback to check if main agent is speaking (prevents double-speaking) */
  isAgentSpeaking?: () => boolean;
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
  /** Is a game currently active? */
  gameActive?: boolean;
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

  // "Our Songs" - shared musical memories
  private userId: string | null = null;
  private recentUserText = '';
  private lastOurSongCallback = 0;

  // 🎵 Music Humanization - makes interactions feel natural and fun
  private humanization: MusicHumanizationController;
  private conversationStartTime: number = Date.now();
  private recentTopics: string[] = [];
  private lastSpontaneousCheck = 0;

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

    // 🎵 Initialize Music Humanization
    this.humanization = getMusicHumanization();
    this.humanization.setPersona(config.personaId);
    this.conversationStartTime = Date.now();

    log.info('🎧 DJ Booth initialized with enhancements + humanization', {
      persona: config.personaId,
    });
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

  /**
   * Set user ID for "Our Songs" tracking
   */
  setUserId(userId: string): void {
    this.userId = userId;
    log.debug('🎵 DJ Booth user ID set for "Our Songs"', { userId });
  }

  // ==========================================================================
  // "OUR SONGS" - SHARED MUSICAL MEMORIES 💚
  // ==========================================================================

  /**
   * Process user speech during music to detect significant moments.
   * Call this when the user speaks while music is playing.
   *
   * @param userText - What the user just said
   * @param emotion - Detected emotion (if available)
   * @param topic - Current conversation topic (if available)
   */
  processUserSpeechDuringMusic(userText: string, emotion?: string, topic?: string): void {
    if (!this.userId || !this.state.currentTrack || this.state.musicState !== 'playing') {
      return;
    }

    this.recentUserText = userText;

    // Detect if this is a significant moment
    const detection = detectSignificantMoment({
      recentUserText: userText,
      emotion,
      topic,
      isUserSpeaking: true,
    });

    if (detection.isSignificant && detection.type && detection.emotion) {
      // This is a meaningful moment with music playing - record it!
      const track = this.state.currentTrack;
      // Record the "our song" memory (return value intentionally unused - side effect only)
      recordOurSong({
        userId: this.userId,
        song: {
          name: track.name,
          artist: track.artist || 'Unknown Artist',
        },
        momentType: detection.type,
        emotion: detection.emotion,
        context: this.summarizeContext(userText, detection.type),
        topic,
        memorableQuote: this.extractMemorableQuote(userText),
      });

      log.info('🎵 "Our Song" moment captured!', {
        song: track.name,
        momentType: detection.type,
        emotion: detection.emotion,
        userId: this.userId,
      });

      // For "they_loved_it" moments, acknowledge immediately
      if (detection.type === 'they_loved_it') {
        this.speakOverMusic("I'll remember you love this one.");
      }
    }
  }

  /**
   * Check if current track is "our song" and speak a callback if so.
   * Called when a new track starts playing.
   */
  private checkForOurSongCallback(track: MusicTrack): void {
    if (!this.userId) return;

    // Don't callback too frequently (once per 5 minutes max)
    const timeSinceLastCallback = Date.now() - this.lastOurSongCallback;
    if (timeSinceLastCallback < 5 * 60 * 1000) {
      return;
    }

    const callback = checkForOurSong(this.userId, track.name, track.artist || '');

    if (callback) {
      this.lastOurSongCallback = Date.now();

      // 💚 Notify frontend immediately - show heart icon
      const context = callback.memory.moment.context || 'A moment we shared';
      this.notifyOurSong(track, context);

      // Timing based on significance for speech
      const delay = callback.timing === 'immediate' ? 2000 : 8000; // After intro for less significant

      this.scheduleTimer(() => {
        // Only speak if music is still playing this track
        if (this.state.musicState === 'playing' && this.state.currentTrack?.name === track.name) {
          log.info('🎵 Speaking "Our Song" callback', {
            song: track.name,
            phrase: `${callback.phrase.slice(0, 50)}...`,
          });
          this.speakOverMusic(callback.phrase);
        }
      }, delay);
    }
  }

  /**
   * 💚 Notify frontend that current track is "our song"
   * Shows heart icon in Now Playing card
   */
  private notifyOurSong(track: MusicTrack, context: string): void {
    void (async () => {
      try {
        const publisher = getFrontendPublisher();
        if (publisher) {
          await publisher.sendMusicState(
            'playing',
            { name: track.name, artist: track.artist },
            false, // Not ambient
            { isOurSong: true, context }
          );
          log.info('💚 Notified frontend of "our song"', {
            track: track.name,
            context,
          });
        }
      } catch (err) {
        log.warn('Failed to notify frontend of our song', { error: String(err) });
      }
    })();
  }

  /**
   * Summarize the context for storage (keep it brief but meaningful)
   */
  private summarizeContext(userText: string, momentType: MomentType): string {
    // Extract the key action/realization from the text
    const text = userText.toLowerCase();

    if (momentType === 'breakthrough') {
      // Look for the realization
      const patterns = [
        /i finally (.+?)(?:\.|,|$)/,
        /i realized (.+?)(?:\.|,|$)/,
        /i'm ready to (.+?)(?:\.|,|$)/,
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1].slice(0, 100);
      }
    }

    if (momentType === 'celebration') {
      const patterns = [
        /i got (.+?)(?:\.|,|$)/,
        /they said (.+?)(?:\.|,|$)/,
        /i did (.+?)(?:\.|,|$)/,
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1].slice(0, 100);
      }
    }

    // Default: take first meaningful clause
    const firstSentence = userText.split(/[.!?]/)[0];
    return firstSentence.slice(0, 100);
  }

  /**
   * Extract a memorable quote if the text is quote-worthy
   */
  private extractMemorableQuote(userText: string): string | undefined {
    // Only quote if it's short and punchy
    if (userText.length < 80 && userText.length > 10) {
      return userText;
    }

    // Otherwise look for a memorable phrase within
    const phrases = [/["'](.+?)["']/, /i said ["'](.+?)["']/];
    for (const pattern of phrases) {
      const match = userText.match(pattern);
      if (match && match[1].length < 80) {
        return match[1];
      }
    }

    return undefined;
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
   * Set game active state (for GameMusicController integration)
   * When game is active, DJ Booth adjusts its behavior (less commentary, etc.)
   */
  setGameActive(isActive: boolean, gameType?: string): void {
    if (isActive && gameType) {
      this.trackGame(gameType);
    }
    // Store game state for behavior adjustments
    this.state.gameActive = isActive;
  }

  /**
   * Check if a game is currently active
   */
  isGameActive(): boolean {
    return this.state.gameActive ?? false;
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

  // ==========================================================================
  // 🎵 MUSIC HUMANIZATION - Natural, fun, engaging interactions
  // ==========================================================================

  /**
   * Check if we should make a spontaneous music offer
   * Call this periodically (e.g., every 30 seconds) during conversation
   */
  checkSpontaneousMusicOffer(params: {
    emotionalIntensity?: number;
    isAwkwardSilence?: boolean;
    recentAchievement?: boolean;
  }): { shouldOffer: boolean; offer?: string; searchQuery?: string } {
    // Don't check too frequently
    const now = Date.now();
    if (now - this.lastSpontaneousCheck < 30000) {
      return { shouldOffer: false };
    }
    this.lastSpontaneousCheck = now;

    // Don't offer if music is already playing
    if (this.state.musicState === 'playing') {
      return { shouldOffer: false };
    }

    const trigger = checkSpontaneousMusicMoment({
      conversationDurationMs: now - this.conversationStartTime,
      timeSinceLastMusicMs: this.state.musicStartTime ? now - this.state.musicStartTime : Infinity,
      recentTopics: this.recentTopics,
      emotionalIntensity: params.emotionalIntensity ?? 0.3,
      isAwkwardSilence: params.isAwkwardSilence ?? false,
      recentAchievement: params.recentAchievement ?? false,
    });

    if (trigger) {
      log.info('🎵 Spontaneous music offer triggered', { type: trigger.type });
      return {
        shouldOffer: true,
        offer: trigger.offer,
        searchQuery: trigger.searchQuery,
      };
    }

    return { shouldOffer: false };
  }

  /**
   * Get a time-aware music suggestion
   * Uses time of day to suggest appropriate music
   */
  getTimeAwareMusicOffer(): { offer: string; searchQuery: string; mood: string } {
    return getTimeAwareMusicSuggestion();
  }

  /**
   * Get an emotional mirror music offer
   * Offers music that matches/acknowledges user's emotional state
   */
  getEmotionalMusicOffer(emotion: string): string | null {
    return getEmotionalMirrorOffer(emotion);
  }

  /**
   * Get a post-music check-in phrase
   * Called after music ends to ask how user liked it
   */
  getPostMusicCheckIn(wasRequested = true): string {
    return getPostMusicCheckIn(this.config.personaId, wasRequested);
  }

  /**
   * Get a fun DJ interjection (15% chance by default)
   * Makes the DJ feel more human and playful
   */
  getFunInterjection(
    moment: 'track_start' | 'mid_song' | 'track_end' | 'user_liked' | 'user_skipped'
  ): string | null {
    return getFunInterjection(moment);
  }

  /**
   * Get a conversation bridge phrase
   * Use music to transition between heavy/light topics
   */
  getConversationBridge(
    bridgeType: 'heavy_to_light' | 'light_to_deep' | 'closure' | 'opening'
  ): string {
    return getConversationBridge(bridgeType);
  }

  /**
   * Track a conversation topic (for spontaneous music offers)
   * Call this when significant topics come up
   */
  trackConversationTopic(topic: string): void {
    this.recentTopics.push(topic);
    // Keep only last 10 topics
    if (this.recentTopics.length > 10) {
      this.recentTopics.shift();
    }
    // Also track in session flow
    this.djEnhancements?.sessionFlow.trackTopic(topic);
  }

  /**
   * Check if user is vibing to music (enjoying quietly)
   * If true, avoid interrupting them
   */
  isUserVibing(): boolean {
    return this.humanization.isUserVibing();
  }

  /**
   * Update silence duration during music
   * Call this to help detect if user is vibing
   */
  updateSilenceDuringMusic(durationMs: number): void {
    this.humanization.updateSilenceDuringMusic(durationMs);
  }

  /**
   * Get the music humanization controller for advanced use
   */
  getHumanization(): MusicHumanizationController {
    return this.humanization;
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

          // 🎵 Notify Music Humanization
          this.humanization.onMusicStopped(track.name, track.artist);

          if (wasSkipped) {
            // Unexpected stop while playing - speak a phrase
            this.onMusicUnexpectedStop(false);

            // 🎵 Fun interjection when user skips
            const skipComment = this.getFunInterjection('user_skipped');
            if (skipComment) {
              // FIX: Use safeSpeak to prevent double-speaking
              this.safeSpeak(skipComment, { allowInterruptions: true });
            }
          } else {
            // Natural ending - do a post-music check-in (60% chance)
            // But only if we didn't already speak an outro during 'fading'
            if (prevState !== 'fading' || Math.random() < 0.3) {
              const checkIn = this.getPostMusicCheckIn(true);
              // Small delay so the silence settles
              this.scheduleTimer(() => {
                if (this.state.musicState === 'stopped' || this.state.musicState === 'idle') {
                  // FIX: Use safeSpeak to prevent double-speaking
                  this.safeSpeak(checkIn, { allowInterruptions: true });
                }
              }, 1500);
            }
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

    // 💚 Check if this is "our song" - shared musical memory
    this.checkForOurSongCallback(track);

    // Use ?? for proper nullish coalescing (0 is valid duration)
    const duration = track.duration ?? 30000;

    log.info('🎧 Music started - scheduling DJ moments', {
      track: track.name,
      duration: Math.round(duration / 1000),
    });

    // Notify DJ Enhancements (Phase 2 predictive timing)
    this.djEnhancements?.onTrackStart(track);

    // 🎵 Notify Music Humanization
    this.humanization.onMusicStarted(track.name, track.artist);

    // 🎵 Fun interjection on track start (15% chance)
    const funIntro = this.getFunInterjection('track_start');
    if (funIntro && !this.state.agentSpeaking) {
      // Delay slightly so the music starts first
      this.scheduleTimer(() => {
        if (this.state.musicState === 'playing' && !this.state.userSpeaking) {
          this.speakOverMusic(funIntro);
        }
      }, 3000);
    }

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

    // 🎵 Check for fun interjection (15% chance)
    const funOutro = this.getFunInterjection('track_end');
    if (funOutro) {
      // Use fun outro instead of standard
      this.speakOverMusic(funOutro);
      return;
    }

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
    // FIX: Use safeSpeak to prevent double-speaking
    this.safeSpeak(phrase, { allowInterruptions: true });

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
   *
   * NOTE: BackgroundAudioPlayer does NOT support real-time volume changes.
   * This method tracks volume state for UI purposes and uses the music player's
   * duck/unduck methods for actual volume control.
   *
   * For true volume fading, we'd need to restart playback which isn't practical.
   * Instead, we:
   * - Use duck() for lowering volume (pauses ambient, notifies UI for user music)
   * - Use unduck() for restoring volume
   * - Track target volumes for state consistency
   *
   * @param targetVolume - Target volume (0-1)
   * @param durationMs - Fade duration (used for UI timing)
   */
  private fadeToVolume(targetVolume: number, durationMs: number): void {
    this.stopVolumeFade();

    const player = getMusicPlayer();
    this.state.targetVolume = targetVolume;
    const startVolume = this.state.currentVolume;
    const volumeDiff = targetVolume - startVolume;

    if (Math.abs(volumeDiff) < 0.01) {
      // Already at target
      return;
    }

    // Use duck/unduck for actual volume control
    if (targetVolume < VOLUME.AGENT_TALKING + 0.05) {
      // Fading down - use duck
      player.duck();
      this.state.currentVolume = targetVolume;
    } else if (startVolume < VOLUME.AGENT_TALKING + 0.05 && targetVolume >= VOLUME.NORMAL - 0.1) {
      // Fading up from ducked state - use unduck
      player.unduck();
      this.state.currentVolume = targetVolume;
    } else {
      // Just track the state for UI purposes
      this.state.currentVolume = targetVolume;
    }

    // Update the volume setting for future tracks
    player.setVolume(targetVolume);

    log.debug('🎧 Volume fade', {
      from: startVolume.toFixed(2),
      to: targetVolume.toFixed(2),
      durationMs,
    });
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
  // SPEECH SAFETY HELPERS
  // ==========================================================================

  /**
   * Check if it's safe to speak (prevents double-speaking)
   * Returns true if neither internal state nor external agent is speaking
   */
  private canSafelySpeak(): boolean {
    // Check internal DJ booth state
    if (this.state.agentSpeaking) return false;
    // Check external agent state via callback (if provided)
    if (this.config.isAgentSpeaking?.()) return false;
    return true;
  }

  /**
   * Safely speak a phrase if not already speaking
   * Returns true if speech was initiated, false if skipped
   */
  private safeSpeak(phrase: string, options?: { allowInterruptions?: boolean }): boolean {
    if (!this.canSafelySpeak()) {
      log.debug('🎧 Skipping DJ speech - agent already speaking', { phrase: phrase.slice(0, 30) });
      return false;
    }
    this.config.speakCallback(phrase, options);
    return true;
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

/**
 * Get the DJ Enhancements controller directly (without needing a DJ Booth instance).
 * Useful for accessing music preferences and session flow tracking.
 */
export function getDJEnhancementsController(): ReturnType<typeof getDJEnhancements> {
  // First try to get from active DJ Booth
  if (djBoothInstance) {
    return djBoothInstance.getEnhancements();
  }
  // Fall back to global getter (may be null if not initialized)
  return getDJEnhancements();
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
