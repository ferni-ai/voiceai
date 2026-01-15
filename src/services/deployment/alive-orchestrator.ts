/**
 * 🌟 Alive Orchestrator
 *
 * The central coordination point for all "Ferni feels alive" features.
 * This is what makes Ferni feel like a real person, not just a voice assistant.
 *
 * Coordinates:
 * - Voice → Music Bridge (proactive music offers based on voice)
 * - Active "Our Songs" Callbacks (referencing shared music memories)
 * - Musical Personality Sharing (spontaneous insights about taste)
 * - Game Intelligence Sharing (milestones, insights)
 * - Dynamic Game Intensity (music responds to game state)
 *
 * Philosophy: These features should feel spontaneous and natural,
 * not like a feature checklist. The goal is genuine connection.
 */

import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { GameMemory } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  checkMilestones,
  getPersonalityComment,
  getSongSelectionContext,
  type MilestoneEvent,
  type SongSelectionContext,
} from '../games/game-intelligence.js';
import type { GameResult, GameType } from '../games/types.js';
import { getVoiceMusicBridge, type VoiceMusicSuggestion } from '../musical-you/index.js';
import { getAllOurSongs } from '../trust-systems/our-songs.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface AliveEvent {
  type:
    | 'voice_music_offer'
    | 'our_song_callback'
    | 'musical_personality'
    | 'game_milestone'
    | 'game_intensity_change'
    | 'first_turn_notice';
  phrase: string;
  priority: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
}

export interface AliveOrchestratorState {
  /** Session start time */
  sessionStartTime: number;
  /** Turn count */
  turnCount: number;
  /** Last alive event time */
  lastAliveEventTime: number;
  /** Events fired this session */
  eventsFired: AliveEvent[];
  /** Current game intensity */
  gameIntensity: 'low' | 'medium' | 'high' | 'climax';
  /** Has shared musical personality insight? */
  hasSharedPersonalityInsight: boolean;
  /** Has done "our songs" callback? */
  hasOurSongsCallback: boolean;
  /** Current user emotion */
  currentUserEmotion: string | null;
  /** Last voice analysis */
  lastVoiceAnalysis: VoiceEmotionResult | null;
}

export interface AliveOrchestratorConfig {
  /** User ID for persistent features */
  userId?: string;
  /** Persona ID for style */
  personaId: string;
  /** Session ID */
  sessionId?: string;
  /** Callback to speak */
  speakCallback: (text: string, options?: { allowInterruptions?: boolean }) => void;
  /** Callback to play music */
  playMusicCallback?: (searchQuery: string) => Promise<void>;
  /** Callback to send data messages to frontend (for behavior signals) */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

// ============================================================================
// BEHAVIOR MODE MAPPING
// ============================================================================

/**
 * Map AliveEvent types to appropriate behavior modes
 * This enables the bidirectional behavior system to react to "alive" moments
 */
const ALIVE_EVENT_TO_BEHAVIOR_MODE: Record<AliveEvent['type'], string | null> = {
  voice_music_offer: 'exploration', // Curious, suggesting
  our_song_callback: 'presence', // Warm memory sharing
  musical_personality: 'exploration', // Sharing insights
  game_milestone: 'celebration', // Celebrating achievement!
  game_intensity_change: 'celebration', // Building excitement
  first_turn_notice: 'presence', // Establishing connection
};

// ============================================================================
// CONSTANTS
// ============================================================================

const ALIVE_EVENT_COOLDOWN_MS = 30 * 1000; // 30 seconds between "alive" moments
const MIN_TURNS_FOR_PERSONALITY_SHARE = 5;
const MIN_TURNS_FOR_OUR_SONGS = 3;

// ============================================================================
// ALIVE ORCHESTRATOR CLASS
// ============================================================================

export class AliveOrchestrator {
  private config: AliveOrchestratorConfig;
  private state: AliveOrchestratorState;
  private voiceMusicBridge = getVoiceMusicBridge();

  constructor(config: AliveOrchestratorConfig) {
    this.config = config;
    this.state = this.createInitialState();
    this.voiceMusicBridge.setPersona(config.personaId);

    log.info('🌟 Alive Orchestrator initialized', {
      personaId: config.personaId,
      userId: config.userId,
    });
  }

  private createInitialState(): AliveOrchestratorState {
    return {
      sessionStartTime: Date.now(),
      turnCount: 0,
      lastAliveEventTime: 0,
      eventsFired: [],
      gameIntensity: 'low',
      hasSharedPersonalityInsight: false,
      hasOurSongsCallback: false,
      currentUserEmotion: null,
      lastVoiceAnalysis: null,
    };
  }

  // ==========================================================================
  // MAIN ORCHESTRATION POINTS (Call from voice-agent)
  // ==========================================================================

  /**
   * Called after each user turn to check for "alive" moments
   *
   * @returns AliveEvent if we should fire one, null otherwise
   */
  async onUserTurn(params: {
    userMessage: string;
    voiceEmotion?: VoiceEmotionResult;
    turnCount: number;
    isEmotionalMoment?: boolean;
    recentTopics?: string[];
    gameMemory?: GameMemory;
    isMusicPlaying?: boolean;
  }): Promise<AliveEvent | null> {
    this.state.turnCount = params.turnCount;
    this.state.currentUserEmotion = params.voiceEmotion?.primary || null;
    this.state.lastVoiceAnalysis = params.voiceEmotion || null;

    // Check cooldown
    const timeSinceLastEvent = Date.now() - this.state.lastAliveEventTime;
    if (timeSinceLastEvent < ALIVE_EVENT_COOLDOWN_MS) {
      return null;
    }

    // Don't interrupt emotional moments with "fun" features
    if (params.isEmotionalMoment) {
      return null;
    }

    // Don't offer music if music is already playing
    if (params.isMusicPlaying) {
      // But we can still do personality shares or milestones
      return this.checkNonMusicEvents(params);
    }

    // Priority order for checking
    // 1. Voice-based music offer (highest priority - shows we're paying attention)
    if (params.voiceEmotion) {
      const musicSuggestion = this.voiceMusicBridge.analyzeAndSuggest(params.voiceEmotion);
      if (musicSuggestion?.shouldOffer && musicSuggestion.urgency === 'high') {
        return this.createVoiceMusicEvent(musicSuggestion);
      }
    }

    // 2. "Our Songs" callback (creates connection through shared memory)
    if (!this.state.hasOurSongsCallback && params.turnCount >= MIN_TURNS_FOR_OUR_SONGS) {
      const ourSongEvent = this.checkOurSongsCallback();
      if (ourSongEvent) {
        return ourSongEvent;
      }
    }

    // 3. Musical personality insight (shows we understand them)
    if (
      !this.state.hasSharedPersonalityInsight &&
      params.turnCount >= MIN_TURNS_FOR_PERSONALITY_SHARE &&
      params.gameMemory
    ) {
      const personalityEvent = this.checkMusicalPersonalityShare(params.gameMemory);
      if (personalityEvent) {
        return personalityEvent;
      }
    }

    // 4. Medium-priority voice music offer
    if (params.voiceEmotion) {
      const musicSuggestion = this.voiceMusicBridge.analyzeAndSuggest(params.voiceEmotion);
      if (musicSuggestion?.shouldOffer) {
        return this.createVoiceMusicEvent(musicSuggestion);
      }
    }

    return null;
  }

  /**
   * Called when a game event occurs (answer, milestone, etc.)
   */
  onGameEvent(params: {
    gameType: GameType;
    eventType: 'correct' | 'wrong' | 'streak' | 'game_end';
    gameMemory: GameMemory;
    result?: GameResult;
    currentStreak?: number;
    guessTimeMs?: number;
  }): AliveEvent | null {
    // Check for milestones
    if (params.result || params.eventType === 'game_end') {
      const milestoneEvent = checkMilestones(
        params.gameMemory,
        params.gameType,
        params.result,
        params.guessTimeMs
      );

      if (milestoneEvent) {
        return this.createMilestoneEvent(milestoneEvent);
      }
    }

    // Update game intensity
    const newIntensity = this.calculateGameIntensity(params.currentStreak || 0);
    if (newIntensity !== this.state.gameIntensity) {
      const oldIntensity = this.state.gameIntensity;
      this.state.gameIntensity = newIntensity;

      // Only fire event when intensity increases
      if (this.isIntensityIncrease(oldIntensity, newIntensity)) {
        return this.createIntensityChangeEvent(newIntensity, params.currentStreak || 0);
      }
    }

    return null;
  }

  /**
   * Record that user accepted a voice-music offer
   */
  onMusicOfferAccepted(): void {
    this.voiceMusicBridge.recordAcceptance();
  }

  /**
   * Record that user declined a voice-music offer
   */
  onMusicOfferDeclined(): void {
    this.voiceMusicBridge.recordDecline();
  }

  /**
   * Get song selection context based on game history
   */
  getSongSelectionContext(gameMemory: GameMemory): SongSelectionContext {
    return getSongSelectionContext(gameMemory);
  }

  /**
   * Get state for debugging
   */
  getState(): AliveOrchestratorState {
    return { ...this.state };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.state = this.createInitialState();
    this.voiceMusicBridge.reset();
  }

  // ==========================================================================
  // PRIVATE: EVENT CREATORS
  // ==========================================================================

  private createVoiceMusicEvent(suggestion: VoiceMusicSuggestion): AliveEvent {
    this.recordEvent({
      type: 'voice_music_offer',
      phrase: suggestion.offer,
      priority: suggestion.urgency,
      metadata: {
        searchQuery: suggestion.searchQuery,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
      },
    });

    return this.state.eventsFired[this.state.eventsFired.length - 1];
  }

  private checkOurSongsCallback(): AliveEvent | null {
    if (!this.config.userId) return null;

    try {
      // Get "our songs" for this user
      const ourSongs = getAllOurSongs(this.config.userId);

      if (ourSongs && ourSongs.length > 0) {
        // Pick a random song to callback
        const songMemory = ourSongs[Math.floor(Math.random() * ourSongs.length)];

        const phrases = [
          `You know, I was just thinking about when we listened to "${songMemory.song.name}" by ${songMemory.song.artist}. That was a good moment.`,
          `Remember "${songMemory.song.name}"? That's become kind of our song, hasn't it?`,
          `Speaking of music... I still think about "${songMemory.song.name}". Want to hear it again?`,
          `Hey, remember when we played "${songMemory.song.name}" by ${songMemory.song.artist}? Good times.`,
        ];

        const phrase = phrases[Math.floor(Math.random() * phrases.length)];

        this.state.hasOurSongsCallback = true;

        return this.recordEvent({
          type: 'our_song_callback',
          phrase,
          priority: 'medium',
          metadata: {
            trackName: songMemory.song.name,
            artist: songMemory.song.artist,
            momentType: songMemory.moment.type,
          },
        });
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to get our songs (non-critical)');
    }

    return null;
  }

  private checkMusicalPersonalityShare(gameMemory: GameMemory): AliveEvent | null {
    // Check if we have enough game data
    if ((gameMemory.totalGamesPlayed || 0) < 3) {
      return null;
    }

    // 30% chance to share when conditions are right
    if (Math.random() > 0.3) {
      return null;
    }

    // Get personality comment
    const comment = getPersonalityComment(gameMemory);
    if (!comment) {
      return null;
    }

    this.state.hasSharedPersonalityInsight = true;

    return this.recordEvent({
      type: 'musical_personality',
      phrase: comment,
      priority: 'low',
      metadata: {
        traits: gameMemory.musicalPersonality?.map((t) => t.trait) || [],
      },
    });
  }

  private createMilestoneEvent(milestone: MilestoneEvent): AliveEvent {
    return this.recordEvent({
      type: 'game_milestone',
      phrase: milestone.celebrationMessage,
      priority: 'high',
      metadata: {
        milestoneType: milestone.milestone.type,
        soundEffect: milestone.soundEffect,
      },
    });
  }

  private createIntensityChangeEvent(
    newIntensity: 'low' | 'medium' | 'high' | 'climax',
    streak: number
  ): AliveEvent | null {
    // Only speak for significant intensity changes
    if (newIntensity === 'medium' && streak === 3) {
      return this.recordEvent({
        type: 'game_intensity_change',
        phrase: "You're warming up! Keep it going!",
        priority: 'low',
        metadata: { intensity: newIntensity, streak },
      });
    }

    if (newIntensity === 'high' && streak === 5) {
      return this.recordEvent({
        type: 'game_intensity_change',
        phrase: "🔥 Five in a row! Now we're cooking!",
        priority: 'medium',
        metadata: { intensity: newIntensity, streak },
      });
    }

    if (newIntensity === 'climax' && streak === 8) {
      return this.recordEvent({
        type: 'game_intensity_change',
        phrase: "🚀 EIGHT! You're absolutely crushing it!",
        priority: 'high',
        metadata: { intensity: newIntensity, streak },
      });
    }

    return null;
  }

  // ==========================================================================
  // PRIVATE: HELPERS
  // ==========================================================================

  private checkNonMusicEvents(params: {
    turnCount: number;
    gameMemory?: GameMemory;
  }): AliveEvent | null {
    // Musical personality insight
    if (
      !this.state.hasSharedPersonalityInsight &&
      params.turnCount >= MIN_TURNS_FOR_PERSONALITY_SHARE &&
      params.gameMemory
    ) {
      return this.checkMusicalPersonalityShare(params.gameMemory);
    }

    return null;
  }

  private calculateGameIntensity(streak: number): 'low' | 'medium' | 'high' | 'climax' {
    if (streak >= 8) return 'climax';
    if (streak >= 5) return 'high';
    if (streak >= 3) return 'medium';
    return 'low';
  }

  private isIntensityIncrease(
    old: 'low' | 'medium' | 'high' | 'climax',
    newI: 'low' | 'medium' | 'high' | 'climax'
  ): boolean {
    const order = ['low', 'medium', 'high', 'climax'];
    return order.indexOf(newI) > order.indexOf(old);
  }

  private recordEvent(event: AliveEvent): AliveEvent {
    this.state.lastAliveEventTime = Date.now();
    this.state.eventsFired.push(event);

    log.info(
      {
        type: event.type,
        priority: event.priority,
        phrase: event.phrase.slice(0, 50),
      },
      '🌟 Alive event fired'
    );

    // 🔄 BEHAVIOR SIGNAL INTEGRATION: Emit behavior mode based on event type
    const behaviorMode = ALIVE_EVENT_TO_BEHAVIOR_MODE[event.type];
    if (behaviorMode && this.config.sendDataMessage) {
      void this.config
        .sendDataMessage('behavior_signal', {
          type: 'mode_shift',
          mode: behaviorMode,
          reason: `alive_${event.type}`,
          timestamp: Date.now(),
        })
        .catch((err) => {
          log.debug({ error: String(err) }, 'Failed to emit behavior signal from alive event');
        });
    }

    return event;
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const orchestratorCache = new Map<string, AliveOrchestrator>();

export function getAliveOrchestrator(
  sessionId: string,
  config?: AliveOrchestratorConfig
): AliveOrchestrator {
  if (!orchestratorCache.has(sessionId) && config) {
    orchestratorCache.set(sessionId, new AliveOrchestrator(config));
  }
  return orchestratorCache.get(sessionId)!;
}

export function resetAliveOrchestrator(sessionId: string): void {
  orchestratorCache.get(sessionId)?.reset();
  orchestratorCache.delete(sessionId);
}

export default {
  AliveOrchestrator,
  getAliveOrchestrator,
  resetAliveOrchestrator,
};
