/**
 * Vibe API Tests
 *
 * Tests for the unified vibe control system:
 * - Preset management
 * - State retrieval
 * - Vibe activation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../tools/domains/smart-home/smart-home.js', () => ({
  getAllDevices: vi.fn().mockResolvedValue([]),
  controlDevice: vi.fn().mockResolvedValue('Success'),
  activateScene: vi.fn().mockResolvedValue('Scene activated'),
}));

vi.mock('../services/identity/ecobee-api.js', () => ({
  getThermostatStatus: vi.fn().mockResolvedValue({
    success: true,
    data: { currentTemp: 70, targetHeat: 70, mode: 'home', humidity: 45 },
  }),
  setTemperature: vi.fn().mockResolvedValue({ success: true, data: 'Temperature set' }),
  setClimateMode: vi.fn().mockResolvedValue({ success: true, data: 'Climate set' }),
}));

vi.mock('../services/identity/ecobee-auth.js', () => ({
  isEcobeeConfigured: vi.fn().mockResolvedValue(false),
}));

// Import after mocks
import {
  getVibeState,
  activateVibe,
  getAvailablePresets,
  getPreset,
  VIBE_PRESETS,
} from '../services/vibe/vibe-service.js';
import { getAllDevices } from '../tools/domains/smart-home/smart-home.js';
import { isEcobeeConfigured } from '../services/identity/ecobee-auth.js';

describe('Vibe Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VIBE_PRESETS', () => {
    it('should have all required presets', () => {
      const requiredPresets = ['focus', 'relax', 'energize', 'sleep', 'social'];
      for (const preset of requiredPresets) {
        expect(VIBE_PRESETS[preset]).toBeDefined();
      }
    });

    it('each preset should have required properties', () => {
      for (const [id, preset] of Object.entries(VIBE_PRESETS)) {
        expect(preset.id).toBe(id);
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.description.length).toBeGreaterThan(10);
      }
    });

    it('presets with lights should have valid brightness values', () => {
      for (const preset of Object.values(VIBE_PRESETS)) {
        if (preset.lights) {
          expect(preset.lights.brightness).toBeGreaterThanOrEqual(0);
          expect(preset.lights.brightness).toBeLessThanOrEqual(100);
        }
      }
    });

    it('presets with temperature should have reasonable values', () => {
      for (const preset of Object.values(VIBE_PRESETS)) {
        if (preset.temperature) {
          expect(preset.temperature.target).toBeGreaterThanOrEqual(60);
          expect(preset.temperature.target).toBeLessThanOrEqual(80);
          expect(['home', 'away', 'sleep']).toContain(preset.temperature.mode);
        }
      }
    });
  });

  describe('getAvailablePresets', () => {
    it('should return all presets', () => {
      const presets = getAvailablePresets();
      expect(presets.length).toBe(Object.keys(VIBE_PRESETS).length);
    });

    it('each preset should have an id and name', () => {
      const presets = getAvailablePresets();
      for (const preset of presets) {
        expect(preset.id).toBeDefined();
        expect(preset.name).toBeDefined();
      }
    });
  });

  describe('getPreset', () => {
    it('should return preset by id', () => {
      const preset = getPreset('focus');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('focus');
      expect(preset?.name).toBe('Focus');
    });

    it('should return undefined for invalid id', () => {
      const preset = getPreset('invalid-preset-id');
      expect(preset).toBeUndefined();
    });
  });

  describe('getVibeState', () => {
    it('should return state structure', async () => {
      const state = await getVibeState('test-user');

      expect(state).toHaveProperty('activePreset');
      expect(state).toHaveProperty('music');
      expect(state).toHaveProperty('lights');
      expect(state).toHaveProperty('temperature');
    });

    it('should show disconnected when no devices', async () => {
      vi.mocked(getAllDevices).mockResolvedValue([]);
      vi.mocked(isEcobeeConfigured).mockResolvedValue(false);

      const state = await getVibeState('test-user');

      expect(state.lights.connected).toBe(false);
      expect(state.temperature.connected).toBe(false);
    });

    it('should show connected when devices exist', async () => {
      vi.mocked(getAllDevices).mockResolvedValue([
        { id: 'light.living', name: 'Living Room', type: 'light', state: 'on', platform: 'home_assistant' },
      ]);
      vi.mocked(isEcobeeConfigured).mockResolvedValue(true);

      const state = await getVibeState('test-user');

      expect(state.lights.connected).toBe(true);
      expect(state.temperature.connected).toBe(true);
    });
  });

  describe('activateVibe', () => {
    it('should return error for invalid preset', async () => {
      const result = await activateVibe('test-user', 'invalid-preset');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should activate valid preset', async () => {
      const result = await activateVibe('test-user', 'focus');

      expect(result.success).toBe(true);
      expect(result.preset).toBe('focus');
      expect(result.message).toContain('Focus');
    });

    it('should set music when preset has music', async () => {
      const result = await activateVibe('test-user', 'focus');

      expect(result.applied.music).toBe(true);
    });

    it('should not set lights when no lights connected', async () => {
      vi.mocked(getAllDevices).mockResolvedValue([]);

      const result = await activateVibe('test-user', 'focus');

      expect(result.applied.lights).toBe(false);
    });

    it('should set lights when lights are connected', async () => {
      vi.mocked(getAllDevices).mockResolvedValue([
        { id: 'light.living', name: 'Living Room', type: 'light', state: 'on', platform: 'home_assistant' },
      ]);

      const result = await activateVibe('test-user', 'focus');

      expect(result.applied.lights).toBe(true);
    });

    it('should not set temperature when thermostat not connected', async () => {
      vi.mocked(isEcobeeConfigured).mockResolvedValue(false);

      const result = await activateVibe('test-user', 'focus');

      expect(result.applied.temperature).toBe(false);
    });
  });
});

describe('Vibe Presets Content', () => {
  it('focus preset should have work-appropriate settings', () => {
    const focus = VIBE_PRESETS.focus;
    expect(focus.lights?.brightness).toBeGreaterThan(60); // Bright for work
    expect(focus.lights?.colorTemp).toBeGreaterThan(4500); // Cool/daylight
    expect(focus.temperature?.target).toBeLessThan(72); // Cooler for alertness
    expect(focus.music?.energy).toBe('low'); // Not distracting
  });

  it('sleep preset should have restful settings', () => {
    const sleep = VIBE_PRESETS.sleep;
    expect(sleep.lights?.brightness).toBeLessThan(20); // Dim
    expect(sleep.lights?.colorTemp).toBeLessThan(2500); // Very warm
    expect(sleep.temperature?.mode).toBe('sleep'); // Sleep mode on thermostat
  });

  it('social preset should have inviting settings', () => {
    const social = VIBE_PRESETS.social;
    expect(social.lights?.brightness).toBeGreaterThan(50); // Visible but not harsh
    expect(social.lights?.colorTemp).toBeLessThan(4000); // Warm/cozy
    expect(social.music?.energy).toBe('medium'); // Background music
  });
});

