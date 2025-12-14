/**
 * Journey Indicator UI
 *
 * A subtle, warm indicator near the avatar that:
 * - Pulses gently when new milestones are unlocked
 * - Shows milestone count on hover/tap
 * - Opens the Journey modal when clicked
 *
 * BETTER THAN HUMAN:
 * - We notice and celebrate your growth
 * - We remember every milestone, big and small
 * - We're genuinely happy about your progress
 *
 * DESIGN:
 * - Small heart icon, positioned subtly near avatar
 * - Warm glow animation when new milestone unlocked
 * - Gentle pulse rhythm like a heartbeat
 * - Never intrusive, always welcoming
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { getCelebratedCount, getTotalMilestonesCount } from './ferni-milestones.ui.js';
import { journeyUI } from './journey.ui.js';

const log = createLogger('JourneyIndicator');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

let indicator: HTMLElement | null = null;
let isInitialized = false;
let pulseAnimation: Animation | null = null;

// ============================================================================
// ICONS (Lucide-style, 2px stroke)
// ============================================================================

const HEART_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
</svg>`;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initJourneyIndicator(): void {
  if (isInitialized) return;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', create);
  } else {
    create();
  }

  // Listen for new milestones
  window.addEventListener('ferni:milestone-celebrated', handleNewMilestone);

  isInitialized = true;
  log.info('Journey indicator initialized');
}

function create(): void {
  // Find the avatar container
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    log.warn('Avatar container not found, retrying...');
    trackedTimeout(create, 1000);
    return;
  }

  // Clean up existing
  document.querySelector('.journey-indicator')?.remove();

  // Create indicator
  indicator = document.createElement('button');
  indicator.className = 'journey-indicator';
  indicator.setAttribute('aria-label', 'View your journey');
  indicator.setAttribute('title', 'Your journey with Ferni');

  const celebrated = getCelebratedCount();
  const total = getTotalMilestonesCount();

  indicator.innerHTML = `
    <span class="journey-indicator__icon">${HEART_ICON}</span>
    <span class="journey-indicator__count" aria-label="${celebrated} of ${total} milestones">${celebrated}</span>
    <span class="journey-indicator__glow"></span>
  `;

  // Position relative to avatar container
  avatarContainer.appendChild(indicator);

  // Add click handler
  indicator.addEventListener('click', handleClick);

  // Inject styles
  injectStyles();

  // Start subtle ambient pulse
  startAmbientPulse();

  log.info('Journey indicator created');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();

  // Clear new milestone visual state
  indicator?.classList.remove('journey-indicator--new');

  // Open journey modal
  journeyUI.open();

  log.info('Journey opened from indicator');
}

function handleNewMilestone(): void {
  if (!indicator) return;

  indicator.classList.add('journey-indicator--new');

  // Update count
  const countEl = indicator.querySelector('.journey-indicator__count');
  if (countEl) {
    countEl.textContent = String(getCelebratedCount());
  }

  // Celebration pulse
  celebrationPulse();

  log.info('New milestone indicator triggered');
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function startAmbientPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Gentle heartbeat-like pulse
  pulseAnimation = indicator.animate(
    [
      { transform: 'scale(1)', opacity: 0.8 },
      { transform: 'scale(1.05)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.8 },
    ],
    {
      duration: 3000,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );

  // Pause when not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pulseAnimation?.pause();
    } else {
      pulseAnimation?.play();
    }
  });
}

function celebrationPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // More dramatic celebration pulse
  indicator.animate(
    [
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: 'scale(1.3)', filter: 'brightness(1.3)' },
      { transform: 'scale(1.1)', filter: 'brightness(1.1)' },
      { transform: 'scale(1.2)', filter: 'brightness(1.2)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
    }
  );

  // Glow effect
  const glow = indicator.querySelector('.journey-indicator__glow');
  if (glow instanceof HTMLElement) {
    glow.animate(
      [
        { opacity: 0, transform: 'scale(0.8)' },
        { opacity: 0.6, transform: 'scale(1.5)' },
        { opacity: 0, transform: 'scale(2)' },
      ],
      {
        duration: DURATION.CELEBRATION * 1.5,
        easing: 'ease-out',
      }
    );
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('journey-indicator-styles')) return;

  const style = document.createElement('style');
  style.id = 'journey-indicator-styles';
  style.textContent = `
    .journey-indicator {
      position: absolute;
      bottom: -4px;
      right: -4px;
      z-index: 10;
      
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      
      width: 32px;
      height: 32px;
      padding: 0;
      
      background: var(--color-background-elevated, #faf8f5);
      border: 2px solid var(--persona-primary, #4a6741);
      border-radius: 50%;
      
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      
      /* Subtle shadow */
      box-shadow: 
        0 2px 8px rgba(0, 0, 0, 0.1),
        0 0 0 0 rgba(74, 103, 65, 0);
    }
    
    .journey-indicator:hover {
      transform: scale(1.1);
      box-shadow: 
        0 4px 12px rgba(0, 0, 0, 0.15),
        0 0 0 4px rgba(74, 103, 65, 0.1);
    }
    
    .journey-indicator:active {
      transform: scale(0.95);
    }
    
    .journey-indicator__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--persona-primary, #4a6741);
    }
    
    .journey-indicator__icon svg {
      width: 14px;
      height: 14px;
    }
    
    .journey-indicator__count {
      position: absolute;
      top: -6px;
      right: -6px;
      
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
      text-align: center;
      
      color: white;
      background: var(--persona-primary, #4a6741);
      border-radius: 8px;
      
      opacity: 0;
      transform: scale(0.8);
      transition: all ${DURATION.FAST}ms ${EASING.SPRING};
    }
    
    .journey-indicator:hover .journey-indicator__count,
    .journey-indicator--new .journey-indicator__count {
      opacity: 1;
      transform: scale(1);
    }
    
    .journey-indicator__glow {
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(74, 103, 65, 0.3) 0%,
        transparent 70%
      );
      pointer-events: none;
      opacity: 0;
    }
    
    /* New milestone state */
    .journey-indicator--new {
      animation: journey-new-pulse 2s ease-in-out infinite;
    }
    
    .journey-indicator--new .journey-indicator__icon svg {
      fill: var(--persona-primary, #4a6741);
    }
    
    @keyframes journey-new-pulse {
      0%, 100% {
        box-shadow: 
          0 2px 8px rgba(0, 0, 0, 0.1),
          0 0 0 0 rgba(74, 103, 65, 0.4);
      }
      50% {
        box-shadow: 
          0 2px 8px rgba(0, 0, 0, 0.1),
          0 0 0 8px rgba(74, 103, 65, 0);
      }
    }
    
    /* Dark theme */
    [data-theme="midnight"] .journey-indicator {
      background: var(--color-background-elevated, #1a1a1f);
      border-color: var(--persona-primary, #6b8f5e);
    }
    
    [data-theme="midnight"] .journey-indicator__icon {
      color: var(--persona-primary, #6b8f5e);
    }
    
    [data-theme="midnight"] .journey-indicator__count {
      background: var(--persona-primary, #6b8f5e);
    }
    
    /* Hide when connected and speaking - don't distract */
    body.connected.speaking .journey-indicator {
      opacity: 0.3;
      pointer-events: none;
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .journey-indicator {
        animation: none;
      }
      
      .journey-indicator--new {
        animation: none;
        border-width: 3px;
      }
    }
    
    /* Mobile - slightly larger touch target */
    @media (max-width: 640px) {
      .journey-indicator {
        width: 36px;
        height: 36px;
        bottom: -6px;
        right: -6px;
      }
      
      .journey-indicator__icon svg {
        width: 16px;
        height: 16px;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeJourneyIndicator(): void {
  window.removeEventListener('ferni:milestone-celebrated', handleNewMilestone);
  pulseAnimation?.cancel();
  indicator?.remove();
  indicator = null;
  isInitialized = false;
  
  // Clean up injected styles
  document.getElementById('journey-indicator-styles')?.remove();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const journeyIndicatorUI = {
  init: initJourneyIndicator,
  dispose: disposeJourneyIndicator,
};

export default journeyIndicatorUI;
