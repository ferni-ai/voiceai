/**
 * Vibe & Home Automation Synthetic E2E Tests
 *
 * Dynamic synthetic tests for validating vibe/home automation flows:
 * - All 15 vibe presets
 * - Voice command routing
 * - Smart home device coordination
 * - Graceful degradation
 * - Error handling
 *
 * Run with:
 *   pnpm vitest run tests/synthetic/vibe-synthetic-e2e.test.ts
 *   pnpm vitest run tests/synthetic/vibe-synthetic-e2e.test.ts --reporter=verbose
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MockSmartHome,
  createConnectedHome,
  createPartialHome,
  createEmptyHome,
  createCircuitOpenHome,
  createSlowHome,
  createFlakyHome,
  MOCK_VIBE_PRESETS,
} from './mocks/mock-smart-home.js';
import {
  HAPPY_PATH_SCENARIOS,
  PARTIAL_FAILURE_SCENARIOS,
  FULL_FAILURE_SCENARIOS,
  EDGE_CASE_SCENARIOS,
  VOICE_COMMAND_SCENARIOS,
  SMART_HOME_SCENARIOS,
  mapVoiceCommandToVibe,
  getScenarioSummary,
} from './scenarios/vibe-scenarios.js';
import {
  VibeTestRunner,
  createVitestCases,
  ALL_VIBE_SCENARIOS,
} from './runner/vibe-test-runner.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Don't need external mocks - we're testing our own mock system

// ============================================================================
// TEST SUITE STATISTICS
// ============================================================================

describe('Vibe Test Suite Statistics', () => {
  it('should have comprehensive scenario coverage', () => {
    const summary = getScenarioSummary();

    console.log('\n📊 Vibe Test Scenario Summary:');
    console.log(`   Total Scenarios: ${summary.total}`);
    console.log('   By Category:');
    Object.entries(summary.byCategory).forEach(([cat, count]) => {
      console.log(`     - ${cat}: ${count}`);
    });

    // Verify minimum coverage
    expect(summary.total).toBeGreaterThanOrEqual(25);
    expect(summary.byCategory['happy_path']).toBeGreaterThanOrEqual(5);
    expect(summary.byCategory['partial_failure']).toBeGreaterThanOrEqual(3);
    expect(summary.byCategory['full_failure']).toBeGreaterThanOrEqual(3);
    expect(summary.byCategory['edge_case']).toBeGreaterThanOrEqual(4);
    expect(summary.byCategory['voice_command']).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// 1. HAPPY PATH SCENARIOS
// ============================================================================

describe('Happy Path - Vibe Activation', () => {
  const cases = createVitestCases(HAPPY_PATH_SCENARIOS);

  it.each(cases)('$name', async ({ run, timeout }) => {
    const result = await run();
    expect(result.passed).toBe(true);
    expect(result.appliedState.musicSet).toBe(true);
    expect(result.appliedState.lightsSet).toBe(true);
    expect(result.appliedState.temperatureSet).toBe(true);
  }, 10000);
});

// ============================================================================
// 2. PARTIAL FAILURE SCENARIOS
// ============================================================================

describe('Partial Failure - Graceful Degradation', () => {
  const cases = createVitestCases(PARTIAL_FAILURE_SCENARIOS);

  it.each(cases)('$name', async ({ run }) => {
    const result = await run();
    expect(result.passed).toBe(true);

    // Partial activation should have at least one successful component
    const hasSuccess =
      result.appliedState.lightsSet ||
      result.appliedState.temperatureSet ||
      result.appliedState.musicSet;
    expect(hasSuccess).toBe(true);
  }, 10000);
});

// ============================================================================
// 3. FULL FAILURE SCENARIOS
// ============================================================================

describe('Full Failure - Error Handling', () => {
  const cases = createVitestCases(FULL_FAILURE_SCENARIOS);

  it.each(cases)('$name', async ({ run }) => {
    const result = await run();
    expect(result.passed).toBe(true);
    // Full failure scenarios should match expected outcome
  }, 10000);
});

// ============================================================================
// 4. EDGE CASE SCENARIOS
// ============================================================================

describe('Edge Cases', () => {
  const cases = createVitestCases(EDGE_CASE_SCENARIOS);

  it.each(cases)('$name', async ({ run, timeout }) => {
    const result = await run();
    expect(result.passed).toBe(true);
  }, 15000);
});

// ============================================================================
// 5. VOICE COMMAND ROUTING
// ============================================================================

describe('Voice Command Routing', () => {
  describe('mapVoiceCommandToVibe', () => {
    it('should map direct vibe commands', () => {
      expect(mapVoiceCommandToVibe('set the vibe to focus')).toBe('focus');
      expect(mapVoiceCommandToVibe('set the vibe to relax')).toBe('relax');
      expect(mapVoiceCommandToVibe('vibe to sleep')).toBe('sleep');
    });

    it('should map implicit focus commands', () => {
      expect(mapVoiceCommandToVibe('I need to focus')).toBe('focus');
      expect(mapVoiceCommandToVibe('help me concentrate')).toBe('focus');
      expect(mapVoiceCommandToVibe('time to work')).toBe('focus');
    });

    it('should map relaxation commands', () => {
      expect(mapVoiceCommandToVibe('I need to relax')).toBe('relax');
      expect(mapVoiceCommandToVibe('wind down time')).toBe('relax');
      expect(mapVoiceCommandToVibe('make it cozy')).toBe('relax');
    });

    it('should map sleep commands', () => {
      expect(mapVoiceCommandToVibe('getting ready for bed')).toBe('sleep');
      expect(mapVoiceCommandToVibe('good night mode')).toBe('sleep');
      expect(mapVoiceCommandToVibe('time to sleep')).toBe('sleep');
    });

    it('should map activity commands', () => {
      expect(mapVoiceCommandToVibe('movie night')).toBe('movie');
      expect(mapVoiceCommandToVibe('meditation mode')).toBe('meditation');
      expect(mapVoiceCommandToVibe('workout vibe')).toBe('workout');
      expect(mapVoiceCommandToVibe('set up for a party')).toBe('social');
    });

    it('should return null for unrecognized commands', () => {
      expect(mapVoiceCommandToVibe('what is the weather')).toBeNull();
      expect(mapVoiceCommandToVibe('play some music')).toBeNull();
      expect(mapVoiceCommandToVibe('call mom')).toBeNull();
    });
  });

  const cases = createVitestCases(VOICE_COMMAND_SCENARIOS);

  it.each(cases)('$name', async ({ run }) => {
    const result = await run();
    expect(result.passed).toBe(true);
  }, 10000);
});

// ============================================================================
// 6. MOCK SMART HOME UNIT TESTS
// ============================================================================

describe('MockSmartHome', () => {
  let mockHome: MockSmartHome;

  beforeEach(() => {
    mockHome = new MockSmartHome(createConnectedHome());
  });

  describe('Device Discovery', () => {
    it('should return all devices', async () => {
      const devices = await mockHome.getAllDevices();

      expect(devices.length).toBeGreaterThan(0);
      expect(devices.some((d) => d.type === 'light')).toBe(true);
      expect(devices.some((d) => d.type === 'thermostat')).toBe(true);
    });

    it('should filter by device type', async () => {
      const lights = await mockHome.getDevicesByType('light');

      expect(lights.every((d) => d.type === 'light')).toBe(true);
      expect(lights.length).toBe(3); // Connected home has 3 lights
    });

    it('should filter by room', async () => {
      const livingRoom = await mockHome.getDevicesByRoom('Living Room');

      expect(livingRoom.length).toBeGreaterThan(0);
      expect(livingRoom.every((d) => d.room === 'Living Room')).toBe(true);
    });

    it('should find device by name', async () => {
      const device = await mockHome.getDevice('living room');

      expect(device).not.toBeNull();
      expect(device?.name.toLowerCase()).toContain('living');
    });
  });

  describe('Device Control', () => {
    it('should turn on a light', async () => {
      const result = await mockHome.controlDevice('light.living_room', 'on');

      expect(result.success).toBe(true);
      expect(result.device?.state).toBe('on');
    });

    it('should turn off a light', async () => {
      const result = await mockHome.controlDevice('light.living_room', 'off');

      expect(result.success).toBe(true);
      expect(result.device?.state).toBe('off');
    });

    it('should toggle a light', async () => {
      // Start with light on
      await mockHome.controlDevice('light.bedroom', 'on');

      // Toggle off
      const result = await mockHome.controlDevice('light.bedroom', 'toggle');

      expect(result.success).toBe(true);
      expect(result.device?.state).toBe('off');
    });

    it('should set brightness', async () => {
      const result = await mockHome.setLightBrightness('light.living_room', 75);

      expect(result.success).toBe(true);
      expect(result.device?.attributes.brightness).toBe(75);
    });

    it('should set color temperature', async () => {
      const result = await mockHome.setLightColorTemp('light.living_room', 4500);

      expect(result.success).toBe(true);
      expect(result.device?.attributes.colorTemp).toBe(4500);
    });

    it('should set thermostat', async () => {
      const result = await mockHome.setThermostat(72);

      expect(result.success).toBe(true);
      expect(result.device?.attributes.targetTemp).toBe(72);
    });

    it('should return error for unknown device', async () => {
      const result = await mockHome.controlDevice('nonexistent_device', 'on');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Failure Simulation', () => {
    it('should simulate circuit breaker open', async () => {
      mockHome.setPlatformBehavior('home_assistant', 'circuit_open');

      const result = await mockHome.controlDevice('light.living_room', 'on');

      expect(result.success).toBe(false);
      expect(result.error).toContain('circuit');
    });

    it('should simulate timeout', async () => {
      mockHome.setPlatformBehavior('ecobee', 'timeout');

      const result = await mockHome.setThermostat(70);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should simulate device offline', async () => {
      mockHome.setDeviceOnline('light.bedroom', false);

      const result = await mockHome.controlDevice('light.bedroom', 'on');

      expect(result.success).toBe(false);
      expect(result.error).toContain('offline');
    });
  });

  describe('Vibe Activation', () => {
    it('should activate focus vibe', async () => {
      const result = await mockHome.activateVibe(MOCK_VIBE_PRESETS.focus);

      expect(result.success).toBe(true);
      expect(result.preset).toBe('focus');
      expect(result.applied.lights).toBe(true);
      expect(result.applied.temperature).toBe(true);
      expect(result.applied.music).toBe(true);
    });

    it('should activate sleep vibe with dim lights', async () => {
      const result = await mockHome.activateVibe(MOCK_VIBE_PRESETS.sleep);

      expect(result.success).toBe(true);
      expect(result.preset).toBe('sleep');
      expect(result.message).toContain('Sleep');
    });

    it('should handle partial failure gracefully', async () => {
      mockHome.setPlatformBehavior('ecobee', 'timeout');

      const result = await mockHome.activateVibe(MOCK_VIBE_PRESETS.focus);

      // Should still succeed for lights
      expect(result.applied.lights).toBe(true);
      expect(result.applied.temperature).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Command History', () => {
    it('should track command history', async () => {
      await mockHome.controlDevice('light.living_room', 'on');
      await mockHome.controlDevice('light.bedroom', 'off');
      await mockHome.setThermostat(72);

      const history = mockHome.getCommandHistory();

      expect(history.length).toBe(3);
      expect(history[0].deviceId).toBe('light.living_room');
      expect(history[0].result).toBe('success');
    });

    it('should reset state and history', async () => {
      await mockHome.controlDevice('light.living_room', 'off');

      mockHome.reset();

      const history = mockHome.getCommandHistory();
      expect(history.length).toBe(0);

      const device = await mockHome.getDevice('light.living_room');
      expect(device?.state).toBe('on'); // Back to default
    });
  });
});

// ============================================================================
// 7. VIBE PRESETS VALIDATION
// ============================================================================

describe('Vibe Presets', () => {
  it('should have all expected presets', () => {
    const expectedPresets = [
      'focus',
      'relax',
      'energize',
      'sleep',
      'social',
    ];

    for (const preset of expectedPresets) {
      expect(MOCK_VIBE_PRESETS[preset]).toBeDefined();
    }
  });

  it('should have valid brightness values (0-100)', () => {
    for (const preset of Object.values(MOCK_VIBE_PRESETS)) {
      if (preset.lights) {
        expect(preset.lights.brightness).toBeGreaterThanOrEqual(0);
        expect(preset.lights.brightness).toBeLessThanOrEqual(100);
      }
    }
  });

  it('should have valid color temperature (2000-7000K)', () => {
    for (const preset of Object.values(MOCK_VIBE_PRESETS)) {
      if (preset.lights) {
        expect(preset.lights.colorTemp).toBeGreaterThanOrEqual(2000);
        expect(preset.lights.colorTemp).toBeLessThanOrEqual(7000);
      }
    }
  });

  it('should have valid temperature values (60-80F)', () => {
    for (const preset of Object.values(MOCK_VIBE_PRESETS)) {
      if (preset.temperature) {
        expect(preset.temperature.target).toBeGreaterThanOrEqual(60);
        expect(preset.temperature.target).toBeLessThanOrEqual(80);
      }
    }
  });

  it('should have appropriate settings for activities', () => {
    // Focus = bright, cool lights
    expect(MOCK_VIBE_PRESETS.focus.lights?.brightness).toBeGreaterThan(70);
    expect(MOCK_VIBE_PRESETS.focus.lights?.colorTemp).toBeGreaterThan(4500);

    // Sleep = very dim, warm lights
    expect(MOCK_VIBE_PRESETS.sleep.lights?.brightness).toBeLessThan(20);
    expect(MOCK_VIBE_PRESETS.sleep.lights?.colorTemp).toBeLessThan(2500);

    // Energize = maximum brightness
    expect(MOCK_VIBE_PRESETS.energize.lights?.brightness).toBe(100);
  });
});

// ============================================================================
// 8. TEST RUNNER INTEGRATION
// ============================================================================

describe('VibeTestRunner', () => {
  it('should run all scenarios', async () => {
    const runner = new VibeTestRunner({
      scenarios: HAPPY_PATH_SCENARIOS.slice(0, 3),
      verbose: false,
    });

    const summary = await runner.runAll();

    expect(summary.total).toBe(3);
    expect(summary.passed + summary.failed).toBe(3);
    expect(summary.duration).toBeGreaterThan(0);
  });

  it('should run a single scenario by ID', async () => {
    const runner = new VibeTestRunner({ verbose: false });

    const result = await runner.runScenario('vibe-001');

    expect(result).not.toBeNull();
    expect(result?.scenario.id).toBe('vibe-001');
  });

  it('should run scenarios by category', async () => {
    const runner = new VibeTestRunner({ verbose: false });

    const summary = await runner.runByCategory('happy_path');

    expect(summary.total).toBe(HAPPY_PATH_SCENARIOS.length);
  });

  it('should track progress', async () => {
    const progressCalls: number[] = [];

    const runner = new VibeTestRunner({
      scenarios: HAPPY_PATH_SCENARIOS.slice(0, 2),
      verbose: false,
      onProgress: (completed, total) => {
        progressCalls.push(completed);
      },
    });

    await runner.runAll();

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1]).toBe(2);
  });
});

// ============================================================================
// 9. SMART HOME SCENARIOS
// ============================================================================

describe('Smart Home Direct Control', () => {
  const cases = createVitestCases(SMART_HOME_SCENARIOS);

  it.each(cases)('$name', async ({ run }) => {
    const result = await run();
    expect(result.passed).toBe(true);
  }, 10000);
});

// ============================================================================
// 10. FACTORY FUNCTIONS
// ============================================================================

describe('Mock Home Factories', () => {
  it('createConnectedHome should have all devices online', async () => {
    const config = createConnectedHome();
    const mockHome = new MockSmartHome(config);

    const devices = await mockHome.getAllDevices();
    expect(devices.every((d) => d.online)).toBe(true);
  });

  it('createPartialHome should have some devices offline', async () => {
    const config = createPartialHome();

    expect(config.devices.some((d) => !d.online)).toBe(true);
    expect(config.behaviors.ecobee).toBe('timeout');
  });

  it('createEmptyHome should have no devices', () => {
    const config = createEmptyHome();

    expect(config.devices.length).toBe(0);
    expect(config.platforms.length).toBe(0);
  });

  it('createCircuitOpenHome should have all circuits open', () => {
    const config = createCircuitOpenHome();

    expect(config.behaviors.home_assistant).toBe('circuit_open');
    expect(config.behaviors.hue).toBe('circuit_open');
    expect(config.behaviors.ecobee).toBe('circuit_open');
  });

  it('createSlowHome should have high latency', () => {
    const config = createSlowHome();

    expect(config.latency).toBeGreaterThanOrEqual(500); // Slow but not too slow (500ms per operation)
  });

  it('createFlakyHome should have failure rate', () => {
    const config = createFlakyHome();

    expect(config.failureRate).toBeGreaterThan(0);
    expect(config.failureRate).toBeLessThanOrEqual(1);
  });
});
