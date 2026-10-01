/**
 * Vibe Controller - temperature formatting (user unit preference)
 */

import type { UserPreferences } from './types.js';

function getUserPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem('ferni_preferences');
    if (stored) {
      const prefs = JSON.parse(stored) as Partial<UserPreferences>;
      return {
        temperatureUnit: prefs.temperatureUnit ?? 'fahrenheit',
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { temperatureUnit: 'fahrenheit' };
}

function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9);
}

export function formatTemperature(fahrenheit: number): string {
  const prefs = getUserPreferences();
  if (prefs.temperatureUnit === 'celsius') {
    return `${fahrenheitToCelsius(fahrenheit)}°C`;
  }
  return `${fahrenheit}°F`;
}

export function formatTargetTemperature(fahrenheit: number): string {
  const prefs = getUserPreferences();
  if (prefs.temperatureUnit === 'celsius') {
    return `${fahrenheitToCelsius(fahrenheit)}°`;
  }
  return `${fahrenheit}°`;
}
