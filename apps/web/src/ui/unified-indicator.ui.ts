/**
 * Unified Indicator UI
 *
 * A single smart badge that consolidates all avatar indicators into one.
 * Morphs based on priority - showing the most important state at any moment.
 *
 * PRIORITY ORDER (highest to lowest):
 * 1. CHECK_IN      - Ferni wants to talk (speech bubble)
 * 2. MILESTONE     - New milestone achieved (sparkle)
 * 3. VOICE_VERIFY  - Voice verification in progress (shield)
 * 4. CONNECTED     - Normal connected state (filled heart)
 * 5. DISCONNECTED  - Not connected (outline heart)
 *
 * DESIGN PRINCIPLES (Apple/Google style):
 * - One indicator, not many
 * - Progressive disclosure - tap to see details in Journey modal
 * - Priority-based - shows what matters most right now
 * - Subtle animations - alive but not distracting
 *
 * @module ui/unified-indicator
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { journeyUI } from './journey.ui.js';

const log = createLogger('UnifiedIndicator');

const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Priority states for the indicator, from highest to lowest priority.
 */
type IndicatorPriority = 'checkin' | 'milestone' | 'voice_verify' | 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * Internal state tracking for all conditions that affect the indicator.
 */
interface IndicatorState {
  hasCheckin: boolean;
  checkinMessage?: string;
  hasNewMilestone: boolean;
  isVoiceVerifying: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
}

// ============================================================================
// PRIORITY ORDER (highest first)
// ============================================================================

const PRIORITY_ORDER: IndicatorPriority[] = [
  'checkin',       // Highest - Ferni wants to talk
  'milestone',     // Celebration moment
  'voice_verify',  // Security verification
  'error',         // Connection error
  'connecting',    // Connecting state
  'connected',     // Normal connected state
  'disconnected',  // Baseline - not connected
];

// ============================================================================
// STATE
// ============================================================================

let indicator: HTMLElement | null = null;
let isInitialized = false;
let currentPriority: IndicatorPriority = 'disconnected';
let pulseAnimation: Animation | null = null;

// Track all conditions that affect priority
const indicatorState: IndicatorState = {
  hasCheckin: false,
  checkinMessage: undefined,
  hasNewMilestone: false,
  isVoiceVerifying: false,
  connectionState: 'disconnected',
};

// Auto-clear milestone after this duration
const MILESTONE_DISPLAY_DURATION = 8000;
let milestoneTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// ICONS (Lucide-style, 2px stroke)
// ============================================================================

// Speech bubble (check-in) - Ferni wants to talk
const ICON_CHECKIN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
</svg>`;

// Sparkle (milestone) - celebration
const ICON_MILESTONE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
</svg>`;

// Shield (voice verify) - security check
const ICON_VOICE_VERIFY = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
</svg>`;

// Filled heart (connected) - relationship alive
const ICON_CONNECTED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
</svg>`;

// Outline heart (connecting) - transitional
const ICON_CONNECTING = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
</svg>`;

// Broken heart (disconnected/error)
const ICON_DISCONNECTED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M19.5 12.572l-7.5 7.428l-7.5-7.428A5 5 0 1 1 12 5.006a5 5 0 1 1 7.5 7.566z"/>
  <path d="M12 5.006V12l-2 2l2 3"/>
</svg>`;

// Map priority to icon
const PRIORITY_ICONS: Record<IndicatorPriority, string> = {
  checkin: ICON_CHECKIN,
  milestone: ICON_MILESTONE,
  voice_verify: ICON_VOICE_VERIFY,
  connected: ICON_CONNECTED,
  connecting: ICON_CONNECTING,
  disconnected: ICON_DISCONNECTED,
  error: ICON_DISCONNECTED,
};

// ============================================================================
// PRIORITY COMPUTATION
// ============================================================================

/**
 * Compute the highest priority state based on current conditions.
 */
function getHighestPriority(): IndicatorPriority {
  if (indicatorState.hasCheckin) return 'checkin';
  if (indicatorState.hasNewMilestone) return 'milestone';
  if (indicatorState.isVoiceVerifying) return 'voice_verify';
  
  // Connection states
  if (indicatorState.connectionState === 'error') return 'error';
  if (indicatorState.connectionState === 'connecting') return 'connecting';
  if (indicatorState.connectionState === 'connected') return 'connected';
  
  return 'disconnected';
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initUnifiedIndicator(): void {
  if (isInitialized) return;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', create);
  } else {
    create();
  }

  // Subscribe to all relevant events
  subscribeToEvents();

  isInitialized = true;
  log.info('Unified indicator initialized');
}

function subscribeToEvents(): void {
  // Connection state changes
  window.addEventListener('ferni:connection-state', handleConnectionChange as EventListener);

  // Milestone celebrations
  window.addEventListener('ferni:milestone-celebrated', handleMilestoneCelebrated);

  // Check-in events (from checkin-badge data layer)
  window.addEventListener('ferni:checkin-available', handleCheckinAvailable as EventListener);
  window.addEventListener('ferni:checkin-acknowledged', handleCheckinAcknowledged);
  window.addEventListener('ferni:checkin-dismissed', handleCheckinDismissed);

  // Voice verification events
  window.addEventListener('ferni:voice-verify-start', handleVoiceVerifyStart);
  window.addEventListener('ferni:voice-verify-end', handleVoiceVerifyEnd);
  window.addEventListener('ferni:voice-enrolled', handleVoiceVerifyEnd);
  window.addEventListener('ferni:voice-unenrolled', handleVoiceVerifyEnd);
}

function create(): void {
  // Find the avatar container
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    log.warn('Avatar container not found, retrying...');
    trackedTimeout(create, 1000);
    return;
  }

  // Clean up any existing indicators
  document.querySelector('.unified-indicator')?.remove();
  document.querySelector('.connection-heart')?.remove();
  document.querySelector('.journey-indicator')?.remove();

  // Create the indicator element
  indicator = document.createElement('button');
  indicator.className = 'unified-indicator';
  indicator.setAttribute('aria-label', 'View your journey with Ferni');

  // Create icon container
  indicator.innerHTML = `
    <span class="unified-indicator__icon">${ICON_DISCONNECTED}</span>
    <span class="unified-indicator__glow"></span>
  `;

  // Position relative to avatar container
  avatarContainer.appendChild(indicator);

  // Add click handler
  indicator.addEventListener('click', handleClick);

  // Inject styles
  injectStyles();

  // Set initial state based on body classes
  if (document.body.classList.contains('connected')) {
    indicatorState.connectionState = 'connected';
  }
  
  // Render with current priority
  updateIndicator();

  log.info('Unified indicator created');
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Update the indicator based on current priority.
 */
function updateIndicator(): void {
  if (!indicator) return;

  const newPriority = getHighestPriority();
  
  // Skip if no change
  if (currentPriority === newPriority) return;
  
  const oldPriority = currentPriority;
  currentPriority = newPriority;

  // Update icon
  const iconEl = indicator.querySelector('.unified-indicator__icon');
  if (iconEl) {
    iconEl.innerHTML = PRIORITY_ICONS[newPriority];
  }

  // Update classes
  PRIORITY_ORDER.forEach(p => {
    indicator!.classList.remove(`unified-indicator--${p}`);
  });
  indicator.classList.add(`unified-indicator--${newPriority}`);

  // Update aria and title
  updateAriaLabels(newPriority);

  // Cancel any existing animation
  pulseAnimation?.cancel();

  // Start appropriate animation
  switch (newPriority) {
    case 'checkin':
      playCheckinPulse();
      break;
    case 'milestone':
      playCelebrationBurst();
      break;
    case 'voice_verify':
      playVerifyingPulse();
      break;
    case 'connected':
      if (oldPriority === 'connecting' || oldPriority === 'disconnected') {
        playConnectionAnimation();
      }
      startConnectedPulse();
      break;
    case 'connecting':
      playConnectingAnimation();
      break;
    case 'error':
      playErrorPulse();
      break;
    case 'disconnected':
      startDisconnectedPulse();
      break;
  }

  // Dispatch events for other components
  window.dispatchEvent(new CustomEvent('ferni:indicator-state', { detail: { priority: newPriority } }));
  
  // Backward compatibility: dispatch old connection-heart event
  // Map priority to connection state for journey.ui.ts
  const connectionStateMap: Record<IndicatorPriority, string> = {
    checkin: 'connected',
    milestone: 'connected',
    voice_verify: 'connected',
    connected: 'connected',
    connecting: 'connecting',
    disconnected: 'disconnected',
    error: 'error',
  };
  window.dispatchEvent(new CustomEvent('ferni:connection-heart-state', { 
    detail: { state: connectionStateMap[newPriority] } 
  }));

  log.info('Indicator updated:', { from: oldPriority, to: newPriority });
}

function updateAriaLabels(priority: IndicatorPriority): void {
  if (!indicator) return;

  const labels: Record<IndicatorPriority, { aria: string; title: string }> = {
    checkin: {
      aria: 'Ferni wants to check in with you',
      title: 'Ferni is thinking of you - tap to connect',
    },
    milestone: {
      aria: 'New milestone achieved!',
      title: 'You reached a milestone! Tap to celebrate',
    },
    voice_verify: {
      aria: 'Verifying your voice',
      title: 'Voice verification in progress',
    },
    connected: {
      aria: 'Connected with Ferni - tap to see your journey',
      title: 'Connected - tap to see your story',
    },
    connecting: {
      aria: 'Connecting to Ferni',
      title: 'Connecting...',
    },
    disconnected: {
      aria: 'Tap to connect with Ferni',
      title: 'Tap to see your journey',
    },
    error: {
      aria: 'Connection lost - tap to reconnect',
      title: 'Connection lost - tap to retry',
    },
  };

  const { aria, title } = labels[priority];
  indicator.setAttribute('aria-label', aria);
  indicator.setAttribute('title', title);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();

  // If there's a check-in, acknowledge it
  if (indicatorState.hasCheckin) {
    window.dispatchEvent(new CustomEvent('ferni:checkin-acknowledged', {
      detail: { message: indicatorState.checkinMessage },
    }));
    indicatorState.hasCheckin = false;
    indicatorState.checkinMessage = undefined;
  }

  // Clear milestone state on click
  if (indicatorState.hasNewMilestone) {
    indicatorState.hasNewMilestone = false;
    if (milestoneTimeout) {
      clearTimeout(milestoneTimeout);
      milestoneTimeout = null;
    }
  }

  // Update indicator immediately
  updateIndicator();

  // Open Journey modal
  journeyUI.open();
  log.info('Journey opened from unified indicator', { priority: currentPriority });
}

function handleConnectionChange(e: CustomEvent<{ state: string }>): void {
  const state = e.detail?.state;

  if (state === 'connected' || state === 'room_connected') {
    indicatorState.connectionState = 'connected';
  } else if (state === 'connecting') {
    indicatorState.connectionState = 'connecting';
  } else if (state === 'error') {
    indicatorState.connectionState = 'error';
  } else if (state === 'disconnected') {
    indicatorState.connectionState = 'disconnected';
  }

  updateIndicator();
}

function handleMilestoneCelebrated(): void {
  indicatorState.hasNewMilestone = true;
  updateIndicator();

  // Auto-clear after duration
  if (milestoneTimeout) clearTimeout(milestoneTimeout);
  milestoneTimeout = setTimeout(() => {
    indicatorState.hasNewMilestone = false;
    updateIndicator();
  }, MILESTONE_DISPLAY_DURATION);
}

function handleCheckinAvailable(e: CustomEvent<{ message?: string }>): void {
  indicatorState.hasCheckin = true;
  indicatorState.checkinMessage = e.detail?.message;
  updateIndicator();
}

function handleCheckinAcknowledged(): void {
  indicatorState.hasCheckin = false;
  indicatorState.checkinMessage = undefined;
  updateIndicator();
}

function handleCheckinDismissed(): void {
  indicatorState.hasCheckin = false;
  indicatorState.checkinMessage = undefined;
  updateIndicator();
}

function handleVoiceVerifyStart(): void {
  indicatorState.isVoiceVerifying = true;
  updateIndicator();
}

function handleVoiceVerifyEnd(): void {
  indicatorState.isVoiceVerifying = false;
  updateIndicator();
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function startDisconnectedPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Gentle heartbeat - waiting to connect
  pulseAnimation = indicator.animate(
    [
      { transform: 'scale(1)', opacity: 0.75 },
      { transform: 'scale(1.08)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.75 },
    ],
    {
      duration: 2000,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );
}

function startConnectedPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Subtle breathing - alive but calm
  pulseAnimation = indicator.animate(
    [
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: 'scale(1.05)', filter: 'brightness(1.05)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ],
    {
      duration: 3000,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );
}

function playConnectingAnimation(): void {
  if (!indicator) return;

  pulseAnimation = indicator.animate(
    [
      { transform: 'scale(1)', opacity: 0.7 },
      { transform: 'scale(1.1)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.7 },
    ],
    {
      duration: 800,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );
}

function playConnectionAnimation(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Celebratory bounce on connection
  indicator.animate(
    [
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: 'scale(1.3)', filter: 'brightness(1.2)' },
      { transform: 'scale(0.95)', filter: 'brightness(1.1)' },
      { transform: 'scale(1.1)', filter: 'brightness(1)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
    }
  );

  // Glow burst
  const glow = indicator.querySelector('.unified-indicator__glow');
  if (glow instanceof HTMLElement) {
    glow.animate(
      [
        { opacity: 0, transform: 'scale(0.5)' },
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

function playCheckinPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Gentle attention-getting pulse
  pulseAnimation = indicator.animate(
    [
      { transform: 'scale(1)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' },
      { transform: 'scale(1.1)', boxShadow: '0 4px 16px var(--persona-glow, rgba(74, 103, 65, 0.4))' },
      { transform: 'scale(1)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' },
    ],
    {
      duration: 2000,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );
}

function playCelebrationBurst(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Joyful celebration animation
  indicator.animate(
    [
      { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
      { transform: 'scale(1.3) rotate(10deg)', filter: 'brightness(1.3)' },
      { transform: 'scale(1.1) rotate(-5deg)', filter: 'brightness(1.2)' },
      { transform: 'scale(1.2) rotate(5deg)', filter: 'brightness(1.1)' },
      { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
    }
  );

  // Gold glow burst for milestone
  const glow = indicator.querySelector('.unified-indicator__glow');
  if (glow instanceof HTMLElement) {
    glow.animate(
      [
        { opacity: 0, transform: 'scale(0.5)', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.6) 0%, transparent 70%)' },
        { opacity: 1, transform: 'scale(1.8)', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, transparent 70%)' },
        { opacity: 0, transform: 'scale(2.5)', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, transparent 70%)' },
      ],
      {
        duration: DURATION.CELEBRATION * 1.5,
        easing: 'ease-out',
      }
    );
  }

  // Continue with gentle pulse after burst
  trackedTimeout(() => {
    if (currentPriority === 'milestone') {
      pulseAnimation = indicator?.animate(
        [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.08)', filter: 'brightness(1.1)' },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        {
          duration: 1500,
          easing: 'ease-in-out',
          iterations: Infinity,
        }
      ) ?? null;
    }
  }, DURATION.CELEBRATION);
}

function playVerifyingPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Security-focused subtle pulse
  pulseAnimation = indicator.animate(
    [
      { transform: 'scale(1)', opacity: 0.8 },
      { transform: 'scale(1.05)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.8 },
    ],
    {
      duration: 1500,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );
}

function playErrorPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  pulseAnimation = indicator.animate(
    [
      { transform: 'scale(1)', opacity: 0.8 },
      { transform: 'scale(1.05)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.8 },
    ],
    {
      duration: 2000,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('unified-indicator-styles')) return;

  const style = document.createElement('style');
  style.id = 'unified-indicator-styles';
  style.textContent = `
    .unified-indicator {
      position: absolute;
      bottom: -4px;
      right: -4px;
      z-index: var(--z-docked, 100);
      
      display: flex;
      align-items: center;
      justify-content: center;
      
      width: 36px;
      height: 36px;
      padding: 0;
      
      background: var(--color-background-elevated, #faf8f5);
      border: 2px solid var(--color-text-muted, #9a8a82);
      border-radius: 50%;
      
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .unified-indicator:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }
    
    .unified-indicator:active {
      transform: scale(0.95);
    }
    
    .unified-indicator:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }
    
    /* Icon container */
    .unified-indicator__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.SLOW}ms ${EASING.SPRING};
    }
    
    .unified-indicator__icon svg {
      width: 18px;
      height: 18px;
    }
    
    /* Glow effect */
    .unified-indicator__glow {
      position: absolute;
      inset: -12px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        var(--persona-glow, rgba(74, 103, 65, 0.4)) 0%,
        transparent 70%
      );
      pointer-events: none;
      opacity: 0;
    }
    
    /* ===== CHECK-IN STATE ===== */
    /* Green speech bubble - Ferni wants to talk */
    .unified-indicator--checkin {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-primary, #4a6741);
    }
    
    .unified-indicator--checkin .unified-indicator__icon {
      color: white;
    }
    
    .unified-indicator--checkin .unified-indicator__icon svg {
      stroke: white;
      fill: none;
    }
    
    /* ===== MILESTONE STATE ===== */
    /* Gold sparkle - celebration! */
    .unified-indicator--milestone {
      border-color: #f59e0b;
      background: linear-gradient(135deg, #f59e0b, #d97706);
    }
    
    .unified-indicator--milestone .unified-indicator__icon {
      color: white;
    }
    
    .unified-indicator--milestone .unified-indicator__icon svg {
      stroke: white;
      fill: none;
    }
    
    /* ===== VOICE VERIFY STATE ===== */
    /* Amber shield - security check */
    .unified-indicator--voice_verify {
      border-color: var(--color-warning, #d4a574);
      background: var(--color-warning, #d4a574);
    }
    
    .unified-indicator--voice_verify .unified-indicator__icon {
      color: white;
    }
    
    .unified-indicator--voice_verify .unified-indicator__icon svg {
      stroke: white;
      fill: none;
    }
    
    /* ===== CONNECTED STATE ===== */
    /* Green filled heart - relationship alive */
    .unified-indicator--connected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--color-background-elevated, #faf8f5);
    }
    
    .unified-indicator--connected .unified-indicator__icon {
      color: var(--persona-primary, #4a6741);
    }
    
    .unified-indicator--connected .unified-indicator__icon svg {
      fill: var(--persona-primary, #4a6741);
      stroke: var(--persona-primary, #4a6741);
    }
    
    /* ===== CONNECTING STATE ===== */
    /* Amber outline heart - transitional */
    .unified-indicator--connecting {
      border-color: var(--color-warning, #d4a574);
    }
    
    .unified-indicator--connecting .unified-indicator__icon {
      color: var(--color-warning, #d4a574);
    }
    
    .unified-indicator--connecting .unified-indicator__icon svg {
      stroke: var(--color-warning, #d4a574);
      fill: none;
    }
    
    /* ===== DISCONNECTED STATE ===== */
    /* Gray broken heart - waiting */
    .unified-indicator--disconnected {
      border-color: var(--color-text-muted, #9a8a82);
    }
    
    .unified-indicator--disconnected .unified-indicator__icon {
      color: var(--color-text-muted, #9a8a82);
    }
    
    .unified-indicator--disconnected .unified-indicator__icon svg {
      stroke: var(--color-text-muted, #9a8a82);
      fill: none;
    }
    
    /* ===== ERROR STATE ===== */
    /* Red broken heart - connection lost */
    .unified-indicator--error {
      border-color: var(--color-error, #c44b4b);
    }
    
    .unified-indicator--error .unified-indicator__icon {
      color: var(--color-error, #c44b4b);
    }
    
    .unified-indicator--error .unified-indicator__icon svg {
      stroke: var(--color-error, #c44b4b);
      fill: none;
    }
    
    /* ===== DARK THEME ===== */
    [data-theme="midnight"] .unified-indicator {
      background: var(--color-background-elevated, #1a1a1f);
    }
    
    [data-theme="midnight"] .unified-indicator--checkin {
      background: var(--persona-primary, #6b8f5e);
    }
    
    [data-theme="midnight"] .unified-indicator--milestone {
      background: linear-gradient(135deg, #f59e0b, #d97706);
    }
    
    [data-theme="midnight"] .unified-indicator--connected {
      border-color: var(--persona-primary, #6b8f5e);
    }
    
    [data-theme="midnight"] .unified-indicator--connected .unified-indicator__icon svg {
      fill: var(--persona-primary, #6b8f5e);
      stroke: var(--persona-primary, #6b8f5e);
    }
    
    /* ===== REDUCED MOTION ===== */
    @media (prefers-reduced-motion: reduce) {
      .unified-indicator,
      .unified-indicator__icon {
        animation: none !important;
        transition: opacity ${DURATION.FAST}ms ease;
      }
    }
    
    /* ===== MOBILE ===== */
    @media (max-width: 640px) {
      .unified-indicator {
        width: 40px;
        height: 40px;
        bottom: -6px;
        right: -6px;
      }
      
      .unified-indicator__icon svg {
        width: 20px;
        height: 20px;
      }
    }
    
    /* ===== CIRCADIAN AWARENESS ===== */
    [data-circadian="lateNight"] .unified-indicator--connected,
    [data-circadian="deepNight"] .unified-indicator--connected {
      box-shadow: 0 2px 12px var(--persona-glow, rgba(74, 103, 65, 0.25));
    }
    
    /* ===== RELATIONSHIP WARMTH ===== */
    [data-relationship-stage="established"] .unified-indicator--connected,
    [data-relationship-stage="deep-partnership"] .unified-indicator--connected {
      box-shadow: 0 3px 14px var(--persona-glow, rgba(74, 103, 65, 0.3));
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Manually trigger a check-in indicator (for testing or external triggers).
 */
export function showCheckin(message?: string): void {
  indicatorState.hasCheckin = true;
  indicatorState.checkinMessage = message;
  updateIndicator();
}

/**
 * Dismiss the current check-in.
 */
export function dismissCheckin(): void {
  indicatorState.hasCheckin = false;
  indicatorState.checkinMessage = undefined;
  updateIndicator();
}

/**
 * Get the current priority state.
 */
export function getCurrentPriority(): IndicatorPriority {
  return currentPriority;
}

/**
 * Get the current indicator state (for debugging/testing).
 */
export function getIndicatorState(): Readonly<IndicatorState> {
  return { ...indicatorState };
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeUnifiedIndicator(): void {
  // Remove event listeners
  window.removeEventListener('ferni:connection-state', handleConnectionChange as EventListener);
  window.removeEventListener('ferni:milestone-celebrated', handleMilestoneCelebrated);
  window.removeEventListener('ferni:checkin-available', handleCheckinAvailable as EventListener);
  window.removeEventListener('ferni:checkin-acknowledged', handleCheckinAcknowledged);
  window.removeEventListener('ferni:checkin-dismissed', handleCheckinDismissed);
  window.removeEventListener('ferni:voice-verify-start', handleVoiceVerifyStart);
  window.removeEventListener('ferni:voice-verify-end', handleVoiceVerifyEnd);
  window.removeEventListener('ferni:voice-enrolled', handleVoiceVerifyEnd);
  window.removeEventListener('ferni:voice-unenrolled', handleVoiceVerifyEnd);

  // Clean up animations and timeouts
  pulseAnimation?.cancel();
  if (milestoneTimeout) clearTimeout(milestoneTimeout);
  clearAllTimeouts();

  // Remove elements
  indicator?.remove();
  indicator = null;
  document.getElementById('unified-indicator-styles')?.remove();

  // Reset state
  isInitialized = false;
  currentPriority = 'disconnected';
  indicatorState.hasCheckin = false;
  indicatorState.checkinMessage = undefined;
  indicatorState.hasNewMilestone = false;
  indicatorState.isVoiceVerifying = false;
  indicatorState.connectionState = 'disconnected';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const unifiedIndicatorUI = {
  init: initUnifiedIndicator,
  dispose: disposeUnifiedIndicator,
  showCheckin,
  dismissCheckin,
  getCurrentPriority,
  getIndicatorState,
};

export default unifiedIndicatorUI;

// Backward compatibility alias
export const initConnectionHeart = initUnifiedIndicator;
export const disposeConnectionHeart = disposeUnifiedIndicator;
