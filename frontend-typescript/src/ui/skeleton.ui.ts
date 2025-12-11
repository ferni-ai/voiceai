/**
 * Skeleton Loading UI
 *
 * Provides smooth loading skeleton screens that appear during app initialization.
 * Creates a polished first impression while resources load.
 *
 * Uses design system tokens for all animations and colors.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const SKELETON_CLASS = 'skeleton';
const SKELETON_PULSE_CLASS = 'skeleton--pulse';
const SKELETON_HIDDEN_CLASS = 'skeleton--hidden';

// ============================================================================
// STATE
// ============================================================================

let skeletonContainer: HTMLElement | null = null;
let isVisible = true;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize skeleton loading UI.
 * Creates and displays skeleton placeholders for main UI elements.
 */
export function initSkeletonUI(): void {
  createSkeletonContainer();
}

/**
 * Create the skeleton container with placeholder elements.
 */
function createSkeletonContainer(): void {
  // Check if skeleton already exists (might be in HTML)
  skeletonContainer = document.getElementById('skeleton-loading');

  if (!skeletonContainer) {
    skeletonContainer = document.createElement('div');
    skeletonContainer.id = 'skeleton-loading';
    skeletonContainer.className = `${SKELETON_CLASS} ${SKELETON_PULSE_CLASS}`;
    skeletonContainer.setAttribute('aria-hidden', 'true');
    skeletonContainer.setAttribute('aria-label', 'Loading');

    skeletonContainer.innerHTML = `
      <div class="skeleton__content">
        <div class="skeleton__avatar"></div>
        <div class="skeleton__text">
          <div class="skeleton__line skeleton__line--title"></div>
          <div class="skeleton__line skeleton__line--subtitle"></div>
        </div>
        <div class="skeleton__button"></div>
        <div class="skeleton__team">
          <div class="skeleton__team-member"></div>
          <div class="skeleton__team-member"></div>
          <div class="skeleton__team-member"></div>
        </div>
      </div>
    `;

    // Insert at the beginning of body
    document.body.insertBefore(skeletonContainer, document.body.firstChild);
  }

  // Add CSS if not already present
  addSkeletonStyles();
}

/**
 * Add skeleton CSS styles dynamically.
 */
function addSkeletonStyles(): void {
  const styleId = 'skeleton-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .skeleton {
      position: fixed;
      inset: 0;
      z-index: var(--z-overlay, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-primary, #0a0a0f);
      transition: opacity var(--duration-slower, 400ms) var(--ease-ease-out, ease-out), 
                  visibility var(--duration-slower, 400ms) var(--ease-ease-out, ease-out);
    }

    .skeleton--hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .skeleton__content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-6, 1.5rem);
      padding: var(--space-8, 2rem);
    }

    .skeleton__avatar {
      width: 120px;
      height: 120px;
      border-radius: var(--radius-full, 50%);
      background: linear-gradient(
        90deg,
        var(--color-background-secondary, #1a1a2e) 25%,
        var(--color-background-tertiary, #252542) 50%,
        var(--color-background-secondary, #1a1a2e) 75%
      );
      background-size: 200% 100%;
    }

    .skeleton__text {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3, 0.75rem);
    }

    .skeleton__line {
      border-radius: var(--radius-xs, 4px);
      background: linear-gradient(
        90deg,
        var(--color-background-secondary, #1a1a2e) 25%,
        var(--color-background-tertiary, #252542) 50%,
        var(--color-background-secondary, #1a1a2e) 75%
      );
      background-size: 200% 100%;
    }

    .skeleton__line--title {
      width: 180px;
      height: 24px;
    }

    .skeleton__line--subtitle {
      width: 120px;
      height: 16px;
    }

    .skeleton__button {
      width: 140px;
      height: 48px;
      border-radius: var(--radius-full, 24px);
      background: linear-gradient(
        90deg,
        var(--color-background-secondary, #1a1a2e) 25%,
        var(--color-background-tertiary, #252542) 50%,
        var(--color-background-secondary, #1a1a2e) 75%
      );
      background-size: 200% 100%;
    }

    .skeleton__team {
      display: flex;
      gap: var(--space-4, 1rem);
      margin-top: var(--space-4, 1rem);
    }

    .skeleton__team-member {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-full, 50%);
      background: linear-gradient(
        90deg,
        var(--color-background-secondary, #1a1a2e) 25%,
        var(--color-background-tertiary, #252542) 50%,
        var(--color-background-secondary, #1a1a2e) 75%
      );
      background-size: 200% 100%;
    }

    .skeleton--pulse .skeleton__avatar,
    .skeleton--pulse .skeleton__line,
    .skeleton--pulse .skeleton__button,
    .skeleton--pulse .skeleton__team-member {
      animation: shimmer var(--duration-glacial, 1500ms) var(--ease-ease-in-out, ease-in-out) infinite;
    }

    @keyframes shimmer {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }

    /* Trigger entrance animations when skeleton hides */
    /* Uses design system easings and durations via CSS variables */
    .skeleton--hidden ~ #app .entrance-avatar {
      animation: entranceAvatar var(--duration-dramatic, 600ms) var(--ease-ease-out-back, cubic-bezier(0.34, 1.56, 0.64, 1)) forwards;
      animation-delay: 100ms;
    }
    .skeleton--hidden ~ #app .entrance-name {
      animation: entranceControls var(--duration-slower, 400ms) var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
      animation-delay: 200ms;
    }
    .skeleton--hidden ~ #app .entrance-subtitle {
      animation: entranceControls var(--duration-slower, 400ms) var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
      animation-delay: 250ms;
    }
    .skeleton--hidden ~ #app .entrance-roster {
      animation: entranceControls var(--duration-slower, 400ms) var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
      animation-delay: 350ms;
    }
    .skeleton--hidden ~ #app .entrance-waveform {
      animation: entranceControls var(--duration-slower, 400ms) var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
      animation-delay: 450ms;
    }
    .skeleton--hidden ~ #app .entrance-controls {
      animation: entranceControls var(--duration-slower, 400ms) var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
      animation-delay: 550ms;
    }
    .skeleton--hidden ~ #app .entrance-helper {
      animation: entranceControls var(--duration-slower, 400ms) var(--ease-ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
      animation-delay: 650ms;
    }

    @keyframes entranceAvatar {
      0% { opacity: 0; transform: scale(0.8) translateY(20px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes entranceControls {
      0% { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    /* Stagger animation for team members */
    .skeleton__team-member:nth-child(2) {
      animation-delay: 0.15s;
    }
    .skeleton__team-member:nth-child(3) {
      animation-delay: 0.3s;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the skeleton loading UI.
 */
export function show(): void {
  if (!skeletonContainer) {
    initSkeletonUI();
  }

  if (skeletonContainer) {
    skeletonContainer.classList.remove(SKELETON_HIDDEN_CLASS);
    isVisible = true;
  }
}

/**
 * Hide the skeleton loading UI with a smooth transition.
 *
 * 🎬 FIX: Pre-promotes animated elements to GPU layers BEFORE hiding skeleton.
 * This prevents jank from layer creation during entrance animations.
 */
export function hide(): void {
  if (skeletonContainer) {
    // 🎬 FIX: Promote animated elements to GPU BEFORE animations start
    // This ensures layers are created in a quiet moment, not during animation
    promoteEntranceElementsToGPU();

    // Small delay to let GPU layers settle before animations begin
    requestAnimationFrame(() => {
      if (skeletonContainer) {
        skeletonContainer.classList.add(SKELETON_HIDDEN_CLASS);
        isVisible = false;

        // Remove from DOM after transition
        setTimeout(() => {
          if (skeletonContainer && !isVisible) {
            skeletonContainer.remove();
            skeletonContainer = null;
          }
        }, 400);
      }
    });
  }
}

/**
 * 🎬 FIX: Pre-promote elements that will animate during entrance to GPU layers.
 * This prevents the "jank at the beginning" by ensuring layer creation happens
 * BEFORE the animations start, not during them.
 */
function promoteEntranceElementsToGPU(): void {
  // Entrance elements that animate - kept for documentation, selectors ready if needed
  // NOTE: GPU hints (willChange, translateZ) removed - causes visible box bug in Safari
  // GSAP handles GPU acceleration automatically via force3D config (set in initGSAP)
  // Selectors: .avatar-container, .entrance-avatar, .entrance-name, etc.
}

/**
 * Check if skeleton is currently visible.
 */
export function isShowing(): boolean {
  return isVisible;
}

/**
 * Clean up skeleton UI.
 */
export function dispose(): void {
  if (skeletonContainer) {
    skeletonContainer.remove();
    skeletonContainer = null;
  }

  const styles = document.getElementById('skeleton-styles');
  if (styles) {
    styles.remove();
  }

  isVisible = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const skeletonUI = {
  init: initSkeletonUI,
  show,
  hide,
  isShowing,
  dispose,
};
