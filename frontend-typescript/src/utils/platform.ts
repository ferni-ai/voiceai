/**
 * Platform Detection & Native Feature Bridge
 *
 * Detects the runtime environment (Web, Electron, Capacitor/iOS) and provides
 * unified APIs for native features like haptics, status bar, and storage.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Supported platforms */
export type Platform = 'web' | 'electron' | 'ios' | 'android';

/** Native haptic feedback intensities */
export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

/** Capacitor global interface (injected by Capacitor runtime) */
interface CapacitorGlobal {
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
interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  getSystemTheme: () => Promise<'light' | 'dark'>;
  onSystemThemeChange: (callback: (theme: 'light' | 'dark') => void) => void;
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  getVersion: () => string;
  reportError: (error: Error, context?: Record<string, unknown>) => void;
}

// Extend Window interface
declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
    electronAPI?: ElectronAPI;
  }
}

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

/**
 * Detect the current platform.
 */
export function getPlatform(): Platform {
  // Check for Electron first (preload script sets this)
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return 'electron';
  }

  // Check for Capacitor (native iOS/Android)
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    const platform = window.Capacitor.getPlatform();
    if (platform === 'ios') return 'ios';
    if (platform === 'android') return 'android';
  }

  // Default to web
  return 'web';
}

/** Cached platform value */
let cachedPlatform: Platform | null = null;

/**
 * Get platform with caching (for performance).
 */
export function platform(): Platform {
  if (cachedPlatform === null) {
    cachedPlatform = getPlatform();
  }
  return cachedPlatform;
}

/**
 * Platform check utilities.
 */
export const isWeb = (): boolean => platform() === 'web';
export const isElectron = (): boolean => platform() === 'electron';
export const isIOS = (): boolean => platform() === 'ios';
export const isAndroid = (): boolean => platform() === 'android';
export const isNative = (): boolean => isIOS() || isAndroid();
export const isDesktop = (): boolean => isElectron();
export const isMobile = (): boolean => isIOS() || isAndroid();

// ============================================================================
// NATIVE HAPTICS
// ============================================================================

/**
 * Trigger native haptic feedback.
 * Falls back gracefully on unsupported platforms.
 */
export async function haptic(style: HapticStyle = 'light'): Promise<void> {
  // iOS/Android: Use Capacitor Haptics plugin
  if (isNative()) {
    const Haptics = window.Capacitor?.Plugins?.Haptics;
    if (!Haptics) return;

    try {
      switch (style) {
        case 'selection':
          await Haptics.selectionChanged();
          break;
        case 'success':
          await Haptics.notification({ type: 'SUCCESS' });
          break;
        case 'warning':
          await Haptics.notification({ type: 'WARNING' });
          break;
        case 'error':
          await Haptics.notification({ type: 'ERROR' });
          break;
        case 'light':
          await Haptics.impact({ style: 'LIGHT' });
          break;
        case 'medium':
          await Haptics.impact({ style: 'MEDIUM' });
          break;
        case 'heavy':
          await Haptics.impact({ style: 'HEAVY' });
          break;
        default:
          await Haptics.impact({ style: 'LIGHT' });
      }
    } catch (err) {
      console.debug('Haptics error:', err);
    }
    return;
  }

  // Web: Try Vibration API (limited support)
  if ('vibrate' in navigator) {
    const patterns: Record<HapticStyle, number | number[]> = {
      light: 10,
      medium: 25,
      heavy: 50,
      selection: 5,
      success: [15, 50, 15],
      warning: [25, 50, 25],
      error: [50, 100, 50],
    };
    navigator.vibrate(patterns[style] || 10);
  }
}

// ============================================================================
// STATUS BAR (iOS/Android)
// ============================================================================

/**
 * Configure the native status bar.
 */
export async function setStatusBarStyle(style: 'light' | 'dark'): Promise<void> {
  if (!isNative()) return;

  const StatusBar = window.Capacitor?.Plugins?.StatusBar;
  if (!StatusBar) return;

  try {
    // iOS uses 'Light' for light content (dark bg), 'Dark' for dark content (light bg)
    await StatusBar.setStyle({ style: style === 'light' ? 'LIGHT' : 'DARK' });
  } catch (err) {
    console.debug('StatusBar error:', err);
  }
}

/**
 * Set status bar background color.
 */
export async function setStatusBarColor(color: string): Promise<void> {
  if (!isNative()) return;

  const StatusBar = window.Capacitor?.Plugins?.StatusBar;
  if (!StatusBar) return;

  try {
    await StatusBar.setBackgroundColor({ color });
  } catch (err) {
    console.debug('StatusBar color error:', err);
  }
}

// ============================================================================
// SPLASH SCREEN (iOS/Android)
// ============================================================================

/**
 * Hide the native splash screen.
 */
export async function hideSplashScreen(fadeOutMs = 200): Promise<void> {
  if (!isNative()) return;

  const SplashScreen = window.Capacitor?.Plugins?.SplashScreen;
  if (!SplashScreen) return;

  try {
    await SplashScreen.hide({ fadeOutDuration: fadeOutMs });
  } catch (err) {
    console.debug('SplashScreen error:', err);
  }
}

// ============================================================================
// APP LIFECYCLE (iOS/Android)
// ============================================================================

/**
 * Listen for app going to background/foreground.
 */
export function onAppStateChange(callback: (isActive: boolean) => void): () => void {
  if (!isNative()) {
    // Web fallback using visibility API
    const handler = () => callback(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }

  const App = window.Capacitor?.Plugins?.App;
  if (!App) return () => {};

  const listener = App.addListener('appStateChange', (state: unknown) => {
    const { isActive } = state as { isActive: boolean };
    callback(isActive);
  });

  return () => listener?.remove();
}

// ============================================================================
// KEYBOARD (iOS/Android)
// ============================================================================

/**
 * Hide the virtual keyboard.
 */
export async function hideKeyboard(): Promise<void> {
  if (!isNative()) {
    // Web fallback - blur active element
    (document.activeElement as HTMLElement)?.blur();
    return;
  }

  const Keyboard = window.Capacitor?.Plugins?.Keyboard;
  if (!Keyboard) return;

  try {
    await Keyboard.hide();
  } catch (err) {
    console.debug('Keyboard hide error:', err);
  }
}

// ============================================================================
// ELECTRON SPECIFIC
// ============================================================================

/**
 * Get system theme (Electron only).
 */
export async function getSystemTheme(): Promise<'light' | 'dark'> {
  if (isElectron() && window.electronAPI?.getSystemTheme) {
    return window.electronAPI.getSystemTheme();
  }

  // Web fallback - use media query
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Listen for system theme changes (Electron).
 */
export function onSystemThemeChange(callback: (theme: 'light' | 'dark') => void): () => void {
  if (isElectron() && window.electronAPI?.onSystemThemeChange) {
    window.electronAPI.onSystemThemeChange(callback);
    // Electron doesn't return a cleanup function, so return no-op
    return () => {};
  }

  // Web fallback - use media query listener
  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (mediaQuery) {
    const handler = (e: MediaQueryListEvent) => callback(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }

  return () => {};
}

/**
 * Get app version (Electron).
 */
export function getAppVersion(): string {
  if (isElectron() && window.electronAPI?.getVersion) {
    return window.electronAPI.getVersion();
  }
  return '1.0.0';
}

/**
 * Report error to native error tracking (Electron/Sentry).
 */
export function reportError(error: Error, context?: Record<string, unknown>): void {
  if (isElectron() && window.electronAPI?.reportError) {
    window.electronAPI.reportError(error, context);
    return;
  }
  // Fallback: just log
  console.error('Error:', error, context);
}

// ============================================================================
// NATIVE STORE (Electron persistent storage)
// ============================================================================

/**
 * Get value from native store (Electron).
 * Falls back to localStorage on web.
 */
export async function storeGet<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  if (isElectron() && window.electronAPI?.store) {
    const value = await window.electronAPI.store.get(key);
    return (value as T) ?? defaultValue;
  }

  // Fallback to localStorage
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Set value in native store (Electron).
 * Falls back to localStorage on web.
 */
export async function storeSet(key: string, value: unknown): Promise<void> {
  if (isElectron() && window.electronAPI?.store) {
    await window.electronAPI.store.set(key, value);
    return;
  }

  // Fallback to localStorage
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage might be full or disabled
  }
}

// ============================================================================
// INITIALIZATION HELPER
// ============================================================================

/**
 * Initialize native platform features.
 * Call this early in app startup.
 */
export async function initPlatform(): Promise<void> {
  const p = platform();
  console.log(`🌐 Platform detected: ${p}`);

  if (isNative()) {
    // Set status bar to match our dark theme
    await setStatusBarStyle('light'); // Light content on dark background
    await setStatusBarColor('#0d0d1a');

    // Hide splash screen with fade
    // Note: Using a short delay allows the web app to render first
    setTimeout(() => {
      void hideSplashScreen(300);
    }, 100);

    // Listen for app lifecycle changes
    onAppStateChange((isActive) => {
      console.log(`📱 App ${isActive ? 'active' : 'background'}`);
      // Could pause/resume audio, save state, etc.
    });
  }

  if (isElectron()) {
    // Sync with system theme
    const theme = await getSystemTheme();
    console.log(`🖥️ Electron system theme: ${theme}`);
  }
}

