/**
 * Platform bridge globals (Capacitor runtime, Electron preload). Extracted from platform.ts.
 */

/** Capacitor global interface (injected by Capacitor runtime) */
export interface CapacitorGlobal {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
  Plugins: {
    Haptics?: {
      impact: (options: { style: string }) => Promise<void>;
      notification: (options: { type: string }) => Promise<void>;
      selectionStart: () => Promise<void>;
      selectionChanged: () => Promise<void>;
      selectionEnd: () => Promise<void>;
    };
    StatusBar?: {
      setStyle: (options: { style: string }) => Promise<void>;
      setBackgroundColor: (options: { color: string }) => Promise<void>;
      hide: () => Promise<void>;
      show: () => Promise<void>;
    };
    SplashScreen?: {
      hide: (options?: { fadeOutDuration?: number }) => Promise<void>;
      show: (options?: { fadeInDuration?: number; autoHide?: boolean }) => Promise<void>;
    };
    App?: {
      addListener: (event: string, callback: (data: unknown) => void) => { remove: () => void };
      getState: () => Promise<{ isActive: boolean }>;
    };
    Keyboard?: {
      hide: () => Promise<void>;
      show: () => Promise<void>;
      setAccessoryBarVisible: (options: { isVisible: boolean }) => Promise<void>;
    };
  };
}

/** Electron API interface (exposed via preload script) */
export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  getSystemTheme: () => Promise<'light' | 'dark'>;
  /** Returns an unsubscribe function (older desktop builds return nothing) */
  onSystemThemeChange: (callback: (theme: 'light' | 'dark') => void) => (() => void) | void;
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  getVersion: () => string;
  reportError: (error: Error, context?: Record<string, unknown>) => void;
}
