/**
 * Gestures UI - Touch gesture support
 * 
 * Features:
 * - Swipe left/right between personas
 * - Pull down to refresh
 * - Long press for options
 * - Swipe to close menus/panels
 * - Edge swipe navigation
 */

import type { PersonaId } from '../types/persona.js';

// ============================================================================
// TYPES
// ============================================================================

interface GestureCallbacks {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onPullDown?: () => void;
  onLongPress?: (element: HTMLElement) => void;
  onMenuClose?: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  isTracking: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let callbacks: GestureCallbacks | null = null;
let touchState: TouchState = {
  startX: 0,
  startY: 0,
  startTime: 0,
  currentX: 0,
  currentY: 0,
  isTracking: false,
};

// Configuration
const SWIPE_THRESHOLD = 80;     // Minimum distance for swipe
const SWIPE_VELOCITY = 0.3;     // Minimum velocity (px/ms)
const LONG_PRESS_TIME = 500;    // Long press duration (ms)
const PULL_DOWN_THRESHOLD = 100;
const EDGE_SWIPE_ZONE = 30;     // Pixels from edge for swipe-to-close
const MENU_DISMISS_THRESHOLD = 100; // Distance to dismiss menu

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let swipeIndicator: HTMLElement | null = null;
let edgeSwipeFeedback: HTMLElement | null = null;
let isEdgeSwipe = false;
let activeMenu: HTMLElement | null = null;

// Persona order for navigation
const PERSONA_ORDER: PersonaId[] = [
  'ferni',
  'nayan-patel',
  'peter-john',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
];

let currentPersonaIndex = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initGesturesUI(cbs: GestureCallbacks): void {
  callbacks = cbs;
  
  // Create swipe indicator
  createSwipeIndicator();
  
  // Add touch listeners
  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
  document.addEventListener('touchcancel', handleTouchCancel, { passive: true });
  
}

// ============================================================================
// TOUCH HANDLERS
// ============================================================================

function handleTouchStart(e: TouchEvent): void {
  if (e.touches.length !== 1) return;
  
  const touch = e.touches[0];
  if (!touch) return;
  
  touchState = {
    startX: touch.clientX,
    startY: touch.clientY,
    startTime: Date.now(),
    currentX: touch.clientX,
    currentY: touch.clientY,
    isTracking: true,
  };
  
  // Check if touch started in edge zone (for swipe-to-close)
  const screenWidth = window.innerWidth;
  isEdgeSwipe = touch.clientX >= screenWidth - EDGE_SWIPE_ZONE;
  
  // Check if a menu/panel is currently open
  activeMenu = document.querySelector('.settings-menu--visible .settings-menu__card') as HTMLElement
    || document.querySelector('.ferni-menu--visible .ferni-menu__panel') as HTMLElement;
  
  // Show edge swipe feedback if in edge zone and menu is open
  if (isEdgeSwipe && activeMenu) {
    showEdgeSwipeFeedback('right');
  }
  
  // Start long press timer
  const target = e.target as HTMLElement;
  if (target.closest('.team-member, .btn, #coachAvatar')) {
    longPressTimer = setTimeout(() => {
      if (callbacks?.onLongPress) {
        callbacks.onLongPress(target);
        vibrate(50);
      }
    }, LONG_PRESS_TIME);
  }
}

function handleTouchMove(e: TouchEvent): void {
  if (!touchState.isTracking || e.touches.length !== 1) return;
  
  const touch = e.touches[0];
  if (!touch) return;
  
  touchState.currentX = touch.clientX;
  touchState.currentY = touch.clientY;
  
  // Cancel long press on movement
  if (longPressTimer) {
    const dx = Math.abs(touchState.currentX - touchState.startX);
    const dy = Math.abs(touchState.currentY - touchState.startY);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
  
  // Calculate swipe progress
  const deltaX = touchState.currentX - touchState.startX;
  const deltaY = touchState.currentY - touchState.startY;
  
  // Edge swipe for menu dismiss (swipe right from right edge)
  if (isEdgeSwipe && activeMenu && deltaX > 0) {
    e.preventDefault();
    updateEdgeSwipeFeedback(deltaX);
    
    // Move menu with swipe (interactive dismiss)
    const progress = Math.min(1, deltaX / MENU_DISMISS_THRESHOLD);
    activeMenu.style.transform = `translateX(${deltaX * 0.5}px)`;
    activeMenu.style.opacity = String(1 - progress * 0.3);
    return;
  }
  
  // Horizontal swipe detection
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20) {
    // Prevent scroll during horizontal swipe
    e.preventDefault();
    
    // Show swipe indicator
    updateSwipeIndicator(deltaX);
  }
  
  // Pull down detection
  if (deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX)) {
    updatePullIndicator(deltaY);
  }
}

function handleTouchEnd(_e: TouchEvent): void {
  if (!touchState.isTracking) return;
  
  // Cancel long press
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  
  const deltaX = touchState.currentX - touchState.startX;
  const deltaY = touchState.currentY - touchState.startY;
  const deltaTime = Date.now() - touchState.startTime;
  const velocityX = Math.abs(deltaX) / deltaTime;
  
  // Check for menu swipe-to-close (swipe right from right edge)
  if (isEdgeSwipe && activeMenu) {
    if (deltaX > MENU_DISMISS_THRESHOLD) {
      // Swipe right to close menu
      callbacks?.onMenuClose?.();
      vibrate(30);
    } else {
      // Didn't reach threshold - reset menu position with animation
      activeMenu.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
      activeMenu.style.transform = '';
      activeMenu.style.opacity = '';
      // Remove transition after animation
      setTimeout(() => {
        if (activeMenu) {
          activeMenu.style.transition = '';
        }
      }, 200);
    }
    hideEdgeSwipeFeedback();
    isEdgeSwipe = false;
    activeMenu = null;
    touchState.isTracking = false;
    hideSwipeIndicator();
    return;
  }
  
  // Check for swipe
  if (Math.abs(deltaX) > SWIPE_THRESHOLD && velocityX > SWIPE_VELOCITY) {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        // Swipe left - next persona
        callbacks?.onSwipeLeft();
        vibrate(30);
      } else {
        // Swipe right - previous persona
        callbacks?.onSwipeRight();
        vibrate(30);
      }
    }
  }
  
  // Check for pull down refresh
  if (deltaY > PULL_DOWN_THRESHOLD && callbacks?.onPullDown) {
    callbacks.onPullDown();
    vibrate(50);
  }
  
  // Reset
  hideSwipeIndicator();
  hideEdgeSwipeFeedback();
  isEdgeSwipe = false;
  activeMenu = null;
  touchState.isTracking = false;
}

function handleTouchCancel(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  
  // Reset menu position if edge swipe was cancelled
  if (activeMenu) {
    activeMenu.style.transform = '';
    activeMenu.style.opacity = '';
  }
  
  hideSwipeIndicator();
  hideEdgeSwipeFeedback();
  isEdgeSwipe = false;
  activeMenu = null;
  touchState.isTracking = false;
}

// ============================================================================
// SWIPE INDICATOR
// ============================================================================

function createSwipeIndicator(): void {
  swipeIndicator = document.createElement('div');
  swipeIndicator.className = 'swipe-indicator';
  swipeIndicator.innerHTML = `
    <div class="swipe-arrow swipe-arrow-left">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </div>
    <div class="swipe-arrow swipe-arrow-right">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </div>
  `;
  
  document.body.appendChild(swipeIndicator);
}

function updateSwipeIndicator(deltaX: number): void {
  if (!swipeIndicator) return;
  
  const progress = Math.min(1, Math.abs(deltaX) / SWIPE_THRESHOLD);
  const direction = deltaX < 0 ? 'left' : 'right';
  
  swipeIndicator.classList.add('visible');
  swipeIndicator.style.setProperty('--swipe-progress', String(progress));
  swipeIndicator.setAttribute('data-direction', direction);
}

function hideSwipeIndicator(): void {
  if (!swipeIndicator) return;
  swipeIndicator.classList.remove('visible');
}

function updatePullIndicator(deltaY: number): void {
  // Could show a pull-to-refresh indicator
  const progress = Math.min(1, deltaY / PULL_DOWN_THRESHOLD);
  document.body.style.setProperty('--pull-progress', String(progress));
}

// ============================================================================
// EDGE SWIPE FEEDBACK (for menu dismiss)
// ============================================================================

function showEdgeSwipeFeedback(side: 'left' | 'right'): void {
  if (!edgeSwipeFeedback) {
    edgeSwipeFeedback = document.createElement('div');
    edgeSwipeFeedback.className = 'edge-swipe-feedback';
    document.body.appendChild(edgeSwipeFeedback);
  }
  
  edgeSwipeFeedback.classList.remove('left', 'right');
  edgeSwipeFeedback.classList.add(side, 'active');
}

function hideEdgeSwipeFeedback(): void {
  if (edgeSwipeFeedback) {
    edgeSwipeFeedback.classList.remove('active');
  }
}

function updateEdgeSwipeFeedback(deltaX: number): void {
  if (!edgeSwipeFeedback || !isEdgeSwipe) return;
  
  const progress = Math.min(1, deltaX / MENU_DISMISS_THRESHOLD);
  edgeSwipeFeedback.style.setProperty('--swipe-progress', String(progress));
  edgeSwipeFeedback.style.opacity = String(Math.min(1, progress * 2));
}

// ============================================================================
// HAPTIC FEEDBACK
// ============================================================================

/**
 * Safe vibration that handles iOS (no vibration API).
 * Returns true if vibration was triggered.
 */
function vibrate(duration: number): boolean {
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(duration);
    }
  } catch {
    // Vibration not supported (iOS, or blocked)
  }
  return false;
}

// ============================================================================
// PERSONA NAVIGATION
// ============================================================================

export function setCurrentPersona(personaId: PersonaId): void {
  currentPersonaIndex = PERSONA_ORDER.indexOf(personaId);
  if (currentPersonaIndex === -1) currentPersonaIndex = 0;
}

export function getNextPersona(): PersonaId {
  const nextIndex = (currentPersonaIndex + 1) % PERSONA_ORDER.length;
  return PERSONA_ORDER[nextIndex] ?? PERSONA_ORDER[0] ?? 'ferni';
}

export function getPreviousPersona(): PersonaId {
  const prevIndex = (currentPersonaIndex - 1 + PERSONA_ORDER.length) % PERSONA_ORDER.length;
  return PERSONA_ORDER[prevIndex] ?? PERSONA_ORDER[0] ?? 'ferni';
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  document.removeEventListener('touchstart', handleTouchStart);
  document.removeEventListener('touchmove', handleTouchMove);
  document.removeEventListener('touchend', handleTouchEnd);
  document.removeEventListener('touchcancel', handleTouchCancel);
  
  if (longPressTimer) {
    clearTimeout(longPressTimer);
  }
  
  if (swipeIndicator) {
    swipeIndicator.remove();
    swipeIndicator = null;
  }
  
  if (edgeSwipeFeedback) {
    edgeSwipeFeedback.remove();
    edgeSwipeFeedback = null;
  }
  
  isEdgeSwipe = false;
  activeMenu = null;
  callbacks = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const gesturesUI = {
  init: initGesturesUI,
  setCurrentPersona,
  getNextPersona,
  getPreviousPersona,
  dispose,
};

