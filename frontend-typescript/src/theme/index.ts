/**
 * VoiceAI Theme System
 *
 * Provides theme management for the TypeScript frontend.
 * Uses CSS custom properties from the design system.
 */

export type ThemeName = 'midnight' | 'zen';
export type PersonaId =
  | 'ferni'
  | 'jack-bogle'
  | 'peter-lynch'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor';

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
  'jack-bogle',
  'peter-lynch',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
];

const STORAGE_KEY = 'voiceai-theme';

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Set the active theme
 */
export function setTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);

  // Update meta theme color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute(
      'content',
      theme === 'zen' ? '#fafaf9' : '#08080c'
    );
  }

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
    'midnight'
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
 * Initialize theme from localStorage or system preference
 */
export function initTheme(): ThemeName {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
  if (stored && THEMES[stored]) {
    setTheme(stored);
    return stored;
  }

  // Check system preference
  const prefersDark = window.matchMedia(
    '(prefers-color-scheme: dark)'
  ).matches;
  const theme: ThemeName = prefersDark ? 'midnight' : 'zen';
  setTheme(theme);
  return theme;
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
    const detail = (e as CustomEvent).detail;
    callback(detail.theme);
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
    const detail = (e as CustomEvent).detail;
    callback(detail.persona);
  };

  window.addEventListener('personachange', handler);

  return () => {
    personaListeners.delete(callback);
    window.removeEventListener('personachange', handler);
  };
}
