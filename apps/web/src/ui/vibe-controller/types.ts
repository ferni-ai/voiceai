/**
 * Vibe Controller - shared types
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VibePresetUI {
  id: string;
  name: string;
  icon: string;
  description: string;
  music?: {
    genre?: string;
    energy?: 'low' | 'medium' | 'high';
    playlist?: string;
  };
  lights?: {
    brightness: number; // 0-100
    colorTemp: number; // 2700-6500K (warm to cool)
    color?: string; // hex for accent
  };
  temperature?: {
    target: number; // Fahrenheit
    mode: 'home' | 'away' | 'sleep';
  };
}

export interface VibeState {
  activePreset: string | null;
  music: {
    playing: boolean;
    track?: string;
    artist?: string;
    volume: number;
  };
  lights: {
    connected: boolean;
    brightness: number;
    colorTemp: number;
    color?: string;
  };
  temperature: {
    connected: boolean;
    current: number;
    target: number;
    mode: string;
  };
}

export interface VibeControllerCallbacks {
  onClose?: () => void;
  onVibeChanged?: (preset: string) => void;
}

// Loading state tracking
export interface LoadingState {
  fetchingState: boolean;
  activatingPreset: string | null;
  adjustingVolume: boolean;
  adjustingBrightness: boolean;
  adjustingColorTemp: boolean;
  adjustingTemperature: boolean;
  connectingLights: boolean;
  connectingThermostat: boolean;
}

export interface UserPreferences {
  temperatureUnit: 'fahrenheit' | 'celsius';
}
