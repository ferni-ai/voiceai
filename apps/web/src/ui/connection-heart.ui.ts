/**
 * Connection Heart UI
 *
 * A unified indicator that combines connection status with journey/relationship tracking.
 * The heart "comes alive" when connected - a beautiful metaphor for the relationship.
 *
 * STATES:
 * - Disconnected: Outline heart, subtle pulse, "Connect" on hover
 * - Connecting: Heart fills with animation
 * - Connected: Full heart, shows milestone count, opens Journey
 * - New milestone: Celebration pulse
 *
 * BETTER THAN HUMAN:
 * - The heart literally comes alive when you connect
 * - We track the relationship, not just the session
 * - Every connection strengthens the bond
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { relationshipStageService } from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { getCelebratedCount, getTotalMilestonesCount } from './ferni-milestones.ui.js';
import { journeyUI } from './journey.ui.js';

const log = createLogger('ConnectionHeart');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'error';
let indicator: HTMLElement | null = null;
let isInitialized = false;
// Initialize to null so first setState() call always applies the class
let currentState: ConnectionState | null = null;
let pulseAnimation: Animation | null = null;

// Track connection state for external queries
export function getConnectionState(): ConnectionState {
  return currentState ?? 'disconnected';
}

// ============================================================================
// ICONS (Lucide-style, 2px stroke)
// ============================================================================

// Broken/cracked heart (disconnected) - shows we're apart but can reconnect
const HEART_BROKEN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M19.5 12.572l-7.5 7.428l-7.5-7.428A5 5 0 1 1 12 5.006a5 5 0 1 1 7.5 7.566z"/>
  <path d="M12 5.006V12l-2 2l2 3"/>
</svg>`;

// Filled heart (connected) - full, alive, beating
const HEART_FILLED = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
</svg>`;

// Outline heart (connecting/healing) - transitional state
const HEART_HEALING = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
</svg>`;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initConnectionHeart(): void {
  if (isInitialized) return;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', create);
  } else {
    create();
  }

  // Listen for connection state changes
  window.addEventListener('ferni:connection-state', handleConnectionChange as EventListener);

  // Listen for new milestones
  window.addEventListener('ferni:milestone-celebrated', handleNewMilestone);

  isInitialized = true;
  log.info('Connection heart initialized');
}

function create(): void {
  // Find the avatar container
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    log.warn('Avatar container not found, retrying...');
    trackedTimeout(create, 1000);
    return;
  }

  // Clean up existing (both old journey indicator and this one)
  document.querySelector('.journey-indicator')?.remove();
  document.querySelector('.connection-heart')?.remove();

  // Create indicator with inline fallback styles for guaranteed visibility
  indicator = document.createElement('button');
  indicator.className = 'connection-heart';
  indicator.setAttribute('aria-label', 'Connect with Ferni');
  // Inline styles as fallback in case CSS injection fails
  indicator.style.cssText = `
    border: 2px solid #9a8a82;
    background: #faf8f5;
    border-radius: 50%;
    cursor: pointer;
  `;

  const celebrated = getCelebratedCount();
  const total = getTotalMilestonesCount();
  const metrics = relationshipStageService.getMetrics();
  const streak = metrics.currentStreak;

  // Icons - broken heart visible by default with inline fallback styles
  // Show streak count as primary indicator (replaces separate streak badge)
  indicator.innerHTML = `
    <span class="connection-heart__icon connection-heart__icon--broken" style="opacity: 1; transform: scale(1); color: #9a8a82;">${HEART_BROKEN}</span>
    <span class="connection-heart__icon connection-heart__icon--healing">${HEART_HEALING}</span>
    <span class="connection-heart__icon connection-heart__icon--filled">${HEART_FILLED}</span>
    <span class="connection-heart__streak" aria-label="${streak} day streak">${streak > 0 ? streak : ''}</span>
    <span class="connection-heart__count" aria-label="${celebrated} of ${total} milestones">${celebrated}</span>
    <span class="connection-heart__glow"></span>
  `;

  // Immediately apply disconnected state class for initial visibility
  indicator.classList.add('connection-heart--disconnected');

  // Position relative to avatar container
  avatarContainer.appendChild(indicator);

  // Add click handler
  indicator.addEventListener('click', handleClick);

  // Inject styles
  injectStyles();

  // Set initial state based on body classes
  if (document.body.classList.contains('connected')) {
    setState('connected');
  } else {
    setState('disconnected');
    startDisconnectedPulse();
  }
  
  // Show streak badge immediately if user has a streak
  updateStreakDisplay();

  log.info('Connection heart created');
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function setState(state: ConnectionState): void {
  if (!indicator) return;
  // Skip if already in this state (but allow first initialization when currentState is null)
  if (currentState === state) return;

  const oldState = currentState;
  currentState = state;

  // Update classes
  indicator.classList.remove(
    'connection-heart--disconnected',
    'connection-heart--connecting',
    'connection-heart--connected',
    'connection-heart--speaking',
    'connection-heart--error'
  );
  indicator.classList.add(`connection-heart--${state}`);

  // Update aria and title
  const countEl = indicator.querySelector('.connection-heart__count');

  // Get current stats for tooltip
  const metrics = relationshipStageService.getMetrics();
  const streak = metrics.currentStreak;
  const streakText = streak > 0 ? `🔥 ${streak} day streak\n` : '';

  switch (state) {
    case 'disconnected':
      indicator.setAttribute('aria-label', 'View your journey with Ferni');
      indicator.setAttribute('title', `${streakText}Tap to see your journey`);
      pulseAnimation?.cancel();
      startDisconnectedPulse();
      break;

    case 'connecting':
      indicator.setAttribute('aria-label', 'Connecting...');
      indicator.setAttribute('title', 'Connecting...');
      pulseAnimation?.cancel();
      playConnectingAnimation();
      break;

    case 'connected':
      indicator.setAttribute('aria-label', 'View your journey with Ferni');
      indicator.setAttribute('title', `${streakText}Tap to see our story`);
      pulseAnimation?.cancel();
      // Play heart fill animation if transitioning from disconnected/connecting
      if (oldState === 'connecting' || oldState === 'disconnected' || oldState === 'error') {
        playConnectionAnimation();
      }
      // Update counts
      if (countEl) countEl.textContent = String(getCelebratedCount());
      updateStreakDisplay();
      startConnectedPulse();
      break;

    case 'speaking':
      // Subtle during conversation
      indicator.setAttribute('aria-label', 'In conversation');
      pulseAnimation?.cancel();
      break;

    case 'error':
      indicator.setAttribute('aria-label', 'Connection lost - tap to reconnect');
      indicator.setAttribute('title', 'Connection lost');
      pulseAnimation?.cancel();
      playErrorPulse();
      break;
  }

  // Dispatch event so Journey modal can update if open
  window.dispatchEvent(new CustomEvent('ferni:connection-heart-state', { detail: { state } }));

  log.info('Connection heart state:', state);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();

  // Always open the Journey modal - it will show connection state and allow connecting
  indicator?.classList.remove('connection-heart--new');
  journeyUI.open();
  log.info('Journey opened from connection heart', { state: currentState });
}

function handleConnectionChange(e: CustomEvent<{ state: string }>): void {
  const state = e.detail?.state;

  if (state === 'connected' || state === 'room_connected') {
    setState('connected');
  } else if (state === 'connecting') {
    setState('connecting');
  } else if (state === 'error') {
    setState('error');
  } else if (state === 'disconnected') {
    setState('disconnected');
  }
}

function handleNewMilestone(): void {
  if (!indicator || currentState !== 'connected') return;

  indicator.classList.add('connection-heart--new');

  // Update count
  const countEl = indicator.querySelector('.connection-heart__count');
  if (countEl) {
    countEl.textContent = String(getCelebratedCount());
  }

  // Celebration pulse
  celebrationPulse();

  log.info('New milestone indicator triggered');
}

/**
 * Update the streak display badge
 */
function updateStreakDisplay(): void {
  if (!indicator) return;
  
  const streakEl = indicator.querySelector('.connection-heart__streak');
  if (!streakEl) return;
  
  const metrics = relationshipStageService.getMetrics();
  const streak = metrics.currentStreak;
  
  if (streak > 0) {
    streakEl.textContent = String(streak);
    streakEl.classList.add('connection-heart__streak--visible');
  } else {
    streakEl.textContent = '';
    streakEl.classList.remove('connection-heart__streak--visible');
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function startDisconnectedPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // "Heartbeat" pulse - more alive, like a real heart waiting to connect
  // Two-beat rhythm: lub-dub pattern
  pulseAnimation = indicator.animate(
    [
      // Rest
      { transform: 'scale(1)', opacity: 0.75 },
      // First beat (lub)
      { transform: 'scale(1.12)', opacity: 1 },
      // Quick settle
      { transform: 'scale(1.02)', opacity: 0.9 },
      // Second beat (dub)
      { transform: 'scale(1.08)', opacity: 1 },
      // Return to rest
      { transform: 'scale(1)', opacity: 0.75 },
    ],
    {
      duration: 1800,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );
}

function startConnectedPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Gentle but alive heartbeat when connected
  // Slightly more pronounced than disconnected - we're together now!
  pulseAnimation = indicator.animate(
    [
      // Rest
      { transform: 'scale(1)', filter: 'brightness(1)' },
      // First beat (lub) - stronger when connected
      { transform: 'scale(1.1)', filter: 'brightness(1.05)' },
      // Quick settle
      { transform: 'scale(1.02)', filter: 'brightness(1)' },
      // Second beat (dub)
      { transform: 'scale(1.06)', filter: 'brightness(1.03)' },
      // Return to rest
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ],
    {
      duration: 2200,
      easing: 'ease-in-out',
      iterations: Infinity,
    }
  );

  // Pause when page not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pulseAnimation?.pause();
    } else {
      pulseAnimation?.play();
    }
  });
}

function playConnectingAnimation(): void {
  if (!indicator) return;

  // Faster pulse during connection
  indicator.animate(
    [
      { transform: 'scale(1)', opacity: 0.8 },
      { transform: 'scale(1.1)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.8 },
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

  // Heart "comes alive" animation
  indicator.animate(
    [
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: 'scale(1.4)', filter: 'brightness(1.3)' },
      { transform: 'scale(0.9)', filter: 'brightness(1.1)' },
      { transform: 'scale(1.1)', filter: 'brightness(1)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
    }
  );

  // Glow burst
  const glow = indicator.querySelector('.connection-heart__glow');
  if (glow instanceof HTMLElement) {
    glow.animate(
      [
        { opacity: 0, transform: 'scale(0.5)' },
        { opacity: 0.8, transform: 'scale(1.8)' },
        { opacity: 0, transform: 'scale(2.5)' },
      ],
      {
        duration: DURATION.CELEBRATION * 1.5,
        easing: 'ease-out',
      }
    );
  }
}

function celebrationPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

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

  const glow = indicator.querySelector('.connection-heart__glow');
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

function playErrorPulse(): void {
  if (!indicator || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Subtle error indication - not alarming, just informative
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
  if (document.getElementById('connection-heart-styles')) return;

  const style = document.createElement('style');
  style.id = 'connection-heart-styles';
  style.textContent = `
    .connection-heart {
      position: absolute;
      bottom: -4px;
      right: -4px;
      z-index: var(--z-docked);
      
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
    
    .connection-heart:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }
    
    .connection-heart:active {
      transform: scale(0.95);
    }
    
    .connection-heart:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }
    
    /* Icons container - MUST have inset:0 to fill parent and center via flexbox */
    .connection-heart__icon {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.SLOW}ms ${EASING.SPRING};
    }
    
    .connection-heart__icon svg {
      width: 18px;
      height: 18px;
    }
    
    /* All icons hidden by default */
    .connection-heart__icon--broken,
    .connection-heart__icon--healing,
    .connection-heart__icon--filled {
      opacity: 0;
      transform: scale(0.8);
    }
    
    /* Streak badge (top-left, fire-style) */
    .connection-heart__streak {
      position: absolute;
      top: -8px;
      left: -8px;
      
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      
      font-size: 11px;
      font-weight: 700;
      line-height: 20px;
      text-align: center;
      
      color: white;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-radius: 10px;
      box-shadow: 0 2px 6px rgba(245, 158, 11, 0.4);
      
      opacity: 0;
      transform: scale(0.5);
      transition: all ${DURATION.FAST}ms ${EASING.SPRING};
      z-index: 2;
    }
    
    .connection-heart__streak:empty {
      display: none;
    }
    
    .connection-heart__streak--visible,
    .connection-heart:hover .connection-heart__streak:not(:empty) {
      opacity: 1;
      transform: scale(1);
    }
    
    /* Count badge (milestones, bottom-right) */
    .connection-heart__count {
      position: absolute;
      bottom: -6px;
      right: -6px;
      
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      
      font-size: 10px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
      
      color: white;
      background: var(--persona-primary, #4a6741);
      border-radius: 9px;
      
      opacity: 0;
      transform: scale(0.5);
      transition: all ${DURATION.FAST}ms ${EASING.SPRING};
    }
    
    /* Glow effect */
    .connection-heart__glow {
      position: absolute;
      inset: -12px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(74, 103, 65, 0.4) 0%,
        transparent 70%
      );
      pointer-events: none;
      opacity: 0;
    }
    
    /* ===== DISCONNECTED STATE ===== */
    /* Gray broken heart - clearly "not connected" */
    .connection-heart--disconnected {
      border-color: var(--color-text-muted, #9a8a82);
    }
    
    .connection-heart--disconnected .connection-heart__icon--broken {
      opacity: 1;
      transform: scale(1);
      color: var(--color-text-muted, #9a8a82);
    }
    
    /* Show streak badge even when disconnected (motivation to come back) */
    .connection-heart--disconnected .connection-heart__streak:not(:empty) {
      opacity: 0.85;
      transform: scale(1);
    }
    
    /* Show count on hover even when disconnected */
    .connection-heart--disconnected:hover .connection-heart__count {
      opacity: 0.6;
      transform: scale(1);
    }
    
    /* ===== CONNECTING STATE ===== */
    /* Amber/yellow healing heart - transitional */
    .connection-heart--connecting {
      border-color: var(--color-warning, #d4a574);
    }
    
    .connection-heart--connecting .connection-heart__icon--healing {
      opacity: 1;
      transform: scale(1);
      color: var(--color-warning, #d4a574);
      animation: heart-healing 800ms ease-in-out infinite;
    }
    
    @keyframes heart-healing {
      0%, 100% { 
        opacity: 0.6; 
        transform: scale(0.95);
      }
      50% { 
        opacity: 1; 
        transform: scale(1.05);
      }
    }
    
    /* ===== CONNECTED STATE ===== */
    /* Green filled heart - connected and alive */
    .connection-heart--connected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--color-background-elevated, #faf8f5);
    }
    
    .connection-heart--connected .connection-heart__icon--filled {
      opacity: 1;
      transform: scale(1);
      color: var(--persona-primary, #4a6741);
    }
    
    .connection-heart--connected .connection-heart__streak:not(:empty) {
      opacity: 1;
      transform: scale(1);
    }
    
    .connection-heart--connected:hover .connection-heart__count {
      opacity: 1;
      transform: scale(1);
    }
    
    /* New milestone state */
    .connection-heart--new .connection-heart__count {
      opacity: 1;
      transform: scale(1);
    }
    
    .connection-heart--new {
      animation: heart-new-pulse 2s ease-in-out infinite;
    }
    
    @keyframes heart-new-pulse {
      0%, 100% {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 0 rgba(74, 103, 65, 0.4);
      }
      50% {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 8px rgba(74, 103, 65, 0);
      }
    }
    
    /* ===== ERROR STATE ===== */
    /* Red broken heart - connection lost */
    .connection-heart--error {
      border-color: var(--color-error, #c44b4b);
    }
    
    .connection-heart--error .connection-heart__icon--broken {
      opacity: 1;
      transform: scale(1);
      color: var(--color-error, #c44b4b);
    }
    
    .connection-heart--error .connection-heart__glow {
      background: radial-gradient(
        circle,
        rgba(196, 75, 75, 0.3) 0%,
        transparent 70%
      );
    }
    
    /* ===== SPEAKING STATE ===== */
    .connection-heart--speaking {
      opacity: 0.4;
      pointer-events: none;
    }
    
    /* Hide during active speech to not distract */
    body.speaking .connection-heart--connected {
      opacity: 0.3;
    }
    
    /* ===== DARK THEME ===== */
    [data-theme="midnight"] .connection-heart {
      background: var(--color-background-elevated, #1a1a1f);
      border-color: var(--color-text-muted, #7a7a7a);
    }
    
    [data-theme="midnight"] .connection-heart--disconnected .connection-heart__icon--broken {
      color: var(--color-text-muted, #7a7a7a);
    }
    
    [data-theme="midnight"] .connection-heart--connecting .connection-heart__icon--healing {
      color: var(--color-warning, #e0b080);
    }
    
    [data-theme="midnight"] .connection-heart--connected {
      border-color: var(--persona-primary, #6b8f5e);
    }
    
    [data-theme="midnight"] .connection-heart--connected .connection-heart__icon--filled {
      color: var(--persona-primary, #6b8f5e);
    }
    
    [data-theme="midnight"] .connection-heart--error {
      border-color: var(--color-error, #e06060);
    }
    
    [data-theme="midnight"] .connection-heart--error .connection-heart__icon--broken {
      color: var(--color-error, #e06060);
    }
    
    [data-theme="midnight"] .connection-heart__count {
      background: var(--persona-primary, #6b8f5e);
    }
    
    [data-theme="midnight"] .connection-heart__streak {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
    }
    
    /* ===== REDUCED MOTION ===== */
    @media (prefers-reduced-motion: reduce) {
      .connection-heart,
      .connection-heart__icon,
      .connection-heart__count {
        animation: none !important;
        transition: opacity ${DURATION.FAST}ms ease;
      }
      
      .connection-heart--new {
        border-width: 3px;
      }
    }
    
    /* ===== MOBILE ===== */
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .connection-heart {
        width: 40px;
        height: 40px;
        bottom: -6px;
        right: -6px;
      }
      
      .connection-heart__icon svg {
        width: 20px;
        height: 20px;
      }
      
      .connection-heart__streak {
        top: -10px;
        left: -10px;
        min-width: 22px;
        height: 22px;
        line-height: 22px;
        font-size: 12px;
      }
      
      .connection-heart__count {
        min-width: 20px;
        height: 20px;
        line-height: 20px;
        font-size: 11px;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeConnectionHeart(): void {
  window.removeEventListener('ferni:connection-state', handleConnectionChange as EventListener);
  window.removeEventListener('ferni:milestone-celebrated', handleNewMilestone);
  pulseAnimation?.cancel();
  indicator?.remove();
  indicator = null;
  isInitialized = false;
  currentState = null;
  
  // Clean up injected styles
  document.getElementById('connection-heart-styles')?.remove();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const connectionHeartUI = {
  init: initConnectionHeart,
  dispose: disposeConnectionHeart,
  setState,
};

export default connectionHeartUI;
