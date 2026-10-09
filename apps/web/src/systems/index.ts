/**
 * Transcendent Animation Systems
 *
 * Central orchestration for Ferni's "Better than Human" animation systems:
 * - Breath Sync: Everything pulses with life
 * - Expression Player: Micro-expressions for subliminal emotional communication
 * - Moment Orchestrator: Signature moments for peak experiences
 * - Emotional Color: Dynamic color temperature based on emotional state
 * - Physics: Weight, mass, and spring dynamics for Pixar-quality motion
 * - Overlapping Action: Staggered child animations for organic movement
 * - Secondary Action: Every action triggers supporting reactions
 * - Micro-Interactions: 0.1-0.3 second magic moments for polish
 * - Contextual Spacing: Device-aware semantic spacing with emotional context
 * - Voice Typography: Typography that responds to speaking state
 * - Imperfection Engine: Organic variations to prevent uncanny valley motion
 *
 * These systems work together to create animation that feels alive,
 * emotionally resonant, and genuinely human.
 */

// Import transcendent CSS utility classes (Vite handles bundling)
import './transcendent.css';

import { createLogger } from '../utils/logger.js';

import * as breathSync from './breath-sync.js';
import * as contextualSpacing from './contextual-spacing.js';
import * as emotionalColor from './emotional-color.js';
import * as expressionPlayer from './expression-player.js';
import * as imperfection from './imperfection.js';
import * as momentOrchestrator from './moment-orchestrator.js';
import * as overlappingAction from './overlapping-action.js';
import * as secondaryAction from './secondary-action.js';
import * as voiceTypography from './voice-typography.js';

const log = createLogger('TranscendentSystems');

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports - Core Systems
// ─────────────────────────────────────────────────────────────────────────────

export {
  initBreathSync,
  getBreathSync,
  destroyBreathSync,
  type BreathState,
  type BreathConfig,
} from './breath-sync.js';

export {
  getExpressionPlayer,
  destroyExpressionPlayer,
  playExpression,
  triggerExpression,
} from './expression-player.js';

export {
  getMomentOrchestrator,
  destroyMomentOrchestrator,
  playRecognitionMoment,
  playBreakthroughMoment,
  enterHoldingSpace,
  exitHoldingSpace,
  playHandoffMoment,
  type SignatureMoment,
  type MomentPhase,
} from './moment-orchestrator.js';

export {
  initEmotionalColor,
  getEmotionalColor,
  destroyEmotionalColor,
  setEmotionalState,
  pulseEmotionalState,
  blendEmotionalStates,
  type EmotionalColorState,
  type EmotionCategory,
} from './emotional-color.js';

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports - Physics & Motion (Pixar Principles)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Physics calculations
  getPhysicsProperties,
  calculateSpring,
  calculatePhysicsAnimation,
  springToCubicBezier,
  // Application helpers
  generatePhysicsCSS,
  applyPhysics,
  getPresetPhysics,
  // Spring animation
  animateSpring,
  // Presets
  PHYSICS_PRESETS,
  // Types
  type Mass,
  type Material,
  type PhysicsProperties,
  type SpringConfig,
  type PhysicsAnimation,
} from './physics.js';

export {
  // Stagger calculations
  calculateStagger,
  applyStagger,
  animateWithOverlap,
  removeOverlap,
  // Observer pattern
  initStaggerObserver,
  observeStagger,
  unobserveStagger,
  destroyStaggerObserver,
  // Presets & CSS
  STAGGER_PRESETS,
  STAGGER_KEYFRAMES,
  generateStaggerCSS,
  // Types
  type StaggerDirection,
  type StaggerPattern,
  type OverlapConfig,
  type StaggerResult,
} from './overlapping-action.js';

export {
  // Core API
  triggerSecondaryActions,
  react,
  // Rule management
  addReactionRule,
  removeReactionRule,
  clearCustomReactions,
  // Auto-binding
  bindSecondaryActions,
  autoBindSecondaryActions,
  // Types
  type PrimaryAction,
  type SecondaryActionType,
  type SecondaryAction,
  type ReactionRule,
  type ReactionContext,
} from './secondary-action.js';

export {
  // Unified API
  micro,
  // Haptics
  triggerHaptic,
  // Individual interactions (for direct use)
  buttonPress,
  buttonRelease,
  buttonHover,
  cardHover,
  cardPress,
  cardRelease,
  inputFocus,
  inputError,
  inputSuccess,
  toggleSnap,
  checkboxCheck,
  sliderGrab,
  sliderTick,
  menuItemHover,
  tooltipAppear,
  modalEntrance,
  modalExit,
  notificationEntrance,
  loadingPulse,
  // Types
  type MicroState,
  type MicroConfig,
  type HapticType,
} from './micro-interactions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports - Phase 2: Polish & Refinement Systems
// ─────────────────────────────────────────────────────────────────────────────

export {
  // State management
  setSpacingConfig,
  setEmotionalContext,
  setDeviceContext,
  // Spacing calculations
  getSpacingBetween,
  getSpacingForRelationship,
  getMinTouchTarget,
  // CSS generation
  applySpacingToRoot,
  generateSpacingCSS,
  // Auto-detection
  detectDeviceContext,
  initContextualSpacing,
  destroyContextualSpacing,
  // Convenience export
  spacing,
  // Types
  type SpacingRelationship,
  type ContentType,
  type EmotionalContext,
  type DeviceContext,
  type SpacingConfig,
  type SpacingResult,
} from './contextual-spacing.js';

export {
  // Core functions
  calculateTypography,
  getTypographyCSS,
  applyTypography,
  // State management
  setSpeakingState,
  setTypographyIntensity,
  setConversationPace,
  setKeyMoment,
  getTypographyState,
  // CSS generation
  generateTypographyCSS,
  // Lifecycle
  initVoiceTypography,
  destroyVoiceTypography,
  // Convenience export
  typography,
  // Types
  type SpeakingState,
  type IntensityLevel,
  type TypographyRole,
  type TypographyState,
  type TypographyValues,
} from './voice-typography.js';

export {
  // Core functions
  generateImperfection,
  applyImperfectionToTransform,
  applyImperfectionToTiming,
  applyImperfectionToEasing,
  applyImperfectionToElement,
  applyImperfectionToGroup,
  // CSS generation
  generateImperfectionCSS,
  // Observer
  initImperfectionObserver,
  // Convenience export
  imperfect,
  // Types
  type ImperfectionType,
  type ImperfectionIntensity,
  type ImperfectionConfig,
  type ImperfectionValues,
} from './imperfection.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TranscendentSystemsConfig {
  /** Enable breath synchronization */
  breathSync?: boolean;

  /** Enable micro-expressions */
  expressions?: boolean;

  /** Enable signature moments */
  moments?: boolean;

  /** Enable emotional color system */
  emotionalColor?: boolean;

  /** Enable physics-based animations (weight, mass, springs) */
  physics?: boolean;

  /** Enable overlapping action (staggered animations) */
  overlappingAction?: boolean;

  /** Enable secondary actions (reactions to primary actions) */
  secondaryAction?: boolean;

  /** Enable micro-interactions (0.1-0.3s magic moments) */
  microInteractions?: boolean;

  /** Contextual spacing; off by default: it overwrites the design-system --space-N scale */
  contextualSpacing?: boolean;

  /** Enable voice typography (type that responds to speaking state) */
  voiceTypography?: boolean;

  /** Enable imperfection engine (organic variation for handcrafted feel) */
  imperfection?: boolean;

  /** Container element for avatar (for expression player binding) */
  avatarContainer?: HTMLElement | null;

  /** Container element for auto-binding secondary actions */
  interactiveContainer?: HTMLElement | null;

  /** Log initialization */
  debug?: boolean;
}

export interface TranscendentSystems {
  isInitialized: boolean;
  config: TranscendentSystemsConfig;
  destroy: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization State
// ─────────────────────────────────────────────────────────────────────────────

let initialized = false;
let currentConfig: TranscendentSystemsConfig = {};
let secondaryActionsCleanup: (() => void) | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Main Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the transcendent animation systems
 *
 * Call this once when the app starts, typically in app.ts after DOM is ready.
 * Systems can be enabled/disabled individually.
 *
 * @example
 * ```typescript
 * import { initTranscendentSystems } from './systems/index.js';
 *
 * // Initialize all systems
 * const systems = initTranscendentSystems({
 *   avatarContainer: document.querySelector('[data-avatar]'),
 * });
 *
 * // Later, when app is destroyed
 * systems.destroy();
 * ```
 */
export function initTranscendentSystems(
  config: TranscendentSystemsConfig = {}
): TranscendentSystems {
  if (initialized) {
    if (config.debug) log.debug('Already initialized');
    return {
      isInitialized: true,
      config: currentConfig,
      destroy: destroyTranscendentSystems,
    };
  }

  // Merge with defaults
  const fullConfig: TranscendentSystemsConfig = {
    breathSync: true,
    expressions: true,
    moments: true,
    emotionalColor: true,
    physics: true,
    overlappingAction: true,
    secondaryAction: true,
    microInteractions: true,
    contextualSpacing: false,
    voiceTypography: true,
    imperfection: true,
    debug: false,
    ...config,
  };

  currentConfig = fullConfig;
  const enabled: string[] = [];

  // Breath sync is the foundation for all animation timing
  if (fullConfig.breathSync) {
    breathSync.initBreathSync();
    enabled.push('breathSync');
  }

  if (fullConfig.expressions) {
    const player = expressionPlayer.getExpressionPlayer();
    if (fullConfig.avatarContainer) {
      player.bindToAvatar(fullConfig.avatarContainer);
    }
    enabled.push('expressions');
  }

  if (fullConfig.moments) {
    momentOrchestrator.getMomentOrchestrator();
    enabled.push('moments');
  }

  if (fullConfig.emotionalColor) {
    emotionalColor.initEmotionalColor();
    enabled.push('emotionalColor');
  }

  // Automatic stagger on scroll-into-view
  if (fullConfig.overlappingAction) {
    overlappingAction.initStaggerObserver();
    enabled.push('overlappingAction');
  }

  if (fullConfig.secondaryAction && fullConfig.interactiveContainer) {
    secondaryActionsCleanup = secondaryAction.autoBindSecondaryActions(
      fullConfig.interactiveContainer
    );
    enabled.push('secondaryAction');
  }

  // Physics and micro-interactions are stateless - available via exported functions

  if (fullConfig.contextualSpacing) {
    contextualSpacing.initContextualSpacing();
    enabled.push('contextualSpacing');
  }

  if (fullConfig.voiceTypography) {
    voiceTypography.initVoiceTypography();
    enabled.push('voiceTypography');
  }

  if (fullConfig.imperfection) {
    imperfection.initImperfectionObserver();
    enabled.push('imperfection');
  }

  initialized = true;
  if (fullConfig.debug) log.debug('All systems initialized', { enabled });

  return {
    isInitialized: true,
    config: fullConfig,
    destroy: destroyTranscendentSystems,
  };
}

/**
 * Destroy all transcendent animation systems
 * Call this when the app is being torn down.
 */
export function destroyTranscendentSystems(): void {
  if (!initialized) return;
  const wasDebug = currentConfig.debug === true;

  breathSync.destroyBreathSync();
  expressionPlayer.destroyExpressionPlayer();
  momentOrchestrator.destroyMomentOrchestrator();
  emotionalColor.destroyEmotionalColor();

  overlappingAction.destroyStaggerObserver();
  secondaryAction.clearCustomReactions();

  if (secondaryActionsCleanup) {
    secondaryActionsCleanup();
    secondaryActionsCleanup = null;
  }

  contextualSpacing.destroyContextualSpacing();
  voiceTypography.destroyVoiceTypography();
  // Imperfection observer doesn't need explicit cleanup (mutation observer)

  initialized = false;
  currentConfig = {};
  if (wasDebug) log.debug('All systems destroyed');
}

/**
 * Check if systems are initialized
 */
export function isTranscendentSystemsInitialized(): boolean {
  return initialized;
}

/**
 * Bind expression player to a new avatar container
 * (useful when avatar DOM element changes)
 */
export function bindToAvatar(container: HTMLElement): void {
  if (!initialized) {
    log.warn('Not initialized, cannot bind to avatar');
    return;
  }
  expressionPlayer.getExpressionPlayer().bindToAvatar(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend Event Bridge
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_EMOTION_MAP: Readonly<Record<string, emotionalColor.EmotionCategory>> = {
  happy: 'joy',
  sad: 'grief',
  anxious: 'concern',
  excited: 'excitement',
  calm: 'calm',
  grateful: 'gratitude',
  vulnerable: 'vulnerability',
  reflective: 'reflection',
  celebratory: 'celebration',
  tender: 'tenderness',
  anticipating: 'anticipation',
};

const KNOWN_EMOTIONS: ReadonlySet<string> = new Set(['neutral', ...Object.values(BACKEND_EMOTION_MAP)]);

const EMOTION_EXPRESSION_MAP: Readonly<Record<string, string>> = {
  joy: 'joy',
  concern: 'concern',
  excitement: 'surprise',
  gratitude: 'understanding',
  recognition: 'recognition',
};

/**
 * Handle emotion event from backend
 * This bridges the backend's emotion detection to our frontend systems.
 */
export function handleEmotionEvent(event: {
  emotion: string;
  intensity?: number;
  trigger?: string;
}): void {
  if (!initialized) return;

  const mappedEmotion = BACKEND_EMOTION_MAP[event.emotion] ?? event.emotion;

  try {
    if (KNOWN_EMOTIONS.has(mappedEmotion)) {
      emotionalColor
        .getEmotionalColor()
        .setEmotion(mappedEmotion as emotionalColor.EmotionCategory, event.intensity);
    }
  } catch (e) {
    log.debug('Emotional color unavailable', e);
  }

  try {
    const player = expressionPlayer.getExpressionPlayer();
    const expressionName = EMOTION_EXPRESSION_MAP[mappedEmotion];
    if (expressionName && player.isReady()) {
      player.play(expressionName);
    }
  } catch (e) {
    log.debug('Expression player unavailable', e);
  }
}

/**
 * Handle signature moment trigger from backend
 */
export function handleMomentTrigger(moment: 'recognition' | 'breakthrough' | 'holding_space' | 'handoff'): void {
  if (!initialized) return;

  const play: Record<typeof moment, () => Promise<boolean>> = {
    recognition: momentOrchestrator.playRecognitionMoment,
    breakthrough: momentOrchestrator.playBreakthroughMoment,
    holding_space: momentOrchestrator.enterHoldingSpace,
    handoff: momentOrchestrator.playHandoffMoment,
  };
  play[moment]().catch((e: unknown) => log.debug(`Moment ${moment} failed`, e));
}

/**
 * Handle user breathing detection from voice analysis
 */
export function handleBreathDetection(phase: number, confidence: number): void {
  if (!initialized) return;

  try {
    breathSync.getBreathSync().syncToDetected(phase, confidence);
  } catch (e) {
    log.debug('Breath sync unavailable', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Custom Properties Reference
// ─────────────────────────────────────────────────────────────────────────────

/*
The transcendent systems set these CSS custom properties:

═══════════════════════════════════════════════════════════════════════════════
PHASE 1: CORE ANIMATION SYSTEMS
═══════════════════════════════════════════════════════════════════════════════

Breath Sync:
  --breath-phase         (0-1)
  --breath-rate-ms       (e.g., "4285ms")
  --breath-depth         (0-1)
  --breath-scale         (e.g., "1.001")
  --breath-opacity       (e.g., "0.97")
  --breath-translate-y   (e.g., "-1.4px")

Emotional Color:
  --emotional-warmth     (-1 to 1)
  --emotional-intensity  (0-1)
  --emotional-depth      (0-1)
  --emotional-glow       (0-1)
  --emotional-state      ("joy", "calm", etc.)
  --emotional-accent     (hsl color)
  --emotional-glow-color (hsla color)
  --emotional-bg-hue-shift     (deg)
  --emotional-bg-sat-shift     (%)
  --emotional-depth-overlay    (rgba)
  --emotional-highlight-brightness (multiplier)

Overlapping Action (Stagger):
  --stagger-index        (element index in parent)
  --stagger-delay        (ms, calculated delay)
  --stagger-depth        (DOM depth from container)
  --stagger-t            (0-1 normalized position)

═══════════════════════════════════════════════════════════════════════════════
PHASE 2: POLISH & REFINEMENT SYSTEMS
═══════════════════════════════════════════════════════════════════════════════

Contextual Spacing:
  --space-0 through --space-10     (pixel values, emotionally scaled)
  --space-0-rem through --space-10-rem  (rem equivalents)
  --spacing-emotion                (current emotion context)
  --spacing-device                 (desktop/tablet/mobile/watch)
  --spacing-scale                  (combined multiplier)
  --min-touch-target               (minimum touch size for device)

Voice Typography (per role):
  --type-transcript-scale          (font size multiplier)
  --type-transcript-weight         (font weight)
  --type-transcript-spacing        (letter-spacing)
  --type-transcript-height         (line-height)
  --type-transcript-opacity        (opacity)
  (Same pattern for: message, insight, label, heading, caption, quote)
  --type-speaking-state            (silent/agent-speaking/user-speaking/thinking)
  --type-intensity                 (whisper/soft/normal/emphasized/strong/exclaimed)
  --type-pace                      (slow/normal/fast)
  --type-key-moment                (0 or 1)

Imperfection Engine:
  --imperfection-timing-offset     (ms, delay variation)
  --imperfection-duration-mult     (duration multiplier)
  --imperfection-path-x            (%, horizontal deviation)
  --imperfection-path-y            (%, vertical deviation)
  --imperfection-amplitude         (scale multiplier)
  --imperfection-phase             (rad, phase offset)
  --imperfection-rotation          (deg, rotation offset)
  --imperfection-opacity           (opacity multiplier)

═══════════════════════════════════════════════════════════════════════════════
USAGE EXAMPLES
═══════════════════════════════════════════════════════════════════════════════

Avatar breathing:
  .avatar-container {
    transform:
      translateY(var(--breath-translate-y))
      scale(var(--breath-scale));
    transition: transform 100ms ease-out;
  }

Emotional glow:
  .avatar-glow {
    box-shadow: 0 0 40px var(--emotional-glow-color);
    opacity: var(--emotional-glow);
  }

Staggered list items:
  .list-item {
    animation-delay: var(--stagger-delay);
    animation-fill-mode: both;
  }

Voice-responsive typography:
  .transcript {
    font-size: calc(1rem * var(--type-transcript-scale, 1));
    font-weight: var(--type-transcript-weight, 400);
    opacity: var(--type-transcript-opacity, 1);
  }

Organic imperfection:
  .card {
    transform:
      rotate(var(--imperfection-rotation))
      scale(var(--imperfection-amplitude));
    transition-delay: var(--imperfection-timing-offset);
  }

Semantic spacing:
  .heading + .body {
    margin-top: var(--space-4);
  }
*/
