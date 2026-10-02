/**
 * Apple Health settings - data and callback types. Extracted from apple-health-settings.ui.ts.
 */

export interface SleepSummary {
  inBed: number;
  asleep: number;
  awake: number;
  rem: number;
  deep: number;
  core: number;
  quality?: number;
}

export interface ActivitySummary {
  steps: number;
  distance: number;
  activeEnergy: number;
  exerciseMinutes: number;
  standHours: number;
}

export interface HeartSummary {
  resting?: number;
  average?: number;
  min?: number;
  max?: number;
  hrv?: number;
}

export interface AppleHealthStatus {
  connected: boolean;
  deviceName?: string;
  lastSync?: string;
}

export interface AppleHealthSummary {
  date: string;
  sleep?: SleepSummary;
  activity?: ActivitySummary;
  heart?: HeartSummary;
  steps?: number;
  mindfulMinutes?: number;
}

export interface AppleHealthSettingsCallbacks {
  onDisconnected?: () => void;
  onClose?: () => void;
}
