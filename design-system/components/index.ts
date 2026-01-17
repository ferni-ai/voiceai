/**
 * Ferni Design System Components
 *
 * Brand-compliant UI components implementing the "Better than Human"
 * design philosophy.
 *
 * All components:
 * - Use design tokens (never hardcoded values)
 * - Follow accessibility guidelines (WCAG AA)
 * - Support reduced motion preferences
 * - Include HMR cleanup
 */

// Avatar - Living, breathing persona representation
export { Avatar, createAvatar } from './Avatar.js';
export type { AvatarOptions, AvatarState, MicroExpression, PersonaId } from './Avatar.js';

// Toast - Centered pill notifications
export { ToastManager, toast } from './Toast.js';
export type { ToastOptions, ToastType } from './Toast.js';

// Dialog - Centered modal dialogs
export { Dialog, confirmDialog, openDialog } from './Dialog.js';
export type { DialogOptions } from './Dialog.js';

// Celebration - Achievement celebrations
export { CelebrationManager, celebration } from './Celebration.js';
export type { CelebrationOptions, CelebrationType } from './Celebration.js';

// Input - Text input with validation
export { Input, createInput } from './Input.js';
export type { InputOptions, InputType, InputSize, InputState } from './Input.js';

// Card - Content container
export { Card, createCard } from './Card.js';
export type { CardOptions, CardVariant, CardSize } from './Card.js';

// Spinner - Loading indicator
export { Spinner, createSpinner, showLoadingOverlay } from './Spinner.js';
export type { SpinnerOptions, SpinnerSize, SpinnerVariant } from './Spinner.js';

// Badge - Status indicator
export { Badge, createBadge } from './Badge.js';
export type { BadgeOptions, BadgeVariant, BadgeSize } from './Badge.js';

// Tooltip - Hover hint
export { Tooltip, attachTooltip, showTooltipAt } from './Tooltip.js';
export type { TooltipOptions, TooltipPosition } from './Tooltip.js';

// Textarea - Multi-line text input
export { Textarea, createTextarea } from './Textarea.js';
export type { TextareaOptions, TextareaSize } from './Textarea.js';

// Select - Dropdown select
export { Select, createSelect } from './Select.js';
export type { SelectOptions, SelectOption, SelectSize } from './Select.js';

// Switch - Toggle switch
export { Switch, createSwitch } from './Switch.js';
export type { SwitchOptions, SwitchSize } from './Switch.js';

// Voice Indicator - Voice state feedback
export { VoiceIndicator, createVoiceIndicator } from './VoiceIndicator.js';
export type { VoiceIndicatorOptions, VoiceState, TurnOwner } from './VoiceIndicator.js';

// ============================================================================
// Icons
// ============================================================================

export {
  renderIcon,
  createIconElement,
  getIcon,
  getIconsByCategory,
  searchIcons,
  allIcons,
  voiceIcons,
  aiIcons,
  emotionIcons,
  personaIcons,
  actionIcons,
  statusIcons,
  navigationIcons,
  ICON_SIZES,
} from '../icons/index.js';
export type { IconDefinition, IconSize, IconCategory } from '../icons/index.js';

// ============================================================================
// Therapeutic Animations
// ============================================================================

export {
  playTherapeuticAnimation,
  getTherapeuticAnimation,
  getAnimationsByIntent,
  createBreathAnimation,
  getAnimationForEmotion,
  BREATH_PATTERNS,
  groundingAnimations,
  calmingAnimations,
  energizingAnimations,
  centeringAnimations,
  releasingAnimations,
  allTherapeuticAnimations,
} from '../animations/therapeutic.js';
export type { TherapeuticAnimation, TherapeuticIntent, BreathCycle } from '../animations/therapeutic.js';

// ============================================================================
// Emotion Utilities
// ============================================================================

export {
  getEmotionConfig,
  getEmotionWithIntensity,
  adjustColorForEmotion,
  getEmotionDuration,
  getEmotionEasing,
  getBreathingRate,
  getEmotionFontWeight,
  getEmotionLetterSpacing,
  getEmotionTransitionDuration,
  interpolateEmotions,
  generateEmotionCSSVariables,
  applyEmotionToElement,
} from '../utils/emotion-utils.js';
export type { EmotionState, IntensityLevel, EmotionConfig, EmotionTransition } from '../utils/emotion-utils.js';

// ============================================================================
// Accessibility Utilities
// ============================================================================

export {
  getLuminance,
  getContrastRatio,
  checkContrast,
  suggestAccessibleColor,
  getFocusableElements,
  trapFocus,
  createFocusRing,
  getAccessibleName,
  announce,
  createScreenReaderText,
  prefersReducedMotion,
  onReducedMotionChange,
  getAccessibleDuration,
  prefersHighContrast,
  handleArrowNavigation,
  runA11yAudit,
} from '../a11y/index.js';
export type { ContrastResult, FocusableElement, A11yAuditResult, A11yIssue } from '../a11y/index.js';

// ============================================================================
// Re-exports from utilities
// ============================================================================

// Content templates
export {
  getErrorMessage,
  getPersonaIntro,
  getPhrases,
  getRandomPhrase,
  getStreakCelebration,
  getTimeAwareGreeting,
} from '../dist/content-utils.js';

// Persona utilities
export {
  getAllPersonaIds,
  getPersonaAnimation,
  getPersonaByTrait,
  getPersonaColors,
  getPersonaDuration,
  getPersonaEasing,
  getPersonaKit,
  getPersonaPhrase,
  getPersonaVoice,
} from '../dist/persona-utils.js';

// Sequence utilities
export {
  getAllSequenceIds,
  getAnimation,
  getReducedMotionSequence,
  getSequence,
  getSequenceDuration,
  getSequencePriority,
  getSequenceSteps,
  getSequencesByEmotion,
  isSequenceInterruptible,
} from '../dist/sequence-utils.js';

// Responsive utilities
export {
  getBreakpoint,
  getComponentBehavior,
  getCurrentBreakpoint,
  getFluidTypography,
  getMediaQuery,
  getTouchTarget,
  getTypographyScale,
  isDesktop,
  isMobile,
  isTablet,
} from '../dist/responsive-utils.js';

// Brand rules
export {
  applyBrandReplacements,
  brandRules,
  checkBrandCompliance,
  checkContrastRatio,
  getContentTemplate,
  isColorApproved,
} from '../api/brand-rules.js';

// ============================================================================
// Convenience initialization
// ============================================================================

/**
 * Initialize all Ferni components
 * Call this once when your app loads
 */
export function initFerniComponents(): void {
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    document.documentElement.setAttribute('data-reduced-motion', 'true');
  }

  // Add persona data attribute if not set
  if (!document.body.hasAttribute('data-persona')) {
    document.body.setAttribute('data-persona', 'ferni');
  }

  console.log('🌿 Ferni Design System initialized');
}
