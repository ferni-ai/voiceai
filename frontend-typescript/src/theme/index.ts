/**
 * VoiceAI Theme System
 *
 * Provides theme management for the TypeScript frontend.
 * Uses CSS custom properties from the design system.
 */

export type ThemeName = 'midnight' | 'zen';
// Frontend persona IDs - using canonical IDs
export type PersonaId =
  | 'ferni'
  | 'peter-john'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'nayan-patel';

export interface ThemeMeta {
  name: string;
  description: string;
  mode: 'light' | 'dark';
}

export const THEMES: Record<ThemeName, ThemeMeta> = {
  midnight: {
    name: 'Midnight Gold',
    description: 'Rich dark theme with warm gold accents',
    mode: 'dark',
  },
  zen: {
    name: 'Zen Garden',
    description: 'Clean, natural, serene light theme',
    mode: 'light',
  },
};

export const PERSONA_IDS: PersonaId[] = [
  'ferni',
  'peter-john',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'nayan-patel',
];

const STORAGE_KEY = 'voiceai-theme';

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Set the active theme with smooth transition animation
 */
export function setTheme(theme: ThemeName, animate = true): void {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');

  // Skip if already on this theme
  if (currentTheme === theme) return;

  // Add transitioning class for smooth animation
  if (animate && currentTheme) {
    html.classList.add('theme-transitioning');

    // Remove transitioning class after animation completes
    setTimeout(() => {
      html.classList.remove('theme-transitioning');
    }, 450); // Slightly longer than CSS transition (400ms)
  }

  // Apply the theme
  html.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);

  // Update meta theme color for iOS Safari
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute(
      'content',
      theme === 'zen' ? '#fafaf9' : '#08080c'
    );
  }

  // Update body background for iOS Safari address bar
  document.body.style.backgroundColor =
    theme === 'zen' ? '#fafaf9' : '#08080c';

  // Dispatch custom event for listeners
  window.dispatchEvent(
    new CustomEvent('themechange', { detail: { theme } })
  );
}

/**
 * Get the current theme
 */
export function getTheme(): ThemeName {
  return (
    (document.documentElement.getAttribute('data-theme') as ThemeName) ||
    'zen'
  );
}

/**
 * Toggle between themes
 */
export function toggleTheme(): ThemeName {
  const current = getTheme();
  const next = current === 'midnight' ? 'zen' : 'midnight';
  setTheme(next);
  return next;
}

/**
 * Initialize theme - defaults to zen theme
 * No animation on initial load for instant appearance
 */
export function initTheme(): ThemeName {
  // Ensure default persona is set on body
  if (!document.body.getAttribute('data-persona')) {
    document.body.setAttribute('data-persona', 'ferni');
  }
  
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
  if (stored && THEMES[stored]) {
    setTheme(stored, false); // No animation on init
    return stored;
  }

  // Default to zen theme
  setTheme('zen', false); // No animation on init
  return 'zen';
}

/**
 * Listen for system theme changes
 */
export function watchSystemTheme(callback?: (theme: ThemeName) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e: MediaQueryListEvent) => {
    // Only auto-switch if user hasn't manually set a preference
    if (!localStorage.getItem(STORAGE_KEY)) {
      const theme = e.matches ? 'midnight' : 'zen';
      setTheme(theme);
      callback?.(theme);
    }
  };

  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
}

// ============================================================================
// PERSONA MANAGEMENT
// ============================================================================

/**
 * Set the active persona (for persona-specific colors)
 */
export function setPersona(persona: PersonaId): void {
  document.body.setAttribute('data-persona', persona);

  // Dispatch custom event
  window.dispatchEvent(
    new CustomEvent('personachange', { detail: { persona } })
  );
}

/**
 * Get the current persona
 */
export function getPersona(): PersonaId {
  return (document.body.getAttribute('data-persona') as PersonaId) || 'ferni';
}

// ============================================================================
// CSS VARIABLE ACCESS
// ============================================================================

/**
 * Get a CSS custom property value
 */
export function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Set a CSS custom property value (for runtime overrides)
 */
export function setCSSVar(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value);
}

/**
 * Get all theme colors as an object
 */
export function getThemeColors(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const colors: Record<string, string> = {};

  // Extract all --color-* variables
  const colorVars = [
    'background-primary',
    'background-secondary',
    'background-tertiary',
    'background-elevated',
    'text-primary',
    'text-secondary',
    'text-muted',
    'accent-primary',
    'accent-hover',
    'accent-glow',
    'semantic-success',
    'semantic-error',
    'semantic-warning',
    'semantic-info',
  ];

  colorVars.forEach((name) => {
    colors[name] = style.getPropertyValue(`--color-${name}`).trim();
  });

  return colors;
}

/**
 * Get persona colors
 */
export function getPersonaColors(): Record<string, string> {
  const style = getComputedStyle(document.body);
  return {
    primary: style.getPropertyValue('--persona-primary').trim(),
    secondary: style.getPropertyValue('--persona-secondary').trim(),
    glow: style.getPropertyValue('--persona-glow').trim(),
    tint: style.getPropertyValue('--persona-tint').trim(),
  };
}

// ============================================================================
// TIME-AWARE AMBIENT WARMTH
// Like the changing light in WALL-E - golden mornings, cool midday, warm evenings
// ============================================================================

type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

interface AmbientConfig {
  warmth: number; // 0-1, how warm/golden the tint
  brightness: number; // 0-1, overall brightness modifier
  saturation: number; // 0-1, color saturation
  hue: number; // Hue shift in degrees
}

const TIME_CONFIGS: Record<TimeOfDay, AmbientConfig> = {
  dawn: { warmth: 0.6, brightness: 0.9, saturation: 0.85, hue: 15 }, // Golden pink
  morning: { warmth: 0.4, brightness: 1.0, saturation: 0.95, hue: 10 }, // Warm gold
  midday: { warmth: 0.0, brightness: 1.0, saturation: 1.0, hue: 0 }, // Neutral
  afternoon: { warmth: 0.2, brightness: 0.95, saturation: 0.9, hue: 5 }, // Slight warmth
  evening: { warmth: 0.5, brightness: 0.85, saturation: 0.8, hue: 20 }, // Amber glow
  night: { warmth: 0.1, brightness: 0.8, saturation: 0.7, hue: -5 }, // Cool, calm
};

/**
 * Get current time of day
 */
function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Apply ambient warmth based on time of day
 * Creates that WALL-E feeling of living in a world with changing light
 */
export function updateAmbientWarmth(): void {
  const timeOfDay = getTimeOfDay();
  const config = TIME_CONFIGS[timeOfDay];
  const root = document.documentElement;

  // Set CSS variables for ambient effects
  root.style.setProperty('--ambient-warmth', config.warmth.toString());
  root.style.setProperty('--ambient-brightness', config.brightness.toString());
  root.style.setProperty('--ambient-saturation', config.saturation.toString());
  root.style.setProperty('--ambient-hue', `${config.hue}deg`);

  // Set time-of-day class for specific styling
  root.setAttribute('data-time', timeOfDay);

  // Dispatch event for other components
  window.dispatchEvent(
    new CustomEvent('ambientchange', { detail: { timeOfDay, config } })
  );
}

/**
 * Start automatic ambient updates (every 5 minutes)
 */
export function startAmbientCycle(): () => void {
  // Initial update
  updateAmbientWarmth();

  // Update every 5 minutes
  const interval = setInterval(updateAmbientWarmth, 5 * 60 * 1000);

  return () => clearInterval(interval);
}

/**
 * Get current time of day info
 */
export function getAmbientInfo(): { timeOfDay: TimeOfDay; config: AmbientConfig } {
  const timeOfDay = getTimeOfDay();
  return { timeOfDay, config: TIME_CONFIGS[timeOfDay] };
}

// ============================================================================
// ANIMATION HELPERS
// ============================================================================

/**
 * Get animation duration in milliseconds
 */
export function getDuration(name: string): number {
  const value = getCSSVar(`--duration-${name}`);
  return parseInt(value, 10) || 200;
}

/**
 * Get easing function
 */
export function getEasing(name: string): string {
  return getCSSVar(`--ease-${name}`) || 'ease';
}

// ============================================================================
// REACT-STYLE HOOKS (for vanilla JS)
// ============================================================================

type ThemeListener = (theme: ThemeName) => void;
type PersonaListener = (persona: PersonaId) => void;

const themeListeners = new Set<ThemeListener>();
const personaListeners = new Set<PersonaListener>();

/**
 * Subscribe to theme changes
 */
export function onThemeChange(callback: ThemeListener): () => void {
  themeListeners.add(callback);

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<{ theme: ThemeName }>;
    callback(customEvent.detail.theme);
  };

  window.addEventListener('themechange', handler);

  return () => {
    themeListeners.delete(callback);
    window.removeEventListener('themechange', handler);
  };
}

/**
 * Subscribe to persona changes
 */
export function onPersonaChange(callback: PersonaListener): () => void {
  personaListeners.add(callback);

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<{ persona: PersonaId }>;
    callback(customEvent.detail.persona);
  };

  window.addEventListener('personachange', handler);

  return () => {
    personaListeners.delete(callback);
    window.removeEventListener('personachange', handler);
  };
}
