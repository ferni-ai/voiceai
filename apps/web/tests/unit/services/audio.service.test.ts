/**
 * Audio Service Tests
 * 
 * Tests for audio playback and visualization.
 * Note: We mock the Audio class to avoid actual file loading.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AudioService', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('getCurrentVolume', () => {
    it('should return 0 when no analyser is attached', async () => {
      const { audioService } = await import('../../../src/services/audio.service.js');
      const volume = audioService.getCurrentVolume();
      expect(volume).toBe(0);
    });
  });

  describe('stopVisualization', () => {
    it('should not throw when called with no active visualization', async () => {
      const { audioService } = await import('../../../src/services/audio.service.js');
      expect(() => audioService.stopVisualization()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should clean up resources without error', async () => {
      const { audioService } = await import('../../../src/services/audio.service.js');
      expect(() => audioService.dispose()).not.toThrow();
    });
  });

  describe('playSound', () => {
    it('should handle unloaded sounds gracefully', async () => {
      const { audioService } = await import('../../../src/services/audio.service.js');
      
      // Should not throw even if sounds aren't loaded
      await expect(audioService.playSound('connect')).resolves.not.toThrow();
    });
  });
});
