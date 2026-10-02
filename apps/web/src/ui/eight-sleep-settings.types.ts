/**
 * Eight Sleep settings - status and callback types. Extracted from eight-sleep-settings.ui.ts.
 */

export interface SleepSummary {
  date: string;
  score: number;
  sleepDuration: number;
  sleepEfficiency: number;
  timeToSleep: number;
  timesAwake: number;
  stages: {
    awake: number;
    light: number;
    deep: number;
    rem: number;
  };
  averageHrv: number;
  averageHeartRate: number;
  lowestHeartRate: number;
}

export interface TemperatureState {
  currentLevel: number;
  targetLevel: number;
  active: boolean;
  scheduleEnabled: boolean;
}

export interface Biometrics {
  averageHrv: number;
  averageRestingHeartRate: number;
  averageRespiratoryRate: number;
  hrvTrend: 'improving' | 'declining' | 'stable';
}

export interface EightSleepStatus {
  connected: boolean;
  lastNightSleep?: SleepSummary | null;
  temperature?: TemperatureState | null;
  biometrics?: Biometrics | null;
  error?: string;
}

export interface EightSleepSettingsCallbacks {
  onClose?: () => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}
