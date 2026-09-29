/**
 * Voice AI Desktop - Preload Script
 * 
 * This script runs in the renderer process before the web page loads.
 * It safely exposes specific Electron APIs to the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Renderers are sandboxed (Electron >= 20), so this preload can only require
// 'electron'. Error reporting is forwarded to the main process over IPC.

const versionArg = process.argv.find((arg) => arg.startsWith('--app-version='));
const APP_VERSION = versionArg ? versionArg.slice('--app-version='.length) : '1.0.0';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,
  
  // Theme
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  onSystemThemeChange: (callback) => {
    const listener = (event, theme) => callback(theme);
    ipcRenderer.on('system-theme-changed', listener);
    return () => ipcRenderer.removeListener('system-theme-changed', listener);
  },
  
  // Persistent storage (alternative to localStorage for Electron)
  store: {
    get: (key) => ipcRenderer.invoke('get-store-value', key),
    set: (key, value) => ipcRenderer.invoke('set-store-value', key, value),
  },
  
  // App info
  getVersion: () => APP_VERSION,
  
  // Error reporting
  reportError: (error, context) => {
    const payload = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) };
    ipcRenderer.send('report-error', payload, context);
  },
});

// Log that preload script has loaded
console.log('✅ Voice AI Desktop preload script loaded');
