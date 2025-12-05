/**
 * Voice AI Desktop - Preload Script
 * 
 * This script runs in the renderer process before the web page loads.
 * It safely exposes specific Electron APIs to the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// SENTRY FOR RENDERER PROCESS
// ============================================================================
const Sentry = require('@sentry/electron/renderer');

const SENTRY_DSN = process.env.SENTRY_DSN || '';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Renderer-specific config
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2,
  });
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,
  
  // Theme
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  onSystemThemeChange: (callback) => {
    ipcRenderer.on('system-theme-changed', (event, theme) => callback(theme));
  },
  
  // Persistent storage (alternative to localStorage for Electron)
  store: {
    get: (key) => ipcRenderer.invoke('get-store-value', key),
    set: (key, value) => ipcRenderer.invoke('set-store-value', key, value),
  },
  
  // App info
  getVersion: () => process.env.npm_package_version || '1.0.0',
  
  // Error reporting
  reportError: (error, context) => {
    if (SENTRY_DSN) {
      Sentry.captureException(error, { extra: context });
    }
  },
});

// Log that preload script has loaded
console.log('✅ Voice AI Desktop preload script loaded');
