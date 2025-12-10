/**
 * 🎧 DJ Orchestrator - The Main Integration Point
 *
 * This is the single entry point for all DJ/music/session functionality.
 * Import this into voice-agent.ts to enable the full radio show experience.
 *
 * Orchestrates:
 * - Session intros/outros
 * - Music callbacks and offers
 * - Guest DJ handoffs
 * - Thinking music
 * - Mid-song moments
 * - Cross-session memory
 */

import { getLogger } from '../utils/safe-logger.js';
import { getDJSessionService, type SessionContext } from './dj-session.service.js';
import {
  getDJStyle,
  getMusicAppreciationComment,
  getMusicElementAppreciation,
  getContextualMusicSuggestion,
  getReadTheRoomAction,
  getCrossSessionMusicCallback,
  getMusicDiscoveryOffer,
  type DJPersonaStyle,
} from './dj-service.js';
import {
  getDJOutroPhrase,
  getDJTrackChangePhrase,
  getDJDropPhrase,
  getMidSongMomentPhrase,
  getMoodAwareMusicOffer,
  getSessionCallbackPhrase,
  getMusicStoppedPhrase,
} from '../audio/ambient-music.js';
import { playSessionSound, getVerbalSound } from '../audio/session-sounds.js';
import { getMusicPlayer } from '../audio/music-player.js';

const log = getLogger();

// ============================================================================
// DJ ORCHESTRATOR CLASS
// ============================================================================

/**
 * Main orchestrator for all DJ functionality
 * Use this in voice-agent for a clean integration
 */
export class DJOrchestrator {
  private sessionService = getDJSessionService();
  private currentPersonaId = 'ferni';
  private sessionStarted = false;
  private lastMusicPlayedTime: number | null = null;

  constructor() {
    log.info('🎧 DJ Orchestrator initialized');
  }

  // ==========================================================================
  // SESSION LIFECYCLE
  // ==========================================================================

  /**
   * Start a session with the "opening the show" moment
   * Returns what the agent should say and any timing delays
   */
  async openTheShow(context: SessionContext): Promise<{
    phrase: string;
    delayBeforeSpeakingMs: number;
    playedSound: boolean;
  }> {
    log.info('🎧 Opening the show', { userId: context.userId, persona: context.personaId });

    this.currentPersonaId = context.personaId;
    this.sessionStarted = true;

    // Get the intro from session service
    const intro = this.sessionService.startSession(context);

    // Try to play the session start sound
    let playedSound = false;
    let soundPrefix = '';

    if (intro.playStinger) {
      const result = await playSessionSound('session-start');
      playedSound = result.played;
      if (!playedSound && result.verbalFallback) {
        soundPrefix = result.verbalFallback;
      }
    }

    // Combine sound prefix (if verbal fallback) with intro phrase
    const phrase = soundPrefix ? `${soundPrefix}${intro.phrase}` : intro.phrase;

    return {
      phrase,
      delayBeforeSpeakingMs: intro.delayMs || 0,
      playedSound,
    };
  }

  /**
   * End the session with the "wrapping the show" moment
   */
  async wrapTheShow(additionalContext?: Partial<SessionContext>): Promise<{
    phrase: string;
    playedSound: boolean;
  }> {
    log.info('🎧 Wrapping the show');

    const outro = this.sessionService.endSession(additionalContext);

    // Try to play the session end sound
    let playedSound = false;
    let soundSuffix = '';

    if (outro.playStinger) {
      const result = await playSessionSound('session-end');
      playedSound = result.played;
      if (!playedSound && result.verbalFallback) {
        soundSuffix = result.verbalFallback;
      }
    }

    const phrase = soundSuffix ? `${outro.phrase}${soundSuffix}` : outro.phrase;

    this.sessionStarted = false;

    return {
      phrase,
      playedSound,
    };
  }

  // ==========================================================================
  // GUEST DJ HANDOFFS
  // ==========================================================================

  /**
   * Get the "Let me get my friend" banter when handing off
   * This is spoken by the DEPARTING persona
   */
  getHandoffBanter(toPersonaId: string): string | null {
    return this.sessionService.getHandoffBanter(this.currentPersonaId, toPersonaId);
  }

  /**
   * Get the "Guest DJ entrance" when arriving
   * This is spoken by the ARRIVING persona
   */
  getGuestEntrance(fromPersonaId: string): string | null {
    return this.sessionService.getGuestDJEntrance(this.currentPersonaId, fromPersonaId);
  }

  /**
   * Full handoff orchestration - gets both banter and entrance
   */
  orchestrateHandoff(
    fromPersonaId: string,
    toPersonaId: string
  ): {
    departingBanter: string | null;
    arrivingEntrance: string | null;
  } {
    // Get departing persona's banter
    const departingBanter = this.sessionService.getHandoffBanter(fromPersonaId, toPersonaId);

    // Update current persona
    this.currentPersonaId = toPersonaId;

    // Get arriving persona's entrance
    const arrivingEntrance = this.sessionService.getGuestDJEntrance(toPersonaId, fromPersonaId);

    log.info('🎧 Orchestrated handoff', {
      from: fromPersonaId,
      to: toPersonaId,
      hasBanter: !!departingBanter,
      hasEntrance: !!arrivingEntrance,
    });

    return {
      departingBanter,
      arrivingEntrance,
    };
  }

  // ==========================================================================
  // MUSIC MOMENTS
  // ==========================================================================

  /**
   * Get a DJ outro when a track is fading
   */
  getDJOutro(trackName?: string, artistName?: string): string {
    return getDJOutroPhrase(trackName, artistName, this.currentPersonaId);
  }

  /**
   * Get a DJ transition phrase when changing tracks
   */
  getDJTransition(currentTrack?: { name: string; artist?: string }, newTrackName?: string): string {
    return getDJTrackChangePhrase(currentTrack, newTrackName, this.currentPersonaId);
  }

  /**
   * Get a DJ "drop" phrase when new track starts after crossfade
   */
  getDJDrop(trackName: string, artistName: string): string {
    return getDJDropPhrase(trackName, artistName, this.currentPersonaId);
  }

  /**
   * Get a mid-song moment phrase ("Wait for it...")
   */
  getMidSongMoment(momentType: 'buildup' | 'drop' | 'highlight', trackName?: string): string {
    return getMidSongMomentPhrase(momentType, trackName, this.currentPersonaId);
  }

  /**
   * Get a music appreciation comment
   * Returns null if we shouldn't comment (based on frequency)
   */
  getMusicAppreciation(track: { name: string; artist: string }): string | null {
    return getMusicAppreciationComment(this.currentPersonaId, track);
  }

  /**
   * Get element-specific appreciation ("That bass line though...")
   */
  getElementAppreciation(): string | null {
    return getMusicElementAppreciation(this.currentPersonaId);
  }

  /**
   * Handle unexpected music stop
   */
  getMusicStoppedResponse(wasPaused = false): string {
    return getMusicStoppedPhrase(this.currentPersonaId, wasPaused);
  }

  // ==========================================================================
  // PROACTIVE MUSIC OFFERS
  // ==========================================================================

  /**
   * Get a spontaneous music offer based on mood/context
   */
  getSpontaneousMusicOffer(options: {
    silenceDurationSec?: number;
    recentMood?: string;
    isAfterEmotionalMoment?: boolean;
  }): string | null {
    return this.sessionService.getSpontaneousOffer(this.currentPersonaId, options);
  }

  /**
   * Get a mood-aware music offer
   */
  getMoodAwareMusicOffer(mood: string): string | null {
    return getMoodAwareMusicOffer(mood, this.currentPersonaId);
  }

  /**
   * Get a music discovery offer ("Want to hear something new?")
   */
  getMusicDiscoveryOffer(): string {
    return getMusicDiscoveryOffer(this.currentPersonaId);
  }

  /**
   * Get contextual music suggestion based on conversation
   */
  getContextualMusicSuggestion(context: {
    topics?: string[];
    mood?: string;
    isHeavyTopic?: boolean;
    isCelebration?: boolean;
    needsFocus?: boolean;
  }): { suggestion: string; genre: string } | null {
    return getContextualMusicSuggestion(context, this.currentPersonaId);
  }

  /**
   * Get queue teaser ("Wait till you hear what's next!")
   */
  getQueueTeaser(): string | null {
    return this.sessionService.getQueueTeaser(this.currentPersonaId);
  }

  // ==========================================================================
  // CROSS-SESSION CALLBACKS
  // ==========================================================================

  /**
   * Get a music memory callback from previous sessions
   */
  getMusicMemoryCallback(musicHistory?: {
    favoriteArtists?: string[];
    favoriteGenres?: string[];
    lastPlayedArtist?: string;
    totalTracksPlayed?: number;
  }): string | null {
    if (!musicHistory) {
      return this.sessionService.getMusicMemoryCallback(this.currentPersonaId);
    }
    return getCrossSessionMusicCallback(this.currentPersonaId, musicHistory);
  }

  /**
   * Get a session callback ("We listened to jazz earlier...")
   */
  getSessionCallback(sessionVibe: { genres: string[]; artists: string[] }): string | null {
    return getSessionCallbackPhrase(sessionVibe, this.currentPersonaId);
  }

  // ==========================================================================
  // READ THE ROOM
  // ==========================================================================

  /**
   * Determine what to do based on user behavior during music
   */
  getReadTheRoomAction(context: {
    userIsSilentDuringMusic?: boolean;
    userIsTalkingDuringMusic?: boolean;
    musicHasBeenPlayingFor?: number;
    userEngagementLevel?: 'high' | 'medium' | 'low';
  }): { action: 'continue' | 'offer_stop' | 'auto_duck' | 'check_in'; phrase?: string } | null {
    return getReadTheRoomAction(context, this.currentPersonaId);
  }

  // ==========================================================================
  // THINKING MUSIC
  // ==========================================================================

  /**
   * Start thinking music during heavy processing
   */
  async startThinkingMusic(): Promise<boolean> {
    return this.sessionService.startThinkingMusic();
  }

  /**
   * Stop thinking music
   */
  async stopThinkingMusic(): Promise<void> {
    return this.sessionService.stopThinkingMusic();
  }

  // ==========================================================================
  // SESSION TRACKING
  // ==========================================================================

  /**
   * Track a topic discussed (for outro callbacks)
   */
  trackTopic(topic: string): void {
    this.sessionService.trackTopic(topic);
  }

  /**
   * Track music played (for outro callbacks)
   */
  trackMusicPlayed(artist: string): void {
    this.sessionService.trackMusicPlayed(artist);
    this.lastMusicPlayedTime = Date.now();
  }

  /**
   * Get DJ style for current persona
   */
  getCurrentDJStyle(): DJPersonaStyle {
    return getDJStyle(this.currentPersonaId);
  }

  /**
   * Update current persona
   */
  setPersona(personaId: string): void {
    this.currentPersonaId = personaId;
  }

  /**
   * Get session summary
   */
  getSessionSummary(): {
    topics: string[];
    musicArtists: string[];
    duration: number;
  } {
    return this.sessionService.getSessionSummary();
  }

  /**
   * Check if music was played recently
   */
  wasRecentMusicPlayed(withinMs = 300000): boolean {
    if (!this.lastMusicPlayedTime) return false;
    return Date.now() - this.lastMusicPlayedTime < withinMs;
  }

  // ==========================================================================
  // MUSIC PLAYER ACCESS
  // ==========================================================================

  /**
   * Check if music is currently playing
   */
  isMusicPlaying(): boolean {
    const player = getMusicPlayer();
    return player.isPlaying();
  }

  /**
   * Get current track info if music is playing
   */
  getCurrentTrack(): { name: string; artist?: string } | null {
    const player = getMusicPlayer();
    if (!player.isPlaying()) return null;
    return player.getCurrentTrack();
  }

  /**
   * Get current music volume
   */
  getMusicVolume(): number {
    const player = getMusicPlayer();
    return player.getVolume();
  }

  // ==========================================================================
  // VERBAL SOUND CUES
  // ==========================================================================

  /**
   * Get a verbal sound cue for a specific moment.
   * Use when actual sound effects aren't available.
   *
   * @param soundType - Type of verbal cue needed
   * @returns Verbal cue phrase or null
   */
  getVerbalSoundCue(
    soundType: 'session-start' | 'session-end' | 'handoff' | 'celebration' | 'acknowledgment'
  ): string | null {
    // Map to valid SessionSoundType
    const soundTypeMap: Record<
      string,
      'session-start' | 'session-end' | 'success' | 'notification' | 'handoff'
    > = {
      'session-start': 'session-start',
      'session-end': 'session-end',
      handoff: 'handoff',
      celebration: 'success',
      acknowledgment: 'notification',
    };
    const mappedType = soundTypeMap[soundType] || 'notification';
    const sound = getVerbalSound(mappedType);
    if (sound) {
      log.debug('🎧 Got verbal sound cue', { type: soundType, persona: this.currentPersonaId });
    }
    return sound;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let orchestratorInstance: DJOrchestrator | null = null;

export function getDJOrchestrator(): DJOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new DJOrchestrator();
  }
  return orchestratorInstance;
}

export function resetDJOrchestrator(): void {
  orchestratorInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

// Re-export key types
export type { SessionContext, SessionIntro, SessionOutro } from './dj-session.service.js';
export type { DJPersonaStyle } from './dj-service.js';

// Re-export key functions for direct use if needed
export {
  getDJStyle,
  getMusicAppreciationComment,
  getMusicElementAppreciation,
} from './dj-service.js';

export {
  getDJOutroPhrase,
  getDJTrackChangePhrase,
  getDJDropPhrase,
  getMidSongMomentPhrase,
} from '../audio/ambient-music.js';

export default getDJOrchestrator;
