/**
 * GENERATED FILE - DO NOT EDIT.
 * Source: design-system/tokens/color-emotional.json, typography-emotional.json, colors.json
 * Regenerate: pnpm tokens:sync (design-system/generate-emotional-tokens.js)
 * tokens v1.0.0
 */

/** Mood color adjustments (color-emotional.json → moodPalettes.states) */
export const MOOD_COLOR_ADJUSTMENTS = {
  "calm": {
    "hueShift": -5,
    "saturationMultiplier": 0.85,
    "lightnessAdjustment": 3,
    "temperatureShift": -5,
    "character": "Cool, soft"
  },
  "joyful": {
    "hueShift": 10,
    "saturationMultiplier": 1.15,
    "lightnessAdjustment": 5,
    "temperatureShift": 10,
    "character": "Warm, bright"
  },
  "anxious": {
    "hueShift": 15,
    "saturationMultiplier": 0.9,
    "lightnessAdjustment": -5,
    "temperatureShift": 5,
    "character": "Tense, muted"
  },
  "tired": {
    "hueShift": 0,
    "saturationMultiplier": 0.7,
    "lightnessAdjustment": -10,
    "character": "Desaturated"
  },
  "focused": {
    "hueShift": -10,
    "saturationMultiplier": 1.1,
    "lightnessAdjustment": 0,
    "temperatureShift": -10,
    "character": "Cool, clear"
  },
  "reflective": {
    "hueShift": -15,
    "saturationMultiplier": 0.8,
    "lightnessAdjustment": 5,
    "temperatureShift": -15,
    "character": "Twilight, soft"
  },
  "stressed": {
    "hueShift": 5,
    "saturationMultiplier": 0.75,
    "lightnessAdjustment": -8,
    "character": "Muted, dim"
  },
  "energized": {
    "hueShift": 5,
    "saturationMultiplier": 1.2,
    "lightnessAdjustment": 8,
    "temperatureShift": 15,
    "character": "Vibrant"
  },
  "peaceful": {
    "hueShift": -20,
    "saturationMultiplier": 0.75,
    "lightnessAdjustment": 10,
    "temperatureShift": -20,
    "character": "Serene"
  }
} as const;

/** Persona palettes for mood adjustment (colors.json primary + color-emotional.json → personaMoodBase) */
export const PERSONA_MOOD_BASE_PALETTES = {
  "ferni": {
    "primary": "#4a6741",
    "accent": "#3D5A45",
    "background": "#F5F2EE"
  },
  "maya": {
    "primary": "#a67a6a",
    "accent": "#8B5A4A",
    "background": "#FBF8F5"
  },
  "peter": {
    "primary": "#3a6b73",
    "accent": "#2A5B63",
    "background": "#F5F8F9"
  },
  "jordan": {
    "primary": "#c4856a",
    "accent": "#A4654A",
    "background": "#FFFAF5"
  },
  "alex": {
    "primary": "#5a6b8a",
    "accent": "#4A5B7A",
    "background": "#F5F7FA"
  },
  "nayan": {
    "primary": "#b8956a",
    "accent": "#98754A",
    "background": "#FAF8F5"
  }
} as const;

/** Full-screen overlay tint per mood (color-emotional.json → moodPalettes.backgroundTints) */
export const MOOD_BACKGROUND_TINTS = {
  "neutral": "rgba(255, 255, 255, 0)",
  "happy": "rgba(255, 220, 100, 0.03)",
  "excited": "rgba(255, 180, 120, 0.04)",
  "calm": "rgba(180, 220, 255, 0.03)",
  "thoughtful": "rgba(200, 180, 255, 0.03)",
  "sad": "rgba(180, 200, 220, 0.03)",
  "anxious": "rgba(200, 200, 220, 0.02)",
  "supportive": "rgba(220, 255, 200, 0.03)"
} as const;

/** Time-fading parameters by period (color-emotional.json → timeFading.periods) */
export const TIME_FADING = {
  "now": {
    "saturation": 1,
    "lightnessShift": 0,
    "opacity": 1,
    "hueShift": 0,
    "blur": 0
  },
  "today": {
    "saturation": 0.95,
    "lightnessShift": 2,
    "opacity": 1,
    "hueShift": 0,
    "blur": 0
  },
  "yesterday": {
    "saturation": 0.88,
    "lightnessShift": 4,
    "opacity": 0.97,
    "hueShift": 2,
    "blur": 0
  },
  "thisWeek": {
    "saturation": 0.78,
    "lightnessShift": 7,
    "opacity": 0.94,
    "hueShift": 5,
    "blur": 0.5
  },
  "lastWeek": {
    "saturation": 0.68,
    "lightnessShift": 10,
    "opacity": 0.9,
    "hueShift": 8,
    "blur": 0.75
  },
  "thisMonth": {
    "saturation": 0.55,
    "lightnessShift": 14,
    "opacity": 0.85,
    "hueShift": 12,
    "blur": 1
  },
  "lastMonth": {
    "saturation": 0.42,
    "lightnessShift": 18,
    "opacity": 0.78,
    "hueShift": 16,
    "blur": 1.25
  },
  "older": {
    "saturation": 0.3,
    "lightnessShift": 22,
    "opacity": 0.7,
    "hueShift": 20,
    "blur": 1.5
  },
  "ancient": {
    "saturation": 0.18,
    "lightnessShift": 26,
    "opacity": 0.6,
    "hueShift": 25,
    "blur": 2
  }
} as const;

/** Atmospheric colors old items fade toward (color-emotional.json → timeFading.atmosphericColors) */
export const TIME_FADING_ATMOSPHERIC_COLORS = {
  "ferni": "#8fa89a",
  "maya": "#c4a69a",
  "peter": "#8a9fab",
  "jordan": "#d4b09a",
  "alex": "#9aa4b8",
  "nayan": "#c8b08a",
  "default": "#a8b0b8"
} as const;

/** Hand-tuned persona handoff bridge colors (color-emotional.json → personaTransitions.bridgeColors) */
export const PERSONA_BRIDGE_COLOR_OVERRIDES = {
  "ferni-maya": "#8a7a5a",
  "maya-ferni": "#8a7a5a",
  "ferni-peter": "#4a6a5a",
  "peter-ferni": "#4a6a5a",
  "ferni-nayan": "#7a8a5a",
  "nayan-ferni": "#7a8a5a",
  "maya-jordan": "#b87a6a",
  "jordan-maya": "#b87a6a",
  "peter-alex": "#4a6a7a",
  "alex-peter": "#4a6a7a",
  "alex-nayan": "#8a8a7a",
  "nayan-alex": "#8a8a7a"
} as const;

/** Neutral bridge color when a transition cannot be computed (color-emotional.json → personaTransitions.fallbackBridgeColor) */
export const PERSONA_BRIDGE_FALLBACK_COLOR = "#888888" as const;

/** Typography per mood (typography-emotional.json → moodTypography) */
export const MOOD_TYPOGRAPHY_TOKENS = {
  "calm": {
    "headingWeight": 450,
    "bodyWeight": 350,
    "letterSpacing": 0.3,
    "lineHeight": 1.65,
    "wordSpacing": 0.5,
    "fontFeatures": "\"calt\" on, \"liga\" on"
  },
  "joyful": {
    "headingWeight": 550,
    "bodyWeight": 400,
    "letterSpacing": 0.2,
    "lineHeight": 1.6,
    "wordSpacing": 0.3,
    "fontFeatures": "\"calt\" on, \"liga\" on, \"ss01\" on"
  },
  "anxious": {
    "headingWeight": 420,
    "bodyWeight": 380,
    "letterSpacing": 0,
    "lineHeight": 1.55,
    "wordSpacing": 0
  },
  "tired": {
    "headingWeight": 380,
    "bodyWeight": 350,
    "letterSpacing": 0.4,
    "lineHeight": 1.7,
    "wordSpacing": 0.8
  },
  "focused": {
    "headingWeight": 500,
    "bodyWeight": 400,
    "letterSpacing": -0.2,
    "lineHeight": 1.5,
    "wordSpacing": -0.2,
    "fontFeatures": "\"tnum\" on, \"calt\" on"
  },
  "reflective": {
    "headingWeight": 420,
    "bodyWeight": 360,
    "letterSpacing": 0.5,
    "lineHeight": 1.75,
    "wordSpacing": 1,
    "fontFeatures": "\"calt\" on, \"liga\" on, \"onum\" on"
  },
  "stressed": {
    "headingWeight": 480,
    "bodyWeight": 400,
    "letterSpacing": 0,
    "lineHeight": 1.5,
    "wordSpacing": 0
  },
  "energized": {
    "headingWeight": 600,
    "bodyWeight": 420,
    "letterSpacing": -0.3,
    "lineHeight": 1.45,
    "wordSpacing": -0.3,
    "fontFeatures": "\"calt\" on, \"ss01\" on"
  },
  "peaceful": {
    "headingWeight": 380,
    "bodyWeight": 340,
    "letterSpacing": 0.6,
    "lineHeight": 1.8,
    "wordSpacing": 1.2,
    "fontFeatures": "\"calt\" on, \"liga\" on"
  }
} as const;

/** Semantic state palettes (color-emotional.json → semanticPalettes) */
export const SEMANTIC_PALETTES = {
  "error": {
    "primary": "#7a5a52",
    "secondary": "#5a4038",
    "light": "#a67a6a",
    "glow": "rgba(122, 90, 82, 0.35)",
    "text": "#ffffff"
  },
  "warning": {
    "primary": "#a6854a",
    "secondary": "#8a6d3a",
    "light": "#c4a265",
    "glow": "rgba(166, 133, 74, 0.35)",
    "text": "#ffffff"
  },
  "success": {
    "primary": "#4a6741",
    "secondary": "#3d5a35",
    "light": "#5a7a51",
    "glow": "rgba(74, 103, 65, 0.35)",
    "text": "#ffffff"
  },
  "info": {
    "primary": "#5a6b8a",
    "secondary": "#4a5a73",
    "light": "#7a8ba0",
    "glow": "rgba(90, 107, 138, 0.35)",
    "text": "#ffffff"
  },
  "neutral": {
    "primary": "#5C544A",
    "secondary": "#756A5E",
    "light": "#A89D90",
    "glow": "rgba(92, 84, 74, 0.25)",
    "text": "#ffffff"
  }
} as const;

/** Holiday/seasonal palettes (color-emotional.json → holidayPalettes) */
export const HOLIDAY_PALETTES = {
  "valentines": {
    "primary": "#a67a6a",
    "secondary": "#8a635a",
    "accent": "#c4856a",
    "ambient": "rgba(166, 122, 106, 0.04)"
  },
  "spring": {
    "primary": "#4a6741",
    "secondary": "#5a7a51",
    "accent": "#b8956a",
    "ambient": "rgba(74, 103, 65, 0.03)"
  },
  "summer": {
    "primary": "#c4a265",
    "secondary": "#9a7b5a",
    "accent": "#c4856a",
    "ambient": "rgba(196, 162, 101, 0.04)"
  },
  "fall": {
    "primary": "#a86d55",
    "secondary": "#9a7b5a",
    "accent": "#7a5a52",
    "ambient": "rgba(168, 109, 85, 0.04)"
  },
  "halloween": {
    "primary": "#c4856a",
    "secondary": "#5a4038",
    "accent": "#a86d55",
    "ambient": "rgba(196, 133, 106, 0.05)"
  },
  "winter": {
    "primary": "#5a6b8a",
    "secondary": "#4a5a73",
    "accent": "#b8956a",
    "ambient": "rgba(90, 107, 138, 0.03)"
  },
  "christmas": {
    "primary": "#3d5a35",
    "secondary": "#7a5a52",
    "accent": "#c4a265",
    "ambient": "rgba(61, 90, 53, 0.04)"
  },
  "newYear": {
    "primary": "#b8956a",
    "secondary": "#5a6b8a",
    "accent": "#c4a265",
    "ambient": "rgba(184, 149, 106, 0.04)"
  }
} as const;
