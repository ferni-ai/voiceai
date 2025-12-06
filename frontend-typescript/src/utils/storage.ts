/**
 * Storage Utilities
 * 
 * Type-safe localStorage helpers with JSON serialization.
 */

import { createLogger } from './logger.js';

const log = createLogger('Storage');

// ============================================================================
// TYPE-SAFE STORAGE
// ============================================================================

/**
 * Get a string value from localStorage.
 */
export function getString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    log.warn(`Failed to read localStorage key: ${key}`);
    return null;
  }
}

/**
 * Get a string value with a default fallback.
 */
export function getStringOrDefault(key: string, defaultValue: string): string {
  return getString(key) ?? defaultValue;
}

/**
 * Set a string value in localStorage.
 */
export function setString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    log.warn(`Failed to write localStorage key: ${key}`);
  }
}

/**
 * Get and parse a JSON value from localStorage.
 */
export function getJSON<T>(key: string): T | null {
  const value = getString(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    log.warn(`Failed to parse localStorage key: ${key}`);
    return null;
  }
}

/**
 * Get a JSON value with a default fallback.
 */
export function getJSONOrDefault<T>(key: string, defaultValue: T): T {
  return getJSON<T>(key) ?? defaultValue;
}

/**
 * Set a JSON value in localStorage.
 */
export function setJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    log.warn(`Failed to write localStorage key: ${key}`);
  }
}

/**
 * Remove a value from localStorage.
 */
export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    log.warn(`Failed to remove localStorage key: ${key}`);
  }
}

/**
 * Clear all localStorage (use with caution).
 */
export function clearAll(): void {
  try {
    localStorage.clear();
  } catch {
    log.warn('Failed to clear localStorage');
  }
}

// ============================================================================
// PREFIXED STORAGE (for namespacing)
// ============================================================================

/**
 * Create a namespaced storage helper.
 */
export function createNamespacedStorage(prefix: string) {
  const prefixKey = (key: string) => `${prefix}_${key}`;

  return {
    getString: (key: string) => getString(prefixKey(key)),
    setString: (key: string, value: string) => setString(prefixKey(key), value),
    getJSON: <T>(key: string) => getJSON<T>(prefixKey(key)),
    setJSON: <T>(key: string, value: T) => setJSON(prefixKey(key), value),
    remove: (key: string) => remove(prefixKey(key)),
  };
}

// ============================================================================
// VOICEAI STORAGE INSTANCE
// ============================================================================

/**
 * Namespaced storage for VoiceAI application.
 */
export const voiceAIStorage = createNamespacedStorage('voiceai');

