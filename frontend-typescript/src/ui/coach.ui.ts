/**
 * Coach UI Component
 * 
 * Manages the main coach avatar display.
 * Handles visual feedback for connection state, speaking, and emotions.
 */

import type { PersonaConfig } from '../types/persona.js';
import type { ConnectionState, AudioState, VoiceEmotion } from '../types/events.js';
import { appState } from '../state/app.state.js';
import { getElementById, setText, setClasses, addClass, removeClass } from '../utils/dom.js';

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

interface CoachElements {
  container: HTMLElement;
  avatar: HTMLElement;
  avatarText: HTMLElement;
  avatarRing: HTMLElement;
  name: HTMLElement;
  subtitle: HTMLElement;
  statusIndicator: HTMLElement;
}

let elements: CoachElements | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the coach UI component.
 * Must be called after DOM is ready.
 */
export function initCoachUI(): void {
  try {
    elements = {
      container: getElementById('coach'),
      avatar: getElementById('coachAvatar'),
      avatarText: getElementById('avatarText'),
      avatarRing: getElementById('avatarRing'),
      name: getElementById('personaName'),
      subtitle: getElementById('personaSubtitle'),
      statusIndicator: getElementById('statusIndicator'),
    };

    // Set up state subscriptions
    setupSubscriptions();

    // Initial render
    const persona = appState.get('activePersona');
    updatePersonaDisplay(persona);

    console.log('✅ Coach UI initialized');
  } catch (error) {
    console.error('Failed to initialize Coach UI:', error);
  }
}

// ============================================================================
// STATE SUBSCRIPTIONS
// ============================================================================

function setupSubscriptions(): void {
  // Active persona changes
  appState.subscribe('activePersona', (persona) => {
    updatePersonaDisplay(persona);
  });

  // Connection state changes
  appState.subscribe('connection', (state) => {
    updateConnectionState(state);
  });

  // Audio state changes
  appState.subscribe('audio', (state) => {
    updateAudioState(state);
  });
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

/**
 * Update the displayed persona with their unique colors.
 * Includes playful bounce animation on persona change.
 */
export function updatePersonaDisplay(persona: PersonaConfig): void {
  if (!elements) return;

  // Trigger transition animation
  addClass(elements.container, 'persona-transitioning');
  
  // Remove transition class after animation completes
  setTimeout(() => {
    elements?.container && removeClass(elements.container, 'persona-transitioning');
  }, 600);

  setText(elements.avatarText, persona.initials);
  setText(elements.name, persona.name);
  setText(elements.subtitle, persona.subtitle);

  // Update theme class
  if (persona.themeClass) {
    // Remove other theme classes
    elements.container.className = elements.container.className
      .replace(/persona-[\w-]+/g, '')
      .trim();
    addClass(elements.container, persona.themeClass);
    // Re-add transition class since we just modified className
    addClass(elements.container, 'persona-transitioning');
  }

  // Apply persona-specific colors
  if (persona.colors) {
    elements.avatar.style.background = persona.colors.gradient;
    elements.avatarRing.style.borderColor = persona.colors.primary;
    elements.container.style.setProperty('--persona-primary', persona.colors.primary);
    elements.container.style.setProperty('--persona-secondary', persona.colors.secondary);
    elements.container.style.setProperty('--persona-glow', persona.colors.glow);
  }
}

/**
 * Update visual state based on connection.
 */
export function updateConnectionState(state: ConnectionState): void {
  if (!elements) return;

  setClasses(elements.container, {
    'is-disconnected': state === 'disconnected',
    'is-connecting': state === 'connecting',
    'is-connected': state === 'connected',
    'is-reconnecting': state === 'reconnecting',
    'is-error': state === 'error',
  });

  // Update status indicator
  setClasses(elements.statusIndicator, {
    'status-disconnected': state === 'disconnected',
    'status-connecting': state === 'connecting' || state === 'reconnecting',
    'status-connected': state === 'connected',
    'status-error': state === 'error',
  });
}

/**
 * Update visual state based on audio activity.
 */
export function updateAudioState(state: AudioState): void {
  if (!elements) return;

  setClasses(elements.container, {
    'is-idle': state === 'idle',
    'is-speaking': state === 'speaking',
    'is-listening': state === 'listening',
  });

  // Animate ring when speaking
  setClasses(elements.avatarRing, {
    'ring-pulse': state === 'speaking',
    'ring-glow': state === 'listening',
  });
}

/**
 * Set the audio visualization volume (0-1).
 */
export function setVisualizationVolume(volume: number): void {
  if (!elements) return;

  // Scale the ring based on volume
  const scale = 1 + volume * 0.3;
  elements.avatarRing.style.transform = `scale(${scale})`;

  // Also set opacity
  elements.avatarRing.style.opacity = String(0.3 + volume * 0.7);
}

/**
 * Flash the avatar (for handoffs or emphasis).
 */
export function flashAvatar(): void {
  if (!elements) return;

  addClass(elements.avatar, 'flash');
  setTimeout(() => {
    if (elements) {
      removeClass(elements.avatar, 'flash');
    }
  }, 500);
}

/**
 * Dim the coach when team member is active.
 */
export function setDimmed(dimmed: boolean): void {
  if (!elements) return;

  setClasses(elements.container, {
    'is-dimmed': dimmed,
  });
}

// ============================================================================
// EMOTION HANDLING
// ============================================================================

/**
 * Emotion to CSS class mapping for avatar glow effects.
 */
const EMOTION_CLASSES: Record<VoiceEmotion, string> = {
  neutral: 'emotion-neutral',
  happy: 'emotion-happy',
  excited: 'emotion-excited',
  calm: 'emotion-calm',
  anxious: 'emotion-anxious',
  sad: 'emotion-sad',
  frustrated: 'emotion-frustrated',
};

let currentEmotionClass: string | null = null;

/**
 * Set the emotion state for avatar visual feedback.
 * Updates the glow color of the avatar ring.
 */
export function setEmotion(emotion: VoiceEmotion): void {
  if (!elements) return;

  // Remove previous emotion class
  if (currentEmotionClass) {
    removeClass(elements.container, currentEmotionClass);
  }

  // Add new emotion class
  currentEmotionClass = EMOTION_CLASSES[emotion] || 'emotion-neutral';
  addClass(elements.container, currentEmotionClass);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const coachUI = {
  init: initCoachUI,
  updatePersona: updatePersonaDisplay,
  updateConnection: updateConnectionState,
  updateAudio: updateAudioState,
  setVolume: setVisualizationVolume,
  flash: flashAvatar,
  setDimmed,
  setEmotion,
};

