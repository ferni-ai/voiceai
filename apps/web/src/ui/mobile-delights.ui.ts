/**
 * Mobile Delights UI - Magical Mobile Interactions
 *
 * A collection of delightful mobile-specific features that make
 * Ferni feel alive, present, and magical on touch devices.
 *
 * FEATURES:
 * 1. Device Tilt Parallax - Avatar responds to phone orientation
 * 2. Tap-to-Look - Tap anywhere and Ferni looks at that spot
 * 3. Pull-to-Connect - Pull down on avatar to initiate connection
 * 4. Haptic Heartbeat - Subtle vibrations during speaking
 * 5. Immersive Full-Screen Mode - Double-tap for intimate mode
 * 6. Ambient Glow Breathing - Organic pulsing glow around avatar
 * 7. Swipe Between Personas - Already in gestures.ui.ts, enhanced here
 *
 * Brand Philosophy: Warm, Grounded, Present, Human
 * Every interaction should feel magical but not gimmicky.
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { avatarLookAt, pauseAvatarEyeTracking } from './eye-tracking.ui.js';

const log = createLogger('MobileDelights');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface MobileDelightsConfig {
  /** Enable device tilt parallax */
  enableTiltParallax?: boolean;
  /** Enable tap-to-look interaction */
  enableTapToLook?: boolean;
  /** Enable pull-to-connect gesture */
  enablePullToConnect?: boolean;
  /** Enable haptic feedback */
  enableHaptics?: boolean;
  /** Enable double-tap immersive mode */
  enableImmersiveMode?: boolean;
  /** Enable ambient glow breathing */
  enableAmbientGlow?: boolean;
  /** Callback when connection is requested (from pull gesture) */
  onConnectRequest?: () => void;
  /** Callback when persona change is requested */
  onPersonaSwipe?: (direction: 'left' | 'right') => void;
}

interface TiltState {
  enabled: boolean;
  hasPermission: boolean;
  beta: number; // Front-to-back tilt (-180 to 180)
  gamma: number; // Left-to-right tilt (-90 to 90)
  smoothBeta: number;
  smoothGamma: number;
}

interface PullState {
  isTracking: boolean;
  startY: number;
  currentY: number;
  progress: number;
  isActivated: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let config: Required<MobileDelightsConfig>;
let styleElement: HTMLStyleElement | null = null;

// Tilt parallax state
const tiltState: TiltState = {
  enabled: false,
  hasPermission: false,
  beta: 0,
  gamma: 0,
  smoothBeta: 0,
  smoothGamma: 0,
};
let tiltFrame: number | null = null;

// Pull-to-connect state
const pullState: PullState = {
  isTracking: false,
  startY: 0,
  currentY: 0,
  progress: 0,
  isActivated: false,
};

// Haptic heartbeat state
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let isSpeaking = false;

// Immersive mode state
let isImmersive = false;
let lastTapTime = 0;
let immersiveOverlay: HTMLElement | null = null;

// Ambient glow state
let glowFrame: number | null = null;
let glowPhase = 0;

// Touch tracking for tap-to-look (exported for testing/debugging)
export let lastTouchPosition = { x: 0, y: 0 };

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize all mobile delights
 */
export function initMobileDelights(options: MobileDelightsConfig = {}): void {
  if (isInitialized) {
    log.debug('Mobile delights already initialized');
    return;
  }

  // Skip most features if reduced motion is preferred
  const reducedMotion = prefersReducedMotion();

  config = {
    enableTiltParallax: options.enableTiltParallax ?? !reducedMotion,
    enableTapToLook: options.enableTapToLook ?? true,
    enablePullToConnect: options.enablePullToConnect ?? true,
    enableHaptics: options.enableHaptics ?? true,
    enableImmersiveMode: options.enableImmersiveMode ?? true,
    enableAmbientGlow: options.enableAmbientGlow ?? !reducedMotion,
    onConnectRequest: options.onConnectRequest ?? (() => {}),
    onPersonaSwipe: options.onPersonaSwipe ?? (() => {}),
  };

  // Inject styles
  injectStyles();

  // Initialize features
  if (config.enableTiltParallax) {
    initTiltParallax();
  }

  if (config.enableTapToLook) {
    initTapToLook();
  }

  if (config.enablePullToConnect) {
    initPullToConnect();
  }

  if (config.enableImmersiveMode) {
    initImmersiveMode();
  }

  if (config.enableAmbientGlow) {
    initAmbientGlow();
  }

  // Listen for speaking state changes
  if (config.enableHaptics) {
    initHapticFeedback();
  }

  isInitialized = true;
  log.info('Mobile delights initialized', {
    tilt: config.enableTiltParallax,
    tap: config.enableTapToLook,
    pull: config.enablePullToConnect,
    haptics: config.enableHaptics,
    immersive: config.enableImmersiveMode,
    glow: config.enableAmbientGlow,
  });
}

/**
 * Dispose of all mobile delights
 */
export function disposeMobileDelights(): void {
  // Stop tilt tracking
  if (tiltFrame) {
    cancelAnimationFrame(tiltFrame);
    tiltFrame = null;
  }
  window.removeEventListener('deviceorientation', handleDeviceOrientation);

  // Stop haptic heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Stop glow animation
  if (glowFrame) {
    cancelAnimationFrame(glowFrame);
    glowFrame = null;
  }

  // Remove event listeners
  document.removeEventListener('touchstart', handleTapToLook);
  document.removeEventListener('touchstart', handlePullStart);
  document.removeEventListener('touchmove', handlePullMove);
  document.removeEventListener('touchend', handlePullEnd);

  // Remove immersive overlay
  if (immersiveOverlay) {
    immersiveOverlay.remove();
    immersiveOverlay = null;
  }

  // Remove styles
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  isInitialized = false;
  log.debug('Mobile delights disposed');
}

// ============================================================================
// 1. DEVICE TILT PARALLAX
// ============================================================================

async function initTiltParallax(): Promise<void> {
  // Check if DeviceOrientationEvent is available
  if (!('DeviceOrientationEvent' in window)) {
    log.info('Device orientation not supported');
    return;
  }

  // iOS 13+ requires permission
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof DOE.requestPermission === 'function') {
    try {
      const permission = await DOE.requestPermission();
      if (permission === 'granted') {
        tiltState.hasPermission = true;
      } else {
        log.info('Device orientation permission denied');
        return;
      }
    } catch (error) {
      log.warn('Device orientation permission error:', error);
      return;
    }
  } else {
    // Non-iOS or older iOS
    tiltState.hasPermission = true;
  }

  // Start listening
  window.addEventListener('deviceorientation', handleDeviceOrientation);
  tiltState.enabled = true;
  tiltFrame = requestAnimationFrame(updateTiltParallax);

  // Add tilt-enabled class to avatar container
  const avatarContainer = document.querySelector('.avatar-container');
  if (avatarContainer) {
    avatarContainer.classList.add('tilt-enabled');
  }

  log.info('Tilt parallax enabled');
}

function handleDeviceOrientation(event: DeviceOrientationEvent): void {
  if (!tiltState.enabled) return;

  // beta: front-to-back tilt (-180 to 180)
  // gamma: left-to-right tilt (-90 to 90)
  tiltState.beta = event.beta ?? 0;
  tiltState.gamma = event.gamma ?? 0;
}

function updateTiltParallax(): void {
  if (!tiltState.enabled) {
    tiltFrame = requestAnimationFrame(updateTiltParallax);
    return;
  }

  // Smooth interpolation for organic feel
  const smoothing = 0.1;
  tiltState.smoothBeta += (tiltState.beta - tiltState.smoothBeta) * smoothing;
  tiltState.smoothGamma += (tiltState.gamma - tiltState.smoothGamma) * smoothing;

  // Convert tilt to avatar offset (subtle movement)
  // Gamma (left-right): -90 to 90 -> -8px to 8px
  // Beta (front-back): typically 0-90 when held upright -> -4px to 4px
  const maxOffset = 8;
  const xOffset = (tiltState.smoothGamma / 45) * maxOffset;
  const yOffset = ((tiltState.smoothBeta - 45) / 45) * (maxOffset / 2);

  // Apply to avatar elements
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  const avatarRing = document.querySelector('#avatarRing') as HTMLElement;

  if (avatar) {
    avatar.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
  }

  // Ring moves slightly less for depth effect
  if (avatarRing) {
    avatarRing.style.transform = `translate(${xOffset * 0.5}px, ${yOffset * 0.5}px)`;
  }

  tiltFrame = requestAnimationFrame(updateTiltParallax);
}

/**
 * Request tilt permission (for iOS - must be called from user gesture)
 */
export async function requestTiltPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof DOE.requestPermission !== 'function') {
    return true; // Permission not required
  }

  try {
    const permission = await DOE.requestPermission();
    if (permission === 'granted') {
      tiltState.hasPermission = true;
      if (!tiltState.enabled) {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
        tiltState.enabled = true;
        tiltFrame = requestAnimationFrame(updateTiltParallax);
      }
      return true;
    }
  } catch (error) {
    log.warn('Tilt permission request failed:', error);
  }
  return false;
}

// ============================================================================
// 2. TAP-TO-LOOK
// ============================================================================

function initTapToLook(): void {
  document.addEventListener('touchstart', handleTapToLook, { passive: true });
  log.debug('Tap-to-look initialized');
}

function handleTapToLook(e: TouchEvent): void {
  // Only respond to single touches
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];
  if (!touch) return;

  // Don't respond if touching interactive elements
  const target = e.target as HTMLElement;
  if (target.closest('button, a, input, .team-member, .settings-menu, .ferni-menu')) {
    return;
  }

  // Store position for potential use
  lastTouchPosition = { x: touch.clientX, y: touch.clientY };

  // Make avatar look at tap position
  avatarLookAt(touch.clientX, touch.clientY, 800);

  // Add a subtle "noticed" animation
  const avatar = document.querySelector('#coachAvatar');
  if (avatar) {
    avatar.classList.add('tap-noticed');
    trackedTimeout(() => avatar.classList.remove('tap-noticed'), 300);
  }

  // Subtle haptic
  if (config.enableHaptics) {
    vibrate(10);
  }
}

// ============================================================================
// 3. PULL-TO-CONNECT
// ============================================================================

function initPullToConnect(): void {
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    log.warn('Avatar container not found for pull-to-connect');
    return;
  }

  avatarContainer.addEventListener('touchstart', handlePullStart as EventListener, {
    passive: true,
  });
  document.addEventListener('touchmove', handlePullMove, { passive: false });
  document.addEventListener('touchend', handlePullEnd, { passive: true });

  // Create pull indicator
  createPullIndicator();

  log.debug('Pull-to-connect initialized');
}

function handlePullStart(e: TouchEvent): void {
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];
  if (!touch) return;

  // Only start tracking if on avatar
  const target = e.target as HTMLElement;
  if (!target.closest('.avatar-container, #coachAvatar')) {
    return;
  }

  pullState.isTracking = true;
  pullState.startY = touch.clientY;
  pullState.currentY = touch.clientY;
  pullState.progress = 0;
  pullState.isActivated = false;

  // Pause eye tracking during pull
  pauseAvatarEyeTracking(2000);
}

function handlePullMove(e: TouchEvent): void {
  if (!pullState.isTracking || e.touches.length !== 1) return;

  const touch = e.touches[0];
  if (!touch) return;

  pullState.currentY = touch.clientY;
  const delta = pullState.currentY - pullState.startY;

  // Only track downward pulls
  if (delta < 0) {
    pullState.progress = 0;
    return;
  }

  e.preventDefault(); // Prevent scroll during pull

  // Calculate progress (0 to 1)
  const threshold = 120;
  pullState.progress = Math.min(1, delta / threshold);

  // Update visual feedback
  updatePullFeedback(pullState.progress, delta);

  // Activate at threshold
  if (pullState.progress >= 1 && !pullState.isActivated) {
    pullState.isActivated = true;
    vibrate([30, 20, 50]); // Success pattern
  }
}

function handlePullEnd(): void {
  if (!pullState.isTracking) return;

  if (pullState.isActivated) {
    // Trigger connection
    config.onConnectRequest();

    // Celebration feedback
    const avatar = document.querySelector('#coachAvatar');
    if (avatar) {
      avatar.classList.add('pull-activated');
      trackedTimeout(() => avatar.classList.remove('pull-activated'), 500);
    }
  }

  // Reset
  resetPullFeedback();
  pullState.isTracking = false;
  pullState.progress = 0;
  pullState.isActivated = false;
}

function createPullIndicator(): void {
  const indicator = document.createElement('div');
  indicator.className = 'pull-indicator';
  indicator.innerHTML = `
    <div class="pull-indicator__ring"></div>
    <div class="pull-indicator__text">${t('mobile.pullToConnect')}</div>
  `;

  const avatarContainer = document.querySelector('.avatar-container');
  if (avatarContainer) {
    avatarContainer.appendChild(indicator);
  }
}

function updatePullFeedback(progress: number, delta: number): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  const avatarRing = document.querySelector('#avatarRing') as HTMLElement;
  const indicator = document.querySelector('.pull-indicator') as HTMLElement;

  if (avatar) {
    // Scale up slightly and move down
    const scale = 1 + progress * 0.08;
    const translateY = Math.min(delta * 0.3, 30);
    avatar.style.transform = `scale(${scale}) translateY(${translateY}px)`;
  }

  if (avatarRing) {
    // Ring expands
    const ringScale = 1 + progress * 0.15;
    avatarRing.style.transform = `scale(${ringScale})`;
    avatarRing.style.opacity = String(0.5 + progress * 0.5);
  }

  if (indicator) {
    indicator.style.opacity = String(progress);
    indicator.style.transform = `translateY(${progress * 20}px) scale(${0.8 + progress * 0.2})`;

    if (progress >= 1) {
      indicator.classList.add('ready');
      indicator.querySelector('.pull-indicator__text')!.textContent = t('mobile.releaseToConnect');
    } else {
      indicator.classList.remove('ready');
      indicator.querySelector('.pull-indicator__text')!.textContent = t('mobile.pullToConnect');
    }
  }
}

function resetPullFeedback(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  const avatarRing = document.querySelector('#avatarRing') as HTMLElement;
  const indicator = document.querySelector('.pull-indicator') as HTMLElement;

  if (avatar) {
    avatar.style.transition = `transform ${DURATION.MODERATE}ms ${EASING.SPRING}`;
    avatar.style.transform = '';
    trackedTimeout(() => {
      avatar.style.transition = '';
    }, DURATION.MODERATE);
  }

  if (avatarRing) {
    avatarRing.style.transition = `transform ${DURATION.MODERATE}ms ${EASING.SPRING}, opacity ${DURATION.MODERATE}ms ease`;
    avatarRing.style.transform = '';
    avatarRing.style.opacity = '';
    trackedTimeout(() => {
      avatarRing.style.transition = '';
    }, DURATION.MODERATE);
  }

  if (indicator) {
    indicator.style.opacity = '0';
    indicator.style.transform = '';
    indicator.classList.remove('ready');
  }
}

// ============================================================================
// 4. HAPTIC HEARTBEAT
// ============================================================================

function initHapticFeedback(): void {
  // Listen for speaking state
  window.addEventListener('ferni:avatar-speaking', ((e: CustomEvent) => {
    if (e.detail.speaking) {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  }) as EventListener);

  // Also listen for general speaking events
  window.addEventListener('ferni:speaking-start', () => startHeartbeat());
  window.addEventListener('ferni:speaking-end', () => stopHeartbeat());

  log.debug('Haptic feedback initialized');
}

function startHeartbeat(): void {
  if (isSpeaking || !config.enableHaptics) return;

  isSpeaking = true;

  // Heartbeat pattern: thump-thump... thump-thump...
  // Subtle and rhythmic, like a calm heartbeat
  let beatCount = 0;

  heartbeatInterval = setInterval(() => {
    beatCount++;

    // Double-beat pattern (like a real heartbeat)
    if (beatCount % 4 === 1) {
      vibrate(15); // First beat (stronger)
    } else if (beatCount % 4 === 2) {
      trackedTimeout(() => vibrate(8), 150); // Second beat (softer, quick follow)
    }
    // Beats 3 and 4 are rest
  }, 500); // ~60 BPM resting heart rate
}

function stopHeartbeat(): void {
  isSpeaking = false;

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ============================================================================
// 5. IMMERSIVE FULL-SCREEN MODE
// ============================================================================

function initImmersiveMode(): void {
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) return;

  avatarContainer.addEventListener('touchend', handleDoubleTap as EventListener);
  createImmersiveOverlay();

  log.debug('Immersive mode initialized');
}

function handleDoubleTap(e: TouchEvent): void {
  const now = Date.now();
  const timeSinceLastTap = now - lastTapTime;

  // Double tap detection (300ms window)
  if (timeSinceLastTap < 300 && timeSinceLastTap > 50) {
    e.preventDefault();
    toggleImmersiveMode();
  }

  lastTapTime = now;
}

function createImmersiveOverlay(): void {
  immersiveOverlay = document.createElement('div');
  immersiveOverlay.className = 'immersive-overlay';
  immersiveOverlay.innerHTML = `
    <div class="immersive-backdrop"></div>
    <div class="immersive-close-hint">Tap anywhere to exit</div>
  `;

  immersiveOverlay.addEventListener('click', () => {
    if (isImmersive) {
      toggleImmersiveMode();
    }
  });

  document.body.appendChild(immersiveOverlay);
}

function toggleImmersiveMode(): void {
  isImmersive = !isImmersive;

  const app = document.getElementById('app');
  const avatarContainer = document.querySelector('.avatar-container');

  if (isImmersive) {
    // Enter immersive mode
    document.body.classList.add('immersive-mode');
    app?.classList.add('immersive-active');
    avatarContainer?.classList.add('immersive-avatar');
    immersiveOverlay?.classList.add('active');

    // Hide non-essential elements
    document
      .querySelectorAll('.header h1, .header p, #teamRoster, .main, .controls-row')
      .forEach((el) => {
        (el as HTMLElement).style.opacity = '0';
        (el as HTMLElement).style.pointerEvents = 'none';
      });

    vibrate(30);
    log.info('Entered immersive mode');
  } else {
    // Exit immersive mode
    document.body.classList.remove('immersive-mode');
    app?.classList.remove('immersive-active');
    avatarContainer?.classList.remove('immersive-avatar');
    immersiveOverlay?.classList.remove('active');

    // Show elements again
    document
      .querySelectorAll('.header h1, .header p, #teamRoster, .main, .controls-row')
      .forEach((el) => {
        (el as HTMLElement).style.opacity = '';
        (el as HTMLElement).style.pointerEvents = '';
      });

    vibrate(20);
    log.info('Exited immersive mode');
  }
}

/**
 * Programmatically enter/exit immersive mode
 */
export function setImmersiveMode(enabled: boolean): void {
  if (enabled !== isImmersive) {
    toggleImmersiveMode();
  }
}

// ============================================================================
// 6. AMBIENT GLOW BREATHING
// ============================================================================

function initAmbientGlow(): void {
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) return;

  // Add glow element
  const glowElement = document.createElement('div');
  glowElement.className = 'ambient-glow';
  avatarContainer.appendChild(glowElement);

  // Start breathing animation
  glowFrame = requestAnimationFrame(updateAmbientGlow);

  log.debug('Ambient glow initialized');
}

function updateAmbientGlow(): void {
  glowPhase += 0.015; // Slow, meditative breathing (~4 second cycle)

  // Organic breathing curve (not a simple sine wave)
  const breathIn = Math.sin(glowPhase);
  const breathOut = Math.sin(glowPhase + 0.5);
  const breath = (breathIn + breathOut * 0.3) / 1.3;

  // Map to opacity and scale
  const baseOpacity = 0.3;
  const opacityRange = 0.25;
  const opacity = baseOpacity + breath * opacityRange;

  const baseScale = 1;
  const scaleRange = 0.08;
  const scale = baseScale + Math.abs(breath) * scaleRange;

  const glowElement = document.querySelector('.ambient-glow') as HTMLElement;
  if (glowElement) {
    glowElement.style.opacity = String(opacity);
    glowElement.style.transform = `scale(${scale})`;
  }

  glowFrame = requestAnimationFrame(updateAmbientGlow);
}

// ============================================================================
// HAPTIC HELPERS
// ============================================================================

/**
 * Trigger haptic feedback
 * @param pattern - Duration in ms, or array of [vibrate, pause, vibrate, ...]
 */
export function vibrate(pattern: number | number[]): boolean {
  if (!config?.enableHaptics) return false;

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(pattern);
    }
  } catch {
    // Vibration not supported (iOS, or blocked)
  }
  return false;
}

/**
 * Trigger a success haptic pattern
 */
export function hapticSuccess(): void {
  vibrate([20, 50, 30]);
}

/**
 * Trigger an error haptic pattern
 */
export function hapticError(): void {
  vibrate([50, 30, 50, 30, 50]);
}

/**
 * Trigger a gentle notification haptic
 */
export function hapticNotify(): void {
  vibrate(15);
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'mobile-delights-styles';
  styleElement.textContent = `
    /* ========================================================================
       MOBILE DELIGHTS - Magical Interactions
       ======================================================================== */

    /* Tilt parallax enabled state */
    .avatar-container.tilt-enabled {
      /* Smooth transitions for tilt-based movement */
    }

    .avatar-container.tilt-enabled #coachAvatar,
    .avatar-container.tilt-enabled #avatarRing {
      transition: none; /* JS handles movement */
    }

    /* Tap noticed animation */
    #coachAvatar.tap-noticed {
      animation: tapNoticed ${DURATION.FAST}ms ${EASING.SPRING};
    }

    @keyframes tapNoticed {
      0% { transform: scale(1); }
      50% { transform: scale(1.03); }
      100% { transform: scale(1); }
    }

    /* Pull-to-connect indicator */
    .pull-indicator {
      position: absolute;
      bottom: -60px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.FAST}ms ease, transform ${DURATION.FAST}ms ease;
      z-index: var(--z-docked);
    }

    .pull-indicator__ring {
      width: 40px;
      height: 40px;
      border: 2px solid var(--persona-primary, #4a6741);
      border-radius: 50%;
      opacity: 0.5;
      transition: all ${DURATION.FAST}ms ease;
    }

    .pull-indicator.ready .pull-indicator__ring {
      border-color: var(--color-success, #10b981);
      box-shadow: 0 0 20px var(--color-success, #10b981);
      opacity: 1;
    }

    .pull-indicator__text {
      font-size: 12px;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }

    .pull-indicator.ready .pull-indicator__text {
      color: var(--color-success, #10b981);
    }

    /* Pull activated celebration */
    #coachAvatar.pull-activated {
      animation: pullActivated ${DURATION.MODERATE}ms ${EASING.SPRING};
    }

    @keyframes pullActivated {
      0% { transform: scale(1.08); filter: brightness(1); }
      50% { transform: scale(1.12); filter: brightness(1.2); }
      100% { transform: scale(1); filter: brightness(1); }
    }

    /* Ambient glow breathing */
    .ambient-glow {
      position: absolute;
      inset: -30px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        var(--persona-glow, rgba(74, 103, 65, 0.3)) 0%,
        transparent 70%
      );
      pointer-events: none;
      z-index: -1;
      opacity: 0.3;
      transform: scale(1);
    }

    /* Dark theme glow adjustment */
    [data-theme='dark'] .ambient-glow {
      background: radial-gradient(
        circle,
        var(--persona-glow, rgba(74, 103, 65, 0.4)) 0%,
        transparent 70%
      );
    }

    /* Immersive mode overlay */
    .immersive-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-tooltip);
      pointer-events: none;
      opacity: 0;
      transition: opacity ${DURATION.SLOW}ms ease;
    }

    .immersive-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .immersive-backdrop {
      position: absolute;
      inset: 0;
      background: var(--color-background-primary, #1a1612);
      opacity: 0.95;
    }

    .immersive-close-hint {
      position: absolute;
      bottom: max(40px, env(safe-area-inset-bottom, 40px));
      left: 50%;
      transform: translateX(-50%);
      font-size: 14px;
      color: var(--color-text-muted);
      opacity: 0;
      animation: fadeInHint 0.5s ease 1s forwards;
    }

    @keyframes fadeInHint {
      to { opacity: 0.6; }
    }

    /* Immersive mode - avatar becomes hero */
    .immersive-avatar {
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      z-index: var(--z-tooltip) !important;
      width: min(240px, 100%) !important;
      height: 240px !important;
      transition: all ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
    }

    .immersive-avatar #coachAvatar {
      width: 100% !important;
      height: 100% !important;
    }

    .immersive-avatar #avatarText {
      font-size: 4rem !important;
    }

    .immersive-avatar #avatarRing {
      inset: -20px !important;
      border-width: 3px !important;
    }

    .immersive-avatar .ambient-glow {
      inset: -80px;
      opacity: 0.5 !important;
    }

    /* Immersive mode body styles */
    body.immersive-mode {
      overflow: hidden;
    }

    /* Mobile-specific refinements */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .pull-indicator {
        bottom: -50px;
      }

      .pull-indicator__ring {
        width: 32px;
        height: 32px;
      }

      .pull-indicator__text {
        font-size: 11px;
      }

      .immersive-avatar {
        width: min(200px, 100%) !important;
        height: 200px !important;
      }

      .immersive-avatar #avatarText {
        font-size: 3.5rem !important;
      }
    }

    /* Large mobile (390-430px) - bigger immersive avatar */
    @media (min-width: min(390px, 100%)) and (max-width: clamp(336px, 90vw, 480px)) {
      .immersive-avatar {
        width: min(260px, 100%) !important;
        height: 260px !important;
      }

      .immersive-avatar #avatarText {
        font-size: 4.5rem !important;
      }
    }

    /* Reduced motion - disable animations */
    @media (prefers-reduced-motion: reduce) {
      .ambient-glow {
        animation: none;
        opacity: 0.3 !important;
        transform: none !important;
      }

      #coachAvatar.tap-noticed,
      #coachAvatar.pull-activated {
        animation: none;
      }

      .immersive-avatar {
        transition: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const mobileDelights = {
  init: initMobileDelights,
  dispose: disposeMobileDelights,
  requestTiltPermission,
  setImmersiveMode,
  vibrate,
  hapticSuccess,
  hapticError,
  hapticNotify,
};

export default mobileDelights;
