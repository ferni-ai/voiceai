/**
 * VoiceAI Design System Types
 *
 * Auto-generated from design tokens.
 * DO NOT EDIT DIRECTLY.
 */

export type ThemeName = 'midnight' | 'zen';
export type PersonaId = '_description' | 'ferni' | 'jack-bogle' | 'peter-lynch' | 'alex-chen' | 'maya-santos' | 'jordan-taylor';

export interface ThemeMeta {
  name: string;
  description: string;
  mode: 'light' | 'dark';
}

export const THEMES: Record<ThemeName, ThemeMeta> = {
  "midnight": {
    "name": "Cedar Night",
    "description": "Warm cedar wood tones - Japanese zen garden under moonlight, open and welcoming",
    "mode": "dark"
  },
  "zen": {
    "name": "Zen Garden",
    "description": "Warm paper, natural ink, Japanese garden serenity - human and organic",
    "mode": "light"
  }
};

export const PERSONA_IDS: PersonaId[] = ["_description","ferni","jack-bogle","peter-lynch","alex-chen","maya-santos","jordan-taylor"];

// ============================================================================
// PIXAR ANIMATION CONSTANTS
// ============================================================================

/**
 * Golden Ratio (φ) for mathematically harmonious animations.
 * Used for timing, spacing, and proportions.
 */
export const PHI = 1.618033988749895;
export const PHI_INVERSE = 0.618033988749895;

/**
 * Fibonacci-based timing for natural rhythm.
 * Each duration is approximately φ × the previous.
 */
export const FIBONACCI_TIMING = {
  "f8": "233ms",
  "f9": "377ms",
  "f10": "610ms",
  "f11": "987ms",
  "f12": "1597ms",
  "f13": "2584ms"
};

/**
 * Avatar breathing animation durations by state.
 */
export const AVATAR_BREATH_TIMING = {
  "idle": "5000ms",
  "connected": "4500ms",
  "speaking": "3000ms",
  "listening": "4000ms"
};

/**
 * Pixar reaction animation phases.
 * Every action has: Anticipation → Action → Follow-through
 */
export const REACTION_PHASES = {
  "anticipation": "80ms",
  "action": "400ms",
  "followThrough": "150ms"
};

/**
 * Avatar squash & stretch parameters.
 * Pixar principle: scaleX and scaleY change inversely.
 */
export interface AvatarSquashStretchParams {
  scaleY: number;
  scaleX: number;
  translateY: number;
  rotate: number;
}

export const AVATAR_SQUASH_STRETCH: Record<'idle' | 'connected' | 'speaking' | 'listening', AvatarSquashStretchParams> = {
  "idle": {
    "scaleY": 1.012,
    "scaleX": 0.994,
    "translateY": -1.5,
    "rotate": 0.3
  },
  "connected": {
    "scaleY": 1.018,
    "scaleX": 0.991,
    "translateY": -2,
    "rotate": 0.5
  },
  "speaking": {
    "scaleY": 1.025,
    "scaleX": 0.988,
    "translateY": -3,
    "rotate": 0.8
  },
  "listening": {
    "scaleY": 1.015,
    "scaleX": 0.993,
    "translateY": -1.8,
    "rotate": -0.4
  }
};

/**
 * Get squash & stretch params for current avatar state.
 */
export function getAvatarParams(state: 'idle' | 'connected' | 'speaking' | 'listening'): AvatarSquashStretchParams {
  return AVATAR_SQUASH_STRETCH[state] || AVATAR_SQUASH_STRETCH.idle;
}

// ============================================================================
// PERSONA ANIMATION PROFILES
// ============================================================================

/**
 * Animation profile for a persona - defines their unique movement style.
 * Based on Pixar principle: timing conveys personality.
 */
export interface PersonaAnimationProfile {
  description: string;
  timingMultiplier: number;
  bounciness: number;
  easingPreference: string;
  thinkingStyle: string;
  celebrationIntensity: string;
}

export type PersonaAnimationId = 'ferni' | 'jack-bogle' | 'peter-lynch' | 'alex-chen' | 'maya-santos' | 'jordan-taylor';

/**
 * Persona ID mapping - maps legacy frontend IDs to canonical design system IDs.
 * This allows both 'jack-b' and 'ferni' to work correctly.
 */
export const PERSONA_ID_MAPPING: Record<string, PersonaAnimationId> = {
  "jack-b": "ferni",
  "comm-specialist": "alex-chen",
  "spend-save": "maya-santos",
  "event-planner": "jordan-taylor",
  "jack-bogle": "jack-bogle",
  "peter-lynch": "peter-lynch",
  "ferni": "ferni",
  "alex-chen": "alex-chen",
  "maya-santos": "maya-santos",
  "jordan-taylor": "jordan-taylor"
};

/**
 * Normalize a persona ID to canonical form.
 * Handles both legacy IDs (jack-b, comm-specialist) and canonical IDs (ferni, alex-chen).
 */
export function normalizePersonaId(personaId: string): PersonaAnimationId {
  return (PERSONA_ID_MAPPING[personaId] || personaId) as PersonaAnimationId;
}

/**
 * Persona animation profiles from design system.
 * Each persona moves differently based on their character.
 */
export const PERSONA_ANIMATION_PROFILES: Record<PersonaAnimationId, PersonaAnimationProfile> = {
  "ferni": {
    "description": "Warm, playful, curious - like WALL-E discovering something new",
    "timingMultiplier": 1,
    "bounciness": 0.7,
    "easingPreference": "playful",
    "thinkingStyle": "curious-tilt",
    "celebrationIntensity": "warm"
  },
  "jack-bogle": {
    "description": "Wise, measured, deliberate - like Carl from Up reflecting",
    "timingMultiplier": 1.4,
    "bounciness": 0.3,
    "easingPreference": "gentle",
    "thinkingStyle": "contemplative-pause",
    "celebrationIntensity": "subtle"
  },
  "peter-lynch": {
    "description": "Energetic, practical, quick - like Linguini's nervous energy",
    "timingMultiplier": 0.8,
    "bounciness": 0.6,
    "easingPreference": "easeOutBack",
    "thinkingStyle": "rapid-process",
    "celebrationIntensity": "enthusiastic"
  },
  "alex-chen": {
    "description": "Thoughtful, articulate, empathetic - like Joy explaining emotions",
    "timingMultiplier": 1.1,
    "bounciness": 0.5,
    "easingPreference": "smooth",
    "thinkingStyle": "careful-consideration",
    "celebrationIntensity": "warm"
  },
  "maya-santos": {
    "description": "Organized, practical, steady - like EVE when focused",
    "timingMultiplier": 0.95,
    "bounciness": 0.4,
    "easingPreference": "easeInOut",
    "thinkingStyle": "methodical",
    "celebrationIntensity": "satisfied"
  },
  "jordan-taylor": {
    "description": "Creative, enthusiastic, expressive - like Dory's joyful energy",
    "timingMultiplier": 0.85,
    "bounciness": 0.8,
    "easingPreference": "elastic",
    "thinkingStyle": "brainstorm-burst",
    "celebrationIntensity": "exuberant"
  }
};

/**
 * Get animation profile for a persona.
 * Automatically normalizes legacy IDs (jack-b → ferni, comm-specialist → alex-chen, etc.)
 */
export function getPersonaAnimationProfile(personaId: string): PersonaAnimationProfile | undefined {
  const normalizedId = normalizePersonaId(personaId);
  return PERSONA_ANIMATION_PROFILES[normalizedId];
}

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

/**
 * Named easing functions from design system.
 */
export const EASINGS = {
  "linear": "linear",
  "easeIn": "cubic-bezier(0.4, 0, 1, 1)",
  "easeOut": "cubic-bezier(0, 0, 0.2, 1)",
  "easeInOut": "cubic-bezier(0.4, 0, 0.2, 1)",
  "easeOutExpo": "cubic-bezier(0.16, 1, 0.3, 1)",
  "easeOutBack": "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "easeInOutQuint": "cubic-bezier(0.83, 0, 0.17, 1)",
  "spring": "cubic-bezier(0.5, 1.5, 0.5, 1)",
  "springBouncy": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
  "smooth": "cubic-bezier(0.45, 0, 0.55, 1)",
  "organic": "cubic-bezier(0.4, 0.2, 0.2, 1.1)",
  "elastic": "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
  "anticipate": "cubic-bezier(0.38, -0.4, 0.88, 0.65)",
  "decelerate": "cubic-bezier(0.0, 0.0, 0.2, 1)",
  "gentle": "cubic-bezier(0.25, 0.1, 0.25, 1)",
  "playful": "cubic-bezier(0.175, 0.885, 0.32, 1.275)"
};

export type EasingName = keyof typeof EASINGS;

/**
 * Get easing function by preference name.
 */
export function getEasing(preference: string): string {
  return (EASINGS as Record<string, string>)[preference] || EASINGS.easeInOut;
}

// ============================================================================
// WAVEFORM PROFILES
// ============================================================================

/**
 * Waveform animation settings - how the audio visualizer moves per persona.
 */
export interface WaveformProfile {
  energy: number;    // 0-1, how reactive to audio
  smoothing: number; // 0-1, how smooth the motion
  speed: number;     // multiplier for animation speed
}

/**
 * Waveform profiles per persona.
 */
export const WAVEFORM_PROFILES: Record<string, WaveformProfile> = {
  "ferni": {
    "energy": 0.75,
    "smoothing": 0.7,
    "speed": 1
  },
  "jack-bogle": {
    "energy": 0.6,
    "smoothing": 0.8,
    "speed": 0.85
  },
  "peter-lynch": {
    "energy": 0.9,
    "smoothing": 0.55,
    "speed": 1.2
  },
  "alex-chen": {
    "energy": 0.7,
    "smoothing": 0.75,
    "speed": 1
  },
  "maya-santos": {
    "energy": 0.65,
    "smoothing": 0.8,
    "speed": 0.95
  },
  "jordan-taylor": {
    "energy": 0.95,
    "smoothing": 0.5,
    "speed": 1.15
  },
  "default": {
    "energy": 0.75,
    "smoothing": 0.7,
    "speed": 1
  }
};

/**
 * Get waveform profile for a persona.
 * Automatically normalizes legacy IDs.
 */
export function getWaveformProfile(personaId: string): WaveformProfile {
  const normalizedId = normalizePersonaId(personaId);
  const profile = WAVEFORM_PROFILES[normalizedId] || WAVEFORM_PROFILES['default'] || WAVEFORM_PROFILES['ferni'];
  // Guaranteed to exist since we have fallbacks
  return profile as WaveformProfile;
}

// ============================================================================
// PARTICLE PROFILES
// ============================================================================

/**
 * Particle animation behavior - for ambient effects around the avatar.
 */
export interface ParticleProfile {
  speed: { min: number; max: number };
  direction: string;
  size: { min: number; max: number };
  count: number;
  shape: string;
  glow: boolean;
  twinkle: boolean;
  wobble: boolean;
  description: string;
}

/**
 * Particle profiles per persona.
 */
export const PARTICLE_PROFILES: Record<string, ParticleProfile> = {
  "ferni": {
    "speed": {
      "min": 0.3,
      "max": 1
    },
    "direction": "top",
    "size": {
      "min": 3,
      "max": 8
    },
    "count": 30,
    "shape": "circle",
    "glow": true,
    "twinkle": true,
    "wobble": true,
    "description": "Warm welcoming energy"
  },
  "jack-bogle": {
    "speed": {
      "min": 0.2,
      "max": 0.6
    },
    "direction": "top",
    "size": {
      "min": 2,
      "max": 5
    },
    "count": 25,
    "shape": "circle",
    "glow": true,
    "twinkle": false,
    "wobble": false,
    "description": "Steady upward growth"
  },
  "peter-lynch": {
    "speed": {
      "min": 1,
      "max": 3
    },
    "direction": "none",
    "size": {
      "min": 2,
      "max": 6
    },
    "count": 45,
    "shape": "star",
    "glow": true,
    "twinkle": true,
    "wobble": true,
    "description": "Dynamic research energy"
  },
  "alex-chen": {
    "speed": {
      "min": 0.5,
      "max": 1.5
    },
    "direction": "top-right",
    "size": {
      "min": 2,
      "max": 4
    },
    "count": 35,
    "shape": "circle",
    "glow": true,
    "twinkle": true,
    "wobble": false,
    "description": "Flowing organization"
  },
  "maya-santos": {
    "speed": {
      "min": 0.3,
      "max": 0.8
    },
    "direction": "top",
    "size": {
      "min": 3,
      "max": 6
    },
    "count": 28,
    "shape": "circle",
    "glow": true,
    "twinkle": true,
    "wobble": true,
    "description": "Journey planning"
  },
  "jordan-taylor": {
    "speed": {
      "min": 1,
      "max": 2.5
    },
    "direction": "none",
    "size": {
      "min": 2,
      "max": 5
    },
    "count": 50,
    "shape": "star",
    "glow": true,
    "twinkle": true,
    "wobble": true,
    "description": "Celebration sparkles"
  },
  "default": {
    "speed": {
      "min": 0.5,
      "max": 1.5
    },
    "direction": "top",
    "size": {
      "min": 2,
      "max": 5
    },
    "count": 30,
    "shape": "circle",
    "glow": true,
    "twinkle": true,
    "wobble": false,
    "description": "Neutral flow"
  }
};

/**
 * Get particle profile for a persona.
 * Automatically normalizes legacy IDs.
 */
export function getParticleProfile(personaId: string): ParticleProfile {
  const normalizedId = normalizePersonaId(personaId);
  const profile = PARTICLE_PROFILES[normalizedId] || PARTICLE_PROFILES['default'] || PARTICLE_PROFILES['ferni'];
  // Guaranteed to exist since we have fallbacks
  return profile as ParticleProfile;
}

// ============================================================================
// ANTICIPATION - Pixar's "Wind-up Before the Pitch"
// ============================================================================

/**
 * Anticipation effect configuration.
 * Creates the "wind-up" before an action for more natural, alive-feeling interactions.
 */
export interface AnticipationEffect {
  transform: string;
  transition: string;
  boxShadow?: string;
}

/**
 * Anticipation effects for hover interactions.
 * Usage: Apply 'default' on mouseenter, 'release'/'lift'/'spring' on mouseleave
 */
export const ANTICIPATION_HOVER = {
  "_description": "Subtle wind-up on hover, signals the element is 'alive' and ready to respond",
  "button": {
    "default": {
      "transform": "scale(0.98) translateY(1px)",
      "transition": "transform 80ms cubic-bezier(0.38, -0.4, 0.88, 0.65)"
    },
    "release": {
      "transform": "scale(1.02) translateY(-1px)",
      "transition": "transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1)"
    },
    "settle": {
      "transform": "scale(1) translateY(0)",
      "transition": "transform 200ms cubic-bezier(0.25, 0.1, 0.25, 1)"
    }
  },
  "card": {
    "default": {
      "transform": "scale(0.995) translateY(2px)",
      "transition": "transform 100ms ease-out"
    },
    "lift": {
      "transform": "scale(1.01) translateY(-4px)",
      "boxShadow": "0 8px 24px rgba(0,0,0,0.15)",
      "transition": "all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)"
    }
  },
  "icon": {
    "default": {
      "transform": "rotate(-8deg) scale(0.95)",
      "transition": "transform 60ms ease-in"
    },
    "spring": {
      "transform": "rotate(3deg) scale(1.1)",
      "transition": "transform 150ms cubic-bezier(0.68, -0.55, 0.265, 1.55)"
    }
  }
};

/**
 * Anticipation effects for press/click interactions.
 * Apply on mousedown for satisfying tactile feedback.
 */
export const ANTICIPATION_PRESS = {
  "_description": "Squash on press - the moment of impact",
  "button": {
    "transform": "scale(0.95) translateY(2px)",
    "transition": "transform 50ms ease-in"
  },
  "card": {
    "transform": "scale(0.98) translateY(1px)",
    "transition": "transform 80ms ease-in"
  }
};

/**
 * Focus ring anticipation effects.
 */
export const ANTICIPATION_FOCUS = {
  "_description": "Focus ring with anticipation - gentle pulse signals attention received",
  "ring": {
    "initial": "0 0 0 0px var(--color-focus-ring)",
    "anticipate": "0 0 0 2px var(--color-focus-ring)",
    "settle": "0 0 0 3px var(--color-focus-ring)",
    "timing": "150ms cubic-bezier(0.34, 1.56, 0.64, 1)"
  }
};

/**
 * Page/state transition anticipation.
 */
export const ANTICIPATION_TRANSITION = {
  "_description": "Page/state transitions with anticipation build-up",
  "enter": {
    "from": {
      "opacity": "0",
      "transform": "scale(0.96) translateY(8px)"
    },
    "anticipate": {
      "opacity": "0.3",
      "transform": "scale(0.98) translateY(4px)",
      "timing": "80ms ease-in"
    },
    "to": {
      "opacity": "1",
      "transform": "scale(1) translateY(0)",
      "timing": "200ms cubic-bezier(0.34, 1.56, 0.64, 1)"
    }
  },
  "exit": {
    "from": {
      "opacity": "1",
      "transform": "scale(1)"
    },
    "anticipate": {
      "opacity": "0.8",
      "transform": "scale(1.02)",
      "timing": "60ms ease-in"
    },
    "to": {
      "opacity": "0",
      "transform": "scale(0.95)",
      "timing": "150ms ease-out"
    }
  }
};

// ============================================================================
// ORGANIC TEXTURES - Wabi-sabi (侘寂) Imperfection
// ============================================================================

/**
 * Organic texture configuration for natural, non-digital feel.
 */
export const ORGANIC_TEXTURES = {
  noise: {
  "_description": "Subtle grain texture for surfaces - breaks digital perfection",
  "subtle": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
  "opacity": {
    "midnight": "0.03",
    "zen": "0.02"
  },
  "blendMode": "overlay"
},
  paperTexture: {
  "_description": "Handmade paper feel - subtle fiber-like texture",
  "css": "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.01) 1px, rgba(0,0,0,0.01) 2px)"
},
  breathingGradient: {
  "_description": "Organic gradient that shifts slowly - like light through clouds",
  "keyframes": {
    "0%": {
      "backgroundPosition": "0% 50%",
      "opacity": "1"
    },
    "25%": {
      "backgroundPosition": "50% 0%",
      "opacity": "0.98"
    },
    "50%": {
      "backgroundPosition": "100% 50%",
      "opacity": "0.96"
    },
    "75%": {
      "backgroundPosition": "50% 100%",
      "opacity": "0.98"
    },
    "100%": {
      "backgroundPosition": "0% 50%",
      "opacity": "1"
    }
  },
  "duration": "20s",
  "timing": "ease-in-out"
},
  imperfectBorder: {
  "_description": "Slightly irregular border radius - breaks artificial perfection",
  "sm": "8px 7px 9px 8px / 7px 8px 8px 9px",
  "md": "16px 14px 18px 15px / 14px 16px 15px 17px",
  "lg": "24px 22px 26px 23px / 22px 25px 23px 24px"
},
  inkBleed: {
  "_description": "Soft edge effect like ink on paper",
  "filter": "blur(0.3px)",
  "textShadow": "0 0 0.5px currentColor"
},
};

/**
 * Get imperfect border radius for wabi-sabi aesthetic.
 * Breaks artificial digital perfection.
 */
export function getImperfectBorder(size: 'sm' | 'md' | 'lg'): string {
  return ORGANIC_TEXTURES.imperfectBorder[size] || ORGANIC_TEXTURES.imperfectBorder.md;
}

// ============================================================================
// VOICE EMOTION GLOW - Avatar responds to speaking tone
// ============================================================================

/**
 * Voice emotion types that affect avatar glow.
 */
export type VoiceEmotion = 
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'calm'
  | 'thoughtful'
  | 'empathetic'
  | 'serious'
  | 'anxious'
  | 'encouraging';

/**
 * Speaking intensity levels.
 */
export type SpeakingIntensity = 'whisper' | 'normal' | 'emphasis' | 'exclamation';

/**
 * Voice emotion glow configuration.
 */
export interface VoiceGlowConfig {
  color: string;
  colorAlt: string;
  intensity: number;
  pulseSpeed: string;
  spread: string;
}

/**
 * Speaking intensity multipliers.
 */
export interface SpeakingIntensityConfig {
  multiplier: number;
  spread: number;
}

/**
 * Voice emotion glow configurations.
 */
export const VOICE_EMOTION_GLOW: Record<VoiceEmotion, VoiceGlowConfig> = {
  "neutral": {
    "color": "var(--persona-glow, rgba(74, 103, 65, 0.5))",
    "colorAlt": "rgba(74, 103, 65, 0.4)",
    "intensity": 0.6,
    "pulseSpeed": "3s",
    "spread": "20px"
  },
  "happy": {
    "color": "rgba(251, 191, 36, 0.6)",
    "colorAlt": "rgba(245, 158, 11, 0.5)",
    "intensity": 0.8,
    "pulseSpeed": "2s",
    "spread": "28px"
  },
  "excited": {
    "color": "rgba(236, 72, 153, 0.6)",
    "colorAlt": "rgba(219, 39, 119, 0.5)",
    "intensity": 1,
    "pulseSpeed": "1.2s",
    "spread": "35px"
  },
  "calm": {
    "color": "rgba(34, 211, 238, 0.5)",
    "colorAlt": "rgba(6, 182, 212, 0.4)",
    "intensity": 0.5,
    "pulseSpeed": "4s",
    "spread": "25px"
  },
  "thoughtful": {
    "color": "rgba(58, 107, 115, 0.5)",
    "colorAlt": "rgba(45, 83, 89, 0.4)",
    "intensity": 0.6,
    "pulseSpeed": "3.5s",
    "spread": "22px"
  },
  "empathetic": {
    "color": "rgba(244, 114, 182, 0.5)",
    "colorAlt": "rgba(236, 72, 153, 0.4)",
    "intensity": 0.7,
    "pulseSpeed": "2.5s",
    "spread": "30px"
  },
  "serious": {
    "color": "rgba(148, 163, 184, 0.5)",
    "colorAlt": "rgba(100, 116, 139, 0.4)",
    "intensity": 0.5,
    "pulseSpeed": "4s",
    "spread": "18px"
  },
  "anxious": {
    "color": "rgba(251, 146, 60, 0.5)",
    "colorAlt": "rgba(249, 115, 22, 0.4)",
    "intensity": 0.7,
    "pulseSpeed": "1.8s",
    "spread": "24px"
  },
  "encouraging": {
    "color": "rgba(16, 185, 129, 0.6)",
    "colorAlt": "rgba(5, 150, 105, 0.5)",
    "intensity": 0.8,
    "pulseSpeed": "2.2s",
    "spread": "28px"
  }
};

/**
 * Speaking intensity configurations.
 */
export const SPEAKING_INTENSITY: Record<SpeakingIntensity, SpeakingIntensityConfig> = {
  "whisper": {
    "multiplier": 0.5,
    "spread": 0.6
  },
  "normal": {
    "multiplier": 1,
    "spread": 1
  },
  "emphasis": {
    "multiplier": 1.3,
    "spread": 1.2
  },
  "exclamation": {
    "multiplier": 1.6,
    "spread": 1.5
  }
};

/**
 * Voice glow transition timings.
 */
export const VOICE_GLOW_TRANSITIONS = {
  "emotionChange": "all 800ms cubic-bezier(0.4, 0, 0.2, 1)",
  "intensityChange": "all 150ms ease-out",
  "speakingStart": "all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  "speakingEnd": "all 400ms ease-out"
};

/**
 * Get glow configuration for a voice emotion.
 */
export function getVoiceGlow(emotion: VoiceEmotion): VoiceGlowConfig {
  return VOICE_EMOTION_GLOW[emotion] || VOICE_EMOTION_GLOW.neutral;
}

/**
 * Get CSS custom properties for voice glow.
 * Apply these to the avatar container element.
 */
export function getVoiceGlowCSS(
  emotion: VoiceEmotion,
  intensity: SpeakingIntensity = 'normal'
): Record<string, string> {
  const glow = getVoiceGlow(emotion);
  const intensityConfig = SPEAKING_INTENSITY[intensity] || SPEAKING_INTENSITY.normal;
  
  return {
    '--glow-color': glow.color,
    '--glow-color-alt': glow.colorAlt,
    '--glow-intensity': String(glow.intensity * intensityConfig.multiplier),
    '--glow-spread': `${parseInt(glow.spread) * intensityConfig.spread}px`,
    '--glow-pulse-speed': glow.pulseSpeed,
  };
}

/**
 * Apply voice glow to an element.
 */
export function applyVoiceGlow(
  element: HTMLElement,
  emotion: VoiceEmotion,
  intensity: SpeakingIntensity = 'normal'
): void {
  const cssProps = getVoiceGlowCSS(emotion, intensity);
  Object.entries(cssProps).forEach(([prop, value]) => {
    element.style.setProperty(prop, value);
  });
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Set the active theme
 */
export function setTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('voiceai-theme', theme);
}

/**
 * Get the current theme
 */
export function getTheme(): ThemeName {
  return (document.documentElement.getAttribute('data-theme') as ThemeName) || 'midnight';
}

/**
 * Set the active persona (for persona-specific colors)
 */
export function setPersona(persona: PersonaId): void {
  document.body.setAttribute('data-persona', persona);
}

/**
 * Initialize theme from localStorage or system preference
 */
export function initTheme(): ThemeName {
  const stored = localStorage.getItem('voiceai-theme') as ThemeName | null;
  if (stored && THEMES[stored]) {
    setTheme(stored);
    return stored;
  }

  // Check system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme: ThemeName = prefersDark ? 'midnight' : 'zen';
  setTheme(theme);
  return theme;
}

// ============================================================================
// APPLE-LEVEL UX UTILITIES
// ============================================================================

/**
 * CSS class names for entrance animations.
 * Apply these classes to trigger entrance animations on page load.
 */
export const ENTRANCE_CLASSES = {
  avatar: 'entrance-avatar',
  controls: 'entrance-controls',
  team: 'entrance-team',
} as const;

/**
 * CSS class names for skeleton loading states.
 */
export const SKELETON_CLASSES = {
  shimmer: 'skeleton-shimmer',
} as const;

/**
 * CSS class names for error recovery animations.
 */
export const ERROR_CLASSES = {
  shake: 'error-shake',
  pulse: 'error-pulse',
  retryBounce: 'error-retry-bounce',
  glow: 'error-glow',
} as const;

/**
 * CSS class names for connection progress.
 */
export const CONNECTION_CLASSES = {
  step: 'connection-step',
  stepActive: 'active',
  stepCompleted: 'completed',
  bar: 'connection-bar',
  barFill: 'connection-bar-fill',
} as const;

/**
 * CSS class names for focus states.
 */
export const FOCUS_CLASSES = {
  anticipate: 'focus-anticipate',
  ring: 'anticipate-focus',
} as const;

/**
 * Apply entrance animation to an element.
 */
export function applyEntranceAnimation(
  element: HTMLElement,
  type: 'avatar' | 'controls' | 'team'
): void {
  const className = ENTRANCE_CLASSES[type];
  element.classList.add(className);
}

/**
 * Replay entrance animation on an element.
 */
export function replayEntranceAnimation(
  element: HTMLElement,
  type: 'avatar' | 'controls' | 'team'
): void {
  const className = ENTRANCE_CLASSES[type];
  element.classList.remove(className);
  void element.offsetHeight; // Force reflow
  element.classList.add(className);
}

/**
 * Apply skeleton shimmer loading effect.
 */
export function applySkeletonShimmer(element: HTMLElement): void {
  element.classList.add(SKELETON_CLASSES.shimmer);
}

/**
 * Remove skeleton shimmer loading effect.
 */
export function removeSkeletonShimmer(element: HTMLElement): void {
  element.classList.remove(SKELETON_CLASSES.shimmer);
}

/**
 * Trigger error shake animation (400ms).
 */
export function triggerErrorShake(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    element.classList.remove(ERROR_CLASSES.shake);
    void element.offsetHeight;
    element.classList.add(ERROR_CLASSES.shake);
    setTimeout(() => {
      element.classList.remove(ERROR_CLASSES.shake);
      resolve();
    }, 400);
  });
}

/**
 * Trigger error pulse animation (3s).
 */
export function triggerErrorPulse(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    element.classList.remove(ERROR_CLASSES.pulse);
    void element.offsetHeight;
    element.classList.add(ERROR_CLASSES.pulse);
    setTimeout(() => {
      element.classList.remove(ERROR_CLASSES.pulse);
      resolve();
    }, 3000);
  });
}

/**
 * Trigger retry bounce animation (300ms).
 */
export function triggerRetryBounce(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    element.classList.remove(ERROR_CLASSES.retryBounce);
    void element.offsetHeight;
    element.classList.add(ERROR_CLASSES.retryBounce);
    setTimeout(() => {
      element.classList.remove(ERROR_CLASSES.retryBounce);
      resolve();
    }, 300);
  });
}

/**
 * Connection progress step states.
 */
export type ConnectionStep = 'pending' | 'active' | 'completed';

/**
 * Update connection step state.
 */
export function setConnectionStepState(
  element: HTMLElement,
  state: ConnectionStep
): void {
  element.classList.remove('active', 'completed');
  if (state === 'active') {
    element.classList.add('active');
  } else if (state === 'completed') {
    element.classList.add('completed');
  }
}

/**
 * Update connection progress bar (0-100).
 */
export function setConnectionProgress(
  element: HTMLElement,
  progress: number
): void {
  element.style.width = Math.min(100, Math.max(0, progress)) + '%';
}

// ============================================================================
// LANDING PAGE - Zen 3D Experience
// ============================================================================

/**
 * CSS class names for landing page.
 * NOTE: Requires GSAP for shoji door animations.
 * CDN: https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
 */
export const LANDING_CLASSES = {
  scene: 'landing-scene',
  sceneHidden: 'hidden',
  sceneRevealed: 'revealed',
  shojiLeft: 'landing-shoji-left',
  shojiRight: 'landing-shoji-right',
  contentCard: 'landing-content-card',
  contentVisible: 'visible',
  tapHint: 'landing-tap-hint',
  form: 'landing-form',
  input: 'landing-input',
  submit: 'landing-submit',
  skip: 'landing-skip',
  success: 'landing-success',
  successVisible: 'visible',
} as const;

/**
 * Animate the landing page reveal.
 * Requires GSAP to be loaded.
 * @param shojiLeft - Left shoji door element
 * @param shojiRight - Right shoji door element
 * @param contentCard - Content card element
 */
export function animateLandingReveal(
  shojiLeft: HTMLElement,
  shojiRight: HTMLElement,
  contentCard: HTMLElement
): void {
  // @ts-ignore GSAP is loaded via CDN
  const gsap = window.gsap;
  if (!gsap) {
    console.warn('GSAP not loaded - landing animation disabled');
    contentCard.classList.add('visible');
    return;
  }
  
  gsap.to(shojiLeft, { x: '-100%', duration: 1.2, ease: 'power2.inOut' });
  gsap.to(shojiRight, { x: '100%', duration: 1.2, ease: 'power2.inOut' });
  gsap.to(contentCard, { opacity: 1, y: 0, duration: 0.8, delay: 0.4, ease: 'power2.out' });
}

// ============================================================================
// TOAST SYSTEM - World-class Notifications
// ============================================================================

/**
 * Toast types for semantic styling.
 */
export type ToastType = 'info' | 'success' | 'error' | 'warning' | 'loading';

/**
 * CSS class names for toast system.
 */
export const TOAST_CLASSES = {
  container: 'toast-container',
  toast: 'toast',
  exiting: 'toast-exiting',
  swiping: 'toast-swiping',
  swipeOut: 'toast-swipe-out',
  icon: 'toast-icon',
  content: 'toast-content',
  title: 'toast-title',
  description: 'toast-description',
  close: 'toast-close',
  progress: 'toast-progress',
  progressBar: 'toast-progress-bar',
  action: 'toast-action',
  // Type variants
  info: 'toast-info',
  success: 'toast-success',
  error: 'toast-error',
  warning: 'toast-warning',
  loading: 'toast-loading',
} as const;

/**
 * Get toast type class name.
 */
export function getToastTypeClass(type: ToastType): string {
  return TOAST_CLASSES[type];
}

/**
 * Check if user prefers reduced motion (WCAG accessibility).
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Apply animation only if user allows motion.
 */
export function safeAnimate(
  element: HTMLElement,
  animationClass: string,
  fallbackOpacity: boolean = true
): void {
  if (prefersReducedMotion()) {
    if (fallbackOpacity) {
      element.style.opacity = '1';
    }
    return;
  }
  element.classList.add(animationClass);
}
