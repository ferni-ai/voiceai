/**
 * Platform Detection
 *
 * The web app runs in a browser or inside the Electron desktop shell. There is
 * no native mobile shell around it: the iOS app is native Swift
 * (apps/ios-native) and talks to the server directly.
 */

import { createLogger } from './logger.js';

const log = createLogger('Platform');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Supported platforms */
export type Platform = 'web' | 'electron';

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
  // The Electron preload script sets this
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return 'electron';
  }
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
export const isDesktop = (): boolean => isElectron();

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
  log.error('Error:', error, context);
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
 * Log the platform and sync Electron with the system theme.
 * Call this early in app startup.
 */
export async function initPlatform(): Promise<void> {
  const p = platform();
  log.info(`🌐 Platform detected: ${p}`);

  if (isElectron()) {
    // Sync with system theme
    const theme = await getSystemTheme();
    log.info(`🖥️ Electron system theme: ${theme}`);
  }
}
