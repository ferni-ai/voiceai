/**
 * 🎧 DJ Enhancements - Pixar-Level Music Magic
 *
 * This module adds advanced DJ capabilities beyond basic playback:
 *
 * Phase 2: Predictive Timing - Know when songs end, countdown awareness
 * Phase 3: Persona DJ Styles - Each character has unique DJ personality
 * Phase 4: Thinking Music - Ambient during processing silences
 * Phase 5: Emotion-Reactive - Music responds to user's mood
 * Phase 6: Game Music - Specialized audio for games
 * Phase 7: Session Flow - Full radio show experience
 * Phase 8: Cross-Session Memory - Learn preferences over time
 */

import { getLogger } from '../utils/safe-logger.js';
import { getRandomAmbientTrack, playAmbientMusic, stopAmbientMusic } from './ambient-music.js';
import { getMusicPlayer, type MusicTrack } from './music-player.js';

const log = getLogger();

// ============================================================================
// PHASE 2: PREDICTIVE MUSIC TIMING
// ============================================================================

export interface TrackTimingCallbacks {
  /** Called when track has ~30 seconds left */
  on30SecondsLeft?: (track: MusicTrack) => void;
  /** Called when track has ~15 seconds left */
  on15SecondsLeft?: (track: MusicTrack) => void;
  /** Called when track has ~5 seconds left (DJ outro time) */
  on5SecondsLeft?: (track: MusicTrack) => void;
  /** Called when track is about to end (last 2 seconds) */
  onAboutToEnd?: (track: MusicTrack) => void;
}

/**
 * Predictive timing phrases for countdown moments
 */
const COUNTDOWN_PHRASES = {
  thirtySeconds: {
    ferni: [
      "We've got about 30 seconds left on this one...",
      'Coming up on the end of this track...',
      "Winding down here, but don't worry, I've got more...",
    ],
    jack: [
      'This one is almost done... let it sink in.',
      'Coming to a close... take what resonates.',
      'Nearly there... sometimes the ending is the best part.',
    ],
    peter: [
      'Approximately 30 seconds remaining on this track.',
      'Track nearing completion... should I queue another?',
      "We're in the final stretch here.",
    ],
    maya: [
      "Quick heads up - about 30 seconds left! What's next?",
      'Almost done with this one! Ready for more?',
      'This banger is wrapping up soon!',
    ],
    alex: [
      "We're coming up on the end of this selection.",
      'About 30 seconds remaining... shall I continue?',
      'This track is concluding shortly.',
    ],
    jordan: [
      "Party alert: this song's wrapping up in 30!",
      "Get ready, we're about to transition!",
      "30 seconds out - what's the vibe for next?",
    ],
  },

  fifteenSeconds: {
    ferni: [
      'Just a few more moments...',
      'Here comes the ending...',
      "Almost there... how'd you like this one?",
    ],
    jack: ['Let it wash over you...', 'The final notes...', 'Breathe it in...'],
    peter: ['15 seconds remaining.', 'Track conclusion imminent.', 'Preparing for transition.'],
    maya: ['Here we go, almost done!', 'Get ready for the next one!', 'Final stretch!'],
    alex: ['Concluding momentarily.', 'Transition approaching.', 'Nearly complete.'],
    jordan: [
      'Here comes the drop... into the next song!',
      '5, 4, 3... just kidding, 15 seconds!',
      'Building up to the transition!',
    ],
  },

  fiveSeconds: {
    ferni: ['And... that was lovely.', 'Beautiful.', 'Hope you enjoyed that one.'],
    jack: ['And so it ends... for now.', 'Until the music returns.', 'Well played.'],
    peter: ['Track complete.', 'Playback concluded.', 'End of selection.'],
    maya: ['And done! What a ride!', 'Boom! Nailed it!', 'That was fire, right?'],
    alex: ['Selection complete.', 'Concluded successfully.', 'Track finished.'],
    jordan: ['Aaand scene!', 'That was a vibe!', 'Drop the mic!'],
  },
};

/**
 * Get countdown phrase for a specific moment
 */
export function getCountdownPhrase(
  moment: 'thirtySeconds' | 'fifteenSeconds' | 'fiveSeconds',
  personaId: string
): string {
  const normalizedId = personaId.toLowerCase().replace(/[^a-z]/g, '');
  const phrases = COUNTDOWN_PHRASES[moment];

  // Find matching persona or default to ferni
  const personaKey =
    (Object.keys(phrases).find((key) => normalizedId.includes(key)) as keyof typeof phrases) ||
    'ferni';

  const personaPhrases = phrases[personaKey];
  return personaPhrases[Math.floor(Math.random() * personaPhrases.length)];
}

/**
 * Schedule predictive timing callbacks for a track
 */
export function scheduleTrackTimingCallbacks(
  track: MusicTrack,
  callbacks: TrackTimingCallbacks
): () => void {
  const timers: NodeJS.Timeout[] = [];
  // Use ?? for proper nullish coalescing (0 is valid duration)
  const duration = track.duration ?? 30000;

  // 30 seconds left
  if (duration > 35000 && callbacks.on30SecondsLeft) {
    const time30 = duration - 30000;
    timers.push(
      setTimeout(() => {
        callbacks.on30SecondsLeft!(track);
      }, time30)
    );
  }

  // 15 seconds left
  if (duration > 20000 && callbacks.on15SecondsLeft) {
    const time15 = duration - 15000;
    timers.push(
      setTimeout(() => {
        callbacks.on15SecondsLeft!(track);
      }, time15)
    );
  }

  // 5 seconds left
  if (duration > 8000 && callbacks.on5SecondsLeft) {
    const time5 = duration - 5000;
    timers.push(
      setTimeout(() => {
        callbacks.on5SecondsLeft!(track);
      }, time5)
    );
  }

  // About to end (2 seconds)
  if (duration > 3000 && callbacks.onAboutToEnd) {
    const timeEnd = duration - 2000;
    timers.push(
      setTimeout(() => {
        callbacks.onAboutToEnd!(track);
      }, timeEnd)
    );
  }

  log.debug('Scheduled track timing callbacks', {
    track: track.name,
    duration: Math.round(duration / 1000),
    callbackCount: timers.length,
  });

  // Return cleanup function
  return () => {
    timers.forEach((t) => clearTimeout(t));
  };
}

// ============================================================================
// PHASE 3: PERSONA-SPECIFIC DJ STYLES
// ============================================================================

export interface PersonaDJStyle {
  /** How this persona introduces music */
  introStyle: 'warm' | 'energetic' | 'analytical' | 'mentor' | 'professional' | 'playful';
  /** Typical comment frequency (lower = more comments) */
  commentFrequency: number;
  /** Preferred music tempo */
  preferredTempo: 'slow' | 'medium' | 'upbeat' | 'any';
  /** How they handle silence */
  silenceApproach: 'fill-immediately' | 'wait-for-moment' | 'ask-first' | 'ambient-only';
  /** Timing multiplier (slower = more deliberate) */
  timingMultiplier: number;
  /** Transition style */
  transitionStyle: 'smooth' | 'quick' | 'dramatic' | 'natural';
}

/**
 * DJ styles for each persona
 */
export const PERSONA_DJ_STYLES: Record<string, PersonaDJStyle> = {
  ferni: {
    introStyle: 'warm',
    commentFrequency: 0.3,
    preferredTempo: 'any',
    silenceApproach: 'wait-for-moment',
    timingMultiplier: 1.0,
    transitionStyle: 'smooth',
  },
  jack: {
    introStyle: 'mentor',
    commentFrequency: 0.2,
    preferredTempo: 'slow',
    silenceApproach: 'ambient-only',
    timingMultiplier: 1.3, // More deliberate
    transitionStyle: 'natural',
  },
  peter: {
    introStyle: 'analytical',
    commentFrequency: 0.15,
    preferredTempo: 'medium',
    silenceApproach: 'ask-first',
    timingMultiplier: 1.0,
    transitionStyle: 'quick',
  },
  maya: {
    introStyle: 'energetic',
    commentFrequency: 0.4,
    preferredTempo: 'upbeat',
    silenceApproach: 'fill-immediately',
    timingMultiplier: 0.8, // Faster
    transitionStyle: 'dramatic',
  },
  alex: {
    introStyle: 'professional',
    commentFrequency: 0.15,
    preferredTempo: 'medium',
    silenceApproach: 'ask-first',
    timingMultiplier: 1.1,
    transitionStyle: 'smooth',
  },
  jordan: {
    introStyle: 'playful',
    commentFrequency: 0.5,
    preferredTempo: 'upbeat',
    silenceApproach: 'fill-immediately',
    timingMultiplier: 0.7, // Very fast
    transitionStyle: 'dramatic',
  },
  nayan: {
    introStyle: 'mentor',
    commentFrequency: 0.2,
    preferredTempo: 'slow',
    silenceApproach: 'wait-for-moment',
    timingMultiplier: 1.2,
    transitionStyle: 'natural',
  },
};

/**
 * Get DJ style for a persona
 */
export function getPersonaDJStyle(personaId: string): PersonaDJStyle {
  const normalizedId = personaId.toLowerCase().replace(/[^a-z]/g, '');
  const matchingKey = Object.keys(PERSONA_DJ_STYLES).find((key) => normalizedId.includes(key));
  return PERSONA_DJ_STYLES[matchingKey || 'ferni'];
}

/**
 * Persona-specific music intro phrases
 */
const PERSONA_MUSIC_INTROS: Record<string, string[]> = {
  ferni: [
    "Here's something I think you'll love...",
    'Let me set the mood...',
    'How about a little music?',
    "I've got just the thing...",
    'Music time!',
  ],
  jack: [
    'Let this wash over you...',
    'Close your eyes and listen...',
    'Sometimes music says what words cannot...',
    'A gift for your ears...',
  ],
  peter: [
    'Based on your preferences, this should resonate.',
    "I've selected an optimal track.",
    'Algorithmically curated for this moment.',
    'A data-driven selection.',
  ],
  maya: [
    "Let's gooo! Energy incoming!",
    'Time to pump it up!',
    'Okay but this song SLAPS!',
    'Get ready to vibe!',
  ],
  alex: [
    'Allow me to set the appropriate atmosphere.',
    "I've prepared something suitable.",
    'For your listening pleasure.',
    'A refined selection.',
  ],
  jordan: [
    'DJ Jordan in the house!',
    'Drop the beat!',
    'Party mode: ACTIVATED!',
    "This one's gonna be good!",
  ],
  nayan: [
    'Listen with intention...',
    'Let the music guide you...',
    'A soundscape for reflection...',
    'Close your eyes...',
  ],
};

/**
 * Get a music intro phrase for a persona
 */
export function getPersonaMusicIntro(personaId: string): string {
  const normalizedId = personaId.toLowerCase().replace(/[^a-z]/g, '');
  const matchingKey = Object.keys(PERSONA_MUSIC_INTROS).find((key) => normalizedId.includes(key));
  const intros = PERSONA_MUSIC_INTROS[matchingKey || 'ferni'];
  return intros[Math.floor(Math.random() * intros.length)];
}

// ============================================================================
// PHASE 4: THINKING MUSIC
// ============================================================================

export interface ThinkingMusicConfig {
  /** Delay before starting thinking music (ms) */
  startDelay: number;
  /** Target volume for thinking music */
  volume: number;
  /** Fade in duration (ms) */
  fadeInDuration: number;
  /** Fade out duration (ms) */
  fadeOutDuration: number;
  /** Maximum duration before auto-stop (ms) */
  maxDuration: number;
}

const DEFAULT_THINKING_CONFIG: ThinkingMusicConfig = {
  startDelay: 3000, // 3 seconds of silence before starting
  volume: 0.08, // Very quiet
  fadeInDuration: 2000,
  fadeOutDuration: 500,
  maxDuration: 60000, // Max 1 minute
};

/**
 * Thinking Music Controller
 * Manages subtle ambient music during processing silences
 */
export class ThinkingMusicController {
  private config: ThinkingMusicConfig;
  private isPlaying = false;
  private startTimer: NodeJS.Timeout | null = null;
  private maxDurationTimer: NodeJS.Timeout | null = null;
  private personaId = 'ferni';
  private currentVolume = 0;

  constructor(config: Partial<ThinkingMusicConfig> = {}) {
    this.config = { ...DEFAULT_THINKING_CONFIG, ...config };
    log.debug('ThinkingMusicController initialized', this.config);
  }

  /**
   * Set current persona (affects thinking music style)
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;

    // Adjust config based on persona DJ style
    const style = getPersonaDJStyle(personaId);
    if (style.silenceApproach === 'fill-immediately') {
      this.config.startDelay = 2000;
    } else if (style.silenceApproach === 'wait-for-moment') {
      this.config.startDelay = 5000;
    } else if (style.silenceApproach === 'ambient-only') {
      this.config.startDelay = 8000;
    }
  }

  /**
   * Signal that a processing silence has started
   * Call this when the agent is "thinking" (tool execution, LLM processing)
   */
  onProcessingStart(): void {
    if (this.isPlaying) return;

    // Clear any existing timer
    this.clearTimers();

    // Schedule thinking music start
    this.startTimer = setTimeout(() => {
      void this.startThinkingMusic();
    }, this.config.startDelay);

    log.debug('Thinking music scheduled', {
      delayMs: this.config.startDelay,
      persona: this.personaId,
    });
  }

  /**
   * Signal that processing has ended
   * Call this when the agent is about to speak
   */
  onProcessingEnd(): void {
    this.clearTimers();

    if (this.isPlaying) {
      this.stopThinkingMusic();
    }
  }

  /**
   * Force stop thinking music immediately
   */
  forceStop(): void {
    this.clearTimers();
    if (this.isPlaying) {
      const player = getMusicPlayer();
      player.stop();
      this.isPlaying = false;
    }
  }

  /**
   * Check if thinking music is currently playing
   */
  isThinkingMusicPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Called externally when ambient/thinking music ends naturally
   * This ensures isPlaying flag is properly reset even when track completes
   */
  onMusicEnded(): void {
    this.clearTimers();
    this.isPlaying = false;
    this.currentVolume = 0;
    log.debug('Thinking music ended naturally - state reset');
  }

  private async startThinkingMusic(): Promise<void> {
    const player = getMusicPlayer();

    // Don't start if regular music is playing
    if (player.isPlaying()) {
      log.debug('Skipping thinking music - regular music is playing');
      return;
    }

    // Get an ambient track
    const track = getRandomAmbientTrack();
    if (!track || !track.previewUrl) {
      // Try to play from ambient music system
      const success = await playAmbientMusic();
      if (success) {
        this.isPlaying = true;
        this.setupMaxDurationTimer();
        this.setupNaturalEndMonitor(); // Monitor for natural end
        log.info('Started thinking music via ambient system');
      }
      return;
    }

    // NOTE: BackgroundAudioPlayer doesn't support real-time volume changes,
    // so we can't fade in. Set the target volume before playing.
    player.setVolume(this.config.volume);
    this.currentVolume = this.config.volume;

    const success = await player.playFromUrl(track.previewUrl, track, true);
    if (!success) {
      player.setVolume(0.5); // Restore default
      this.currentVolume = 0.5;
      return;
    }

    this.isPlaying = true;

    // Setup max duration timer
    this.setupMaxDurationTimer();

    // Monitor for natural track end
    this.setupNaturalEndMonitor();

    log.info('Started thinking music', {
      track: track.name,
      volume: this.config.volume,
    });
  }

  /**
   * Monitor music player state to detect when thinking music ends naturally.
   * Uses event emitter pattern instead of polling for better efficiency.
   */
  private stateChangeListener: ((state: string) => void) | null = null;

  private setupNaturalEndMonitor(): void {
    // Clear any existing listener
    this.clearStateChangeListener();

    const player = getMusicPlayer();

    // 🎧 Use event emitter instead of polling (more efficient)
    this.stateChangeListener = (state: string) => {
      if (this.isPlaying && (state === 'stopped' || state === 'idle')) {
        // Music ended naturally - reset state
        log.debug('Thinking music detected as ended (event listener)');
        this.onMusicEnded();
      }
    };

    // Register the listener
    player.on('stateChange', this.stateChangeListener as (state: string, track: unknown, isAmbient: boolean) => void);
  }

  private clearStateChangeListener(): void {
    if (this.stateChangeListener) {
      try {
        const player = getMusicPlayer();
        player.off('stateChange', this.stateChangeListener as (state: string, track: unknown, isAmbient: boolean) => void);
      } catch {
        // Player might not be initialized
      }
      this.stateChangeListener = null;
    }
  }

  private stopThinkingMusic(): void {
    if (!this.isPlaying) return;

    // NOTE: BackgroundAudioPlayer doesn't support real-time volume changes,
    // so we can't actually fade. Instead, we stop immediately.
    // The ambient music system handles this gracefully.
    stopAmbientMusic();
    this.isPlaying = false;
    this.currentVolume = 0;

    log.debug('Stopped thinking music (immediate stop - fade not supported)');
  }

  private setupMaxDurationTimer(): void {
    this.maxDurationTimer = setTimeout(() => {
      log.info('Thinking music max duration reached, stopping');
      this.stopThinkingMusic();
    }, this.config.maxDuration);
  }

  private clearTimers(): void {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    // Clear natural end state change listener
    this.clearStateChangeListener();
  }
}

// ============================================================================
// PHASE 5: EMOTION-REACTIVE MUSIC
// ============================================================================

export interface EmotionMusicMapping {
  /** Suggested genres for this emotion */
  genres: string[];
  /** Music offer phrase */
  offerPhrase: string;
  /** Music search queries */
  searchQueries: string[];
  /** Tempo preference */
  tempo: 'slow' | 'medium' | 'upbeat';
}

const EMOTION_MUSIC_MAP: Record<string, EmotionMusicMapping> = {
  sad: {
    genres: ['acoustic', 'piano', 'indie folk'],
    offerPhrase: 'Want me to put on something soothing? Sometimes music helps...',
    searchQueries: ['comforting acoustic', 'gentle piano', 'healing music'],
    tempo: 'slow',
  },
  anxious: {
    genres: ['ambient', 'lo-fi', 'nature sounds'],
    offerPhrase: "Would some calming music help? I've got just the thing...",
    searchQueries: ['calming ambient', 'anxiety relief music', 'peaceful sounds'],
    tempo: 'slow',
  },
  happy: {
    genres: ['pop', 'indie', 'feel-good'],
    offerPhrase: 'I love that energy! Want some music to match?',
    searchQueries: ['feel good hits', 'happy music', 'upbeat pop'],
    tempo: 'upbeat',
  },
  excited: {
    genres: ['electronic', 'dance', 'pop'],
    offerPhrase: "Your energy is contagious! Let's get some music going!",
    searchQueries: ['hype music', 'energy boost', 'pump up songs'],
    tempo: 'upbeat',
  },
  tired: {
    genres: ['chill', 'lo-fi', 'soft'],
    offerPhrase: 'Sounds like you could use some chill background music...',
    searchQueries: ['relaxing chill', 'wind down music', 'soft acoustic'],
    tempo: 'slow',
  },
  focused: {
    genres: ['lo-fi', 'instrumental', 'ambient'],
    offerPhrase: "I can put on some focus music if you'd like - no lyrics to distract.",
    searchQueries: ['focus music', 'study beats', 'concentration'],
    tempo: 'medium',
  },
  frustrated: {
    genres: ['rock', 'alternative', 'indie'],
    offerPhrase: "Want to blow off some steam with music? I've got options...",
    searchQueries: ['stress relief rock', 'cathartic music', 'release energy'],
    tempo: 'upbeat',
  },
  neutral: {
    genres: ['indie', 'acoustic', 'mixed'],
    offerPhrase: 'How about some music to set the mood?',
    searchQueries: ['good vibes', 'easy listening', 'background music'],
    tempo: 'medium',
  },
};

/**
 * Get music suggestion based on detected emotion
 */
export function getEmotionMusicSuggestion(emotion: string): EmotionMusicMapping {
  const normalizedEmotion = emotion.toLowerCase();
  return EMOTION_MUSIC_MAP[normalizedEmotion] || EMOTION_MUSIC_MAP.neutral;
}

/**
 * Get an emotion-appropriate music offer phrase
 */
export function getEmotionMusicOffer(
  emotion: string,
  personaId: string
): { offer: string; searchQuery: string } {
  const mapping = getEmotionMusicSuggestion(emotion);
  const style = getPersonaDJStyle(personaId);

  // Adjust offer based on persona style
  let offer = mapping.offerPhrase;
  if (style.introStyle === 'analytical') {
    offer = `Based on your current state, I'd recommend some ${mapping.genres[0]} music. ${mapping.offerPhrase}`;
  } else if (style.introStyle === 'mentor') {
    offer = `Music can be healing. ${mapping.offerPhrase}`;
  } else if (style.introStyle === 'energetic') {
    offer = `Oooh, I know just what you need! ${mapping.offerPhrase}`;
  }

  const searchQuery =
    mapping.searchQueries[Math.floor(Math.random() * mapping.searchQueries.length)];

  return { offer, searchQuery };
}

// ============================================================================
// PHASE 6: GAME MUSIC INTEGRATION
// ============================================================================

export interface GameMusicConfig {
  /** Background music for the game */
  backgroundGenre: string;
  /** Sound effect for correct answer */
  correctSound: 'ding' | 'chime' | 'celebration';
  /** Sound effect for wrong answer */
  wrongSound: 'buzz' | 'gentle' | 'encouraging';
  /** Whether to use countdown music */
  useCountdown: boolean;
  /** Volume level for game music */
  volume: number;
}

const GAME_MUSIC_CONFIGS: Record<string, GameMusicConfig> = {
  'name-that-tune': {
    backgroundGenre: 'game show',
    correctSound: 'celebration',
    wrongSound: 'encouraging',
    useCountdown: true,
    volume: 0.3,
  },
  trivia: {
    backgroundGenre: 'quiz show',
    correctSound: 'ding',
    wrongSound: 'gentle',
    useCountdown: true,
    volume: 0.25,
  },
  'word-game': {
    backgroundGenre: 'light jazz',
    correctSound: 'chime',
    wrongSound: 'gentle',
    useCountdown: false,
    volume: 0.2,
  },
  memory: {
    backgroundGenre: 'ambient',
    correctSound: 'chime',
    wrongSound: 'gentle',
    useCountdown: false,
    volume: 0.15,
  },
};

/**
 * Get music config for a game type
 */
export function getGameMusicConfig(gameType: string): GameMusicConfig {
  return (
    GAME_MUSIC_CONFIGS[gameType] || {
      backgroundGenre: 'upbeat',
      correctSound: 'ding',
      wrongSound: 'gentle',
      useCountdown: false,
      volume: 0.25,
    }
  );
}

/**
 * Game music event phrases
 */
const GAME_MUSIC_PHRASES = {
  gameStart: ["Let's get this game going! 🎮", 'Game time! Ready?', 'Here we go!'],
  correctAnswer: ['Yes! Nice one!', 'You got it!', "That's right!", 'Boom! Correct!'],
  wrongAnswer: ['Ooh, not quite!', "Almost! It's okay!", 'Good try! Next one!'],
  highScore: [
    "NEW HIGH SCORE! You're amazing!",
    'Incredible! A new record!',
    "You crushed it! That's your best!",
  ],
  gameEnd: [
    'Great game! That was fun!',
    'And that wraps it up! How did that feel?',
    'Game over! You did great!',
  ],
};

/**
 * Get a game music phrase
 */
export function getGameMusicPhrase(
  event: 'gameStart' | 'correctAnswer' | 'wrongAnswer' | 'highScore' | 'gameEnd'
): string {
  const phrases = GAME_MUSIC_PHRASES[event];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// PHASE 7: SESSION FLOW (RADIO SHOW EXPERIENCE)
// ============================================================================

export interface SessionFlowState {
  /** Session start time */
  startTime: number;
  /** Topics discussed */
  topics: string[];
  /** Music artists played */
  artistsPlayed: string[];
  /** Emotional moments detected */
  emotionalMoments: Array<{ time: number; emotion: string }>;
  /** Games played */
  gamesPlayed: string[];
  /** Handoffs that occurred */
  handoffs: Array<{ from: string; to: string; time: number }>;
}

/**
 * Session flow manager for radio show experience
 */
export class SessionFlowManager {
  private state: SessionFlowState;
  private personaId = 'ferni';

  constructor() {
    this.state = {
      startTime: Date.now(),
      topics: [],
      artistsPlayed: [],
      emotionalMoments: [],
      gamesPlayed: [],
      handoffs: [],
    };
  }

  setPersona(personaId: string): void {
    this.personaId = personaId;
  }

  trackTopic(topic: string): void {
    if (!this.state.topics.includes(topic)) {
      this.state.topics.push(topic);
    }
  }

  trackArtist(artist: string): void {
    if (!this.state.artistsPlayed.includes(artist)) {
      this.state.artistsPlayed.push(artist);
    }
  }

  trackEmotion(emotion: string): void {
    this.state.emotionalMoments.push({
      time: Date.now(),
      emotion,
    });
  }

  trackGame(gameType: string): void {
    if (!this.state.gamesPlayed.includes(gameType)) {
      this.state.gamesPlayed.push(gameType);
    }
  }

  trackHandoff(fromPersona: string, toPersona: string): void {
    this.state.handoffs.push({
      from: fromPersona,
      to: toPersona,
      time: Date.now(),
    });
  }

  /**
   * Generate session summary for outro
   */
  generateSummary(): string {
    const durationMinutes = Math.round((Date.now() - this.state.startTime) / 60000);

    const parts: string[] = [];

    // Duration
    if (durationMinutes >= 2) {
      parts.push(`We spent about ${durationMinutes} minutes together`);
    }

    // Topics
    if (this.state.topics.length > 0) {
      const topTopics = this.state.topics.slice(0, 3);
      parts.push(`talked about ${topTopics.join(', ')}`);
    }

    // Music
    if (this.state.artistsPlayed.length > 0) {
      const topArtists = this.state.artistsPlayed.slice(0, 2);
      parts.push(`listened to some ${topArtists.join(' and ')}`);
    }

    // Games
    if (this.state.gamesPlayed.length > 0) {
      parts.push(`played ${this.state.gamesPlayed.join(' and ')}`);
    }

    // Handoffs
    if (this.state.handoffs.length > 0) {
      const uniquePersonas = [
        ...new Set(this.state.handoffs.flatMap((h) => [h.from, h.to])),
      ].filter((p) => p !== this.personaId);
      if (uniquePersonas.length > 0) {
        parts.push(`you met ${uniquePersonas.join(' and ')}`);
      }
    }

    if (parts.length === 0) {
      return 'It was nice spending time with you.';
    }

    return `${parts.join(', ')}.`;
  }

  /**
   * Get session outro phrase
   */
  getSessionOutro(): string {
    const summary = this.generateSummary();
    const style = getPersonaDJStyle(this.personaId);

    const outros = {
      warm: [
        `${summary} Until next time, take care of yourself.`,
        `${summary} Looking forward to our next chat.`,
        `${summary} Be well!`,
      ],
      mentor: [
        `${summary} Remember what resonated with you today.`,
        `${summary} Carry these insights with you.`,
        `${summary} Until we meet again.`,
      ],
      energetic: [
        `${summary} That was awesome! Can't wait for next time!`,
        `${summary} You rock! See you soon!`,
        `${summary} Bye for now! 🎉`,
      ],
      analytical: [
        `${summary} Session logged. Until next time.`,
        `${summary} Data saved. See you soon.`,
        `${summary} Conversation complete. Take care.`,
      ],
      professional: [
        `${summary} Thank you for your time today.`,
        `${summary} Until our next session.`,
        `${summary} Take care.`,
      ],
      playful: [
        `${summary} That was a blast! Catch you later!`,
        `${summary} Peace out! ✌️`,
        `${summary} Later, friend!`,
      ],
    };

    const styleOutros = outros[style.introStyle] || outros.warm;
    return styleOutros[Math.floor(Math.random() * styleOutros.length)];
  }

  getState(): SessionFlowState {
    return { ...this.state };
  }
}

// ============================================================================
// PHASE 8: CROSS-SESSION MUSIC MEMORY
// ============================================================================

export interface MusicPreferences {
  /** Artists user has enjoyed */
  likedArtists: string[];
  /** Artists user has skipped/disliked */
  dislikedArtists: string[];
  /** Genres user prefers */
  favoriteGenres: string[];
  /** Music by mood preference */
  moodPreferences: Record<string, string[]>; // mood -> genres
  /** Preferred times for music */
  preferredMusicTimes: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
  /** Total tracks played */
  totalTracksPlayed: number;
  /** Last played track info */
  lastPlayed?: { artist: string; track: string; timestamp: number };
  /** Special music moments shared */
  sharedMoments: Array<{ description: string; artist: string; timestamp: number }>;
}

const DEFAULT_MUSIC_PREFERENCES: MusicPreferences = {
  likedArtists: [],
  dislikedArtists: [],
  favoriteGenres: [],
  moodPreferences: {},
  preferredMusicTimes: [],
  totalTracksPlayed: 0,
  sharedMoments: [],
};

/**
 * Music memory manager for cross-session preferences
 */
export class MusicMemoryManager {
  private preferences: MusicPreferences;

  constructor(existingPreferences?: Partial<MusicPreferences>) {
    this.preferences = { ...DEFAULT_MUSIC_PREFERENCES, ...existingPreferences };
  }

  /**
   * Record that user liked a track
   */
  recordLikedTrack(artist: string, trackName: string, mood?: string): void {
    if (!this.preferences.likedArtists.includes(artist)) {
      this.preferences.likedArtists.push(artist);
    }

    this.preferences.totalTracksPlayed++;
    this.preferences.lastPlayed = {
      artist,
      track: trackName,
      timestamp: Date.now(),
    };

    // Record mood preference
    if (mood) {
      if (!this.preferences.moodPreferences[mood]) {
        this.preferences.moodPreferences[mood] = [];
      }
      if (!this.preferences.moodPreferences[mood].includes(artist)) {
        this.preferences.moodPreferences[mood].push(artist);
      }
    }

    // Record time preference
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    if (!this.preferences.preferredMusicTimes.includes(timeOfDay)) {
      this.preferences.preferredMusicTimes.push(timeOfDay);
    }

    log.debug('Recorded liked track', { artist, track: trackName, mood });
  }

  /**
   * Record that user skipped/disliked a track
   */
  recordSkippedTrack(artist: string): void {
    if (!this.preferences.dislikedArtists.includes(artist)) {
      this.preferences.dislikedArtists.push(artist);
    }
  }

  /**
   * Record a special music moment
   */
  recordMusicMoment(description: string, artist: string): void {
    this.preferences.sharedMoments.push({
      description,
      artist,
      timestamp: Date.now(),
    });
  }

  /**
   * Get a music memory callback phrase
   * @param _personaId - Persona ID for future personalization (currently unused)
   */
  getMusicMemoryCallback(_personaId: string): string | null {
    // Check for recent music
    if (this.preferences.lastPlayed) {
      const daysSinceLastPlay =
        (Date.now() - this.preferences.lastPlayed.timestamp) / (1000 * 60 * 60 * 24);

      if (daysSinceLastPlay < 7) {
        const callbacks = [
          `Remember when we listened to ${this.preferences.lastPlayed.artist}? That was nice.`,
          `Last time we vibed to some ${this.preferences.lastPlayed.artist}. Want more of that?`,
          `I remember you enjoyed ${this.preferences.lastPlayed.artist}. Should I put something similar on?`,
        ];
        return callbacks[Math.floor(Math.random() * callbacks.length)];
      }
    }

    // Check for liked artists
    if (this.preferences.likedArtists.length > 0) {
      const randomArtist =
        this.preferences.likedArtists[
          Math.floor(Math.random() * this.preferences.likedArtists.length)
        ];
      return `You know, I remember you really liked ${randomArtist}. Want me to find something similar?`;
    }

    // Check for shared moments
    if (this.preferences.sharedMoments.length > 0) {
      const moment = this.preferences.sharedMoments[this.preferences.sharedMoments.length - 1];
      return `I remember that time with ${moment.artist}... ${moment.description}. Good memory.`;
    }

    return null;
  }

  /**
   * Get personalized music suggestion
   */
  getPersonalizedSuggestion(currentMood?: string): { searchQuery: string; reason: string } | null {
    // Check mood preferences first
    if (currentMood && this.preferences.moodPreferences[currentMood]?.length) {
      const artists = this.preferences.moodPreferences[currentMood];
      const artist = artists[Math.floor(Math.random() * artists.length)];
      return {
        searchQuery: artist,
        reason: `When you're feeling ${currentMood}, you usually enjoy ${artist}.`,
      };
    }

    // Use liked artists
    if (this.preferences.likedArtists.length > 0) {
      // Avoid disliked artists
      const safeArtists = this.preferences.likedArtists.filter(
        (a) => !this.preferences.dislikedArtists.includes(a)
      );
      if (safeArtists.length > 0) {
        const artist = safeArtists[Math.floor(Math.random() * safeArtists.length)];
        return {
          searchQuery: artist,
          reason: `Based on what you've enjoyed before, I think you'd like some ${artist}.`,
        };
      }
    }

    return null;
  }

  /**
   * Get preferences for saving
   */
  getPreferences(): MusicPreferences {
    return { ...this.preferences };
  }
}

// ============================================================================
// UNIFIED DJ ENHANCEMENT CONTROLLER
// ============================================================================

/**
 * Master controller that combines all DJ enhancements
 */
export class DJEnhancementController {
  public thinkingMusic: ThinkingMusicController;
  public sessionFlow: SessionFlowManager;
  public musicMemory: MusicMemoryManager;

  private personaId = 'ferni';
  private trackTimingCleanup: (() => void) | null = null;
  private speakCallback: ((text: string) => void) | null = null;

  constructor(existingPreferences?: Partial<MusicPreferences>) {
    this.thinkingMusic = new ThinkingMusicController();
    this.sessionFlow = new SessionFlowManager();
    this.musicMemory = new MusicMemoryManager(existingPreferences);

    log.info('🎧 DJ Enhancement Controller initialized');
  }

  /**
   * Set the speak callback for DJ phrases
   */
  setSpeakCallback(callback: (text: string) => void): void {
    this.speakCallback = callback;
  }

  /**
   * Set current persona
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
    this.thinkingMusic.setPersona(personaId);
    this.sessionFlow.setPersona(personaId);
  }

  /**
   * Called when a track starts playing
   */
  onTrackStart(track: MusicTrack): void {
    // Clean up previous timing callbacks
    if (this.trackTimingCleanup) {
      this.trackTimingCleanup();
    }

    // Track for session flow
    this.sessionFlow.trackArtist(track.artist);

    // Get persona style for timing
    const style = getPersonaDJStyle(this.personaId);

    // Schedule timing callbacks (only if track is long enough)
    // Use ?? for proper nullish coalescing (0 is valid duration)
    if ((track.duration ?? 30000) > 40000 && this.speakCallback) {
      this.trackTimingCleanup = scheduleTrackTimingCallbacks(track, {
        on30SecondsLeft: (_track) => {
          if (Math.random() < style.commentFrequency) {
            const phrase = getCountdownPhrase('thirtySeconds', this.personaId);
            this.speakCallback?.(phrase);
          }
        },
        on15SecondsLeft: (_track) => {
          // Less frequent comment
          if (Math.random() < style.commentFrequency * 0.5) {
            const phrase = getCountdownPhrase('fifteenSeconds', this.personaId);
            this.speakCallback?.(phrase);
          }
        },
        on5SecondsLeft: (_track) => {
          // DJ outro always happens (handled by DJ Booth)
        },
      });
    }

    log.debug('DJ enhancements tracking track start', {
      track: track.name,
      persona: this.personaId,
    });
  }

  /**
   * Called when a track ends
   */
  onTrackEnd(track: MusicTrack, wasSkipped: boolean): void {
    // Clean up timing callbacks
    if (this.trackTimingCleanup) {
      this.trackTimingCleanup();
      this.trackTimingCleanup = null;
    }

    // Record to memory
    if (wasSkipped) {
      this.musicMemory.recordSkippedTrack(track.artist);
    } else {
      this.musicMemory.recordLikedTrack(track.artist, track.name);
    }
  }

  /**
   * Get emotion-based music offer
   */
  getEmotionOffer(emotion: string): { offer: string; searchQuery: string } | null {
    // Check if we have personalized preferences for this mood
    const personalized = this.musicMemory.getPersonalizedSuggestion(emotion);
    if (personalized) {
      return {
        offer: personalized.reason,
        searchQuery: personalized.searchQuery,
      };
    }

    // Fall back to generic emotion mapping
    return getEmotionMusicOffer(emotion, this.personaId);
  }

  /**
   * Get music memory callback for greeting
   */
  getMusicCallback(): string | null {
    return this.musicMemory.getMusicMemoryCallback(this.personaId);
  }

  /**
   * Get session outro
   */
  getSessionOutro(): string {
    return this.sessionFlow.getSessionOutro();
  }

  /**
   * Get preferences for saving
   */
  getMusicPreferences(): MusicPreferences {
    return this.musicMemory.getPreferences();
  }

  /**
   * Cleanup on session end
   */
  cleanup(): void {
    this.thinkingMusic.forceStop();
    if (this.trackTimingCleanup) {
      this.trackTimingCleanup();
      this.trackTimingCleanup = null;
    }
  }
}

// ============================================================================
// SINGLETON EXPORTS
// ============================================================================

let djEnhancementInstance: DJEnhancementController | null = null;

export function initializeDJEnhancements(
  existingPreferences?: Partial<MusicPreferences>
): DJEnhancementController {
  if (djEnhancementInstance) {
    djEnhancementInstance.cleanup();
  }
  djEnhancementInstance = new DJEnhancementController(existingPreferences);
  return djEnhancementInstance;
}

export function getDJEnhancements(): DJEnhancementController | null {
  return djEnhancementInstance;
}

export function resetDJEnhancements(): void {
  if (djEnhancementInstance) {
    djEnhancementInstance.cleanup();
    djEnhancementInstance = null;
  }
}

export default {
  initializeDJEnhancements,
  getDJEnhancements,
  resetDJEnhancements,
  DJEnhancementController,
  ThinkingMusicController,
  SessionFlowManager,
  MusicMemoryManager,
};
