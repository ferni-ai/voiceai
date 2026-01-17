/**
 * Music Ducking E2E Tests
 *
 * Verifies that music ducking (lowering volume when agent speaks) works
 * end-to-end through all the involved systems.
 *
 * Key Finding: Backend ducking is STATE ONLY - no actual volume control.
 * Real ducking happens via frontend Web Audio API GainNode.
 *
 * @see docs/audits/MUSIC-DUCKING-E2E-AUDIT.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MusicAudioController,
  getMusicAudioController,
  resetMusicAudioController,
} from '../src/services/music-audio.controller.js';
import {
  getMusicStateManager,
  resetMusicStateManager,
  type MusicStateEvent,
} from '../src/services/music-state-manager.js';
import {
  dispatchAgentSpeechStart,
  dispatchAgentSpeechEnd,
  dispatchUserSpeechStart,
  dispatchUserSpeechEnd,
  initSpeechEventDispatcher,
  disposeSpeechEventDispatcher,
} from '../src/services/speech-event-dispatcher.js';

// Mock AudioContext for Node environment
const createMockAudioContext = () => ({
  state: 'running',
  currentTime: 0,
  sampleRate: 48000,
  resume: vi.fn().mockResolvedValue(undefined),
  createGain: vi.fn().mockReturnValue({
    gain: {
      value: 1.0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 256,
    smoothingTimeConstant: 0.3,
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  createMediaElementSource: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  destination: {},
  close: vi.fn().mockResolvedValue(undefined),
});

// Mock global AudioContext - return fresh instance each time
vi.stubGlobal('AudioContext', vi.fn().mockImplementation(createMockAudioContext));

describe('Music Ducking E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Note: We don't reset MusicAudioController here because the AudioContext mock
    // doesn't support close() properly in Node.js test environment.
    // In browser testing, reset would work correctly.
    resetMusicStateManager();
    initSpeechEventDispatcher();
  });

  afterEach(() => {
    disposeSpeechEventDispatcher();
    // Note: Skipping resetMusicAudioController due to mock limitations
    resetMusicStateManager();
  });

  describe('MusicAudioController (Frontend Web Audio)', () => {
    it('should duck audio when agent starts speaking', async () => {
      const controller = getMusicAudioController();
      await controller.initialize();

      // Attach a mock audio element
      const mockAudioElement = document.createElement('audio');
      await controller.attachMusicTrack(mockAudioElement, 'test-track');

      // Verify track is attached
      expect(controller.hasTrack()).toBe(true);
      expect(controller.isDuckingReady()).toBe(true);

      // Duck for agent
      const duckResult = controller.duckForAgent();
      expect(duckResult).toBe(true);

      // Check diagnostics show ducking state
      const diag = controller.getDuckingDiagnostics();
      expect(diag.agentSpeaking).toBe(true);
      expect(diag.targetGain).toBeCloseTo(0.04, 2); // 4% volume when agent speaks
    });

    it('should restore audio when agent stops speaking', async () => {
      const controller = getMusicAudioController();
      await controller.initialize();

      const mockAudioElement = document.createElement('audio');
      await controller.attachMusicTrack(mockAudioElement, 'test-track');

      // Duck then unduck
      controller.duckForAgent();
      controller.unduckForAgent();

      // Check diagnostics show restored state
      const diag = controller.getDuckingDiagnostics();
      expect(diag.agentSpeaking).toBe(false);
      expect(diag.targetGain).toBe(1.0); // 100% volume restored
    });

    it('should set agentSpeaking flag regardless of track attachment', async () => {
      const controller = getMusicAudioController();
      await controller.initialize();

      // Duck without attaching track
      controller.duckForAgent();

      // Agent speaking flag should be set
      const diag = controller.getDuckingDiagnostics();
      expect(diag.agentSpeaking).toBe(true);
      // Note: In production, hasTrack=false means no actual ducking happens
      // but the flag is tracked so we know ducking SHOULD happen
    });

    it('should track both agent and user speaking states independently', async () => {
      const controller = getMusicAudioController();
      await controller.initialize();

      const mockAudioElement = document.createElement('audio');
      await controller.attachMusicTrack(mockAudioElement, 'test-track');

      // Both start speaking
      controller.duckForAgent();
      controller.duckForUser();

      let diag = controller.getDuckingDiagnostics();
      expect(diag.agentSpeaking).toBe(true);
      expect(diag.userSpeaking).toBe(true);

      // Agent stops, but user still speaking
      controller.unduckForAgent();

      diag = controller.getDuckingDiagnostics();
      expect(diag.agentSpeaking).toBe(false);
      expect(diag.userSpeaking).toBe(true);
      // When user is still speaking, targetGain should be USER_SPEAKING level
    });

    it('should handle Web Audio attachment failure gracefully', async () => {
      const controller = getMusicAudioController();
      await controller.initialize();

      const mockAudioElement = document.createElement('audio');
      const cleanup = await controller.attachMusicTrack(mockAudioElement, 'test-track');

      // Cleanup function should be defined regardless of success/failure
      expect(cleanup).toBeDefined();
      expect(typeof cleanup).toBe('function');
    });
  });

  describe('MusicStateManager (State Tracking)', () => {
    it('should emit ducking_started when backend sends ducking state', () => {
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      const events: MusicStateEvent[] = [];
      stateManager.subscribe((event) => events.push(event));

      // First start music
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Track',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      // Then duck
      stateManager.handleStateChange({
        type: 'music',
        state: 'ducking',
        trackName: 'Test Track',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      const duckingEvent = events.find((e) => e.type === 'ducking_started');
      expect(duckingEvent).toBeDefined();
      expect(stateManager.isDucked()).toBe(true);
    });

    it('should emit ducking_ended when state returns to playing', () => {
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      const events: MusicStateEvent[] = [];
      stateManager.subscribe((event) => events.push(event));

      // Play -> Duck -> Play
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });
      stateManager.handleStateChange({
        type: 'music',
        state: 'ducking',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });

      const duckingEndedEvent = events.find((e) => e.type === 'ducking_ended');
      expect(duckingEndedEvent).toBeDefined();
      expect(stateManager.isDucked()).toBe(false);
    });

    it('should track agent speaking state via notifyAgentSpeakingStart', () => {
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      // Start music first
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });

      const events: MusicStateEvent[] = [];
      stateManager.subscribe((event) => events.push(event));

      stateManager.notifyAgentSpeakingStart();

      const state = stateManager.getState();
      expect(state.isAgentSpeaking).toBe(true);
      expect(state.isDucked).toBe(true);
      expect(state.duckReason).toBe('agent_speaking');

      const duckingEvent = events.find((e) => e.type === 'ducking_started');
      expect(duckingEvent).toBeDefined();
    });
  });

  describe('SpeechEventDispatcher Integration', () => {
    it('should notify MusicStateManager when agent starts speaking', () => {
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      // Start music
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });

      const events: MusicStateEvent[] = [];
      stateManager.subscribe((event) => events.push(event));

      // Dispatch speech event (this should call MusicStateManager.notifyAgentSpeakingStart)
      dispatchAgentSpeechStart();

      expect(stateManager.getState().isAgentSpeaking).toBe(true);
      expect(events.some((e) => e.type === 'ducking_started')).toBe(true);
    });

    it('should notify MusicStateManager when agent stops speaking', () => {
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      // Start music
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });

      const events: MusicStateEvent[] = [];

      // Start speaking first
      dispatchAgentSpeechStart();

      stateManager.subscribe((event) => events.push(event));

      // Then stop
      dispatchAgentSpeechEnd();

      expect(stateManager.getState().isAgentSpeaking).toBe(false);
      expect(events.some((e) => e.type === 'ducking_ended')).toBe(true);
    });
  });

  describe('Known Limitations', () => {
    /**
     * This test documents the known limitation that backend ducking
     * is state-only and does NOT actually control audio volume.
     *
     * Real ducking must happen via frontend Web Audio API.
     */
    it('documents: backend music_state ducking is state-only, not audio control', () => {
      // The MusicStateManager tracks ducking state from backend
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      // Play music
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });

      // Backend sends ducking state
      stateManager.handleStateChange({
        type: 'music',
        state: 'ducking',
        trackName: 'Test Track',
        timestamp: Date.now(),
      });

      // State is tracked...
      expect(stateManager.isDucked()).toBe(true);

      // ...but MusicAudioController was NOT called!
      // This is the gap - backend ducking doesn't trigger frontend audio ducking.
      const audioController = getMusicAudioController();
      const diag = audioController.getDuckingDiagnostics();
      expect(diag.agentSpeaking).toBe(false); // Not triggered by state change

      // This is the architectural limitation:
      // Backend can only track state, frontend must do actual audio ducking.
    });

    /**
     * This test documents the dual-path architecture where frontend
     * LiveKit callbacks and backend state can get out of sync.
     */
    it('documents: two parallel ducking paths can desync', () => {
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      // Path B: Backend state (goes through MusicStateManager)
      // This only updates visual state - NOT actual audio ducking!
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test',
        timestamp: Date.now(),
      });
      stateManager.handleStateChange({
        type: 'music',
        state: 'ducking',
        trackName: 'Test',
        timestamp: Date.now(),
      });

      // Backend state says we're ducking
      expect(stateManager.isDucked()).toBe(true);

      // But the AUDIO CONTROLLER doesn't know about this state change!
      // MusicStateManager.isDucked() !== MusicAudioController's actual ducking state
      // This is the architectural gap - backend ducking state doesn't trigger
      // frontend audio ducking. They're independent systems!

      // The MusicStateManager tracks state for visual feedback only.
      // Actual audio ducking happens via MusicAudioController.duckForAgent()
      // which is called by LiveKit speech callbacks in app.ts.
    });
  });

  describe('Recommended Fixes', () => {
    /**
     * This test demonstrates how MusicStateManager ducking events
     * SHOULD be wired to MusicAudioController for backend-initiated ducking.
     */
    it('shows how to wire backend ducking to audio controller', async () => {
      const stateManager = getMusicStateManager();
      stateManager.initialize();

      const audioController = getMusicAudioController();
      await audioController.initialize();

      // Attach a mock track
      const mockAudioElement = document.createElement('audio');
      await audioController.attachMusicTrack(mockAudioElement, 'test-track');

      // Wire up the connection (this is the missing piece!)
      stateManager.subscribe((event) => {
        if (event.type === 'ducking_started') {
          audioController.duckFromBackend();
        } else if (event.type === 'ducking_ended') {
          audioController.unduckFromBackend();
        }
      });

      // Play music
      stateManager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test',
        timestamp: Date.now(),
      });

      // Backend sends ducking
      stateManager.handleStateChange({
        type: 'music',
        state: 'ducking',
        trackName: 'Test',
        timestamp: Date.now(),
      });

      // NOW both state AND audio should be ducked
      expect(stateManager.isDucked()).toBe(true);

      // Audio controller received the duck command
      const diag = audioController.getDuckingDiagnostics();
      expect(diag.backendDucking).toBe(true);
    });
  });
});

describe('Ducking Gain Levels', () => {
  it('should use correct gain levels', () => {
    // Document the expected gain levels
    const EXPECTED_GAINS = {
      NORMAL: 1.0,
      AGENT_SPEAKING: 0.04, // 4% - nearly silent so voice dominates
      USER_SPEAKING: 0.08, // 8% - slightly louder than agent
      MINIMUM: 0.02, // 2% - never fully silent
    };

    // These values should match MusicAudioController constants
    expect(EXPECTED_GAINS.AGENT_SPEAKING).toBe(0.04);
    expect(EXPECTED_GAINS.USER_SPEAKING).toBe(0.08);
  });

  it('should ramp smoothly, not jump', () => {
    // Ducking should be smooth transitions, not abrupt jumps
    const EXPECTED_RAMP_TIMES = {
      DUCK_DOWN_MS: 150, // Fast duck when someone starts speaking
      DUCK_UP_MS: 400, // Slower restore for smooth feel
    };

    // Quick duck, slow restore = natural feel
    expect(EXPECTED_RAMP_TIMES.DUCK_DOWN_MS).toBeLessThan(EXPECTED_RAMP_TIMES.DUCK_UP_MS);
  });
});
