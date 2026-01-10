/**
 * Quick Reactions UI
 *
 * A floating panel with quick reaction buttons that users can tap
 * during conversation to send emotional feedback to Ferni.
 *
 * Design principles:
 * - Uses SVG icons (no emojis per brand guidelines)
 * - Floating pill with subtle glass effect
 * - Reactions send data channel messages to backend
 * - Visual feedback on send (warmth glow)
 *
 * Security note: innerHTML is used here with ONLY hardcoded SVG icons
 * defined in this file - no user input is rendered as HTML.
 *
 * @module ui/quick-reactions
 */

import { appState } from '../state/app.state.js';
import { connectionService } from '../services/connection.service.js';
import { createLogger } from '../utils/logger.js';
import { DURATION, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('QuickReactionsUI');
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface Reaction {
  id: string;
  icon: string;
  label: string;
  /** Optional sound effect to play */
  sound?: string;
}

// ============================================================================
// SVG ICONS (Lucide-style, 2px stroke)
// These are hardcoded trusted content, safe for innerHTML
// ============================================================================

function svg(content: string): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

const REACTION_ICONS = {
  // Thumbs up - agreement/acknowledgement
  thumbsUp: svg(`
    <path d="M7 10v12"/>
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
  `),

  // Heart - love/appreciation
  heart: svg(`
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  `),

  // Sparkles - excited/amazed
  sparkles: svg(`
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/>
    <path d="M19 17v4"/>
    <path d="M3 5h4"/>
    <path d="M17 19h4"/>
  `),

  // Lightbulb - insight/aha moment
  lightbulb: svg(`
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6"/>
    <path d="M10 22h4"/>
  `),

  // Smile - happy/amused
  smile: svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  `),

  // Hands clapping - applause
  clap: svg(`
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
  `),
};

// ============================================================================
// REACTIONS LIST
// ============================================================================

const REACTIONS: Reaction[] = [
  { id: 'thumbs_up', icon: REACTION_ICONS.thumbsUp, label: 'Got it' },
  { id: 'heart', icon: REACTION_ICONS.heart, label: 'Love this' },
  { id: 'sparkles', icon: REACTION_ICONS.sparkles, label: 'Amazing' },
  { id: 'lightbulb', icon: REACTION_ICONS.lightbulb, label: 'Aha!' },
  { id: 'smile', icon: REACTION_ICONS.smile, label: 'Haha' },
  { id: 'clap', icon: REACTION_ICONS.clap, label: 'Applause' },
];

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initQuickReactionsUI(): void {
  if (isInitialized) return;

  injectStyles();
  createContainer();
  setupSubscriptions();

  isInitialized = true;
  log.info('Quick Reactions UI initialized');
}

// ============================================================================
// CSS INJECTION
// ============================================================================

function injectStyles(): void {
  const styleId = 'quick-reactions-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ========================================
       QUICK REACTIONS PANEL
       Floating pill with glass effect
       ======================================== */

    .quick-reactions {
      position: fixed;
      bottom: calc(var(--safe-area-bottom, 0px) + 140px);
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      opacity: 0;
      pointer-events: none;
      z-index: var(--z-floating, 20);
      transition:
        opacity var(--duration-normal, 200ms) var(--ease-out-expo),
        transform var(--duration-normal, 200ms) var(--ease-out-expo);
    }

    .quick-reactions--visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
    }

    .quick-reactions__panel {
      display: flex;
      gap: var(--space-xs, 4px);
      padding: var(--space-xs, 4px);
      background: var(--glass-background, rgba(255, 255, 255, 0.1));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.12));
    }

    .quick-reactions__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      cursor: pointer;
      transition:
        background var(--duration-fast, 150ms) var(--ease-out-expo),
        color var(--duration-fast, 150ms) var(--ease-out-expo),
        transform var(--duration-fast, 150ms) var(--ease-spring);
    }

    .quick-reactions__btn:hover,
    .quick-reactions__btn:focus-visible {
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.15));
      color: var(--color-text-primary, #ffffff);
    }

    .quick-reactions__btn:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    .quick-reactions__btn:active {
      transform: scale(0.9);
    }

    /* Reaction sent feedback */
    .quick-reactions__btn--sent {
      animation: reaction-sent var(--duration-celebration, 800ms) var(--ease-spring);
    }

    @keyframes reaction-sent {
      0% { transform: scale(1); }
      20% { transform: scale(1.3); }
      40% { transform: scale(0.85); }
      60% { transform: scale(1.1); }
      80% { transform: scale(0.95); }
      100% { transform: scale(1); }
    }

    /* Floating reaction bubble (shows briefly when sent) */
    .quick-reactions__bubble {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      background: var(--persona-primary, var(--color-ferni));
      color: white;
      font-size: var(--font-size-sm, 0.875rem);
      border-radius: var(--radius-full, 9999px);
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      animation: bubble-rise 1.5s var(--ease-out-expo) forwards;
    }

    @keyframes bubble-rise {
      0% {
        opacity: 0;
        transform: translateX(-50%) translateY(0) scale(0.8);
      }
      15% {
        opacity: 1;
        transform: translateX(-50%) translateY(-10px) scale(1);
      }
      85% {
        opacity: 1;
        transform: translateX(-50%) translateY(-30px) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateX(-50%) translateY(-40px) scale(0.8);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .quick-reactions,
      .quick-reactions__btn {
        transition: opacity var(--duration-fast, 150ms);
      }

      .quick-reactions__btn--sent,
      .quick-reactions__bubble {
        animation: none;
      }

      .quick-reactions__btn--sent {
        background: var(--color-accent-primary, #4a6741);
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
  container.className = 'quick-reactions';
  container.setAttribute('role', 'toolbar');
  container.setAttribute('aria-label', 'Quick reactions');

  const panel = document.createElement('div');
  panel.className = 'quick-reactions__panel';

  REACTIONS.forEach((reaction) => {
    const btn = document.createElement('button');
    btn.className = 'quick-reactions__btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('title', reaction.label);
    btn.setAttribute('aria-label', reaction.label);
    btn.dataset.reactionId = reaction.id;
    // Safe: reaction.icon contains only our hardcoded SVG strings defined above
    btn.innerHTML = reaction.icon;

    btn.addEventListener('click', () => sendReaction(reaction));

    panel.appendChild(btn);
  });

  container.appendChild(panel);
  document.body.appendChild(container);
}

// ============================================================================
// STATE SUBSCRIPTIONS
// ============================================================================

function setupSubscriptions(): void {
  // Show/hide based on connection state
  appState.subscribe('connection', (state) => {
    if (state === 'connected') {
      show();
    } else {
      hide();
    }
  });
}

// ============================================================================
// VISIBILITY
// ============================================================================

export function show(): void {
  if (!container) return;
  container.classList.add('quick-reactions--visible');
}

export function hide(): void {
  if (!container) return;
  container.classList.remove('quick-reactions--visible');
}

// ============================================================================
// REACTION SENDING
// ============================================================================

function sendReaction(reaction: Reaction): void {
  const room = connectionService.getRoom();
  if (!room?.localParticipant) {
    log.warn('Cannot send reaction - not connected');
    return;
  }

  // Send via data channel
  const message = JSON.stringify({
    type: 'user_reaction',
    reactionId: reaction.id,
    label: reaction.label,
    timestamp: Date.now(),
  });

  void room.localParticipant.publishData(new TextEncoder().encode(message), {
    reliable: true,
  });

  log.info({ reactionId: reaction.id }, 'Reaction sent');

  // Visual feedback
  playReactionFeedback(reaction);
}

/**
 * Play visual feedback when reaction is sent
 */
function playReactionFeedback(reaction: Reaction): void {
  if (!container) return;

  // Find the button that was clicked
  const btn = container.querySelector(`[data-reaction-id="${reaction.id}"]`);
  if (btn) {
    btn.classList.add('quick-reactions__btn--sent');
    trackedTimeout(() => {
      btn.classList.remove('quick-reactions__btn--sent');
    }, DURATION.CELEBRATION);
  }

  // Show floating bubble with label
  if (!prefersReducedMotion()) {
    const bubble = document.createElement('div');
    bubble.className = 'quick-reactions__bubble';
    bubble.textContent = reaction.label;
    container.appendChild(bubble);

    trackedTimeout(() => {
      bubble.remove();
    }, 1500);
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  clearAllTimeouts();

  if (container) {
    container.remove();
    container = null;
  }

  isInitialized = false;
  log.info('Quick Reactions UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const quickReactionsUI = {
  init: initQuickReactionsUI,
  show,
  hide,
  dispose,
};
