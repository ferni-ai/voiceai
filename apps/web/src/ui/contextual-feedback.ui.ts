/**
 * Contextual Feedback UI
 *
 * Bottom-docked floating feedback component that appears during natural
 * conversation pauses to collect micro-feedback on how the conversation
 * is landing.
 *
 * Design principles:
 * - Floats at the bottom of the screen as a pill-shaped dock
 * - Stays out of the way of main content (conversation, waveform)
 * - Uses SVG icons (no emojis per brand guidelines)
 * - Auto-hides after timeout if no interaction
 * - Sends reaction via data channel to backend
 * - Minimal, non-intrusive, accessible
 *
 * @module ui/contextual-feedback
 */

import { appState } from '../state/app.state.js';
import { connectionService } from '../services/connection.service.js';
import { createLogger } from '../utils/logger.js';
import { DURATION } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('ContextualFeedbackUI');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type FeedbackReaction = 'resonated' | 'helpful' | 'too_much' | 'off_track' | 'skipped';

export interface FeedbackPromptEvent {
  type: 'feedback_prompt';
  feedbackId: string;
  trigger: string;
  reactions: FeedbackReaction[];
  autoHideMs: number;
  timestamp: number;
}

interface ReactionConfig {
  id: FeedbackReaction;
  icon: string;
  label: string;
  color: string;
}

// ============================================================================
// SVG ICONS (Lucide-style, 2px stroke)
// ============================================================================

function svg(content: string): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

const REACTION_ICONS: Record<string, string> = {
  // Heart with spark - this resonated
  resonated: svg(`
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <path d="m12 13 1-1 1 1"/>
  `),

  // Lightbulb - helpful insight
  helpful: svg(`
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6"/>
    <path d="M10 22h4"/>
  `),

  // Wave hand - too much, slow down
  too_much: svg(`
    <path d="M11.5 9.5a2.5 2.5 0 0 1 5 0v1a2.5 2.5 0 0 1-5 0v-1Z"/>
    <path d="M8 12.5a2.5 2.5 0 0 1 5 0v1"/>
    <path d="M14 14v.5"/>
    <path d="M14 17v.5"/>
    <path d="M8 16.5a2.5 2.5 0 0 1 5 0V18a4 4 0 0 1-4 4H5"/>
  `),

  // Compass - off track
  off_track: svg(`
    <circle cx="12" cy="12" r="10"/>
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
  `),
};

// ============================================================================
// REACTION CONFIGS
// ============================================================================

const REACTIONS: ReactionConfig[] = [
  {
    id: 'resonated',
    icon: REACTION_ICONS.resonated ?? '',
    label: 'This landed',
    color: 'var(--persona-primary, #4a6741)',
  },
  {
    id: 'helpful',
    icon: REACTION_ICONS.helpful ?? '',
    label: 'Helpful',
    color: 'var(--color-semantic-success, #4a6741)',
  },
  {
    id: 'too_much',
    icon: REACTION_ICONS.too_much ?? '',
    label: 'Too much',
    color: 'var(--color-semantic-warning, #a6854a)',
  },
  {
    id: 'off_track',
    icon: REACTION_ICONS.off_track ?? '',
    label: 'Off track',
    color: 'var(--color-text-muted, #8a7a6a)',
  },
];

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isInitialized = false;
let currentFeedbackId: string | null = null;
let promptShownAt: number = 0;
let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initContextualFeedbackUI(): void {
  if (isInitialized) return;

  // HMR cleanup
  cleanupOrphanedElements();

  injectStyles();
  createContainer();
  setupMessageHandler();

  isInitialized = true;
  log.info('Contextual Feedback UI initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.contextual-feedback').forEach((el) => el.remove());
}

// ============================================================================
// CSS INJECTION
// ============================================================================

function injectStyles(): void {
  const styleId = 'contextual-feedback-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ========================================
       CONTEXTUAL FEEDBACK - Bottom Floating Dock
       
       Positioned at the bottom of the screen as a 
       floating pill, keeping it out of the way of
       main content while remaining accessible.
       ======================================== */

    .contextual-feedback {
      position: fixed;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 100px);
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      z-index: var(--z-floating, 20);
      pointer-events: none;
      opacity: 0;
      transition:
        opacity var(--duration-normal, 200ms) var(--ease-out-expo),
        transform var(--duration-normal, 200ms) var(--ease-spring);
    }

    .contextual-feedback--visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }

    .contextual-feedback__bubble {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      background: var(--glass-background-elevated, rgba(255, 255, 255, 0.15));
      backdrop-filter: blur(var(--glass-blur-heavy, 20px));
      -webkit-backdrop-filter: blur(var(--glass-blur-heavy, 20px));
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.12));
    }

    .contextual-feedback__reactions {
      display: flex;
      gap: var(--space-2xs, 2px);
    }

    .contextual-feedback__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: var(--radius-full, 9999px);
      background: transparent;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      cursor: pointer;
      transition:
        background var(--duration-fast, 150ms) var(--ease-out-expo),
        color var(--duration-fast, 150ms) var(--ease-out-expo),
        transform var(--duration-fast, 150ms) var(--ease-spring);
    }

    .contextual-feedback__btn:hover,
    .contextual-feedback__btn:focus-visible {
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.15));
      color: var(--color-text-primary, #ffffff);
      transform: scale(1.1);
    }

    .contextual-feedback__btn:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    .contextual-feedback__btn:active {
      transform: scale(0.95);
    }

    /* Selected state */
    .contextual-feedback__btn--selected {
      background: var(--persona-primary, #4a6741);
      color: white;
      transform: scale(1.15);
    }

    /* Divider between reactions and skip */
    .contextual-feedback__divider {
      width: 1px;
      height: 20px;
      background: var(--glass-border, rgba(255, 255, 255, 0.15));
      margin: 0 var(--space-2xs, 2px);
    }

    /* Skip/dismiss button */
    .contextual-feedback__skip {
      font-size: 10px;
      font-weight: 600;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      border: none;
      border-radius: var(--radius-full, 9999px);
      background: transparent;
      cursor: pointer;
      transition: 
        color var(--duration-fast, 150ms),
        background var(--duration-fast, 150ms);
    }

    .contextual-feedback__skip:hover {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.1));
    }

    /* Feedback sent confirmation */
    .contextual-feedback__confirmation {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      color: var(--persona-primary, #4a6741);
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 500;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .contextual-feedback {
        transition: opacity var(--duration-fast, 150ms);
      }

      .contextual-feedback__btn {
        transition: none;
      }
    }

    /* Mobile adjustments */
    @media (max-width: 480px) {
      .contextual-feedback {
        bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
      }

      .contextual-feedback__btn {
        width: 32px;
        height: 32px;
      }

      .contextual-feedback__btn svg {
        width: 16px;
        height: 16px;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// DOM CREATION
// ============================================================================

function createContainer(): void {
  container = document.createElement('div');
  container.className = 'contextual-feedback';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-label', 'How was that?');

  const bubble = document.createElement('div');
  bubble.className = 'contextual-feedback__bubble';

  const reactionsDiv = document.createElement('div');
  reactionsDiv.className = 'contextual-feedback__reactions';

  REACTIONS.forEach((reaction) => {
    const btn = document.createElement('button');
    btn.className = 'contextual-feedback__btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('title', reaction.label);
    btn.setAttribute('aria-label', reaction.label);
    btn.dataset.reactionId = reaction.id;
    btn.innerHTML = reaction.icon;

    btn.addEventListener('click', () => sendReaction(reaction.id));

    reactionsDiv.appendChild(btn);
  });

  // Divider between reactions and skip
  const divider = document.createElement('div');
  divider.className = 'contextual-feedback__divider';

  // Skip button
  const skipBtn = document.createElement('button');
  skipBtn.className = 'contextual-feedback__skip';
  skipBtn.setAttribute('type', 'button');
  skipBtn.textContent = 'Skip';
  skipBtn.addEventListener('click', () => dismissPrompt());

  bubble.appendChild(reactionsDiv);
  bubble.appendChild(divider);
  bubble.appendChild(skipBtn);
  container.appendChild(bubble);

  // Append to body for fixed positioning
  document.body.appendChild(container);
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

function setupMessageHandler(): void {
  // Listen for feedback_prompt events from backend
  window.addEventListener('ferni:data-message', ((event: CustomEvent) => {
    const message = event.detail;
    if (message?.type === 'feedback_prompt') {
      handleFeedbackPrompt(message as FeedbackPromptEvent);
    }
  }) as EventListener);
}

function handleFeedbackPrompt(event: FeedbackPromptEvent): void {
  log.info({ feedbackId: event.feedbackId, trigger: event.trigger }, 'Received feedback prompt');

  // Only show if connected
  if (appState.get('connection') !== 'connected') {
    log.debug('Not connected, skipping feedback prompt');
    return;
  }

  currentFeedbackId = event.feedbackId;
  promptShownAt = Date.now();

  show();

  // Set auto-hide timer
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
  }
  autoHideTimer = trackedTimeout(() => {
    if (currentFeedbackId === event.feedbackId) {
      dismissPrompt();
    }
  }, event.autoHideMs);
}

// ============================================================================
// VISIBILITY
// ============================================================================

export function show(): void {
  if (!container) {
    // Try to create if not exists (late initialization)
    createContainer();
  }
  if (!container) return;

  container.classList.add('contextual-feedback--visible');
}

export function hide(): void {
  if (!container) return;

  container.classList.remove('contextual-feedback--visible');

  // Reset button states after animation completes
  trackedTimeout(() => {
    container?.querySelectorAll('.contextual-feedback__btn--selected').forEach((btn) => {
      btn.classList.remove('contextual-feedback__btn--selected');
    });
  }, DURATION.NORMAL);
}

function dismissPrompt(): void {
  if (currentFeedbackId) {
    // Send skip to backend
    sendReactionToBackend('skipped');
  }
  currentFeedbackId = null;
  hide();
}

// ============================================================================
// REACTION HANDLING
// ============================================================================

function sendReaction(reaction: FeedbackReaction): void {
  if (!currentFeedbackId) return;

  // Visual feedback
  const btn = container?.querySelector(`[data-reaction-id="${reaction}"]`);
  if (btn) {
    btn.classList.add('contextual-feedback__btn--selected');
  }

  sendReactionToBackend(reaction);

  // Brief delay to show selection, then hide
  trackedTimeout(() => {
    currentFeedbackId = null;
    hide();
  }, DURATION.SLOW);
}

function sendReactionToBackend(reaction: FeedbackReaction): void {
  const room = connectionService.getRoom();
  if (!room?.localParticipant) {
    log.warn('Cannot send reaction - not connected');
    return;
  }

  const responseTimeMs = Date.now() - promptShownAt;

  const message = JSON.stringify({
    type: 'user_feedback',
    feedbackId: currentFeedbackId,
    reaction,
    responseTimeMs,
    timestamp: Date.now(),
  });

  void room.localParticipant.publishData(new TextEncoder().encode(message), {
    reliable: true,
  });

  log.info({ feedbackId: currentFeedbackId, reaction, responseTimeMs }, 'Feedback sent');

  // Clear auto-hide timer
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  _clearAllTimeouts();

  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  if (container) {
    container.remove();
    container = null;
  }

  currentFeedbackId = null;
  isInitialized = false;
  log.info('Contextual Feedback UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const contextualFeedbackUI = {
  init: initContextualFeedbackUI,
  show,
  hide,
  dispose,
};

export default contextualFeedbackUI;
