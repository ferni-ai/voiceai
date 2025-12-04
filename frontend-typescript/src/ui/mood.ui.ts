/**
 * Mood UI - Ambient atmosphere and seasonal theming
 * 
 * Creates emotional resonance through:
 * - Time-of-day ambient effects
 * - Seasonal themes
 * - Holiday celebrations
 * - Weather-inspired backgrounds (optional)
 */

// ============================================================================
// TYPES
// ============================================================================

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
type Season = 'spring' | 'summer' | 'fall' | 'winter';
type Holiday = 'christmas' | 'newyear' | 'halloween' | 'valentines' | 'thanksgiving' | null;

interface MoodConfig {
  ambientColor: string;
  glowIntensity: number;
  particleSpeed: number;
  warmth: number; // 0 = cool, 1 = warm
}

// ============================================================================
// STATE
// ============================================================================

let currentMood: MoodConfig | null = null;
let ambientElement: HTMLElement | null = null;

// ============================================================================
// MOOD CONFIGURATIONS
// ============================================================================

const TIME_MOODS: Record<TimeOfDay, MoodConfig> = {
  morning: {
    ambientColor: 'rgba(255, 200, 100, 0.03)',
    glowIntensity: 0.6,
    particleSpeed: 0.8,
    warmth: 0.7,
  },
  afternoon: {
    ambientColor: 'rgba(100, 180, 255, 0.02)',
    glowIntensity: 0.4,
    particleSpeed: 1.0,
    warmth: 0.5,
  },
  evening: {
    ambientColor: 'rgba(255, 150, 100, 0.04)',
    glowIntensity: 0.7,
    particleSpeed: 0.6,
    warmth: 0.8,
  },
  night: {
    ambientColor: 'rgba(100, 100, 200, 0.03)',
    glowIntensity: 0.3,
    particleSpeed: 0.4,
    warmth: 0.2,
  },
};

// Holiday themes - using centralized HOLIDAY_COLORS from semantic-colors
import { HOLIDAY_COLORS } from '../config/semantic-colors.js';

const HOLIDAY_THEMES: Record<string, { colors: string[]; message: string }> = {
  christmas: {
    colors: [HOLIDAY_COLORS.christmas.primary, HOLIDAY_COLORS.christmas.secondary, HOLIDAY_COLORS.christmas.accent],
    message: 'Happy Holidays',
  },
  newyear: {
    colors: [HOLIDAY_COLORS.newYear.primary, HOLIDAY_COLORS.newYear.secondary, HOLIDAY_COLORS.newYear.accent],
    message: 'Happy New Year',
  },
  halloween: {
    colors: [HOLIDAY_COLORS.halloween.primary, HOLIDAY_COLORS.halloween.secondary, HOLIDAY_COLORS.halloween.accent],
    message: 'Happy Halloween',
  },
  valentines: {
    colors: [HOLIDAY_COLORS.valentines.primary, HOLIDAY_COLORS.valentines.secondary, HOLIDAY_COLORS.valentines.accent],
    message: "Happy Valentine's Day",
  },
  thanksgiving: {
    colors: [HOLIDAY_COLORS.fall.primary, HOLIDAY_COLORS.fall.secondary, HOLIDAY_COLORS.fall.accent],
    message: 'Happy Thanksgiving',
  },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMoodUI(): void {
  // Set initial mood based on time
  updateMood();
  
  // Check for holiday
  const holiday = detectHoliday();
  if (holiday) {
    applyHolidayTheme(holiday);
  }
  
  // Update mood periodically (every 30 minutes)
  setInterval(updateMood, 30 * 60 * 1000);
  
}

// ============================================================================
// MOOD MANAGEMENT
// ============================================================================

/**
 * Update mood based on current time.
 */
function updateMood(): void {
  const timeOfDay = getTimeOfDay();
  currentMood = TIME_MOODS[timeOfDay];
  
  applyMoodStyles(currentMood);
}

/**
 * Get current time of day.
 */
function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Get current season.
 */
function getSeason(): Season {
  const month = new Date().getMonth();
  
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

/**
 * Apply mood styles to the document.
 */
function applyMoodStyles(mood: MoodConfig): void {
  const root = document.documentElement;
  
  root.style.setProperty('--ambient-color', mood.ambientColor);
  root.style.setProperty('--glow-intensity', String(mood.glowIntensity));
  root.style.setProperty('--particle-speed', `${mood.particleSpeed}s`);
  root.style.setProperty('--warmth', String(mood.warmth));
}

// ============================================================================
// HOLIDAY DETECTION
// ============================================================================

/**
 * Detect if today is a holiday.
 */
function detectHoliday(): Holiday {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  
  // Christmas (Dec 20-26)
  if (month === 11 && day >= 20 && day <= 26) return 'christmas';
  
  // New Year (Dec 31 - Jan 2)
  if ((month === 11 && day === 31) || (month === 0 && day <= 2)) return 'newyear';
  
  // Halloween (Oct 28-31)
  if (month === 9 && day >= 28) return 'halloween';
  
  // Valentine's Day (Feb 13-14)
  if (month === 1 && (day === 13 || day === 14)) return 'valentines';
  
  // Thanksgiving (4th Thursday of November - approximate with Nov 22-28)
  if (month === 10 && day >= 22 && day <= 28) {
    const thanksgiving = getNthWeekdayOfMonth(now.getFullYear(), 10, 4, 4);
    if (day >= thanksgiving.getDate() - 1 && day <= thanksgiving.getDate() + 1) {
      return 'thanksgiving';
    }
  }
  
  return null;
}

/**
 * Get the nth weekday of a month.
 */
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysUntilWeekday = (weekday - firstWeekday + 7) % 7;
  const nthWeekday = 1 + daysUntilWeekday + (n - 1) * 7;
  return new Date(year, month, nthWeekday);
}

/**
 * Apply holiday theme - subtle color shift only.
 */
function applyHolidayTheme(holiday: Holiday): void {
  if (!holiday) return;
  
  const theme = HOLIDAY_THEMES[holiday];
  if (!theme) return;
  
  // Add holiday class to body
  document.body.classList.add(`holiday-${holiday}`);
  
  // Set holiday CSS variables
  const root = document.documentElement;
  theme.colors.forEach((color, i) => {
    root.style.setProperty(`--holiday-color-${i + 1}`, color);
  });
  
  // Show subtle holiday indicator - typography only
  showHolidayIndicator(theme.message);
  
}

/**
 * Show a subtle holiday indicator - clean typography only.
 */
function showHolidayIndicator(message: string): void {
  // Create indicator element
  const indicator = document.createElement('div');
  indicator.className = 'holiday-indicator';
  indicator.innerHTML = `
    <span class="holiday-message">${message}</span>
  `;
  
  document.body.appendChild(indicator);
  
  // Animate in
  requestAnimationFrame(() => {
    indicator.classList.add('visible');
  });
  
  // Remove after a few seconds
  setTimeout(() => {
    indicator.classList.remove('visible');
    setTimeout(() => indicator.remove(), 500);
  }, 5000);
}

// ============================================================================
// AMBIENT EFFECTS
// ============================================================================

/**
 * Create floating particles effect.
 */
export function createAmbientParticles(): void {
  const container = document.createElement('div');
  container.className = 'ambient-particles';
  container.innerHTML = Array.from({ length: 20 }, () => 
    '<div class="ambient-particle"></div>'
  ).join('');
  
  document.body.appendChild(container);
  ambientElement = container;
}

/**
 * Remove ambient particles.
 */
export function removeAmbientParticles(): void {
  if (ambientElement) {
    ambientElement.remove();
    ambientElement = null;
  }
}

// ============================================================================
// PERSONA MOOD (from agent's humanizing system)
// ============================================================================

/**
 * Persona mood states from the agent.
 * These affect subtle UI elements to reflect the AI's "emotional" state.
 */
type PersonaMood =
  | 'energized'
  | 'reflective'
  | 'playful'
  | 'grounded'
  | 'tired_but_present'
  | 'philosophical'
  | 'nostalgic';

type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'trusted_advisor';

interface PersonaMoodState {
  mood: PersonaMood;
  energyLevel: number;
  relationshipStage: RelationshipStage;
  hasTransition: boolean;
}

let currentPersonaMood: PersonaMoodState | null = null;

/**
 * Mood visual configurations for each persona mood state.
 * These create subtle but noticeable UI changes.
 */
const PERSONA_MOOD_STYLES: Record<PersonaMood, {
  orbPulseSpeed: number;    // How fast the orb pulses (lower = slower)
  orbGlow: number;          // Glow intensity (0-1)
  waveformEnergy: number;   // Waveform animation energy (0-1)
  colorShift: string;       // CSS filter hue-rotate value
  cssClass: string;         // CSS class to add to container
}> = {
  energized: {
    orbPulseSpeed: 2.5,
    orbGlow: 1.2,
    waveformEnergy: 1.1,
    colorShift: '0deg',
    cssClass: 'persona-energized',
  },
  reflective: {
    orbPulseSpeed: 5,
    orbGlow: 0.7,
    waveformEnergy: 0.7,
    colorShift: '-10deg',
    cssClass: 'persona-reflective',
  },
  playful: {
    orbPulseSpeed: 2,
    orbGlow: 1.1,
    waveformEnergy: 1.2,
    colorShift: '10deg',
    cssClass: 'persona-playful',
  },
  grounded: {
    orbPulseSpeed: 4,
    orbGlow: 0.9,
    waveformEnergy: 0.9,
    colorShift: '0deg',
    cssClass: 'persona-grounded',
  },
  tired_but_present: {
    orbPulseSpeed: 6,
    orbGlow: 0.6,
    waveformEnergy: 0.6,
    colorShift: '-5deg',
    cssClass: 'persona-tired',
  },
  philosophical: {
    orbPulseSpeed: 5.5,
    orbGlow: 0.8,
    waveformEnergy: 0.75,
    colorShift: '-15deg',
    cssClass: 'persona-philosophical',
  },
  nostalgic: {
    orbPulseSpeed: 5,
    orbGlow: 0.75,
    waveformEnergy: 0.7,
    colorShift: '15deg',
    cssClass: 'persona-nostalgic',
  },
};

/**
 * Relationship stage visual hints.
 */
const RELATIONSHIP_STYLES: Record<RelationshipStage, {
  warmthMultiplier: number;
  tooltipHint?: string;
}> = {
  stranger: {
    warmthMultiplier: 0.8,
  },
  acquaintance: {
    warmthMultiplier: 0.9,
  },
  friend: {
    warmthMultiplier: 1.0,
    tooltipHint: '💙',
  },
  trusted_advisor: {
    warmthMultiplier: 1.1,
    tooltipHint: '💜',
  },
};

/**
 * Set persona mood from agent data message.
 */
export function setPersonaMood(
  mood: PersonaMood,
  energyLevel: number,
  relationshipStage: RelationshipStage,
  hasTransition: boolean = false
): void {
  const previousMood = currentPersonaMood?.mood;

  currentPersonaMood = {
    mood,
    energyLevel,
    relationshipStage,
    hasTransition,
  };

  // Apply visual styles
  applyPersonaMoodStyles(mood, energyLevel, relationshipStage);

  // If relationship deepened, show subtle celebration
  if (hasTransition) {
    showRelationshipTransition(relationshipStage);
  }

  // Log for debugging
  if (previousMood !== mood) {
    console.log(`🎭 Persona mood: ${previousMood || 'none'} → ${mood} (energy: ${(energyLevel * 100).toFixed(0)}%)`);
  }
}

/**
 * Apply visual styles for the current persona mood.
 */
function applyPersonaMoodStyles(
  mood: PersonaMood,
  energyLevel: number,
  relationshipStage: RelationshipStage
): void {
  const moodStyle = PERSONA_MOOD_STYLES[mood];
  const relationshipStyle = RELATIONSHIP_STYLES[relationshipStage];
  const root = document.documentElement;

  // Remove all persona mood classes first
  const moodClasses = Object.values(PERSONA_MOOD_STYLES).map(s => s.cssClass);
  document.body.classList.remove(...moodClasses);

  // Add current mood class
  document.body.classList.add(moodStyle.cssClass);

  // Set CSS variables
  root.style.setProperty('--persona-pulse-speed', `${moodStyle.orbPulseSpeed}s`);
  root.style.setProperty('--persona-glow', String(moodStyle.orbGlow * relationshipStyle.warmthMultiplier));
  root.style.setProperty('--persona-energy', String(moodStyle.waveformEnergy * energyLevel));
  root.style.setProperty('--persona-hue-shift', moodStyle.colorShift);
  root.style.setProperty('--persona-warmth', String(relationshipStyle.warmthMultiplier));
}

/**
 * Show a subtle indicator when relationship deepens.
 */
function showRelationshipTransition(newStage: RelationshipStage): void {
  const style = RELATIONSHIP_STYLES[newStage];
  if (!style.tooltipHint) return;

  // Create a subtle pulse effect
  const indicator = document.createElement('div');
  indicator.className = 'relationship-transition-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 3rem;
    opacity: 0;
    animation: relationship-bloom 2s ease-out forwards;
    pointer-events: none;
    z-index: 1000;
  `;
  indicator.textContent = style.tooltipHint;

  document.body.appendChild(indicator);

  // Remove after animation
  setTimeout(() => indicator.remove(), 2000);
}

/**
 * Get current persona mood state.
 */
export function getPersonaMoodState(): PersonaMoodState | null {
  return currentPersonaMood;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current mood configuration.
 */
export function getCurrentMood(): MoodConfig | null {
  return currentMood;
}

/**
 * Get current season.
 */
export function getCurrentSeason(): Season {
  return getSeason();
}

/**
 * Get current time of day.
 */
export function getCurrentTimeOfDay(): TimeOfDay {
  return getTimeOfDay();
}

/**
 * Check if it's a holiday.
 */
export function isHoliday(): boolean {
  return detectHoliday() !== null;
}

/**
 * Get current holiday.
 */
export function getCurrentHoliday(): Holiday {
  return detectHoliday();
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  removeAmbientParticles();
  
  // Remove holiday classes
  document.body.classList.remove(
    'holiday-christmas',
    'holiday-newyear',
    'holiday-halloween',
    'holiday-valentines',
    'holiday-thanksgiving'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const moodUI = {
  init: initMoodUI,
  getCurrentMood,
  getCurrentSeason,
  getCurrentTimeOfDay,
  isHoliday,
  getCurrentHoliday,
  createAmbientParticles,
  removeAmbientParticles,
  dispose,
  // Persona mood (from agent)
  setPersonaMood,
  getPersonaMoodState,
};

