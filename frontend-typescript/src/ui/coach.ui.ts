/**
 * Coach UI Component - Ferni Character Animation System
 * 
 * Each persona has distinct animation personality:
 * - Ferni: Curious, warm, grounded presence
 * - Jack Bogle: Wise, measured, contemplative (sage mentor)
 * - Peter Lynch: Quick, practical, energetic
 * - Alex Chen: Empathetic, warm presence
 * - Maya Santos: Precise, organized, methodical
 * - Jordan Taylor: Creative, enthusiastic, joyful
 * 
 * BRAND PRINCIPLES: Warm, Grounded, Wise, Present, Human
 * 
 * NOTE: Animation profiles imported from @design-system/tokens
 */

import type { PersonaConfig } from '../types/persona.js';
import type { ConnectionState, AudioState, VoiceEmotion } from '../types/events.js';
import { appState } from '../state/app.state.js';
import { getElementById, setText, setClasses, addClass, removeClass } from '../utils/dom.js';
// 🔤 Kinetic Typography for name animations
import { animateNameHandoff, scrambleReveal } from './kinetic-typography.ui.js';
import {
  getPersonaAnimationProfile,
  getEasing,
  type PersonaAnimationProfile,
} from '@design-system/tokens';
// 🎭 Dynamic relationship-based subtitles for Ferni
import { relationshipStageService } from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CoachUI');

// ============================================================================
// ANIMATION PROFILE ADAPTER
// ============================================================================

interface AnimationProfile {
  breatheDuration: string;
  breatheIntensity: number;
  bounceDuration: string;
  bounceIntensity: number;
  reactionDelay: number;
  easing: string;
}

// Base durations for timing calculations
const BASE_BREATHE_DURATION = 4000; // 4s
const BASE_BOUNCE_DURATION = 500;   // 500ms
const BASE_REACTION_DELAY = 200;    // 200ms

/**
 * Convert design system persona profile to animation profile.
 * Uses timing multiplier and bounciness from design tokens.
 */
function createAnimationProfile(dsProfile: PersonaAnimationProfile): AnimationProfile {
  const breatheDuration = Math.round(BASE_BREATHE_DURATION * dsProfile.timingMultiplier);
  const bounceDuration = Math.round(BASE_BOUNCE_DURATION * dsProfile.timingMultiplier);
  const reactionDelay = Math.round(BASE_REACTION_DELAY * dsProfile.timingMultiplier);
  
  // Higher bounciness = more bounce intensity
  const bounceIntensity = 1 + (dsProfile.bounciness * 0.1);
  const breatheIntensity = 1 + (dsProfile.bounciness * 0.03);
  
  return {
    breatheDuration: `${breatheDuration}ms`,
    breatheIntensity,
    bounceDuration: `${bounceDuration}ms`,
    bounceIntensity,
    reactionDelay,
    easing: getEasing(dsProfile.easingPreference),
  };
}

// Default animation profile (used when persona not found)
const DEFAULT_ANIMATION: AnimationProfile = {
  breatheDuration: '4s',
  breatheIntensity: 1.02,
  bounceDuration: '500ms',
  bounceIntensity: 1.05,
  reactionDelay: 200,
  easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
};

// Cache for converted profiles
const profileCache = new Map<string, AnimationProfile>();

/**
 * Get animation profile for persona from design system.
 * Falls back to default if persona not found.
 */
function getAnimationProfileForPersona(personaId: string): AnimationProfile {
  // Check cache first
  if (profileCache.has(personaId)) {
    return profileCache.get(personaId)!;
  }
  
  // Try design system profile
  const dsProfile = getPersonaAnimationProfile(personaId);
  if (dsProfile) {
    const profile = createAnimationProfile(dsProfile);
    profileCache.set(personaId, profile);
    return profile;
  }
  
  // Fall back to default
  return DEFAULT_ANIMATION;
}

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
let currentPersonaId: string = 'ferni';
let breatheAnimation: Animation | null = null;
let subtitleUnsubscribe: (() => void) | null = null;

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
    
    // 🎭 Subscribe to dynamic Ferni subtitle changes
    subtitleUnsubscribe = relationshipStageService.onSubtitleChange((newSubtitle) => {
      // Only update if currently showing Ferni
      if (currentPersonaId === 'ferni' && elements?.subtitle) {
        scrambleReveal(elements.subtitle, newSubtitle, { duration: 400 });
      }
    });

    // Initial render
    const persona = appState.get('activePersona');
    updatePersonaDisplay(persona);

  } catch (error) {
    log.error('Failed to initialize Coach UI:', error);
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
 * Get animation profile for current persona from design system.
 */
function getAnimationProfile(): AnimationProfile {
  return getAnimationProfileForPersona(currentPersonaId);
}

/**
 * Start persona-specific breathing animation
 * 
 * NOTE: Breathing is now handled by presence.ui.ts on the CONTAINER.
 * This function is preserved for persona transitions only.
 * The container handles position/scale breathing, inner avatar handles
 * persona-specific effects like color transitions and reactions.
 * 
 * Pixar principle: everything alive breathes - but from ONE source only.
 */
function startBreathingAnimation(): void {
  // Breathing is handled by presence.ui.ts on the container
  // This prevents animation conflicts that cause jitter
  // Coach.ui.ts only handles persona-specific reactions
  
  if (breatheAnimation) {
    breatheAnimation.cancel();
    breatheAnimation = null;
  }
}

/**
 * Play character-quality reaction animation.
 * Different intensity based on persona personality.
 * Brand: warm, grounded, present.
 */
function playReaction(type: 'bounce' | 'attention' | 'settle' | 'joy'): void {
  if (!elements) return;
  
  const profile = getAnimationProfile();
  
  let keyframes: Keyframe[];
  let duration: number;
  
  switch (type) {
    case 'bounce':
      // Pixar anticipation + bounce + settle
      keyframes = [
        { transform: 'scale(1) translateY(0)', offset: 0 },
        { transform: 'scale(0.97) translateY(2px)', offset: 0.15 }, // anticipation
        { transform: `scale(${profile.bounceIntensity}) translateY(-5px)`, offset: 0.4 },
        { transform: 'scale(0.98) translateY(1px)', offset: 0.7 },
        { transform: 'scale(1) translateY(0)', offset: 1 },
      ];
      duration = parseFloat(profile.bounceDuration);
      break;
      
    case 'attention':
      // Quick snap to attention - alert, present awareness
      keyframes = [
        { transform: 'scale(1) rotate(0deg)', offset: 0 },
        { transform: 'scale(1.03) rotate(-1deg)', offset: 0.3 },
        { transform: 'scale(1.01) rotate(0.5deg)', offset: 0.6 },
        { transform: 'scale(1) rotate(0deg)', offset: 1 },
      ];
      duration = 300;
      break;
      
    case 'settle':
      // Gentle settle - grounded, present, calming
      keyframes = [
        { transform: 'scale(1.02)', offset: 0 },
        { transform: 'scale(0.99)', offset: 0.5 },
        { transform: 'scale(1)', offset: 1 },
      ];
      duration = 500;
      break;
      
    case 'joy':
      // Happy bounce - warm, genuine, grounded delight
      keyframes = [
        { transform: 'scale(1) translateY(0)', offset: 0 },
        { transform: `scale(${profile.bounceIntensity * 1.02}) translateY(-8px)`, offset: 0.25 },
        { transform: 'scale(0.97) translateY(2px)', offset: 0.5 },
        { transform: 'scale(1.02) translateY(-3px)', offset: 0.75 },
        { transform: 'scale(1) translateY(0)', offset: 1 },
      ];
      duration = 600;
      break;
  }
  
  elements.avatar.animate(keyframes, {
    duration,
    easing: profile.easing,
    fill: 'forwards',
  });
}

/**
 * Update the displayed persona with their unique colors.
 * Includes character-quality animations unique to each persona.
 */
export function updatePersonaDisplay(persona: PersonaConfig): void {
  if (!elements) return;
  
  // Update current persona ID for animation profile
  currentPersonaId = persona.id;

  // Trigger transition animation
  addClass(elements.container, 'persona-transitioning');
  
  // Play persona-specific entrance bounce
  const profile = getAnimationProfile();
  setTimeout(() => {
    playReaction('bounce');
  }, profile.reactionDelay);
  
  // Remove transition class after animation completes
  setTimeout(() => {
    elements?.container && removeClass(elements.container, 'persona-transitioning');
  }, 600);

  setText(elements.avatarText, persona.initials);
  
  // 🔤 Animate name change with kinetic typography
  if (elements.name && elements.name.textContent !== persona.name) {
    void animateNameHandoff(elements.name, persona.name, { duration: 500 });
  } else {
    setText(elements.name, persona.name);
  }
  
  // 🎭 Get subtitle - dynamic for Ferni, static for others
  const subtitle = persona.id === 'ferni' 
    ? relationshipStageService.getSubtitle()
    : persona.subtitle;
  
  // 🔤 Scramble reveal subtitle
  if (elements.subtitle && elements.subtitle.textContent !== subtitle) {
    scrambleReveal(elements.subtitle, subtitle, { duration: 400 });
  } else {
    setText(elements.subtitle, subtitle);
  }

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
  
  // Restart breathing animation with new persona timing
  startBreathingAnimation();
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
 * 
 * The outer ring should be subtle and stable.
 * Most visual movement should come from the waveform and avatar itself.
 */
export function setVisualizationVolume(volume: number): void {
  if (!elements) return;

  // Scale the ring VERY subtly - the waveform provides main visual feedback
  // Ring should feel like a gentle halo, not bouncing wildly
  const scale = 1 + volume * 0.06; // Reduced from 0.3 to 0.06 (6% max vs 30%)
  elements.avatarRing.style.transform = `scale(${scale})`;

  // Subtle opacity change - ring stays more consistent
  elements.avatarRing.style.opacity = String(0.35 + volume * 0.35); // Narrower range
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
// EMOTION HANDLING - Character-quality emotional reactions
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

/**
 * Emotion to reaction mapping.
 * Each emotion triggers a character-appropriate response.
 * Brand: warm, grounded, present.
 */
const EMOTION_REACTIONS: Record<VoiceEmotion, 'bounce' | 'attention' | 'settle' | 'joy' | null> = {
  neutral: null,
  happy: 'joy',
  excited: 'joy',
  calm: 'settle',
  anxious: 'attention',
  sad: 'settle',
  frustrated: 'attention',
};

let currentEmotionClass: string | null = null;

/**
 * Set the emotion state for avatar visual feedback.
 * Character principle: emotions drive movement with warmth and presence.
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
  
  // Play Pixar-style reaction animation
  const reaction = EMOTION_REACTIONS[emotion];
  if (reaction) {
    const profile = getAnimationProfile();
    setTimeout(() => {
      playReaction(reaction);
    }, profile.reactionDelay);
  }
}

/**
 * Bounce avatar - for positive moments
 */
export function bounce(): void {
  playReaction('bounce');
}

/**
 * Clean up coach UI resources
 */
export function dispose(): void {
  if (subtitleUnsubscribe) {
    subtitleUnsubscribe();
    subtitleUnsubscribe = null;
  }
  if (breatheAnimation) {
    breatheAnimation.cancel();
    breatheAnimation = null;
  }
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
  bounce,
  dispose,
  // Expose for advanced usage
  playReaction,
};

