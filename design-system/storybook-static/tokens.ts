/**
 * VoiceAI Design System Types
 *
 * Auto-generated from design tokens.
 * DO NOT EDIT DIRECTLY.
 */

export type ThemeName = 'midnight' | 'zen';
export type PersonaId = '_description' | '_textOnDarkNote' | 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan' | '_marketplace_description' | 'eli' | 'marcus' | 'kenji' | 'carmen' | 'amara' | 'sasha' | 'ray';

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

export const PERSONA_IDS: PersonaId[] = ["_description","_textOnDarkNote","ferni","jack","peter","alex","maya","jordan","nayan","_marketplace_description","eli","marcus","kenji","carmen","amara","sasha","ray"];

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

export type PersonaAnimationId = 'ferni' | 'peter-john' | 'alex-chen' | 'maya-santos' | 'jordan-taylor';

/**
 * Persona ID mapping - maps legacy frontend IDs to canonical design system IDs.
 * This allows both 'jack-b' and 'ferni' to work correctly.
 */
export const PERSONA_ID_MAPPING: Record<string, PersonaAnimationId> = {
  "jack-b": "ferni",
  "comm-specialist": "alex-chen",
  "spend-save": "maya-santos",
  "event-planner": "jordan-taylor",
  "peter-john": "peter-john",
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
  "peter-john": {
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
  "peter-john": {
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
  "peter-john": {
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

// ============================================================================
// INSIGHTS - Fidelity-Style Financial Visualizations
// ============================================================================

/**
 * Insight card size configurations.
 */
export const INSIGHT_CARDS = {
  "_description": "Insight cards that reveal patterns in user's life data",
  "small": {
    "width": "160px",
    "height": "120px",
    "padding": "16px",
    "borderRadius": "16px",
    "useCase": "Quick metrics, single stat"
  },
  "medium": {
    "width": "340px",
    "height": "200px",
    "padding": "20px",
    "borderRadius": "20px",
    "useCase": "Charts, comparisons, trends"
  },
  "large": {
    "width": "100%",
    "height": "320px",
    "padding": "24px",
    "borderRadius": "24px",
    "useCase": "Full dashboards, deep dives"
  },
  "hero": {
    "width": "100%",
    "height": "400px",
    "padding": "32px",
    "borderRadius": "28px",
    "useCase": "Life narrative overview, major milestones"
  }
};

/**
 * Data visualization colors (warm, not cold financial blue).
 */
export const DATA_COLORS = {
  "_description": "Semantic colors for data visualization, warmer than typical financial apps",
  "positive": {
    "primary": "#4A7C59",
    "gradient": "linear-gradient(135deg, #4A7C59 0%, #6B9B7A 100%)",
    "glow": "rgba(74, 124, 89, 0.3)"
  },
  "negative": {
    "primary": "#9B6B6B",
    "gradient": "linear-gradient(135deg, #9B6B6B 0%, #B88888 100%)",
    "glow": "rgba(155, 107, 107, 0.3)"
  },
  "neutral": {
    "primary": "#8B7355",
    "gradient": "linear-gradient(135deg, #8B7355 0%, #A69076 100%)",
    "glow": "rgba(139, 115, 85, 0.3)"
  },
  "highlight": {
    "primary": "#C4A77D",
    "gradient": "linear-gradient(135deg, #C4A77D 0%, #D4BC9A 100%)",
    "glow": "rgba(196, 167, 125, 0.4)"
  },
  "series": {
    "1": "#4A7C59",
    "2": "#6B8E9B",
    "3": "#9B7B6B",
    "4": "#7B6B9B",
    "5": "#9B8B6B",
    "6": "#6B9B8B",
    "_description": "For multi-series charts, maintains warmth across data lines"
  }
};

/**
 * Chart style configurations.
 */
export const CHART_STYLES = {
  "_description": "Chart-specific styling that feels alive, not sterile",
  "lineChart": {
    "strokeWidth": "3px",
    "strokeLinecap": "round",
    "animation": "drawIn 1.2s ease-out",
    "hoverStrokeWidth": "4px",
    "dotRadius": "5px",
    "dotHoverRadius": "8px",
    "areaOpacity": 0.15,
    "gridOpacity": 0.08
  },
  "barChart": {
    "borderRadius": "8px",
    "hoverScale": 1.02,
    "animation": "growUp 0.8s ease-out",
    "gap": "8px",
    "minBarWidth": "24px"
  },
  "donutChart": {
    "strokeWidth": "24px",
    "hoverStrokeWidth": "28px",
    "innerRadius": "60%",
    "animation": "spinReveal 1s ease-out",
    "gap": "4px"
  },
  "sparkline": {
    "strokeWidth": "2px",
    "height": "40px",
    "animation": "fadeDrawIn 0.6s ease-out",
    "showEndDot": true
  }
};

/**
 * Metric display configurations.
 */
export const METRIC_STYLES = {
  "_description": "Single metric display with contextual comparison",
  "large": {
    "fontSize": "48px",
    "fontWeight": "600",
    "letterSpacing": "-0.02em",
    "lineHeight": "1.1"
  },
  "medium": {
    "fontSize": "32px",
    "fontWeight": "600",
    "letterSpacing": "-0.01em",
    "lineHeight": "1.2"
  },
  "small": {
    "fontSize": "24px",
    "fontWeight": "500",
    "letterSpacing": "0",
    "lineHeight": "1.3"
  },
  "label": {
    "fontSize": "12px",
    "fontWeight": "500",
    "letterSpacing": "0.04em",
    "textTransform": "uppercase",
    "opacity": 0.7
  },
  "delta": {
    "fontSize": "14px",
    "fontWeight": "500",
    "positivePrefix": "+",
    "negativePrefix": "",
    "showArrow": true
  }
};

/**
 * Progress indicator configurations.
 */
export const PROGRESS_INDICATORS = {
  "_description": "Progress rings and bars with celebratory animations",
  "ring": {
    "strokeWidth": "8px",
    "backgroundOpacity": 0.15,
    "animation": "ringFill 1s ease-out",
    "celebrationThreshold": 0.9,
    "celebrationAnimation": "pulseGlow 0.6s ease-in-out 3"
  },
  "bar": {
    "height": "8px",
    "borderRadius": "4px",
    "animation": "barFill 0.8s ease-out",
    "showMilestones": true,
    "milestoneSize": "12px"
  },
  "steps": {
    "dotSize": "12px",
    "completedDotSize": "16px",
    "lineThickness": "3px",
    "animation": "stepComplete 0.4s spring"
  }
};

/**
 * Narrative visualization configurations.
 */
export const NARRATIVE_VISUALS = {
  "_philosophy": "Unlike Fidelity's pure data focus, Ferni weaves stories through visuals",
  "timeline": {
    "_description": "Life timeline visualization",
    "nodeSize": {
      "minor": "8px",
      "standard": "12px",
      "major": "20px",
      "milestone": "32px"
    },
    "lineThickness": "2px",
    "spacing": "80px",
    "animation": "timelineReveal 1.5s stagger(0.1s)",
    "colors": {
      "past": "var(--color-stone)",
      "present": "var(--color-accent)",
      "future": "var(--color-moonlight)"
    }
  },
  "constellation": {
    "_description": "Relationship network as a constellation",
    "nodeSize": {
      "user": "40px",
      "close": "24px",
      "regular": "16px",
      "distant": "10px"
    },
    "connectionOpacity": {
      "strong": 0.6,
      "medium": 0.3,
      "weak": 0.1
    },
    "pulseAnimation": "constellationPulse 4s ease-in-out infinite",
    "orbitAnimation": "gentleOrbit 20s linear infinite"
  },
  "garden": {
    "_description": "Growth visualization as a living garden",
    "plantStages": [
      "seed",
      "sprout",
      "growing",
      "blooming",
      "flourishing"
    ],
    "growthAnimation": "plantGrow 2s spring",
    "swayAnimation": "gentleSway 3s ease-in-out infinite",
    "particleCount": 12,
    "particleType": "pollen"
  }
};

/**
 * Comparison label configurations.
 */
export const COMPARISON_LABELS = {
  "_philosophy": "Show context without inducing anxiety - warm comparisons, not cold benchmarks",
  "vsYesterday": {
    "label": "vs yesterday",
    "icon": "clock",
    "emphasis": "low"
  },
  "vsLastWeek": {
    "label": "vs last week",
    "icon": "calendar",
    "emphasis": "medium"
  },
  "vsLastMonth": {
    "label": "vs last month",
    "icon": "trend",
    "emphasis": "high"
  },
  "vsAverage": {
    "label": "your typical",
    "icon": "baseline",
    "emphasis": "medium"
  },
  "vsBestWeek": {
    "label": "your best week",
    "icon": "star",
    "emphasis": "celebratory"
  }
};

/**
 * Insight micro-interactions.
 */
export const INSIGHT_INTERACTIONS = {
  "_description": "Tiny delights in data interactions",
  "tooltipReveal": {
    "delay": "200ms",
    "duration": "200ms",
    "easing": "ease-out",
    "transform": "translateY(-4px)",
    "opacity": "0 → 1"
  },
  "dataPointHover": {
    "scale": 1.2,
    "duration": "150ms",
    "easing": "spring(1, 80, 10)",
    "glow": true
  },
  "legendToggle": {
    "duration": "300ms",
    "fadeOpacity": 0.3,
    "strikethrough": true
  },
  "zoomGesture": {
    "minScale": 0.5,
    "maxScale": 3,
    "friction": 0.92,
    "snapPoints": [
      0.5,
      1,
      1.5,
      2,
      3
    ]
  }
};

// ============================================================================
// PHYSICS - Emotional Spring System (Beyond Apple)
// ============================================================================

/**
 * Spring configurations with emotional context.
 */
export interface SpringConfig {
  tension: number;
  friction: number;
  mass: number;
  useCase: string;
  emotionalContext: string;
}

export type SpringType = 'snappy' | 'gentle' | 'bouncy' | 'heavy' | 'ethereal' | 'organic';

/**
 * Emotional spring configurations.
 */
export const SPRINGS: Record<SpringType, SpringConfig> = {
  "snappy": {
    "tension": 400,
    "friction": 30,
    "mass": 1,
    "useCase": "Quick confirmations, toggles, micro-interactions",
    "emotionalContext": "efficient, responsive"
  },
  "gentle": {
    "tension": 170,
    "friction": 26,
    "mass": 1,
    "useCase": "Modal appearances, card expansions",
    "emotionalContext": "calm, welcoming"
  },
  "bouncy": {
    "tension": 300,
    "friction": 10,
    "mass": 1,
    "useCase": "Celebrations, achievements, delightful moments",
    "emotionalContext": "joyful, playful"
  },
  "heavy": {
    "tension": 120,
    "friction": 40,
    "mass": 2,
    "useCase": "Important decisions, serious content, warnings",
    "emotionalContext": "weighty, significant"
  },
  "ethereal": {
    "tension": 80,
    "friction": 20,
    "mass": 0.5,
    "useCase": "Ambient elements, background particles, dreamy states",
    "emotionalContext": "floating, dreamlike"
  },
  "organic": {
    "tension": 200,
    "friction": 22,
    "mass": 1.2,
    "useCase": "Avatar movements, natural gestures",
    "emotionalContext": "alive, breathing"
  }
};

/**
 * Get spring config by emotional type.
 */
export function createEmotionalSpring(type: SpringType): SpringConfig {
  return SPRINGS[type] || SPRINGS.gentle;
}

/**
 * Momentum configurations for gesture-driven UI.
 */
export const MOMENTUM = {
  "_description": "Momentum preservation for gesture-driven UI",
  "scroll": {
    "deceleration": 0.998,
    "velocityThreshold": 0.5,
    "rubberBandEffect": true,
    "rubberBandStiffness": 0.55,
    "snapToPoints": true
  },
  "swipe": {
    "velocityThreshold": 500,
    "distanceThreshold": "30%",
    "completeAnimation": "spring(gentle)",
    "cancelAnimation": "spring(snappy)"
  },
  "drag": {
    "friction": 0.92,
    "velocityMultiplier": 1.2,
    "releaseSpring": "spring(gentle)",
    "boundarySpring": "spring(bouncy)"
  },
  "throw": {
    "_description": "For dismissible cards, carousel items",
    "minVelocity": 300,
    "friction": 0.95,
    "gravityY": 0,
    "bounceOnEdge": true
  }
};

/**
 * Gravity effect configurations.
 */
export const GRAVITY = {
  "_description": "Gravity effects for falling, settling elements",
  "light": {
    "acceleration": 200,
    "bounce": 0.4,
    "useCase": "Gentle settling, soft landings"
  },
  "normal": {
    "acceleration": 980,
    "bounce": 0.3,
    "useCase": "Standard physics"
  },
  "heavy": {
    "acceleration": 1500,
    "bounce": 0.1,
    "useCase": "Dramatic impacts, importance"
  },
  "floating": {
    "acceleration": 50,
    "bounce": 0.6,
    "useCase": "Dreamy, underwater feel"
  }
};

/**
 * Magnetic snap behaviors.
 */
export const MAGNETISM = {
  "_description": "Magnetic snap behaviors for precision interactions",
  "snap": {
    "distance": "20px",
    "strength": 0.8,
    "animation": "spring(snappy)"
  },
  "attract": {
    "distance": "100px",
    "strength": 0.3,
    "curve": "exponential"
  },
  "repel": {
    "distance": "50px",
    "strength": 0.5,
    "curve": "linear"
  }
};

/**
 * Collision configurations.
 */
export const COLLISION = {
  "_description": "Element collision behaviors",
  "bounce": {
    "restitution": 0.6,
    "friction": 0.1
  },
  "soft": {
    "restitution": 0.2,
    "friction": 0.5
  },
  "stick": {
    "restitution": 0,
    "friction": 1
  }
};

/**
 * Emotional momentum carryover - UI carries emotional weight from previous interactions.
 */
export const EMOTIONAL_MOMENTUM = {
  "_philosophy": "UI carries emotional weight from previous interactions",
  "carryover": {
    "_description": "How emotional state affects subsequent animations",
    "afterCelebration": {
      "springModifier": "bouncy",
      "duration": "5s",
      "particleBoost": 1.5
    },
    "afterSeriousContent": {
      "springModifier": "heavy",
      "duration": "10s",
      "colorShift": "muted"
    },
    "afterQuietMoment": {
      "springModifier": "ethereal",
      "duration": "8s",
      "motionReduction": 0.7
    },
    "afterHighEnergy": {
      "springModifier": "snappy",
      "duration": "3s",
      "transitionSpeed": 1.2
    }
  },
  "contextualWeight": {
    "_description": "Element weight based on content importance",
    "critical": {
      "mass": 2.5,
      "spring": "heavy",
      "entranceDelay": "200ms",
      "requiresAcknowledgment": true
    },
    "important": {
      "mass": 1.5,
      "spring": "gentle",
      "entranceDelay": "100ms"
    },
    "standard": {
      "mass": 1,
      "spring": "gentle",
      "entranceDelay": "0ms"
    },
    "ambient": {
      "mass": 0.5,
      "spring": "ethereal",
      "entranceDelay": "0ms"
    }
  }
};

/**
 * Fluid motion configurations.
 */
export const FLUID_MOTION = {
  "_philosophy": "Fluid dynamics for organic, living interfaces",
  "wave": {
    "_description": "Wave propagation through UI elements",
    "speed": "300px/s",
    "amplitude": "8px",
    "frequency": "0.5Hz",
    "damping": 0.95,
    "useCase": "Loading states, ambient motion"
  },
  "ripple": {
    "_description": "Touch ripple effects",
    "speed": "600px/s",
    "opacity": 0.12,
    "scale": 2.5,
    "duration": "600ms",
    "easing": "ease-out"
  },
  "morphing": {
    "_description": "Smooth shape transitions",
    "duration": "400ms",
    "easing": "cubic-bezier(0.4, 0, 0.2, 1)",
    "preserveArea": true,
    "useCase": "FAB to dialog, card to detail"
  },
  "breathing": {
    "_description": "Subtle scale oscillation for living elements",
    "scale": [
      0.98,
      1.02
    ],
    "duration": "4s",
    "easing": "ease-in-out",
    "sync": "userBreathRate"
  }
};

/**
 * Spatial depth layer configurations.
 */
export const SPATIAL_LAYERS = {
  "background": {
    "z": -100,
    "blur": "8px",
    "scale": 0.95,
    "parallaxFactor": 0.3
  },
  "surface": {
    "z": 0,
    "blur": "0",
    "scale": 1,
    "parallaxFactor": 0.5
  },
  "elevated": {
    "z": 50,
    "blur": "0",
    "scale": 1,
    "parallaxFactor": 0.7,
    "shadow": "var(--shadow-md)"
  },
  "floating": {
    "z": 100,
    "blur": "0",
    "scale": 1.02,
    "parallaxFactor": 0.9,
    "shadow": "var(--shadow-lg)"
  },
  "overlay": {
    "z": 200,
    "blur": "0",
    "scale": 1,
    "parallaxFactor": 1,
    "shadow": "var(--shadow-xl)"
  }
};

/**
 * Parallax configuration.
 */
export const PARALLAX = {
  "_description": "Depth-based motion parallax",
  "sensitivity": 0.02,
  "maxOffset": "20px",
  "smoothing": 0.1,
  "gyroscopeEnabled": true
};

/**
 * Haptic feedback patterns.
 */
export const HAPTIC_PATTERNS = {
  "success": {
    "type": "notification",
    "intensity": 0.8,
    "pattern": [
      10,
      50,
      10
    ]
  },
  "warning": {
    "type": "warning",
    "intensity": 0.6,
    "pattern": [
      20,
      30,
      20,
      30,
      20
    ]
  },
  "error": {
    "type": "error",
    "intensity": 1,
    "pattern": [
      50,
      100,
      50
    ]
  },
  "selection": {
    "type": "selection",
    "intensity": 0.3,
    "pattern": [
      5
    ]
  },
  "impact": {
    "light": {
      "type": "impactLight",
      "intensity": 0.4
    },
    "medium": {
      "type": "impactMedium",
      "intensity": 0.6
    },
    "heavy": {
      "type": "impactHeavy",
      "intensity": 0.9
    }
  },
  "heartbeat": {
    "_description": "For intimate moments, empathy",
    "type": "custom",
    "pattern": [
      30,
      80,
      30,
      200
    ],
    "repeat": 2
  },
  "breathing": {
    "_description": "Synced with breath visualization",
    "type": "custom",
    "inhale": {
      "duration": "4s",
      "intensity": "0→0.3"
    },
    "exhale": {
      "duration": "6s",
      "intensity": "0.3→0"
    }
  }
};

/**
 * Gesture recognition signatures.
 */
export const GESTURE_SIGNATURES = {
  "swipeUp": {
    "direction": [
      0,
      -1
    ],
    "minVelocity": 300,
    "minDistance": 50
  },
  "swipeDown": {
    "direction": [
      0,
      1
    ],
    "minVelocity": 300,
    "minDistance": 50
  },
  "swipeLeft": {
    "direction": [
      -1,
      0
    ],
    "minVelocity": 300,
    "minDistance": 50
  },
  "swipeRight": {
    "direction": [
      1,
      0
    ],
    "minVelocity": 300,
    "minDistance": 50
  },
  "pinchIn": {
    "type": "pinch",
    "direction": "in",
    "minScale": 0.7
  },
  "pinchOut": {
    "type": "pinch",
    "direction": "out",
    "minScale": 1.3
  },
  "longPress": {
    "duration": "500ms",
    "maxMovement": 10
  },
  "doubleTap": {
    "interval": "300ms",
    "maxDistance": 30
  },
  "twoFingerTap": {
    "fingers": 2,
    "duration": "100ms"
  },
  "forcePress": {
    "force": 0.5,
    "duration": "200ms"
  }
};

/**
 * Gesture combo patterns.
 */
export const GESTURE_COMBOS = {
  "_description": "Gesture combinations for power users",
  "quickActions": {
    "gesture": "longPress + swipeUp",
    "action": "showQuickMenu"
  },
  "secretMenu": {
    "gesture": "twoFingerTap × 3",
    "action": "showDevPanel"
  }
};

// ============================================================================
// PREDICTIVE UI - Anticipatory Interface Patterns
// ============================================================================

/**
 * Skeleton loading styles.
 */
export const SKELETON_STYLES = {
  "shimmerSpeed": "1.5s",
  "shimmerAngle": "-20deg",
  "shimmerGradient": "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
  "pulseOpacity": [
    0.04,
    0.08
  ],
  "pulseDuration": "2s",
  "borderRadius": "inherit"
};

/**
 * Ghost content placeholder shapes.
 */
export const GHOST_CONTENT = {
  "_description": "Placeholder shapes that hint at incoming content structure",
  "textLine": {
    "height": "1em",
    "width": "random(60%, 90%)",
    "marginBottom": "0.5em"
  },
  "avatar": {
    "size": "40px",
    "shape": "circle"
  },
  "card": {
    "aspectRatio": "16/9",
    "borderRadius": "16px"
  },
  "button": {
    "width": "120px",
    "height": "44px",
    "borderRadius": "22px"
  }
};

/**
 * Progressive reveal configuration.
 */
export const PROGRESSIVE_REVEAL = {
  "_description": "Content appears in priority order",
  "staggerDelay": "50ms",
  "priorityOrder": [
    "heading",
    "primaryAction",
    "body",
    "metadata",
    "secondaryActions"
  ],
  "animation": "fadeSlideIn 300ms ease-out"
};

/**
 * Anticipation configurations.
 */
export const ANTICIPATION = {
  "_description": "UI prepares for likely next actions",
  "hoverIntent": {
    "_description": "Detect hover trajectory to preload content",
    "detectionRadius": "100px",
    "velocityThreshold": "50px/s",
    "preloadDelay": "100ms",
    "visualHint": {
      "opacity": 0.02,
      "scale": 1.005,
      "transition": "150ms ease-out"
    }
  },
  "scrollAnticipation": {
    "_description": "Preload content in scroll direction",
    "lookAheadDistance": "2 viewports",
    "velocityMultiplier": 1.5,
    "preloadThreshold": "0.5 viewports"
  },
  "timeBasedPreload": {
    "_description": "Load content based on typical usage patterns",
    "morningContent": [
      "calendar",
      "weather",
      "priorities"
    ],
    "eveningContent": [
      "reflections",
      "tomorrow-prep",
      "wind-down"
    ],
    "weekendContent": [
      "weekly-review",
      "personal-goals",
      "relationships"
    ]
  },
  "contextualPreload": {
    "_description": "Load based on detected intent",
    "afterGoalDiscussion": [
      "goal-tracker",
      "milestone-history"
    ],
    "afterEmotionalConversation": [
      "mood-insights",
      "journal"
    ],
    "afterSchedulingTalk": [
      "calendar",
      "reminders"
    ]
  }
};

/**
 * Suggestion UI configurations.
 */
export const SUGGESTION = {
  "_description": "Proactive UI suggestions",
  "bubble": {
    "maxWidth": "280px",
    "padding": "12px 16px",
    "borderRadius": "16px",
    "background": "var(--glass-regular-background)",
    "backdropBlur": "var(--glass-regular-blur)",
    "entranceAnimation": "bubbleIn 400ms spring(gentle)",
    "dismissAnimation": "bubbleOut 200ms ease-in",
    "position": "contextual"
  },
  "nudge": {
    "_description": "Subtle directional hints",
    "arrowSize": "8px",
    "pulseAnimation": "nudgePulse 2s ease-in-out infinite",
    "maxOccurrences": 3,
    "cooldown": "1 hour"
  },
  "spotlight": {
    "_description": "Highlight suggested action",
    "glowRadius": "20px",
    "glowOpacity": 0.15,
    "glowColor": "var(--color-accent)",
    "pulseAnimation": "spotlightPulse 3s ease-in-out infinite",
    "dimBackground": true,
    "dimOpacity": 0.4
  }
};

/**
 * Adaptation configurations - UI learns from user patterns.
 */
export const ADAPTATION = {
  "_description": "UI adapts to user patterns over time",
  "frequencyBoost": {
    "_description": "Frequently used features become more prominent",
    "threshold": "5 uses / week",
    "boost": {
      "position": "elevated",
      "size": 1.1,
      "showShortcut": true
    }
  },
  "timeOptimization": {
    "_description": "Features optimize for when they're most used",
    "trackUsageTime": true,
    "showAtOptimalTime": true,
    "hideWhenIrrelevant": true
  },
  "sequenceDetection": {
    "_description": "Detect common action sequences",
    "minSequenceLength": 2,
    "confidenceThreshold": 0.7,
    "suggestNext": true,
    "createShortcut": {
      "threshold": "10 occurrences",
      "prompt": true
    }
  }
};

/**
 * Loading stage configurations.
 */
export const LOADING_STAGES = {
  "instant": {
    "maxDuration": "100ms",
    "show": "nothing",
    "comment": "Too fast to show anything"
  },
  "fast": {
    "duration": "100ms-300ms",
    "show": "subtle-pulse",
    "comment": "Brief acknowledgment"
  },
  "normal": {
    "duration": "300ms-1s",
    "show": "skeleton",
    "comment": "Standard loading"
  },
  "slow": {
    "duration": "1s-5s",
    "show": "skeleton + progress",
    "comment": "Show we're working"
  },
  "extended": {
    "duration": "5s+",
    "show": "skeleton + progress + message",
    "messages": [
      "Still working on that...",
      "Almost there...",
      "Thanks for waiting..."
    ],
    "messageInterval": "3s"
  }
};

/**
 * Loading progress indicator styles.
 */
export const LOADING_PROGRESS = {
  "determinate": {
    "animation": "smooth-fill",
    "showPercentage": true,
    "milestones": [
      25,
      50,
      75,
      100
    ],
    "milestoneAnimation": "pulse"
  },
  "indeterminate": {
    "animation": "wave",
    "speed": "1.5s",
    "segments": 3
  }
};

/**
 * UI intelligence configurations.
 */
export const UI_INTELLIGENCE = {
  "_philosophy": "UI that learns from the user, not just serves them",
  "patterns": {
    "usageTracking": {
      "granularity": "action",
      "retention": "30 days",
      "aggregation": [
        "daily",
        "weekly",
        "monthly"
      ],
      "privacy": "local-only"
    },
    "preferenceInference": {
      "minDataPoints": 10,
      "confidenceThreshold": 0.8,
      "categories": [
        "interaction-speed",
        "information-density",
        "visual-complexity",
        "feature-usage"
      ]
    }
  },
  "personalization": {
    "_description": "UI adapts to individual preferences",
    "informationDensity": {
      "minimal": {
        "spacing": 1.5,
        "fontSize": 1.1,
        "itemsPerView": 3
      },
      "balanced": {
        "spacing": 1,
        "fontSize": 1,
        "itemsPerView": 5
      },
      "dense": {
        "spacing": 0.8,
        "fontSize": 0.95,
        "itemsPerView": 8
      }
    },
    "interactionSpeed": {
      "deliberate": {
        "animationSpeed": 0.8,
        "holdDuration": 1.2,
        "tooltipDelay": "400ms"
      },
      "balanced": {
        "animationSpeed": 1,
        "holdDuration": 1,
        "tooltipDelay": "300ms"
      },
      "quick": {
        "animationSpeed": 1.3,
        "holdDuration": 0.7,
        "tooltipDelay": "150ms"
      }
    },
    "visualComplexity": {
      "calm": {
        "particles": 0,
        "gradients": "subtle",
        "animations": "minimal"
      },
      "balanced": {
        "particles": "light",
        "gradients": "moderate",
        "animations": "standard"
      },
      "rich": {
        "particles": "full",
        "gradients": "vibrant",
        "animations": "expressive"
      }
    }
  }
};

/**
 * Get loading state based on duration.
 */
export function getLoadingState(durationMs: number): 'instant' | 'fast' | 'normal' | 'slow' | 'extended' {
  if (durationMs < 100) return 'instant';
  if (durationMs < 300) return 'fast';
  if (durationMs < 1000) return 'normal';
  if (durationMs < 5000) return 'slow';
  return 'extended';
}

/**
 * Get personalization settings based on user preference.
 */
export function getPersonalization(
  density: 'minimal' | 'balanced' | 'dense',
  speed: 'deliberate' | 'balanced' | 'quick',
  complexity: 'calm' | 'balanced' | 'rich'
) {
  return {
    density: UI_INTELLIGENCE.personalization?.informationDensity?.[density] || {},
    speed: UI_INTELLIGENCE.personalization?.interactionSpeed?.[speed] || {},
    complexity: UI_INTELLIGENCE.personalization?.visualComplexity?.[complexity] || {},
  };
}
