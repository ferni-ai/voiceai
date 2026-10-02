/**
 * Vibe Controller UI
 *
 * A unified interface for controlling your environment's atmosphere:
 * - Music: What you hear
 * - Color: What you see (lights/ambiance)
 * - Temperature: What you feel
 *
 * Philosophy: Ferni helps you set the vibe, not manage devices.
 * "Set the mood for focus" > "Turn on Philips Hue, set to 4000K, 80%"
 *
 * DESIGN PRINCIPLES:
 *   - Human-centered, not vendor-centered
 *   - Preset vibes for quick setup
 *   - Individual controls for fine-tuning
 *   - Warm, earthy Ferni brand colors
 *   - Smooth animations per brand guidelines
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { toast } from './whisper.ui.js';
import { t } from '../i18n/index.js';

// ============================================================================
// USER PREFERENCES
// ============================================================================

interface UserPreferences {
  temperatureUnit: 'fahrenheit' | 'celsius';
}

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

function formatTemperature(fahrenheit: number): string {
  const prefs = getUserPreferences();
  if (prefs.temperatureUnit === 'celsius') {
    return `${fahrenheitToCelsius(fahrenheit)}°C`;
  }
  return `${fahrenheit}°F`;
}

function formatTargetTemperature(fahrenheit: number): string {
  const prefs = getUserPreferences();
  if (prefs.temperatureUnit === 'celsius') {
    return `${fahrenheitToCelsius(fahrenheit)}°`;
  }
  return `${fahrenheit}°`;
}

// ============================================================================
// TYPES
// ============================================================================

interface VibePresetUI {
  id: string;
  name: string;
  icon: string;
  description: string;
  music?: {
    genre?: string;
    energy?: 'low' | 'medium' | 'high';
    playlist?: string;
  };
  lights?: {
    brightness: number; // 0-100
    colorTemp: number; // 2700-6500K (warm to cool)
    color?: string; // hex for accent
  };
  temperature?: {
    target: number; // Fahrenheit
    mode: 'home' | 'away' | 'sleep';
  };
}

interface VibeState {
  activePreset: string | null;
  music: {
    playing: boolean;
    track?: string;
    artist?: string;
    volume: number;
  };
  lights: {
    connected: boolean;
    brightness: number;
    colorTemp: number;
    color?: string;
  };
  temperature: {
    connected: boolean;
    current: number;
    target: number;
    mode: string;
  };
}

interface VibeControllerCallbacks {
  onClose?: () => void;
  onVibeChanged?: (preset: string) => void;
}

// Loading state tracking
interface LoadingState {
  fetchingState: boolean;
  activatingPreset: string | null;
  adjustingVolume: boolean;
  adjustingBrightness: boolean;
  adjustingColorTemp: boolean;
  adjustingTemperature: boolean;
  connectingLights: boolean;
  connectingThermostat: boolean;
}

const loadingState: LoadingState = {
  fetchingState: false,
  activatingPreset: null,
  adjustingVolume: false,
  adjustingBrightness: false,
  adjustingColorTemp: false,
  adjustingTemperature: false,
  connectingLights: false,
  connectingThermostat: false,
};

// ============================================================================
// PRESET VIBES - Single source of truth with UI-specific icons
// ============================================================================

// Preset icons (SVG paths for Lucide-style icons)
const PRESET_ICONS: Record<string, string> = {
  focus: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  relax: 'M17 8h1a4 4 0 1 1 0 8h-1M3 8h1a4 4 0 0 1 0 8H3zm14 0v8M3 8v8m4-4h10',
  energize: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  sleep: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  social: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  morning: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  romantic: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  workout: 'M6.5 6.5h11M6.5 17.5h11M3 12h2M19 12h2M5.5 8.5v7M18.5 8.5v7',
  movie: 'M7 2v11m0 5.93V22M2 9h5M2 15h5M17 2v4m0 14v4M22 4h-5M22 20h-5M12 6v12m-3 0h6',
  cooking: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  reading: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20M8 7h6M8 11h8',
  creative: 'M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2',
  meditation: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  gaming: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
  dinner: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
};

// Primary preset IDs (shown in main row)
const PRIMARY_PRESET_IDS = ['focus', 'relax', 'energize', 'sleep', 'social'];

// Activity preset IDs (shown in "More Vibes" section)
const ACTIVITY_PRESET_IDS = [
  'morning',
  'romantic',
  'workout',
  'movie',
  'cooking',
  'reading',
  'creative',
  'meditation',
  'gaming',
  'dinner',
];

// Build presets with UI data (icons, i18n-ready names)
function buildUIPresets(): { primary: VibePresetUI[]; activity: VibePresetUI[] } {
  // Preset data with translations
  const presetData: Record<string, { name: string; description: string; lights?: { brightness: number; colorTemp: number; color?: string }; temperature?: { target: number; mode: 'home' | 'away' | 'sleep' }; music?: { genre: string; energy: 'low' | 'medium' | 'high' } }> = {
    focus: {
      name: t('vibe.presets.focus.name', 'Focus'),
      description: t('vibe.presets.focus.description', 'Deep work mode. Calm music, bright lights, cool temp.'),
      music: { genre: 'ambient', energy: 'low' },
      lights: { brightness: 80, colorTemp: 5000 },
      temperature: { target: 68, mode: 'home' },
    },
    relax: {
      name: t('vibe.presets.relax.name', 'Relax'),
      description: t('vibe.presets.relax.description', 'Wind down. Soft jazz, warm dim lights, cozy temp.'),
      music: { genre: 'jazz', energy: 'low' },
      lights: { brightness: 40, colorTemp: 2700 },
      temperature: { target: 72, mode: 'home' },
    },
    energize: {
      name: t('vibe.presets.energize.name', 'Energize'),
      description: t('vibe.presets.energize.description', 'Get moving. Upbeat music, bright cool lights.'),
      music: { genre: 'pop', energy: 'high' },
      lights: { brightness: 100, colorTemp: 6500 },
      temperature: { target: 66, mode: 'home' },
    },
    sleep: {
      name: t('vibe.presets.sleep.name', 'Sleep'),
      description: t('vibe.presets.sleep.description', 'Time for rest. Quiet, dark, comfortable.'),
      music: { genre: 'sleep', energy: 'low' },
      lights: { brightness: 5, colorTemp: 2200 },
      temperature: { target: 67, mode: 'sleep' },
    },
    social: {
      name: t('vibe.presets.social.name', 'Gather'),
      description: t('vibe.presets.social.description', 'Having people over. Good music, warm inviting lights.'),
      music: { genre: 'indie', energy: 'medium' },
      lights: { brightness: 70, colorTemp: 3000, color: '#c4a265' },
      temperature: { target: 70, mode: 'home' },
    },
    morning: {
      name: t('vibe.presets.morning.name', 'Morning'),
      description: t('vibe.presets.morning.description', 'Start the day gently. Bright lights, comfortable temp.'),
      music: { genre: 'acoustic', energy: 'medium' },
      lights: { brightness: 90, colorTemp: 4500 },
      temperature: { target: 70, mode: 'home' },
    },
    romantic: {
      name: t('vibe.presets.romantic.name', 'Romantic'),
      description: t('vibe.presets.romantic.description', 'Date night. Soft music, dim warm lights.'),
      music: { genre: 'soul', energy: 'low' },
      lights: { brightness: 25, colorTemp: 2400 },
      temperature: { target: 72, mode: 'home' },
    },
    workout: {
      name: t('vibe.presets.workout.name', 'Workout'),
      description: t('vibe.presets.workout.description', 'Exercise time. High energy music, bright lights, cool.'),
      music: { genre: 'electronic', energy: 'high' },
      lights: { brightness: 100, colorTemp: 6000 },
      temperature: { target: 64, mode: 'home' },
    },
    movie: {
      name: t('vibe.presets.movie.name', 'Movie Night'),
      description: t('vibe.presets.movie.description', 'Cinema at home. Dim lights, immersive sound.'),
      music: { genre: 'cinematic', energy: 'low' },
      lights: { brightness: 10, colorTemp: 2400 },
      temperature: { target: 71, mode: 'home' },
    },
    cooking: {
      name: t('vibe.presets.cooking.name', 'Cooking'),
      description: t('vibe.presets.cooking.description', 'Kitchen time. Upbeat tunes, bright task lighting.'),
      music: { genre: 'world', energy: 'medium' },
      lights: { brightness: 100, colorTemp: 4000 },
      temperature: { target: 68, mode: 'home' },
    },
    reading: {
      name: t('vibe.presets.reading.name', 'Reading'),
      description: t('vibe.presets.reading.description', 'Book time. Soft background, warm reading light.'),
      music: { genre: 'classical', energy: 'low' },
      lights: { brightness: 60, colorTemp: 3000 },
      temperature: { target: 71, mode: 'home' },
    },
    creative: {
      name: t('vibe.presets.creative.name', 'Creative'),
      description: t('vibe.presets.creative.description', 'Art and projects. Inspiring music, natural light feel.'),
      music: { genre: 'lo-fi', energy: 'medium' },
      lights: { brightness: 85, colorTemp: 5500 },
      temperature: { target: 69, mode: 'home' },
    },
    meditation: {
      name: t('vibe.presets.meditation.name', 'Meditation'),
      description: t('vibe.presets.meditation.description', 'Inner peace. Nature sounds, soft ambient glow.'),
      music: { genre: 'nature', energy: 'low' },
      lights: { brightness: 20, colorTemp: 2700 },
      temperature: { target: 72, mode: 'home' },
    },
    gaming: {
      name: t('vibe.presets.gaming.name', 'Gaming'),
      description: t('vibe.presets.gaming.description', 'Game on. Dynamic lighting, comfortable temp.'),
      music: { genre: 'electronic', energy: 'medium' },
      // Fixed: Using brand-compliant teal instead of purple (#7c3aed)
      lights: { brightness: 30, colorTemp: 4500, color: '#3a6b73' },
      temperature: { target: 68, mode: 'home' },
    },
    dinner: {
      name: t('vibe.presets.dinner.name', 'Dinner'),
      description: t('vibe.presets.dinner.description', 'Mealtime ambiance. Warm glow, pleasant background.'),
      music: { genre: 'jazz', energy: 'low' },
      lights: { brightness: 50, colorTemp: 2800 },
      temperature: { target: 71, mode: 'home' },
    },
  };

  const buildPreset = (id: string): VibePresetUI => {
    const preset = presetData[id];
    return {
      id,
      name: preset?.name ?? id,
      description: preset?.description ?? '',
      icon: PRESET_ICONS[id] ?? PRESET_ICONS.focus ?? '',
      music: preset?.music ?? { genre: 'ambient' },
      lights: preset?.lights ?? { brightness: 70, colorTemp: 3000 },
      temperature: preset?.temperature ?? { target: 72, mode: 'home' as const },
    };
  };

  return {
    primary: PRIMARY_PRESET_IDS.map(buildPreset),
    activity: ACTIVITY_PRESET_IDS.map(buildPreset),
  };
}

// Get presets (rebuilt each time to pick up i18n changes)
function getPrimaryVibes(): VibePresetUI[] {
  return buildUIPresets().primary;
}

function getActivityVibes(): VibePresetUI[] {
  return buildUIPresets().activity;
}

function _getAllVibePresets(): VibePresetUI[] {
  const { primary, activity } = buildUIPresets();
  return [...primary, ...activity];
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isVisible = false;
let callbacks: VibeControllerCallbacks = {};
const currentState: VibeState = {
  activePreset: null,
  music: { playing: false, volume: 50 },
  lights: { connected: false, brightness: 50, colorTemp: 4000 },
  temperature: { connected: false, current: 70, target: 70, mode: 'home' },
};

// Focus trap elements for accessibility
let previouslyFocusedElement: HTMLElement | null = null;
let focusTrapActive = false;

// ============================================================================
// HMR CLEANUP - Prevent duplicate modals on hot reload
// ============================================================================

function cleanupOrphanedElements(): void {
  // Remove any existing vibe overlay elements (from HMR)
  document.querySelectorAll('.vibe-overlay').forEach((el) => el.remove());

  // Remove orphaned Ecobee PIN dialogs
  document.querySelectorAll('.ecobee-pin-dialog').forEach((el) => el.remove());

  // Remove orphaned style elements
  document.querySelectorAll('style').forEach((el) => {
    if (el.textContent?.includes('.vibe-overlay')) {
      el.remove();
    }
  });

  // Reset module state
  container = null;
  styleElement = null;
  isVisible = false;
  focusTrapActive = false;
}

// ============================================================================
// SAFE DOM HELPERS
// ============================================================================

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

function createSvgIcon(pathD: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const paths = pathD.split('|');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  return svg;
}

const ICONS = {
  close: 'M18 6L6 18M6 6l12 12',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  sun: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42|M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  thermometer: 'M14 4V10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z|M12 14v-4',
  play: 'M5 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  skipForward: 'M5 4l10 8-10 8V4zM19 5v14',
  volume: 'M11 5L6 9H2v6h4l5 4V5z|M19.07 4.93a10 10 0 0 1 0 14.14|M15.54 8.46a5 5 0 0 1 0 7.07',
  check: 'M20 6L9 17l-5-5',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  plug: 'M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-6 6v0a6 6 0 0 1-6-6V8Z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10',
  wifi: 'M5 12.55a11 11 0 0 1 14.08 0|M1.42 9a16 16 0 0 1 21.16 0|M8.53 16.11a6 6 0 0 1 6.95 0|M12 20h.01',
  hue: 'M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z|M9 17v4|M15 17v4',
  ecobee: 'M14 4V10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z',
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.textContent = `
    .vibe-overlay {
      position: fixed;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal-backdrop, 2000);
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ${EASING.OUT_EXPO}, visibility ${DURATION.SLOW}ms;
      padding: var(--space-md, 16px);
    }

    .vibe-overlay--visible {
      opacity: 1;
      visibility: visible;
    }

    .vibe-panel {
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      max-width: 560px;
      width: 100%;
      max-height: calc(100vh - 64px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-xl, 0 20px 60px rgba(44, 37, 32, 0.2));
      transform: scale(0.95) translateY(20px);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .vibe-overlay--visible .vibe-panel {
      transform: scale(1) translateY(0);
    }

    /* Header */
    .vibe-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .vibe-header__left {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 2px);
    }

    .vibe-header__eyebrow {
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-ferni, #3D5A45);
    }

    .vibe-header__title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    }

    .vibe-close {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .vibe-close:hover,
    .vibe-close:focus-visible {
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.05));
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-close svg {
      width: 20px;
      height: 20px;
    }

    /* Body */
    .vibe-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 24px);
    }

    /* Preset Grid */
    .vibe-presets {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-xl, 32px);
    }

    .vibe-preset {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-md, 16px) var(--space-sm, 12px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 16px);
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .vibe-preset:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      transform: translateY(-2px);
    }

    .vibe-preset:focus-visible {
      outline: 2px solid var(--color-ferni, #3D5A45);
      outline-offset: 2px;
    }

    .vibe-preset--active {
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-color: var(--color-ferni, #3D5A45);
    }

    .vibe-preset__icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-preset--active .vibe-preset__icon {
      background: var(--color-ferni, #3D5A45);
      color: white;
    }

    .vibe-preset__icon svg {
      width: 24px;
      height: 24px;
    }

    .vibe-preset__name {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-preset__desc {
      font-size: 0.75rem;
      color: var(--color-text-muted, #756A5E);
      text-align: center;
      line-height: 1.4;
    }

    /* Section */
    .vibe-section {
      margin-bottom: var(--space-lg, 24px);
    }

    .vibe-section__header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-section__icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-radius: var(--radius-md, 8px);
      color: var(--color-ferni, #3D5A45);
    }

    .vibe-section__icon svg {
      width: 18px;
      height: 18px;
    }

    .vibe-section__title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .vibe-section__status {
      margin-left: auto;
      font-size: 0.75rem;
      color: var(--color-text-muted, #756A5E);
    }

    .vibe-section__status--connected {
      color: var(--color-semantic-success, #22c55e);
    }

    /* Controls */
    .vibe-control {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-md, 12px);
    }

    .vibe-control__label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text-secondary, #5C544A);
      min-width: 80px;
    }

    .vibe-control__slider {
      flex: 1;
      height: 6px;
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-full, 9999px);
      appearance: none;
      cursor: pointer;
    }

    .vibe-control__slider::-webkit-slider-thumb {
      appearance: none;
      width: 20px;
      height: 20px;
      background: var(--color-ferni, #3D5A45);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms;
    }

    .vibe-control__slider::-webkit-slider-thumb:hover {
      transform: scale(1.15);
    }

    .vibe-control__value {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      min-width: 50px;
      text-align: right;
    }

    /* Music Player */
    .vibe-music {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
    }

    .vibe-music__now-playing {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-md, 12px);
    }

    .vibe-music__cover {
      width: 56px;
      height: 56px;
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.2));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni, #3D5A45);
    }

    .vibe-music__cover svg {
      width: 28px;
      height: 28px;
    }

    .vibe-music__info {
      flex: 1;
      min-width: 0;
    }

    .vibe-music__track {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .vibe-music__artist {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #756A5E);
    }

    .vibe-music__controls {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 8px);
    }

    .vibe-music__btn {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-ferni, #3D5A45);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-music__btn:hover {
      background: var(--color-ferni-hover, #4a6d52);
      transform: scale(1.05);
    }

    .vibe-music__btn--secondary {
      background: var(--tonal-surface-2);
      color: var(--color-text-secondary, #5C544A);
    }

    .vibe-music__btn--secondary:hover {
      background: var(--tonal-surface-3);
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-music__btn--secondary:active {
      background: var(--tonal-surface-active);
    }

    .vibe-music__btn svg {
      width: 18px;
      height: 18px;
    }

    /* Temperature Display */
    .vibe-temp {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-lg, 24px);
      padding: var(--space-lg, 24px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 16px);
    }

    .vibe-temp__btn {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      font-size: 1.5rem;
      font-weight: 500;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-temp__btn:hover {
      background: var(--color-ferni, #3D5A45);
      border-color: var(--color-ferni, #3D5A45);
      color: white;
    }

    .vibe-temp__display {
      text-align: center;
    }

    .vibe-temp__value {
      font-size: 3rem;
      font-weight: 300;
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }

    .vibe-temp__label {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #756A5E);
      margin-top: var(--space-xs, 4px);
    }

    /* Not Connected State */
    .vibe-not-connected {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--space-lg, 24px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-md, 12px);
    }

    .vibe-not-connected__icon {
      width: 48px;
      height: 48px;
      margin-bottom: var(--space-sm, 12px);
      color: var(--color-text-dimmed, #A89D90);
    }

    .vibe-not-connected__icon svg {
      width: 100%;
      height: 100%;
    }

    .vibe-not-connected__text {
      font-size: 0.875rem;
      color: var(--color-text-muted, #756A5E);
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-not-connected__btn {
      padding: var(--space-sm, 10px) var(--space-lg, 20px);
      background: var(--color-ferni, #3D5A45);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: white;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-not-connected__btn:hover {
      background: var(--color-ferni-hover, #4a6d52);
      transform: translateY(-1px);
    }

    /* More Vibes Expandable */
    .vibe-more-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm, 8px);
      width: 100%;
      padding: var(--space-sm, 12px);
      background: none;
      border: 1px dashed var(--color-border-medium, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-md, 12px);
      color: var(--color-text-muted, #756A5E);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-more-toggle:hover {
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      color: var(--color-text-primary, #2C2520);
      border-color: var(--color-ferni, #3D5A45);
    }

    .vibe-more-toggle svg {
      width: 16px;
      height: 16px;
      transition: transform ${DURATION.FAST}ms;
    }

    .vibe-more-toggle--expanded svg {
      transform: rotate(180deg);
    }

    .vibe-activity-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: var(--space-sm, 10px);
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height ${DURATION.SLOW}ms ${EASING.OUT_EXPO}, 
                  opacity ${DURATION.NORMAL}ms, 
                  margin ${DURATION.NORMAL}ms;
      margin-bottom: 0;
    }

    .vibe-activity-grid--visible {
      max-height: 500px;
      opacity: 1;
      margin-bottom: var(--space-lg, 24px);
    }

    .vibe-activity {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 6px);
      padding: var(--space-sm, 12px) var(--space-xs, 8px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border: 2px solid transparent;
      border-radius: var(--radius-md, 12px);
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }

    .vibe-activity:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      transform: translateY(-1px);
    }

    .vibe-activity--active {
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-color: var(--color-ferni, #3D5A45);
    }

    .vibe-activity__icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5C544A);
    }

    .vibe-activity--active .vibe-activity__icon {
      color: var(--color-ferni, #3D5A45);
    }

    .vibe-activity__icon svg {
      width: 20px;
      height: 20px;
    }

    .vibe-activity__name {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-secondary, #5C544A);
      text-align: center;
    }

    .vibe-activity--active .vibe-activity__name {
      color: var(--color-ferni, #3D5A45);
    }

    /* Setup Flow */
    .vibe-setup {
      padding: var(--space-lg, 24px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 16px);
      text-align: center;
    }

    .vibe-setup__icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-md, 16px);
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni, #3D5A45);
    }

    .vibe-setup__icon svg {
      width: 32px;
      height: 32px;
    }

    .vibe-setup__title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-xs, 8px) 0;
    }

    .vibe-setup__desc {
      font-size: 0.875rem;
      color: var(--color-text-muted, #756A5E);
      margin: 0 0 var(--space-lg, 24px) 0;
      line-height: 1.5;
    }

    .vibe-setup__options {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-setup__option {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-md, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-setup__option:hover {
      border-color: var(--color-ferni, #3D5A45);
      transform: translateY(-1px);
    }

    .vibe-setup__option-icon {
      width: 40px;
      height: 40px;
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.05));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5C544A);
    }

    .vibe-setup__option-icon svg {
      width: 20px;
      height: 20px;
    }

    .vibe-setup__option-info {
      flex: 1;
      text-align: left;
    }

    .vibe-setup__option-name {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-setup__option-desc {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #756A5E);
    }

    .vibe-setup__option-arrow {
      color: var(--color-text-dimmed, #A89D90);
    }

    .vibe-setup__option-arrow svg {
      width: 16px;
      height: 16px;
    }

    .vibe-setup__skip {
      background: none;
      border: none;
      color: var(--color-text-muted, #756A5E);
      font-size: 0.875rem;
      cursor: pointer;
      padding: var(--space-sm, 8px);
    }

    .vibe-setup__skip:hover {
      color: var(--color-text-primary, #2C2520);
    }

    /* Connection Status Badges */
    .vibe-connection-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-2xs, 4px) var(--space-sm, 10px);
      background: var(--color-semantic-success-tint, rgba(34, 197, 94, 0.1));
      border-radius: var(--radius-full, 9999px);
      font-size: 0.75rem;
      color: var(--color-semantic-success, #22c55e);
    }

    .vibe-connection-badge--warning {
      background: var(--color-semantic-warning-tint, rgba(245, 158, 11, 0.1));
      color: var(--color-semantic-warning, #f59e0b);
    }

    .vibe-connection-badge svg {
      width: 12px;
      height: 12px;
    }

    /* Loading State */
    .vibe-preset--loading,
    .vibe-activity--loading {
      opacity: 0.6;
      pointer-events: none;
    }

    .vibe-preset--loading .vibe-preset__icon,
    .vibe-activity--loading .vibe-activity__icon {
      animation: vibe-pulse 1s ease-in-out infinite;
    }

    @keyframes vibe-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .vibe-control--loading .vibe-control__slider {
      opacity: 0.5;
      pointer-events: none;
    }

    .vibe-music__btn--loading,
    .vibe-not-connected__btn--loading {
      opacity: 0.7;
      pointer-events: none;
    }

    /* Ecobee PIN Dialog - Moved from inline styles */
    .ecobee-pin-dialog {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal, 2100);
      background: rgba(44, 37, 32, 0.75);
    }

    .ecobee-pin-card {
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 20px);
      padding: var(--space-lg, 24px);
      max-width: 400px;
      text-align: center;
      box-shadow: var(--shadow-xl, 0 20px 60px rgba(44, 37, 32, 0.2));
    }

    .ecobee-pin-card h3 {
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-md, 16px);
      font-size: 1.25rem;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    }

    .ecobee-pin-card__instructions {
      color: var(--color-text-secondary, #5C544A);
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__pin {
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: 0.5rem;
      color: var(--color-ferni, #3D5A45);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 12px);
      font-family: monospace;
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__steps {
      text-align: left;
      color: var(--color-text-secondary, #5C544A);
      padding-left: var(--space-lg, 20px);
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__steps li {
      margin: var(--space-xs, 8px) 0;
    }

    .ecobee-pin-card__expires {
      color: var(--color-text-muted, #756A5E);
      font-size: 0.875rem;
      margin: 0 0 var(--space-md, 16px);
    }

    .ecobee-pin-card__cancel {
      background: transparent;
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-sm, 12px) var(--space-lg, 20px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      font-size: 1rem;
      transition: all ${DURATION.FAST}ms;
    }

    .ecobee-pin-card__cancel:hover {
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-color: var(--color-border-medium, rgba(44, 37, 32, 0.15));
    }

    .ecobee-pin-card__cancel:focus-visible {
      outline: 2px solid var(--color-ferni, #3D5A45);
      outline-offset: 2px;
    }

    /* Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      .vibe-overlay,
      .vibe-panel,
      .vibe-preset,
      .vibe-music__btn,
      .vibe-temp__btn,
      .vibe-control__slider::-webkit-slider-thumb,
      .ecobee-pin-card__cancel {
        transition: none;
      }

      .vibe-preset--loading .vibe-preset__icon,
      .vibe-activity--loading .vibe-activity__icon {
        animation: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderHeader(): HTMLElement {
  const header = createElement('div', { className: 'vibe-header' });

  const left = createElement('div', { className: 'vibe-header__left' });
  left.appendChild(createElement('span', { className: 'vibe-header__eyebrow' }, [t('vibe.eyebrow', 'Your Environment')]));
  left.appendChild(createElement('h2', { className: 'vibe-header__title' }, [t('vibe.title', 'Set the Vibe')]));
  header.appendChild(left);

  const closeBtn = createElement('button', {
    className: 'vibe-close',
    'aria-label': t('common.close', 'Close'),
  });
  closeBtn.appendChild(createSvgIcon(ICONS.close));
  closeBtn.addEventListener('click', hide);
  header.appendChild(closeBtn);

  return header;
}

// Track whether activity vibes are expanded
let activityVibesExpanded = false;

function renderPresets(): HTMLElement {
  const wrapper = createElement('div', { className: 'vibe-presets-wrapper' });

  // Primary vibes grid
  const primaryGrid = createElement('div', { className: 'vibe-presets' });
  const primaryVibes = getPrimaryVibes();

  for (const preset of primaryVibes) {
    const isActive = currentState.activePreset === preset.id;
    const isLoading = loadingState.activatingPreset === preset.id;
    const card = createElement('button', {
      className: `vibe-preset ${isActive ? 'vibe-preset--active' : ''} ${isLoading ? 'vibe-preset--loading' : ''}`,
      'aria-label': `${preset.name}: ${preset.description}`,
      'data-preset': preset.id,
    });

    const icon = createElement('div', { className: 'vibe-preset__icon' });
    icon.appendChild(createSvgIcon(preset.icon));
    card.appendChild(icon);

    card.appendChild(createElement('span', { className: 'vibe-preset__name' }, [preset.name]));

    card.addEventListener('click', () => { void activatePreset(preset); });
    primaryGrid.appendChild(card);
  }
  wrapper.appendChild(primaryGrid);

  // More vibes toggle button
  const moreVibesLabel = activityVibesExpanded
    ? t('vibe.fewerVibes', 'Fewer vibes')
    : t('vibe.moreVibes', 'More vibes');

  const moreToggle = createElement('button', {
    className: `vibe-more-toggle ${activityVibesExpanded ? 'vibe-more-toggle--expanded' : ''}`,
    'aria-expanded': activityVibesExpanded ? 'true' : 'false',
  });
  moreToggle.appendChild(document.createTextNode(moreVibesLabel));
  moreToggle.appendChild(createSvgIcon(ICONS.chevronDown));
  wrapper.appendChild(moreToggle);

  // Activity vibes grid (compact)
  const activityGrid = createElement('div', {
    className: `vibe-activity-grid ${activityVibesExpanded ? 'vibe-activity-grid--visible' : ''}`,
  });
  const activityVibes = getActivityVibes();

  for (const preset of activityVibes) {
    const isActive = currentState.activePreset === preset.id;
    const isLoading = loadingState.activatingPreset === preset.id;
    const card = createElement('button', {
      className: `vibe-activity ${isActive ? 'vibe-activity--active' : ''} ${isLoading ? 'vibe-activity--loading' : ''}`,
      'aria-label': `${preset.name}: ${preset.description}`,
      'data-preset': preset.id,
    });

    const icon = createElement('div', { className: 'vibe-activity__icon' });
    icon.appendChild(createSvgIcon(preset.icon));
    card.appendChild(icon);

    card.appendChild(createElement('span', { className: 'vibe-activity__name' }, [preset.name]));

    card.addEventListener('click', () => { void activatePreset(preset); });
    activityGrid.appendChild(card);
  }
  wrapper.appendChild(activityGrid);

  // Toggle expand/collapse
  moreToggle.addEventListener('click', () => {
    activityVibesExpanded = !activityVibesExpanded;
    activityGrid.classList.toggle('vibe-activity-grid--visible', activityVibesExpanded);
    moreToggle.classList.toggle('vibe-more-toggle--expanded', activityVibesExpanded);
    moreToggle.setAttribute('aria-expanded', activityVibesExpanded ? 'true' : 'false');

    const firstChild = moreToggle.firstChild;
    if (firstChild) {
      firstChild.textContent = activityVibesExpanded
        ? t('vibe.fewerVibes', 'Fewer vibes')
        : t('vibe.moreVibes', 'More vibes');
    }
  });

  return wrapper;
}

function renderMusicSection(): HTMLElement {
  const section = createElement('div', { className: 'vibe-section' });

  // Header
  const header = createElement('div', { className: 'vibe-section__header' });
  const iconWrapper = createElement('div', { className: 'vibe-section__icon' });
  iconWrapper.appendChild(createSvgIcon(ICONS.music));
  header.appendChild(iconWrapper);
  header.appendChild(createElement('h3', { className: 'vibe-section__title' }, [t('vibe.music.title', 'Music')]));
  header.appendChild(createElement('span', {
    className: `vibe-section__status ${currentState.music.playing ? 'vibe-section__status--connected' : ''}`,
  }, [currentState.music.playing ? t('vibe.music.playing', 'Playing') : t('vibe.music.paused', 'Paused')]));
  section.appendChild(header);

  // Now Playing
  const music = createElement('div', { className: 'vibe-music' });

  const nowPlaying = createElement('div', { className: 'vibe-music__now-playing' });

  const cover = createElement('div', { className: 'vibe-music__cover' });
  cover.appendChild(createSvgIcon(ICONS.music));
  nowPlaying.appendChild(cover);

  const info = createElement('div', { className: 'vibe-music__info' });
  info.appendChild(createElement('div', { className: 'vibe-music__track' }, [
    currentState.music.track || t('vibe.music.chooseVibe', 'Choose a vibe to start music'),
  ]));
  info.appendChild(createElement('div', { className: 'vibe-music__artist' }, [
    currentState.music.artist || t('vibe.music.askFerni', 'Or ask Ferni to play something'),
  ]));
  nowPlaying.appendChild(info);

  const controls = createElement('div', { className: 'vibe-music__controls' });
  const playBtn = createElement('button', {
    className: 'vibe-music__btn',
    'aria-label': currentState.music.playing ? t('vibe.music.pause', 'Pause') : t('vibe.music.play', 'Play'),
  });
  playBtn.appendChild(createSvgIcon(currentState.music.playing ? ICONS.pause : ICONS.play));
  playBtn.addEventListener('click', toggleMusic);
  controls.appendChild(playBtn);

  const skipBtn = createElement('button', {
    className: 'vibe-music__btn vibe-music__btn--secondary',
    'aria-label': t('vibe.music.skip', 'Skip'),
  });
  skipBtn.appendChild(createSvgIcon(ICONS.skipForward));
  skipBtn.addEventListener('click', skipTrack);
  controls.appendChild(skipBtn);

  nowPlaying.appendChild(controls);
  music.appendChild(nowPlaying);

  // Volume slider
  const isVolumeLoading = loadingState.adjustingVolume;
  const volumeControl = createElement('div', {
    className: `vibe-control ${isVolumeLoading ? 'vibe-control--loading' : ''}`,
  });
  volumeControl.appendChild(createElement('span', { className: 'vibe-control__label' }, [t('vibe.volume', 'Volume')]));

  const volumeSlider = createElement('input', {
    className: 'vibe-control__slider',
    type: 'range',
    min: '0',
    max: '100',
    value: String(currentState.music.volume),
    'aria-label': t('vibe.volume', 'Volume'),
  });

  const volumeValue = createElement('span', { className: 'vibe-control__value' }, [`${currentState.music.volume}%`]);

  // Debounced volume change
  let volumeTimeout: ReturnType<typeof setTimeout> | null = null;
  volumeSlider.addEventListener('input', () => {
    currentState.music.volume = parseInt(volumeSlider.value, 10);
    volumeValue.textContent = `${currentState.music.volume}%`;

    // Debounce API call
    if (volumeTimeout) clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(() => {
      void setMusicVolume(currentState.music.volume);
    }, 150);
  });

  volumeControl.appendChild(volumeSlider);
  volumeControl.appendChild(volumeValue);
  music.appendChild(volumeControl);

  section.appendChild(music);
  return section;
}

function renderLightsSetup(): HTMLElement {
  const setup = createElement('div', { className: 'vibe-setup' });

  const icon = createElement('div', { className: 'vibe-setup__icon' });
  icon.appendChild(createSvgIcon(ICONS.sun));
  setup.appendChild(icon);

  setup.appendChild(createElement('h3', { className: 'vibe-setup__title' }, [t('vibe.lights.connectTitle', 'Connect Your Lights')]));
  setup.appendChild(createElement('p', { className: 'vibe-setup__desc' }, [
    t('vibe.lights.connectDescription', 'Ferni can control your smart lights to set the perfect ambiance. Choose how you\'d like to connect:'),
  ]));

  const options = createElement('div', { className: 'vibe-setup__options' });

  // Home Assistant option
  const haOption = createElement('button', { className: 'vibe-setup__option' });
  const haIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  haIcon.appendChild(createSvgIcon(ICONS.home));
  haOption.appendChild(haIcon);
  const haInfo = createElement('div', { className: 'vibe-setup__option-info' });
  haInfo.appendChild(createElement('div', { className: 'vibe-setup__option-name' }, [t('vibe.providers.homeAssistant', 'Home Assistant')]));
  haInfo.appendChild(createElement('div', { className: 'vibe-setup__option-desc' }, [t('vibe.providers.homeAssistantDesc', 'Works with all your devices')]));
  haOption.appendChild(haInfo);
  const haArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  haArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  haOption.appendChild(haArrow);
  haOption.addEventListener('click', () => void connectLightsViaHomeAssistant());
  options.appendChild(haOption);

  // Philips Hue option
  const hueOption = createElement('button', { className: 'vibe-setup__option' });
  const hueIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  hueIcon.appendChild(createSvgIcon(ICONS.hue));
  hueOption.appendChild(hueIcon);
  const hueInfo = createElement('div', { className: 'vibe-setup__option-info' });
  hueInfo.appendChild(createElement('div', { className: 'vibe-setup__option-name' }, [t('vibe.providers.philipsHue', 'Philips Hue')]));
  hueInfo.appendChild(createElement('div', { className: 'vibe-setup__option-desc' }, [t('vibe.providers.philipsHueDesc', 'Connect directly to your Hue bridge')]));
  hueOption.appendChild(hueInfo);
  const hueArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  hueArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  hueOption.appendChild(hueArrow);
  hueOption.addEventListener('click', () => void connectLightsViaHue());
  options.appendChild(hueOption);

  setup.appendChild(options);

  const skipBtn = createElement('button', { className: 'vibe-setup__skip' }, [t('vibe.skipForNow', 'Skip for now')]);
  skipBtn.addEventListener('click', () => hideLightsSetup());
  setup.appendChild(skipBtn);

  return setup;
}

function renderLightsSection(): HTMLElement {
  const section = createElement('div', { className: 'vibe-section' });

  // Header
  const header = createElement('div', { className: 'vibe-section__header' });
  const iconWrapper = createElement('div', { className: 'vibe-section__icon' });
  iconWrapper.appendChild(createSvgIcon(ICONS.sun));
  header.appendChild(iconWrapper);
  header.appendChild(createElement('h3', { className: 'vibe-section__title' }, [t('vibe.lights.title', 'Lights')]));
  header.appendChild(createElement('span', {
    className: `vibe-section__status ${currentState.lights.connected ? 'vibe-section__status--connected' : ''}`,
  }, [currentState.lights.connected ? t('vibe.connected', 'Connected') : t('vibe.notConnected', 'Not connected')]));
  section.appendChild(header);

  // Show setup flow if active
  if (showingLightsSetup) {
    section.appendChild(renderLightsSetup());
    return section;
  }

  if (!currentState.lights.connected) {
    const notConnected = createElement('div', { className: 'vibe-not-connected' });
    const icon = createElement('div', { className: 'vibe-not-connected__icon' });
    icon.appendChild(createSvgIcon(ICONS.sun));
    notConnected.appendChild(icon);
    notConnected.appendChild(createElement('p', { className: 'vibe-not-connected__text' }, [
      t('vibe.lights.notConnectedText', 'Connect your smart lights to control ambiance'),
    ]));
    const isConnecting = loadingState.connectingLights;
    const connectBtn = createElement('button', {
      className: `vibe-not-connected__btn ${isConnecting ? 'vibe-not-connected__btn--loading' : ''}`,
    }, [isConnecting ? t('vibe.connecting', 'Connecting...') : t('vibe.lights.connect', 'Connect Lights')]);
    connectBtn.addEventListener('click', () => void connectLights());
    notConnected.appendChild(connectBtn);
    section.appendChild(notConnected);
    return section;
  }

  // Brightness slider
  const isBrightnessLoading = loadingState.adjustingBrightness;
  const brightnessControl = createElement('div', {
    className: `vibe-control ${isBrightnessLoading ? 'vibe-control--loading' : ''}`,
  });
  brightnessControl.appendChild(createElement('span', { className: 'vibe-control__label' }, [t('vibe.lights.brightness', 'Brightness')]));

  const brightnessSlider = createElement('input', {
    className: 'vibe-control__slider',
    type: 'range',
    min: '0',
    max: '100',
    value: String(currentState.lights.brightness),
    'aria-label': t('vibe.lights.brightness', 'Brightness'),
  });

  const brightnessValue = createElement('span', { className: 'vibe-control__value' }, [`${currentState.lights.brightness}%`]);

  // Debounced brightness change
  let brightnessTimeout: ReturnType<typeof setTimeout> | null = null;
  brightnessSlider.addEventListener('input', () => {
    currentState.lights.brightness = parseInt(brightnessSlider.value, 10);
    brightnessValue.textContent = `${currentState.lights.brightness}%`;

    if (brightnessTimeout) clearTimeout(brightnessTimeout);
    brightnessTimeout = setTimeout(() => {
      void setLightBrightness(currentState.lights.brightness);
    }, 150);
  });

  brightnessControl.appendChild(brightnessSlider);
  brightnessControl.appendChild(brightnessValue);
  section.appendChild(brightnessControl);

  // Color temperature slider
  const isColorTempLoading = loadingState.adjustingColorTemp;
  const tempControl = createElement('div', {
    className: `vibe-control ${isColorTempLoading ? 'vibe-control--loading' : ''}`,
  });
  tempControl.appendChild(createElement('span', { className: 'vibe-control__label' }, [t('vibe.lights.warmth', 'Warmth')]));

  const tempSlider = createElement('input', {
    className: 'vibe-control__slider',
    type: 'range',
    min: '2700',
    max: '6500',
    value: String(currentState.lights.colorTemp),
    'aria-label': t('vibe.lights.colorTemperature', 'Color temperature'),
  });

  const getWarmthLabel = (temp: number): string => {
    if (temp < 4000) return t('vibe.lights.warm', 'Warm');
    if (temp > 5000) return t('vibe.lights.cool', 'Cool');
    return t('vibe.lights.neutral', 'Neutral');
  };

  const tempValue = createElement('span', { className: 'vibe-control__value' }, [
    getWarmthLabel(currentState.lights.colorTemp),
  ]);

  // Debounced color temp change
  let colorTempTimeout: ReturnType<typeof setTimeout> | null = null;
  tempSlider.addEventListener('input', () => {
    currentState.lights.colorTemp = parseInt(tempSlider.value, 10);
    tempValue.textContent = getWarmthLabel(currentState.lights.colorTemp);

    if (colorTempTimeout) clearTimeout(colorTempTimeout);
    colorTempTimeout = setTimeout(() => {
      void setLightColorTemp(currentState.lights.colorTemp);
    }, 150);
  });

  tempControl.appendChild(tempSlider);
  tempControl.appendChild(tempValue);
  section.appendChild(tempControl);

  return section;
}

function renderThermostatSetup(): HTMLElement {
  const setup = createElement('div', { className: 'vibe-setup' });

  const icon = createElement('div', { className: 'vibe-setup__icon' });
  icon.appendChild(createSvgIcon(ICONS.thermometer));
  setup.appendChild(icon);

  setup.appendChild(createElement('h3', { className: 'vibe-setup__title' }, [t('vibe.temperature.connectTitle', 'Connect Your Thermostat')]));
  setup.appendChild(createElement('p', { className: 'vibe-setup__desc' }, [
    t('vibe.temperature.connectDescription', 'Ferni can adjust your home\'s temperature to match your vibe. Choose your thermostat:'),
  ]));

  const options = createElement('div', { className: 'vibe-setup__options' });

  // Ecobee option
  const ecobeeOption = createElement('button', { className: 'vibe-setup__option' });
  const ecobeeIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  ecobeeIcon.appendChild(createSvgIcon(ICONS.ecobee));
  ecobeeOption.appendChild(ecobeeIcon);
  const ecobeeInfo = createElement('div', { className: 'vibe-setup__option-info' });
  ecobeeInfo.appendChild(createElement('div', { className: 'vibe-setup__option-name' }, [t('vibe.providers.ecobee', 'Ecobee')]));
  ecobeeInfo.appendChild(createElement('div', { className: 'vibe-setup__option-desc' }, [t('vibe.providers.ecobeeDesc', 'Smart thermostat with room sensors')]));
  ecobeeOption.appendChild(ecobeeInfo);
  const ecobeeArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  ecobeeArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  ecobeeOption.appendChild(ecobeeArrow);
  ecobeeOption.addEventListener('click', () => void connectThermostatViaEcobee());
  options.appendChild(ecobeeOption);

  // Nest option
  const nestOption = createElement('button', { className: 'vibe-setup__option' });
  const nestIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  nestIcon.appendChild(createSvgIcon(ICONS.thermometer));
  nestOption.appendChild(nestIcon);
  const nestInfo = createElement('div', { className: 'vibe-setup__option-info' });
  nestInfo.appendChild(createElement('div', { className: 'vibe-setup__option-name' }, [t('vibe.providers.googleNest', 'Google Nest')]));
  nestInfo.appendChild(createElement('div', { className: 'vibe-setup__option-desc' }, [t('vibe.providers.googleNestDesc', 'Learning thermostat')]));
  nestOption.appendChild(nestInfo);
  const nestArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  nestArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  nestOption.appendChild(nestArrow);
  nestOption.addEventListener('click', () => void connectThermostatViaNest());
  options.appendChild(nestOption);

  // Home Assistant option
  const haOption = createElement('button', { className: 'vibe-setup__option' });
  const haIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  haIcon.appendChild(createSvgIcon(ICONS.home));
  haOption.appendChild(haIcon);
  const haInfo = createElement('div', { className: 'vibe-setup__option-info' });
  haInfo.appendChild(createElement('div', { className: 'vibe-setup__option-name' }, [t('vibe.providers.homeAssistant', 'Home Assistant')]));
  haInfo.appendChild(createElement('div', { className: 'vibe-setup__option-desc' }, [t('vibe.providers.homeAssistantClimate', 'Any thermostat via Home Assistant')]));
  haOption.appendChild(haInfo);
  const haArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  haArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  haOption.appendChild(haArrow);
  haOption.addEventListener('click', () => void connectThermostatViaHomeAssistant());
  options.appendChild(haOption);

  setup.appendChild(options);

  const skipBtn = createElement('button', { className: 'vibe-setup__skip' }, [t('vibe.skipForNow', 'Skip for now')]);
  skipBtn.addEventListener('click', () => hideThermostatSetup());
  setup.appendChild(skipBtn);

  return setup;
}

function renderTemperatureSection(): HTMLElement {
  const section = createElement('div', { className: 'vibe-section' });

  // Header
  const header = createElement('div', { className: 'vibe-section__header' });
  const iconWrapper = createElement('div', { className: 'vibe-section__icon' });
  iconWrapper.appendChild(createSvgIcon(ICONS.thermometer));
  header.appendChild(iconWrapper);
  header.appendChild(createElement('h3', { className: 'vibe-section__title' }, [t('vibe.temperature.title', 'Temperature')]));
  header.appendChild(createElement('span', {
    className: `vibe-section__status ${currentState.temperature.connected ? 'vibe-section__status--connected' : ''}`,
  }, [currentState.temperature.connected
    ? t('vibe.temperature.currentNow', '{temp} now', { temp: formatTemperature(currentState.temperature.current) })
    : t('vibe.notConnected', 'Not connected')]));
  section.appendChild(header);

  // Show setup flow if active
  if (showingThermostatSetup) {
    section.appendChild(renderThermostatSetup());
    return section;
  }

  if (!currentState.temperature.connected) {
    const notConnected = createElement('div', { className: 'vibe-not-connected' });
    const icon = createElement('div', { className: 'vibe-not-connected__icon' });
    icon.appendChild(createSvgIcon(ICONS.thermometer));
    notConnected.appendChild(icon);
    notConnected.appendChild(createElement('p', { className: 'vibe-not-connected__text' }, [
      t('vibe.temperature.notConnectedText', 'Connect your thermostat for comfort control'),
    ]));
    const isConnecting = loadingState.connectingThermostat;
    const connectBtn = createElement('button', {
      className: `vibe-not-connected__btn ${isConnecting ? 'vibe-not-connected__btn--loading' : ''}`,
    }, [isConnecting ? t('vibe.connecting', 'Connecting...') : t('vibe.temperature.connect', 'Connect Thermostat')]);
    connectBtn.addEventListener('click', () => void connectThermostat());
    notConnected.appendChild(connectBtn);
    section.appendChild(notConnected);
    return section;
  }

  // Temperature controls
  const isLoading = loadingState.adjustingTemperature;
  const tempDisplay = createElement('div', { className: `vibe-temp ${isLoading ? 'vibe-control--loading' : ''}` });

  const decreaseBtn = createElement('button', {
    className: 'vibe-temp__btn',
    'aria-label': t('vibe.temperature.decrease', 'Decrease temperature'),
  }, ['−']);
  decreaseBtn.addEventListener('click', () => void adjustTemperature(-1));
  tempDisplay.appendChild(decreaseBtn);

  const display = createElement('div', { className: 'vibe-temp__display' });
  display.appendChild(createElement('div', { className: 'vibe-temp__value' }, [formatTargetTemperature(currentState.temperature.target)]));
  display.appendChild(createElement('div', { className: 'vibe-temp__label' }, [t('vibe.temperature.target', 'Target')]));
  tempDisplay.appendChild(display);

  const increaseBtn = createElement('button', {
    className: 'vibe-temp__btn',
    'aria-label': t('vibe.temperature.increase', 'Increase temperature'),
  }, ['+']);
  increaseBtn.addEventListener('click', () => void adjustTemperature(1));
  tempDisplay.appendChild(increaseBtn);

  section.appendChild(tempDisplay);
  return section;
}

function render(): void {
  if (!container) return;

  const content = container.querySelector('.vibe-body');
  if (!content) return;

  content.textContent = '';
  content.appendChild(renderPresets());
  content.appendChild(renderMusicSection());
  content.appendChild(renderLightsSection());
  content.appendChild(renderTemperatureSection());
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchState(): Promise<void> {
  try {
    // Fetch music state
    const musicRes = await apiGet<{ playing: boolean; track?: string; artist?: string; volume: number }>('/api/spotify/status');
    if (musicRes.ok && musicRes.data) {
      currentState.music = { ...currentState.music, ...musicRes.data };
    }

    // Fetch lights state via vibe API
    const lightsRes = await apiGet<{ connected: boolean; brightness: number; colorTemp: number }>('/api/vibe/lights/status');
    if (lightsRes.ok && lightsRes.data) {
      currentState.lights = { ...currentState.lights, ...lightsRes.data };
    }

    // Fetch thermostat state
    const thermoRes = await apiGet<{ connected: boolean; current: number; target: number; mode: string }>('/api/ecobee/status');
    if (thermoRes.ok && thermoRes.data) {
      currentState.temperature = { ...currentState.temperature, ...thermoRes.data };
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to fetch vibe state:', error);
  }
}

async function activatePreset(preset: VibePresetUI): Promise<void> {
  // Set loading state
  loadingState.activatingPreset = preset.id;
  currentState.activePreset = preset.id;
  render();

  toast.info(t('vibe.settingVibe', 'Setting {name} vibe...', { name: preset.name }));

  try {
    // Use the unified vibe activate endpoint
    const result = await apiPost<{ success: boolean; message: string; applied: { music: boolean; lights: boolean; temperature: boolean } }>(
      '/api/vibe/activate',
      { presetId: preset.id }
    );

    if (result.ok && result.data?.success) {
      // Update local state based on what was applied
      if (result.data.applied.lights && preset.lights) {
        currentState.lights = { ...currentState.lights, ...preset.lights };
      }
      if (result.data.applied.temperature && preset.temperature) {
        currentState.temperature.target = preset.temperature.target;
      }

      toast.success(t('vibe.vibeSet', '{name} vibe set!', { name: preset.name }));
      callbacks.onVibeChanged?.(preset.id);
    } else {
      toast.warning(result.data?.message || t('vibe.couldNotFullySet', "Couldn't fully set the vibe"));
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to activate preset:', error);
    toast.error(t('vibe.couldNotSetVibe', "Couldn't set that vibe. Try again?"));
  } finally {
    loadingState.activatingPreset = null;
    render();
  }
}

async function toggleMusic(): Promise<void> {
  try {
    if (currentState.music.playing) {
      await apiPost('/api/spotify/pause', {});
      currentState.music.playing = false;
    } else {
      await apiPost('/api/spotify/play', {});
      currentState.music.playing = true;
    }
    render();
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to toggle music:', error);
    toast.error(t('vibe.couldNotControlMusic', "Couldn't control music. Try again?"));
  }
}

async function skipTrack(): Promise<void> {
  try {
    await apiPost('/api/spotify/skip', {});
    toast.info(t('vibe.skipped', 'Skipped'));
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to skip track:', error);
  }
}

async function setMusicVolume(volume: number): Promise<void> {
  try {
    await apiPost('/api/spotify/volume', { volume });
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to set volume:', error);
  }
}

async function setLightBrightness(brightness: number): Promise<void> {
  try {
    await apiPost('/api/vibe/lights', { brightness });
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to set brightness:', error);
  }
}

async function setLightColorTemp(colorTemp: number): Promise<void> {
  try {
    await apiPost('/api/vibe/lights', { colorTemp });
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to set color temp:', error);
  }
}

async function adjustTemperature(delta: number): Promise<void> {
  const newTarget = currentState.temperature.target + delta;
  currentState.temperature.target = newTarget;
  loadingState.adjustingTemperature = true;
  render();

  try {
    await apiPost('/api/ecobee/temperature', {
      heat: newTarget,
      cool: newTarget + 3,
      holdType: 'nextTransition',
    });
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to adjust temperature:', error);
    toast.error(t('vibe.couldNotChangeTemp', "Couldn't change temperature. Try again?"));
  } finally {
    loadingState.adjustingTemperature = false;
    render();
  }
}

// Setup view states
let showingLightsSetup = false;
let showingThermostatSetup = false;

function showLightsSetup(): void {
  showingLightsSetup = true;
  render();
}

function showThermostatSetup(): void {
  showingThermostatSetup = true;
  render();
}

function hideLightsSetup(): void {
  showingLightsSetup = false;
  render();
}

function hideThermostatSetup(): void {
  showingThermostatSetup = false;
  render();
}

async function connectLightsViaHomeAssistant(): Promise<void> {
  loadingState.connectingLights = true;
  render();
  toast.info(t('vibe.connectingToHA', 'Connecting to Home Assistant...'));

  try {
    // Start OAuth flow or show config dialog
    const result = await apiPost<{ success: boolean; authUrl?: string }>('/api/vibe/lights/connect', { provider: 'home-assistant' });
    if (result.ok && result.data?.authUrl) {
      window.open(result.data.authUrl, '_blank', 'width=600,height=700');
    } else if (result.ok && result.data?.success) {
      toast.success(t('vibe.lightsConnected', 'Lights connected!'));
      currentState.lights.connected = true;
      showingLightsSetup = false;
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Home Assistant:', error);
    toast.error(t('vibe.couldNotConnectHA', "Couldn't connect. Check your Home Assistant URL."));
  } finally {
    loadingState.connectingLights = false;
    render();
  }
}

async function connectLightsViaHue(): Promise<void> {
  loadingState.connectingLights = true;
  render();
  toast.info(t('vibe.lookingForHue', 'Looking for Philips Hue bridge...'));

  try {
    const result = await apiPost<{ success: boolean; authUrl?: string; message?: string }>('/api/vibe/lights/connect', { provider: 'hue' });
    if (result.ok && result.data?.authUrl) {
      window.open(result.data.authUrl, '_blank', 'width=600,height=700');
    } else if (result.ok && result.data?.success) {
      toast.success(t('vibe.hueLightsConnected', 'Hue lights connected!'));
      currentState.lights.connected = true;
      showingLightsSetup = false;
    } else {
      toast.info(result.data?.message || t('vibe.pressHueButton', 'Press the button on your Hue bridge, then try again'));
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Hue:', error);
    toast.error(t('vibe.couldNotFindHue', "Couldn't find Hue bridge. Is it on?"));
  } finally {
    loadingState.connectingLights = false;
    render();
  }
}

async function connectThermostatViaEcobee(): Promise<void> {
  loadingState.connectingThermostat = true;
  render();
  toast.info(t('vibe.gettingEcobeePin', 'Getting Ecobee PIN...'));

  try {
    // Ecobee uses PIN-based OAuth - we get a PIN, user enters it at ecobee.com
    const result = await apiPost<{
      pin?: string;
      expiresInMinutes?: number;
      instructions?: string;
    }>('/api/ecobee/link/start', {});

    loadingState.connectingThermostat = false;
    render();

    if (result.ok && result.data?.pin) {
      // Show PIN to user with instructions
      showEcobeePinDialog(result.data.pin, result.data.expiresInMinutes || 10);

      // Poll for authorization
      const checkConnection = setInterval(async () => {
        const status = await apiGet<{ status: string }>('/api/ecobee/link/status');
        if (status.ok && status.data?.status === 'connected') {
          clearInterval(checkConnection);
          hideEcobeePinDialog();
          toast.success(t('vibe.thermostatConnected', 'Thermostat connected!'));
          currentState.temperature.connected = true;
          showingThermostatSetup = false;
          render();
        } else if (status.ok && status.data?.status === 'expired') {
          clearInterval(checkConnection);
          hideEcobeePinDialog();
          toast.warning(t('vibe.pinExpiredRetry', 'PIN expired. Try again?'));
        }
      }, 5000); // Poll every 5 seconds

      // Stop polling after 10 minutes (PIN expires)
      setTimeout(() => {
        clearInterval(checkConnection);
        hideEcobeePinDialog();
      }, 600000);
    } else {
      toast.error(t('vibe.couldNotGetPin', "Couldn't get PIN. Is Ecobee configured?"));
    }
  } catch (error) {
    loadingState.connectingThermostat = false;
    render();
    if (import.meta.env?.DEV) console.debug('Failed to connect Ecobee:', error);
    toast.error(t('vibe.couldNotConnect', "Couldn't connect. Try again?"));
  }
}

// Ecobee PIN dialog helpers
let ecobeePinDialog: HTMLElement | null = null;

function showEcobeePinDialog(pin: string, expiresInMinutes: number): void {
  // Remove existing dialog if any
  hideEcobeePinDialog();

  ecobeePinDialog = createElement('div', { className: 'ecobee-pin-dialog' });

  const card = createElement('div', { className: 'ecobee-pin-card' });

  const title = createElement('h3', {}, [t('vibe.ecobee.connectTitle', 'Connect Ecobee')]);

  const instructions = createElement('p', { className: 'ecobee-pin-card__instructions' }, [
    t('vibe.ecobee.enterPin', 'Enter this PIN at ecobee.com:'),
  ]);

  const pinDisplay = createElement('div', { className: 'ecobee-pin-card__pin' }, [pin]);

  const steps = createElement('ol', { className: 'ecobee-pin-card__steps' });
  const stepTexts = [
    t('vibe.ecobee.step1', 'Go to ecobee.com/consumerportal'),
    t('vibe.ecobee.step2', 'Click "Add Application"'),
    t('vibe.ecobee.step3', 'Enter the PIN above'),
  ];
  stepTexts.forEach((stepText) => {
    const li = createElement('li', {}, [stepText]);
    steps.appendChild(li);
  });

  const expires = createElement('p', { className: 'ecobee-pin-card__expires' }, [
    t('vibe.ecobee.pinExpires', 'PIN expires in {minutes} minutes', { minutes: String(expiresInMinutes) }),
  ]);

  const cancelBtn = createElement('button', {
    className: 'ecobee-pin-card__cancel',
    'aria-label': t('common.cancel', 'Cancel'),
  }, [t('common.cancel', 'Cancel')]);
  cancelBtn.addEventListener('click', hideEcobeePinDialog);

  card.appendChild(title);
  card.appendChild(instructions);
  card.appendChild(pinDisplay);
  card.appendChild(steps);
  card.appendChild(expires);
  card.appendChild(cancelBtn);
  ecobeePinDialog.appendChild(card);
  document.body.appendChild(ecobeePinDialog);

  // Focus the cancel button for accessibility
  cancelBtn.focus();
}

function hideEcobeePinDialog(): void {
  if (ecobeePinDialog) {
    ecobeePinDialog.remove();
    ecobeePinDialog = null;
  }
}

async function connectThermostatViaNest(): Promise<void> {
  loadingState.connectingThermostat = true;
  render();
  toast.info(t('vibe.connectingToNest', 'Connecting to Nest...'));

  try {
    const result = await apiPost<{ success: boolean; authUrl?: string }>('/api/vibe/thermostat/connect', { provider: 'nest' });
    if (result.ok && result.data?.authUrl) {
      window.open(result.data.authUrl, '_blank', 'width=600,height=700');
    } else if (result.ok && result.data?.success) {
      toast.success(t('vibe.nestConnected', 'Nest connected!'));
      currentState.temperature.connected = true;
      showingThermostatSetup = false;
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Nest:', error);
    toast.error(t('vibe.couldNotConnect', "Couldn't connect. Try again?"));
  } finally {
    loadingState.connectingThermostat = false;
    render();
  }
}

async function connectThermostatViaHomeAssistant(): Promise<void> {
  loadingState.connectingThermostat = true;
  render();
  toast.info(t('vibe.connectingToHAClimate', 'Using Home Assistant for climate control...'));

  try {
    const result = await apiPost<{ success: boolean }>('/api/vibe/thermostat/connect', { provider: 'home-assistant' });
    if (result.ok && result.data?.success) {
      toast.success(t('vibe.climateControlConnected', 'Climate control connected!'));
      currentState.temperature.connected = true;
      showingThermostatSetup = false;
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Home Assistant climate:', error);
    toast.error(t('vibe.couldNotConnect', "Couldn't connect. Try again?"));
  } finally {
    loadingState.connectingThermostat = false;
    render();
  }
}

async function connectLights(): Promise<void> {
  showLightsSetup();
}

async function connectThermostat(): Promise<void> {
  showThermostatSetup();
}

// ============================================================================
// FOCUS TRAP - Accessibility helper
// ============================================================================

function getFocusableElements(): HTMLElement[] {
  if (!container) return [];
  const panel = container.querySelector('.vibe-panel');
  if (!panel) return [];

  const elements = panel.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(elements).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  );
}

function handleFocusTrap(e: KeyboardEvent): void {
  if (!focusTrapActive || e.key !== 'Tab') return;

  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first?.focus();
  }
}

function activateFocusTrap(): void {
  previouslyFocusedElement = document.activeElement as HTMLElement | null;
  focusTrapActive = true;

  // Focus the first focusable element
  const focusable = getFocusableElements();
  if (focusable.length > 0) {
    focusable[0]?.focus();
  }
}

function deactivateFocusTrap(): void {
  focusTrapActive = false;

  // Restore focus to previously focused element
  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
    previouslyFocusedElement.focus();
  }
  previouslyFocusedElement = null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function initialize(): void {
  // HMR cleanup - prevent duplicate modals
  cleanupOrphanedElements();

  if (container) return;

  injectStyles();

  container = createElement('div', { className: 'vibe-overlay' });

  const panel = createElement('div', {
    className: 'vibe-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'vibe-title',
  });
  panel.appendChild(renderHeader());

  const body = createElement('div', { className: 'vibe-body' });
  panel.appendChild(body);

  container.appendChild(panel);

  // Close on backdrop click
  container.addEventListener('click', (e) => {
    if (e.target === container) hide();
  });

  // Keyboard handling
  document.addEventListener('keydown', (e) => {
    if (!isVisible) return;

    // Close on Escape
    if (e.key === 'Escape') {
      hide();
      return;
    }

    // Focus trap
    handleFocusTrap(e);
  });

  document.body.appendChild(container);
}

export async function show(): Promise<void> {
  initialize();
  if (!container) return;

  loadingState.fetchingState = true;
  render();

  await fetchState();

  loadingState.fetchingState = false;
  render();

  container.classList.add('vibe-overlay--visible');
  isVisible = true;

  // Activate focus trap for accessibility
  activateFocusTrap();
}

export function hide(): void {
  if (!container) return;

  container.classList.remove('vibe-overlay--visible');
  isVisible = false;

  // Deactivate focus trap
  deactivateFocusTrap();

  callbacks.onClose?.();
}

export function setCallbacks(cbs: VibeControllerCallbacks): void {
  callbacks = cbs;
}

export function getState(): VibeState {
  return { ...currentState };
}

// Default export for easy import
export default {
  initialize,
  show,
  hide,
  setCallbacks,
  getState,
};

