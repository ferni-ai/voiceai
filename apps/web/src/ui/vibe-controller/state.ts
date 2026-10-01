/**
 * Vibe Controller - module state
 */

import type { LoadingState, VibeControllerCallbacks, VibeState } from './types.js';

// ============================================================================
// STATE
// ============================================================================

// Shared view state (read by renderers, written by actions and the public API).
// Panel lifecycle state lives in index.ts; setup-view state in setup-flows.ts.

export let callbacks: VibeControllerCallbacks = {};

export function setVibeCallbacks(value: VibeControllerCallbacks): void {
  callbacks = value;
}

export const currentState: VibeState = {
  activePreset: null,
  music: { playing: false, volume: 50 },
  lights: { connected: false, brightness: 50, colorTemp: 4000 },
  temperature: { connected: false, current: 70, target: 70, mode: 'home' },
};

// Loading state tracking
export const loadingState: LoadingState = {
  fetchingState: false,
  activatingPreset: null,
  adjustingVolume: false,
  adjustingBrightness: false,
  adjustingColorTemp: false,
  adjustingTemperature: false,
  connectingLights: false,
  connectingThermostat: false,
};

// ============================================================================
// RENDER HOOK
// ============================================================================

// The view renderer is registered by index.ts so that action modules can
// re-render without importing the render modules (which import them).
let renderer: () => void = () => {};

export function setRenderer(fn: () => void): void {
  renderer = fn;
}

export function render(): void {
  renderer();
}
