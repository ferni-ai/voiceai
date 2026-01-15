/**
 * Music Intelligence System - Phase 1 Tests
 *
 * Tests for the "More Than Human" music intelligence system:
 * - Phase 1.4: Emotion-Reactive Music context builder
 * - Phase 1.5: Game Music Controller
 * - Phase 1.6: Session Flow tracking
 * - Phase 1.7: Cross-Session Memory persistence
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// PHASE 1.4 TESTS: EMOTION-REACTIVE MUSIC
// ============================================================================

describe('Phase 1.4: Emotion-Reactive Music', () => {
  // Import the module dynamically to avoid initialization issues
  let detectEmotionFromText: (text: string) => string | null;
  let resetMusicOfferState: (userId: string) => void;
  let trackMusicOfferAccepted: (userId: string) => void;
  let trackMusicOfferDeclined: (userId: string) => void;
  let getMusicOfferStats: (
    userId: string
  ) => { acceptedCount: number; declinedCount: number } | null;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../intelligence/context-builders/engagement/music-emotion-offers.js');
    detectEmotionFromText = module.detectEmotionFromText;
    resetMusicOfferState = module.resetMusicOfferState;
    trackMusicOfferAccepted = module.trackMusicOfferAccepted;
    trackMusicOfferDeclined = module.trackMusicOfferDeclined;
    getMusicOfferStats = module.getMusicOfferStats;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectEmotionFromText', () => {
    it('should detect sad emotion', () => {
      expect(detectEmotionFromText("I'm feeling really sad today")).toBe('sad');
      expect(detectEmotionFromText("I've been down lately")).toBe('sad');
      expect(detectEmotionFromText('I feel so blue')).toBe('sad');
    });

    it('should detect anxious emotion', () => {
      expect(detectEmotionFromText("I'm so anxious about tomorrow")).toBe('anxious');
      expect(detectEmotionFromText('I feel stressed and worried')).toBe('anxious');
      expect(detectEmotionFromText("I'm overwhelmed with everything")).toBe('anxious');
    });

    it('should detect happy emotion', () => {
      expect(detectEmotionFromText("I'm so happy today!")).toBe('happy');
      expect(detectEmotionFromText('This is amazing news')).toBe('happy');
      expect(detectEmotionFromText('I feel wonderful')).toBe('happy');
    });

    it('should detect tired emotion', () => {
      expect(detectEmotionFromText("I'm exhausted")).toBe('tired');
      expect(detectEmotionFromText('I feel so drained')).toBe('tired');
      expect(detectEmotionFromText('I need rest')).toBe('tired');
    });

    it('should detect nostalgic emotion', () => {
      expect(detectEmotionFromText('Remember when we used to...')).toBe('nostalgic');
      expect(detectEmotionFromText('I miss the good old days')).toBe('nostalgic');
    });

    it('should detect focused emotion', () => {
      expect(detectEmotionFromText('I need to focus on this project')).toBe('focused');
      expect(detectEmotionFromText("I'm studying for an exam")).toBe('focused');
    });

    it('should return null for neutral text', () => {
      expect(detectEmotionFromText('What time is it?')).toBeNull();
      expect(detectEmotionFromText('Tell me about the weather')).toBeNull();
    });
  });

  describe('Music Offer Tracking', () => {
    const testUserId = 'test-user-123';

    beforeEach(() => {
      resetMusicOfferState(testUserId);
    });

    it('should start with no stats', () => {
      const stats = getMusicOfferStats(testUserId);
      expect(stats).toBeNull();
    });

    it('should track accepted offers', () => {
      trackMusicOfferAccepted(testUserId);
      trackMusicOfferAccepted(testUserId);
      const stats = getMusicOfferStats(testUserId);
      expect(stats?.acceptedCount).toBe(2);
    });

    it('should track declined offers', () => {
      trackMusicOfferDeclined(testUserId);
      const stats = getMusicOfferStats(testUserId);
      expect(stats?.declinedCount).toBe(1);
    });

    it('should reset offer state', () => {
      trackMusicOfferAccepted(testUserId);
      resetMusicOfferState(testUserId);
      const stats = getMusicOfferStats(testUserId);
      expect(stats).toBeNull();
    });
  });
});

// ============================================================================
// PHASE 1.5 TESTS: GAME MUSIC CONTROLLER
// ============================================================================

describe('Phase 1.5: Game Music Controller', () => {
  let getGameMusicController: () => {
    isActive: () => boolean;
    getState: () => { currentStreak: number; intensity: string };
    getIntensity: () => string;
  };
  let resetGameMusicController: () => void;
  let isGameMusicActive: () => boolean;
  let getGameMusicIntensity: () => string;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../services/games/game-music-controller.js');
    getGameMusicController = module.getGameMusicController;
    resetGameMusicController = module.resetGameMusicController;
    isGameMusicActive = module.isGameMusicActive;
    getGameMusicIntensity = module.getGameMusicIntensity;
  });

  afterEach(() => {
    resetGameMusicController();
    vi.clearAllMocks();
  });

  describe('Controller Initialization', () => {
    it('should create controller instance', () => {
      const controller = getGameMusicController();
      expect(controller).toBeDefined();
    });

    it('should start inactive', () => {
      expect(isGameMusicActive()).toBe(false);
    });

    it('should have low intensity when inactive', () => {
      expect(getGameMusicIntensity()).toBe('low');
    });

    it('should return same instance (singleton)', () => {
      const controller1 = getGameMusicController();
      const controller2 = getGameMusicController();
      expect(controller1).toBe(controller2);
    });
  });

  describe('Controller State', () => {
    it('should initialize with correct default state', () => {
      const controller = getGameMusicController();
      const state = controller.getState();

      expect(state.currentStreak).toBe(0);
      expect(state.intensity).toBe('low');
    });

    it('should reset state when controller is reset', () => {
      const controller = getGameMusicController();
      resetGameMusicController();

      // After reset, getting controller should return fresh instance
      const newController = getGameMusicController();
      expect(newController.isActive()).toBe(false);
    });
  });
});

// ============================================================================
// PHASE 1.6 TESTS: SESSION FLOW
// ============================================================================

describe('Phase 1.6: Session Flow', () => {
  let clearSessionFlowState: (sessionId: string) => void;
  let getSessionFlowStats: (sessionId: string) => {
    topicsDiscussed: number;
    emotionalMoments: number;
    transitions: number;
  } | null;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../intelligence/context-builders/session/session-flow.js');
    clearSessionFlowState = module.clearSessionFlowState;
    getSessionFlowStats = module.getSessionFlowStats;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session State Management', () => {
    const testSessionId = 'test-session-123';

    it('should return null stats for unknown session', () => {
      const stats = getSessionFlowStats(testSessionId);
      expect(stats).toBeNull();
    });

    it('should clear session state', () => {
      clearSessionFlowState(testSessionId);
      const stats = getSessionFlowStats(testSessionId);
      expect(stats).toBeNull();
    });
  });
});

// ============================================================================
// PHASE 1.7 TESTS: CROSS-SESSION MEMORY
// ============================================================================

describe('Phase 1.7: Cross-Session Memory', () => {
  let musicMemoryToPreferences: (memory: {
    favoriteArtists: string[];
    favoriteGenres: string[];
    dislikedArtists: string[];
    totalTracksPlayed: number;
    lastPlayedArtist?: string;
    lastPlayedTrack?: string;
    preferredMusicTimes?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
    moodMusicPreferences?: Record<string, string[]>;
    sharedMoments?: Array<{ description: string; artist: string; timestamp: number }>;
  }) => {
    likedArtists: string[];
    dislikedArtists: string[];
    favoriteGenres: string[];
    totalTracksPlayed: number;
  };

  let preferencesToMusicMemory: (prefs: {
    likedArtists: string[];
    dislikedArtists: string[];
    favoriteGenres: string[];
    totalTracksPlayed: number;
    moodPreferences: Record<string, string[]>;
    preferredMusicTimes: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
    sharedMoments: Array<{ description: string; artist: string; timestamp: number }>;
    lastPlayed?: { artist: string; track: string; timestamp: number };
  }) => {
    favoriteArtists: string[];
    dislikedArtists: string[];
    favoriteGenres: string[];
    totalTracksPlayed: number;
  };

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../services/musical-you/memory-persistence.js');
    musicMemoryToPreferences = module.musicMemoryToPreferences;
    preferencesToMusicMemory = module.preferencesToMusicMemory;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Type Conversion', () => {
    it('should convert MusicMemory to MusicPreferences', () => {
      const memory = {
        favoriteArtists: ['Queen', 'Beatles'],
        favoriteGenres: ['rock', 'pop'],
        dislikedArtists: ['Artist X'],
        totalTracksPlayed: 42,
        lastPlayedArtist: 'Queen',
        lastPlayedTrack: 'Bohemian Rhapsody',
        preferredMusicTimes: ['evening' as const],
        moodMusicPreferences: { happy: ['pop'] },
        sharedMoments: [{ description: 'Great moment', artist: 'Queen', timestamp: 123 }],
      };

      const prefs = musicMemoryToPreferences(memory);

      expect(prefs.likedArtists).toEqual(['Queen', 'Beatles']);
      expect(prefs.dislikedArtists).toEqual(['Artist X']);
      expect(prefs.favoriteGenres).toEqual(['rock', 'pop']);
      expect(prefs.totalTracksPlayed).toBe(42);
    });

    it('should convert MusicPreferences to MusicMemory', () => {
      const prefs = {
        likedArtists: ['Queen', 'Beatles'],
        dislikedArtists: ['Artist X'],
        favoriteGenres: ['rock', 'pop'],
        totalTracksPlayed: 42,
        moodPreferences: { happy: ['pop'] },
        preferredMusicTimes: ['evening' as const],
        sharedMoments: [{ description: 'Great moment', artist: 'Queen', timestamp: 123 }],
        lastPlayed: { artist: 'Queen', track: 'Bohemian Rhapsody', timestamp: 123 },
      };

      const memory = preferencesToMusicMemory(prefs);

      expect(memory.favoriteArtists).toEqual(['Queen', 'Beatles']);
      expect(memory.dislikedArtists).toEqual(['Artist X']);
      expect(memory.favoriteGenres).toEqual(['rock', 'pop']);
      expect(memory.totalTracksPlayed).toBe(42);
    });

    it('should handle empty MusicMemory', () => {
      const emptyMemory = {
        favoriteArtists: [],
        favoriteGenres: [],
        dislikedArtists: [],
        totalTracksPlayed: 0,
      };

      const prefs = musicMemoryToPreferences(emptyMemory);

      expect(prefs.likedArtists).toEqual([]);
      expect(prefs.totalTracksPlayed).toBe(0);
    });
  });
});

// ============================================================================
// DJ ENHANCEMENTS TESTS
// ============================================================================

// TODO: Skipped - imports from 'dj-enhancements.js' which has been deleted
describe.skip('DJ Enhancements Integration', () => {
  let getGameMusicConfig: (gameType: string) => {
    backgroundGenre: string;
    correctSound: string;
    wrongSound: string;
    useCountdown: boolean;
    volume: number;
  };
  let getGameMusicPhrase: (event: string) => string;
  let getEmotionMusicSuggestion: (emotion: string) => {
    genres: string[];
    searchQueries: string[];
  };

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../audio/dj-enhancements.js');
    getGameMusicConfig = module.getGameMusicConfig;
    getGameMusicPhrase = module.getGameMusicPhrase;
    getEmotionMusicSuggestion = module.getEmotionMusicSuggestion;
  });

  describe('Game Music Config', () => {
    it('should return config for name-that-tune', () => {
      const config = getGameMusicConfig('name-that-tune');
      expect(config.backgroundGenre).toBe('game show');
      expect(config.useCountdown).toBe(true);
    });

    it('should return config for desert-island-discs', () => {
      const config = getGameMusicConfig('desert-island-discs');
      // The config may be default or specific - just check it exists
      expect(config.backgroundGenre).toBeDefined();
      expect(typeof config.backgroundGenre).toBe('string');
    });

    it('should return default config for unknown game', () => {
      const config = getGameMusicConfig('unknown-game');
      expect(config.backgroundGenre).toBe('upbeat');
    });
  });

  describe('Game Music Phrases', () => {
    it('should return phrase for gameStart', () => {
      const phrase = getGameMusicPhrase('gameStart');
      expect(phrase).toBeDefined();
      expect(typeof phrase).toBe('string');
    });

    it('should return phrase for correctAnswer', () => {
      const phrase = getGameMusicPhrase('correctAnswer');
      expect(phrase).toBeDefined();
    });

    it('should return phrase for wrongAnswer', () => {
      const phrase = getGameMusicPhrase('wrongAnswer');
      expect(phrase).toBeDefined();
    });

    it('should return phrase for highScore', () => {
      const phrase = getGameMusicPhrase('highScore');
      expect(phrase).toBeDefined();
    });
  });

  describe('Emotion Music Suggestions', () => {
    it('should return suggestions for sad emotion', () => {
      const suggestion = getEmotionMusicSuggestion('sad');
      expect(suggestion.genres).toBeDefined();
      expect(suggestion.searchQueries).toBeDefined();
      expect(suggestion.genres.length).toBeGreaterThan(0);
    });

    it('should return suggestions for anxious emotion', () => {
      const suggestion = getEmotionMusicSuggestion('anxious');
      expect(suggestion.genres.length).toBeGreaterThan(0);
    });

    it('should return suggestions for happy emotion', () => {
      const suggestion = getEmotionMusicSuggestion('happy');
      expect(suggestion.genres.length).toBeGreaterThan(0);
    });

    it('should return default suggestions for unknown emotion', () => {
      const suggestion = getEmotionMusicSuggestion('unknown-emotion');
      expect(suggestion.genres).toBeDefined();
    });
  });
});
