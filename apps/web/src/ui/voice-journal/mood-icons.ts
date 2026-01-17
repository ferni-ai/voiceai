/**
 * Mood Icons
 *
 * SVG icons for mood selection (replacing emoji per brand guidelines).
 * Uses Lucide-style icons with 2px stroke weight.
 *
 * @module voice-journal/mood-icons
 */

import type { MoodOption } from './types.js';

// ============================================================================
// SVG ICON HELPERS
// ============================================================================

/**
 * Create an SVG wrapper with standard Lucide attributes
 */
function svg(content: string): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

// ============================================================================
// MOOD ICONS (Lucide-style SVGs)
// ============================================================================

const MOOD_ICONS = {
  // Happy - smile face
  happy: svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  `),

  // Calm - zen/peaceful circle
  calm: svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8v4"/>
    <path d="M8 12h8"/>
  `),

  // Anxious - worried face
  anxious: svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
    <path d="M8 6c0 0 1 1 2 0s2-1 2 0"/>
    <path d="M14 6c0 0 1 1 2 0"/>
  `),

  // Sad - frown face
  sad: svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  `),

  // Frustrated - angry face
  angry: svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
    <path d="M7.5 7.5l3 1"/>
    <path d="M16.5 7.5l-3 1"/>
  `),

  // Grateful - heart
  grateful: svg(`
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  `),

  // Tired - sleepy face
  tired: svg(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="8" y1="15" x2="16" y2="15"/>
    <path d="M9 9h.01"/>
    <path d="M15 9h.01"/>
    <path d="M7 9c0-1 1-2 2-2"/>
    <path d="M15 7c1 0 2 1 2 2"/>
  `),

  // Excited - star burst
  excited: svg(`
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  `),

  // Neutral - blank face
  neutral: svg(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="8" y1="15" x2="16" y2="15"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  `),

  // Hopeful - sun
  hopeful: svg(`
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  `),

  // Overwhelmed - cloud rain
  overwhelmed: svg(`
    <line x1="16" y1="13" x2="16" y2="21"/>
    <line x1="8" y1="13" x2="8" y2="21"/>
    <line x1="12" y1="15" x2="12" y2="23"/>
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
  `),

  // Reflective - brain/thought
  reflective: svg(`
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
  `),
};

// ============================================================================
// MOOD OPTIONS WITH ICONS
// ============================================================================

export const MOODS: MoodOption[] = [
  { id: 'happy', icon: MOOD_ICONS.happy, label: 'Happy', score: 8 },
  { id: 'calm', icon: MOOD_ICONS.calm, label: 'Calm', score: 7 },
  { id: 'anxious', icon: MOOD_ICONS.anxious, label: 'Anxious', score: 3 },
  { id: 'sad', icon: MOOD_ICONS.sad, label: 'Sad', score: 2 },
  { id: 'angry', icon: MOOD_ICONS.angry, label: 'Frustrated', score: 3 },
  { id: 'grateful', icon: MOOD_ICONS.grateful, label: 'Grateful', score: 9 },
  { id: 'tired', icon: MOOD_ICONS.tired, label: 'Tired', score: 4 },
  { id: 'excited', icon: MOOD_ICONS.excited, label: 'Excited', score: 9 },
  { id: 'neutral', icon: MOOD_ICONS.neutral, label: 'Neutral', score: 5 },
  { id: 'hopeful', icon: MOOD_ICONS.hopeful, label: 'Hopeful', score: 7 },
  { id: 'overwhelmed', icon: MOOD_ICONS.overwhelmed, label: 'Overwhelmed', score: 2 },
  { id: 'reflective', icon: MOOD_ICONS.reflective, label: 'Reflective', score: 6 },
];

// ============================================================================
// MOOD UTILITIES
// ============================================================================

export function getMoodIcon(moodId: string): string {
  return MOODS.find((m) => m.id === moodId)?.icon || MOOD_ICONS.calm;
}

export function getMoodScore(moodId: string): number {
  return MOODS.find((m) => m.id === moodId)?.score || 5;
}

export function getMoodLabel(moodId: string): string {
  return MOODS.find((m) => m.id === moodId)?.label || 'Neutral';
}

/**
 * Render mood options as HTML (for mood selector)
 */
export function renderMoodOptions(): string {
  return MOODS.map(
    (mood) => `
    <button class="mood-option" data-mood="${mood.id}" title="${mood.label}" aria-label="Select mood: ${mood.label}">
      <span class="mood-icon">${mood.icon}</span>
    </button>
  `
  ).join('');
}

