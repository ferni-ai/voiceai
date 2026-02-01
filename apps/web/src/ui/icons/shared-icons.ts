/**
 * Shared Icons Library - Lucide-style SVG icons for UI components
 *
 * BRAND COMPLIANCE:
 * - All icons are Lucide-style (1.5-2px stroke, rounded corners)
 * - NO emoji - only SVG icons
 * - Icons use currentColor for theming
 * - All icons are 24x24 viewBox for consistency
 *
 * Used by:
 * - growth-journal.ui.ts
 * - pattern-insights.ui.ts
 * - knowledge-quiz.ui.ts
 * - memory-lane.ui.ts
 * - And any feature that needs to replace emoji with proper icons
 *
 * @module ui/icons/shared-icons
 */

// ============================================================================
// GROWTH & PROGRESS ICONS - For growth tracking, milestones, achievements
// ============================================================================

export const GROWTH_ICONS = {
  /** Trophy - milestone achievements (replaces 🏆) */
  milestone: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>`,

  /** Refresh/cycle arrows - pattern recognition (replaces 🔄) */
  pattern: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  </svg>`,

  /** Lightbulb - insight moments (replaces 💡) */
  insight: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6"/>
    <path d="M10 22h4"/>
  </svg>`,

  /** Party popper - celebration moments (replaces 🎉) */
  celebration: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.8 11.3 2 22l10.7-3.79"/>
    <path d="M4 3h.01"/>
    <path d="M22 8h.01"/>
    <path d="M15 2h.01"/>
    <path d="M22 20h.01"/>
    <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/>
    <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11-.11.7-.72 1.22-1.43 1.22H17"/>
    <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/>
    <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>
  </svg>`,

  /** Seedling/sprout - growth nudges (replaces 🌱) */
  seedling: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 10a4 4 0 0 0 4-4V2H8v4a4 4 0 0 0 4 4Z"/>
    <path d="M12 10v12"/>
    <path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/>
    <path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>
  </svg>`,

  /** Notebook/journal - journal entries (replaces 📓 and 📝) */
  journal: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
    <path d="M8 7h6"/>
    <path d="M8 11h8"/>
  </svg>`,

  /** Heart - emotional moments */
  heart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>`,
} as const;

export type GrowthIconName = keyof typeof GROWTH_ICONS;

// ============================================================================
// ANALYTICS & DATA ICONS - For insights, patterns, metrics
// ============================================================================

export const ANALYTICS_ICONS = {
  /** Bar chart - frequency/analytics (replaces 📊) */
  chart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" x2="12" y1="20" y2="10"/>
    <line x1="18" x2="18" y1="20" y2="4"/>
    <line x1="6" x2="6" y1="20" y2="16"/>
  </svg>`,

  /** Target/bullseye - goals (replaces 🎯) */
  target: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>`,

  /** Calendar - dates and timing (replaces 📅) */
  calendar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 2v4"/>
    <path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
  </svg>`,

  /** Sparkles - special moments (replaces ✨) */
  sparkles: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/>
    <path d="M19 17v4"/>
    <path d="M3 5h4"/>
    <path d="M17 19h4"/>
  </svg>`,

  /** Brain - cognitive/thinking (replaces 🧠) */
  brain: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
    <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
    <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
    <path d="M6 18a4 4 0 0 1-1.967-.516"/>
    <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
  </svg>`,

  /** Trending up - growth trends */
  trendingUp: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
    <polyline points="16 7 22 7 22 13"/>
  </svg>`,

  /** Clock - timing patterns */
  clock: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`,

  /** Music note - music features (replaces 🎵) */
  music: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>`,

  /** Sunrise - time-based triggers (replaces 🌅) */
  sunrise: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v8"/>
    <path d="m4.93 10.93 1.41 1.41"/>
    <path d="M2 18h2"/>
    <path d="M20 18h2"/>
    <path d="m19.07 10.93-1.41 1.41"/>
    <path d="M22 22H2"/>
    <path d="M8 6l4-4 4 4"/>
    <path d="M16 18a4 4 0 0 0-8 0"/>
  </svg>`,

  /** Microphone - voice triggers (replaces 🗣️) */
  microphone: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" x2="12" y1="19" y2="22"/>
  </svg>`,

  /** Map pin - location triggers (replaces 📍) */
  mapPin: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>`,

  /** Bell - notifications (replaces 🔔) */
  bell: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
  </svg>`,

  /** Alarm clock - reminders (replaces ⏰) */
  alarm: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="13" r="8"/>
    <path d="M12 9v4l2 2"/>
    <path d="M5 3 2 6"/>
    <path d="m22 6-3-3"/>
    <path d="M6.38 18.7 4 21"/>
    <path d="M17.64 18.67 20 21"/>
  </svg>`,

  /** Thermometer - temperature control (replaces 🌡️) */
  thermometer: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>
  </svg>`,

  /** Message circle - speak/chat (replaces 💬) */
  messageCircle: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
  </svg>`,
} as const;

export type AnalyticsIconName = keyof typeof ANALYTICS_ICONS;

// ============================================================================
// EMOTION ICONS - For mood tracking and emotional states
// ============================================================================

export const EMOTION_ICONS = {
  /** Smile - happy/joyful */
  joyful: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" x2="9.01" y1="9" y2="9"/>
    <line x1="15" x2="15.01" y1="9" y2="9"/>
  </svg>`,

  /** Frown - sad */
  sad: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" x2="9.01" y1="9" y2="9"/>
    <line x1="15" x2="15.01" y1="9" y2="9"/>
  </svg>`,

  /** Meh - neutral */
  neutral: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="8" x2="16" y1="15" y2="15"/>
    <line x1="9" x2="9.01" y1="9" y2="9"/>
    <line x1="15" x2="15.01" y1="9" y2="9"/>
  </svg>`,

  /** Heart handshake - grateful */
  grateful: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/>
    <path d="m18 15-2-2"/>
    <path d="m15 18-2-2"/>
  </svg>`,

  /** Sun - hopeful */
  hopeful: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2"/>
    <path d="M12 20v2"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="m17.66 17.66 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="M20 12h2"/>
    <path d="m6.34 17.66-1.41 1.41"/>
    <path d="m19.07 4.93-1.41 1.41"/>
  </svg>`,

  /** Star - proud (trophy alternative) */
  proud: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,

  /** Cloud - reflective/contemplative */
  reflective: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
  </svg>`,

  /** Flame - passionate/energized */
  energized: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>`,

  /** Mountain - challenged but growing */
  challenged: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
  </svg>`,
} as const;

export type EmotionIconName = keyof typeof EMOTION_ICONS;

// ============================================================================
// QUIZ & CATEGORY ICONS - For knowledge quiz and categorization
// ============================================================================

export const QUIZ_ICONS = {
  /** User circle - personality */
  personality: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="10" r="3"/>
    <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
  </svg>`,

  /** Book open - memories */
  memories: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>`,

  /** Gift - fun facts */
  funFacts: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="8" width="18" height="4" rx="1"/>
    <path d="M12 8v13"/>
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>
  </svg>`,

  /** Users - relationships */
  relationships: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,

  /** Briefcase - work/career */
  career: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    <rect width="20" height="14" x="2" y="6" rx="2"/>
  </svg>`,

  /** Check circle - correct answer */
  correct: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>`,

  /** X circle - incorrect answer */
  incorrect: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="m15 9-6 6"/>
    <path d="m9 9 6 6"/>
  </svg>`,
} as const;

export type QuizIconName = keyof typeof QUIZ_ICONS;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a growth icon by name with optional size override.
 */
export function getGrowthIcon(name: GrowthIconName, size?: number): string {
  const icon = GROWTH_ICONS[name];
  if (!size) return icon;
  return icon
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
}

/**
 * Get an analytics icon by name with optional size override.
 */
export function getAnalyticsIcon(name: AnalyticsIconName, size?: number): string {
  const icon = ANALYTICS_ICONS[name];
  if (!size) return icon;
  return icon
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
}

/**
 * Get an emotion icon by name with optional size override.
 */
export function getEmotionIcon(name: EmotionIconName, size?: number): string {
  const icon = EMOTION_ICONS[name];
  if (!size) return icon;
  return icon
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
}

/**
 * Get a quiz icon by name with optional size override.
 */
export function getQuizIcon(name: QuizIconName, size?: number): string {
  const icon = QUIZ_ICONS[name];
  if (!size) return icon;
  return icon
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
}

/**
 * Map growth journal entry types to icons.
 * Used to replace emoji in growth-journal.ui.ts
 */
export function getGrowthJournalIcon(type: string): string {
  const typeMap: Record<string, string> = {
    milestone: GROWTH_ICONS.milestone,
    pattern: GROWTH_ICONS.pattern,
    insight: GROWTH_ICONS.insight,
    celebration: GROWTH_ICONS.celebration,
    nudge: GROWTH_ICONS.seedling,
  };
  return typeMap[type] ?? GROWTH_ICONS.journal;
}

/**
 * Map pattern insight types to icons.
 * Used to replace emoji in pattern-insights.ui.ts
 */
export function getPatternInsightIcon(type: string): string {
  const typeMap: Record<string, string> = {
    timing: ANALYTICS_ICONS.clock,
    mood: EMOTION_ICONS.joyful,
    frequency: ANALYTICS_ICONS.chart,
    topic: ANALYTICS_ICONS.brain,
    growth: GROWTH_ICONS.seedling,
  };
  return typeMap[type] ?? ANALYTICS_ICONS.sparkles;
}

/**
 * Map quiz categories to icons.
 * Used to replace emoji in knowledge-quiz.ui.ts
 */
export function getQuizCategoryIcon(category: string): string {
  const categoryMap: Record<string, string> = {
    goals: ANALYTICS_ICONS.target,
    personality: QUIZ_ICONS.personality,
    fun_facts: QUIZ_ICONS.funFacts,
    memories: QUIZ_ICONS.memories,
    relationships: QUIZ_ICONS.relationships,
    career: QUIZ_ICONS.career,
  };
  return categoryMap[category] ?? ANALYTICS_ICONS.sparkles;
}

/**
 * Map memory moods to icons.
 * Used to replace emoji in memory-lane.ui.ts
 */
export function getMemoryMoodIcon(mood: string): string {
  const moodMap: Record<string, string> = {
    joyful: EMOTION_ICONS.joyful,
    happy: EMOTION_ICONS.joyful,
    proud: EMOTION_ICONS.proud,
    grateful: EMOTION_ICONS.grateful,
    hopeful: EMOTION_ICONS.hopeful,
    growth: GROWTH_ICONS.seedling,
    reflective: EMOTION_ICONS.reflective,
    sad: EMOTION_ICONS.sad,
    neutral: EMOTION_ICONS.neutral,
    energized: EMOTION_ICONS.energized,
    challenged: EMOTION_ICONS.challenged,
  };
  return moodMap[mood] ?? ANALYTICS_ICONS.sparkles;
}
