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

const HOLIDAY_THEMES: Record<string, { colors: string[]; emoji: string; message: string }> = {
  christmas: {
    colors: ['#c41e3a', '#228b22', '#ffd700'],
    emoji: '🎄',
    message: 'Happy Holidays!',
  },
  newyear: {
    colors: ['#ffd700', '#c0c0c0', '#ffffff'],
    emoji: '🎆',
    message: 'Happy New Year!',
  },
  halloween: {
    colors: ['#ff6600', '#6a0dad', '#000000'],
    emoji: '🎃',
    message: 'Happy Halloween!',
  },
  valentines: {
    colors: ['#ff69b4', '#ff1493', '#ff6b6b'],
    emoji: '💕',
    message: "Happy Valentine's Day!",
  },
  thanksgiving: {
    colors: ['#8b4513', '#ff8c00', '#daa520'],
    emoji: '🦃',
    message: 'Happy Thanksgiving!',
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
  
  console.log('🌙 Mood UI initialized');
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
 * Apply holiday theme.
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
  
  // Show subtle holiday indicator
  showHolidayIndicator(theme.emoji, theme.message);
  
  console.log(`🎉 Holiday theme applied: ${holiday}`);
}

/**
 * Show a subtle holiday indicator.
 */
function showHolidayIndicator(emoji: string, message: string): void {
  // Create indicator element
  const indicator = document.createElement('div');
  indicator.className = 'holiday-indicator';
  indicator.innerHTML = `
    <span class="holiday-emoji">${emoji}</span>
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
};

