/**
 * Ferni Haptics Design Tokens
 * 
 * Auto-generated from design-system/tokens/haptics.json.
 * DO NOT EDIT DIRECTLY.
 * 
 * Provides meaningful touch feedback for emotional connection.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HapticPattern {
  description?: string;
  duration: number;
  intensity: number | number[];
  waveform?: number[];
  gap?: number;
  curve?: string;
  repeat?: number;
  sequence?: string[];
  useCase?: string;
  character?: string;
}

export interface PersonaHapticSignature {
  description: string;
  signature: string;
  speaking: HapticPattern;
  acknowledgment?: HapticPattern;
  question?: HapticPattern;
  insight?: HapticPattern;
  celebration?: HapticPattern;
  [key: string]: string | HapticPattern | undefined;
}

export type HapticPatternName = keyof typeof BASE_PATTERNS | keyof typeof ORGANIC_PATTERNS;
export type PersonaHapticId = keyof typeof PERSONA_HAPTICS;
export type EmotionalHapticType = keyof typeof EMOTIONAL_HAPTICS;

// ============================================================================
// INTENSITY LEVELS
// ============================================================================

/**
 * Standard intensity scale (1-5) mapped to platform APIs.
 */
export const INTENSITY_LEVELS = {
  "1": {
    "description": "Whisper",
    "ios": "UIImpactFeedbackGenerator.light * 0.5",
    "android": "EFFECT_TICK"
  },
  "2": {
    "description": "Soft",
    "ios": "UIImpactFeedbackGenerator.light",
    "android": "EFFECT_CLICK"
  },
  "3": {
    "description": "Medium",
    "ios": "UIImpactFeedbackGenerator.medium",
    "android": "EFFECT_HEAVY_CLICK"
  },
  "4": {
    "description": "Strong",
    "ios": "UIImpactFeedbackGenerator.heavy",
    "android": "EFFECT_DOUBLE_CLICK"
  },
  "5": {
    "description": "Emphasis",
    "ios": "UINotificationFeedbackGenerator.success",
    "android": "VIBRATE(100)"
  }
} as const;

// ============================================================================
// BASE PATTERNS
// ============================================================================

/**
 * Fundamental haptic building blocks.
 */
export const BASE_PATTERNS = {
  "tap": {
    "description": "Single crisp tap - basic interaction feedback",
    "duration": 10,
    "intensity": 2,
    "waveform": [
      1,
      0
    ],
    "useCase": "Button press, selection"
  },
  "softTap": {
    "description": "Gentler tap - subtle acknowledgment",
    "duration": 8,
    "intensity": 1,
    "waveform": [
      0.5,
      0
    ],
    "useCase": "Toggle off, dismiss"
  },
  "doubleTap": {
    "description": "Two quick taps - confirmation",
    "duration": 40,
    "gap": 30,
    "intensity": 2,
    "waveform": [
      1,
      0,
      0,
      1,
      0
    ],
    "useCase": "Selection confirmed, got it"
  },
  "bump": {
    "description": "Weighted tap - physical feedback",
    "duration": 20,
    "intensity": 3,
    "waveform": [
      0.3,
      1,
      0.5,
      0
    ],
    "useCase": "Toggle on, snap to position"
  },
  "click": {
    "description": "Mechanical click - task complete",
    "duration": 15,
    "intensity": 3,
    "waveform": [
      1,
      0.2,
      0
    ],
    "useCase": "Checkbox, item complete"
  }
} as const;

// ============================================================================
// ORGANIC PATTERNS
// ============================================================================

/**
 * Ferni's signature haptics - organic, human, breathing.
 */
export const ORGANIC_PATTERNS = {
  "ferniBreath": {
    "description": "Core Ferni breathing pattern - warm, grounding",
    "duration": 300,
    "intensity": 2,
    "curve": "sine",
    "waveform": [
      0.2,
      0.4,
      0.6,
      0.8,
      1,
      0.8,
      0.6,
      0.4,
      0.2,
      0
    ],
    "useCase": "Connection established, presence confirmation"
  },
  "warmPulse": {
    "description": "Gentle warmth pulse - emotional acknowledgment",
    "duration": 250,
    "intensity": 3,
    "curve": "ease-in-out",
    "waveform": [
      0.3,
      0.6,
      1,
      0.6,
      0.3,
      0
    ],
    "useCase": "Empathy moment, understanding"
  },
  "heartbeat": {
    "description": "Double-beat pulse - connection/love",
    "duration": 800,
    "intensity": [
      3,
      2.5
    ],
    "waveform": [
      0.6,
      1,
      0,
      0,
      0.5,
      0.8,
      0,
      0,
      0
    ],
    "useCase": "Deep connection, milestone"
  },
  "slowBreath": {
    "description": "Extended breath - calm, wisdom",
    "duration": 500,
    "intensity": 2,
    "curve": "sine",
    "waveform": [
      0.1,
      0.2,
      0.3,
      0.5,
      0.7,
      0.9,
      1,
      0.9,
      0.7,
      0.5,
      0.3,
      0.2,
      0.1,
      0
    ],
    "useCase": "Sage persona, contemplation"
  },
  "quickBreath": {
    "description": "Short energetic breath - curiosity",
    "duration": 200,
    "intensity": 2,
    "curve": "ease-out",
    "waveform": [
      0.4,
      0.8,
      1,
      0.6,
      0.3,
      0
    ],
    "useCase": "Researcher energy, discovery"
  }
} as const;

// ============================================================================
// CELEBRATION PATTERNS
// ============================================================================

/**
 * Positive feedback patterns for wins and achievements.
 */
export const CELEBRATION_PATTERNS = {
  "smallWin": {
    "description": "Quick sparkle - small achievement",
    "duration": 200,
    "intensity": [
      2,
      1,
      1
    ],
    "waveform": [
      0.5,
      1,
      0.3,
      0.5,
      0.2,
      0.3,
      0
    ],
    "useCase": "Task complete, streak continued"
  },
  "bigWin": {
    "description": "Celebration burst - major achievement",
    "duration": 400,
    "intensity": [
      3,
      4,
      2,
      2,
      1
    ],
    "waveform": [
      0.3,
      0.6,
      1,
      0.8,
      0.3,
      0.5,
      0.2,
      0.4,
      0.1,
      0.2,
      0
    ],
    "useCase": "Milestone reached, level up"
  },
  "teamUnlock": {
    "description": "Arrival pattern - new team member unlocked",
    "duration": 600,
    "intensity": [
      2,
      3,
      3,
      2
    ],
    "sequence": [
      "ferniBreath",
      "pause:100",
      "doubleTap"
    ],
    "useCase": "Team member unlock celebration"
  },
  "streakAchieved": {
    "description": "Rhythmic celebration - streak milestone",
    "duration": 500,
    "intensity": [
      2,
      2,
      2,
      3
    ],
    "waveform": [
      0.5,
      0,
      0.5,
      0,
      0.5,
      0,
      1,
      0.5,
      0
    ],
    "useCase": "7-day streak, 30-day streak"
  }
} as const;

// ============================================================================
// CONNECTION PATTERNS
// ============================================================================

/**
 * Connection state feedback.
 */
export const CONNECTION_PATTERNS = {
  "connectionEstablished": {
    "description": "Warm welcome - connection success",
    "duration": 600,
    "sequence": [
      "ferniBreath",
      "doubleTap"
    ],
    "useCase": "Voice connection established"
  },
  "connectionLost": {
    "description": "Gentle fade - connection dropped",
    "duration": 300,
    "intensity": [
      2,
      1
    ],
    "waveform": [
      0.6,
      0.4,
      0.2,
      0.1,
      0
    ],
    "useCase": "Network disconnection"
  },
  "reconnecting": {
    "description": "Hopeful pulse - attempting reconnect",
    "duration": 400,
    "intensity": 2,
    "repeat": 3,
    "gap": 200,
    "waveform": [
      0.3,
      0.6,
      0.3,
      0
    ],
    "useCase": "Auto-reconnect in progress"
  }
} as const;

// ============================================================================
// INTERACTION PATTERNS
// ============================================================================

/**
 * Standard UI interaction haptics.
 */
export const INTERACTION_PATTERNS = {
  "buttonPress": {
    "pattern": "tap",
    "intensity": 2,
    "duration": 15
  },
  "buttonRelease": {
    "pattern": "softTap",
    "intensity": 1,
    "duration": 10
  },
  "toggleOn": {
    "pattern": "bump",
    "intensity": 2,
    "duration": 20
  },
  "toggleOff": {
    "pattern": "softTap",
    "intensity": 1,
    "duration": 15
  },
  "selection": {
    "pattern": "doubleTap",
    "intensity": 2,
    "duration": 40,
    "gap": 30
  },
  "longPressStart": {
    "pattern": "ramp",
    "intensity": [
      1,
      2,
      3
    ],
    "duration": 500
  },
  "longPressComplete": {
    "pattern": "bump",
    "intensity": 3,
    "duration": 25
  },
  "scrollSnap": {
    "pattern": "softTap",
    "intensity": 1,
    "duration": 10
  },
  "sliderTick": {
    "pattern": "softTap",
    "intensity": 1,
    "duration": 8
  },
  "pullToRefresh": {
    "pattern": "ferniBreath",
    "intensity": 2,
    "duration": 300
  },
  "swipeComplete": {
    "pattern": "bump",
    "intensity": 2,
    "duration": 20
  }
} as const;

// ============================================================================
// PERSONA HAPTICS
// ============================================================================

/**
 * Each persona has a unique haptic signature reflecting their personality.
 */
export const PERSONA_HAPTICS: Record<string, PersonaHapticSignature> = {
  "ferni": {
    "description": "Warm, grounding, nurturing - life coach energy",
    "signature": "ferniBreath",
    "speaking": {
      "pattern": "ferniBreath",
      "intensity": 2,
      "duration": 300
    },
    "acknowledgment": {
      "pattern": "doubleTap",
      "intensity": 2,
      "gap": 40
    },
    "question": {
      "pattern": "ramp",
      "intensity": [
        1,
        2
      ],
      "duration": 200
    },
    "insight": {
      "pattern": "heartbeat",
      "intensity": 3,
      "duration": 300
    },
    "celebration": {
      "pattern": "smallWin",
      "intensity": 3,
      "duration": 250
    }
  },
  "jack": {
    "description": "Wise, deep, resonant - sage mentor energy",
    "signature": "slowBreath",
    "speaking": {
      "pattern": "slowBreath",
      "intensity": 2,
      "duration": 500
    },
    "storyStart": {
      "pattern": "gather",
      "intensity": [
        1,
        2,
        2
      ],
      "duration": 600
    },
    "wisdom": {
      "pattern": "deepPulse",
      "intensity": 3,
      "duration": 200
    },
    "reflection": {
      "pattern": "slowBreath",
      "intensity": 2,
      "duration": 600
    }
  },
  "peter": {
    "description": "Curious, energetic, quick - researcher energy",
    "signature": "quickBreath",
    "speaking": {
      "pattern": "quickBreath",
      "intensity": 2,
      "duration": 200
    },
    "discovery": {
      "pattern": "burst",
      "intensity": [
        3,
        2,
        2,
        1
      ],
      "duration": 300
    },
    "thinking": {
      "pattern": "rhythm",
      "intensity": 1,
      "interval": 200
    },
    "eureka": {
      "pattern": "bigWin",
      "intensity": 4,
      "duration": 350
    }
  },
  "alex": {
    "description": "Clear, empathetic, smooth - communicator energy",
    "signature": "warmPulse",
    "speaking": {
      "pattern": "smoothBreath",
      "intensity": 2,
      "duration": 350
    },
    "guidance": {
      "pattern": "leadTap",
      "intensity": 2,
      "duration": 15
    },
    "empathy": {
      "pattern": "warmPulse",
      "intensity": 3,
      "duration": 250
    },
    "clarity": {
      "pattern": "doubleTap",
      "intensity": 2,
      "duration": 35
    }
  },
  "maya": {
    "description": "Steady, rhythmic, reliable - architect energy",
    "signature": "steadyRhythm",
    "speaking": {
      "pattern": "steadyRhythm",
      "intensity": 2,
      "interval": 300
    },
    "taskComplete": {
      "pattern": "click",
      "intensity": 3,
      "duration": 20
    },
    "habitCheck": {
      "pattern": "firmTap",
      "intensity": 2,
      "duration": 25
    },
    "progress": {
      "pattern": "ramp",
      "intensity": [
        1,
        2,
        2
      ],
      "duration": 400
    }
  },
  "jordan": {
    "description": "Joyful, bouncy, celebratory - event planner energy",
    "signature": "bounce",
    "speaking": {
      "pattern": "bouncyPulse",
      "intensity": 2,
      "duration": 250
    },
    "excitement": {
      "pattern": "sparkle",
      "intensity": [
        2,
        2,
        3,
        2
      ],
      "duration": 350
    },
    "countdown": {
      "pattern": "tick",
      "intensity": 2,
      "interval": 1000
    },
    "celebration": {
      "pattern": "bigWin",
      "intensity": 4,
      "duration": 500
    }
  },
  "nayan": {
    "description": "Deep, integrative, philosophical - wisdom energy",
    "signature": "deepBreath",
    "speaking": {
      "pattern": "deepBreath",
      "intensity": 2,
      "duration": 600
    },
    "contemplation": {
      "pattern": "slowBreath",
      "intensity": 2,
      "duration": 800
    },
    "integration": {
      "pattern": "heartbeat",
      "intensity": 3,
      "duration": 600
    },
    "insight": {
      "pattern": "warmPulse",
      "intensity": 3,
      "duration": 400
    }
  }
};

// ============================================================================
// EMOTIONAL HAPTICS
// ============================================================================

/**
 * Haptic responses to detected emotional states.
 */
export const EMOTIONAL_HAPTICS = {
  "empathy": {
    "description": "When Ferni detects user needs comfort",
    "pattern": "warmPulse",
    "intensity": 3,
    "duration": 300,
    "character": "Like a gentle hand on shoulder"
  },
  "encouragement": {
    "description": "When Ferni is cheering user on",
    "pattern": "quickBreath",
    "intensity": 2,
    "duration": 200,
    "character": "Supportive energy"
  },
  "understanding": {
    "description": "When Ferni shows deep comprehension",
    "pattern": "heartbeat",
    "intensity": 2,
    "duration": 500,
    "character": "I get it"
  },
  "concern": {
    "description": "When Ferni detects distress",
    "pattern": "slowBreath",
    "intensity": 2,
    "duration": 400,
    "character": "Calming presence"
  },
  "celebration": {
    "description": "When sharing in user's joy",
    "pattern": "bigWin",
    "intensity": 3,
    "duration": 400,
    "character": "Pure joy"
  },
  "curiosity": {
    "description": "When Ferni is intrigued",
    "pattern": "quickBreath",
    "intensity": 2,
    "duration": 180,
    "character": "Tell me more"
  }
} as const;

// ============================================================================
// RITUAL HAPTICS
// ============================================================================

/**
 * Haptics for brand ritual moments.
 */
export const RITUAL_HAPTICS = {
  "welcomeBack": {
    "description": "Returning user after >24 hours",
    "sequence": [
      "ferniBreath",
      "pause:200",
      "doubleTap"
    ],
    "duration": 600,
    "character": "Welcome home"
  },
  "firstConversation": {
    "description": "Brand new user's first interaction",
    "sequence": [
      "slowBreath",
      "pause:300",
      "warmPulse"
    ],
    "duration": 800,
    "character": "Nice to meet you"
  },
  "sessionEnd": {
    "description": "Natural conversation ending",
    "sequence": [
      "ferniBreath",
      "softTap"
    ],
    "duration": 400,
    "character": "Until next time"
  },
  "handoff": {
    "description": "Switching between personas",
    "sequence": [
      "softFade",
      "pause:200",
      "personaSignature"
    ],
    "duration": 500,
    "character": "Smooth transition"
  }
} as const;

// ============================================================================
// ERROR HAPTICS
// ============================================================================

/**
 * Haptics for error states - never alarming.
 */
export const ERROR_HAPTICS = {
  "softError": {
    "description": "Minor issue, not alarming",
    "pattern": "doubleTap",
    "intensity": 2,
    "duration": 50,
    "character": "Hmm, that didn't work"
  },
  "connectionError": {
    "description": "Network issue",
    "pattern": "fade",
    "intensity": [
      2,
      1
    ],
    "duration": 200,
    "character": "We lost you for a moment"
  },
  "validationError": {
    "description": "Input validation failed",
    "pattern": "softTap",
    "intensity": 2,
    "duration": 15,
    "character": "Check that"
  }
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get haptic pattern by name from any category.
 */
export function getHapticPattern(name: string): HapticPattern | undefined {
  return (
    (BASE_PATTERNS as Record<string, HapticPattern>)[name] ||
    (ORGANIC_PATTERNS as Record<string, HapticPattern>)[name] ||
    (CELEBRATION_PATTERNS as Record<string, HapticPattern>)[name] ||
    (CONNECTION_PATTERNS as Record<string, HapticPattern>)[name]
  );
}

/**
 * Get persona-specific haptic signature.
 */
export function getPersonaHaptics(personaId: string): PersonaHapticSignature | undefined {
  return PERSONA_HAPTICS[personaId];
}

/**
 * Get emotional haptic response.
 */
export function getEmotionalHaptic(emotion: string): HapticPattern | undefined {
  return (EMOTIONAL_HAPTICS as Record<string, HapticPattern>)[emotion];
}

/**
 * Check if haptics should be disabled based on user preferences.
 */
export function shouldDisableHaptics(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for reduce-motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Check localStorage preference
  const userDisabled = localStorage.getItem('ferni-haptics-disabled') === 'true';
  
  return prefersReducedMotion || userDisabled;
}
