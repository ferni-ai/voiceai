/**
 * 🎧 DJ Integration for Voice Agent
 *
 * This module provides the bridge between the DJ orchestrator and the voice agent.
 * Import this to enable the full radio show experience:
 *
 * - "Open the show" session intros
 * - "Wrap the show" session outros
 * - Guest DJ handoff orchestration
 * - Music memory callbacks
 * - Thinking music
 *
 * Usage in voice-agent.ts:
 *   import { djIntegration } from './dj-integration.js';
 *
 *   // On session start:
 *   const djIntro = await djIntegration.openShow({ personaId, userId, ... });
 *   greeting = djIntro.phrase; // Use instead of or before regular greeting
 *
 *   // On handoff:
 *   const { banter, entrance } = djIntegration.orchestrateHandoff(from, to);
 *
 *   // On session end:
 *   const outro = await djIntegration.wrapShow();
 */

import type { MusicTrack } from '../audio/music-player.js';
import { getVerbalSound } from '../audio/session-sounds.js';
import {
  getDJOrchestrator,
  type SessionContext as DJContext,
  type SessionIntro,
  type SessionOutro,
} from '../services/dj-orchestrator.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// DJ INTEGRATION CLASS
// ============================================================================

/**
 * Integration helper for voice-agent.ts
 * Wraps the DJ orchestrator with voice-agent specific conveniences
 */
class DJIntegration {
  private orchestrator = getDJOrchestrator();
  private sessionActive = false;
  private currentPersonaId = 'ferni';

  constructor() {
    log.info('🎧 DJ Integration initialized');
  }

  // ==========================================================================
  // SESSION LIFECYCLE
  // ==========================================================================

  /**
   * Open the show! Call this at the START of a session, BEFORE the regular greeting.
   *
   * @param context - Session context for personalization
   * @returns Intro phrase to speak (may include SSML for sound effect timing)
   */
  async openShow(context: {
    personaId: string;
    userId?: string;
    userName?: string;
    isFirstSession?: boolean;
    sessionCount?: number;
    lastSessionTime?: Date;
    musicHistory?: {
      favoriteArtists?: string[];
      favoriteGenres?: string[];
      lastPlayedArtist?: string;
      totalTracksPlayed?: number;
    };
    lastSessionTopics?: string[];
  }): Promise<{
    intro: SessionIntro;
    phrase: string;
    shouldReplaceGreeting: boolean;
    playedSound: boolean;
  }> {
    log.info('🎧 Opening the show', { persona: context.personaId, user: context.userId });

    this.sessionActive = true;
    this.currentPersonaId = context.personaId;

    // Determine time of day for context
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    const isWeekend = [0, 6].includes(new Date().getDay());

    // Build full DJ context
    const djContext: DJContext = {
      ...context,
      timeOfDay,
      isWeekend,
    };

    // 🐛 FIX: Don't play session sound here - orchestrator.openTheShow() already handles it!
    // Previously we were playing connect.mp3 TWICE (here + in orchestrator)
    // The orchestrator plays it based on intro.playStinger flag

    // Get intro from orchestrator (this will play the session sound if needed)
    const result = await this.orchestrator.openTheShow(djContext);

    // Determine if this should replace or precede the normal greeting
    // First-time intros and music callbacks should REPLACE the greeting
    const shouldReplaceGreeting =
      context.isFirstSession || (!!context.musicHistory?.lastPlayedArtist && Math.random() < 0.3);

    return {
      intro: {
        phrase: result.phrase,
        playStinger: result.playedSound,
        delayMs: result.delayBeforeSpeakingMs,
        introType: context.isFirstSession
          ? 'first-time'
          : context.musicHistory?.lastPlayedArtist
            ? 'callback'
            : 'returning',
        startAmbient: false,
      },
      phrase: result.phrase,
      shouldReplaceGreeting,
      playedSound: result.playedSound,
    };
  }

  /**
   * Wrap the show! Call this when the session is ending.
   *
   * @param additionalContext - Optional extra context for personalization
   * @returns Outro phrase to speak
   */
  async wrapShow(additionalContext?: { personaId?: string; topics?: string[] }): Promise<{
    outro: SessionOutro;
    phrase: string;
    playedSound: boolean;
  }> {
    log.info('🎧 Wrapping the show');

    // 🐛 FIX: Don't play session sound here - orchestrator.wrapTheShow() already handles it!
    // Previously we were playing disconnect.mp3 TWICE (here + in orchestrator)

    const result = await this.orchestrator.wrapTheShow({
      personaId: additionalContext?.personaId || this.currentPersonaId,
    });

    this.sessionActive = false;

    return {
      outro: {
        phrase: result.phrase,
        playStinger: result.playedSound,
        outroType: 'warm',
      },
      phrase: result.phrase,
      playedSound: result.playedSound,
    };
  }

  /**
   * Get a verbal sound cue for a specific moment.
   * Can be used for acknowledgments, celebrations, etc.
   *
   * @param soundType - Type of verbal sound to get
   * @returns Sound cue phrase or null if not applicable
   */
  getVerbalCue(
    soundType: 'acknowledgment' | 'celebration' | 'transition' | 'thinking'
  ): string | null {
    // Map internal sound types to session sound types
    const soundTypeMap: Record<string, 'success' | 'notification' | 'thinking-start'> = {
      acknowledgment: 'notification',
      celebration: 'success',
      transition: 'notification',
      thinking: 'thinking-start',
    };
    const mappedType = soundTypeMap[soundType] || 'notification';
    const sound = getVerbalSound(mappedType);
    if (sound) {
      log.debug('🎧 Got verbal cue', { type: soundType, sound: sound.slice(0, 30) });
    }
    return sound;
  }

  // ==========================================================================
  // HANDOFFS
  // ==========================================================================

  /**
   * Get handoff banter for the departing persona.
   * This is spoken BEFORE the handoff sound.
   *
   * @param toPersonaId - The persona being handed off TO
   * @returns Banter phrase or null
   */
  getDepartingBanter(toPersonaId: string): string | null {
    return this.orchestrator.getHandoffBanter(toPersonaId);
  }

  /**
   * Get entrance phrase for the arriving persona.
   * This is spoken AFTER the handoff sound.
   *
   * @param fromPersonaId - The persona being handed off FROM
   * @param toPersonaId - The arriving persona
   * @returns Entrance phrase or null
   */
  getArrivingEntrance(fromPersonaId: string, toPersonaId: string): string | null {
    this.currentPersonaId = toPersonaId;
    this.orchestrator.setPersona(toPersonaId);
    return this.orchestrator.getGuestEntrance(fromPersonaId);
  }

  /**
   * Full handoff orchestration - returns both banter and entrance.
   *
   * @param fromPersonaId - Departing persona
   * @param toPersonaId - Arriving persona
   * @returns Object with both phrases
   */
  orchestrateHandoff(
    fromPersonaId: string,
    toPersonaId: string
  ): {
    departingBanter: string | null;
    arrivingEntrance: string | null;
    /** Combined phrase for a seamless handoff (banter + entrance) */
    combinedPhrase: string | null;
  } {
    const result = this.orchestrator.orchestrateHandoff(fromPersonaId, toPersonaId);
    this.currentPersonaId = toPersonaId;

    // Create combined phrase if both exist
    let combinedPhrase: string | null = null;
    if (result.departingBanter && result.arrivingEntrance) {
      // Add a dramatic pause between banter and entrance
      combinedPhrase = `${result.departingBanter}<break time="800ms"/>${result.arrivingEntrance}`;
    } else if (result.arrivingEntrance) {
      combinedPhrase = result.arrivingEntrance;
    }

    return {
      ...result,
      combinedPhrase,
    };
  }

  // ==========================================================================
  // MUSIC MOMENTS
  // ==========================================================================

  /**
   * Get DJ outro when a track is fading.
   * Call this from music state change callback when state === 'fading'.
   */
  getDJOutro(track?: MusicTrack): string {
    return this.orchestrator.getDJOutro(track?.name, track?.artist);
  }

  /**
   * Get DJ transition phrase when changing tracks.
   * Call this from music state change callback when state === 'changing'.
   */
  getDJTransition(currentTrack?: MusicTrack, newTrackName?: string): string {
    return this.orchestrator.getDJTransition(
      currentTrack ? { name: currentTrack.name, artist: currentTrack.artist } : undefined,
      newTrackName
    );
  }

  /**
   * Get DJ drop phrase when new track starts.
   */
  getDJDrop(track: MusicTrack): string {
    return this.orchestrator.getDJDrop(track.name, track.artist);
  }

  /**
   * Get mid-song moment phrase.
   */
  getMidSongMoment(momentType: 'buildup' | 'drop' | 'highlight', trackName?: string): string {
    return this.orchestrator.getMidSongMoment(momentType, trackName);
  }

  /**
   * Get music appreciation comment.
   */
  getMusicAppreciation(track: MusicTrack): string | null {
    return this.orchestrator.getMusicAppreciation({
      name: track.name,
      artist: track.artist,
    });
  }

  /**
   * Handle unexpected music stop.
   */
  getMusicStoppedResponse(wasPaused = false): string {
    return this.orchestrator.getMusicStoppedResponse(wasPaused);
  }

  // ==========================================================================
  // PROACTIVE MUSIC OFFERS
  // ==========================================================================

  /**
   * Get a spontaneous music offer.
   * Good to call during silences or after emotional moments.
   */
  getSpontaneousMusicOffer(options: {
    silenceDurationSec?: number;
    recentMood?: string;
    isAfterEmotionalMoment?: boolean;
  }): string | null {
    return this.orchestrator.getSpontaneousMusicOffer(options);
  }

  /**
   * Get a mood-aware music offer.
   */
  getMoodAwareMusicOffer(mood: string): string | null {
    return this.orchestrator.getMoodAwareMusicOffer(mood);
  }

  /**
   * Get music discovery offer.
   */
  getMusicDiscoveryOffer(): string {
    return this.orchestrator.getMusicDiscoveryOffer();
  }

  /**
   * Get contextual music suggestion.
   */
  getContextualMusicSuggestion(context: {
    topics?: string[];
    mood?: string;
    isHeavyTopic?: boolean;
    isCelebration?: boolean;
    needsFocus?: boolean;
  }): { suggestion: string; genre: string } | null {
    return this.orchestrator.getContextualMusicSuggestion(context);
  }

  /**
   * Get queue teaser.
   */
  getQueueTeaser(): string | null {
    return this.orchestrator.getQueueTeaser();
  }

  // ==========================================================================
  // CROSS-SESSION MEMORY
  // ==========================================================================

  /**
   * Get a music memory callback.
   * Returns a phrase like "You know I remember you love Fleetwood Mac!"
   */
  getMusicMemoryCallback(musicHistory?: {
    favoriteArtists?: string[];
    favoriteGenres?: string[];
    lastPlayedArtist?: string;
    totalTracksPlayed?: number;
  }): string | null {
    return this.orchestrator.getMusicMemoryCallback(musicHistory);
  }

  /**
   * Get session callback.
   */
  getSessionCallback(sessionVibe: { genres: string[]; artists: string[] }): string | null {
    return this.orchestrator.getSessionCallback(sessionVibe);
  }

  // ==========================================================================
  // THINKING MUSIC
  // ==========================================================================

  /**
   * Start thinking music during heavy processing.
   */
  async startThinkingMusic(): Promise<boolean> {
    return this.orchestrator.startThinkingMusic();
  }

  /**
   * Stop thinking music.
   */
  async stopThinkingMusic(): Promise<void> {
    return this.orchestrator.stopThinkingMusic();
  }

  // ==========================================================================
  // TRACKING
  // ==========================================================================

  /**
   * Track a topic discussed.
   */
  trackTopic(topic: string): void {
    this.orchestrator.trackTopic(topic);
  }

  /**
   * Track music played.
   */
  trackMusicPlayed(artist: string): void {
    this.orchestrator.trackMusicPlayed(artist);
  }

  /**
   * Get session summary.
   */
  getSessionSummary(): { topics: string[]; musicArtists: string[]; duration: number } {
    return this.orchestrator.getSessionSummary();
  }

  /**
   * Update current persona.
   */
  setPersona(personaId: string): void {
    this.currentPersonaId = personaId;
    this.orchestrator.setPersona(personaId);
  }

  // ==========================================================================
  // READ THE ROOM
  // ==========================================================================

  /**
   * Determine appropriate action based on user behavior during music.
   */
  getReadTheRoomAction(context: {
    userIsSilentDuringMusic?: boolean;
    userIsTalkingDuringMusic?: boolean;
    musicHasBeenPlayingFor?: number;
    userEngagementLevel?: 'high' | 'medium' | 'low';
  }): { action: 'continue' | 'offer_stop' | 'auto_duck' | 'check_in'; phrase?: string } | null {
    return this.orchestrator.getReadTheRoomAction(context);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let djIntegrationInstance: DJIntegration | null = null;

export function getDJIntegration(): DJIntegration {
  if (!djIntegrationInstance) {
    djIntegrationInstance = new DJIntegration();
  }
  return djIntegrationInstance;
}

export function resetDJIntegration(): void {
  djIntegrationInstance = null;
}

// Convenience export
export const djIntegration = {
  get: getDJIntegration,
  reset: resetDJIntegration,

  // Expose key methods directly for ease of use
  openShow: async (context: Parameters<DJIntegration['openShow']>[0]) =>
    getDJIntegration().openShow(context),
  wrapShow: async (context?: Parameters<DJIntegration['wrapShow']>[0]) =>
    getDJIntegration().wrapShow(context),
  orchestrateHandoff: (from: string, to: string) => getDJIntegration().orchestrateHandoff(from, to),
  getDepartingBanter: (to: string) => getDJIntegration().getDepartingBanter(to),
  getArrivingEntrance: (from: string, to: string) =>
    getDJIntegration().getArrivingEntrance(from, to),
  getDJOutro: (track?: MusicTrack) => getDJIntegration().getDJOutro(track),
  getDJTransition: (current?: MusicTrack, newName?: string) =>
    getDJIntegration().getDJTransition(current, newName),
  getMusicMemoryCallback: (history?: Parameters<DJIntegration['getMusicMemoryCallback']>[0]) =>
    getDJIntegration().getMusicMemoryCallback(history),
  startThinkingMusic: async () => getDJIntegration().startThinkingMusic(),
  stopThinkingMusic: async () => getDJIntegration().stopThinkingMusic(),
  trackTopic: (topic: string) => getDJIntegration().trackTopic(topic),
  trackMusicPlayed: (artist: string) => getDJIntegration().trackMusicPlayed(artist),
  setPersona: (id: string) => getDJIntegration().setPersona(id),
};

export default djIntegration;
