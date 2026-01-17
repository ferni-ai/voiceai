/**
 * Music Ducking Tests
 *
 * Tests the MusicAudioController ducking functionality.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Web Audio API
class MockGainNode {
  gain = {
    value: 1.0,
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockMediaElementAudioSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
  mediaElement: HTMLAudioElement | null = null;
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  createGain = vi.fn(() => new MockGainNode());
  createMediaElementSource = vi.fn((el: HTMLAudioElement) => {
    const node = new MockMediaElementAudioSourceNode();
    node.mediaElement = el;
    return node;
  });
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  createAnalyser = vi.fn(() => ({
    fftSize: 256,
    frequencyBinCount: 128,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn(),
  }));
}

// Mock the global AudioContext
vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

describe('Music Ducking', () => {
  let controller: Awaited<ReturnType<typeof import('../src/services/music-audio.controller.js')>>['getMusicAudioController'];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the controller fresh
    const module = await import('../src/services/music-audio.controller.js');
    controller = module.getMusicAudioController;

    // Reset singleton
    const c = controller();
    c.cleanup();
  });

  afterEach(() => {
    const c = controller();
    c.cleanup();
  });

  describe('duck state tracking', () => {
    it('should track agentSpeaking state', async () => {
      const c = controller();
      await c.initialize();

      expect(c.getDuckingDiagnostics().agentSpeaking).toBe(false);

      c.duckForAgent();
      expect(c.getDuckingDiagnostics().agentSpeaking).toBe(true);

      c.unduckForAgent();
      expect(c.getDuckingDiagnostics().agentSpeaking).toBe(false);
    });

    it('should track userSpeaking state', async () => {
      const c = controller();
      await c.initialize();

      expect(c.getDuckingDiagnostics().userSpeaking).toBe(false);

      c.duckForUser();
      expect(c.getDuckingDiagnostics().userSpeaking).toBe(true);

      c.unduckForUser();
      expect(c.getDuckingDiagnostics().userSpeaking).toBe(false);
    });

    it('should track backendDucking state', async () => {
      const c = controller();
      await c.initialize();

      expect(c.getDuckingDiagnostics().backendDucking).toBe(false);

      c.duckFromBackend();
      expect(c.getDuckingDiagnostics().backendDucking).toBe(true);

      c.unduckFromBackend();
      expect(c.getDuckingDiagnostics().backendDucking).toBe(false);
    });
  });

  describe('ducking without track attached', () => {
    it('should return false when no track is attached', async () => {
      const c = controller();
      await c.initialize();

      // No track attached yet
      expect(c.duckForAgent()).toBe(false);
      expect(c.duckForUser()).toBe(false);

      // State should still update for when track attaches
      expect(c.getDuckingDiagnostics().agentSpeaking).toBe(true);
      expect(c.getDuckingDiagnostics().userSpeaking).toBe(true);
    });
  });

  describe('ducking priority', () => {
    it('should stay ducked if both agent and user speaking', async () => {
      const c = controller();
      await c.initialize();

      c.duckForAgent();
      c.duckForUser();

      // Agent stops but user still speaking
      c.unduckForAgent();

      // Should still be ducked (user speaking)
      expect(c.getDuckingDiagnostics().userSpeaking).toBe(true);
      expect(c.getDuckingDiagnostics().agentSpeaking).toBe(false);

      // User stops
      c.unduckForUser();

      // Now fully unducked
      expect(c.getDuckingDiagnostics().userSpeaking).toBe(false);
      expect(c.getDuckingDiagnostics().agentSpeaking).toBe(false);
    });
  });

  describe('Web Audio track attachment', () => {
    it('should attach track and create gain node', async () => {
      const c = controller();
      await c.initialize();

      // Create mock audio element
      const audioEl = document.createElement('audio');
      audioEl.crossOrigin = 'anonymous';

      // Attach track
      const cleanup = await c.attachMusicTrack(audioEl, 'test-track-1');

      const diagnostics = c.getDuckingDiagnostics();
      expect(diagnostics.hasTrack).toBe(true);
      expect(diagnostics.hasGainNode).toBe(true);

      // Cleanup
      cleanup();
    });

    it('should apply pending ducking state after track attachment', async () => {
      const c = controller();
      await c.initialize();

      // Duck before track is attached
      c.duckForAgent();
      expect(c.getDuckingDiagnostics().agentSpeaking).toBe(true);
      expect(c.getDuckingDiagnostics().hasTrack).toBe(false);

      // Attach track
      const audioEl = document.createElement('audio');
      audioEl.crossOrigin = 'anonymous';

      await c.attachMusicTrack(audioEl, 'test-track-2');

      // Ducking should be applied to the track now
      const diagnostics = c.getDuckingDiagnostics();
      expect(diagnostics.hasTrack).toBe(true);
      expect(diagnostics.agentSpeaking).toBe(true);
      // targetGain should reflect ducking
      expect(diagnostics.targetGain).toBeLessThan(1.0);
    });
  });

  describe('diagnostic info', () => {
    it('should provide accurate diagnostic info', async () => {
      const c = controller();
      await c.initialize();

      const diagnostics = c.getDuckingDiagnostics();

      expect(diagnostics).toHaveProperty('hasTrack');
      expect(diagnostics).toHaveProperty('hasGainNode');
      expect(diagnostics).toHaveProperty('agentSpeaking');
      expect(diagnostics).toHaveProperty('userSpeaking');
      expect(diagnostics).toHaveProperty('backendDucking');
      expect(diagnostics).toHaveProperty('currentGain');
      expect(diagnostics).toHaveProperty('targetGain');

      // Initial state
      expect(diagnostics.hasTrack).toBe(false);
      expect(diagnostics.agentSpeaking).toBe(false);
      expect(diagnostics.currentGain).toBe(1.0);
    });

    it('should reflect gain changes after track attachment', async () => {
      const c = controller();
      await c.initialize();

      const audioEl = document.createElement('audio');
      await c.attachMusicTrack(audioEl, 'diag-test-track');

      const diagnostics = c.getDuckingDiagnostics();
      expect(diagnostics.hasTrack).toBe(true);
      expect(diagnostics.currentGain).toBe(1.0);

      // Duck
      c.duckForAgent();

      const afterDuck = c.getDuckingDiagnostics();
      expect(afterDuck.agentSpeaking).toBe(true);
      // Target gain should be the agent speaking level (0.12)
      expect(afterDuck.targetGain).toBeLessThan(1.0);
    });
  });
});
