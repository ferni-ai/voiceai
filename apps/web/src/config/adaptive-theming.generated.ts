/**
 * Ferni Adaptive Theming System
 * 🎨 AUTO-GENERATED FROM design-system/tokens/animation.json
 * Do not edit directly - run: pnpm tokens:sync
 *
 * BETTER THAN APPLE: Not just light/dark mode
 * BETTER THAN GOOGLE: Not just color extraction
 *
 * Four-layer adaptive theming:
 * 1. Circadian Presence - Time-aware design
 * 2. Emotional Theming - Context-responsive themes
 * 3. Persona Aura - Ambient persona presence
 * 4. Relationship Depth - UI that grows with you
 *
 * Generated: 2026-01-21T10:49:16.770Z
 */

// =============================================================================
// TYPES
// =============================================================================

export type CircadianPeriod = 'earlyMorning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'lateNight' | 'deepNight';

export type EmotionalTheme = 'zen' | 'midnight' | 'embrace' | 'energize' | 'focus' | 'reflect';

export type PersonaId = 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';

export type RelationshipStage = 'new' | 'gettingToKnow' | 'buildingTrust' | 'established' | 'deepPartnership';

export interface CircadianConfig {
  hours: [number, number];
  name: string;
  warmth: number;
  brightness: number;
  animationSpeed: number;
  presence: string;
}

export interface EmotionalThemeConfig {
  name: string;
  emotionalState: string;
  colorTemperature: number;
  animationIntensity: number;
  warmth: number;
  saturation: number;
  triggerEmotions?: string[];
  description: string;
}

export interface PersonaAuraConfig {
  name: string;
  gradient: string;
  glowColor: string;
  glowSpread: string;
  pulseRate: string;
  presence: string;
  ambientFilter: string;
}

export interface RelationshipStageConfig {
  conversations: [number, number | null];
  uiRichness: number;
  animationComplexity: string;
  personalization: string;
  featureVisibility: string[];
  visualDescription: string;
}

export interface AdaptiveThemingState {
  circadian: CircadianPeriod;
  emotional: EmotionalTheme;
  persona: PersonaId | null;
  relationship: RelationshipStage;
}

// =============================================================================
// CONFIGURATION DATA (from animation.json)
// =============================================================================

const CIRCADIAN_PERIODS: Record<CircadianPeriod, CircadianConfig> = {
  "earlyMorning": {
    "hours": [
      5,
      7
    ],
    "name": "Dawn",
    "warmth": 0.15,
    "brightness": 0.95,
    "animationSpeed": 0.9,
    "presence": "gentle awakening"
  },
  "morning": {
    "hours": [
      7,
      11
    ],
    "name": "Morning",
    "warmth": 0.1,
    "brightness": 1,
    "animationSpeed": 1.1,
    "presence": "fresh and energetic"
  },
  "midday": {
    "hours": [
      11,
      14
    ],
    "name": "Midday",
    "warmth": 0,
    "brightness": 1,
    "animationSpeed": 1,
    "presence": "clear and focused"
  },
  "afternoon": {
    "hours": [
      14,
      18
    ],
    "name": "Afternoon",
    "warmth": 0.05,
    "brightness": 1,
    "animationSpeed": 1,
    "presence": "productive calm"
  },
  "evening": {
    "hours": [
      18,
      21
    ],
    "name": "Evening",
    "warmth": 0.2,
    "brightness": 0.95,
    "animationSpeed": 0.9,
    "presence": "winding down"
  },
  "night": {
    "hours": [
      21,
      24
    ],
    "name": "Night",
    "warmth": 0.3,
    "brightness": 0.85,
    "animationSpeed": 0.8,
    "presence": "intimate and calm"
  },
  "lateNight": {
    "hours": [
      0,
      3
    ],
    "name": "Late Night",
    "warmth": 0.35,
    "brightness": 0.8,
    "animationSpeed": 0.7,
    "presence": "fully present at 2am"
  },
  "deepNight": {
    "hours": [
      3,
      5
    ],
    "name": "Deep Night",
    "warmth": 0.25,
    "brightness": 0.75,
    "animationSpeed": 0.6,
    "presence": "quiet companion"
  }
};

const EMOTIONAL_THEMES: Record<EmotionalTheme, EmotionalThemeConfig> = {
  "zen": {
    "name": "Zen Garden",
    "emotionalState": "neutral",
    "colorTemperature": 0,
    "animationIntensity": 1,
    "warmth": 0.5,
    "saturation": 1,
    "description": "Default calm - warm paper and sage"
  },
  "midnight": {
    "name": "Cedar Night",
    "emotionalState": "neutral",
    "colorTemperature": 0.2,
    "animationIntensity": 0.9,
    "warmth": 0.6,
    "saturation": 0.95,
    "description": "Dark mode with warm cedar tones"
  },
  "embrace": {
    "name": "Warm Embrace",
    "emotionalState": "comfort",
    "colorTemperature": 0.4,
    "animationIntensity": 0.7,
    "warmth": 0.8,
    "saturation": 0.9,
    "triggerEmotions": [
      "sad",
      "anxious",
      "worried",
      "lonely"
    ],
    "description": "Extra warmth when you need comfort"
  },
  "energize": {
    "name": "Morning Energy",
    "emotionalState": "excited",
    "colorTemperature": -0.1,
    "animationIntensity": 1.3,
    "warmth": 0.4,
    "saturation": 1.1,
    "triggerEmotions": [
      "excited",
      "happy",
      "motivated",
      "celebrating"
    ],
    "description": "Vibrant and alive for high-energy moments"
  },
  "focus": {
    "name": "Deep Focus",
    "emotionalState": "thinking",
    "colorTemperature": -0.2,
    "animationIntensity": 0.6,
    "warmth": 0.3,
    "saturation": 0.85,
    "triggerEmotions": [
      "thinking",
      "working",
      "planning",
      "concentrating"
    ],
    "description": "Minimal, clear, distraction-free"
  },
  "reflect": {
    "name": "Quiet Reflection",
    "emotionalState": "contemplative",
    "colorTemperature": 0.1,
    "animationIntensity": 0.5,
    "warmth": 0.55,
    "saturation": 0.8,
    "triggerEmotions": [
      "nostalgic",
      "reflective",
      "processing",
      "grieving"
    ],
    "description": "Muted and gentle for processing moments"
  }
};

const PERSONA_AURAS: Record<PersonaId, PersonaAuraConfig> = {
  "ferni": {
    "name": "Ferni",
    "gradient": "radial-gradient(ellipse 120% 100% at 50% -20%, rgba(74, 103, 65, 0.15) 0%, transparent 70%)",
    "glowColor": "rgba(74, 103, 65, 0.25)",
    "glowSpread": "80px",
    "pulseRate": "5s",
    "presence": "grounding",
    "ambientFilter": "saturate(1.02)"
  },
  "maya": {
    "name": "Maya",
    "gradient": "radial-gradient(ellipse 120% 100% at 50% -20%, rgba(139, 90, 173, 0.15) 0%, transparent 70%)",
    "glowColor": "rgba(139, 90, 173, 0.25)",
    "glowSpread": "70px",
    "pulseRate": "4s",
    "presence": "energizing",
    "ambientFilter": "saturate(1.05)"
  },
  "peter": {
    "name": "Peter",
    "gradient": "radial-gradient(ellipse 120% 100% at 50% -20%, rgba(46, 125, 154, 0.12) 0%, transparent 70%)",
    "glowColor": "rgba(46, 125, 154, 0.2)",
    "glowSpread": "90px",
    "pulseRate": "6s",
    "presence": "clarifying",
    "ambientFilter": "saturate(0.98)"
  },
  "jordan": {
    "name": "Jordan",
    "gradient": "radial-gradient(ellipse 120% 100% at 50% -20%, rgba(209, 122, 71, 0.15) 0%, transparent 70%)",
    "glowColor": "rgba(209, 122, 71, 0.25)",
    "glowSpread": "75px",
    "pulseRate": "4.5s",
    "presence": "exciting",
    "ambientFilter": "saturate(1.08)"
  },
  "alex": {
    "name": "Alex",
    "gradient": "radial-gradient(ellipse 120% 100% at 50% -20%, rgba(90, 143, 123, 0.12) 0%, transparent 70%)",
    "glowColor": "rgba(90, 143, 123, 0.2)",
    "glowSpread": "85px",
    "pulseRate": "5.5s",
    "presence": "calming",
    "ambientFilter": "saturate(1.0)"
  },
  "nayan": {
    "name": "Nayan",
    "gradient": "radial-gradient(ellipse 120% 100% at 50% -20%, rgba(139, 107, 74, 0.15) 0%, transparent 70%)",
    "glowColor": "rgba(139, 107, 74, 0.22)",
    "glowSpread": "100px",
    "pulseRate": "7s",
    "presence": "deepening",
    "ambientFilter": "saturate(0.95) sepia(0.05)"
  }
};

const RELATIONSHIP_STAGES: Record<RelationshipStage, RelationshipStageConfig> = {
  "new": {
    "conversations": [
      0,
      5
    ],
    "uiRichness": 0.5,
    "animationComplexity": "simple",
    "personalization": "minimal",
    "featureVisibility": [
      "core"
    ],
    "visualDescription": "Clean, focused, welcoming - don't overwhelm"
  },
  "gettingToKnow": {
    "conversations": [
      5,
      15
    ],
    "uiRichness": 0.65,
    "animationComplexity": "moderate",
    "personalization": "emerging",
    "featureVisibility": [
      "core",
      "growth"
    ],
    "visualDescription": "Starting to show personality, unlocking features"
  },
  "buildingTrust": {
    "conversations": [
      15,
      30
    ],
    "uiRichness": 0.8,
    "animationComplexity": "rich",
    "personalization": "adapted",
    "featureVisibility": [
      "core",
      "growth",
      "team"
    ],
    "visualDescription": "Full team available, rich interactions"
  },
  "established": {
    "conversations": [
      30,
      60
    ],
    "uiRichness": 0.9,
    "animationComplexity": "expressive",
    "personalization": "deep",
    "featureVisibility": [
      "core",
      "growth",
      "team",
      "advanced"
    ],
    "visualDescription": "Inside jokes, callbacks, anticipation"
  },
  "deepPartnership": {
    "conversations": [
      60,
      null
    ],
    "uiRichness": 1,
    "animationComplexity": "full",
    "personalization": "intuitive",
    "featureVisibility": [
      "all"
    ],
    "visualDescription": "UI feels like it knows you - subtle, personal, present"
  }
};

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Detect current circadian period from current time
 */
export function detectCircadianPeriod(date: Date = new Date()): CircadianPeriod {
  const hour = date.getHours();

  for (const [period, config] of Object.entries(CIRCADIAN_PERIODS)) {
    const [start, end] = config.hours;
    if (start <= end) {
      if (hour >= start && hour < end) {
        return period as CircadianPeriod;
      }
    } else {
      if (hour >= start || hour < end) {
        return period as CircadianPeriod;
      }
    }
  }

  return 'midday' as CircadianPeriod;
}

/**
 * Detect emotional theme based on detected emotion
 */
export function detectEmotionalTheme(emotion: string | null): EmotionalTheme {
  if (!emotion) return 'zen' as EmotionalTheme;

  const lowerEmotion = emotion.toLowerCase();

  for (const [theme, config] of Object.entries(EMOTIONAL_THEMES)) {
    if (config.triggerEmotions?.some(
      (trigger: string) => lowerEmotion.includes(trigger) || trigger.includes(lowerEmotion)
    )) {
      return theme as EmotionalTheme;
    }
  }

  return 'zen' as EmotionalTheme;
}

/**
 * Detect relationship stage from conversation count
 */
export function detectRelationshipStage(conversationCount: number): RelationshipStage {
  for (const [stage, config] of Object.entries(RELATIONSHIP_STAGES)) {
    const [min, max] = config.conversations;
    if (max === null) {
      if (conversationCount >= min) return stage as RelationshipStage;
    } else {
      if (conversationCount >= min && conversationCount < max) {
        return stage as RelationshipStage;
      }
    }
  }

  return 'new' as RelationshipStage;
}

// =============================================================================
// CSS APPLICATION FUNCTIONS
// =============================================================================

/**
 * Apply circadian theme CSS variables
 */
export function applyCircadianTheme(
  period: CircadianPeriod,
  element: HTMLElement = document.documentElement
): void {
  const config = CIRCADIAN_PERIODS[period];

  element.setAttribute('data-circadian', period);
  element.style.setProperty('--circadian-warmth', String(config.warmth));
  element.style.setProperty('--circadian-brightness', String(config.brightness));
  element.style.setProperty('--circadian-animation-speed', String(config.animationSpeed));
  element.style.setProperty(
    '--circadian-filter',
    `sepia(${config.warmth * 0.15}) saturate(${1 + config.warmth * 0.1})`
  );
}

/**
 * Apply emotional theme CSS variables
 */
export function applyEmotionalTheme(
  theme: EmotionalTheme,
  element: HTMLElement = document.documentElement
): void {
  const config = EMOTIONAL_THEMES[theme];

  element.setAttribute('data-emotion', theme);
  element.style.setProperty('--emotional-temperature', String(config.colorTemperature));
  element.style.setProperty('--emotional-warmth', String(config.warmth));
  element.style.setProperty('--emotional-saturation', String(config.saturation));
  element.style.setProperty('--emotional-animation-intensity', String(config.animationIntensity));

  const filterParts: string[] = [];
  if (config.warmth > 0.5) {
    filterParts.push(`sepia(${(config.warmth - 0.5) * 0.4})`);
  }
  if (config.saturation !== 1) {
    filterParts.push(`saturate(${config.saturation})`);
  }
  if (config.colorTemperature !== 0) {
    const hueShift = config.colorTemperature * -15;
    filterParts.push(`hue-rotate(${hueShift}deg)`);
  }

  element.style.setProperty(
    '--emotional-filter',
    filterParts.length > 0 ? filterParts.join(' ') : 'none'
  );
}

/**
 * Apply persona aura CSS variables
 */
export function applyPersonaAura(
  persona: PersonaId | null,
  element: HTMLElement = document.documentElement
): void {
  if (!persona) {
    element.removeAttribute('data-persona');
    element.style.setProperty('--persona-aura-gradient', 'none');
    element.style.setProperty('--persona-aura-glow', 'transparent');
    element.style.setProperty('--persona-aura-spread', '0px');
    element.style.setProperty('--persona-aura-pulse', '5s');
    element.style.setProperty('--persona-aura-filter', 'none');
    return;
  }

  const config = PERSONA_AURAS[persona];

  element.setAttribute('data-persona', persona);
  element.style.setProperty('--persona-aura-gradient', config.gradient);
  element.style.setProperty('--persona-aura-glow', config.glowColor);
  element.style.setProperty('--persona-aura-spread', config.glowSpread);
  element.style.setProperty('--persona-aura-pulse', config.pulseRate);
  element.style.setProperty('--persona-aura-filter', config.ambientFilter);
}

/**
 * Apply relationship depth CSS variables
 */
export function applyRelationshipDepth(
  stage: RelationshipStage,
  element: HTMLElement = document.documentElement
): void {
  const config = RELATIONSHIP_STAGES[stage];

  element.setAttribute('data-relationship', stage);
  element.style.setProperty('--relationship-richness', String(config.uiRichness));
  element.style.setProperty('--relationship-complexity', config.animationComplexity);
  element.style.setProperty('--relationship-personalization', config.personalization);
}

// =============================================================================
// ADAPTIVE THEMING ORCHESTRATOR
// =============================================================================

type ThemeChangeListener = (state: AdaptiveThemingState) => void;

class AdaptiveThemingOrchestrator {
  private state: AdaptiveThemingState;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<ThemeChangeListener> = new Set();
  private manualOverrides: Partial<AdaptiveThemingState> = {};

  constructor() {
    this.state = {
      circadian: detectCircadianPeriod(),
      emotional: 'zen' as EmotionalTheme,
      persona: null,
      relationship: 'new' as RelationshipStage,
    };
  }

  /**
   * Initialize the adaptive theming system
   */
  init(options?: {
    autoCircadian?: boolean;
    updateIntervalMs?: number;
    initialConversationCount?: number;
    initialPersona?: PersonaId;
  }): void {
    const {
      autoCircadian = true,
      updateIntervalMs = 60000,
      initialConversationCount = 0,
      initialPersona = null,
    } = options ?? {};

    this.state.relationship = detectRelationshipStage(initialConversationCount);
    if (initialPersona) {
      this.state.persona = initialPersona;
    }

    this.applyAll();

    if (autoCircadian) {
      this.startCircadianAutoUpdate(updateIntervalMs);
    }

    if (typeof window !== 'undefined' && (window as unknown as { __DEV__?: boolean }).__DEV__) {
      console.log('🌅 Adaptive Theming initialized:', {
        circadian: `${this.state.circadian} (${CIRCADIAN_PERIODS[this.state.circadian].name})`,
        emotional: this.state.emotional,
        persona: this.state.persona,
        relationship: this.state.relationship,
      });
    }
  }

  private startCircadianAutoUpdate(intervalMs: number): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      const newPeriod = detectCircadianPeriod();
      if (newPeriod !== this.state.circadian && !this.manualOverrides.circadian) {
        this.setCircadian(newPeriod);
      }
    }, intervalMs);
  }

  stopCircadianAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  applyAll(element: HTMLElement = document.documentElement): void {
    applyCircadianTheme(this.state.circadian, element);
    applyEmotionalTheme(this.state.emotional, element);
    applyPersonaAura(this.state.persona, element);
    applyRelationshipDepth(this.state.relationship, element);
  }

  setCircadian(period: CircadianPeriod, manual = false): void {
    this.state.circadian = period;
    if (manual) {
      this.manualOverrides.circadian = period;
    }
    applyCircadianTheme(period);
    this.notifyListeners();
  }

  clearCircadianOverride(): void {
    delete this.manualOverrides.circadian;
    this.state.circadian = detectCircadianPeriod();
    applyCircadianTheme(this.state.circadian);
    this.notifyListeners();
  }

  setEmotionalTheme(theme: EmotionalTheme): void {
    this.state.emotional = theme;
    applyEmotionalTheme(theme);
    this.notifyListeners();
  }

  setEmotionFromDetection(emotion: string | null): void {
    const theme = detectEmotionalTheme(emotion);
    this.setEmotionalTheme(theme);
  }

  setPersona(persona: PersonaId | null): void {
    this.state.persona = persona;
    applyPersonaAura(persona);
    this.notifyListeners();
  }

  updateConversationCount(count: number): void {
    const newStage = detectRelationshipStage(count);
    if (newStage !== this.state.relationship) {
      this.state.relationship = newStage;
      applyRelationshipDepth(newStage);
      this.notifyListeners();
    }
  }

  getState(): Readonly<AdaptiveThemingState> {
    return { ...this.state };
  }

  getCircadianConfig(period?: CircadianPeriod): CircadianConfig {
    return CIRCADIAN_PERIODS[period ?? this.state.circadian];
  }

  getEmotionalConfig(theme?: EmotionalTheme): EmotionalThemeConfig {
    return EMOTIONAL_THEMES[theme ?? this.state.emotional];
  }

  getPersonaConfig(persona?: PersonaId): PersonaAuraConfig | null {
    const id = persona ?? this.state.persona;
    return id ? PERSONA_AURAS[id] : null;
  }

  getRelationshipConfig(stage?: RelationshipStage): RelationshipStageConfig {
    return RELATIONSHIP_STAGES[stage ?? this.state.relationship];
  }

  subscribe(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const stateCopy = this.getState();
    this.listeners.forEach((listener) => listener(stateCopy));
  }

  destroy(): void {
    this.stopCircadianAutoUpdate();
    this.listeners.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const adaptiveTheming = new AdaptiveThemingOrchestrator();

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export {
  CIRCADIAN_PERIODS,
  EMOTIONAL_THEMES,
  PERSONA_AURAS,
  RELATIONSHIP_STAGES,
};

// Auto-initialize on import (client-side only)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => adaptiveTheming.init());
  } else {
    adaptiveTheming.init();
  }
}
