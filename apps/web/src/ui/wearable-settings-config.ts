/**
 * Wearable settings - types, defaults, icons and provider list. Extracted from wearable-settings.ui.ts.
 */

export type WearableProvider = 'apple_health' | 'fitbit' | 'garmin' | 'oura' | 'whoop';

export interface WearableStatus {
  status: Record<string, 'connected' | 'disconnected' | 'pending'>;
  /** Providers the server has OAuth credentials for (others show "Coming Soon") */
  configured: Partial<Record<WearableProvider, boolean>>;
  /** Where to start linking each provider (OAuth route or native deep link) */
  loginUrls: Partial<Record<WearableProvider, string>>;
  enabledProviders: WearableProvider[];
  config: {
    syncIntervalMinutes: number;
    enableStressDetection: boolean;
    enableSleepAnalysis: boolean;
    enableActivityTracking: boolean;
    privacyMode: 'raw' | 'aggregated' | 'insights_only';
  };
}

/** One provider from GET /wearables/status (real OAuth token store) */
export interface ProviderConnection {
  provider: WearableProvider;
  configured: boolean;
  linked: boolean;
  login_url: string | null;
}

export const DEFAULT_CONFIG: WearableStatus['config'] = {
  syncIntervalMinutes: 15,
  enableStressDetection: true,
  enableSleepAnalysis: true,
  enableActivityTracking: true,
  privacyMode: 'aggregated',
};

export interface WearableSettingsCallbacks {
  onClose?: () => void;
  onConnectionChange?: (provider: WearableProvider, connected: boolean) => void;
}

// ============================================================================
// PROVIDER INFO
// ============================================================================

// ============================================================================
// ICONS (Lucide SVG - 2px stroke, rounded corners)
// ============================================================================

export const ICONS = {
  // Provider icons
  heartPulse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>
  </svg>`,
  watch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="6"/>
    <polyline points="12 10 12 12 13 13"/>
    <path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"/>
    <path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"/>
  </svg>`,
  run: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="17" cy="5" r="2"/>
    <path d="M9 20h6"/>
    <path d="m4 17 3-5 2.5 2 4-5 3.5 6"/>
  </svg>`,
  ring: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="8"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,
  chartLine: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3v18h18"/>
    <path d="m19 9-5 5-4-4-3 3"/>
  </svg>`,
  // UI icons
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>`,
};

// ============================================================================
// PROVIDER INFO
// ============================================================================

// Availability comes from the server (GET /wearables/status → configured)
export const PROVIDERS: Array<{
  id: WearableProvider;
  icon: string;
}> = [
  { id: 'apple_health', icon: ICONS.heartPulse },
  { id: 'fitbit', icon: ICONS.watch },
  { id: 'garmin', icon: ICONS.run },
  { id: 'oura', icon: ICONS.ring },
  { id: 'whoop', icon: ICONS.chartLine },
];
