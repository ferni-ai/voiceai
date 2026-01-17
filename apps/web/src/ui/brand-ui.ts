/**
 * Brand UI Components
 * 
 * Central export for all brand-related UI components.
 * 
 * @module @ferni/brand-ui
 */

// ============================================================================
// CELEBRATION
// ============================================================================

export {
  CelebrationUI,
  getCelebrationUI,
  resetCelebrationUI,
  celebrate,
  smallWin,
  bigWin,
  milestone,
  streak,
  teamUnlock,
  type CelebrationType,
  type CelebrationConfig,
} from './celebration.ui.js';

// ============================================================================
// EMPTY STATES
// ============================================================================

export {
  EmptyStateUI,
  getEmptyStateUI,
  type EmptyStateType,
  type EmptyStateConfig,
} from './empty-state.ui.js';

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

export {
  getToastManager,
  resetToastManager,
  showToast,
  dismissToast,
  dismissAllToasts,
  toast,
  type ToastType,
  type ToastConfig,
} from './whisper.ui.js';

// ============================================================================
// LOADING SKELETONS
// ============================================================================

export {
  SkeletonUI,
  getSkeletonUI,
  skeleton,
  type SkeletonVariant,
  type SkeletonConfig,
} from './loading-skeleton.ui.js';

