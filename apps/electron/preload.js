/**
 * Voice AI Desktop - Preload Script
 * 
 * This script runs in the renderer process before the web page loads.
 * It safely exposes specific Electron APIs to the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

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
});

// Log that preload script has loaded
console.log('✅ Voice AI Desktop preload script loaded');

