/**
 * Ferni UI Components
 * 
 * Re-exports design-system components for use in the web app.
 * This provides a single import point and allows for app-specific extensions.
 * 
 * @example
 * ```typescript
 * import { Avatar, toast, Dialog, celebration } from './ui/components';
 * 
 * const avatar = new Avatar(container, { persona: 'ferni' });
 * toast.success('Saved!');
 * Dialog.open({ title: 'Confirm', body: 'Are you sure?' });
 * celebration.play('bigWin');
 * ```
 */

// =============================================================================
// Design System Component Re-exports
// =============================================================================

export {
  // Avatar
  Avatar,
  createAvatar,
  type AvatarOptions,
  type AvatarState,
  type MicroExpression,
  type PersonaId,

  // Toast
  ToastManager,
  toast,
  type ToastOptions,
  type ToastType,

  // Dialog
  Dialog,
  confirmDialog,
  openDialog,
  type DialogOptions,

  // Celebration
  CelebrationManager,
  celebration,
  type CelebrationOptions,
  type CelebrationType,

  // Content utilities
  getErrorMessage,
  getPersonaIntro,
  getPhrases,
  getRandomPhrase,
  getStreakCelebration,
  getTimeAwareGreeting,

  // Persona utilities
  getAllPersonaIds,
  getPersonaAnimation,
  getPersonaByTrait,
  getPersonaColors,
  getPersonaDuration,
  getPersonaEasing,
  getPersonaKit,
  getPersonaPhrase,
  getPersonaVoice,

  // Sequence utilities
  getAllSequenceIds,
  getAnimation,
  getReducedMotionSequence,
  getSequence,
  getSequenceDuration,
  getSequencePriority,
  getSequenceSteps,
  getSequencesByEmotion,
  isSequenceInterruptible,

  // Responsive utilities
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

  // Brand rules
  applyBrandReplacements,
  brandRules,
  checkBrandCompliance,
  checkContrastRatio,
  getContentTemplate,
  isColorApproved,

  // Initialization
  initFerniComponents,
} from '@design-system/components';

// =============================================================================
// App-Specific Extensions
// =============================================================================

import { 
  Avatar as BaseAvatar, 
  type AvatarOptions as BaseAvatarOptions,
  type AvatarState,
  type MicroExpression,
} from '@design-system/components';

/**
 * Extended Avatar options for the web app
 */
export interface ExtendedAvatarOptions extends BaseAvatarOptions {
  /** Connect to voice state service */
  connectVoiceState?: boolean;
  /** Enable EQ bridge for emotion dispatching */
  enableEQ?: boolean;
}

/**
 * Create an avatar connected to app services
 * 
 * For service integration, use the avatar's public API:
 * - avatar.setState(state) - Set avatar state
 * - avatar.playMicroExpression(expression) - Play micro-expression  
 * - avatar.nod(intensity) - Trigger nod animation
 */
export function createConnectedAvatar(
  container: HTMLElement,
  options: ExtendedAvatarOptions = {}
): BaseAvatar {
  const { connectVoiceState: _connectVoiceState, enableEQ: _enableEQ, ...avatarOptions } = options;

  const avatar = new BaseAvatar(container, avatarOptions);

  // Avatar is returned ready for service connection via its public API
  // Services can call avatar.setState(), avatar.playMicroExpression(), etc.
  return avatar;
}

// =============================================================================
// Quick Toast Helpers (app-specific patterns)
// =============================================================================

import { toast as baseToast } from '@design-system/components';

/**
 * Toast presets for common app scenarios
 */
export const appToast = {
  ...baseToast,

  /** Connection status toasts */
  connected: () => baseToast.success("Connected!"),
  disconnected: () => baseToast.error("Connection lost. Reconnecting..."),
  reconnecting: () => baseToast.info("Reconnecting..."),

  /** Voice-specific toasts */
  listening: () => baseToast.info("Listening..."),
  thinking: () => baseToast.info("Thinking..."),

  /** Subscription toasts */
  upgraded: () => baseToast.success("Welcome to Ferni Pro!"),
  trialStarted: () => baseToast.success("Your free trial has started!"),

  /** Team toasts */
  teamUnlocked: (name: string) => baseToast.success(`${name} joined your team!`),
  handoff: (name: string) => baseToast.info(`Handing off to ${name}...`),
};
