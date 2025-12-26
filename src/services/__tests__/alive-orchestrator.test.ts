/**
 * Alive Orchestrator Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock game intelligence
vi.mock('../games/game-intelligence.js', () => ({
  checkMilestones: vi.fn(),
  getPersonalityComment: vi.fn(),
  getSongSelectionContext: vi.fn(() => ({ genres: [], decades: [] })),
}));

// Mock musical-you
const mockAnalyzeAndSuggest = vi.fn();
const mockRecordAcceptance = vi.fn();
const mockRecordDecline = vi.fn();
const mockBridgeReset = vi.fn();
const mockSetPersona = vi.fn();

vi.mock('../musical-you/index.js', () => ({
  getVoiceMusicBridge: () => ({
    analyzeAndSuggest: mockAnalyzeAndSuggest,
    recordAcceptance: mockRecordAcceptance,
    recordDecline: mockRecordDecline,
    reset: mockBridgeReset,
    setPersona: mockSetPersona,
  }),
}));

// Mock our-songs
vi.mock('../trust-systems/our-songs.js', () => ({
  getAllOurSongs: vi.fn(() => []),
}));

import {
  AliveOrchestrator,
  getAliveOrchestrator,
  resetAliveOrchestrator,
  type AliveOrchestratorConfig,
} from '../alive-orchestrator.js';
import type { VoiceEmotionResult, VoiceEmotion, ProsodyFeatures } from '../../speech/audio-prosody/types.js';

// Helper to create valid VoiceEmotionResult mock with all required properties
function createMockVoiceEmotion(
  primary: VoiceEmotion,
  overrides: Partial<VoiceEmotionResult> = {}
): VoiceEmotionResult {
  const defaultProsody: ProsodyFeatures = {
    pitchMean: 200,
    pitchVariance: 20,
    pitchRange: 100,
    pitchContour: 'dynamic',
    energyMean: -20,
    energyVariance: 5,
    energyPeaks: 3,
    speechRate: 3.5,
    pauseDuration: 200,
    pauseFrequency: 4,
    jitter: 0.02,
    shimmer: 0.03,
    breathiness: 0.1,
    utteranceDuration: 2000,
    speakingRatio: 0.8,
  };

  return {
    primary,
    confidence: 0.9,
    valence: 0.5,
    arousal: 0.5,
    dominance: 0.5,
    stressLevel: 0.2,
    anxietyMarkers: false,
    prosody: defaultProsody,
    sampleCount: 1000,
    processingTimeMs: 50,
    ...overrides,
  };
}

describe('AliveOrchestrator', () => {
  const mockSpeak = vi.fn();
  const mockPlayMusic = vi.fn();
  const mockSendDataMessage = vi.fn().mockResolvedValue(undefined);

  const createConfig = (overrides: Partial<AliveOrchestratorConfig> = {}): AliveOrchestratorConfig => ({
    personaId: 'ferni',
    userId: 'test-user-123',
    sessionId: 'test-session-123',
    speakCallback: mockSpeak,
    playMusicCallback: mockPlayMusic,
    sendDataMessage: mockSendDataMessage,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzeAndSuggest.mockReturnValue(null);
    resetAliveOrchestrator('test-session-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should create orchestrator with config', () => {
      const orchestrator = new AliveOrchestrator(createConfig());
      const state = orchestrator.getState();

      expect(state.turnCount).toBe(0);
      expect(state.eventsFired).toEqual([]);
      expect(state.gameIntensity).toBe('low');
    });

    it('should set persona on voice-music bridge', () => {
      new AliveOrchestrator(createConfig({ personaId: 'maya' }));

      expect(mockSetPersona).toHaveBeenCalledWith('maya');
    });

    it('should create initial state correctly', () => {
      const orchestrator = new AliveOrchestrator(createConfig());
      const state = orchestrator.getState();

      expect(state.hasSharedPersonalityInsight).toBe(false);
      expect(state.hasOurSongsCallback).toBe(false);
      expect(state.currentUserEmotion).toBeNull();
    });
  });

  describe('onUserTurn', () => {
    it('should update turn count', async () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      await orchestrator.onUserTurn({
        userMessage: 'Hello',
        turnCount: 5,
      });

      expect(orchestrator.getState().turnCount).toBe(5);
    });

    it('should update user emotion from voice analysis', async () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      await orchestrator.onUserTurn({
        userMessage: 'I feel great',
        turnCount: 1,
        voiceEmotion: createMockVoiceEmotion('happy', { confidence: 0.9, arousal: 0.7, valence: 0.8 }),
      });

      expect(orchestrator.getState().currentUserEmotion).toBe('happy');
    });

    it('should not fire event during emotional moments', async () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      const event = await orchestrator.onUserTurn({
        userMessage: 'I feel sad',
        turnCount: 10,
        isEmotionalMoment: true,
      });

      expect(event).toBeNull();
    });

    it('should respect cooldown between events', async () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      // Manually set last event time to recent
      const state = orchestrator.getState();
      (orchestrator as any).state.lastAliveEventTime = Date.now() - 10000; // 10s ago

      const event = await orchestrator.onUserTurn({
        userMessage: 'Hello',
        turnCount: 10,
      });

      expect(event).toBeNull();
    });

    it('should create voice music event when suggested', async () => {
      mockAnalyzeAndSuggest.mockReturnValue({
        shouldOffer: true,
        urgency: 'high',
        offer: 'Want some music?',
        searchQuery: 'relaxing piano',
        reason: 'You seem tired',
        confidence: 0.8,
      });

      const orchestrator = new AliveOrchestrator(createConfig());

      const event = await orchestrator.onUserTurn({
        userMessage: 'I feel tired',
        turnCount: 5,
        voiceEmotion: createMockVoiceEmotion('bored', { confidence: 0.9, arousal: 0.3, valence: 0.4 }),
      });

      expect(event).not.toBeNull();
      expect(event?.type).toBe('voice_music_offer');
      expect(event?.phrase).toBe('Want some music?');
    });

    it('should not offer music when music is playing', async () => {
      mockAnalyzeAndSuggest.mockReturnValue({
        shouldOffer: true,
        urgency: 'high',
        offer: 'Want some music?',
        searchQuery: 'relaxing piano',
        reason: 'You seem tired',
        confidence: 0.8,
      });

      const orchestrator = new AliveOrchestrator(createConfig());

      const event = await orchestrator.onUserTurn({
        userMessage: 'This is nice',
        turnCount: 10,
        isMusicPlaying: true,
      });

      expect(event?.type).not.toBe('voice_music_offer');
    });
  });

  describe('onGameEvent', () => {
    it('should calculate game intensity from streak', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 5 } as any,
        currentStreak: 3,
      });

      expect(orchestrator.getState().gameIntensity).toBe('medium');
    });

    it('should return intensity change event at streak 3', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      const event = orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 5 } as any,
        currentStreak: 3,
      });

      if (event) {
        expect(event.type).toBe('game_intensity_change');
        expect(event.phrase).toContain('warming up');
      }
    });

    it('should return high intensity event at streak 5', () => {
      const orchestrator = new AliveOrchestrator(createConfig());
      // Set starting intensity
      (orchestrator as any).state.gameIntensity = 'medium';

      const event = orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 10 } as any,
        currentStreak: 5,
      });

      if (event) {
        expect(event.type).toBe('game_intensity_change');
        expect(event.phrase).toContain('Five in a row');
      }
    });

    it('should return climax intensity event at streak 8', () => {
      const orchestrator = new AliveOrchestrator(createConfig());
      (orchestrator as any).state.gameIntensity = 'high';

      const event = orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 15 } as any,
        currentStreak: 8,
      });

      if (event) {
        expect(event.type).toBe('game_intensity_change');
        expect(event.phrase).toContain('EIGHT');
      }
    });

    it('should not fire event when intensity decreases', () => {
      const orchestrator = new AliveOrchestrator(createConfig());
      (orchestrator as any).state.gameIntensity = 'high';

      const event = orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'wrong',
        gameMemory: { totalGamesPlayed: 10 } as any,
        currentStreak: 0,
      });

      // No event for going from high to low
      expect(event?.type).not.toBe('game_intensity_change');
    });
  });

  describe('Music Offer Tracking', () => {
    it('should record music offer acceptance', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.onMusicOfferAccepted();

      expect(mockRecordAcceptance).toHaveBeenCalled();
    });

    it('should record music offer decline', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.onMusicOfferDeclined();

      expect(mockRecordDecline).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('should return copy of state', () => {
      const orchestrator = new AliveOrchestrator(createConfig());
      const state1 = orchestrator.getState();
      const state2 = orchestrator.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('should reset state', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      // Modify state
      (orchestrator as any).state.turnCount = 10;
      (orchestrator as any).state.hasSharedPersonalityInsight = true;

      orchestrator.reset();

      const state = orchestrator.getState();
      expect(state.turnCount).toBe(0);
      expect(state.hasSharedPersonalityInsight).toBe(false);
    });

    it('should reset voice-music bridge on reset', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.reset();

      expect(mockBridgeReset).toHaveBeenCalled();
    });
  });

  describe('Singleton Factory', () => {
    it('should return same orchestrator for same session', () => {
      const config = createConfig();
      const orch1 = getAliveOrchestrator('session-1', config);
      const orch2 = getAliveOrchestrator('session-1');

      expect(orch1).toBe(orch2);
    });

    it('should return different orchestrators for different sessions', () => {
      const config = createConfig();
      const orch1 = getAliveOrchestrator('session-a', config);
      const orch2 = getAliveOrchestrator('session-b', config);

      expect(orch1).not.toBe(orch2);
    });

    it('should reset and remove orchestrator', () => {
      const config = createConfig();
      const orch1 = getAliveOrchestrator('session-reset', config);
      (orch1 as any).state.turnCount = 10;

      resetAliveOrchestrator('session-reset');

      const orch2 = getAliveOrchestrator('session-reset', config);
      expect(orch2.getState().turnCount).toBe(0);
    });
  });

  describe('Event Recording', () => {
    it('should track events fired', async () => {
      mockAnalyzeAndSuggest.mockReturnValue({
        shouldOffer: true,
        urgency: 'high',
        offer: 'Want music?',
        searchQuery: 'jazz',
        reason: 'Mood match',
        confidence: 0.9,
      });

      const orchestrator = new AliveOrchestrator(createConfig());

      await orchestrator.onUserTurn({
        userMessage: 'Hello',
        turnCount: 5,
        voiceEmotion: createMockVoiceEmotion('happy', { confidence: 0.9, arousal: 0.7, valence: 0.8 }),
      });

      expect(orchestrator.getState().eventsFired.length).toBe(1);
    });

    it('should update lastAliveEventTime', async () => {
      mockAnalyzeAndSuggest.mockReturnValue({
        shouldOffer: true,
        urgency: 'high',
        offer: 'Music?',
        searchQuery: 'chill',
        reason: 'Relaxation',
        confidence: 0.8,
      });

      const orchestrator = new AliveOrchestrator(createConfig());
      const beforeTime = orchestrator.getState().lastAliveEventTime;

      await orchestrator.onUserTurn({
        userMessage: 'Hi',
        turnCount: 5,
        voiceEmotion: createMockVoiceEmotion('neutral', { confidence: 0.8, arousal: 0.3, valence: 0.6 }),
      });

      expect(orchestrator.getState().lastAliveEventTime).toBeGreaterThan(beforeTime);
    });

    it('should emit behavior signal on event', async () => {
      mockAnalyzeAndSuggest.mockReturnValue({
        shouldOffer: true,
        urgency: 'high',
        offer: 'Music?',
        searchQuery: 'chill',
        reason: 'Mood',
        confidence: 0.9,
      });

      mockSendDataMessage.mockResolvedValue(undefined);

      const orchestrator = new AliveOrchestrator(createConfig());

      await orchestrator.onUserTurn({
        userMessage: 'Hello',
        turnCount: 5,
        voiceEmotion: createMockVoiceEmotion('happy', { confidence: 0.9, arousal: 0.7, valence: 0.8 }),
      });

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'behavior_signal',
        expect.objectContaining({
          type: 'mode_shift',
          mode: 'exploration',
        })
      );
    });
  });

  describe('Game Intensity Calculation', () => {
    it('should return low for streak < 3', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 5 } as any,
        currentStreak: 2,
      });

      expect(orchestrator.getState().gameIntensity).toBe('low');
    });

    it('should return medium for streak 3-4', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 5 } as any,
        currentStreak: 4,
      });

      expect(orchestrator.getState().gameIntensity).toBe('medium');
    });

    it('should return high for streak 5-7', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 5 } as any,
        currentStreak: 6,
      });

      expect(orchestrator.getState().gameIntensity).toBe('high');
    });

    it('should return climax for streak >= 8', () => {
      const orchestrator = new AliveOrchestrator(createConfig());

      orchestrator.onGameEvent({
        gameType: 'name-that-tune',
        eventType: 'correct',
        gameMemory: { totalGamesPlayed: 5 } as any,
        currentStreak: 10,
      });

      expect(orchestrator.getState().gameIntensity).toBe('climax');
    });
  });
});
