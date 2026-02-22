/**
 * Therapeutic Animations
 * 
 * Animation presets designed to regulate the nervous system.
 * Based on somatic therapy principles:
 * - Grounding: Downward, settling movements
 * - Calming: Slow, rhythmic, breath-synced
 * - Energizing: Upward, expanding movements
 * - Centering: Circular, gathering movements
 */

// =============================================================================
// Types
// =============================================================================

export type TherapeuticIntent = 'grounding' | 'calming' | 'energizing' | 'centering' | 'releasing';

export interface TherapeuticAnimation {
  name: string;
  intent: TherapeuticIntent;
  description: string;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  breathSync?: boolean;
  repeatCount?: number;
}

export interface BreathCycle {
  inhale: number;  // ms
  hold: number;    // ms
  exhale: number;  // ms
  pause: number;   // ms
}

// =============================================================================
// Breath Patterns
// =============================================================================

export const BREATH_PATTERNS: Record<string, BreathCycle> = {
  /** 4-7-8 breathing for deep calm */
  calm478: { inhale: 4000, hold: 7000, exhale: 8000, pause: 0 },
  
  /** Box breathing for balance */
  box: { inhale: 4000, hold: 4000, exhale: 4000, pause: 4000 },
  
  /** Energizing breath */
  energize: { inhale: 2000, hold: 1000, exhale: 2000, pause: 500 },
  
  /** Grounding breath */
  ground: { inhale: 5000, hold: 2000, exhale: 7000, pause: 2000 },
  
  /** Natural relaxed breathing */
  natural: { inhale: 3000, hold: 0, exhale: 4000, pause: 1000 },
};

// =============================================================================
// Grounding Animations
// =============================================================================

export const groundingAnimations: TherapeuticAnimation[] = [
  {
    name: 'settle',
    intent: 'grounding',
    description: 'Gentle downward settling motion',
    keyframes: [
      { transform: 'translateY(-4px)', opacity: 0.8 },
      { transform: 'translateY(0px)', opacity: 1 },
      { transform: 'translateY(2px)', opacity: 1 },
      { transform: 'translateY(0px)', opacity: 1 },
    ],
    options: {
      duration: 2000,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
  {
    name: 'root',
    intent: 'grounding',
    description: 'Rooting expansion downward',
    keyframes: [
      { transform: 'scaleY(0.95) translateY(-2px)' },
      { transform: 'scaleY(1.02) translateY(2px)' },
      { transform: 'scaleY(1) translateY(0)' },
    ],
    options: {
      duration: 3000,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
  {
    name: 'anchor',
    intent: 'grounding',
    description: 'Weight increase sensation',
    keyframes: [
      { transform: 'scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
      { transform: 'scale(0.98)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
      { transform: 'scale(1)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
    ],
    options: {
      duration: 2500,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
];

// =============================================================================
// Calming Animations
// =============================================================================

export const calmingAnimations: TherapeuticAnimation[] = [
  {
    name: 'breathe',
    intent: 'calming',
    description: 'Breath-synced expansion and contraction',
    breathSync: true,
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05)' },
      { transform: 'scale(1.05)' },
      { transform: 'scale(1)' },
      { transform: 'scale(1)' },
    ],
    options: {
      duration: 8000, // Full breath cycle
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: Infinity,
    },
  },
  {
    name: 'wave',
    intent: 'calming',
    description: 'Gentle wave motion',
    keyframes: [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(-2px) rotate(1deg)' },
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(2px) rotate(-1deg)' },
      { transform: 'translateY(0) rotate(0deg)' },
    ],
    options: {
      duration: 6000,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: Infinity,
    },
  },
  {
    name: 'soften',
    intent: 'calming',
    description: 'Softening release',
    keyframes: [
      { opacity: 1, filter: 'blur(0px)' },
      { opacity: 0.95, filter: 'blur(0.5px)' },
      { opacity: 1, filter: 'blur(0px)' },
    ],
    options: {
      duration: 4000,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      iterations: Infinity,
    },
  },
  {
    name: 'soothe',
    intent: 'calming',
    description: 'Color warmth shift',
    keyframes: [
      { filter: 'hue-rotate(0deg) saturate(1)' },
      { filter: 'hue-rotate(5deg) saturate(0.95)' },
      { filter: 'hue-rotate(0deg) saturate(1)' },
    ],
    options: {
      duration: 5000,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: Infinity,
    },
  },
];

// =============================================================================
// Energizing Animations
// =============================================================================

export const energizingAnimations: TherapeuticAnimation[] = [
  {
    name: 'rise',
    intent: 'energizing',
    description: 'Upward lifting motion',
    keyframes: [
      { transform: 'translateY(4px) scale(0.98)', opacity: 0.9 },
      { transform: 'translateY(-2px) scale(1.02)', opacity: 1 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ],
    options: {
      duration: 800,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
  {
    name: 'spark',
    intent: 'energizing',
    description: 'Quick brightness flash',
    keyframes: [
      { filter: 'brightness(1)' },
      { filter: 'brightness(1.2)' },
      { filter: 'brightness(1.1)' },
      { filter: 'brightness(1)' },
    ],
    options: {
      duration: 400,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      iterations: 1,
    },
  },
  {
    name: 'expand',
    intent: 'energizing',
    description: 'Outward expansion',
    keyframes: [
      { transform: 'scale(0.95)' },
      { transform: 'scale(1.08)' },
      { transform: 'scale(1)' },
    ],
    options: {
      duration: 600,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
  {
    name: 'pulse',
    intent: 'energizing',
    description: 'Rhythmic energy pulse',
    keyframes: [
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(74, 103, 65, 0.4)' },
      { transform: 'scale(1.02)', boxShadow: '0 0 0 10px rgba(74, 103, 65, 0)' },
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(74, 103, 65, 0)' },
    ],
    options: {
      duration: 1000,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      iterations: 3,
    },
  },
];

// =============================================================================
// Centering Animations
// =============================================================================

export const centeringAnimations: TherapeuticAnimation[] = [
  {
    name: 'gather',
    intent: 'centering',
    description: 'Inward gathering motion',
    keyframes: [
      { transform: 'scale(1.05)' },
      { transform: 'scale(0.98)' },
      { transform: 'scale(1)' },
    ],
    options: {
      duration: 1500,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
  {
    name: 'orbit',
    intent: 'centering',
    description: 'Subtle circular motion',
    keyframes: [
      { transform: 'translate(0, 0)' },
      { transform: 'translate(2px, -2px)' },
      { transform: 'translate(0, -3px)' },
      { transform: 'translate(-2px, -2px)' },
      { transform: 'translate(-3px, 0)' },
      { transform: 'translate(-2px, 2px)' },
      { transform: 'translate(0, 3px)' },
      { transform: 'translate(2px, 2px)' },
      { transform: 'translate(0, 0)' },
    ],
    options: {
      duration: 8000,
      easing: 'linear',
      iterations: Infinity,
    },
  },
  {
    name: 'balance',
    intent: 'centering',
    description: 'Balancing weight shift',
    keyframes: [
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(2px)' },
      { transform: 'translateX(-1px)' },
      { transform: 'translateX(1px)' },
      { transform: 'translateX(0)' },
    ],
    options: {
      duration: 2000,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
];

// =============================================================================
// Releasing Animations
// =============================================================================

export const releasingAnimations: TherapeuticAnimation[] = [
  {
    name: 'letGo',
    intent: 'releasing',
    description: 'Releasing tension outward',
    keyframes: [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.1)', opacity: 0.8 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    options: {
      duration: 2000,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      iterations: 1,
    },
  },
  {
    name: 'dissolve',
    intent: 'releasing',
    description: 'Gentle dissolution',
    keyframes: [
      { opacity: 1, filter: 'blur(0)' },
      { opacity: 0.7, filter: 'blur(2px)' },
      { opacity: 1, filter: 'blur(0)' },
    ],
    options: {
      duration: 3000,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: 1,
    },
  },
  {
    name: 'exhale',
    intent: 'releasing',
    description: 'Exhale release motion',
    keyframes: [
      { transform: 'scale(1.02)' },
      { transform: 'scale(0.98)' },
      { transform: 'scale(1)' },
    ],
    options: {
      duration: 4000,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
      iterations: 1,
      fill: 'forwards',
    },
  },
];

// =============================================================================
// All Animations
// =============================================================================

export const allTherapeuticAnimations: TherapeuticAnimation[] = [
  ...groundingAnimations,
  ...calmingAnimations,
  ...energizingAnimations,
  ...centeringAnimations,
  ...releasingAnimations,
];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get animation by name
 */
export function getTherapeuticAnimation(name: string): TherapeuticAnimation | undefined {
  return allTherapeuticAnimations.find(a => a.name === name);
}

/**
 * Get animations by intent
 */
export function getAnimationsByIntent(intent: TherapeuticIntent): TherapeuticAnimation[] {
  return allTherapeuticAnimations.filter(a => a.intent === intent);
}

/**
 * Play therapeutic animation on element
 */
export function playTherapeuticAnimation(
  element: HTMLElement,
  name: string,
  onComplete?: () => void
): Animation | null {
  const animation = getTherapeuticAnimation(name);
  if (!animation) return null;

  const anim = element.animate(animation.keyframes, animation.options);
  
  if (onComplete && animation.options.iterations !== Infinity) {
    anim.onfinish = onComplete;
  }

  return anim;
}

/**
 * Create breath-synced animation
 */
export function createBreathAnimation(
  element: HTMLElement,
  pattern: keyof typeof BREATH_PATTERNS = 'natural'
): () => void {
  const cycle = BREATH_PATTERNS[pattern];
  if (!cycle) return () => {};
  const totalDuration = cycle.inhale + cycle.hold + cycle.exhale + cycle.pause;

  const keyframes: Keyframe[] = [
    { transform: 'scale(1)', offset: 0 },
    { transform: 'scale(1.05)', offset: cycle.inhale / totalDuration },
    { transform: 'scale(1.05)', offset: (cycle.inhale + cycle.hold) / totalDuration },
    { transform: 'scale(1)', offset: (cycle.inhale + cycle.hold + cycle.exhale) / totalDuration },
    { transform: 'scale(1)', offset: 1 },
  ];

  const animation = element.animate(keyframes, {
    duration: totalDuration,
    easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
    iterations: Infinity,
  });

  // Return cleanup function
  return () => animation.cancel();
}

/**
 * Get recommended animation for emotional state
 */
export function getAnimationForEmotion(emotion: string): TherapeuticAnimation | undefined {
  const recommendations: Record<string, string> = {
    anxious: 'breathe',
    stressed: 'soften',
    tired: 'rise',
    sad: 'soothe',
    overwhelmed: 'ground',
    scattered: 'gather',
    tense: 'letGo',
    calm: 'wave',
    joyful: 'pulse',
    energized: 'expand',
    peaceful: 'breathe',
    focused: 'balance',
  };

  const animName = recommendations[emotion];
  return animName ? getTherapeuticAnimation(animName) : undefined;
}
