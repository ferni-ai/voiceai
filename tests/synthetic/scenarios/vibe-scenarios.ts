/**
 * Vibe & Home Automation Test Scenarios
 *
 * Comprehensive test scenarios covering:
 * - Vibe activation (all 15 presets)
 * - Voice command routing
 * - Smart home device control
 * - Error handling and graceful degradation
 * - Multi-device coordination
 */

import type {
  MockSmartHomeConfig,
  VibePresetConfig,
  ResponseBehavior,
  SmartHomePlatform,
} from '../mocks/mock-smart-home.js';
import {
  createConnectedHome,
  createPartialHome,
  createEmptyHome,
  createCircuitOpenHome,
  createSlowHome,
  createFlakyHome,
  MOCK_VIBE_PRESETS,
} from '../mocks/mock-smart-home.js';

// ============================================================================
// TYPES
// ============================================================================

export type ExpectedOutcome =
  | 'vibe_activated'
  | 'partial_activation'
  | 'activation_failed'
  | 'no_devices'
  | 'lights_only'
  | 'temperature_only'
  | 'timeout'
  | 'graceful_degradation';

export interface ExpectedState {
  lightsSet?: boolean;
  temperatureSet?: boolean;
  musicSet?: boolean;
  lightBrightness?: number;
  lightColorTemp?: number;
  targetTemperature?: number;
}

export interface TestAssertion {
  description: string;
  check: (result: VibeTestResult) => boolean;
}

export interface VibeTestScenario {
  id: string;
  name: string;
  description: string;
  category: 'happy_path' | 'partial_failure' | 'full_failure' | 'edge_case' | 'voice_command';

  // Input
  vibePreset?: string;
  voiceCommand?: string;
  userContext?: {
    userId?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    preferences?: Record<string, unknown>;
  };

  // Mock configuration
  mockHome: MockSmartHomeConfig;

  // Expected results
  expectedOutcome: ExpectedOutcome;
  expectedState?: ExpectedState;

  // Additional assertions
  assertions?: TestAssertion[];

  // Timing
  timeout?: number;
}

export interface VibeTestResult {
  scenario: VibeTestScenario;
  passed: boolean;
  outcome: ExpectedOutcome;
  duration: number;
  appliedState: {
    lightsSet: boolean;
    temperatureSet: boolean;
    musicSet: boolean;
    lightBrightness?: number;
    targetTemperature?: number;
  };
  deviceResults: Array<{
    device: string;
    success: boolean;
    error?: string;
  }>;
  assertions: Array<{
    description: string;
    passed: boolean;
    details?: string;
  }>;
  error?: string;
}

// ============================================================================
// HAPPY PATH SCENARIOS
// ============================================================================

export const HAPPY_PATH_SCENARIOS: VibeTestScenario[] = [
  {
    id: 'vibe-001',
    name: 'Focus Vibe - Full Success',
    description: 'All devices respond, focus vibe fully activated',
    category: 'happy_path',
    vibePreset: 'focus',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    expectedState: {
      lightsSet: true,
      temperatureSet: true,
      musicSet: true,
      lightBrightness: 80,
      lightColorTemp: 5000,
      targetTemperature: 68,
    },
    assertions: [
      {
        description: 'All lights set to 80% brightness',
        check: (r) => r.appliedState.lightBrightness === 80,
      },
      {
        description: 'Thermostat set to 68°F',
        check: (r) => r.appliedState.targetTemperature === 68,
      },
      {
        description: 'Music settings applied',
        check: (r) => r.appliedState.musicSet === true,
      },
    ],
  },

  {
    id: 'vibe-002',
    name: 'Relax Vibe - Full Success',
    description: 'All devices respond, relax vibe fully activated',
    category: 'happy_path',
    vibePreset: 'relax',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    expectedState: {
      lightsSet: true,
      temperatureSet: true,
      musicSet: true,
      lightBrightness: 40,
      lightColorTemp: 2700,
      targetTemperature: 72,
    },
    assertions: [
      {
        description: 'Lights dimmed for relaxation',
        check: (r) => (r.appliedState.lightBrightness ?? 0) <= 50,
      },
      {
        description: 'Vibe successfully activated',
        check: (r) => r.outcome === 'vibe_activated',
      },
    ],
  },

  {
    id: 'vibe-003',
    name: 'Sleep Vibe - Full Success',
    description: 'Bedtime vibe with very dim lights',
    category: 'happy_path',
    vibePreset: 'sleep',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    expectedState: {
      lightsSet: true,
      temperatureSet: true,
      lightBrightness: 5,
      targetTemperature: 67,
    },
    assertions: [
      {
        description: 'Lights nearly off for sleep',
        check: (r) => (r.appliedState.lightBrightness ?? 100) <= 10,
      },
      {
        description: 'Sleep temperature achieved',
        check: (r) => r.appliedState.targetTemperature === 67,
      },
    ],
  },

  {
    id: 'vibe-004',
    name: 'Energize Vibe - Full Success',
    description: 'High energy vibe with bright lights',
    category: 'happy_path',
    vibePreset: 'energize',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    expectedState: {
      lightsSet: true,
      temperatureSet: true,
      lightBrightness: 100,
      lightColorTemp: 6500,
      targetTemperature: 66,
    },
    assertions: [
      {
        description: 'Lights at maximum brightness',
        check: (r) => r.appliedState.lightBrightness === 100,
      },
      {
        description: 'Cooler temperature for alertness',
        check: (r) => (r.appliedState.targetTemperature ?? 0) <= 68,
      },
    ],
  },

  {
    id: 'vibe-005',
    name: 'Social Vibe - Full Success',
    description: 'Gathering mode with warm ambient lighting',
    category: 'happy_path',
    vibePreset: 'social',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    expectedState: {
      lightsSet: true,
      temperatureSet: true,
      lightBrightness: 70,
      targetTemperature: 70,
    },
    assertions: [
      {
        description: 'Medium-bright lights for socializing',
        check: (r) => {
          const brightness = r.appliedState.lightBrightness ?? 0;
          return brightness >= 60 && brightness <= 80;
        },
      },
    ],
  },
];

// ============================================================================
// PARTIAL FAILURE SCENARIOS
// ============================================================================

export const PARTIAL_FAILURE_SCENARIOS: VibeTestScenario[] = [
  {
    id: 'vibe-pf-001',
    name: 'Focus Vibe - Lights Only',
    description: 'Thermostat offline, lights work',
    category: 'partial_failure',
    vibePreset: 'focus',
    mockHome: {
      ...createConnectedHome(),
      behaviors: {
        home_assistant: 'success',
        hue: 'success',
        ecobee: 'timeout',
      },
    },
    expectedOutcome: 'lights_only', // Lights work, temp fails
    expectedState: {
      lightsSet: true,
      temperatureSet: false,
      musicSet: true,
    },
    assertions: [
      {
        description: 'Lights still controlled despite thermostat failure',
        check: (r) => r.appliedState.lightsSet === true,
      },
      {
        description: 'Temperature not applied',
        check: (r) => r.appliedState.temperatureSet === false,
      },
    ],
  },

  {
    id: 'vibe-pf-002',
    name: 'Relax Vibe - Temperature Only',
    description: 'Hue bridge offline, thermostat works',
    category: 'partial_failure',
    vibePreset: 'relax',
    mockHome: {
      ...createConnectedHome(),
      behaviors: {
        home_assistant: 'circuit_open',
        hue: 'circuit_open',
        ecobee: 'success',
      },
    },
    expectedOutcome: 'temperature_only', // Lights fail, temp succeeds
    expectedState: {
      lightsSet: false,
      temperatureSet: true,
    },
    assertions: [
      {
        description: 'Temperature set despite light failure',
        check: (r) => r.appliedState.temperatureSet === true,
      },
    ],
  },

  {
    id: 'vibe-pf-003',
    name: 'Sleep Vibe - One Light Offline',
    description: 'One light offline, others work',
    category: 'partial_failure',
    vibePreset: 'sleep',
    mockHome: createPartialHome(), // Has one offline device
    expectedOutcome: 'lights_only', // Lights work (some), temp may fail
    assertions: [
      {
        description: 'Some lights responded',
        check: (r) => r.deviceResults.some((d) => d.success),
      },
      {
        description: 'Partial success achieved',
        check: (r) => r.appliedState.lightsSet === true || r.appliedState.musicSet === true,
      },
    ],
  },
];

// ============================================================================
// FULL FAILURE SCENARIOS
// ============================================================================

export const FULL_FAILURE_SCENARIOS: VibeTestScenario[] = [
  {
    id: 'vibe-ff-001',
    name: 'Focus Vibe - All Circuit Breakers Open',
    description: 'All platforms circuit breakers tripped',
    category: 'full_failure',
    vibePreset: 'focus',
    mockHome: createCircuitOpenHome(),
    // When all circuits are open, music still works (simulated) but no smart home devices respond
    // The outcome is 'no_devices' meaning: music plays but home automation failed
    expectedOutcome: 'no_devices',
    assertions: [
      {
        description: 'No devices controlled',
        check: (r) => !r.appliedState.lightsSet && !r.appliedState.temperatureSet,
      },
      {
        description: 'Music still applied',
        check: (r) => r.appliedState.musicSet === true,
      },
    ],
  },

  {
    id: 'vibe-ff-002',
    name: 'Vibe - No Devices Configured',
    description: 'Empty home, no smart devices',
    category: 'full_failure',
    vibePreset: 'focus',
    mockHome: createEmptyHome(),
    expectedOutcome: 'no_devices',
    assertions: [
      {
        description: 'Gracefully handles empty device list',
        check: (r) => r.deviceResults.length === 0,
      },
      {
        description: 'Music still set (no device required)',
        check: (r) => r.appliedState.musicSet === true,
      },
    ],
  },

  {
    id: 'vibe-ff-003',
    name: 'Vibe - All Devices Offline',
    description: 'All devices marked offline',
    category: 'full_failure',
    vibePreset: 'relax',
    mockHome: {
      ...createConnectedHome(),
      devices: createConnectedHome().devices.map((d) => ({ ...d, online: false })),
    },
    // Music still works but all smart home devices are offline
    expectedOutcome: 'no_devices',
    assertions: [
      {
        description: 'No devices controlled successfully',
        check: (r) => !r.appliedState.lightsSet && !r.appliedState.temperatureSet,
      },
      {
        description: 'Music still works',
        check: (r) => r.appliedState.musicSet === true,
      },
    ],
  },
];

// ============================================================================
// EDGE CASE SCENARIOS
// ============================================================================

export const EDGE_CASE_SCENARIOS: VibeTestScenario[] = [
  {
    id: 'vibe-ec-001',
    name: 'Unknown Vibe Preset',
    description: 'Request for non-existent vibe',
    category: 'edge_case',
    vibePreset: 'party_mode_extreme', // Doesn't exist
    mockHome: createConnectedHome(),
    expectedOutcome: 'activation_failed',
    assertions: [
      {
        description: 'Handles unknown preset gracefully',
        check: (r) => r.error !== undefined && r.error.includes('Unknown'),
      },
    ],
  },

  {
    id: 'vibe-ec-002',
    name: 'High Latency Home',
    description: 'Devices respond slowly',
    category: 'edge_case',
    vibePreset: 'focus',
    mockHome: createSlowHome(),
    expectedOutcome: 'vibe_activated',
    timeout: 10000,
    assertions: [
      {
        description: 'Completes despite latency',
        check: (r) => r.passed,
      },
      {
        description: 'Duration reflects latency',
        check: (r) => r.duration > 1000, // At least 1 second
      },
    ],
  },

  {
    id: 'vibe-ec-003',
    name: 'Flaky Home - Intermittent Failures',
    description: 'Intermittent failures with 30% rate - may succeed or degrade',
    category: 'edge_case',
    vibePreset: 'focus',
    mockHome: createFlakyHome(),
    // Flaky homes can go either way - we just want to ensure it doesn't crash
    expectedOutcome: 'vibe_activated', // May succeed due to retries/randomness
    assertions: [
      {
        description: 'Completes without crashing',
        check: (r) => r.outcome === 'vibe_activated' || r.outcome === 'graceful_degradation',
      },
    ],
  },

  {
    id: 'vibe-ec-004',
    name: 'Single Device Home',
    description: 'Only one light, no thermostat',
    category: 'edge_case',
    vibePreset: 'relax',
    mockHome: {
      ...createEmptyHome(),
      devices: [
        {
          id: 'light.only',
          name: 'Only Light',
          type: 'light',
          platform: 'hue',
          state: 'on',
          attributes: { brightness: 50 },
          online: true,
        },
      ],
    },
    expectedOutcome: 'lights_only',
    assertions: [
      {
        description: 'Single light controlled',
        check: (r) => r.appliedState.lightsSet === true,
      },
      {
        description: 'No temperature device available',
        check: (r) => r.appliedState.temperatureSet === false,
      },
    ],
  },

  {
    id: 'vibe-ec-005',
    name: 'Thermostat Only Home',
    description: 'Only thermostat, no lights',
    category: 'edge_case',
    vibePreset: 'sleep',
    mockHome: {
      ...createEmptyHome(),
      devices: [
        {
          id: 'thermo.only',
          name: 'Only Thermostat',
          type: 'thermostat',
          platform: 'ecobee',
          state: 'on',
          attributes: { temperature: 70, targetTemp: 70 },
          online: true,
        },
      ],
    },
    expectedOutcome: 'temperature_only',
    assertions: [
      {
        description: 'Temperature set',
        check: (r) => r.appliedState.temperatureSet === true,
      },
      {
        description: 'No lights available',
        check: (r) => r.appliedState.lightsSet === false,
      },
    ],
  },
];

// ============================================================================
// VOICE COMMAND SCENARIOS
// ============================================================================

export const VOICE_COMMAND_SCENARIOS: VibeTestScenario[] = [
  {
    id: 'vibe-vc-001',
    name: 'Voice: "Set the vibe to focus"',
    description: 'Standard vibe command',
    category: 'voice_command',
    voiceCommand: 'set the vibe to focus',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    assertions: [
      {
        description: 'Focus vibe activated from voice',
        check: (r) => r.passed,
      },
    ],
  },

  {
    id: 'vibe-vc-002',
    name: 'Voice: "I need to relax"',
    description: 'Implicit vibe request',
    category: 'voice_command',
    voiceCommand: 'I need to relax',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    assertions: [
      {
        description: 'Relax vibe inferred from intent',
        check: (r) => r.passed,
      },
    ],
  },

  {
    id: 'vibe-vc-003',
    name: 'Voice: "Make it cozy"',
    description: 'Casual vibe language',
    category: 'voice_command',
    voiceCommand: 'make it cozy',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'vibe-vc-004',
    name: 'Voice: "Time to focus"',
    description: 'Action-oriented command',
    category: 'voice_command',
    voiceCommand: 'time to focus',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'vibe-vc-005',
    name: 'Voice: "Getting ready for bed"',
    description: 'Bedtime intent',
    category: 'voice_command',
    voiceCommand: 'getting ready for bed',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    assertions: [
      {
        description: 'Sleep vibe from bedtime intent',
        check: (r) => r.passed,
      },
    ],
  },

  {
    id: 'vibe-vc-006',
    name: 'Voice: "Movie night mode"',
    description: 'Movie vibe activation',
    category: 'voice_command',
    voiceCommand: 'movie night mode',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'vibe-vc-007',
    name: 'Voice: "Help me concentrate"',
    description: 'Focus intent via concentration',
    category: 'voice_command',
    voiceCommand: 'help me concentrate',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'vibe-vc-008',
    name: 'Voice: "Wind down time"',
    description: 'Evening wind-down intent',
    category: 'voice_command',
    voiceCommand: 'wind down time',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'vibe-vc-009',
    name: 'Voice: "Set up for a party"',
    description: 'Social vibe via party intent',
    category: 'voice_command',
    voiceCommand: 'set up for a party',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'vibe-vc-010',
    name: 'Voice: "Meditation mode"',
    description: 'Meditation vibe activation',
    category: 'voice_command',
    voiceCommand: 'meditation mode',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },
];

// ============================================================================
// SMART HOME DIRECT CONTROL SCENARIOS
// Note: These test direct device commands that DON'T map to vibes.
// The current vibe test runner doesn't handle direct smart home commands -
// those go through the smart-home tool executor, not the vibe service.
// These scenarios are marked as expected to fail for now and serve as
// documentation of the gap between vibe commands and direct device commands.
// ============================================================================

export const SMART_HOME_SCENARIOS: VibeTestScenario[] = [
  // Note: These are documented as GAPs - direct smart home commands
  // don't route through the vibe service. Use the smart-home tools directly.
  // See: src/tools/domains/smart-home/smart-home.ts

  // For now, we test smart home via vibe scenarios that include device control
  {
    id: 'sh-001',
    name: 'Morning vibe with lights and temp',
    description: 'Vibe command that controls multiple devices',
    category: 'voice_command',
    voiceCommand: 'time for my morning routine',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
    assertions: [
      {
        description: 'Morning vibe activated',
        check: (r) => r.appliedState.lightsSet && r.appliedState.temperatureSet,
      },
    ],
  },

  {
    id: 'sh-002',
    name: 'Dinner vibe with ambiance',
    description: 'Dinner mode via vibe command',
    category: 'voice_command',
    voiceCommand: "let's have dinner",
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'sh-003',
    name: 'Reading mode with warm lights',
    description: 'Reading vibe via voice',
    category: 'voice_command',
    voiceCommand: 'I want to read',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'sh-004',
    name: 'Gaming setup',
    description: 'Gaming vibe via voice',
    category: 'voice_command',
    voiceCommand: 'gaming time',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },

  {
    id: 'sh-005',
    name: 'Creative work mode',
    description: 'Creative vibe via voice',
    category: 'voice_command',
    voiceCommand: 'I want to create something',
    mockHome: createConnectedHome(),
    expectedOutcome: 'vibe_activated',
  },
];

// ============================================================================
// ALL SCENARIOS COMBINED
// ============================================================================

export const ALL_VIBE_SCENARIOS: VibeTestScenario[] = [
  ...HAPPY_PATH_SCENARIOS,
  ...PARTIAL_FAILURE_SCENARIOS,
  ...FULL_FAILURE_SCENARIOS,
  ...EDGE_CASE_SCENARIOS,
  ...VOICE_COMMAND_SCENARIOS,
  ...SMART_HOME_SCENARIOS,
];

// ============================================================================
// SCENARIO HELPERS
// ============================================================================

export function getScenariosByCategory(category: VibeTestScenario['category']): VibeTestScenario[] {
  return ALL_VIBE_SCENARIOS.filter((s) => s.category === category);
}

export function getScenarioById(id: string): VibeTestScenario | undefined {
  return ALL_VIBE_SCENARIOS.find((s) => s.id === id);
}

export function getQuickTestScenarios(): VibeTestScenario[] {
  // Scenarios that complete quickly (no high latency)
  return ALL_VIBE_SCENARIOS.filter((s) => !s.timeout || s.timeout < 5000);
}

export function getFullTestScenarios(): VibeTestScenario[] {
  return ALL_VIBE_SCENARIOS;
}

export function getScenarioSummary(): {
  total: number;
  byCategory: Record<string, number>;
  byOutcome: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};

  for (const scenario of ALL_VIBE_SCENARIOS) {
    byCategory[scenario.category] = (byCategory[scenario.category] || 0) + 1;
    byOutcome[scenario.expectedOutcome] = (byOutcome[scenario.expectedOutcome] || 0) + 1;
  }

  return {
    total: ALL_VIBE_SCENARIOS.length,
    byCategory,
    byOutcome,
  };
}

/**
 * Map voice command to vibe preset
 */
export function mapVoiceCommandToVibe(command: string): string | null {
  const lower = command.toLowerCase();

  // Direct vibe commands
  const vibeMatch = lower.match(/vibe\s+(?:to\s+)?(\w+)/);
  if (vibeMatch) {
    return vibeMatch[1];
  }

  // Intent mapping - ORDER MATTERS: more specific patterns first
  // Activity-specific (check before generic sleep/night)
  if (lower.includes('movie')) {
    return 'movie';
  }
  if (lower.includes('meditation') || lower.includes('meditate')) {
    return 'meditation';
  }
  if (lower.includes('workout') || lower.includes('exercise')) {
    return 'workout';
  }
  if (lower.includes('gaming') || lower.includes('game')) {
    return 'gaming';
  }
  if (lower.includes('romantic') || lower.includes('date')) {
    return 'romantic';
  }
  if (lower.includes('cooking') || lower.includes('cook')) {
    return 'cooking';
  }
  if (lower.includes('reading') || lower.match(/\bread\b/)) {
    return 'reading';
  }
  if (lower.includes('creative') || lower.includes('create')) {
    return 'creative';
  }
  if (lower.includes('dinner')) {
    return 'dinner';
  }
  if (lower.includes('party') || lower.includes('social') || lower.includes('gather')) {
    return 'social';
  }
  // Generic mood commands
  if (lower.includes('focus') || lower.includes('concentrate') || lower.includes('work')) {
    return 'focus';
  }
  if (lower.includes('relax') || lower.includes('wind down') || lower.includes('cozy')) {
    return 'relax';
  }
  if (lower.includes('sleep') || lower.includes('bed') || lower.includes('night')) {
    return 'sleep';
  }
  if (lower.includes('energize') || lower.includes('morning') || lower.includes('wake')) {
    return 'energize';
  }

  return null;
}
