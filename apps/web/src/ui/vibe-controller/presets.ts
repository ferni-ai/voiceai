/**
 * Vibe Controller - preset vibes (single source of truth with UI-specific icons)
 * and the preset grid that renders them
 */

import { t } from '../../i18n/index.js';
import { activatePreset } from './actions.js';
import { createElement, createSvgIcon, ICONS } from './dom.js';
import { currentState, loadingState } from './state.js';
import type { VibePresetUI } from './types.js';

// ============================================================================
// PRESET VIBES - Single source of truth with UI-specific icons
// ============================================================================

// Preset icons (SVG paths for Lucide-style icons)
const PRESET_ICONS: Record<string, string> = {
  focus: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  relax: 'M17 8h1a4 4 0 1 1 0 8h-1M3 8h1a4 4 0 0 1 0 8H3zm14 0v8M3 8v8m4-4h10',
  energize: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  sleep: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  social:
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  morning:
    'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  romantic:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  workout: 'M6.5 6.5h11M6.5 17.5h11M3 12h2M19 12h2M5.5 8.5v7M18.5 8.5v7',
  movie: 'M7 2v11m0 5.93V22M2 9h5M2 15h5M17 2v4m0 14v4M22 4h-5M22 20h-5M12 6v12m-3 0h6',
  cooking:
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  reading: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20M8 7h6M8 11h8',
  creative:
    'M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2',
  meditation: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  gaming:
    'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
  dinner:
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
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
  const presetData: Record<
    string,
    {
      name: string;
      description: string;
      lights?: { brightness: number; colorTemp: number; color?: string };
      temperature?: { target: number; mode: 'home' | 'away' | 'sleep' };
      music?: { genre: string; energy: 'low' | 'medium' | 'high' };
    }
  > = {
    focus: {
      name: t('vibe.presets.focus.name', 'Focus'),
      description: t(
        'vibe.presets.focus.description',
        'Deep work mode. Calm music, bright lights, cool temp.'
      ),
      music: { genre: 'ambient', energy: 'low' },
      lights: { brightness: 80, colorTemp: 5000 },
      temperature: { target: 68, mode: 'home' },
    },
    relax: {
      name: t('vibe.presets.relax.name', 'Relax'),
      description: t(
        'vibe.presets.relax.description',
        'Wind down. Soft jazz, warm dim lights, cozy temp.'
      ),
      music: { genre: 'jazz', energy: 'low' },
      lights: { brightness: 40, colorTemp: 2700 },
      temperature: { target: 72, mode: 'home' },
    },
    energize: {
      name: t('vibe.presets.energize.name', 'Energize'),
      description: t(
        'vibe.presets.energize.description',
        'Get moving. Upbeat music, bright cool lights.'
      ),
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
      description: t(
        'vibe.presets.social.description',
        'Having people over. Good music, warm inviting lights.'
      ),
      music: { genre: 'indie', energy: 'medium' },
      lights: { brightness: 70, colorTemp: 3000, color: '#c4a265' },
      temperature: { target: 70, mode: 'home' },
    },
    morning: {
      name: t('vibe.presets.morning.name', 'Morning'),
      description: t(
        'vibe.presets.morning.description',
        'Start the day gently. Bright lights, comfortable temp.'
      ),
      music: { genre: 'acoustic', energy: 'medium' },
      lights: { brightness: 90, colorTemp: 4500 },
      temperature: { target: 70, mode: 'home' },
    },
    romantic: {
      name: t('vibe.presets.romantic.name', 'Romantic'),
      description: t(
        'vibe.presets.romantic.description',
        'Date night. Soft music, dim warm lights.'
      ),
      music: { genre: 'soul', energy: 'low' },
      lights: { brightness: 25, colorTemp: 2400 },
      temperature: { target: 72, mode: 'home' },
    },
    workout: {
      name: t('vibe.presets.workout.name', 'Workout'),
      description: t(
        'vibe.presets.workout.description',
        'Exercise time. High energy music, bright lights, cool.'
      ),
      music: { genre: 'electronic', energy: 'high' },
      lights: { brightness: 100, colorTemp: 6000 },
      temperature: { target: 64, mode: 'home' },
    },
    movie: {
      name: t('vibe.presets.movie.name', 'Movie Night'),
      description: t(
        'vibe.presets.movie.description',
        'Cinema at home. Dim lights, immersive sound.'
      ),
      music: { genre: 'cinematic', energy: 'low' },
      lights: { brightness: 10, colorTemp: 2400 },
      temperature: { target: 71, mode: 'home' },
    },
    cooking: {
      name: t('vibe.presets.cooking.name', 'Cooking'),
      description: t(
        'vibe.presets.cooking.description',
        'Kitchen time. Upbeat tunes, bright task lighting.'
      ),
      music: { genre: 'world', energy: 'medium' },
      lights: { brightness: 100, colorTemp: 4000 },
      temperature: { target: 68, mode: 'home' },
    },
    reading: {
      name: t('vibe.presets.reading.name', 'Reading'),
      description: t(
        'vibe.presets.reading.description',
        'Book time. Soft background, warm reading light.'
      ),
      music: { genre: 'classical', energy: 'low' },
      lights: { brightness: 60, colorTemp: 3000 },
      temperature: { target: 71, mode: 'home' },
    },
    creative: {
      name: t('vibe.presets.creative.name', 'Creative'),
      description: t(
        'vibe.presets.creative.description',
        'Art and projects. Inspiring music, natural light feel.'
      ),
      music: { genre: 'lo-fi', energy: 'medium' },
      lights: { brightness: 85, colorTemp: 5500 },
      temperature: { target: 69, mode: 'home' },
    },
    meditation: {
      name: t('vibe.presets.meditation.name', 'Meditation'),
      description: t(
        'vibe.presets.meditation.description',
        'Inner peace. Nature sounds, soft ambient glow.'
      ),
      music: { genre: 'nature', energy: 'low' },
      lights: { brightness: 20, colorTemp: 2700 },
      temperature: { target: 72, mode: 'home' },
    },
    gaming: {
      name: t('vibe.presets.gaming.name', 'Gaming'),
      description: t(
        'vibe.presets.gaming.description',
        'Game on. Dynamic lighting, comfortable temp.'
      ),
      music: { genre: 'electronic', energy: 'medium' },
      // Fixed: Using brand-compliant teal instead of purple (#7c3aed)
      lights: { brightness: 30, colorTemp: 4500, color: '#3a6b73' },
      temperature: { target: 68, mode: 'home' },
    },
    dinner: {
      name: t('vibe.presets.dinner.name', 'Dinner'),
      description: t(
        'vibe.presets.dinner.description',
        'Mealtime ambiance. Warm glow, pleasant background.'
      ),
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
// PRESET GRID
// ============================================================================

// Track whether activity vibes are expanded
let activityVibesExpanded = false;

export function renderPresets(): HTMLElement {
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

    card.addEventListener('click', () => {
      void activatePreset(preset);
    });
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

    card.addEventListener('click', () => {
      void activatePreset(preset);
    });
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
