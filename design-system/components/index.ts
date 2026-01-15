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
