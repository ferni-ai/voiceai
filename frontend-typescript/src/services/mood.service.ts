/**
 * Mood State Service
 * 
 * Receives mood state updates from the backend humanizing system
 * and applies corresponding CSS classes to create visual atmosphere.
 * 
 * Mood states reflect the AI's "emotional" state:
 * - energized: High energy, fast pulse
 * - reflective: Thoughtful, slower
 * - playful: Bouncy, bright
 * - grounded: Calm, centered
 * - tired_but_present: Lower energy but engaged
 * - philosophical: Deep, contemplative
 * - nostalgic: Warm, memory-heavy
 */

// ============================================================================
// TYPES
// ============================================================================

export type MoodState = 
  | 'energized'
  | 'reflective'
  | 'playful'
  | 'grounded'
  | 'tired_but_present'
  | 'philosophical'
  | 'nostalgic';

export interface MoodUpdate {
  type: 'mood';
  state: MoodState;
  energyLevel?: number; // 0-1
  relationshipStage?: string;
  hasTransition?: boolean;
}

export interface MoodCallbacks {
  onMoodChange?: (mood: MoodState, previousMood: MoodState | null) => void;
}

// ============================================================================
// STATE
// ============================================================================

let currentMood: MoodState | null = null;
let appElement: HTMLElement | null = null;
const callbacks: MoodCallbacks = {};

// Map mood states to CSS class names
const MOOD_CLASSES: Record<MoodState, string> = {
  energized: 'persona-energized',
  reflective: 'persona-reflective',
  playful: 'persona-playful',
  grounded: 'persona-grounded',
  tired_but_present: 'persona-tired',
  philosophical: 'persona-philosophical',
  nostalgic: 'persona-nostalgic',
};

// Default CSS variable values for each mood
const MOOD_VARIABLES: Record<MoodState, Record<string, string>> = {
  energized: {
    '--persona-pulse-speed': '2s',
    '--persona-glow': '1.2',
    '--persona-energy': '1.2',
    '--persona-warmth': '1.1',
  },
  reflective: {
    '--persona-pulse-speed': '5s',
    '--persona-glow': '0.7',
    '--persona-energy': '0.7',
    '--persona-warmth': '0.9',
  },
  playful: {
    '--persona-pulse-speed': '2.5s',
    '--persona-glow': '1.1',
    '--persona-energy': '1.15',
    '--persona-warmth': '1.15',
  },
  grounded: {
    '--persona-pulse-speed': '4s',
    '--persona-glow': '0.9',
    '--persona-energy': '0.9',
    '--persona-warmth': '1',
  },
  tired_but_present: {
    '--persona-pulse-speed': '6s',
    '--persona-glow': '0.6',
    '--persona-energy': '0.6',
    '--persona-warmth': '0.85',
  },
  philosophical: {
    '--persona-pulse-speed': '5s',
    '--persona-glow': '0.8',
    '--persona-energy': '0.75',
    '--persona-warmth': '0.95',
  },
  nostalgic: {
    '--persona-pulse-speed': '4.5s',
    '--persona-glow': '0.85',
    '--persona-energy': '0.8',
    '--persona-warmth': '1.1',
  },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the mood service
 */
export function initMoodService(): void {
  appElement = document.getElementById('app');
  
  if (!appElement) {
    console.warn('App element not found for mood service');
  }
}

/**
 * Set callbacks for mood changes
 */
export function setMoodCallbacks(cbs: MoodCallbacks): void {
  Object.assign(callbacks, cbs);
}

// ============================================================================
// MOOD UPDATES
// ============================================================================

/**
 * Check if a data message is a mood update
 */
export function isMoodUpdate(message: unknown): message is MoodUpdate {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type: string }).type === 'mood' &&
    'state' in message
  );
}

/**
 * Apply a mood state to the UI
 */
export function setMood(mood: MoodState): void {
  if (!appElement) {
    appElement = document.getElementById('app');
  }
  
  if (!appElement) return;
  
  const previousMood = currentMood;
  
  // Remove all mood classes
  Object.values(MOOD_CLASSES).forEach(cls => {
    appElement?.classList.remove(cls);
  });
  
  // Add new mood class
  const moodClass = MOOD_CLASSES[mood];
  if (moodClass) {
    appElement.classList.add(moodClass);
  }
  
  // Apply CSS variables
  const variables = MOOD_VARIABLES[mood];
  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }
  
  currentMood = mood;
  
  // Notify callbacks
  if (callbacks.onMoodChange && previousMood !== mood) {
    callbacks.onMoodChange(mood, previousMood);
  }
  
  console.debug(`🎭 Mood changed: ${previousMood ?? 'none'} → ${mood}`);
}

/**
 * Process a mood update message from the backend
 */
export function processMoodUpdate(update: MoodUpdate): void {
  // Apply mood class
  setMood(update.state);
  
  // Apply energy level from backend
  if (update.energyLevel !== undefined) {
    document.documentElement.style.setProperty(
      '--persona-energy', 
      String(update.energyLevel)
    );
    
    // Derive pulse speed from energy level (higher energy = faster pulse)
    const pulseSpeed = 6 - (update.energyLevel * 4); // 2s to 6s
    document.documentElement.style.setProperty(
      '--persona-pulse-speed', 
      `${pulseSpeed}s`
    );
  }
  
  // Log relationship transition if present
  if (update.hasTransition && update.relationshipStage) {
    console.debug(`💕 Relationship transition to: ${update.relationshipStage}`);
  }
}

/**
 * Get the current mood state
 */
export function getCurrentMood(): MoodState | null {
  return currentMood;
}

/**
 * Clear mood state (on disconnect)
 */
export function clearMood(): void {
  if (!appElement) return;
  
  // Remove all mood classes
  Object.values(MOOD_CLASSES).forEach(cls => {
    appElement?.classList.remove(cls);
  });
  
  // Reset CSS variables to defaults
  document.documentElement.style.setProperty('--persona-pulse-speed', '4s');
  document.documentElement.style.setProperty('--persona-glow', '0.9');
  document.documentElement.style.setProperty('--persona-energy', '0.9');
  document.documentElement.style.setProperty('--persona-warmth', '1');
  
  currentMood = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const moodService = {
  init: initMoodService,
  setCallbacks: setMoodCallbacks,
  isMoodUpdate,
  processMoodUpdate,
  setMood,
  getCurrentMood,
  clearMood,
};

