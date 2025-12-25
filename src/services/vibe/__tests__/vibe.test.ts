/**
 * Vibe Service Tests
 *
 * Tests for environment control presets, state management, and device coordination.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock smart-home
vi.mock('../../../tools/domains/smart-home/smart-home.js', () => ({
  getAllDevices: vi.fn().mockResolvedValue([
    { id: 'light-1', name: 'Living Room', type: 'light', state: 'on', attributes: { brightness: 80 } },
    { id: 'light-2', name: 'Bedroom', type: 'light', state: 'off', attributes: { brightness: 0 } },
  ]),
  controlDevice: vi.fn().mockResolvedValue({ success: true }),
  activateScene: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock ecobee
vi.mock('../../identity/ecobee-api.js', () => ({
  getThermostatStatus: vi.fn().mockResolvedValue({
    success: true,
    data: {
      currentTemp: 72,
      targetHeat: 70,
      targetCool: 74,
      mode: 'home',
      humidity: 45,
    },
  }),
  setTemperature: vi.fn().mockResolvedValue({ success: true }),
  setClimateMode: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../identity/ecobee-auth.js', () => ({
  isEcobeeConfigured: vi.fn().mockResolvedValue(true),
}));

import {
  getVibeState,
  activateVibe,
  setLights,
  getAvailablePresets,
  getPreset,
  VIBE_PRESETS,
  type VibePreset,
  type VibeState,
  type VibeActivationResult,
} from '../index.js';

describe('VibeService', () => {
  const testUserId = 'vibe-test-user-' + Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VIBE_PRESETS', () => {
    it('should have primary vibes defined', () => {
      expect(VIBE_PRESETS.focus).toBeDefined();
      expect(VIBE_PRESETS.relax).toBeDefined();
      expect(VIBE_PRESETS.energize).toBeDefined();
      expect(VIBE_PRESETS.sleep).toBeDefined();
      expect(VIBE_PRESETS.social).toBeDefined();
    });

    it('should have activity vibes defined', () => {
      expect(VIBE_PRESETS.morning).toBeDefined();
      expect(VIBE_PRESETS.workout).toBeDefined();
      expect(VIBE_PRESETS.movie).toBeDefined();
      expect(VIBE_PRESETS.reading).toBeDefined();
      expect(VIBE_PRESETS.meditation).toBeDefined();
    });

    it('should have correct structure for each preset', () => {
      for (const [id, preset] of Object.entries(VIBE_PRESETS)) {
        expect(preset.id).toBe(id);
        expect(typeof preset.name).toBe('string');
        expect(typeof preset.description).toBe('string');
      }
    });

    it('should have music settings in presets', () => {
      const focusPreset = VIBE_PRESETS.focus;

      expect(focusPreset.music).toBeDefined();
      expect(focusPreset.music?.genre).toBe('ambient');
      expect(focusPreset.music?.energy).toBe('low');
      expect(typeof focusPreset.music?.volume).toBe('number');
    });

    it('should have light settings in presets', () => {
      const focusPreset = VIBE_PRESETS.focus;

      expect(focusPreset.lights).toBeDefined();
      expect(typeof focusPreset.lights?.brightness).toBe('number');
      expect(typeof focusPreset.lights?.colorTemp).toBe('number');
    });

    it('should have temperature settings in presets', () => {
      const focusPreset = VIBE_PRESETS.focus;

      expect(focusPreset.temperature).toBeDefined();
      expect(typeof focusPreset.temperature?.target).toBe('number');
      expect(['home', 'away', 'sleep']).toContain(focusPreset.temperature?.mode);
    });

    it('should have reasonable brightness values (0-100)', () => {
      for (const preset of Object.values(VIBE_PRESETS)) {
        if (preset.lights) {
          expect(preset.lights.brightness).toBeGreaterThanOrEqual(0);
          expect(preset.lights.brightness).toBeLessThanOrEqual(100);
        }
      }
    });

    it('should have reasonable color temp values (2000-7000K)', () => {
      for (const preset of Object.values(VIBE_PRESETS)) {
        if (preset.lights) {
          expect(preset.lights.colorTemp).toBeGreaterThanOrEqual(2000);
          expect(preset.lights.colorTemp).toBeLessThanOrEqual(7000);
        }
      }
    });

    it('should have reasonable temperature values (60-80F)', () => {
      for (const preset of Object.values(VIBE_PRESETS)) {
        if (preset.temperature) {
          expect(preset.temperature.target).toBeGreaterThanOrEqual(60);
          expect(preset.temperature.target).toBeLessThanOrEqual(80);
        }
      }
    });

    it('should have reasonable volume values (0-100)', () => {
      for (const preset of Object.values(VIBE_PRESETS)) {
        if (preset.music?.volume !== undefined) {
          expect(preset.music.volume).toBeGreaterThanOrEqual(0);
          expect(preset.music.volume).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('getAvailablePresets', () => {
    it('should return array of presets', () => {
      const presets = getAvailablePresets();

      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it('should include all VIBE_PRESETS', () => {
      const presets = getAvailablePresets();
      const presetIds = presets.map((p) => p.id);

      for (const id of Object.keys(VIBE_PRESETS)) {
        expect(presetIds).toContain(id);
      }
    });

    it('should return VibePreset objects', () => {
      const presets = getAvailablePresets();

      for (const preset of presets) {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('description');
      }
    });
  });

  describe('getPreset', () => {
    it('should return preset by ID', () => {
      const preset = getPreset('focus');

      expect(preset).toBeDefined();
      expect(preset?.id).toBe('focus');
      expect(preset?.name).toBe('Focus');
    });

    it('should return undefined for unknown preset', () => {
      const preset = getPreset('nonexistent');

      expect(preset).toBeUndefined();
    });

    it('should return correct preset for each ID', () => {
      for (const id of Object.keys(VIBE_PRESETS)) {
        const preset = getPreset(id);
        expect(preset).toEqual(VIBE_PRESETS[id]);
      }
    });
  });

  describe('getVibeState', () => {
    it('should return state object', async () => {
      const state = await getVibeState(testUserId);

      expect(state).toBeDefined();
      expect(state).toHaveProperty('activePreset');
      expect(state).toHaveProperty('music');
      expect(state).toHaveProperty('lights');
      expect(state).toHaveProperty('temperature');
    });

    it('should include music state', async () => {
      const state = await getVibeState(testUserId);

      expect(state.music).toHaveProperty('connected');
      expect(state.music).toHaveProperty('playing');
      expect(state.music).toHaveProperty('volume');
    });

    it('should include lights state', async () => {
      const state = await getVibeState(testUserId);

      expect(state.lights).toHaveProperty('connected');
      expect(state.lights).toHaveProperty('brightness');
      expect(state.lights).toHaveProperty('colorTemp');
      expect(state.lights).toHaveProperty('devices');
    });

    it('should include temperature state', async () => {
      const state = await getVibeState(testUserId);

      expect(state.temperature).toHaveProperty('connected');
      expect(state.temperature).toHaveProperty('current');
      expect(state.temperature).toHaveProperty('target');
      expect(state.temperature).toHaveProperty('mode');
    });

    it('should detect connected lights', async () => {
      const state = await getVibeState(testUserId);

      expect(state.lights.connected).toBe(true);
      expect(state.lights.devices.length).toBe(2);
    });

    it('should detect connected thermostat', async () => {
      const state = await getVibeState(testUserId);

      expect(state.temperature.connected).toBe(true);
      expect(state.temperature.current).toBe(72);
    });

    it('should handle no lights gracefully', async () => {
      const { getAllDevices } = await import(
        '../../../tools/domains/smart-home/smart-home.js'
      );
      (getAllDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const state = await getVibeState(testUserId);

      expect(state.lights.connected).toBe(false);
      expect(state.lights.devices).toEqual([]);
    });

    it('should handle ecobee not configured', async () => {
      const { isEcobeeConfigured } = await import('../../identity/ecobee-auth.js');
      (isEcobeeConfigured as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const state = await getVibeState(testUserId);

      expect(state.temperature.connected).toBe(false);
    });
  });

  describe('activateVibe', () => {
    it('should activate a valid preset', async () => {
      const result = await activateVibe(testUserId, 'focus');

      expect(result.success).toBe(true);
      expect(result.preset).toBe('focus');
    });

    it('should return error for unknown preset', async () => {
      const result = await activateVibe(testUserId, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.message).toContain("don't know a vibe");
    });

    it('should track what was applied', async () => {
      const result = await activateVibe(testUserId, 'focus');

      expect(result.applied).toHaveProperty('music');
      expect(result.applied).toHaveProperty('lights');
      expect(result.applied).toHaveProperty('temperature');
    });

    it('should apply music settings', async () => {
      const result = await activateVibe(testUserId, 'focus');

      expect(result.applied.music).toBe(true);
    });

    it('should apply light settings', async () => {
      const result = await activateVibe(testUserId, 'focus');

      expect(result.applied.lights).toBe(true);

      const { controlDevice } = await import(
        '../../../tools/domains/smart-home/smart-home.js'
      );
      expect(controlDevice).toHaveBeenCalled();
    });

    it('should apply temperature settings', async () => {
      const result = await activateVibe(testUserId, 'focus');

      expect(result.applied.temperature).toBe(true);

      const { setTemperature } = await import('../../identity/ecobee-api.js');
      expect(setTemperature).toHaveBeenCalled();
    });

    it('should include success message', async () => {
      const result = await activateVibe(testUserId, 'focus');

      expect(result.message).toContain('Focus');
      expect(result.message).toContain('vibe set');
    });

    it('should handle light control failure', async () => {
      // Mock getAllDevices to throw (Promise.allSettled swallows controlDevice rejections)
      const { getAllDevices } = await import(
        '../../../tools/domains/smart-home/smart-home.js'
      );
      (getAllDevices as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Light API error'));

      const result = await activateVibe(testUserId, 'focus');

      // Should still succeed for other components (music, temperature)
      expect(result.applied.music).toBe(true);
      expect(result.errors.some((e) => e.includes('Lights'))).toBe(true);
    });

    it('should handle temperature failure', async () => {
      const { setTemperature } = await import('../../identity/ecobee-api.js');
      (setTemperature as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Thermostat error',
      });

      const result = await activateVibe(testUserId, 'focus');

      expect(result.applied.temperature).toBe(false);
    });
  });

  describe('setLights', () => {
    it('should set brightness', async () => {
      const result = await setLights(75);

      expect(result.success).toBe(true);
      expect(result.message).toContain('75%');
    });

    it('should handle no lights connected', async () => {
      const { getAllDevices } = await import(
        '../../../tools/domains/smart-home/smart-home.js'
      );
      (getAllDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const result = await setLights(50);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No lights');
    });

    it('should call controlDevice for each light', async () => {
      const { controlDevice } = await import(
        '../../../tools/domains/smart-home/smart-home.js'
      );

      await setLights(80);

      expect(controlDevice).toHaveBeenCalledTimes(2); // 2 lights in mock
    });

    it('should handle undefined brightness', async () => {
      const result = await setLights(undefined);

      expect(result.success).toBe(true);
      expect(result.message).toContain('unchanged');
    });

    it('should handle control failure', async () => {
      const { getAllDevices } = await import(
        '../../../tools/domains/smart-home/smart-home.js'
      );
      (getAllDevices as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API error'));

      const result = await setLights(50);

      expect(result.success).toBe(false);
    });
  });

  describe('VibePreset interface', () => {
    it('should have correct structure', () => {
      const preset: VibePreset = {
        id: 'test',
        name: 'Test',
        description: 'Test preset',
        music: {
          genre: 'ambient',
          energy: 'low',
          volume: 30,
        },
        lights: {
          brightness: 50,
          colorTemp: 4000,
        },
        temperature: {
          target: 70,
          mode: 'home',
        },
      };

      expect(preset.id).toBe('test');
      expect(preset.name).toBe('Test');
      expect(preset.music?.genre).toBe('ambient');
      expect(preset.lights?.brightness).toBe(50);
      expect(preset.temperature?.target).toBe(70);
    });

    it('should allow optional properties', () => {
      const minimalPreset: VibePreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal preset',
      };

      expect(minimalPreset.music).toBeUndefined();
      expect(minimalPreset.lights).toBeUndefined();
      expect(minimalPreset.temperature).toBeUndefined();
    });
  });

  describe('VibeState interface', () => {
    it('should have correct structure', async () => {
      const state = await getVibeState(testUserId);

      expect(typeof state.activePreset === 'string' || state.activePreset === null).toBe(true);
      expect(typeof state.music.connected).toBe('boolean');
      expect(typeof state.music.playing).toBe('boolean');
      expect(typeof state.music.volume).toBe('number');
      expect(typeof state.lights.connected).toBe('boolean');
      expect(typeof state.lights.brightness).toBe('number');
      expect(Array.isArray(state.lights.devices)).toBe(true);
      expect(typeof state.temperature.connected).toBe('boolean');
      expect(typeof state.temperature.current).toBe('number');
    });
  });

  describe('VibeActivationResult interface', () => {
    it('should have correct structure', async () => {
      const result = await activateVibe(testUserId, 'focus');

      expect(typeof result.success).toBe('boolean');
      expect(typeof result.preset).toBe('string');
      expect(typeof result.applied.music).toBe('boolean');
      expect(typeof result.applied.lights).toBe('boolean');
      expect(typeof result.applied.temperature).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.message).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty user ID', async () => {
      const state = await getVibeState('');
      expect(state).toBeDefined();
    });

    it('should handle special characters in user ID', async () => {
      const state = await getVibeState('user@test.com');
      expect(state).toBeDefined();
    });

    it('should handle concurrent activations', async () => {
      const results = await Promise.all([
        activateVibe(testUserId, 'focus'),
        activateVibe(testUserId, 'relax'),
        activateVibe(testUserId, 'energize'),
      ]);

      expect(results.every((r) => r.success)).toBe(true);
    });
  });
});
