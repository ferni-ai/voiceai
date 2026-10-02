/**
 * Oura settings - status and callback types. Extracted from oura-settings.ui.ts.
 */

export interface OuraSleepSummary {
  date: string;
  score: number;
  totalSleep: number;
  efficiency: number;
  remSleep: number;
  deepSleep: number;
  lightSleep: number;
  averageHrv: number;
  averageHeartRate: number;
}

export interface OuraReadinessSummary {
  date: string;
  score: number;
  temperatureDeviation: number;
  contributors: {
    activityBalance: number;
    bodyTemperature: number;
    hrvBalance: number;
    previousNight: number;
    restingHeartRate: number;
    sleepBalance: number;
  };
}

export interface OuraActivitySummary {
  date: string;
  score: number;
  steps: number;
  activeCalories: number;
  highActivityTime: number;
  mediumActivityTime: number;
}

export interface OuraStatus {
  connected: boolean;
  sleep?: OuraSleepSummary;
  readiness?: OuraReadinessSummary;
  activity?: OuraActivitySummary;
  error?: string;
}

export interface OuraSettingsCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onClose?: () => void;
}
