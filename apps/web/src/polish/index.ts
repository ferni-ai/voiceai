/**
 * Ferni Polish System
 *
 * Professional-grade UI polish utilities that elevate the experience
 * from "works" to "delightful".
 *
 * "The difference between a $1M product and a $1B product is polish."
 *
 * @module @ferni/polish
 */

// ============================================================================
// EXPORTS
// ============================================================================

// View Transitions - Modern page transitions
export {
  withViewTransition,
  transitionPersonaSwitch,
  transitionModalOpen,
  transitionModalClose,
  transitionNavigate,
  setTransitionName,
  clearTransitionName,
  withTransitionName,
  supportsViewTransitions,
  initViewTransitions,
  injectViewTransitionStyles,
} from '../utils/view-transitions.js';

// Scroll Reveal - Content fades in as it enters viewport
export {
  scrollReveal,
  initScrollReveal,
  observe as observeScrollReveal,
  observeStaggered,
  unobserve as unobserveScrollReveal,
  unobserveAll,
  forceReveal,
  autoReveal,
  disposeScrollReveal,
} from '../ui/scroll-reveal.ui.js';

// Button Polish - Tactile button feedback
export {
  buttonPolish,
  initButtonPolish,
  polishButton,
  polishAllButtons,
  setButtonLoading,
  disposeButtonPolish,
} from '../ui/button-polish.ui.js';

// Connection Quality - Real-time WebRTC quality indicator
export {
  connectionQuality,
  initConnectionQuality,
  updateConnectionStats,
  setQuality,
  startAutoUpdate,
  stopAutoUpdate,
  getCurrentQuality,
  disposeConnectionQuality,
} from '../ui/connection-quality.ui.js';

// Command Palette - ⌘K quick actions
export {
  commandPalette,
  initCommandPalette,
  open as openCommandPalette,
  close as closeCommandPalette,
  toggle as toggleCommandPalette,
  registerCommand,
  unregisterCommand,
  isCommandPaletteOpen,
  disposeCommandPalette,
} from '../ui/command-palette.ui.js';

// Keyboard Shortcuts - Professional keyboard navigation
export {
  keyboardShortcuts,
  initKeyboardShortcuts,
  showShortcutsPanel,
  hideShortcutsPanel,
  registerShortcut,
  unregisterShortcut,
  getShortcuts,
  isShortcutsPanelOpen,
  disposeKeyboardShortcuts,
} from '../ui/keyboard-shortcuts.ui.js';

// Form Polish - Material Design 3 form fields
export {
  enhanceFormField,
  showFieldError,
  clearFieldError,
  showFieldSuccess,
  clearFieldSuccess,
  autoEnhanceFormFields,
  createFormField,
  disposeFormPolish,
} from '../ui/form-polish.ui.js';

// Touch Targets - WCAG 2.5.5 compliance
export {
  MIN_TOUCH_SIZE,
  RECOMMENDED_TOUCH_SIZE,
  auditTouchTargets,
  logAuditResults,
  injectTouchTargetStyles,
  autoFixTouchTargets,
  debugTouchTargets,
  initTouchTargets,
  disposeTouchTargetUtils,
} from '../utils/touch-targets.js';

// ARIA Relationships - Accessibility utilities
export {
  generateAriaId,
  ensureId,
  connectLabel,
  connectDescription,
  connectControls,
  createExpandableRelationship,
  getLiveRegion,
  announce,
  createStatusRegion,
  getFocusableElements,
  createRovingTabindex,
  setupDialogAria,
  setMainContentHidden,
  cleanup as cleanupAriaUtils,
} from '../utils/aria-relationships.js';

// Loading Orchestrator - Choreographed loading states
export {
  startLoading,
  completeLoading,
  updateProgress,
  updateMessage,
  getLoadingState,
  isLoading,
  onLoadingChange,
  injectSkeletonStyles,
  createSkeleton,
  showSkeleton,
  withLoading,
  createLoadingButton,
  createProgressIndicator,
  dispose as disposeLoadingOrchestrator,
} from '../services/loading-orchestrator.service.js';

// Types
export type { ViewTransitionOptions } from '../utils/view-transitions.js';
export type { ScrollRevealOptions, RevealDirection } from '../ui/scroll-reveal.ui.js';
export type { ButtonPolishOptions, ButtonVariant } from '../ui/button-polish.ui.js';
export type {
  ConnectionQuality,
  ConnectionStats,
  QualityIndicatorOptions,
} from '../ui/connection-quality.ui.js';
export type { Command, CommandPaletteOptions } from '../ui/command-palette.ui.js';
export type { Shortcut } from '../ui/keyboard-shortcuts.ui.js';
export type { FormFieldConfig } from '../ui/form-polish.ui.js';
export type { TouchTargetViolation, TouchTargetAuditResult } from '../utils/touch-targets.js';
export type { LoadingState, LoadingTask, LoadingOptions } from '../services/loading-orchestrator.service.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

import { createLogger } from '../utils/logger.js';

const log = createLogger('Polish');

/**
 * Initialize all polish systems at once
 *
 * @example
 * ```typescript
 * import { initPolish } from './polish';
 *
 * // In app startup
 * initPolish();
 * ```
 */
export function initPolish(options: {
  viewTransitions?: boolean;
  scrollReveal?: boolean;
  buttonPolish?: boolean;
  connectionQuality?: boolean;
  commandPalette?: boolean;
  keyboardShortcuts?: boolean;
  formPolish?: boolean;
  touchTargets?: boolean;
  loadingOrchestrator?: boolean;
} = {}): void {
  const {
    viewTransitions = true,
    scrollReveal = true,
    buttonPolish = true,
    connectionQuality = false, // Opt-in (requires LiveKit integration)
    commandPalette = true,
    keyboardShortcuts = true,
    formPolish = true,
    touchTargets = true,
    loadingOrchestrator = true,
  } = options;

  log.info('Initializing polish systems...');

  if (viewTransitions) {
    import('../utils/view-transitions.js').then(({ initViewTransitions }) => {
      initViewTransitions();
    });
  }

  if (scrollReveal) {
    import('../ui/scroll-reveal.ui.js').then(({ initScrollReveal }) => {
      initScrollReveal();
    });
  }

  if (buttonPolish) {
    import('../ui/button-polish.ui.js').then(({ initButtonPolish }) => {
      initButtonPolish();
    });
  }

  if (connectionQuality) {
    import('../ui/connection-quality.ui.js').then(({ initConnectionQuality }) => {
      initConnectionQuality();
    });
  }

  if (commandPalette) {
    import('../ui/command-palette.ui.js').then(({ initCommandPalette }) => {
      initCommandPalette();
    });
  }

  if (keyboardShortcuts) {
    import('../ui/keyboard-shortcuts.ui.js').then(({ initKeyboardShortcuts }) => {
      initKeyboardShortcuts();
    });
  }

  if (formPolish) {
    import('../ui/form-polish.ui.js').then(({ autoEnhanceFormFields }) => {
      // Auto-enhance after DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => autoEnhanceFormFields());
      } else {
        autoEnhanceFormFields();
      }
    });
  }

  if (touchTargets) {
    import('../utils/touch-targets.js').then(({ initTouchTargets }) => {
      initTouchTargets();
    });
  }

  if (loadingOrchestrator) {
    import('../services/loading-orchestrator.service.js').then(({ injectSkeletonStyles }) => {
      injectSkeletonStyles();
    });
  }

  log.info('Polish systems initialized');
}

/**
 * Dispose all polish systems
 */
export function disposePolish(): void {
  import('../utils/view-transitions.js'); // No dispose needed
  import('../ui/scroll-reveal.ui.js').then(({ disposeScrollReveal }) => disposeScrollReveal());
  import('../ui/button-polish.ui.js').then(({ disposeButtonPolish }) => disposeButtonPolish());
  import('../ui/connection-quality.ui.js').then(({ disposeConnectionQuality }) => disposeConnectionQuality());
  import('../ui/command-palette.ui.js').then(({ disposeCommandPalette }) => disposeCommandPalette());
  import('../ui/keyboard-shortcuts.ui.js').then(({ disposeKeyboardShortcuts }) => disposeKeyboardShortcuts());
  import('../ui/form-polish.ui.js').then(({ disposeFormPolish }) => disposeFormPolish());
  import('../utils/touch-targets.js').then(({ disposeTouchTargetUtils }) => disposeTouchTargetUtils());
  import('../utils/aria-relationships.js').then(({ cleanup }) => cleanup());
  import('../services/loading-orchestrator.service.js').then(({ dispose }) => dispose());

  log.info('Polish systems disposed');
}

